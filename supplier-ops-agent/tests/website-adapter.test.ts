import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";

import { supplierBrowserMode } from "../src/suppliers/browser-launcher.ts";
import {
  allowedSupplierHosts,
  assertSafeSupplierUrl,
  classifyLoginOutcome,
  isCookieDomainAllowed,
  loginCheckFailureMessage,
  parseSessionCookieHeader,
  sessionCookiesForHosts,
  WebsiteSupplierAdapter,
  waitForLoginOutcome,
} from "../src/suppliers/website-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const desbio: SupplierConfig = {
  id: "desbio",
  name: "DesBio",
  mode: "website",
  brands: ["DesBio"],
  notes: "",
};

test("Render Linux uses the self-contained browser runtime", () => {
  assert.equal(supplierBrowserMode("linux"), "portable");
  assert.equal(supplierBrowserMode("win32"), "managed");
});

test("connection checks expose only a safe failing phase", () => {
  assert.equal(
    loginCheckFailureMessage("Emerson Ecologics", "browser_start"),
    "Emerson Ecologics could not complete the sign-in check while starting its secure browser.",
  );
  assert.equal(
    loginCheckFailureMessage("Emerson Ecologics", "submit"),
    "Emerson Ecologics could not complete the sign-in check while submitting the sign-in form.",
  );
});

test("login classification distinguishes a pending page from verified outcomes", () => {
  assert.equal(classifyLoginOutcome("Sign in to your account", 1), "pending");
  assert.equal(classifyLoginOutcome("Incorrect email or password", 1), "login_failed");
  assert.equal(classifyLoginOutcome("Enter your verification code", 1), "two_factor_required");
  assert.equal(classifyLoginOutcome("This page is protected by reCAPTCHA", 1), "pending");
  assert.equal(classifyLoginOutcome("Verify you are human", 1), "verification_required");
  assert.equal(classifyLoginOutcome("Welcome back", 0), "connected");
});

test("verification challenges take precedence over generic credential errors", () => {
  assert.equal(
    classifyLoginOutcome("Sign in failed. Please complete the CAPTCHA to continue.", 1),
    "verification_required",
  );
});

test("connection checks wait for a delayed successful redirect instead of failing early", async () => {
  const states = [
    { pageText: "Sign in to your account. Protected by reCAPTCHA.", passwordFieldCount: 1 },
    { pageText: "Signing in. Protected by reCAPTCHA.", passwordFieldCount: 1 },
    { pageText: "Welcome back", passwordFieldCount: 0 },
  ];
  let elapsedMs = 0;

  const outcome = await waitForLoginOutcome(
    async () => states.shift() ?? { pageText: "Welcome back", passwordFieldCount: 0 },
    {
      timeoutMs: 5_000,
      pollIntervalMs: 250,
      now: () => elapsedMs,
      sleep: async (milliseconds) => {
        elapsedMs += milliseconds;
      },
    },
  );

  assert.equal(outcome, "connected");
  assert.equal(elapsedMs, 500);
});

test("a reCAPTCHA-protected login that never redirects becomes verification required", async () => {
  let elapsedMs = 0;
  const outcome = await waitForLoginOutcome(
    async () => ({ pageText: "Sign in. This page is protected by reCAPTCHA.", passwordFieldCount: 1 }),
    {
      timeoutMs: 500,
      pollIntervalMs: 250,
      now: () => elapsedMs,
      sleep: async (milliseconds) => {
        elapsedMs += milliseconds;
      },
    },
  );

  assert.equal(outcome, "verification_required");
  assert.equal(elapsedMs, 500);
});

test("reusable sessions are parsed without exposing values and are scoped to approved hosts", () => {
  assert.deepEqual(parseSessionCookieHeader("session=private=value; csrf=token; broken"), [
    { name: "session", value: "private=value" },
    { name: "csrf", value: "token" },
  ]);
  assert.deepEqual(sessionCookiesForHosts("session=private=value", ["portal.desbio.com"]), [
    {
      name: "session",
      value: "private=value",
      url: "https://portal.desbio.com/",
      secure: true,
      sameSite: "Lax",
    },
  ]);
});

test("supplier sessions fail closed outside their exact HTTPS read-only allowlist", () => {
  assert.doesNotThrow(() =>
    assertSafeSupplierUrl("https://portal.desbio.com/products", ["portal.desbio.com"], "desbio", "catalog"),
  );
  assert.throws(
    () => assertSafeSupplierUrl("https://example.test/collect", ["portal.desbio.com"], "desbio", "catalog"),
    /approved HTTPS/,
  );
  assert.throws(
    () => assertSafeSupplierUrl("http://portal.desbio.com/products", ["portal.desbio.com"], "desbio", "catalog"),
    /approved HTTPS/,
  );
  assert.throws(
    () => assertSafeSupplierUrl("https://portal.desbio.com/cart", ["portal.desbio.com"], "desbio", "catalog"),
    /not read-only/,
  );
});

test("supplier allowlists default only to explicitly configured portal hosts", () => {
  assert.deepEqual(
    allowedSupplierHosts({
      loginUrl: "https://accounts.example.test/login",
      productsUrl: "https://catalog.example.test/products",
    }),
    ["accounts.example.test", "catalog.example.test"],
  );
});

test("captured cookies may belong to an approved host or its parent domain only", () => {
  assert.equal(isCookieDomainAllowed(".desbio.com", ["portal.desbio.com"]), true);
  assert.equal(isCookieDomainAllowed("portal.desbio.com", ["portal.desbio.com"]), true);
  assert.equal(isCookieDomainAllowed("example.com", ["portal.desbio.com"]), false);
});

test("an expired session refreshes once with saved credentials and the replacement is reused", async () => {
  const harness = createSupplierBrowserHarness();
  const adapter = new WebsiteSupplierAdapter(
    desbio,
    {
      loginUrl: "https://portal.desbio.com/login",
      productsUrl: "https://portal.desbio.com/products",
      sessionCookieHeader: "session=stale",
      username: "orders@example.test",
      password: "private-value",
      allowedHosts: ["portal.desbio.com"],
      authenticatedSelector: "[data-account-menu]",
      selectors: {
        username: "#email",
        password: "#password",
        submit: "button[type=submit]",
        productRows: "[data-product-row]",
      },
    },
    { launchBrowser: harness.launchBrowser },
  );

  assert.equal((await adapter.verifyLogin()).status, "connected");
  assert.equal((await adapter.verifyLogin()).status, "connected");
  assert.equal(harness.credentialSubmissions(), 1);
  assert.deepEqual(harness.addedSessionValues(), ["stale", "fresh"]);
});

test("a supplier verification code is reported distinctly after automatic credential refresh", async () => {
  const harness = createSupplierBrowserHarness({ outcomeAfterSubmit: "two_factor_required" });
  const adapter = new WebsiteSupplierAdapter(
    desbio,
    {
      loginUrl: "https://portal.desbio.com/login",
      productsUrl: "https://portal.desbio.com/products",
      sessionCookieHeader: "session=stale",
      username: "orders@example.test",
      password: "private-value",
      allowedHosts: ["portal.desbio.com"],
      authenticatedSelector: "[data-account-menu]",
      selectors: {
        username: "#email",
        password: "#password",
        submit: "button[type=submit]",
        productRows: "[data-product-row]",
      },
    },
    { launchBrowser: harness.launchBrowser },
  );

  assert.equal((await adapter.verifyLogin()).status, "two_factor_required");
  assert.equal(harness.credentialSubmissions(), 1);
});

function createSupplierBrowserHarness(
  options: { outcomeAfterSubmit?: "connected" | "two_factor_required" } = {},
) {
  let credentialSubmissions = 0;
  let submitted = false;
  const addedSessionValues: string[] = [];

  const launchBrowser = async () => {
    const browser = {
      newContext: async () => {
        let authenticated = false;
        let currentUrl = "about:blank";
        const context = {
          addCookies: async (cookies: Array<{ value: string }>) => {
            const sessionValue = cookies.find((cookie) => cookie.value)?.value;
            if (sessionValue) addedSessionValues.push(sessionValue);
            authenticated = sessionValue === "fresh";
          },
          cookies: async () => [
            { name: "session", value: "fresh", domain: ".desbio.com" },
          ],
        } as unknown as BrowserContext;
        const page = {
          goto: async (url: string) => {
            currentUrl = url;
          },
          url: () => currentUrl,
          fill: async () => undefined,
          click: async () => {
            credentialSubmissions += 1;
            submitted = true;
            authenticated = options.outcomeAfterSubmit !== "two_factor_required";
          },
          locator: (selector: string) => ({
            isVisible: async () => selector === "[data-account-menu]" ? authenticated : !authenticated,
            innerText: async () => authenticated
              ? "Account"
              : submitted && options.outcomeAfterSubmit === "two_factor_required"
                ? "Enter your verification code"
                : "Sign in",
            all: async () => [{ isVisible: async () => !authenticated }],
            count: async () => authenticated ? 0 : 1,
          }),
          $$eval: async () => [],
        } as unknown as Page;
        (context as unknown as { newPage: () => Promise<Page> }).newPage = async () => page;
        return context;
      },
      close: async () => undefined,
    } as unknown as Browser;
    return browser;
  };

  return {
    launchBrowser,
    credentialSubmissions: () => credentialSubmissions,
    addedSessionValues: () => [...addedSessionValues],
  };
}
