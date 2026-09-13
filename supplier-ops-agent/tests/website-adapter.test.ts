import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";

import { prewarmSupplierBrowser, supplierBrowserMode } from "../src/suppliers/browser-launcher.ts";
import {
  allowedSupplierHosts,
  assertSafeSupplierUrl,
  classifyLoginOutcome,
  isCookieDomainAllowed,
  loginCheckFailureMessage,
  parseSessionCookieHeader,
  prioritizeWooProductLinks,
  protectedShopifyRecord,
  sessionCookiesForHosts,
  WebsiteSupplierAdapter,
  waitForLoginOutcome,
  wooCommerceSimpleRecord,
  wooCommerceVariationRecord,
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

test("browser prewarming completes a full launch and close before service startup", async () => {
  const events: string[] = [];
  await prewarmSupplierBrowser(async () => {
    events.push("launch");
    return {
      close: async () => { events.push("close"); },
    } as Browser;
  });

  assert.deepEqual(events, ["launch", "close"]);
});

test("protected lookup reports browser startup failures inside its diagnostic boundary", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => { warnings.push(String(message)); };

  try {
    const adapter = new WebsiteSupplierAdapter(
      desbio,
      {
        loginUrl: "https://portal.desbio.com/login",
        productsUrl: "https://portal.desbio.com/products",
        username: "orders@example.test",
        password: "private-value",
        allowedHosts: ["portal.desbio.com"],
        authenticatedSelector: "[data-account-menu]",
        selectors: {
          username: "#email",
          password: "#password",
          submit: "button[type=submit]",
        },
      },
      { launchBrowser: async () => { throw new Error("portable browser unavailable"); } },
    );

    await assert.rejects(() => adapter.lookupProduct("HA2CG"), /portable browser unavailable/);
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [
    "[supplier-lookup] supplier=desbio phase=browser_start result=failed kind=unexpected",
  ]);
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

test("connection checks tolerate a transient document replacement during login", async () => {
  let elapsedMs = 0;
  let reads = 0;
  const outcome = await waitForLoginOutcome(
    async () => {
      reads += 1;
      if (reads === 1) throw new Error("document replaced");
      return { pageText: "My account", passwordFieldCount: 0 };
    },
    {
      timeoutMs: 1_000,
      pollIntervalMs: 250,
      now: () => elapsedMs,
      sleep: async (milliseconds) => { elapsedMs += milliseconds; },
    },
  );

  assert.equal(outcome, "connected");
  assert.equal(reads, 2);
  assert.equal(elapsedMs, 250);
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

test("WooCommerce exact variation reads keep wholesale price and stock evidence", () => {
  const record = wooCommerceVariationRecord(
    JSON.stringify([
      {
        sku: "RN136",
        display_price: 93.98,
        is_in_stock: true,
        attributes: { attribute_pa_flavor: "Orange 8 oz" },
        image: { src: "https://www.researchednutritionals.com/rn136.jpg" },
      },
      { sku: "RN178", display_price: 74.98, is_in_stock: false },
    ]),
    "rn136",
    "Tri-Fortify Liposomal Glutathione",
    "https://www.researchednutritionals.com/product/tri-fortify-liposomal-glutathione/",
  );

  assert.deepEqual(record, {
    title: "Tri-Fortify Liposomal Glutathione (Orange 8 oz)",
    sku: "RN136",
    cost: 93.98,
    available: true,
    url: "https://www.researchednutritionals.com/product/tri-fortify-liposomal-glutathione/",
    image: "https://www.researchednutritionals.com/rn136.jpg",
  });
  assert.equal(wooCommerceVariationRecord("not-json", "RN136", "Product", "https://example.test"), null);
});

test("WooCommerce exact simple-product reads use the final displayed price", () => {
  assert.deepEqual(
    wooCommerceSimpleRecord(
      {
        sku: "hA2cg",
        title: "hA2cg Evolution",
        priceText: "$39.50 $34.50",
        stockText: "In Stock",
        image: "https://desbio.com/ha2cg.jpg",
      },
      "HA2CG",
      "https://desbio.com/product/ha2cg-evolution-2/",
    ),
    {
      title: "hA2cg Evolution",
      sku: "hA2cg",
      cost: 34.5,
      available: true,
      url: "https://desbio.com/product/ha2cg-evolution-2/",
      image: "https://desbio.com/ha2cg.jpg",
    },
  );
  assert.equal(
    wooCommerceSimpleRecord({ sku: "other", title: "Wrong", priceText: "$1", stockText: "In Stock" }, "HA2CG", "https://desbio.com/product/wrong/"),
    null,
  );
});

test("WooCommerce searches prioritize links containing the exact SKU hint", () => {
  assert.deepEqual(
    prioritizeWooProductLinks(
      [
        { url: "https://desbio.com/product/unrelated/", text: "Unrelated product" },
        { url: "https://desbio.com/product/ha2cg-evolution-2/", text: "hA2cg Evolution" },
        { url: "https://desbio.com/product/unrelated/", text: "Duplicate" },
      ],
      "hA2cg",
    ),
    [
      "https://desbio.com/product/ha2cg-evolution-2/",
      "https://desbio.com/product/unrelated/",
    ],
  );
});

test("protected Shopify exact reads preserve decimal prices as MSRP and sale price", () => {
  const record = protectedShopifyRecord(
    {
      products: [{
        title: "Professional Formula",
        vendor: "Physicians' Standard",
        handle: "professional-formula",
        image: { src: "https://www.physiciansstandard.com/formula.jpg" },
        variants: [{
          title: "Default Title",
          sku: "PS-100",
          available: true,
          price: "42.50",
          compare_at_price: "49.99",
        }],
      }],
    },
    "ps-100",
    "https://www.physiciansstandard.com",
  );

  assert.deepEqual(record, {
    title: "Professional Formula",
    brand: "Physicians' Standard",
    sku: "PS-100",
    available: true,
    msrp: 49.99,
    sale_price: 42.5,
    url: "https://www.physiciansstandard.com/products/professional-formula",
    image: "https://www.physiciansstandard.com/formula.jpg",
  });
  assert.equal(protectedShopifyRecord({ products: [] }, "PS-100", "https://www.physiciansstandard.com"), null);
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
            waitFor: async () => {
              if (selector === "[data-account-menu]" && authenticated) return;
              throw new Error("not visible");
            },
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
