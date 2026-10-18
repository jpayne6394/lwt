import { normalizeSupplierRecord } from "./normalization.ts";
import { launchSupplierBrowser } from "./browser-launcher.ts";
import type {
  SupplierAdapter,
  SupplierAdapterContext,
  SupplierConfig,
  SupplierConnectionCheck,
  SupplierAuthIssue,
} from "./types.ts";
import { isSupplierAuthIssue, SupplierAdapterError } from "./types.ts";

export type EmersonCatalogAdapterConfig = {
  catalogUrls?: string[];
  cookieHeader?: string;
  username?: string;
  password?: string;
  fetchImpl?: typeof fetch;
  renderCatalogImpl?: EmersonRenderedCatalogReader;
  authenticateSessionImpl?: EmersonCredentialAuthenticator;
  nowImpl?: () => number;
};

export type EmersonRenderedCatalogReader = (
  catalogUrl: string,
  cookieHeader: string,
  supplierId: string,
) => Promise<{ responseUrl: string; records: Record<string, unknown>[] }>;

export type EmersonCredentialAuthenticator = (input: {
  username: string; password: string; supplierId: string;
}) => Promise<string>;

/** An expired login is retryable; an actual verification challenge is not. */
export class EmersonSessionExpiredError extends SupplierAdapterError {
  constructor(supplierId: string) {
    super(supplierId, "verification_required", "Emerson account session expired", "existing_session_unverified");
  }
}

type ApolloState = Record<string, Record<string, unknown>>;

const DEFAULT_CATALOG_URL = "https://emersonecologics.com/shop";

/**
 * Reuses a verified supplier session. An expired session can be renewed once
 * with server-held credentials; supplier MFA/CAPTCHA always requires a handoff.
 */
export class EmersonCatalogSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #catalogUrls: string[];
  #cookieHeader?: string;
  readonly #username?: string;
  readonly #password?: string;
  readonly #authenticateSession: EmersonCredentialAuthenticator;
  readonly #now: () => number;
  #refreshPending?: Promise<void>;
  #renewalFailure?: { kind: SupplierAdapterError["kind"]; authIssue: SupplierAuthIssue; retryAt: number };
  readonly #fetch: typeof fetch;
  readonly #renderCatalog: EmersonRenderedCatalogReader;

  constructor(supplier: SupplierConfig, config: EmersonCatalogAdapterConfig = {}) {
    this.supplier = supplier;
    this.#catalogUrls = config.catalogUrls?.length ? config.catalogUrls : [DEFAULT_CATALOG_URL];
    this.#cookieHeader = cleanString(config.cookieHeader) || undefined;
    this.#username = cleanString(config.username) || undefined;
    this.#password = config.password?.trim() ? config.password : undefined;
    this.#authenticateSession = config.authenticateSessionImpl ?? signInEmersonWithCredentials;
    this.#now = config.nowImpl ?? Date.now;
    this.#fetch = config.fetchImpl ?? fetch;
    this.#renderCatalog = config.renderCatalogImpl ?? readRenderedEmersonCatalog;
  }

  async verifyLogin(): Promise<SupplierConnectionCheck> {
    if (!this.#cookieHeader && !this.#canAuthenticate()) {
      return this.#check("not_configured", `${this.supplier.name} needs a one-time browser session connection.`);
    }

    try {
      const records = await this.#readCatalogRecords(this.#catalogUrls[0]);
      if (records.length === 0) {
        return this.#check("login_failed", `${this.supplier.name} did not return a readable catalog.`);
      }
      return this.#check("connected", `${this.supplier.name} reusable session is connected for read-only catalog access.`);
    } catch (error) {
      if (error instanceof SupplierAdapterError && error.kind === "verification_required") {
        return this.#check("verification_required", error.message);
      }
      if (error instanceof SupplierAdapterError && error.kind === "parse_failed") {
        return this.#check("login_failed", `${this.supplier.name} catalog loaded, but its product layout was not recognized.`);
      }
      return this.#check("login_failed", `${this.supplier.name} session check could not read the catalog.`);
    }
  }

  async verifyAuthentication(): Promise<SupplierConnectionCheck> {
    if (!this.#cookieHeader && !this.#canAuthenticate()) return this.#check("not_configured", "Emerson account session is not configured.", "session_not_configured");
    try {
      // Unlike catalog parsing, the rendered reader requires the account-only marker.
      await this.#withSessionRenewal((cookie) => this.#renderCatalog(this.#catalogUrls[0], cookie, this.supplier.id));
      return this.#check("connected", "Emerson account-only marker verified.");
    } catch (error) {
      const authIssue = authenticationIssue(error, "existing_session_unverified");
      if (error instanceof SupplierAdapterError && error.kind === "two_factor_required") {
        return this.#check("two_factor_required", "Emerson account verification code is required.", authIssue);
      }
      if (error instanceof SupplierAdapterError && error.kind === "verification_required") {
        return this.#check("verification_required", "Emerson account verification is required.", authIssue);
      }
      return this.#check("login_failed", "Emerson authenticated account check failed.", authIssue);
    }
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    if (!this.#cookieHeader && !this.#canAuthenticate()) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs a one-time browser session connection`,
      );
    }

    const capturedAt = (context.now ?? new Date()).toISOString();
    const records: Record<string, unknown>[] = [];

    for (const catalogUrl of this.#catalogUrls) {
      records.push(...await this.#readCatalogRecords(catalogUrl));
    }

    const deduped = dedupeBySku(records);
    if (deduped.length === 0) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        "Emerson catalog page did not include product records",
      );
    }

    return deduped.map((record) =>
      normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt,
      }),
    );
  }

  async lookupProduct(supplierSku: string, context: SupplierAdapterContext = {}) {
    if (!this.#cookieHeader && !this.#canAuthenticate()) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "not_configured",
        `${this.supplier.name} needs a one-time browser session connection`,
      );
    }
    const wanted = cleanString(supplierSku);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/+ -]{0,119}$/.test(wanted)) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", "Emerson supplier SKU is invalid");
    }
    const url = new URL(DEFAULT_CATALOG_URL);
    url.searchParams.set("query", `"${wanted}"`);
    const match = (await this.#readCatalogRecords(url.toString(), wanted))
      .find((record) => cleanString(record.sku).toUpperCase() === wanted.toUpperCase());
    if (!match) return null;
    return normalizeSupplierRecord({
      supplierId: this.supplier.id,
      supplierName: this.supplier.name,
      record: match,
      capturedAt: (context.now ?? new Date()).toISOString(),
    });
  }

  async #readCatalog(catalogUrl: string): Promise<{ html: string; responseUrl: string }> {
    assertSafeEmersonUrl(catalogUrl, this.supplier.id);
    const response = await this.#fetch(catalogUrl, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 Supplier Ops Agent",
        cookie: this.#cookieHeader!,
      },
    });

    if (response.status === 401) throw new EmersonSessionExpiredError(this.supplier.id);
    if (response.status === 403) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "verification_required",
        `${this.supplier.name} session expired and needs one browser reconnection`,
      );
    }
    if (!response.ok) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `Emerson catalog returned HTTP ${response.status}`,
      );
    }
    return { html: await response.text(), responseUrl: response.url || catalogUrl };
  }

  async #readCatalogRecords(catalogUrl: string, expectedSku?: string): Promise<Record<string, unknown>[]> {
    return this.#withSessionRenewal(() => this.#readCatalogRecordsWithSession(catalogUrl, expectedSku));
  }

  async #readCatalogRecordsWithSession(catalogUrl: string, expectedSku?: string): Promise<Record<string, unknown>[]> {
    const { html, responseUrl } = await this.#readCatalog(catalogUrl);
    // A real verification challenge is not an expired password form. Ignore scripts
    // and styles so bundled UI strings cannot manufacture a human handoff.
    const visibleText = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ");
    const challenge = emersonChallengeCode(visibleText);
    if (challenge) throw new SupplierAdapterError(this.supplier.id, challenge, "Emerson account verification is required");
    if (requiresSignIn(html, responseUrl)) {
      throw new EmersonSessionExpiredError(this.supplier.id);
    }

    if (hasApolloState(html)) {
      const legacyRecords = recordsFromState(parseApolloState(html, this.supplier.id));
      const legacyHasExpectedSku = !expectedSku || legacyRecords.some(
        (record) => cleanString(record.sku).toUpperCase() === expectedSku.toUpperCase(),
      );
      if (legacyRecords.length > 0 && legacyHasExpectedSku) return legacyRecords;
    }

    const rendered = await this.#renderCatalog(catalogUrl, this.#cookieHeader!, this.supplier.id);
    if (requiresSignIn("", rendered.responseUrl)) {
      throw new EmersonSessionExpiredError(this.supplier.id);
    }
    return rendered.records;
  }

  #canAuthenticate(): boolean { return Boolean(this.#username && this.#password); }

  async #withSessionRenewal<T>(read: (cookie: string) => Promise<T>): Promise<T> {
    const hadSession = Boolean(this.#cookieHeader);
    if (!hadSession) await this.#refreshSession();
    const attemptedCookie = this.#cookieHeader!;
    try { return await read(attemptedCookie); }
    catch (error) {
      // No loop: challenges and failed fresh sessions never cause more login attempts.
      if (!hadSession) {
        const freshError = freshSessionError(this.supplier.id, error);
        this.#rememberRenewalFailure(freshError);
        throw freshError;
      }
      if (!(error instanceof EmersonSessionExpiredError) || !this.#canAuthenticate()) throw error;
      if (this.#cookieHeader === attemptedCookie) await this.#refreshSession();
      try { return await read(this.#cookieHeader!); }
      catch (error) {
        const freshError = freshSessionError(this.supplier.id, error);
        this.#rememberRenewalFailure(freshError);
        throw freshError;
      }
    }
  }

  async #refreshSession(): Promise<void> {
    if (!this.#canAuthenticate()) throw new EmersonSessionExpiredError(this.supplier.id);
    if (this.#renewalFailure && this.#renewalFailure.retryAt > this.#now()) {
      throw new SupplierAdapterError(this.supplier.id, this.#renewalFailure.kind,
        "Emerson saved-account renewal is temporarily paused after the previous unsuccessful attempt", this.#renewalFailure.authIssue);
    }
    if (!this.#refreshPending) {
      this.#refreshPending = (async () => {
        try {
          const cookie = await this.#authenticateSession({ username: this.#username!, password: this.#password!, supplierId: this.supplier.id });
          if (!cookie || /[\r\n]/.test(cookie) || cookie.length > 64_000) {
            throw new SupplierAdapterError(this.supplier.id, "login_failed", "Emerson authenticated session was not available", "renewed_session_unverified");
          }
          this.#cookieHeader = cookie;
          this.#renewalFailure = undefined;
        } catch (error) {
          this.#rememberRenewalFailure(error);
          throw new SupplierAdapterError(this.supplier.id, this.#renewalFailure!.kind,
            "Emerson saved-account renewal could not be completed", this.#renewalFailure!.authIssue);
        }
      })();
    }
    try { await this.#refreshPending; }
    finally { this.#refreshPending = undefined; }
  }

  #rememberRenewalFailure(error: unknown) {
    const kind = error instanceof SupplierAdapterError && ["login_failed", "verification_required", "two_factor_required"].includes(error.kind)
      ? error.kind : "login_failed";
    this.#renewalFailure = { kind, authIssue: authenticationIssue(error, "login_confirmation_missing"), retryAt: this.#now() + 5 * 60_000 };
  }

  #check(status: SupplierConnectionCheck["status"], message: string, authIssue?: SupplierAuthIssue): SupplierConnectionCheck {
    return { supplierId: this.supplier.id, supplierName: this.supplier.name, status, message,
      ...(isSupplierAuthIssue(authIssue) ? { authIssue } : {}) };
  }
}

function authenticationIssue(error: unknown, fallback: SupplierAuthIssue): SupplierAuthIssue {
  if (error instanceof SupplierAdapterError) {
    if (error.kind === "two_factor_required") return "mfa_required";
    if (isSupplierAuthIssue(error.authIssue)) return error.authIssue;
    if (error.kind === "verification_required") return "challenge_required";
  }
  return fallback;
}

function freshSessionError(supplierId: string, error: unknown): SupplierAdapterError {
  const kind = error instanceof SupplierAdapterError ? error.kind : "login_failed";
  const issue = error instanceof EmersonSessionExpiredError || (error instanceof SupplierAdapterError && error.authIssue === "existing_session_unverified")
    ? "renewed_session_unverified" : authenticationIssue(error, "renewed_session_unverified");
  return new SupplierAdapterError(supplierId, kind, "Emerson renewed account session could not be verified", issue);
}

async function launchEmersonBrowser(supplierId: string, launchBrowser: typeof launchSupplierBrowser) {
  try { return await launchBrowser(); }
  catch { throw new SupplierAdapterError(supplierId, "login_failed", "Emerson account browser could not start", "browser_launch_failed"); }
}

export async function signInEmersonWithCredentials(input: {
  username: string; password: string; supplierId: string;
}, launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser): Promise<string> {
  const browser = await launchEmersonBrowser(input.supplierId, launchBrowser);
  let phase: SupplierAuthIssue = "browser_context_failed";
  let page: import("playwright").Page | undefined;
  try {
    const context = await browser.newContext();
    const accountPage = await context.newPage();
    page = accountPage;
    const assertAccountUrl = () => assertSafeEmersonUrl(accountPage.url(), input.supplierId);
    const challenge = () => activeEmersonChallenge(accountPage);
    try {
      // These controls were observed on the supplier's actual current sign-in page.
      phase = "supplier_page_unavailable";
      await accountPage.goto("https://www.emersonecologics.com/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
      assertAccountUrl();
      const initialChallenge = await challenge();
      if (initialChallenge) throw new SupplierAdapterError(input.supplierId, initialChallenge, "Emerson account verification is required");
      phase = "login_form_unavailable";
      await accountPage.locator("#email").fill(input.username, { timeout: 10_000 });
      await accountPage.locator("#password").fill(input.password, { timeout: 10_000 });
      assertAccountUrl();
      await accountPage.getByRole("button", { name: "Sign in", exact: true }).click({ noWaitAfter: true, timeout: 10_000 });
      phase = "login_confirmation_missing";
      let accountVerified = false;
      // Bounded observation only. Never retry the credential submission.
      const observationDeadline = Date.now() + 15_000;
      for (let observation = 0; observation < 60 && Date.now() < observationDeadline; observation += 1) {
        assertAccountUrl();
        const activeChallenge = await challenge();
        if (activeChallenge) throw new SupplierAdapterError(input.supplierId, activeChallenge, "Emerson account verification is required");
        const accountVisible = await accountPage.locator('[aria-label="Account Dropdown"]').first().isVisible().catch(() => false);
        if (accountVisible) { accountVerified = true; break; }
        const text = await accountPage.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
        if (/invalid (?:email|username|password|credentials)|incorrect (?:email|username|password|credentials)|(?:email|username) and password (?:do not|don.t) match/i.test(text)) {
          throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson rejected the saved account", "credentials_rejected");
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assertAccountUrl();
      const activeChallenge = await challenge();
      if (activeChallenge) throw new SupplierAdapterError(input.supplierId, activeChallenge, "Emerson account verification is required");
      if (!accountVerified || !(await accountPage.locator('[aria-label="Account Dropdown"]').first().isVisible().catch(() => false))) {
        throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson did not verify the saved account", "login_confirmation_missing");
      }
      phase = "renewed_session_unverified";
      const cookies = await context.cookies(["https://emersonecologics.com/", "https://www.emersonecologics.com/"]);
      const header = cookies.filter((cookie) => ["emersonecologics.com", "www.emersonecologics.com"].includes(cookie.domain.replace(/^\./, "").toLowerCase()))
        .map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      if (!header) throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson did not provide an authenticated session", "renewed_session_unverified");
      return header;
    } catch (error) {
      if (error instanceof SupplierAdapterError) throw error;
      const activeChallenge = await challenge().catch(() => null);
      throw new SupplierAdapterError(input.supplierId, activeChallenge ?? "login_failed", "Emerson saved account sign-in could not be completed",
        activeChallenge === "two_factor_required" ? "mfa_required" : activeChallenge ? "challenge_required" : phase);
    }
  } catch (error) {
    if (error instanceof SupplierAdapterError) throw error;
    const activeChallenge = page ? await activeEmersonChallenge(page).catch(() => null) : null;
    throw new SupplierAdapterError(input.supplierId, activeChallenge ?? "login_failed", "Emerson saved account sign-in could not be completed",
      activeChallenge === "two_factor_required" ? "mfa_required" : activeChallenge ? "challenge_required" : phase);
  } finally { await browser.close().catch(() => undefined); }
}

export function emersonChallengeCode(text: string, visibleChallenge = false): "two_factor_required" | "verification_required" | null {
  if (/\b(two.factor|2fa|mfa|verification code|authenticator code|one.time (?:code|passcode))\b/i.test(text)) return "two_factor_required";
  if (visibleChallenge || /complete (?:the )?captcha|captcha (?:challenge|required)|verify (?:that )?you are human|i.m not a robot|unusual traffic/i.test(text)) return "verification_required";
  return null;
}

async function activeEmersonChallenge(page: import("playwright").Page) {
  const text = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  let visibleChallenge = false;
  for (const frame of await page.locator('iframe[title*="challenge" i], iframe[title*="verification" i]').all()) {
    if (await frame.isVisible().catch(() => false)) visibleChallenge = true;
  }
  const checkboxes = page.frameLocator('iframe[title="reCAPTCHA"]').getByRole("checkbox");
  if (await checkboxes.isVisible().catch(() => false)) visibleChallenge = true;
  return emersonChallengeCode(text, visibleChallenge);
}

export async function readRenderedEmersonCatalog(
  catalogUrl: string,
  cookieHeader: string,
  supplierId: string,
  launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser,
): Promise<{ responseUrl: string; records: Record<string, unknown>[] }> {
  assertSafeEmersonUrl(catalogUrl, supplierId);
  const browser = await launchEmersonBrowser(supplierId, launchBrowser);
  let phase: SupplierAuthIssue = "browser_context_failed";
  let page: import("playwright").Page | undefined;
  try {
    const browserContext = await browser.newContext();
    await browserContext.addCookies(emersonSessionCookies(cookieHeader));
    const catalogPage = await browserContext.newPage();
    page = catalogPage;
    phase = "supplier_page_unavailable";
    await catalogPage.goto(catalogUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    assertSafeEmersonUrl(catalogPage.url(), supplierId);
    phase = "existing_session_unverified";

    const accountMarker = catalogPage.locator('[aria-label="Account Dropdown"]').first();
    await accountMarker.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
    if (!(await accountMarker.isVisible().catch(() => false))) {
      const pageText = await catalogPage.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
      const passwordVisible = await catalogPage.locator('input[type="password"]').first().isVisible().catch(() => false);
      const challenge = await activeEmersonChallenge(catalogPage);
      if (challenge) throw new SupplierAdapterError(supplierId, challenge, "Emerson account verification is required");
      let signInVisible = false;
      for (const link of await catalogPage.locator('a[href="/login"]').all()) {
        if (await link.isVisible().catch(() => false)
          && /^\s*sign in\s*$/i.test(await link.innerText({ timeout: 2_000 }).catch(() => ""))) signInVisible = true;
      }
      if (passwordVisible || signInVisible || requiresSignIn(pageText, catalogPage.url())) {
        throw new EmersonSessionExpiredError(supplierId);
      }
      throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson account marker was not present", "existing_session_unverified");
    }

    const productLinks = catalogPage.locator('a[data-testid="go-to-pdp"]');
    await productLinks.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    const records = await catalogPage.$$eval('a[data-testid="go-to-pdp"]', renderedEmersonRecords);
    return { responseUrl: catalogPage.url(), records };
  } catch (error) {
    if (error instanceof SupplierAdapterError) throw error;
    const challenge = page ? await activeEmersonChallenge(page).catch(() => null) : null;
    throw new SupplierAdapterError(supplierId, challenge ?? "login_failed", "Emerson account session could not be checked",
      challenge === "two_factor_required" ? "mfa_required" : challenge ? "challenge_required" : phase);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export function renderedEmersonRecords(links: Element[]): Record<string, unknown>[] {
  return links.flatMap((link) => {
    const href = link.getAttribute("href") ?? "";
    const parts = href.split("/").filter(Boolean);
    const sku = decodeURIComponent(parts.at(-1) ?? "").trim();
    const title = (link.getAttribute("aria-label") ?? "").trim();
    const card = link.closest('div[aria-busy="false"]') as HTMLElement | null;
    if (!card || !sku || !title) return [];

    const titled = Array.from(card.querySelectorAll<HTMLElement>("[title]"))
      .map((element) => (element.getAttribute("title") ?? "").trim())
      .filter(Boolean);
    const brand = titled.find((value) => value !== title);
    const variant = (card.querySelector<HTMLElement>('[data-testid="aviary-dropdown-button-base"]')?.innerText ?? "")
      .trim();
    const prices = Array.from(card.innerText.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g))
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);
    const addButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => /add to cart/i.test(button.innerText));
    const image = card.querySelector<HTMLImageElement>('img[data-testid="aviary-product-image"]')?.src;

    return [{
      title: variant && !title.includes(variant) ? `${title} (${variant})` : title,
      brand,
      sku,
      cost: prices.at(-1),
      available: addButton ? !addButton.disabled : undefined,
      url: new URL(href, "https://emersonecologics.com").toString(),
      image,
    }];
  });
}

function emersonSessionCookies(cookieHeader: string) {
  const hosts = ["emersonecologics.com", "www.emersonecologics.com"];
  return hosts.flatMap((host) =>
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        const separator = part.indexOf("=");
        if (separator <= 0) return [];
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        return name && value
          ? [{ name, value, url: `https://${host}/`, secure: true, sameSite: "Lax" as const }]
          : [];
      }),
  );
}

function hasApolloState(html: string): boolean {
  return /<meta[^>]+name=["']apollo-state["']/i.test(html);
}

export function parseEmersonCatalogUrls(value: string | undefined): string[] | undefined {
  const urls = value
    ?.split(/[\n,]+/)
    .map((url) => url.trim())
    .filter(Boolean);
  return urls?.length ? urls : undefined;
}

export function requiresSignIn(html: string, responseUrl: string): boolean {
  let pathname = "";
  try {
    pathname = new URL(responseUrl).pathname;
  } catch {
    // The response body check below remains authoritative in tests and proxies.
  }
  return (
    /^\/login\/?$/i.test(pathname) ||
    /<a\b[^>]*href=["']\/login["'][^>]*>\s*Sign in\s*<\/a>/i.test(html) ||
    /<input\b[^>]*type=["']password["']/i.test(html)
  );
}

export function assertSafeEmersonUrl(value: string, supplierId: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SupplierAdapterError(supplierId, "not_configured", "Emerson catalog URL is invalid");
  }
  if (url.protocol !== "https:" || Boolean(url.username || url.password)
    || !["emersonecologics.com", "www.emersonecologics.com"].includes(url.hostname.toLowerCase())
    || /\/(?:cart|checkout|orders?|payment)(?:\/|$)/i.test(url.pathname)) {
    throw new SupplierAdapterError(
      supplierId,
      "not_configured",
      "Emerson session may only be sent to an HTTPS Emerson Ecologics address",
    );
  }
}

function parseApolloState(html: string, supplierId: string): ApolloState {
  const encoded = html.match(/<meta[^>]+name=["']apollo-state["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!encoded) {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson catalog page did not include product state");
  }

  try {
    return JSON.parse(decodeURIComponent(Buffer.from(encoded, "base64").toString("utf8"))) as ApolloState;
  } catch {
    throw new SupplierAdapterError(supplierId, "parse_failed", "Emerson catalog product state could not be parsed");
  }
}

function recordsFromState(state: ApolloState): Record<string, unknown>[] {
  return Object.entries(state)
    .filter(([key, product]) => key.startsWith("Product:") && product.__typename === "Product")
    .map(([, product]) => recordFromProduct(state, product))
    .filter((record): record is Record<string, unknown> => record !== undefined);
}

function recordFromProduct(state: ApolloState, product: Record<string, unknown>): Record<string, unknown> | undefined {
  const variant = refRecord(state, product.availableOrMasterVariant);
  if (!variant) return undefined;

  const brandName = cleanString(refRecord(state, product.brand)?.name);
  const productSlug = cleanString(product.slug);
  const productId = cleanString(product.id);
  const emersonVariantId = cleanString(variant.emersonVariantId);

  return {
    brand: brandName,
    sku: firstPresent(variant.sku, variant.emersonVariantId),
    title: firstPresent(variant.name, variant.descriptor, product.name),
    stockStatus: stockStatusFromVariant(variant),
    quantity: firstPresent(variant.quantityAvailable, variant.availableQuantity, variant.quantity, variant.stock),
    cost: firstPresent(
      variant.cost,
      variant.price,
      variant.accountPrice,
      variant.practitionerPrice,
      variant.wholesalePrice,
      variant.customerPrice,
    ),
    msrp: firstPresent(variant.msrp, variant.retailPrice, variant.listPrice),
    sale_price: firstPresent(variant.salePrice, variant.promoPrice, variant.discountPrice),
    url:
      productSlug && productId && emersonVariantId
        ? `https://www.emersonecologics.com/products/detail/${slugify(brandName)}/${productSlug}/${productId}/${emersonVariantId}`
        : undefined,
    image: firstPresent(variant.imageNew, variant.image, variant.imageUrl),
  };
}

function stockStatusFromVariant(variant: Record<string, unknown>): string | undefined {
  const value = firstPresent(
    variant.stockStatus,
    variant.availability,
    variant.inStock,
    variant.isInStock,
    variant.available,
    variant.availableForSale,
  );
  if (value !== undefined) return String(value);

  const quantity = firstPresent(variant.quantityAvailable, variant.availableQuantity, variant.quantity, variant.stock);
  return quantity !== undefined ? String(quantity) : undefined;
}

function refRecord(state: ApolloState, value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const ref = cleanString(value.__ref);
  const record = state[ref];
  return isRecord(record) ? record : undefined;
}

function dedupeBySku(records: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const sku = cleanString(record.sku);
    if (!sku || seen.has(sku)) return false;
    seen.add(sku);
    return true;
  });
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: string): string {
  return value.trim().replace(/&/g, "and").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
