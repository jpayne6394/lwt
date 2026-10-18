import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeEmersonUrl,
  EmersonCatalogSupplierAdapter,
  EmersonSessionExpiredError,
  emersonChallengeCode,
  parseEmersonCatalogUrls,
  requiresSignIn,
} from "../src/suppliers/emerson-catalog-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";

const emerson: SupplierConfig = {
  id: "emerson-ecologics",
  name: "Emerson Ecologics",
  mode: "website",
  brands: ["Pure Encapsulations"],
  notes: "",
};

test("normal Emerson reCAPTCHA legal footer is not an active verification challenge", () => {
  assert.equal(emersonChallengeCode("This page is protected by reCAPTCHA, and subject to Google Privacy Policy and Terms of Service."), null);
  assert.equal(emersonChallengeCode("Please verify you are human"), "verification_required");
  assert.equal(emersonChallengeCode("Email Password", true), "verification_required");
  assert.equal(emersonChallengeCode("Enter verification code"), "two_factor_required");
});

test("expired Emerson cookie renews once with saved credentials and reuses the refreshed session", async () => {
  let logins = 0;
  const cookies: string[] = [];
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async (input) => {
      assert.equal(input.username, "private-account"); assert.equal(input.password, "private-password");
      logins += 1; return "session=renewed";
    },
    renderCatalogImpl: async (url, cookie) => {
      cookies.push(cookie);
      if (cookie === "session=expired") throw new EmersonSessionExpiredError(emerson.id);
      return { responseUrl: url, records: [] };
    },
  });
  assert.equal((await adapter.verifyAuthentication()).status, "connected");
  assert.equal((await adapter.verifyAuthentication()).status, "connected");
  assert.equal(logins, 1);
  assert.deepEqual(cookies, ["session=expired", "session=renewed", "session=renewed"]);
});

test("missing Emerson cookie uses the saved account once, without starting a catalog sync", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; return "session=renewed"; },
    renderCatalogImpl: async (url, cookie) => { assert.equal(cookie, "session=renewed"); return { responseUrl: url, records: [] }; },
    fetchImpl: async () => { throw new Error("no full catalog HTTP sync"); },
  });
  assert.equal((await adapter.verifyAuthentication()).status, "connected");
  assert.equal(logins, 1);
});

test("Emerson MFA and active CAPTCHA stop without attempting stored-credential renewal", async () => {
  for (const kind of ["two_factor_required", "verification_required"] as const) {
    let logins = 0;
    const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=present", username: "private-account", password: "private-password",
      authenticateSessionImpl: async () => { logins += 1; throw new Error("must not attempt login"); },
      renderCatalogImpl: async () => { throw new SupplierAdapterError(emerson.id, kind, "private-page-context"); },
    });
    const result = await adapter.verifyAuthentication();
    assert.equal(result.status, kind); assert.equal(logins, 0);
    assert.doesNotMatch(JSON.stringify(result), /private/);
  }
});

test("HTTP 200 MFA or active CAPTCHA takes precedence over an expired password form", async () => {
  for (const [body, kind] of [["Enter verification code", "two_factor_required"], ["Complete the CAPTCHA", "verification_required"]] as const) {
    let logins = 0;
    const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=present", username: "private-account", password: "private-password",
      fetchImpl: async () => new Response(`<input type="password"><p>${body}</p>`, { status: 200 }),
      authenticateSessionImpl: async () => { logins += 1; throw new Error("must not attempt login"); },
    });
    await assert.rejects(adapter.lookupProduct("PUR-MG9"), (error: unknown) => error instanceof SupplierAdapterError && error.kind === kind);
    assert.equal(logins, 0);
  }
});

test("normal reCAPTCHA footer and script strings do not manufacture an HTTP challenge", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; return "session=renewed"; },
    fetchImpl: async (_url, init) => new Headers(init?.headers).get("cookie") === "session=renewed"
      ? new Response(authenticatedCatalogHtml(), { status: 200 })
      : new Response('<input type="password"><script>const text="Enter verification code";</script><p>This page is protected by reCAPTCHA.</p>', { status: 200 }),
  });
  assert.equal((await adapter.lookupProduct("PUR-MG9"))?.sku, "PUR-MG9");
  assert.equal(logins, 1);
});

test("failed renewal is status-cached for five minutes, preventing sequential login lockout loops", async () => {
  for (const kind of ["login_failed", "two_factor_required", "verification_required"] as const) {
    let now = 1_000, logins = 0;
    const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
      nowImpl: () => now,
      authenticateSessionImpl: async () => { logins += 1; throw new SupplierAdapterError(emerson.id, kind, "private-provider-context"); },
      renderCatalogImpl: async () => { throw new EmersonSessionExpiredError(emerson.id); },
    });
    for (let call = 0; call < 2; call += 1) {
      const result = await adapter.verifyAuthentication();
      assert.equal(result.status, kind); assert.doesNotMatch(JSON.stringify(result), /private/);
    }
    assert.equal(logins, 1);
    now += 5 * 60_000 + 1;
    assert.equal((await adapter.verifyAuthentication()).status, kind);
    assert.equal(logins, 2);
  }
});

test("failed read-back of a fresh session also pauses subsequent credential renewal", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; return "session=renewed"; },
    renderCatalogImpl: async () => { throw new EmersonSessionExpiredError(emerson.id); },
  });
  for (let call = 0; call < 2; call += 1) {
    const result = await adapter.verifyAuthentication();
    assert.equal(result.status, "verification_required");
    assert.equal(result.authIssue, "renewed_session_unverified");
  }
  assert.equal(logins, 1);
});

test("controlled renewal failure reason survives sanitization and the cooldown without another submission", async () => {
  for (const authIssue of ["browser_launch_failed", "login_form_unavailable", "credentials_rejected", "login_confirmation_missing"] as const) {
    let submissions = 0;
    const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-user", password: "private-password",
      authenticateSessionImpl: async () => {
        submissions += 1; throw new SupplierAdapterError(emerson.id, "login_failed", "private-provider-password", authIssue);
      },
      renderCatalogImpl: async () => { throw new EmersonSessionExpiredError(emerson.id); },
    });
    for (let call = 0; call < 2; call += 1) {
      const result = await adapter.verifyAuthentication();
      assert.equal(result.authIssue, authIssue);
      assert.doesNotMatch(JSON.stringify(result), /private/);
    }
    assert.equal(submissions, 1);
  }
});

test("failed freshly renewed Emerson sessions are not retried in a silent loop", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; return "session=renewed"; },
    renderCatalogImpl: async () => { throw new EmersonSessionExpiredError(emerson.id); },
  });
  assert.equal((await adapter.verifyAuthentication()).status, "verification_required");
  assert.equal(logins, 1);
});

test("concurrent Emerson reads share one normal credential renewal", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; await new Promise((resolve) => setImmediate(resolve)); return "session=renewed"; },
    renderCatalogImpl: async (url, cookie) => {
      if (cookie === "session=expired") throw new EmersonSessionExpiredError(emerson.id);
      return { responseUrl: url, records: [] };
    },
  });
  assert.deepEqual((await Promise.all([adapter.verifyAuthentication(), adapter.verifyAuthentication()])).map((result) => result.status), ["connected", "connected"]);
  assert.equal(logins, 1);
});

test("Emerson exact lookup preserves its original SKU after one expired-session renewal", async () => {
  const urls: string[] = [];
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=expired", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; return "session=renewed"; },
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      const fresh = new Headers(init?.headers).get("cookie") === "session=renewed";
      return new Response(fresh ? authenticatedCatalogHtml() : '<input type="password">', { status: 200 });
    },
  });
  assert.equal((await adapter.lookupProduct("PUR-MG9"))?.sku, "PUR-MG9");
  assert.equal(logins, 1); assert.equal(urls.length, 2);
  assert.deepEqual(urls, [urls[0], urls[0]]); assert.equal(new URL(urls[0]).searchParams.get("query"), '"PUR-MG9"');
});

test("Emerson 403 blocks and third-party or purchase URLs never trigger a credential retry", async () => {
  let logins = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, { cookieHeader: "session=present", username: "private-account", password: "private-password",
    authenticateSessionImpl: async () => { logins += 1; throw new Error("must not attempt login"); },
    fetchImpl: async () => new Response("Forbidden", { status: 403 }),
  });
  await assert.rejects(adapter.lookupProduct("PUR-MG9"), (error: unknown) => error instanceof SupplierAdapterError && error.kind === "verification_required");
  assert.equal(logins, 0);
  for (const url of ["https://other.emersonecologics.com/login", "https://www.emersonecologics.com/checkout", "https://www.emersonecologics.com/cart", "https://www.emersonecologics.com/orders", "https://user:private@www.emersonecologics.com/login"]) {
    assert.throws(() => assertSafeEmersonUrl(url, emerson.id));
  }
});

test("Emerson session adapter maps authenticated catalog state and sends the cookie only to Emerson", async () => {
  let sentCookie = "";
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    catalogUrls: ["https://www.emersonecologics.com/shop"],
    fetchImpl: async (_url, init) => {
      sentCookie = new Headers(init?.headers).get("cookie") ?? "";
      return new Response(authenticatedCatalogHtml(), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });

  const products = await adapter.fetchProducts({ now: new Date("2026-09-12T12:00:00.000Z") });
  assert.equal(sentCookie, "session=private-value");
  assert.deepEqual(products[0], {
    supplierId: "emerson-ecologics",
    supplierName: "Emerson Ecologics",
    brand: "Pure Encapsulations",
    sku: "PUR-MG9",
    upc: undefined,
    title: "Magnesium Glycinate, 120 mg (90 capsules)",
    stockStatus: "in_stock",
    quantity: 12,
    cost: 17.55,
    msrp: 27.99,
    salePrice: undefined,
    productUrl:
      "https://www.emersonecologics.com/products/detail/Pure-Encapsulations/magnesium-glycinate-120-mg/product-1/MAG49",
    imageUrls: ["https://assets.fullscript.io/Product/PU0176/400_front.png"],
    capturedAt: "2026-09-12T12:00:00.000Z",
  });
});

test("Emerson connection check accepts a reusable authenticated catalog session", async () => {
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async () => new Response(authenticatedCatalogHtml(), { status: 200 }),
  });
  assert.equal((await adapter.verifyLogin()).status, "connected");
});

test("Emerson falls back to the current rendered catalog when legacy product state is absent", async () => {
  const renderedCalls: string[] = [];
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async () => new Response("<html><body>Authenticated catalog shell</body></html>", { status: 200 }),
    renderCatalogImpl: async (url, cookieHeader, supplierId) => {
      renderedCalls.push(url);
      assert.equal(cookieHeader, "session=private-value");
      assert.equal(supplierId, "emerson-ecologics");
      return {
        responseUrl: url,
        records: [{
          title: "Magnesium Glycinate, 120 mg (90 capsules)",
          brand: "Pure Encapsulations",
          sku: "MAG49",
          cost: 13.5,
          available: true,
          url: "https://emersonecologics.com/products/detail/Pure-Encapsulations/magnesium/MAG49",
        }],
      };
    },
  });

  assert.equal((await adapter.verifyLogin()).status, "connected");
  const product = await adapter.lookupProduct("mag49", { now: new Date("2026-09-12T12:00:00.000Z") });
  assert.equal(product?.sku, "MAG49");
  assert.equal(product?.cost, 13.5);
  assert.equal(product?.stockStatus, "in_stock");
  assert.equal(renderedCalls.length, 2);
  assert.equal(new URL(renderedCalls[1]).searchParams.get("query"), '"mag49"');
});

test("Emerson ignores an empty legacy state marker and reads the current rendered catalog", async () => {
  let rendered = false;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async () => new Response(
      '<html><head><meta name="apollo-state" content="e30="></head><body>Catalog shell</body></html>',
      { status: 200 },
    ),
    renderCatalogImpl: async (url) => {
      rendered = true;
      return {
        responseUrl: url,
        records: [{ title: "Magnesium Glycinate", sku: "MAG49", cost: 13.5, available: true }],
      };
    },
  });

  assert.equal((await adapter.lookupProduct("MAG49"))?.sku, "MAG49");
  assert.equal(rendered, true);
});

test("Emerson exact lookup ignores unrelated legacy products and reads the current search result", async () => {
  let rendered = false;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async () => new Response(authenticatedCatalogHtml(), { status: 200 }),
    renderCatalogImpl: async (url) => {
      rendered = true;
      return {
        responseUrl: url,
        records: [{ title: "Magnesium Glycinate", sku: "MAG49", cost: 13.5, available: true }],
      };
    },
  });

  assert.equal((await adapter.lookupProduct("MAG49"))?.sku, "MAG49");
  assert.equal(rendered, true);
});

test("Emerson rendered fallback still treats a login redirect as an expired session", async () => {
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async () => new Response("<html><body>Catalog shell</body></html>", { status: 200 }),
    renderCatalogImpl: async () => ({ responseUrl: "https://emersonecologics.com/login", records: [] }),
  });
  assert.equal((await adapter.verifyLogin()).status, "verification_required");
});

test("Emerson exact lookup searches one SKU and does not open cart or order routes", async () => {
  let requestedUrl = "";
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(authenticatedCatalogHtml(), { status: 200 });
    },
  });
  const product = await adapter.lookupProduct("PUR-MG9", { now: new Date("2026-09-12T12:00:00.000Z") });
  assert.equal(product?.sku, "PUR-MG9");
  const parsed = new URL(requestedUrl);
  assert.equal(parsed.origin, "https://emersonecologics.com");
  assert.equal(parsed.pathname, "/shop");
  assert.equal(parsed.searchParams.get("query"), '"PUR-MG9"');
  assert.equal(/cart|checkout|order/i.test(parsed.pathname), false);
});

test("Emerson session adapter fails closed when the session returns a public sign-in page", async () => {
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "expired=true",
    fetchImpl: async () =>
      new Response('<html><a href="/login">Sign in</a><meta name="apollo-state" content="e30="/></html>', {
        status: 200,
      }),
  });
  assert.equal((await adapter.verifyLogin()).status, "verification_required");
  await assert.rejects(adapter.fetchProducts(), (error: unknown) => {
    assert.equal((error as { kind?: string }).kind, "verification_required");
    return true;
  });
});

test("Emerson session adapter reports one-time setup when no captured session exists", async () => {
  const adapter = new EmersonCatalogSupplierAdapter(emerson);
  assert.equal((await adapter.verifyLogin()).status, "not_configured");
  await assert.rejects(adapter.fetchProducts(), (error: unknown) => {
    assert.equal((error as { kind?: string }).kind, "not_configured");
    return true;
  });
});

test("Emerson sign-in detection recognizes redirects and the current public catalog control", () => {
  assert.equal(requiresSignIn("<html></html>", "https://emersonecologics.com/login"), true);
  assert.equal(
    requiresSignIn('<a class="button" href="/login">Sign in</a>', "https://www.emersonecologics.com/shop"),
    true,
  );
  assert.equal(requiresSignIn(authenticatedCatalogHtml(), "https://www.emersonecologics.com/shop"), false);
});

test("Emerson catalog URLs accept comma and newline separated settings", () => {
  assert.deepEqual(parseEmersonCatalogUrls("https://example.test/a, https://example.test/b\nhttps://example.test/c"), [
    "https://example.test/a",
    "https://example.test/b",
    "https://example.test/c",
  ]);
});

test("Emerson session cannot be sent to a non-Emerson or insecure catalog URL", async () => {
  assert.throws(() => assertSafeEmersonUrl("https://example.test/collect", emerson.id), /only be sent/);
  assert.throws(() => assertSafeEmersonUrl("http://www.emersonecologics.com/shop", emerson.id), /only be sent/);

  let requestCount = 0;
  const adapter = new EmersonCatalogSupplierAdapter(emerson, {
    cookieHeader: "session=private-value",
    catalogUrls: ["https://example.test/collect"],
    fetchImpl: async () => {
      requestCount += 1;
      return new Response(authenticatedCatalogHtml(), { status: 200 });
    },
  });
  await assert.rejects(adapter.fetchProducts(), /only be sent/);
  assert.equal(requestCount, 0);
});

function authenticatedCatalogHtml(): string {
  const state = {
    "Product:product-1": {
      __typename: "Product",
      id: "product-1",
      name: "Magnesium Glycinate, 120 mg",
      slug: "magnesium-glycinate-120-mg",
      brand: { __ref: "Brand:brand-1" },
      availableOrMasterVariant: { __ref: "Variant:variant-1" },
    },
    "Brand:brand-1": { __typename: "Brand", name: "Pure Encapsulations" },
    "Variant:variant-1": {
      __typename: "Variant",
      sku: "PUR-MG9",
      emersonVariantId: "MAG49",
      name: "Magnesium Glycinate, 120 mg (90 capsules)",
      imageNew: "https://assets.fullscript.io/Product/PU0176/400_front.png",
      msrp: 27.99,
      price: 17.55,
      inStock: true,
      quantityAvailable: 12,
    },
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(state)), "utf8").toString("base64");
  return `<html><head><meta name="apollo-state" content="${encoded}"/></head><body>My account</body></html>`;
}
