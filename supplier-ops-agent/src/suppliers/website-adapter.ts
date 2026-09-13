import { normalizeSupplierRecord } from "./normalization.ts";
import { launchSupplierBrowser } from "./browser-launcher.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export type WebsiteAdapterConfig = {
  loginUrl?: string;
  productsUrl?: string;
  username?: string;
  password?: string;
  /**
   * Cookie header captured after one normal, human-completed supplier sign-in.
   * Cookies are scoped to allowedHosts before the catalog page is opened.
   */
  sessionCookieHeader?: string;
  /** Exact supplier-owned hosts that may receive the captured session. */
  allowedHosts?: string[];
  /** A positive, account-only marker used to prove the session is authenticated. */
  authenticatedSelector?: string;
  selectors?: {
    username: string;
    password: string;
    submit: string;
    productRows?: string;
  };
};

export type WebsiteAdapterDependencies = {
  launchBrowser?: typeof launchSupplierBrowser;
};

type LoginCheckPhase =
  | "browser_start"
  | "login_page"
  | "username_field"
  | "password_field"
  | "submit"
  | "response_check";

export type LoginOutcome = "connected" | "verification_required" | "two_factor_required" | "login_failed" | "pending";

export function classifyLoginOutcome(pageText: string, passwordFieldCount: number): LoginOutcome {
  const normalizedText = pageText.toLowerCase();
  if (/two-factor|\b2fa\b|verification code|one-time code|security code/.test(normalizedText)) {
    return "two_factor_required";
  }
  if (/complete (the )?captcha|captcha (challenge|required)|verify (that )?you are human|i'm not a robot|unusual traffic/.test(normalizedText)) {
    return "verification_required";
  }
  if (/invalid (email|username|password|credentials)|incorrect (email|password)|sign in failed|login failed/.test(normalizedText)) {
    return "login_failed";
  }
  return passwordFieldCount === 0 ? "connected" : "pending";
}

type LoginStateReader = () => Promise<{ pageText: string; passwordFieldCount: number }>;

export async function waitForLoginOutcome(
  readState: LoginStateReader,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<Exclude<LoginOutcome, "pending"> | "timed_out"> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;

  while (true) {
    const state = await readState();
    const outcome = classifyLoginOutcome(state.pageText, state.passwordFieldCount);
    if (outcome !== "pending") return outcome;

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return /captcha|recaptcha/.test(state.pageText.toLowerCase()) ? "verification_required" : "timed_out";
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

export function loginCheckFailureMessage(supplierName: string, phase: LoginCheckPhase) {
  const phaseLabel: Record<LoginCheckPhase, string> = {
    browser_start: "starting its secure browser",
    login_page: "opening the sign-in page",
    username_field: "locating the email field",
    password_field: "locating the password field",
    submit: "submitting the sign-in form",
    response_check: "checking the sign-in response",
  };
  return `${supplierName} could not complete the sign-in check while ${phaseLabel[phase]}.`;
}

export class WebsiteSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #config: WebsiteAdapterConfig;
  readonly #launchBrowser: typeof launchSupplierBrowser;
  #sessionCookieHeader?: string;

  constructor(
    supplier: SupplierConfig,
    config: WebsiteAdapterConfig = {},
    dependencies: WebsiteAdapterDependencies = {},
  ) {
    this.supplier = supplier;
    this.#config = config;
    this.#launchBrowser = dependencies.launchBrowser ?? launchSupplierBrowser;
    this.#sessionCookieHeader = cleanSessionValue(config.sessionCookieHeader);
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    if (
      !this.#config.productsUrl ||
      !this.#config.selectors?.productRows ||
      (!this.#sessionCookieHeader && !this.#config.loginUrl)
    ) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs portal URL and selectors before website automation can run`,
      );
    }

    if (!this.#sessionCookieHeader && (!this.#config.username || !this.#config.password)) {
      throw new SupplierAdapterError(this.supplier.id, "login_failed", `${this.supplier.name} credentials are missing`);
    }

    const browser = await this.#launchBrowser();
    try {
      const browserContext = await browser.newContext();
      const page = await browserContext.newPage();
      await this.#openAuthenticatedProducts(browserContext, page);
      const records = await page.$$eval(this.#config.selectors.productRows, (rows) =>
        rows.map((row) => {
          const element = row as HTMLElement;
          return {
            title: element.dataset.title ?? element.querySelector("[data-title]")?.textContent ?? "",
            sku: element.dataset.sku ?? element.querySelector("[data-sku]")?.textContent ?? "",
            upc: element.dataset.upc ?? element.querySelector("[data-upc]")?.textContent ?? "",
            brand: element.dataset.brand ?? element.querySelector("[data-brand]")?.textContent ?? "",
            available: element.dataset.available ?? element.querySelector("[data-available]")?.textContent ?? "",
            quantity: element.dataset.quantity ?? element.querySelector("[data-quantity]")?.textContent ?? "",
            cost: element.dataset.cost ?? element.querySelector("[data-cost]")?.textContent ?? "",
            msrp: element.dataset.msrp ?? element.querySelector("[data-msrp]")?.textContent ?? "",
            sale_price: element.dataset.salePrice ?? element.querySelector("[data-sale-price]")?.textContent ?? "",
            url: element.dataset.url ?? "",
            image: element.dataset.image ?? "",
          };
        }),
      );

      const capturedAt = (context.now ?? new Date()).toISOString();
      return records.map((record) =>
        normalizeSupplierRecord({
          supplierId: this.supplier.id,
          supplierName: this.supplier.name,
          record,
          capturedAt,
        }),
      );
    } finally {
      await browser.close();
    }
  }

  async verifyLogin() {
    const config = this.#config;
    if (this.#sessionCookieHeader || (config.username && config.password)) {
      if (!config.productsUrl || !config.authenticatedSelector || (!this.#sessionCookieHeader && !config.loginUrl)) {
        return this.#check(
          "not_configured",
          `${this.supplier.name} needs a catalog URL and authenticated account marker before session reuse can run.`,
        );
      }

      try {
        const browser = await this.#launchBrowser();
        try {
          const browserContext = await browser.newContext();
          const page = await browserContext.newPage();
          await this.#openAuthenticatedProducts(browserContext, page);
          return this.#check(
            "connected",
            `${this.supplier.name} reusable session is connected for read-only catalog access.`,
          );
        } finally {
          await browser.close();
        }
      } catch (error) {
        if (error instanceof SupplierAdapterError) {
          if (error.kind === "verification_required") {
            return this.#check("verification_required", error.message);
          }
          if (error.kind === "two_factor_required") {
            return this.#check("two_factor_required", error.message);
          }
          if (error.kind === "not_configured") {
            return this.#check("not_configured", error.message);
          }
        }
        return this.#check("login_failed", `${this.supplier.name} session check could not read the catalog.`);
      }
    }

    if (!config.loginUrl || !config.selectors) {
      return this.#check("not_configured", `${this.supplier.name} needs a portal URL and sign-in selectors.`);
    }
    if (!config.username || !config.password) {
      return this.#check("not_configured", `${this.supplier.name} has no saved account.`);
    }

    let phase: LoginCheckPhase = "browser_start";
    try {
      const browser = await this.#launchBrowser();
      try {
        const page = await browser.newPage();
        phase = "login_page";
        await page.goto(this.#safeUrl(config.loginUrl, "sign-in"), { waitUntil: "domcontentloaded" });
        assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "sign-in response");
        phase = "username_field";
        await page.fill(config.selectors.username, config.username);
        phase = "password_field";
        await page.fill(config.selectors.password, config.password);
        phase = "submit";
        await page.click(config.selectors.submit);

        phase = "response_check";
        const outcome = await waitForLoginOutcome(async () => ({
          pageText: await page.locator("body").innerText().catch(() => ""),
          passwordFieldCount: await page.locator(config.selectors!.password).count(),
        }));
        if (outcome === "two_factor_required") {
          return this.#check("two_factor_required", `${this.supplier.name} requires a verification step.`);
        }
        if (outcome === "verification_required") {
          return this.#check(
            "verification_required",
            `${this.supplier.name} requires a browser verification step before automated sign-in can continue.`,
          );
        }
        if (outcome === "login_failed") {
          return this.#check("login_failed", `${this.supplier.name} rejected the saved account.`);
        }
        if (outcome === "timed_out") {
          return this.#check("login_failed", `${this.supplier.name} stayed on the sign-in page.`);
        }
        return this.#check("connected", `${this.supplier.name} accepted the saved account.`);
      } finally {
        await browser.close();
      }
    } catch (error) {
      if (error instanceof SupplierAdapterError) throw error;
      console.warn(`[supplier-connection-check] supplier=${this.supplier.id} phase=${phase} result=failed`);
      return this.#check("login_failed", loginCheckFailureMessage(this.supplier.name, phase));
    }
  }

  async lookupProduct(supplierSku: string, context: SupplierAdapterContext = {}) {
    const wanted = cleanString(supplierSku).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._:/+ -]{0,119}$/.test(wanted)) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", `${this.supplier.name} supplier SKU is invalid`);
    }

    if (!["desbio", "research-nutritionals", "physicians-standard"].includes(this.supplier.id)) {
      const products = await this.fetchProducts(context);
      return products.find((product) => cleanString(product.sku).toUpperCase() === wanted) ?? null;
    }

    const browser = await this.#launchBrowser();
    try {
      const browserContext = await browser.newContext();
      const page = await browserContext.newPage();
      await this.#openAuthenticatedProducts(browserContext, page);
      const record = this.supplier.id === "physicians-standard"
        ? await this.#lookupProtectedShopifyProduct(browserContext, page, wanted)
        : await this.#lookupWordPressProduct(page, wanted);
      if (!record) return null;
      return normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt: (context.now ?? new Date()).toISOString(),
      });
    } finally {
      await browser.close();
    }
  }

  #check(
    status: "connected" | "verification_required" | "two_factor_required" | "login_failed" | "not_configured",
    message: string,
  ) {
    return { supplierId: this.supplier.id, supplierName: this.supplier.name, status, message } as const;
  }

  async #signInWithCredentials(page: import("playwright").Page) {
    const config = this.#config;
    await page.goto(this.#safeUrl(config.loginUrl, "sign-in"), { waitUntil: "networkidle" });
    assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "sign-in response");
    await page.fill(config.selectors!.username, config.username!);
    await page.fill(config.selectors!.password, config.password!);
    await page.click(config.selectors!.submit);

    const outcome = await waitForLoginOutcome(async () => ({
      pageText: await page.locator("body").innerText().catch(() => ""),
      passwordFieldCount: await visibleLocatorCount(page, config.selectors!.password),
    }));
    if (outcome === "two_factor_required") {
      throw new SupplierAdapterError(this.supplier.id, "two_factor_required", `${this.supplier.name} requires 2FA`);
    }
    if (outcome === "verification_required") {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} requires one browser verification before automated reads can continue`,
      );
    }
    if (outcome !== "connected") {
      throw new SupplierAdapterError(this.supplier.id, "login_failed", `${this.supplier.name} rejected the saved account`);
    }
  }

  async #openAuthenticatedProducts(
    browserContext: import("playwright").BrowserContext,
    page: import("playwright").Page,
  ) {
    const config = this.#config;
    if (!config.productsUrl || !config.authenticatedSelector) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} reusable session settings are incomplete`,
      );
    }

    if (this.#sessionCookieHeader) {
      try {
        await this.#openWithReusableSession(browserContext, page);
        return;
      } catch (error) {
        if (!(error instanceof SupplierAdapterError) || error.kind !== "verification_required") throw error;
        if (!config.loginUrl || !config.username || !config.password) throw error;
      }
    }

    if (!config.loginUrl || !config.username || !config.password) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} session expired and needs one browser reconnection`,
      );
    }

    await this.#signInWithCredentials(page);
    await page.goto(this.#safeUrl(config.productsUrl, "catalog"), { waitUntil: "networkidle" });
    assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "catalog response");
    const accountMarkerVisible = await page.locator(config.authenticatedSelector).isVisible().catch(() => false);
    if (!accountMarkerVisible) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} requires one browser verification before automated reads can continue`,
      );
    }
    await this.#rememberSession(browserContext);
  }

  async #openWithReusableSession(
    browserContext: import("playwright").BrowserContext,
    page: import("playwright").Page,
  ) {
    const config = this.#config;
    if (!config.productsUrl || !config.authenticatedSelector || !this.#sessionCookieHeader) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} reusable session settings are incomplete`,
      );
    }

    const catalogUrl = this.#safeUrl(config.productsUrl, "catalog");
    const allowedHosts = this.#allowedHosts();
    const cookies = sessionCookiesForHosts(this.#sessionCookieHeader, allowedHosts);
    if (cookies.length === 0) {
      throw new SupplierAdapterError(this.supplier.id, "not_configured", `${this.supplier.name} session is empty`);
    }
    await browserContext.addCookies(cookies);
    await page.goto(catalogUrl, { waitUntil: "networkidle" });
    assertSafeSupplierUrl(page.url(), allowedHosts, this.supplier.id, "catalog response");

    const accountMarkerVisible = await page.locator(config.authenticatedSelector).isVisible().catch(() => false);
    if (accountMarkerVisible) return;

    const pageText = await page.locator("body").innerText().catch(() => "");
    const passwordVisible = config.selectors?.password
      ? (await visibleLocatorCount(page, config.selectors.password)) > 0
      : false;
    const outcome = classifyLoginOutcome(pageText, passwordVisible ? 1 : 0);
    if (outcome === "two_factor_required") {
      throw new SupplierAdapterError(
        this.supplier.id,
        "two_factor_required",
        `${this.supplier.name} session requires a verification code`,
      );
    }
    throw new SupplierAdapterError(
      this.supplier.id,
      "verification_required",
      `${this.supplier.name} session expired and needs one browser reconnection`,
    );
  }

  async #rememberSession(browserContext: import("playwright").BrowserContext) {
    const allowedHosts = this.#allowedHosts();
    const cookies = await browserContext.cookies(allowedHosts.map((host) => `https://${host}/`));
    const cookieHeader = cookies
      .filter((cookie) => isCookieDomainAllowed(cookie.domain, allowedHosts))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (cookieHeader) this.#sessionCookieHeader = cookieHeader;
  }

  async #lookupWordPressProduct(page: import("playwright").Page, wanted: string) {
    const productsUrl = this.#safeUrl(this.#config.productsUrl, "catalog");
    const searchUrl = new URL("/", productsUrl);
    searchUrl.searchParams.set("s", wanted);
    searchUrl.searchParams.set("post_type", "product");
    await page.goto(this.#safeUrl(searchUrl.toString(), "catalog search"), { waitUntil: "domcontentloaded" });
    assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "catalog search response");

    const direct = await readWooCommerceProductPage(page, wanted);
    if (direct) return direct;

    const productUrls = await page.$$eval('li.product a[href*="/product/"]', (links) =>
      [...new Set(links.map((link) => (link as HTMLAnchorElement).href).filter(Boolean))].slice(0, 8),
    );
    for (const productUrl of productUrls) {
      await page.goto(this.#safeUrl(productUrl, "product detail"), { waitUntil: "domcontentloaded" });
      assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "product detail response");
      const record = await readWooCommerceProductPage(page, wanted);
      if (record) return record;
    }
    return null;
  }

  async #lookupProtectedShopifyProduct(
    browserContext: import("playwright").BrowserContext,
    page: import("playwright").Page,
    wanted: string,
  ) {
    const productsUrl = this.#safeUrl(this.#config.productsUrl, "catalog");
    const origin = new URL(productsUrl).origin;
    const productsJsonUrl = `${origin}/products.json?limit=250`;
    assertSafeSupplierUrl(productsJsonUrl, this.#allowedHosts(), this.supplier.id, "catalog data");
    const response = await browserContext.request.get(productsJsonUrl, {
      headers: { accept: "application/json" },
    });
    if (response.ok()) {
      return protectedShopifyRecord(await response.json(), wanted, origin);
    }

    const pageText = await page.locator("body").innerText().catch(() => "");
    const outcome = classifyLoginOutcome(pageText, await visibleLocatorCount(page, this.#config.selectors!.password));
    if (outcome === "verification_required" || outcome === "two_factor_required") {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} requires one browser verification before automated reads can continue`,
      );
    }
    throw new SupplierAdapterError(this.supplier.id, "parse_failed", `${this.supplier.name} catalog data was not readable`);
  }

  #safeUrl(value: string | undefined, purpose: string): string {
    if (!value) {
      throw new SupplierAdapterError(this.supplier.id, "not_configured", `${this.supplier.name} ${purpose} URL is missing`);
    }
    assertSafeSupplierUrl(value, this.#allowedHosts(), this.supplier.id, purpose);
    return value;
  }

  #allowedHosts(): string[] {
    return allowedSupplierHosts(this.#config);
  }
}

export function allowedSupplierHosts(config: Pick<WebsiteAdapterConfig, "allowedHosts" | "loginUrl" | "productsUrl">): string[] {
  const configured = config.allowedHosts?.map((host) => host.trim().toLowerCase()).filter(Boolean) ?? [];
  if (configured.length > 0) return [...new Set(configured)];

  const derived = [config.loginUrl, config.productsUrl]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => {
      try {
        return [new URL(value).hostname.toLowerCase()];
      } catch {
        return [];
      }
    });
  return [...new Set(derived)];
}

export function assertSafeSupplierUrl(
  value: string,
  allowedHosts: string[],
  supplierId: string,
  purpose = "portal",
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupplierAdapterError(supplierId, "not_configured", `Supplier ${purpose} URL is invalid`);
  }
  if (
    url.protocol !== "https:" ||
    Boolean(url.username || url.password) ||
    !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    throw new SupplierAdapterError(
      supplierId,
      "not_configured",
      `Supplier session may only be used on an approved HTTPS ${purpose} address`,
    );
  }
  if (/\/(?:cart|checkout|orders?)(?:\/|$)/i.test(url.pathname)) {
    throw new SupplierAdapterError(supplierId, "not_configured", `Supplier ${purpose} URL is not read-only`);
  }
}

export function parseSessionCookieHeader(cookieHeader: string): Array<{ name: string; value: string }> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) return [];
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      return name && value ? [{ name, value }] : [];
    });
}

export function sessionCookiesForHosts(
  cookieHeader: string,
  allowedHosts: string[],
) {
  return allowedHosts.flatMap((host) =>
    parseSessionCookieHeader(cookieHeader).map(({ name, value }) => ({
      name,
      value,
      url: `https://${host}/`,
      secure: true,
      sameSite: "Lax" as const,
    })),
  );
}

export function isCookieDomainAllowed(cookieDomain: string, allowedHosts: string[]): boolean {
  const normalizedDomain = cookieDomain.replace(/^\./, "").toLowerCase();
  return allowedHosts.some((host) => host === normalizedDomain || host.endsWith(`.${normalizedDomain}`));
}

function cleanSessionValue(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

async function readWooCommerceProductPage(page: import("playwright").Page, wanted: string) {
  const variations = await page.locator("form.variations_form").first()
    .getAttribute("data-product_variations")
    .catch(() => null);
  const title = cleanString(await page.locator("h1.product_title").first().innerText().catch(() => ""));
  if (variations) {
    const variation = wooCommerceVariationRecord(variations, wanted, title, page.url());
    if (variation) return variation;
  }

  const sku = cleanString(await page.locator(".sku").first().innerText().catch(() => ""));
  const priceText = await page.locator(".summary .price").first().innerText().catch(() => "");
  const stockText = await page.locator(".stock").first().innerText().catch(() => "");
  const image = await page.locator(".woocommerce-product-gallery img").first().getAttribute("src").catch(() => null);
  return wooCommerceSimpleRecord({ sku, title, priceText, stockText, image }, wanted, page.url());
}

export function wooCommerceSimpleRecord(
  input: { sku: unknown; title: unknown; priceText: unknown; stockText: unknown; image?: unknown },
  wantedSku: string,
  productUrl: string,
): Record<string, unknown> | null {
  const sku = cleanString(input.sku);
  if (sku.toUpperCase() !== wantedSku.toUpperCase()) return null;
  return {
    title: cleanString(input.title),
    sku,
    cost: lastMoney(cleanString(input.priceText)),
    available: /in stock|available/i.test(cleanString(input.stockText)),
    url: productUrl,
    image: cleanString(input.image) || undefined,
  };
}

export function wooCommerceVariationRecord(
  encodedVariations: string,
  wantedSku: string,
  productTitle: string,
  productUrl: string,
): Record<string, unknown> | null {
  let variations: unknown;
  try {
    variations = JSON.parse(encodedVariations);
  } catch {
    return null;
  }
  if (!Array.isArray(variations)) return null;
  const variant = variations.find((candidate) =>
    isRecord(candidate) && cleanString(candidate.sku).toUpperCase() === wantedSku.toUpperCase(),
  );
  if (!isRecord(variant)) return null;
  const attributes = isRecord(variant.attributes)
    ? Object.values(variant.attributes).map(cleanString).filter(Boolean).join(" / ")
    : "";
  const image = isRecord(variant.image) ? cleanString(variant.image.src) : "";
  return {
    title: attributes ? `${productTitle} (${attributes})` : productTitle,
    sku: cleanString(variant.sku),
    cost: parseFiniteNumber(variant.display_price),
    available: Boolean(variant.is_in_stock),
    url: productUrl,
    image,
  };
}

export function protectedShopifyRecord(
  body: unknown,
  wantedSku: string,
  origin: string,
): Record<string, unknown> | null {
  const products = isRecord(body) && Array.isArray(body.products) ? body.products : [];
  for (const product of products) {
    if (!isRecord(product) || !Array.isArray(product.variants)) continue;
    const variant = product.variants.find((candidate) =>
      isRecord(candidate) && cleanString(candidate.sku).toUpperCase() === wantedSku.toUpperCase(),
    );
    if (!isRecord(variant)) continue;
    const title = cleanString(product.title);
    const variantTitle = cleanString(variant.title);
    // Shopify's products JSON represents money as decimal currency strings
    // (for example, "34.50"), not integer cents.
    const price = parseFiniteNumber(variant.price);
    const compareAt = parseFiniteNumber(variant.compare_at_price);
    const onSale = price !== undefined && compareAt !== undefined && compareAt > price;
    const handle = cleanString(product.handle);
    return {
      title: variantTitle && variantTitle !== "Default Title" ? `${title} (${variantTitle})` : title,
      brand: cleanString(product.vendor),
      sku: cleanString(variant.sku),
      available: Boolean(variant.available),
      msrp: onSale ? compareAt : price,
      sale_price: onSale ? price : undefined,
      url: handle ? `${origin}/products/${encodeURIComponent(handle)}` : undefined,
      image: isRecord(product.image) ? cleanString(product.image.src) : undefined,
    };
  }
  return null;
}

function lastMoney(value: string): number | undefined {
  const prices = [...value.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return prices.at(-1);
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function visibleLocatorCount(page: import("playwright").Page, selector: string): Promise<number> {
  const locators = await page.locator(selector).all();
  const visible = await Promise.all(locators.map((locator) => locator.isVisible().catch(() => false)));
  return visible.filter(Boolean).length;
}

