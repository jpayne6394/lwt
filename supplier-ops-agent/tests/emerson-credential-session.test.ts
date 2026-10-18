import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";
import { signInEmersonWithCredentials, readRenderedEmersonCatalog, EmersonSessionExpiredError, createEmersonAccountVerifier,
  EmersonCatalogSupplierAdapter, EMERSON_AUTH_PROGRESS_STAGES, emersonLoginPageErrorCategory } from "../src/suppliers/emerson-catalog-adapter.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";

const input = { username: "private-account", password: "private-password", supplierId: "emerson-ecologics" };

function browserHarness(options: { beforeText?: string; afterText?: string; redirect?: string;
  challengeFrame?: boolean; checkbox?: boolean; failure?: Error; accountMarker?: boolean;
  contextFailure?: Error; navigationFailure?: Error; emptyCookies?: boolean; closeFailure?: Error;
  currentProfile?: boolean; accountLink?: boolean; signOutLink?: boolean; signedIn?: boolean; stayOnLogin?: boolean;
  semanticLabels?: boolean; legacyFields?: boolean; emailMissing?: boolean; passwordMissing?: boolean; signInMissing?: boolean; profileText?: string;
  failureAt?: "fill_email" | "fill_password" | "press_sign_in"; emailEnabled?: boolean; emailEditable?: boolean;
  passwordEnabled?: boolean; passwordEditable?: boolean; signInEnabled?: boolean; beforeSubmitChallenge?: string;
  signInEnabledAfter?: number; signInReadinessTimeouts?: number; emailMatchesExpected?: boolean; nativeValid?: boolean; visibleDialog?: boolean;
  separateDialogText?: string; separateDialogButtons?: string[]; dialogAfterFormReady?: boolean;
  replaceAfterEmail?: boolean; resetEmailFills?: number; replaceEmailWith?: string; resetAfterPassword?: boolean;
  challengeAfterReset?: string; challengeOnFinalRead?: boolean; redirectOnFinalRead?: boolean;
  readFailureAfterEmail?: boolean; readFailuresAfterEmail?: number; changeStateAfterFailure?: boolean; fieldsUneditable?: boolean } = {}) {
  const events: string[] = [];
  const dialogInspectionTimeouts: number[] = [];
  let submitted = Boolean(options.signedIn), menuOpened = false, passwordFilled = false;
  let emailValue = "", passwordValue = "", emailFills = 0, reset = false, failedAction = false;
  let valueReadsAfterEmail = 0;
  let readinessChecks = 0;
  let separateDialogOpen = Boolean(options.separateDialogText) && !options.dialogAfterFormReady;
  let url = options.signedIn ? "https://www.emersonecologics.com/shop" : "about:blank";
  const visible = (selector: string) => {
    if (selector === "body") return true;
    if (selector === "#email") return options.legacyFields !== false && !(options.replaceAfterEmail && emailFills) && !options.emailMissing;
    if (selector === "#password") return options.legacyFields !== false && !(options.replaceAfterEmail && emailFills) && !options.passwordMissing;
    if (selector === "label:Email") return Boolean(options.semanticLabels || options.replaceAfterEmail && emailFills) && !options.emailMissing;
    if (selector === "label:Password") return Boolean(options.semanticLabels || options.replaceAfterEmail && emailFills) && !options.passwordMissing;
    if (selector === '[aria-label="Account Dropdown"]') return submitted && !options.currentProfile && options.accountMarker !== false;
    if (selector === 'a[href="/account"]') return submitted && menuOpened && options.accountLink !== false;
    if (selector === 'a[href="/logout?scope=emerson-logout"]') return submitted && menuOpened && options.signOutLink !== false;
    return false;
  };
  const locator = (selector: string) => ({
    filter: () => locator(selector),
    fill: async (value: string) => {
      assert.equal(separateDialogOpen, false, "no credential may be filled through an unresolved separate dialog");
      const email = selector === "#email" || selector === "label:Email";
      assert(email || selector === "#password" || selector === "label:Password");
      assert((visible("#email") || visible("label:Email")) && (visible("#password") || visible("label:Password")), "both fields must be ready before either fill");
      assert.equal(value, email ? input.username : input.password);
      events.push(`fill:${selector}`);
      if (options.failure && (options.failureAt ?? "fill_email") === (email ? "fill_email" : "fill_password")) { failedAction = true; throw options.failure; }
      if (email) {
        emailFills++; emailValue = value;
        if (emailFills <= (options.resetEmailFills ?? 0)) { emailValue = ""; reset = true; }
        if (options.replaceEmailWith) emailValue = options.replaceEmailWith;
      } else {
        passwordFilled = true; passwordValue = value;
        if (options.resetAfterPassword && !reset) { emailValue = ""; passwordValue = ""; reset = true; }
      }
    },
    count: async () => visible(selector) ? 1 : 0,
    isVisible: async () => visible(selector),
    isEnabled: async () => options.changeStateAfterFailure && !failedAction || (/email$/i.test(selector) ? options.emailEnabled !== false : options.passwordEnabled !== false),
    isEditable: async () => !options.fieldsUneditable && (options.changeStateAfterFailure && !failedAction || (/email$/i.test(selector) ? options.emailEditable !== false : options.passwordEditable !== false)),
    inputValue: async () => {
      if (!visible(selector)) throw new Error("missing observed field");
      if (emailFills) {
        valueReadsAfterEmail++;
        if (options.redirectOnFinalRead && valueReadsAfterEmail >= 8) url = "https://unapproved.invalid/login";
        if (options.readFailureAfterEmail || valueReadsAfterEmail <= (options.readFailuresAfterEmail ?? 0)) throw new Error("private read unavailable");
      }
      return /email$/i.test(selector) ? options.emailMatchesExpected === false && failedAction ? "private-edited-account" : emailValue : passwordValue;
    },
    evaluate: async (_callback: unknown, argument?: { patterns: Array<{ category: string; pattern: string }>; choices: Array<{ buttonClass: string; name: string }> }, settings?: { timeout: number }) => {
      if (selector === "body" && argument) {
        dialogInspectionTimeouts.push(settings?.timeout ?? 0);
        const category = separateDialogOpen ? argument.patterns.find(rule => new RegExp(rule.pattern, "i").test(options.separateDialogText!))?.category ?? "unknown"
          : options.visibleDialog ? "login_form" : "none";
        const choice = category === "cookie_privacy" ? argument.choices.find(choice => options.separateDialogButtons?.some(name => name.toLowerCase() === choice.name.toLowerCase())) : undefined;
        return { category, buttonClass: choice?.buttonClass ?? "none", visibleDialog: separateDialogOpen || Boolean(options.visibleDialog) };
      }
      if (!visible(selector)) throw new Error("missing observed field");
      return { valid: options.nativeValid !== false, requiredMissing: false, typeMismatch: options.nativeValid === false, patternMismatch: false, formValid: options.nativeValid !== false };
    },
    waitFor: async () => { if (!visible(selector)) throw new Error("observed field not visible"); },
    innerText: async () => submitted ? options.afterText ?? "Account" : options.challengeOnFinalRead && valueReadsAfterEmail >= 8 ? "Verify you are human"
      : reset && options.challengeAfterReset ? options.challengeAfterReset : passwordFilled && options.beforeSubmitChallenge
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
    getByRole: (role: string, settings: { name?: string | RegExp; exact?: boolean } = {}) => {
      if (role === "dialog") return { filter: () => ({
        getByRole: (buttonRole: string, button: { name: RegExp }) => ({ click: async () => {
          assert.equal(buttonRole, "button"); assert(separateDialogOpen);
          const matches = options.separateDialogButtons?.filter(name => button.name.test(name)) ?? [];
          assert.equal(matches.length, 1); assert.notEqual(matches[0], "Accept all");
          events.push("click:necessary-cookie-choice"); separateDialogOpen = false;
        } }),
        waitFor: async () => { assert.equal(separateDialogOpen, false); },
      }) };
      if (settings.name === "Toggle profile account settings") return {
        isVisible: async () => submitted && Boolean(options.currentProfile),
        waitFor: async () => { if (!(submitted && options.currentProfile)) throw new Error("toggle absent"); },
        innerText: async () => options.profileText ?? "Account profile",
        click: async () => { assert(submitted && options.currentProfile); menuOpened = true; events.push("click:profile-menu"); },
      };
      assert.equal(role, "button"); assert(settings.name instanceof RegExp && settings.name.test("Sign in") && settings.name.test("Signin") && !settings.name.test("Place order"));
      return { count: async () => options.signInMissing ? 0 : 1, isVisible: async () => !options.signInMissing,
        evaluate: async () => ({ focused: true, associatedWithForm: true, submitButton: true }),
        isEnabled: async () => {
          if (passwordFilled) {
            readinessChecks++;
            if (readinessChecks <= (options.signInReadinessTimeouts ?? 0)) throw Object.assign(new Error("private transient locator lookup timed out"), { name: "TimeoutError" });
            if (readinessChecks < (options.signInEnabledAfter ?? 1)) return false;
          }
          return options.signInEnabled !== false;
        },
        waitFor: async () => {
          if (options.signInMissing) throw new Error("sign-in button missing");
          if (options.dialogAfterFormReady) { events.push("form-ready"); separateDialogOpen = true; }
        },
        click: async () => { assert.fail("pointer submission must not be attempted"); },
        press: async (key: string, settings: unknown) => {
          assert.equal(key, "Enter"); assert.deepEqual(settings, { noWaitAfter: true, timeout: 10_000 });
          assert.equal(emailValue, input.username); assert.equal(passwordValue, input.password);
          events.push("press:Enter:Sign in"); if (options.failure && options.failureAt === "press_sign_in") { failedAction = true; throw options.failure; }
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
  return { events, launch: async () => browser, page: page as unknown as Page, readinessChecks: () => readinessChecks, dialogInspectionTimeouts };
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

test("a form replaced after email entry is reacquired by its visible semantic fields before password entry", async () => {
  const harness = browserHarness({ replaceAfterEmail: true });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:label:Password",
    "press:Enter:Sign in", "read-verified-session", "browser-closed"]);
});

test("one proven pre-submit empty-field reset is normally refilled, verified, and submitted exactly once", async () => {
  for (const options of [{ resetEmailFills: 1 }, { resetAfterPassword: true }]) {
    const harness = browserHarness(options);
    assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
    assert.equal(harness.events.filter(event => event === "fill:#email").length, 2);
    assert.equal(harness.events.filter(event => event === "fill:#password").length, options.resetAfterPassword ? 2 : 1);
    assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
  }
});

test("a second reset or different nonempty email stops without another refill or any submission", async context => {
  context.mock.method(console, "warn", () => undefined);
  for (const options of [{ resetEmailFills: 2 }, { replaceEmailWith: "different-private-account" }]) {
    const harness = browserHarness(options);
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
    assert.equal(harness.events.filter(event => event === "fill:#email").length, options.resetEmailFills ? 2 : 1);
    assert.equal(harness.events.some(event => event.startsWith("press:") || event === "fill:#password"), false);
  }
});

test("a challenge appearing after a reset blocks recovery before any credential refill", async context => {
  context.mock.method(console, "warn", () => undefined);
  const harness = browserHarness({ resetEmailFills: 1, challengeAfterReset: "Enter verification code" });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch), (error: unknown) => error instanceof SupplierAdapterError && error.kind === "two_factor_required");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "browser-closed"]);
});

test("a transient field-read timeout is observed again without refilling or submitting twice", async () => {
  const harness = browserHarness({ readFailuresAfterEmail: 2 });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.equal(harness.events.filter(event => event.startsWith("fill:")).length, 2);
  assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
});

test("a challenge or unapproved redirect during final readback blocks the sole submission", async context => {
  context.mock.method(console, "warn", () => undefined);
  for (const options of [{ challengeOnFinalRead: true }, { redirectOnFinalRead: true }]) {
    const harness = browserHarness(options);
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
    assert.equal(harness.events.filter(event => event.startsWith("fill:")).length, 2);
    assert.equal(harness.events.some(event => event.startsWith("press:")), false);
  }
});

test("unreadable or uneditable fields remain unknown and never trigger a refill or submission", async context => {
  context.mock.method(console, "warn", () => undefined); context.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  for (const options of [{ readFailureAfterEmail: true }, { fieldsUneditable: true }]) {
    const harness = browserHarness(options), pending = assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
    for (let tick = 0; tick < 100; tick++) { await new Promise(resolve => setImmediate(resolve)); context.mock.timers.tick(250); }
    await pending;
    assert.equal(harness.events.filter(event => event === "fill:#email").length, options.fieldsUneditable ? 0 : 1);
    assert.equal(harness.events.some(event => event.startsWith("press:") || event === "fill:#password"), false);
  }
});

test("one recognized necessary-only cookie choice precedes either credential fill, including ordinary ToS links", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "info", (...args: unknown[]) => { logs.push(args); });
  for (const button of ["Reject all", "Reject optional cookies", "Use necessary cookies only", "Accept necessary cookies"]) {
    const harness = browserHarness({ separateDialogText: "We use cookies. Privacy Policy and Terms of Service. private-dialog-content",
      separateDialogButtons: [button, "Accept all"], dialogAfterFormReady: true });
    assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
    const choice = harness.events.indexOf("click:necessary-cookie-choice");
    assert(choice > harness.events.indexOf("form-ready") && choice < harness.events.indexOf("fill:#email"));
    assert.equal(harness.events.filter(event => event === "click:necessary-cookie-choice").length, 1);
    assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
  }
  const dialogLogs = logs.filter(args => args[0] === "[supplier-auth-dialog]").map(args => JSON.parse(args[1] as string));
  assert.equal(dialogLogs.length, 4);
  for (const record of dialogLogs) {
    assert.deepEqual(Object.keys(record).sort(), ["buttonClass", "category"]);
    assert.equal(record.category, "cookie_privacy");
    assert(["reject_all", "reject_optional", "necessary_only", "accept_necessary"].includes(record.buttonClass));
  }
  assert.doesNotMatch(JSON.stringify(logs), /private|Privacy Policy|Terms of Service|Accept all|Reject all/);
});

test("unknown, challenge and explicit legal dialogs never get dismissed or receive credentials", async (context) => {
  context.mock.method(console, "info", () => undefined); context.mock.method(console, "warn", () => undefined);
  for (const text of ["Please confirm your account details", "Verify you are human", "Enter verification code",
    "Cookies: I agree to the terms of service", "You must accept our reseller agreement"]) {
    const harness = browserHarness({ separateDialogText: text, separateDialogButtons: ["Reject all"] });
    await assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
    assert.equal(harness.events.some(event => /^(?:click:|fill:|press:)/.test(event)), false);
    assert.equal(harness.events.at(-1), "browser-closed");
  }
  const unsupportedChoice = browserHarness({ separateDialogText: "We use cookies", separateDialogButtons: ["Accept all"] });
  await assert.rejects(signInEmersonWithCredentials(input, unsupportedChoice.launch), SupplierAdapterError);
  assert.equal(unsupportedChoice.events.some(event => /^(?:click:|fill:|press:)/.test(event)), false);
});

test("the observed email/password login-form dialog is not mistaken for a separate overlay", async () => {
  const harness = browserHarness({ visibleDialog: true });
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.equal(harness.events.includes("click:necessary-cookie-choice"), false);
  assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
});

test("the consent inspection allows ten seconds for element resolution without adding a login attempt", async () => {
  const harness = browserHarness();
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.dialogInspectionTimeouts, [10_000]);
  assert.equal(harness.events.filter(event => event === "press:Enter:Sign in").length, 1);
  assert.equal(harness.events.filter(event => event.startsWith("fill:")).length, 2);
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
    emailMatchesExpected: null, passwordMatchesExpected: null, emailNativeValidity: null, passwordNativeValidity: null,
    signInState: null, visibleDialog: false, dialogCategory: "none", dialogButtonClass: "none", pageErrorCategory: "none",
    emailLabelPresent: true, passwordLabelPresent: false, legacyEmailPresent: false, legacyPasswordPresent: false,
    signInButtonPresent: true, emailFieldVisible: true, passwordFieldVisible: false, signInButtonVisible: true,
    emailEnabled: false, emailEditable: false, passwordEnabled: false, passwordEditable: false, signInEnabled: false,
  }]);
  assert.doesNotMatch(JSON.stringify(logs), /private|https:|token=|account=/);
  logs.length = 0;
  await signInEmersonWithCredentials(input, browserHarness().launch);
  assert.equal(logs.length, 0, "success must not emit failure diagnostics");
});

test("progress traces contain only closed stages and elapsed times, never credential or provider content", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "info", (...args: unknown[]) => { logs.push(args); });
  const harness = browserHarness({ redirect: "https://www.emersonecologics.com/login?private-token=private-cookie" });
  await signInEmersonWithCredentials(input, harness.launch);
  await readRenderedEmersonCatalog("https://www.emersonecologics.com/shop?private-token=private-cookie", "session=private-cookie", input.supplierId, browserHarness({ signedIn: true }).launch);
  const adapter = new EmersonCatalogSupplierAdapter({ id: input.supplierId, name: "Emerson", mode: "website", brands: [], notes: "" }, {
    cookieHeader: "session=private-cookie", renderCatalogImpl: async (url) => ({ responseUrl: url, records: [] }),
  });
  assert.equal((await adapter.verifyAuthentication()).status, "connected");
  const records = logs.map(args => {
    assert.equal(args[0], "[supplier-auth-progress]"); assert.equal(args.length, 2); assert.equal(typeof args[1], "string");
    const record = JSON.parse(args[1] as string);
    assert.deepEqual(Object.keys(record).sort(), ["elapsedMs", "flow", "stage"]);
    assert(["authentication", "session_probe", "saved_login"].includes(record.flow));
    assert((EMERSON_AUTH_PROGRESS_STAGES as readonly string[]).includes(record.stage));
    assert(Number.isSafeInteger(record.elapsedMs) && record.elapsedMs >= 0);
    return record;
  });
  assert(records.some(record => record.flow === "saved_login" && record.stage === "press_sign_in"));
  assert(records.some(record => record.flow === "session_probe" && record.stage === "browser_close"));
  assert(records.some(record => record.flow === "authentication" && record.stage === "complete"));
  assert.doesNotMatch(JSON.stringify(logs), /private|https|username|password=|cookie|token|Account/);
});

test("post-submit diagnostics expose equality/validation/overlay booleans and only a fixed page-error category", async (context) => {
  const logs: unknown[][] = [];
  context.mock.method(console, "info", () => undefined);
  context.mock.method(console, "warn", (...args: unknown[]) => { logs.push(args); });
  const harness = browserHarness({ failureAt: "press_sign_in", failure: new Error("private provider timeout"), emailMatchesExpected: false,
    nativeValid: false, visibleDialog: true, beforeText: "Something went wrong private-account private-password" });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch), SupplierAdapterError);
  assert.equal(logs.length, 1);
  const record = logs[0][1] as Record<string, unknown>;
  assert.equal(record.emailMatchesExpected, false); assert.equal(record.passwordMatchesExpected, true);
  assert.deepEqual(record.emailNativeValidity, { valid: false, requiredMissing: false, typeMismatch: true, patternMismatch: false, formValid: false });
  assert.deepEqual(record.signInState, { focused: true, associatedWithForm: true, submitButton: true });
  assert.equal(record.visibleDialog, true); assert.equal(record.pageErrorCategory, "generic_provider_error");
  assert.doesNotMatch(JSON.stringify(logs), /private|Something went wrong|https:/);
  for (const [text, category] of [["Invalid credentials private-password", "credentials_rejected"], ["Please enter a valid email address", "field_validation"],
    ["Enter verification code", "two_factor_required"], ["Verify you are human", "verification_required"],
    ["This page is protected by reCAPTCHA", "none"]]) assert.equal(emersonLoginPageErrorCategory(text), category);
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
    passwordEnabled: false, passwordEditable: false, signInEnabled: true, changeStateAfterFailure: true });
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

function publicCatalogHarness(options: { visibleSignIn: boolean; pageText?: string; pendingMarkers?: boolean; loginUrl?: boolean }) {
  let closed = false;
  const waits: string[] = [];
  const page = {
    goto: async () => undefined,
    url: () => `https://www.emersonecologics.com/${options.loginUrl ? "login" : "shop"}`,
    locator: (selector: string) => {
      const locator: any = {
      filter: () => locator,
      first: () => ({ waitFor: async () => {
        waits.push(selector);
        if (selector === 'a[href="/login"]:visible' && options.visibleSignIn) return;
        if (options.pendingMarkers && selector === '[aria-label="Account Dropdown"]') return new Promise(() => undefined);
        throw new Error("marker absent");
      }, isVisible: async () => false }),
      innerText: async () => options.pageText ?? "This page is protected by reCAPTCHA.",
      all: async () => selector === 'a[href="/login"]'
        ? [{ isVisible: async () => options.visibleSignIn, innerText: async () => "Sign in" }] : [],
      }; return locator;
    },
    frameLocator: () => ({ getByRole: () => ({ isVisible: async () => false }) }),
    getByRole: () => ({ waitFor: async () => {
      waits.push("current-profile");
      if (options.pendingMarkers) return new Promise(() => undefined);
      throw new Error("current toggle absent");
    }, isVisible: async () => false }),
  };
  const browser = { newContext: async () => ({ addCookies: async () => undefined, newPage: async () => page }),
    close: async () => { closed = true; } } as unknown as Browser;
  return { launch: async () => browser, isClosed: () => closed, waits };
}

test("public /shop with a positive visible Sign in /login link proves session expiry", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: true });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch), EmersonSessionExpiredError);
  assert.equal(harness.isClosed(), true);
});

test("positive signed-out evidence ends observation without waiting for absent account markers", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: true, pendingMarkers: true });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch), EmersonSessionExpiredError);
  assert(harness.waits.includes('a[href="/login"]:visible'));
  assert.equal(harness.isClosed(), true);
});

test("an explicit login redirect never waits for impossible authenticated markers", async () => {
  const harness = publicCatalogHarness({ visibleSignIn: true, loginUrl: true });
  await assert.rejects(readRenderedEmersonCatalog("https://www.emersonecologics.com/shop", "private-session", input.supplierId, harness.launch), EmersonSessionExpiredError);
  assert.deepEqual(harness.waits, []);
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
