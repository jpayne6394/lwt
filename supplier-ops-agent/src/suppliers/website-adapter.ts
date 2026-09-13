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
  fetchImpl?: typeof fetch;
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

const EXACT_LOOKUP_NAVIGATION_TIMEOUT_MS = 12_000;
const EXACT_LOOKUP_ACCOUNT_MARKER_TIMEOUT_MS = 10_000;
const EXACT_LOOKUP_HTTP_TIMEOUT_MS = 20_000;

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
  let lastState = { pageText: "", passwordFieldCount: 1 };

  while (true) {
    try {
      lastState = await readState();
      const outcome = classifyLoginOutcome(lastState.pageText, lastState.passwordFieldCount);
      if (outcome !== "pending") return outcome;
    } catch {
      // A navigation can briefly destroy the old document while the supplier
      // replaces it with the authenticated page. Treat that as pending until
      // the same bounded deadline instead of reporting a false login failure.
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return /captcha|recaptcha/.test(lastState.pageText.toLowerCase()) ? "verification_required" : "timed_out";
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
  readonly #fetch: typeof fetch;
  #sessionCookieHeader?: string;

  constructor(
    supplier: SupplierConfig,
    config: WebsiteAdapterConfig = {},
    dependencies: WebsiteAdapterDependencies = {},
  ) {
    this.supplier = supplier;
    this.#config = config;
    this.#launchBrowser = dependencies.launchBrowser ?? launchSupplierBrowser;
    this.#fetch = dependencies.fetchImpl ?? fetch;
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
        // Supplier portals can hold the form navigation open while an
        // invisible verification check finishes. The bounded outcome poll
        // below owns that wait and distinguishes success from a real prompt.
        await page.click(config.selectors.submit, { noWaitAfter: true });

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

    let phase = "catalog_lookup";
    if (this.#sessionCookieHeader && this.supplier.id !== "physicians-standard") {
      try {
        const record = await this.#lookupWordPressProductFromSession(wanted);
        if (!record) return null;
        return normalizeSupplierRecord({
          supplierId: this.supplier.id,
          supplierName: this.supplier.name,
          record,
          capturedAt: (context.now ?? new Date()).toISOString(),
        });
      } catch (error) {
        const canRefreshSession = error instanceof SupplierAdapterError &&
          error.kind === "verification_required" &&
          Boolean(this.#config.loginUrl && this.#config.username && this.#config.password);
        if (!canRefreshSession) {
          const kind = error instanceof SupplierAdapterError ? error.kind : automationFailureKind(error);
          console.warn(`[supplier-lookup] supplier=${this.supplier.id} phase=${phase} result=failed kind=${kind}`);
          throw error;
        }
        // The authenticated HTTP response already proved this cookie is stale.
        // Do not spend another browser navigation retrying the same session.
        this.#sessionCookieHeader = undefined;
      }
    }

    phase = "browser_start";
    let browser: Awaited<ReturnType<typeof launchSupplierBrowser>> | undefined;
    try {
      browser = await this.#launchBrowser();
      phase = "browser_context";
      const browserContext = await browser.newContext();
      const page = await browserContext.newPage();
      const exactSearchUrl = this.supplier.id === "physicians-standard"
        ? undefined
        : this.#wordPressSearchUrl(wanted);
      phase = "authentication";
      await this.#openAuthenticatedProducts(browserContext, page, exactSearchUrl);
      phase = "catalog_lookup";
      const record = this.supplier.id === "physicians-standard"
        ? await this.#lookupProtectedShopifyProduct(browserContext, page, wanted)
        : await this.#lookupWordPressProduct(page, wanted, true);
      if (!record) return null;
      phase = "normalization";
      return normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt: (context.now ?? new Date()).toISOString(),
      });
    } catch (error) {
      const kind = error instanceof SupplierAdapterError ? error.kind : automationFailureKind(error);
      console.warn(`[supplier-lookup] supplier=${this.supplier.id} phase=${phase} result=failed kind=${kind}`);
      throw error;
    } finally {
      await browser?.close();
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
    let phase: LoginCheckPhase = "login_page";
    try {
      await page.goto(this.#safeUrl(config.loginUrl, "sign-in"), { waitUntil: "domcontentloaded" });
      assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "sign-in response");
      phase = "username_field";
      await page.fill(config.selectors!.username, config.username!);
      phase = "password_field";
      await page.fill(config.selectors!.password, config.password!);
      phase = "submit";
      // Do not let Playwright's implicit navigation wait consume the entire
      // request window. The outcome poll below safely owns the bounded wait.
      await page.click(config.selectors!.submit, { noWaitAfter: true });

      phase = "response_check";
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
    } catch (error) {
      if (!(error instanceof SupplierAdapterError)) {
        if (await pageHasVerificationChallenge(page)) {
          throw new SupplierAdapterError(
            this.supplier.id,
            "verification_required",
            `${this.supplier.name} requires one browser verification before automated reads can continue`,
          );
        }
        console.warn(`[supplier-login] supplier=${this.supplier.id} phase=${phase} result=failed kind=${automationFailureKind(error)}`);
      }
      throw error;
    }
  }

  async #openAuthenticatedProducts(
    browserContext: import("playwright").BrowserContext,
    page: import("playwright").Page,
    initialCatalogUrl?: string,
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
        await this.#openWithReusableSession(browserContext, page, initialCatalogUrl);
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
    const isExactLookup = Boolean(initialCatalogUrl);
    await page.goto(this.#safeUrl(initialCatalogUrl ?? config.productsUrl, "catalog"), {
      waitUntil: isExactLookup ? "commit" : "domcontentloaded",
      ...(isExactLookup ? { timeout: EXACT_LOOKUP_NAVIGATION_TIMEOUT_MS } : {}),
    });
    assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "catalog response");
    const accountMarkerVisible = await waitForVisible(
      page,
      config.authenticatedSelector,
      isExactLookup ? EXACT_LOOKUP_ACCOUNT_MARKER_TIMEOUT_MS : undefined,
    );
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
    initialCatalogUrl?: string,
  ) {
    const config = this.#config;
    if (!config.productsUrl || !config.authenticatedSelector || !this.#sessionCookieHeader) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} reusable session settings are incomplete`,
      );
    }

    const catalogUrl = this.#safeUrl(initialCatalogUrl ?? config.productsUrl, "catalog");
    const allowedHosts = this.#allowedHosts();
    const cookies = sessionCookiesForHosts(this.#sessionCookieHeader, allowedHosts);
    if (cookies.length === 0) {
      throw new SupplierAdapterError(this.supplier.id, "not_configured", `${this.supplier.name} session is empty`);
    }
    let phase = "cookie_install";
    try {
      await browserContext.addCookies(cookies);
      phase = "catalog_navigation";
      const isExactLookup = Boolean(initialCatalogUrl);
      await page.goto(catalogUrl, {
        waitUntil: isExactLookup ? "commit" : "domcontentloaded",
        ...(isExactLookup ? { timeout: EXACT_LOOKUP_NAVIGATION_TIMEOUT_MS } : {}),
      });
      phase = "catalog_response";
      assertSafeSupplierUrl(page.url(), allowedHosts, this.supplier.id, "catalog response");

      phase = "account_marker";
      const accountMarkerVisible = await waitForVisible(
        page,
        config.authenticatedSelector,
        isExactLookup ? EXACT_LOOKUP_ACCOUNT_MARKER_TIMEOUT_MS : undefined,
      );
      if (accountMarkerVisible) return;

      phase = "page_classification";
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
    } catch (error) {
      if (!(error instanceof SupplierAdapterError)) {
        console.warn(
          `[supplier-session] supplier=${this.supplier.id} phase=${phase} result=failed kind=${automationFailureKind(error)}`,
        );
      }
      throw error;
    }
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

  #wordPressSearchUrl(wanted: string): string {
    const productsUrl = this.#safeUrl(this.#config.productsUrl, "catalog");
    const searchUrl = new URL("/", productsUrl);
    searchUrl.searchParams.set("s", wanted);
    searchUrl.searchParams.set("post_type", "product");
    return this.#safeUrl(searchUrl.toString(), "catalog search");
  }

  async #lookupWordPressProduct(page: import("playwright").Page, wanted: string, searchAlreadyOpen = false) {
    if (!searchAlreadyOpen) {
      await page.goto(this.#wordPressSearchUrl(wanted), { waitUntil: "domcontentloaded" });
      assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "catalog search response");
    }

    const direct = await readWooCommerceProductPage(page, wanted);
    if (direct) return direct;

    const productLinks = await page.$$eval('li.product a[href*="/product/"]', (links) =>
      links.map((link) => ({
        url: (link as HTMLAnchorElement).href,
        text: link.textContent ?? "",
      })),
    );
    for (const productUrl of prioritizeWooProductLinks(productLinks, wanted).slice(0, 8)) {
      await page.goto(this.#safeUrl(productUrl, "product detail"), { waitUntil: "domcontentloaded" });
      assertSafeSupplierUrl(page.url(), this.#allowedHosts(), this.supplier.id, "product detail response");
      const record = await readWooCommerceProductPage(page, wanted);
      if (record) return record;
    }
    return null;
  }

  async #lookupWordPressProductFromSession(wanted: string): Promise<Record<string, unknown> | null> {
    const searchPage = await this.#fetchAuthenticatedWordPressHtml(this.#wordPressSearchUrl(wanted));
    const direct = wooCommerceRecordFromHtml(searchPage.html, wanted, searchPage.responseUrl);
    if (direct) return direct;

    const productLinks = wooCommerceProductLinksFromHtml(searchPage.html, searchPage.responseUrl);
    for (const productUrl of prioritizeWooProductLinks(productLinks, wanted).slice(0, 8)) {
      let safeProductUrl: string;
      try {
        safeProductUrl = this.#safeUrl(productUrl, "product detail");
      } catch {
        continue;
      }
      const detailPage = await this.#fetchAuthenticatedWordPressHtml(
        safeProductUrl,
      );
      const record = wooCommerceRecordFromHtml(detailPage.html, wanted, detailPage.responseUrl);
      if (record) return record;
    }
    return null;
  }

  async #fetchAuthenticatedWordPressHtml(
    initialUrl: string,
  ): Promise<{ html: string; responseUrl: string }> {
    const allowedHosts = this.#allowedHosts();
    let responseUrl = initialUrl;
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      assertSafeSupplierUrl(responseUrl, allowedHosts, this.supplier.id, "catalog response");
      response = await this.#fetch(responseUrl, {
        redirect: "manual",
        headers: {
          accept: "text/html,application/xhtml+xml",
          cookie: this.#sessionCookieHeader!,
          "user-agent": "Mozilla/5.0 Supplier Ops Agent",
        },
        signal: AbortSignal.timeout(EXACT_LOOKUP_HTTP_TIMEOUT_MS),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 5) {
        throw new SupplierAdapterError(
          this.supplier.id,
          "parse_failed",
          this.supplier.name + " catalog returned an invalid redirect",
        );
      }
      responseUrl = new URL(location, responseUrl).toString();
    }
    if (!response) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", this.supplier.name + " catalog returned no response");
    }
    assertSafeSupplierUrl(response.url || responseUrl, allowedHosts, this.supplier.id, "catalog response");
    if (!response.ok) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `${this.supplier.name} catalog returned HTTP ${response.status}`,
      );
    }
    const html = await response.text();
    if (!htmlBodyHasClass(html, "logged-in")) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} session expired and needs one browser reconnection`,
      );
    }
    return { html, responseUrl: response.url || responseUrl };
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

function automationFailureKind(error: unknown): "timeout" | "browser_closed" | "unexpected" {
  if (error instanceof Error && /timeout/i.test(error.name)) return "timeout";
  if (error instanceof Error && /closed|destroyed|detached/i.test(error.message)) return "browser_closed";
  return "unexpected";
}

async function pageHasVerificationChallenge(page: import("playwright").Page): Promise<boolean> {
  const [pageText, verificationFrameCount] = await Promise.all([
    page.locator("body").innerText().catch(() => ""),
    page.locator('iframe[src*="recaptcha" i], iframe[src*="captcha" i], [class*="captcha" i]').count().catch(() => 0),
  ]);
  return verificationFrameCount > 0 || /captcha|verify (that )?you are human|i'm not a robot|unusual traffic/i.test(pageText);
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
  const variationForm = page.locator("form.variations_form").first();
  const variations = (await variationForm.count()) > 0
    ? await variationForm.getAttribute("data-product_variations").catch(() => null)
    : null;
  const title = cleanString(await firstTextIfPresent(page, "h1.product_title"));
  if (variations) {
    const variation = wooCommerceVariationRecord(variations, wanted, title, page.url());
    if (variation) return variation;
  }

  const sku = cleanString(await firstTextIfPresent(page, ".sku"));
  if (!sku) return null;
  const priceText = await firstTextIfPresent(page, ".summary .price");
  const stockText = await firstTextIfPresent(page, ".stock");
  const imageLocator = page.locator(".woocommerce-product-gallery img").first();
  const image = (await imageLocator.count()) > 0
    ? await imageLocator.getAttribute("src").catch(() => null)
    : null;
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

export function wooCommerceRecordFromHtml(
  html: string,
  wantedSku: string,
  productUrl: string,
): Record<string, unknown> | null {
  const title = textFromHtmlElementWithClass(html, "product_title");
  const encodedVariations = firstHtmlAttribute(html, "data-product_variations");
  if (encodedVariations) {
    const variation = wooCommerceVariationRecord(
      decodeHtmlAttribute(encodedVariations),
      wantedSku,
      title,
      productUrl,
    );
    if (variation) return variation;
  }

  const sku = textFromHtmlElementWithClass(html, "sku");
  if (!sku) return null;
  return wooCommerceSimpleRecord(
    {
      sku,
      title,
      priceText: textFromHtmlElementWithClass(html, "price"),
      stockText: textFromHtmlElementWithClass(html, "stock"),
      image: firstHtmlAttribute(html, "data-large_image") || undefined,
    },
    wantedSku,
    productUrl,
  );
}

export function wooCommerceProductLinksFromHtml(
  html: string,
  baseUrl: string,
): Array<{ url: string; text: string }> {
  const links: Array<{ url: string; text: string }> = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtmlAttribute(firstHtmlAttribute(match[1] ?? "", "href"));
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (!/\/product\//i.test(url.pathname)) continue;
    links.push({
      url: url.toString(),
      text: cleanString(
        decodeHtmlAttribute((match[2] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " "),
      ),
    });
  }
  return links;
}

function htmlBodyHasClass(html: string, className: string): boolean {
  const bodyTag = html.match(/<body\b[^>]*>/i)?.[0] ?? "";
  const classes = firstHtmlAttribute(bodyTag, "class").split(/\s+/);
  return classes.includes(className);
}

function firstHtmlAttribute(html: string, attribute: string): string {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2] ?? "";
}

function textFromHtmlElementWithClass(html: string, className: string): string {
  const openingTagPattern = /<([a-z0-9]+)\b[^>]*>/gi;
  for (const match of html.matchAll(openingTagPattern)) {
    const classes = firstHtmlAttribute(match[0], "class").split(/\s+/).filter(Boolean);
    if (!classes.includes(className)) continue;
    const tagName = match[1];
    const contentStart = (match.index ?? 0) + match[0].length;
    const closingTag = new RegExp(`<\\/${tagName}\\s*>`, "i");
    const closingMatch = closingTag.exec(html.slice(contentStart));
    if (!closingMatch) continue;
    const content = html.slice(contentStart, contentStart + closingMatch.index);
    return cleanString(decodeHtmlAttribute(content.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " "));
  }
  return "";
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function prioritizeWooProductLinks(
  links: Array<{ url: string; text: string }>,
  wantedSku: string,
): string[] {
  const needle = cleanString(wantedSku).toLowerCase().replace(/[^a-z0-9]/g, "");
  const unique = [...new Map(
    links
      .filter((link) => cleanString(link.url))
      .map((link) => [cleanString(link.url), { url: cleanString(link.url), text: cleanString(link.text) }]),
  ).values()];
  return unique
    .map((link, index) => {
      const haystack = `${link.url} ${link.text}`.toLowerCase().replace(/[^a-z0-9]/g, "");
      return { ...link, index, exactHint: Boolean(needle && haystack.includes(needle)) };
    })
    .sort((left, right) => Number(right.exactHint) - Number(left.exactHint) || left.index - right.index)
    .map((link) => link.url);
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

async function firstTextIfPresent(page: import("playwright").Page, selector: string): Promise<string> {
  const locator = page.locator(selector).first();
  return (await locator.count()) > 0 ? locator.innerText().catch(() => "") : "";
}

async function waitForVisible(
  page: import("playwright").Page,
  selector: string,
  timeoutMs = 15_000,
): Promise<boolean> {
  const locator = page.locator(selector);
  if (await locator.isVisible().catch(() => false)) return true;
  return locator.waitFor({ state: "visible", timeout: timeoutMs }).then(() => true).catch(() => false);
}

async function visibleLocatorCount(page: import("playwright").Page, selector: string): Promise<number> {
  const locators = await page.locator(selector).all().catch(() => []);
  const visible = await Promise.all(locators.map((locator) => locator.isVisible().catch(() => false)));
  return visible.filter(Boolean).length;
}

