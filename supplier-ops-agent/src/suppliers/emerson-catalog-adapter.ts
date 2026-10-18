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
import { cartPrepareReceipt, type SupplierCartPrepareCommand, type SupplierCartPrepareReceipt } from "./cart-preparation.ts";

export type EmersonCatalogAdapterConfig = {
  catalogUrls?: string[];
  cookieHeader?: string;
  username?: string;
  password?: string;
  fetchImpl?: typeof fetch;
  renderCatalogImpl?: EmersonRenderedCatalogReader;
  authenticateSessionImpl?: EmersonCredentialAuthenticator;
  nowImpl?: () => number;
  prepareCartImpl?: (command: SupplierCartPrepareCommand, cookie: string) => Promise<SupplierCartPrepareReceipt>;
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
  readonly #prepareCart: (command: SupplierCartPrepareCommand, cookie: string) => Promise<SupplierCartPrepareReceipt>;

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
    this.#prepareCart = config.prepareCartImpl ?? (async (command, cookie) => {
      const { prepareEmersonCart } = await import("./emerson-cart-adapter.ts");
      return prepareEmersonCart(command, cookie);
    });
  }

  async prepareCart(command: SupplierCartPrepareCommand): Promise<SupplierCartPrepareReceipt> {
    if (command.supplierKey !== this.supplier.id) return cartPrepareReceipt(command, "blocked", "unsupported_supplier");
    if (!this.#cookieHeader && !this.#canAuthenticate()) return cartPrepareReceipt(command, "blocked", "auth_required");
    try {
      // The cart reader must close its browser before throwing positive pre-mutation session expiry.
      // Then the existing once-only renewal can launch separately without nesting browser leases.
      return await this.#withSessionRenewal((cookie) => this.#prepareCart(command, cookie));
    } catch (error) {
      if (error instanceof SupplierAdapterError) {
        if (error.kind === "two_factor_required") return cartPrepareReceipt(command, "blocked", "two_factor_required");
        if (error instanceof EmersonSessionExpiredError) return cartPrepareReceipt(command, "blocked", "auth_required");
        if (error.kind === "verification_required") return cartPrepareReceipt(command, "blocked", "verification_required");
        if (["browser_launch_failed", "browser_context_failed", "supplier_page_unavailable"].includes(error.authIssue ?? "")) return cartPrepareReceipt(command, "blocked", "worker_unavailable");
        if (error.authIssue === "credentials_rejected" || error.kind === "not_configured") return cartPrepareReceipt(command, "blocked", "auth_required");
      }
      return cartPrepareReceipt(command, "unknown", "outcome_unknown");
    }
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
    const progress = emersonAuthProgress("authentication");
    progress("start");
    if (!this.#cookieHeader && !this.#canAuthenticate()) {
      progress("failed");
      return this.#check("not_configured", "Emerson account session is not configured.", "session_not_configured");
    }
    try {
      // Unlike catalog parsing, the rendered reader requires the account-only marker.
      await this.#withSessionRenewal((cookie) => this.#renderCatalog(this.#catalogUrls[0], cookie, this.supplier.id));
      progress("complete");
      return this.#check("connected", "Emerson account-only marker verified.");
    } catch (error) {
      progress("failed");
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

type EmersonLoginOperation = "readiness" | "fill_email" | "fill_password" | "press_sign_in";
type EmersonLoginFailureCategory = "pointer_intercepted" | "timeout" | "element_detached" | "element_not_editable" | "page_closed" | "other";
type EmersonLoginControls = { email: import("playwright").Locator; password: import("playwright").Locator; signIn: import("playwright").Locator };

export const EMERSON_AUTH_PROGRESS_STAGES = ["start", "browser_launch", "browser_context", "page_navigation", "consent_dialog", "form_readiness",
  "fill_email", "fill_password", "submit_readiness", "press_sign_in", "account_observation", "account_confirmation",
  "session_readback", "catalog_readback", "failure_diagnostics", "browser_close", "complete", "failed"] as const;
function emersonAuthProgress(flow: "authentication" | "session_probe" | "saved_login") {
  const started = performance.now();
  let last: string | undefined;
  return (stage: typeof EMERSON_AUTH_PROGRESS_STAGES[number]) => {
    if (stage === last) return;
    last = stage;
    console.info("[supplier-auth-progress]", JSON.stringify({ flow, stage, elapsedMs: Math.max(0, Math.round(performance.now() - started)) }));
  };
}

function emersonLoginFailureCategory(error: unknown): EmersonLoginFailureCategory {
  if (!(error instanceof Error)) return "other";
  // Categorize without emitting provider text. An intercepted click often arrives as a TimeoutError.
  if (/intercepts? (?:pointer )?events|intercepted.*(?:pointer|click)|another element.*(?:obscur|cover)/i.test(error.message)) return "pointer_intercepted";
  if (/not attached|detached from (?:the )?dom|element.*not connected/i.test(error.message)) return "element_detached";
  if (/not editable|read.?only|element is not enabled|element is disabled/i.test(error.message)) return "element_not_editable";
  if (/target.*closed|page.*closed|browser.*closed|context.*closed/i.test(error.message)) return "page_closed";
  return error.name === "TimeoutError" ? "timeout" : "other";
}

export async function signInEmersonWithCredentials(input: {
  username: string; password: string; supplierId: string;
}, launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser): Promise<string> {
  const progress = emersonAuthProgress("saved_login");
  progress("start");
  progress("browser_launch");
  const browser = await launchEmersonBrowser(input.supplierId, launchBrowser).catch(error => { progress("failed"); throw error; });
  let phase: SupplierAuthIssue = "browser_context_failed";
  let operation: EmersonLoginOperation = "readiness";
  let failureCategory: EmersonLoginFailureCategory = "other";
  let controls: EmersonLoginControls | undefined;
  let page: import("playwright").Page | undefined;
  let failed = false;
  try {
    progress("browser_context");
    const context = await browser.newContext();
    const accountPage = await context.newPage();
    page = accountPage;
    const assertAccountUrl = () => assertSafeEmersonUrl(accountPage.url(), input.supplierId);
    const challenge = () => activeEmersonChallenge(accountPage);
    try {
      // These controls were observed on the supplier's actual current sign-in page.
      phase = "supplier_page_unavailable";
      progress("page_navigation");
      await accountPage.goto("https://www.emersonecologics.com/login", { waitUntil: "domcontentloaded", timeout: 20_000 });
      assertAccountUrl();
      const initialChallenge = await challenge();
      if (initialChallenge) throw new SupplierAdapterError(input.supplierId, initialChallenge, "Emerson account verification is required");
      phase = "login_form_unavailable";
      progress("form_readiness");
      let [email, password] = await Promise.all([
        visibleEmersonLoginField(accountPage, /^Email\s*\*?$/i, "#email"),
        visibleEmersonLoginField(accountPage, /^Password\s*\*?$/i, "#password"),
      ]);
      const signIn = accountPage.getByRole("button", { name: /^Sign\s*in$/i });
      controls = { email, password, signIn };
      await signIn.waitFor({ state: "visible", timeout: 10_000 });
      assertAccountUrl();
      const formChallenge = await challenge();
      if (formChallenge) throw new SupplierAdapterError(input.supplierId, formChallenge, "Emerson account verification is required");
      progress("consent_dialog");
      await resolveEmersonCookieDialog(accountPage, input.supplierId);
      const preparationDeadline = Date.now() + 45_000;
      const preparationTimeout = (limit: number) => {
        const remaining = preparationDeadline - Date.now();
        if (remaining <= 0) throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson sign-in form did not stabilize", "login_form_unavailable");
        return Math.min(limit, remaining);
      };
      const reacquireEditableFields = async () => {
        for (let observation = 0; observation < 180 && Date.now() < preparationDeadline; observation += 1) {
          assertAccountUrl();
          [email, password] = await Promise.all([
            visibleEmersonLoginField(accountPage, /^Email\s*\*?$/i, "#email", preparationTimeout(10_000)),
            visibleEmersonLoginField(accountPage, /^Password\s*\*?$/i, "#password", preparationTimeout(10_000)),
          ]);
          controls = { email, password, signIn };
          const editable = await Promise.all([email.isEditable({ timeout: preparationTimeout(1_000) }).catch(() => null), password.isEditable({ timeout: preparationTimeout(1_000) }).catch(() => null)]);
          const pendingChallenge = await challenge();
          if (pendingChallenge) throw new SupplierAdapterError(input.supplierId, pendingChallenge, "Emerson account verification is required");
          assertAccountUrl();
          if (editable.every(value => value === true)) return;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson sign-in fields are not editable", "login_form_unavailable");
      };
      const readValues = async () => {
        let values: Array<string | null> = [null, null];
        for (let observation = 0; observation < 180 && Date.now() < preparationDeadline; observation += 1) {
          assertAccountUrl();
          values = await Promise.all([email.inputValue({ timeout: preparationTimeout(1_000) }).catch(() => null), password.inputValue({ timeout: preparationTimeout(1_000) }).catch(() => null)]);
          if (values.every(value => value !== null)) return values;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        return values; // Unknown is never treated as a proven empty/reset field.
      };
      let recoveryUsed = false, credentialsReady = false, refillEmail = true;
      for (let preparation = 0; preparation < 2; preparation += 1) {
        await reacquireEditableFields();
        if (refillEmail) {
          const timeout = preparationTimeout(10_000);
          operation = "fill_email"; progress("fill_email");
          await email.fill(input.username, { timeout });
        }
        await reacquireEditableFields(); // Hydration can replace an ID-based field with its semantic equivalent.
        let values = await readValues();
        if (values[0] === input.username && (values[1] === "" || values[1] === input.password)) {
          const timeout = preparationTimeout(10_000);
          operation = "fill_password"; progress("fill_password");
          await password.fill(input.password, { timeout });
          await reacquireEditableFields();
          values = await readValues();
          if (values[0] === input.username && values[1] === input.password) {
            await new Promise(resolve => setTimeout(resolve, 250));
            await reacquireEditableFields();
            values = await readValues();
            if (values[0] === input.username && values[1] === input.password) { credentialsReady = true; break; }
          }
        }
        // Recover once only from a successfully observed empty field, never a timeout or different nonempty value.
        const reset = values.some(value => value === "") && values.every((value, index) => value === "" || value === [input.username, input.password][index]);
        if (recoveryUsed || !reset) break;
        assertAccountUrl();
        const recoveryChallenge = await challenge();
        if (recoveryChallenge) throw new SupplierAdapterError(input.supplierId, recoveryChallenge, "Emerson account verification is required");
        await resolveEmersonCookieDialog(accountPage, input.supplierId);
        recoveryUsed = true; refillEmail = values[0] === "";
      }
      if (!credentialsReady) throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson sign-in fields did not retain the supplied account", "login_form_unavailable");
      assertAccountUrl();
      operation = "press_sign_in";
      progress("submit_readiness");
      // React validation may briefly disable the button after either fill, especially on the small worker.
      // Observe positive readiness only; no submission retry or forced activation.
      const readinessDeadline = Date.now() + 15_000;
      let submissionReady = false;
      for (let observation = 0; observation < 60 && Date.now() < readinessDeadline; observation += 1) {
        assertAccountUrl();
        const pendingChallenge = await challenge();
        if (pendingChallenge) throw new SupplierAdapterError(input.supplierId, pendingChallenge, "Emerson account verification is required");
        if (await signIn.isVisible().catch(() => false) && await signIn.isEnabled({ timeout: 1_000 }).catch(() => false)) {
          submissionReady = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!submissionReady) {
        throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson sign-in button is not ready", "login_form_unavailable");
      }
      // Normal keyboard activation focuses this observed button. Submit once; never retry a prior pointer action.
      await reacquireEditableFields();
      const finalValues = await readValues();
      if (finalValues[0] !== input.username || finalValues[1] !== input.password) {
        throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson sign-in fields changed before submission", "login_form_unavailable");
      }
      assertAccountUrl();
      const submissionChallenge = await challenge();
      if (submissionChallenge) throw new SupplierAdapterError(input.supplierId, submissionChallenge, "Emerson account verification is required");
      assertAccountUrl();
      progress("press_sign_in");
      await signIn.press("Enter", { noWaitAfter: true, timeout: 10_000 });
      phase = "login_confirmation_missing";
      progress("account_confirmation");
      const verifyAccount = createEmersonAccountVerifier(accountPage, input.supplierId);
      let accountVerified = false;
      // Bounded observation only. Never retry the credential submission.
      const observationDeadline = Date.now() + 15_000;
      for (let observation = 0; observation < 60 && Date.now() < observationDeadline; observation += 1) {
        assertAccountUrl();
        const activeChallenge = await challenge();
        if (activeChallenge) throw new SupplierAdapterError(input.supplierId, activeChallenge, "Emerson account verification is required");
        const accountVisible = await verifyAccount();
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
      if (!accountVerified || !(await verifyAccount())) {
        throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson did not verify the saved account", "login_confirmation_missing");
      }
      phase = "renewed_session_unverified";
      progress("session_readback");
      const cookies = await context.cookies(["https://emersonecologics.com/", "https://www.emersonecologics.com/"]);
      const header = cookies.filter((cookie) => ["emersonecologics.com", "www.emersonecologics.com"].includes(cookie.domain.replace(/^\./, "").toLowerCase()))
        .map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
      if (!header) throw new SupplierAdapterError(input.supplierId, "login_failed", "Emerson did not provide an authenticated session", "renewed_session_unverified");
      return header;
    } catch (error) {
      progress("failure_diagnostics");
      failureCategory = emersonLoginFailureCategory(error);
      if (error instanceof SupplierAdapterError) throw error;
      const activeChallenge = await challenge().catch(() => null);
      throw new SupplierAdapterError(input.supplierId, activeChallenge ?? "login_failed", "Emerson saved account sign-in could not be completed",
        activeChallenge === "two_factor_required" ? "mfa_required" : activeChallenge ? "challenge_required" : phase);
    }
  } catch (error) {
    failed = true;
    progress("failure_diagnostics");
    if (!(error instanceof SupplierAdapterError)) failureCategory = emersonLoginFailureCategory(error);
    await logEmersonLoginFailure(page, phase, error instanceof SupplierAdapterError ? error.kind : "login_failed", operation, failureCategory, controls, input).catch(() => undefined);
    if (error instanceof SupplierAdapterError) throw error;
    const activeChallenge = page ? await activeEmersonChallenge(page).catch(() => null) : null;
    throw new SupplierAdapterError(input.supplierId, activeChallenge ?? "login_failed", "Emerson saved account sign-in could not be completed",
      activeChallenge === "two_factor_required" ? "mfa_required" : activeChallenge ? "challenge_required" : phase);
  } finally {
    progress("browser_close");
    await browser.close().catch(() => undefined);
    progress(failed ? "failed" : "complete");
  }
}

type EmersonDialogCategory = "none" | "login_form" | "cookie_privacy" | "legal_terms" | "two_factor_required" | "verification_required" | "unknown" | "unavailable";
type EmersonCookieButtonClass = "none" | "reject_all" | "reject_optional" | "necessary_only" | "accept_necessary";
const EMERSON_COOKIE_CHOICES: Array<{ buttonClass: EmersonCookieButtonClass; name: string }> = [
  { buttonClass: "reject_all", name: "Reject all" }, { buttonClass: "reject_optional", name: "Reject optional cookies" },
  { buttonClass: "necessary_only", name: "Use necessary cookies only" }, { buttonClass: "accept_necessary", name: "Accept necessary cookies" },
];
const EMERSON_DIALOG_PATTERNS: Array<{ category: EmersonDialogCategory; pattern: string }> = [
  { category: "two_factor_required", pattern: "\\b(two.factor|2fa|mfa|verification code|authenticator code|one.time (?:code|passcode))\\b" },
  { category: "verification_required", pattern: "complete (?:the )?captcha|captcha (?:challenge|required)|verify (?:that )?you are human|i.m not a robot|unusual traffic" },
  { category: "legal_terms", pattern: "\\b(?:i\\s+(?:agree|accept)|(?:must|required to)\\s+(?:agree|accept)|accept\\s+(?:the\\s+|our\\s+)?(?:terms|agreement)|agree to\\s+(?:the\\s+|our\\s+)?(?:terms|conditions)|(?:user|license|reseller|purchase) agreement)\\b" },
  { category: "cookie_privacy", pattern: "\\bcookies?\\b|\\bprivacy (?:choices|preferences|settings|consent)\\b" },
];
export function emersonLoginDialogCategory(text: string): EmersonDialogCategory {
  return EMERSON_DIALOG_PATTERNS.find(rule => new RegExp(rule.pattern, "i").test(text))?.category ?? "unknown";
}
async function inspectEmersonLoginDialog(page: import("playwright").Page): Promise<{
  category: EmersonDialogCategory; buttonClass: EmersonCookieButtonClass; visibleDialog: boolean;
  dialog?: import("playwright").Locator; button?: import("playwright").Locator;
}> {
  // One bounded DOM read; raw dialog text/button labels stay inside this browser callback.
  const observation = await page.locator("body").evaluate((body, input) => {
    const shown = (element: Element) => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== "hidden"
      && !element.closest('[hidden], [aria-hidden="true"], [inert]');
    const dialogs = [...body.ownerDocument.querySelectorAll('[role="dialog"], dialog')].filter(shown);
    const separate = dialogs.filter(dialog => !(dialog.querySelector("#email") && dialog.querySelector("#password")));
    if (!separate.length) return { category: dialogs.length ? "login_form" as const : "none" as const, buttonClass: "none" as const, visibleDialog: dialogs.length > 0 };
    if (separate.length !== 1) return { category: "unknown" as const, buttonClass: "none" as const, visibleDialog: true };
    const dialog = separate[0], text = (dialog as HTMLElement).innerText;
    const category = input.patterns.find(rule => new RegExp(rule.pattern, "i").test(text))?.category ?? "unknown";
    let buttonClass: EmersonCookieButtonClass = "none";
    if (category === "cookie_privacy") for (const choice of input.choices) {
      const buttons = [...dialog.querySelectorAll('button, [role="button"]')].filter(element => shown(element)
        && (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().replace(/\s+/g, " ").toLowerCase() === choice.name.toLowerCase());
      if (buttons.length === 1) { buttonClass = choice.buttonClass; break; }
    }
    return { category, buttonClass, visibleDialog: true };
  }, { patterns: EMERSON_DIALOG_PATTERNS, choices: EMERSON_COOKIE_CHOICES }, { timeout: 10_000 });
  const choice = EMERSON_COOKIE_CHOICES.find(value => value.buttonClass === observation.buttonClass);
  if (!choice) return observation;
  const dialog = page.getByRole("dialog").filter({ hasNot: page.locator("#email") });
  return { ...observation, dialog, button: dialog.getByRole("button", { name: new RegExp(`^${choice.name}$`, "i") }) };
}
async function resolveEmersonCookieDialog(page: import("playwright").Page, supplierId: string): Promise<void> {
  const state = await inspectEmersonLoginDialog(page);
  if (state.category === "none" || state.category === "login_form") return;
  // Only fixed categories are logged. Dialog text and accessible names never leave the browser.
  console.info("[supplier-auth-dialog]", JSON.stringify({ category: state.category, buttonClass: state.buttonClass }));
  if (state.category === "two_factor_required" || state.category === "verification_required") {
    throw new SupplierAdapterError(supplierId, state.category, "Emerson account verification is required",
      state.category === "two_factor_required" ? "mfa_required" : "challenge_required");
  }
  if (state.category !== "cookie_privacy" || !state.button || !state.dialog) {
    throw new SupplierAdapterError(supplierId, "login_failed", "Emerson has an unresolved separate dialog", "login_form_unavailable");
  }
  assertSafeEmersonUrl(page.url(), supplierId);
  const challenge = await activeEmersonChallenge(page);
  if (challenge) throw new SupplierAdapterError(supplierId, challenge, "Emerson account verification is required");
  await state.button.click({ timeout: 10_000, noWaitAfter: true });
  await state.dialog.waitFor({ state: "hidden", timeout: 10_000 });
  assertSafeEmersonUrl(page.url(), supplierId);
}

async function visibleEmersonLoginField(page: import("playwright").Page, label: RegExp, legacyId: string, timeout = 10_000) {
  const semantic = page.getByLabel(label), legacy = page.locator(legacyId);
  await Promise.any([semantic.waitFor({ state: "visible", timeout }), legacy.waitFor({ state: "visible", timeout })]);
  if (await legacy.count() === 1 && await legacy.isVisible().catch(() => false)) return legacy;
  if (await semantic.count() === 1 && await semantic.isVisible().catch(() => false)) return semantic;
  throw new SupplierAdapterError("emerson-ecologics", "login_failed", "Emerson observed sign-in field is not visible", "login_form_unavailable");
}

/** Failure-only structure diagnostics. Never log page text, field values, URLs, account IDs or provider errors. */
async function logEmersonLoginFailure(page: import("playwright").Page | undefined, phase: SupplierAuthIssue, errorKind: SupplierAdapterError["kind"],
  operation: EmersonLoginOperation, failureCategory: EmersonLoginFailureCategory, controls?: EmersonLoginControls,
  expected?: { username: string; password: string }) {
  const present = async (locator: () => import("playwright").Locator) => {
    try { return Boolean(page) && await locator().count() > 0; } catch { return false; }
  };
  const visible = async (locator: () => import("playwright").Locator) => {
    try { return Boolean(page) && await locator().isVisible(); } catch { return false; }
  };
  const enabled = async (control?: import("playwright").Locator) => control ? control.isEnabled({ timeout: 1_000 }).catch(() => null) : false;
  const editable = async (control?: import("playwright").Locator) => control ? control.isEditable({ timeout: 1_000 }).catch(() => null) : false;
  let pageKind = "unavailable";
  try {
    const path = new URL(page!.url()).pathname;
    pageKind = /^\/(?:emerson\/)?login\/?$/i.test(path) ? "login" : /^\/shop\/?$/i.test(path) ? "shop"
      : /^\/products\/detail\//i.test(path) ? "product" : /^\/emerson\/?$/i.test(path) ? "emerson_entry" : "other";
  } catch { /* No untrusted URL is logged. */ }
  const pageText = page ? await page.locator("body").innerText({ timeout: 2_000 }).catch(() => null) : null;
  const inputMatches = async (field: import("playwright").Locator | undefined, value: string | undefined) => field && value !== undefined
    ? field.inputValue({ timeout: 1_000 }).then(actual => actual === value).catch(() => null) : null;
  const nativeValidity = async (field?: import("playwright").Locator) => field ? field.evaluate(element => {
    if (!(element instanceof HTMLInputElement)) return null;
    return { valid: element.validity.valid, requiredMissing: element.validity.valueMissing, typeMismatch: element.validity.typeMismatch,
      patternMismatch: element.validity.patternMismatch, formValid: element.form ? !element.form.querySelector(":invalid") : null };
  }, undefined, { timeout: 1_000 }).catch(() => null) : null;
  const [emailMatchesExpected, passwordMatchesExpected, emailNativeValidity, passwordNativeValidity, signInState, dialogState] = await Promise.all([
    inputMatches(controls?.email, expected?.username), inputMatches(controls?.password, expected?.password),
    nativeValidity(controls?.email), nativeValidity(controls?.password),
    controls?.signIn ? controls.signIn.evaluate(element => ({ focused: element === element.ownerDocument.activeElement,
      associatedWithForm: element instanceof HTMLButtonElement && Boolean(element.form),
      submitButton: element instanceof HTMLButtonElement && element.type === "submit" }), undefined, { timeout: 1_000 }).catch(() => null) : null,
    page ? inspectEmersonLoginDialog(page).catch(() => ({ category: "unavailable" as const, buttonClass: "none" as const, visibleDialog: null })) : null,
  ]);
  const bodyLength = pageText?.length ?? null;
  console.warn("[supplier-auth] Emerson sign-in failed", { phase, errorKind, operation, failureCategory, pageKind, bodyLength,
    emailMatchesExpected, passwordMatchesExpected, emailNativeValidity, passwordNativeValidity, signInState, visibleDialog: dialogState?.visibleDialog ?? null,
    dialogCategory: dialogState?.category ?? "unavailable", dialogButtonClass: dialogState?.buttonClass ?? "none",
    pageErrorCategory: pageText === null ? "unavailable" : emersonLoginPageErrorCategory(pageText),
    bodyPresent: await present(() => page!.locator("body")),
    emailLabelPresent: await present(() => page!.getByLabel(/^Email\s*\*?$/i)),
    passwordLabelPresent: await present(() => page!.getByLabel(/^Password\s*\*?$/i)),
    legacyEmailPresent: await present(() => page!.locator("#email")),
    legacyPasswordPresent: await present(() => page!.locator("#password")),
    signInButtonPresent: await present(() => page!.getByRole("button", { name: /^Sign\s*in$/i })),
    emailFieldVisible: await visible(() => page!.getByLabel(/^Email\s*\*?$/i)) || await visible(() => page!.locator("#email")),
    passwordFieldVisible: await visible(() => page!.getByLabel(/^Password\s*\*?$/i)) || await visible(() => page!.locator("#password")),
    signInButtonVisible: await visible(() => page!.getByRole("button", { name: /^Sign\s*in$/i })),
    emailEnabled: await enabled(controls?.email), emailEditable: await editable(controls?.email),
    passwordEnabled: await enabled(controls?.password), passwordEditable: await editable(controls?.password),
    signInEnabled: await enabled(controls?.signIn),
  });
}

export function emersonLoginPageErrorCategory(text: string): "none" | "credentials_rejected" | "field_validation" | "generic_provider_error"
  | "two_factor_required" | "verification_required" {
  const challenge = emersonChallengeCode(text);
  if (challenge) return challenge;
  if (/invalid (?:email|username|password|credentials)|incorrect (?:email|username|password|credentials)|(?:email|username) and password (?:do not|don.t) match/i.test(text)) return "credentials_rejected";
  if (/this field is required|please enter (?:a valid )?(?:email(?: address)?|password)|password must (?:contain|be|have)/i.test(text)) return "field_validation";
  if (/something went wrong|unable to (?:sign|log) in|could not (?:sign|log) in|error (?:signing|logging) in|unexpected error|please try again/i.test(text)) return "generic_provider_error";
  return "none";
}

export function emersonChallengeCode(text: string, visibleChallenge = false): "two_factor_required" | "verification_required" | null {
  if (/\b(two.factor|2fa|mfa|verification code|authenticator code|one.time (?:code|passcode))\b/i.test(text)) return "two_factor_required";
  if (visibleChallenge || /complete (?:the )?captcha|captcha (?:challenge|required)|verify (?:that )?you are human|i.m not a robot|unusual traffic/i.test(text)) return "verification_required";
  return null;
}

export async function activeEmersonChallenge(page: import("playwright").Page) {
  const text = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
  let visibleChallenge = false;
  for (const frame of await page.locator('iframe[title*="challenge" i], iframe[title*="verification" i]').all()) {
    if (await frame.isVisible().catch(() => false)) visibleChallenge = true;
  }
  const checkboxes = page.frameLocator('iframe[title="reCAPTCHA"]').getByRole("checkbox");
  if (await checkboxes.isVisible().catch(() => false)) visibleChallenge = true;
  return emersonChallengeCode(text, visibleChallenge);
}

/** Read-only account proof shared by login confirmation and reusable-session checks. */
export function createEmersonAccountVerifier(page: import("playwright").Page, supplierId: string): () => Promise<boolean> {
  let currentMenuOpened = false;
  return async () => {
    assertSafeEmersonUrl(page.url(), supplierId);
    const challenge = await activeEmersonChallenge(page);
    if (challenge) throw new SupplierAdapterError(supplierId, challenge, "Emerson account verification is required");
    if (requiresSignIn("", page.url())) return false;
    // Compatibility with the earlier observed authenticated header, not a generic profile icon.
    if (await page.locator('[aria-label="Account Dropdown"]').first().isVisible().catch(() => false)) return true;
    const toggle = page.getByRole("button", { name: "Toggle profile account settings", exact: true });
    if (!(await toggle.isVisible().catch(() => false))) return false;
    const profileText = await toggle.innerText({ timeout: 2_000 }).catch(() => "");
    if (/\bundefined\b/i.test(profileText)) return false;
    const account = page.locator('a[href="/account"]').first();
    const signOut = page.locator('a[href="/logout?scope=emerson-logout"]').first();
    const menuVerified = async () => await account.isVisible().catch(() => false) && await signOut.isVisible().catch(() => false);
    if (await menuVerified()) return true;
    if (currentMenuOpened) return false;
    currentMenuOpened = true;
    // Opening the observed profile menu is the only click; never follow its account/logout/order links.
    await toggle.click({ noWaitAfter: true, timeout: 5_000 });
    assertSafeEmersonUrl(page.url(), supplierId);
    if (requiresSignIn("", page.url())) return false;
    const menuChallenge = await activeEmersonChallenge(page);
    if (menuChallenge) throw new SupplierAdapterError(supplierId, menuChallenge, "Emerson account verification is required");
    await account.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
    await signOut.waitFor({ state: "visible", timeout: 2_000 }).catch(() => undefined);
    return menuVerified();
  };
}

export async function readRenderedEmersonCatalog(
  catalogUrl: string,
  cookieHeader: string,
  supplierId: string,
  launchBrowser: typeof launchSupplierBrowser = launchSupplierBrowser,
): Promise<{ responseUrl: string; records: Record<string, unknown>[] }> {
  const progress = emersonAuthProgress("session_probe");
  progress("start");
  assertSafeEmersonUrl(catalogUrl, supplierId);
  progress("browser_launch");
  const browser = await launchEmersonBrowser(supplierId, launchBrowser).catch(error => { progress("failed"); throw error; });
  let phase: SupplierAuthIssue = "browser_context_failed";
  let page: import("playwright").Page | undefined;
  let failed = false;
  try {
    progress("browser_context");
    const browserContext = await browser.newContext();
    await browserContext.addCookies(emersonSessionCookies(cookieHeader));
    const catalogPage = await browserContext.newPage();
    page = catalogPage;
    phase = "supplier_page_unavailable";
    progress("page_navigation");
    await catalogPage.goto(catalogUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    assertSafeEmersonUrl(catalogPage.url(), supplierId);
    phase = "existing_session_unverified";
    progress("account_observation");

    const verifyAccount = createEmersonAccountVerifier(catalogPage, supplierId);
    if (!requiresSignIn("", catalogPage.url())) {
      await Promise.any([
        catalogPage.locator('[aria-label="Account Dropdown"]').first().waitFor({ state: "visible", timeout: 30_000 }),
        catalogPage.getByRole("button", { name: "Toggle profile account settings", exact: true }).waitFor({ state: "visible", timeout: 30_000 }),
        catalogPage.locator('a[href="/login"]:visible').filter({ hasText: /^\s*Sign in\s*$/i }).first().waitFor({ state: "visible", timeout: 30_000 }),
        catalogPage.locator('input[type="password"]').first().waitFor({ state: "visible", timeout: 30_000 }),
      ]).catch(() => undefined);
    }
    if (!(await verifyAccount())) {
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
    progress("catalog_readback");
    await productLinks.first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    const records = await catalogPage.$$eval('a[data-testid="go-to-pdp"]', renderedEmersonRecords);
    return { responseUrl: catalogPage.url(), records };
  } catch (error) {
    failed = true;
    progress("failure_diagnostics");
    if (error instanceof SupplierAdapterError) throw error;
    const challenge = page ? await activeEmersonChallenge(page).catch(() => null) : null;
    throw new SupplierAdapterError(supplierId, challenge ?? "login_failed", "Emerson account session could not be checked",
      challenge === "two_factor_required" ? "mfa_required" : challenge ? "challenge_required" : phase);
  } finally {
    progress("browser_close");
    await browser.close().catch(() => undefined);
    progress(failed ? "failed" : "complete");
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

export function emersonSessionCookies(cookieHeader: string) {
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
