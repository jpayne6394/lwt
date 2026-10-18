import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";
import { signInEmersonWithCredentials, readRenderedEmersonCatalog, EmersonSessionExpiredError } from "../src/suppliers/emerson-catalog-adapter.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";

const input = { username: "private-account", password: "private-password", supplierId: "emerson-ecologics" };

function browserHarness(options: { beforeText?: string; afterText?: string; redirect?: string;
  challengeFrame?: boolean; checkbox?: boolean; failure?: Error; accountMarker?: boolean;
  contextFailure?: Error; navigationFailure?: Error; emptyCookies?: boolean; closeFailure?: Error } = {}) {
  const events: string[] = [];
  let submitted = false;
  let url = "about:blank";
  const page = {
    goto: async (target: string) => {
      events.push(`goto:${target}`); url = options.redirect ?? target;
      if (options.navigationFailure) throw options.navigationFailure;
    },
    url: () => url,
    locator: (selector: string) => ({
      fill: async (value: string) => {
        assert(selector === "#email" || selector === "#password");
        assert.equal(value, selector === "#email" ? input.username : input.password);
        events.push(`fill:${selector}`);
        if (options.failure) throw options.failure;
      },
      innerText: async () => submitted ? options.afterText ?? "Account" : options.beforeText ?? "This page is protected by reCAPTCHA, and subject to Google Privacy Policy and Terms of Service.",
      first: () => ({ isVisible: async () => submitted && options.accountMarker !== false }),
      all: async () => options.challengeFrame ? [{ isVisible: async () => true }] : [],
    }),
    frameLocator: () => ({ getByRole: () => ({ isVisible: async () => Boolean(options.checkbox) }) }),
    getByRole: (role: string, settings: { name: string; exact: boolean }) => {
      assert.equal(role, "button"); assert.deepEqual(settings, { name: "Sign in", exact: true });
      return { click: async () => { submitted = true; events.push("click:Sign in"); } };
    },
  };
  const browser = {
    newContext: async () => {
      if (options.contextFailure) throw options.contextFailure;
      return { newPage: async () => page, cookies: async (urls: string[]) => {
      assert.deepEqual(urls, ["https://emersonecologics.com/", "https://www.emersonecologics.com/"]);
      events.push("read-verified-session");
      return options.emptyCookies ? [] : [{ domain: ".emersonecologics.com", name: "session", value: "private-renewed-cookie" },
        { domain: "attacker.invalid", name: "unrelated", value: "not-allowed" }];
    } }; },
    close: async () => { events.push("browser-closed"); if (options.closeFailure) throw options.closeFailure; },
  } as unknown as Browser;
  return { events, launch: async () => browser };
}

test("routine Emerson login uses only the observed form and returns the verified supplier-scoped session", async () => {
  const harness = browserHarness();
  assert.equal(await signInEmersonWithCredentials(input, harness.launch), "session=private-renewed-cookie");
  assert.deepEqual(harness.events, ["goto:https://www.emersonecologics.com/login", "fill:#email", "fill:#password",
    "click:Sign in", "read-verified-session", "browser-closed"]);
  assert.doesNotMatch(JSON.stringify(harness.events), /private|cart|checkout|payment|order/);
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
  assert.equal(harness.events.filter((event) => event === "click:Sign in").length, 1);
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
  let reads = 0;
  context.mock.method(Date, "now", () => reads++ === 0 ? 0 : 20_000);
  const harness = browserHarness({ afterText: "Welcome", accountMarker: false });
  await assert.rejects(signInEmersonWithCredentials(input, harness.launch), (error: unknown) => {
    assert(error instanceof SupplierAdapterError); assert.equal(error.authIssue, "login_confirmation_missing"); return true;
  });
  assert.equal(harness.events.filter((event) => event === "click:Sign in").length, 1);
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
