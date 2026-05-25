import assert from "node:assert/strict";
import test from "node:test";

import { JsonFeedSupplierAdapter } from "../src/suppliers/json-feed-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const physiciansStandard: SupplierConfig = {
  id: "physicians-standard",
  name: "Physicians' Standard",
  mode: "website",
  brands: ["Physicians' Standard"],
  notes: "",
};

const researchedNutritionals: SupplierConfig = {
  id: "research-nutritionals",
  name: "Research Nutritionals",
  mode: "website",
  brands: ["Research Nutritionals"],
  notes: "",
};

test("JsonFeedSupplierAdapter maps Shopify product feeds into normalized supplier products", async () => {
  await withFetch(
    {
      products: [
        {
          title: "Vitality Formula",
          handle: "vitality-formula",
          variants: [
            {
              sku: "66D",
              barcode: "123456789012",
              price: "40.00",
              compare_at_price: "50.00",
              available: true,
            },
          ],
          images: [{ src: "https://cdn.example.com/vitality.png" }],
        },
      ],
    },
    async () => {
      const adapter = new JsonFeedSupplierAdapter(
        physiciansStandard,
        "https://www.physiciansstandard.com/products.json?limit=250",
      );

      const products = await adapter.fetchProducts({ now: new Date("2026-05-24T12:00:00.000Z") });

      assert.deepEqual(products[0], {
        supplierId: "physicians-standard",
        supplierName: "Physicians' Standard",
        brand: "Physicians' Standard",
        sku: "66D",
        upc: "123456789012",
        title: "Vitality Formula",
        stockStatus: "in_stock",
        quantity: undefined,
        cost: undefined,
        msrp: 50,
        salePrice: 40,
        productUrl: "https://www.physiciansstandard.com/products/vitality-formula",
        imageUrls: ["https://cdn.example.com/vitality.png"],
        capturedAt: "2026-05-24T12:00:00.000Z",
      });
    },
  );
});

test("JsonFeedSupplierAdapter maps WooCommerce Store API products into normalized supplier products", async () => {
  await withFetch(
    [
      {
        name: "GLP-4TE Weight &amp; Metabolic System Guide",
        sku: "RN185",
        permalink: "https://www.researchednutritionals.com/product/mycopul-90/",
        is_in_stock: true,
        prices: {
          regular_price: "11598",
          sale_price: "0",
          price: "0",
          currency_minor_unit: 2,
        },
        images: [{ src: "https://www.researchednutritionals.com/mycopul.png" }],
      },
    ],
    async () => {
      const adapter = new JsonFeedSupplierAdapter(
        researchedNutritionals,
        "https://www.researchednutritionals.com/wp-json/wc/store/v1/products?per_page=100",
      );

      const products = await adapter.fetchProducts({ now: new Date("2026-05-24T12:00:00.000Z") });

      assert.equal(products[0].supplierName, "Research Nutritionals");
      assert.equal(products[0].brand, "Research Nutritionals");
      assert.equal(products[0].title, "GLP-4TE Weight & Metabolic System Guide");
      assert.equal(products[0].sku, "RN185");
      assert.equal(products[0].stockStatus, "in_stock");
      assert.equal(products[0].msrp, 115.98);
      assert.equal(products[0].productUrl, "https://www.researchednutritionals.com/product/mycopul-90/");
      assert.deepEqual(products[0].imageUrls, ["https://www.researchednutritionals.com/mycopul.png"]);
    },
  );
});

test("JsonFeedSupplierAdapter tolerates WooCommerce feeds with HTML prepended before JSON", async () => {
  await withFetchText(
    '<style>.price{display:none}</style>[{"name":"MOLD:1M","sku":"MOLD1M","is_in_stock":false}]',
    async () => {
      const adapter = new JsonFeedSupplierAdapter(
        researchedNutritionals,
        "https://desbio.com/wp-json/wc/store/v1/products?per_page=100",
      );

      const products = await adapter.fetchProducts({ now: new Date("2026-05-24T12:00:00.000Z") });

      assert.equal(products[0].title, "MOLD:1M");
      assert.equal(products[0].sku, "MOLD1M");
      assert.equal(products[0].stockStatus, "out_of_stock");
    },
  );
});

async function withFetch(body: unknown, callback: () => Promise<void>) {
  return withFetchText(JSON.stringify(body), callback);
}

async function withFetchText(body: string, callback: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(body, { status: 200 });

  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
