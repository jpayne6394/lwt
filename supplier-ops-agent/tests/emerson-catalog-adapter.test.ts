import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeEmersonUrl,
  EmersonCatalogSupplierAdapter,
  parseEmersonCatalogUrls,
  requiresSignIn,
} from "../src/suppliers/emerson-catalog-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const emerson: SupplierConfig = {
  id: "emerson-ecologics",
  name: "Emerson Ecologics",
  mode: "website",
  brands: ["Pure Encapsulations"],
  notes: "",
};

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
