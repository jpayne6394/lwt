import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafePublicCatalogUrl,
  defaultPublicCatalogConfig,
  PublicCatalogSupplierAdapter,
  recordsFromWooCommerceHtml,
} from "../src/suppliers/public-catalog-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const supplier: SupplierConfig = {
  id: "public-supplier",
  name: "Public Supplier",
  mode: "website",
  brands: [],
  notes: "",
};

test("public Shopify catalog maps only variants with exact SKUs and treats prices as retail", async () => {
  const adapter = new PublicCatalogSupplierAdapter(supplier, {
    kind: "shopify-json",
    catalogUrl: "https://catalog.example.test/products.json?limit=250",
    allowedHosts: ["catalog.example.test"],
    fetchImpl: async () => new Response(JSON.stringify({
      products: [{
        title: "Vitamin D",
        handle: "vitamin-d",
        vendor: "Example Brand",
        images: [{ src: "https://catalog.example.test/image.jpg" }],
        variants: [
          { title: "60 capsules", sku: "VD-60", available: true, price: "18.00", compare_at_price: "22.00" },
          { title: "Default Title", sku: "", available: true, price: "18.00" },
        ],
      }],
    }), { status: 200 }),
  });

  const products = await adapter.fetchProducts({ now: new Date("2026-09-12T12:00:00.000Z") });
  assert.equal(products.length, 1);
  assert.deepEqual(products[0], {
    supplierId: "public-supplier",
    supplierName: "Public Supplier",
    brand: "Example Brand",
    sku: "VD-60",
    upc: undefined,
    title: "Vitamin D (60 capsules)",
    stockStatus: "in_stock",
    quantity: undefined,
    cost: undefined,
    msrp: 22,
    salePrice: 18,
    productUrl: "https://catalog.example.test/products/vitamin-d",
    imageUrls: ["https://catalog.example.test/image.jpg"],
    capturedAt: "2026-09-12T12:00:00.000Z",
  });
  assert.equal((await adapter.lookupProduct("vd-60"))?.sku, "VD-60");
});

test("public Squarespace catalog maps variant cents, stock, and exact SKU", async () => {
  const adapter = new PublicCatalogSupplierAdapter(supplier, {
    kind: "squarespace-json",
    catalogUrl: "https://catalog.example.test/products/brand?format=json",
    allowedHosts: ["catalog.example.test"],
    fetchImpl: async () => new Response(JSON.stringify({
      items: [{
        title: "Pekana Formula",
        fullUrl: "/products/p/pekana-formula",
        assetUrl: "https://catalog.example.test/image.jpg",
        variants: [{ sku: "PK-101", price: 2400, salePrice: 2000, onSale: true, unlimited: false, qtyInStock: 7 }],
      }],
    }), { status: 200 }),
  });

  const product = await adapter.lookupProduct("PK-101");
  assert.equal(product?.msrp, 24);
  assert.equal(product?.salePrice, 20);
  assert.equal(product?.quantity, 7);
  assert.equal(product?.stockStatus, "in_stock");
});

test("public WooCommerce catalog uses the reviewed rendered reader without a login", async () => {
  let calls = 0;
  const adapter = new PublicCatalogSupplierAdapter(supplier, {
    kind: "woocommerce-html",
    catalogUrl: "https://catalog.example.test/products/?ppp=-1",
    allowedHosts: ["catalog.example.test"],
    renderProductsImpl: async () => {
      calls += 1;
      return [{ title: "Systemic Formula", sku: "SF-1", available: true, quantity: 12, msrp: 35 }];
    },
  });

  assert.equal((await adapter.verifyLogin()).status, "connected");
  assert.equal((await adapter.lookupProduct("sf-1"))?.sku, "SF-1");
  assert.equal(calls, 2);
});

test("public WooCommerce HTML parser reads encoded exact-SKU product data without a browser", () => {
  const payload = JSON.stringify({
    item_name: "Systemic Formula",
    sku: "SF-1",
    price: 35,
    stocklevel: 12,
    stockstatus: "instock",
    productlink: "https://catalog.example.test/product/systemic-formula/",
  }).replace(/"/g, "&quot;");
  assert.deepEqual(recordsFromWooCommerceHtml(
    `<li class="product"><a data-gtm4wp_product_data="${payload}"></a></li>`,
    "public-supplier",
  ), [{
    title: "Systemic Formula",
    brand: "",
    sku: "SF-1",
    available: true,
    quantity: 12,
    msrp: 35,
    url: "https://catalog.example.test/product/systemic-formula/",
  }]);
});

test("public catalog defaults cover the three supplier sites that do not require account sessions", () => {
  assert.equal(defaultPublicCatalogConfig("bioresource-pekana")?.kind, "squarespace-json");
  assert.equal(defaultPublicCatalogConfig("systemic-formulas")?.kind, "woocommerce-html");
  assert.equal(defaultPublicCatalogConfig("world-health-mall")?.kind, "shopify-json");
  assert.equal(defaultPublicCatalogConfig("desbio"), undefined);
});

test("public catalog URLs remain on exact HTTPS supplier hosts and exclude purchase routes", () => {
  assert.doesNotThrow(() => assertSafePublicCatalogUrl(
    "https://catalog.example.test/products.json",
    ["catalog.example.test"],
    "public-supplier",
  ));
  assert.throws(() => assertSafePublicCatalogUrl(
    "https://catalog.example.test/cart",
    ["catalog.example.test"],
    "public-supplier",
  ), /approved HTTPS catalog/);
  assert.throws(() => assertSafePublicCatalogUrl(
    "https://example.test/products.json",
    ["catalog.example.test"],
    "public-supplier",
  ), /approved HTTPS catalog/);
});
