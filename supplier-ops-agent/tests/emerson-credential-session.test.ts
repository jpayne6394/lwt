import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { signInEmersonWithCredentials, readRenderedEmersonCatalog, EmersonSessionExpiredError, createEmersonAccountVerifier } from "../src/suppliers/emerson-catalog-adapter.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";

const input = { username: "private-account", password: "private-password", supplierId: "emerson-ecologics" };

function browserHarness(options: { beforeText?: string; afterText?: string; redirect?: string;
  challengeFrame?: boolean; checkbox?: boolean; failure?: Error; accountMarker?: boolean;
  contextFailure?: Error; navigationFailure?: Error; emptyCookies?: boolean; closeFailure?: Error;
  currentProfile?: boolean; accountLink?: boolean; signOutLink?: boolean; signedIn?: boolean; stayOnLogin?: boolean;
  semanticLabels?: boolean; legacyFields?: boolean; emailMissing?: boolean; passwordMissing?: boolean; signInMissing?: boolean; profileText?: string;
  failureAt?: "fill_email" | "fill_password" | "press_sign_in"; emailEnabled?: boolean; emailEditable?: boolean;
  passwordEnabled?: boolean; passwordEditable?: boolean; signInEnabled?: boolean; beforeSubmitChallenge?: string;
  signInEnabledAfter?: number; signInReadinessTimeouts?: number } = {}) {
  const events: string[] = [];
  let submitted = Boolean(options.signedIn), menuOpened = false, passwordFilled = false;
  let readinessChecks = 0;
  let url = options.signedIn ? "https://www.emersonecologics.com/shop" : "about:blank";
  const visible = (selector: string) => {
    if (selector === "body") return true;
    if (selector === "#email") return options.legacyFields !== false && !options.emailMissing;
    if (selector === "#password") return options.legacyFields !== false && !options.passwordMissing;
    if (selector === "label:Email") return Boolean(options.semanticLabels) && !options.emailMissing;
    if (selector === "label:Password") return Boolean(options.semanticLabels) && !options.passwordMissing;
    if (selector === '[aria-label="Account Dropdown"]') return submitted && !options.currentProfile && options.accountMarker !== false;
    if (selector === 'a[href="/account"]') return submitted && menuOpened && options.accountLink !== false;
    if (selector === 'a[href="/logout?scope=emerson-logout"]') return submitted && menuOpened && options.signOutLink !== false;
    return false;
  };
  const locator = (selector: string) => ({
    fill: async (value: string) => {
      const email = selector === "#email" || selector === "label:Email";
      assert(email || selector === "#password" || selector === "label:Password");
      assert((visible("#email") || visible("label:Email")) && (visible("#password") || visible("label:Password")), "both fields must be ready before either fill");
      assert.equal(value, email ? input.username : input.password);
      events.push(`fill:${selector}`);
      if (options.failure && (options.failureAt ?? "fill_email") === (email ? "fill_email" : "fill_password")) throw options.failure;
      if (!email) passwordFilled = true;
    },
    count: async () => visible(selector) ? 1 : 0,
    isVisible: async () => visible(selector),
    isEnabled: async () => /email$/i.test(selector) ? options.emailEnabled !== false : options.passwordEnabled !== false,
    isEditable: async () => /email$/i.test(selector) ? options.emailEditable !== false : options.passwordEditable !== false,
    waitFor: async () => { if (!visible(selector)) throw new Error("observed field not visible"); },
    innerText: async () => submitted ? options.afterText ?? "Account" : passwordFilled && options.beforeSubmitChallenge
      ? options.beforeSubmitChallenge : options.beforeText ?? "This page is protected by reCAPTCHA, and subject to Google Privacy Policy and Terms of Service.",
    first: () => ({ isVisible: async () => visible(selector), waitFor: async () => { if (!visible(selector)) throw new Error("not visible"); } }),
    all: async () => options.challengeFrame ? [{ isVisible: async () => true }] : [],
  });
  const page = {
    goto: async (target: string) => {
      events.push(`goto:${target}`); url = options.redirect ?? target;
      if (options.navigationFailure) throw options.navigationFailure;
    },
    url: () => url,
    locator,
    getByLabel: (label: RegExp) => {
      if (label.test("Email *")) return locator("label:Email");
      assert(label.test("Password*")); return locator("label:Password");
    },
    frameLocator: () => ({ getByRole: () => ({ isVisible: async () => Boolean(options.checkbox) }) }),
    getByRole: (role: string, settings: { name: string | RegExp; exact?: boolean }) => {
      if (settings.name === "Toggle profile account settings") return {
        isVisible: async () => submitted && Boolean(options.currentProfile),
        waitFor: async () => { if (!(submitted && options.currentProfile)) throw new Error("toggle absent"); },
        innerText: async () => options.profileText ?? "Account profile",
        click: async () => { assert(submitted && options.currentProfile); menuOpened = true; events.push("click:profile-menu"); },
      };
      assert.equal(role, "button"); assert(settings.name instanceof RegExp && settings.name.test("Sign in") && settings.name.test("Signin") && !settings.name.test("Place order"));
      return { count: async () => options.signInMissing ? 0 : 1, isVisible: async () => !options.signInMissing,
        isEnabled: async () => {
          if (passwordFilled) {
            readinessChecks++;
            if (readinessChecks <= (options.signInReadinessTimeouts ?? 0)) throw Object.assign(new Error("private transient locator lookup timed out"), { name: "TimeoutError" });
            if (readinessChecks < (options.signInEnabledAfter ?? 1)) return false;
          }
          return options.signInEnabled !== false;
        },
        waitFor: async () => { if (options.signInMissing) throw new Error("sign-in button missing"); },
        click: async () => { assert.fail("pointer submission must not be attempted"); },
        press: async (key: string, settings: unknown) => {
          assert.equal(key, "Enter"); assert.deepEqual(settings, { noWaitAfter: true, timeout: 10_000 });
          events.push("press:Enter:Sign in"); if (options.failure && options.failureAt === "press_sign_in") throw options.failure;
          submitted = true; url = options.stayOnLogin ? "https://www.emersonecologics.com/login" : "https://www.emersonecologics.com/shop";
        } };
    },
    $$eval: async () => [],
  };
  const browser = {
    newContext: async () => {
      if (options.contextFailure) throw options.contextFailure;
      return { addCookies: async () => undefined, newPage: async () => page, cookies: async (urls: string[]) => {
      assert.deepEqual(urls, ["https://emersonecologics.com/", "https://www.emersonecologics.com/"]);
      events.push("read-verified-session");
      return options.emptyCookies ? [] : [{ domain: ".emersonecologics.com", name: "session", value: "private-renewed-cookie" },
        { domain: "attacker.invalid", name: "unrelated", value: "not-allowed" }];
    } }; },
    close: async () => { events.push("browser-closed"); if (options.closeFailure) throw options.closeFailure; },
  } as unknown as Browser;
  return { events, launch: async () => browser, page: page as unknown as Page, readinessChecks: () => readinessChecks };
}

test("routine Emerson login uses only the observed form and returns the verified supplier-scoped session", async () => {
  const harness = browserHarness();
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:#password",
    "press:Enter:Sign in", "read-verified-session", "browser-closed"]);
  assert.doesNotMatch(JSON.stringify(harness.events), /private|cart|checkout|payment|order/);
});

test("semantic Email*/Password* labels work when the legacy field IDs are absent", async () => {
  const harness = browserHarness({ semanticLabels: true, legacyFields: false });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:label:Email", "fill:label:Password",
    "press:Enter:Sign in", "read-verified-session", "browser-closed"]);
});

test("a disabled sign-in button cannot receive Enter even when visible and both fields filled", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  const harness = browserHarness({ signInEnabled: false });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
    (error: unknown) => error instanceof SupplierAdapterError && error.authIssue === "login_form_unavailable");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:#password", "browser-closed"]);
});

test("brief post-fill validation disablement waits for positive readiness and submits Enter exactly once", async () => {
  const harness = browserHarness({ signInEnabledAfter: 3 });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.equal(harness.readinessChecks(), 3);
  assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
  assert.equal(harness.events.filter(event => event.startsWith("fill:")).length, 2);
});

test("a transient readiness lookup timeout is observed again without refilling or resubmitting", async () => {
  const harness = browserHarness({ signInReadinessTimeouts: 1 });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.equal(harness.readinessChecks(), 2);
  assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
  assert.equal(harness.events.filter(event => event.startsWith("fill:")).length, 2);
});

test("a challenge appearing during form entry stops before the single initial keyboard submission", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  const harness = browserHarness({ beforeSubmitChallenge: "Verify you are human" });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
    (error: unknown) => error instanceof SupplierAdapterError && error.kind === "verification_required");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:#password", "browser-closed"]);
});

test("both fields and the observed sign-in button must be ready before any credential is filled", async (context) => {
  context.mock.method(console, "warn", () => undefined);
  for (const missing of [{ emailMissing: true }, { passwordMissing: true }, { signInMissing: true }]) {
    const harness = browserHarness({ semanticLabels: true, ...missing });
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
      (error: unknown) => error instanceof SupplierAdapterError && error.authIssue === "login_form_unavailable");
    assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "browser-closed"]);
  }
});

test("failure-only form diagnostics log fixed structure and path classes, never private page text or query values", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  const harness = browserHarness({ semanticLabels: true, legacyFields: false, passwordMissing: true,
    redirect: "https://www.emersonecologics.com/login?account=private-account&token=private-cookie",
    beforeText: "private-account private-password private-cookie" });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch));
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], ["[supplier-auth] Emerson sign-in failed", {
    phase: "login_form_unavailable", errorKind: "login_failed", operation: "readiness", failureCategory: "other",
    pageKind: "login", bodyLength: "private-account private-password private-cookie".length, bodyPresent: true,
    emailLabelPresent: true, passwordLabelPresent: false, legacyEmailPresent: false, legacyPasswordPresent: false,
    signInButtonPresent: true, emailFieldVisible: true, passwordFieldVisible: false, signInButtonVisible: true,
    emailEnabled: false, emailEditable: false, passwordEnabled: false, passwordEditable: false, signInEnabled: false,
  }]);
  assert.doesNotMatch(JSON.stringify(logs), /private|https:|token=|account=/);
  logs.length = 0;
  await signInEmersonWithCredentials(input, browserHarness().launch);
  assert.equal(logs.length, 0, "success must not emit failure diagnostics");
});

test("original action failures retain exact controlled operation and category before error sanitization", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  const failure = (message: string, name = "Error") => Object.assign(new Error(`private-password private-account ${message}`), { name });
  for (const [failureAt, error, category] of [
    ["fill_email", failure("Element is not editable"), "element_not_editable"],
    ["fill_password", failure("locator.fill timed out", "TimeoutError"), "timeout"],
    ["press_sign_in", failure("another element intercepts pointer events", "TimeoutError"), "pointer_intercepted"],
    ["fill_password", failure("Element is detached from the DOM", "TimeoutError"), "element_detached"],
    ["press_sign_in", failure("Target page, context or browser has been closed"), "page_closed"],
    ["fill_email", failure("unexpected provider message"), "other"],
  ] as const) {
    logs.length = 0;
    const harness = browserHarness({ failure: error, failureAt });
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
      (error: unknown) => error instanceof SupplierAdapterError && error.authIssue === "login_form_unavailable");
    assert.equal(logs.length, 1);
    const data = logs[0][1] as Record<string, unknown>;
    assert.equal(data.operation, failureAt);
    assert.equal(data.failureCategory, category);
    assert.equal(data.emailEnabled, true); assert.equal(data.emailEditable, true);
    assert.equal(data.passwordEnabled, true); assert.equal(data.passwordEditable, true); assert.equal(data.signInEnabled, true);
    assert.doesNotMatch(JSON.stringify(logs), /private|https:|locator\.fill|intercepts pointer/);
    assert.equal(harness.events.filter((event) => event === "press:Enter:Sign in").length, failureAt === "press_sign_in" ? 1 : 0);
  }
});

test("failed action diagnostics report enabled/editable state without reading credential values", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  const failure = Object.assign(new Error("private-provider timeout"), { name: "TimeoutError" });
  const harness = browserHarness({ failure, failureAt: "press_sign_in", emailEnabled: true, emailEditable: false,
    passwordEnabled: false, passwordEditable: false, signInEnabled: true });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch));
  const data = logs[0][1] as Record<string, unknown>;
  assert.equal(data.operation, "press_sign_in"); assert.equal(data.failureCategory, "timeout");
  assert.equal(data.emailEnabled, true); assert.equal(data.emailEditable, false);
  assert.equal(data.passwordEnabled, false); assert.equal(data.passwordEditable, false); assert.equal(data.signInEnabled, true);
  assert.doesNotMatch(JSON.stringify(logs), /private|value|password=/);
});

test("current Emerson profile menu proves the renewed account using both exact account and sign-out links", async () => {
  const harness = browserHarness({ currentProfile: true });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:#password",
    "press:Enter:Sign in", "click:profile-menu", "read-verified-session", "browser-closed"]);
});

test("reusable-session reader uses the same current profile-menu account proof", async () => {
  const harness = browserHarness({ currentProfile: true, signedIn: true });
  const result = await readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-cookie", input.supplierId, harness.launch);
  assert.deepEqual(result, { responseUrl: "https://www.emersonecologics.com/shop", records: [] });
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/shop", "click:profile-menu", "browser-closed"]);
});

test("a profile toggle without both current account links never authenticates or repeatedly toggles", async () => {
  for (const missing of [{ accountLink: false }, { signOutLink: false }, { accountLink: false, signOutLink: false }]) {
    const harness = browserHarness({ currentProfile: true, signedIn: true, ...missing });
    const verifyAccount = createEmersonAccountVerifier(harness.page, input.supplierId);
    assert.equal(await verifyAccount(), false);
    assert.equal(await verifyAccount(), false);
    assert.deepEqual(harness.events, ["click:profile-menu"]);
  }
});

test("the observed undefined profile placeholder fails closed even when generic menu links exist", async () => {
  const harness = browserHarness({ currentProfile: true, signedIn: true, profileText: "undefined\nundefined" });
  const verifyAccount = createEmersonAccountVerifier(harness.page, input.supplierId);
  assert.equal(await verifyAccount(), false);
  assert.equal(await verifyAccount(), false);
  assert.deepEqual(harness.events, []);
});

test("login pages cannot verify through stale header markers and no logout/account/order link is followed", async () => {
  for (const currentProfile of [true, false]) {
    const harness = browserHarness({ currentProfile, signedIn: true, redirect: "https://www.emersonecologics.com/login" });
    await harness.page.goto("https://www.emersonecologics.com/login");
    assert.equal(await createEmersonAccountVerifier(harness.page, input.supplierId)(), false);
    assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login"]);
  }
});

test("actual challenges still take precedence over current and legacy account markers", async () => {
  for (const [afterText, kind] of [["Enter verification code", "two_factor_required"], ["Complete the CAPTCHA", "verification_required"]] as const) {
    for (const currentProfile of [true, false]) {
      const harness = browserHarness({ currentProfile, signedIn: true, afterText });
      await assert.rejects(createEmersonAccountVerifier(harness.page, input.supplierId)(),
        (error: unknown) => error instanceof SupplierAdapterError && error.kind === kind);
      assert.deepEqual(harness.events, []);
    }
  }
});

test("visible supplier CAPTCHA task or checkbox stops before credentials or clicks", async () => {
  for (const options of [{ challengeFrame: true }, { checkbox: true }, { beforeText: "Verify you are human" }]) {
    const harness = browserHarness(options);
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
      (error: unknown) => error instanceof SupplierAdapterError && error.kind === "verification_required");
    assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "browser-closed"]);
  }
});

test("supplier MFA after normal sign-in is handed off without reading a session or repeating the submission", async () => {
  const harness = browserHarness({ afterText: "Enter verification code", accountMarker: false });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch),
    (error: unknown) => error instanceof SupplierAdapterError && error.kind === "two_factor_required");
  assert.equal(harness.events.filter((event) => event === "press:Enter:Sign in").length, 1);
  assert.equal(harness.events.includes("read-verified-session"), false);
  assert.equal(harness.events.at(-1), "browser-closed");
});

test("rejected credentials and browser errors never expose private provider text", async () => {
  for (const options of [{ afterText: "Invalid credentials private-account", accountMarker: false },
    { failure: new Error("private-password and private-cookie from provider") }]) {
    const harness = browserHarness(options);
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), (error: unknown) => {
      assert(error instanceof SupplierAdapterError); assert.equal(error.kind, "login_failed");
      assert.equal(error.authIssue, "afterText" in options ? "credentials_rejected" : "login_form_unavailable");
      assert.doesNotMatch(error.message, /private/); return true;
    });
    assert.equal(harness.events.includes("read-verified-session"), false);
    assert.equal(harness.events.at(-1), "browser-closed");
  }
});

test("launch, browser context, navigation and session failures have distinct safe diagnostic reasons", async () => {
  const privateError = new Error("private-password private-cookie https://private.invalid/account");
  const launchFailure = async (): Promise<Browser> => { throw privateError; };
  for (const invoke of [
    () => signInEmersonWithCredentials(input, launchFailure),
    () => readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-cookie", input.supplierId, launchFailure),
  ]) {
    await assert.rejects(invoke(), (error: unknown) => {
      assert(error instanceof SupplierAdapterError);
      assert.equal(error.authIssue, "browser_launch_failed");
      assert.doesNotMatch(JSON.stringify(error), /private/);
      return true;
    });
  }
  for (const [options, issue] of [
    [{ contextFailure: privateError }, "browser_context_failed"],
    [{ navigationFailure: privateError }, "supplier_page_unavailable"],
    [{ failure: privateError, closeFailure: privateError }, "login_form_unavailable"],
    [{ emptyCookies: true }, "renewed_session_unverified"],
  ] as const) {
    const harness = browserHarness(options);
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), (error: unknown) => {
      assert(error instanceof SupplierAdapterError); assert.equal(error.authIssue, issue);
      assert.doesNotMatch(error.message, /private|https:/); return true;
    });
    assert.equal(harness.events.at(-1), "browser-closed");
  }
});

test("a missing post-login account marker does not falsely claim credentials were rejected", async (context) => {
  const harness = browserHarness({ afterText: "Welcome", accountMarker: false });
  let reads = 0;
  context.mock.method(Date, "now", () => !harness.events.includes("press:Enter:Sign in") ? 0 : reads++ === 0 ? 0 : 20_000);
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch), (error: unknown) => {
    assert(error instanceof SupplierAdapterError); assert.equal(error.authIssue, "login_confirmation_missing"); return true;
  });
  assert.equal(harness.events.filter((event) => event === "press:Enter:Sign in").length, 1);
  assert.equal(harness.events.includes("read-verified-session"), false);
});

test("redirected login never types credentials into an unapproved host or purchasing route", async () => {
  for (const redirect of ["https://attacker.invalid/login", "https://www.emersonecologics.com/checkout", "https://www.emersonecologics.com/cart"]) {
    const harness = browserHarness({ redirect });
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
    assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "browser-closed"]);
  }
});

function publicCatalogHarness(options: { visibleSignIn: boolean; pageText?: string }) {
  let closed = false;
  const page = {
    goto: async () => undefined,
    url: () => "https://www.emersonecologics.com/shop",
    locator: (selector: string) => ({
      first: () => ({ waitFor: async () => { throw new Error("marker absent"); }, isVisible: async () => false }),
      innerText: async () => options.pageText ?? "This page is protected by reCAPTCHA.",
      all: async () => selector === 'a[href="/login"]'
        ? [{ isVisible: async () => options.visibleSignIn, innerText: async () => "Sign in" }] : [],
    }),
    frameLocator: () => ({ getByRole: () => ({ isVisible: async () => false }) }),
    getByRole: () => ({ waitFor: async () => { throw new Error("current toggle absent"); }, isVisible: async () => false }),
  };
  const browser = { newContext: async () => ({ addCookies: async () => undefined, newPage: async () => page }),
    close: async () => { closed = true; } } as unknown as Browser;
  return { launch: async () => browser, isClosed: () => closed };
}

test("public /shop with a positive visible Sign in /login link proves session expiry", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: true });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch), EmersonSessionExpiredError);
  assert.equal(harness.isClosed(), true);
});

test("absent account marker alone or a hidden Sign in link does not prove an expired session", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: false });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch),
    (error: unknown) => error instanceof SupplierAdapterError && error.kind === "parse_failed"
      && error.authIssue === "existing_session_unverified" && !(error instanceof EmersonSessionExpiredError));
});

test("a real challenge takes precedence over the public Sign in expiry evidence", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: true, pageText: "Enter verification code" });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch),
    (error: unknown) => error instanceof SupplierAdapterError && error.kind === "two_factor_required" && !(error instanceof EmersonSessionExpiredError));
});
