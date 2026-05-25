import assert from "node:assert/strict";
import test from "node:test";

import { EmersonCatalogSupplierAdapter } from "../src/suppliers/emerson-catalog-adapter.ts";
import type { SupplierConfig } from "../src/suppliers/types.ts";

const emerson: SupplierConfig = {
  id: "emerson-ecologics",
  name: "Emerson Ecologics",
  mode: "website",
  brands: ["Pure Encapsulations"],
  notes: "",
};

test("EmersonCatalogSupplierAdapter maps embedded catalog state into supplier products", async () => {
  const html = htmlWithApolloState({
    "Product:product-1": {
      __typename: "Product",
      id: "product-1",
      name: "Magnesium Glycinate, 120 mg",
      slug: "magnesium-glycinate-120-mg",
      brand: { __ref: "Brand:brand-1" },
      availableOrMasterVariant: { __ref: "Variant:variant-1" },
    },
    "Brand:brand-1": {
      __typename: "Brand",
      name: "Pure Encapsulations",
    },
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
  });

  await withFetch(html, async ({ requestedHeaders }) => {
    const adapter = new EmersonCatalogSupplierAdapter(emerson, {
      catalogUrls: ["https://www.emersonecologics.com/shop"],
      cookieHeader: "session=abc123; other=value",
    });

    const products = await adapter.fetchProducts({ now: new Date("2026-05-24T12:00:00.000Z") });

    assert.equal(requestedHeaders.cookie, "session=abc123; other=value");
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
      capturedAt: "2026-05-24T12:00:00.000Z",
    });
  });
});

test("EmersonCatalogSupplierAdapter blocks expired cookie pages that do not expose catalog state", async () => {
  await withFetch("<html><body>Sign in to view price</body></html>", async () => {
    const adapter = new EmersonCatalogSupplierAdapter(emerson, {
      catalogUrls: ["https://www.emersonecologics.com/shop"],
      cookieHeader: "expired=true",
    });

    await assert.rejects(adapter.fetchProducts(), /Emerson catalog page did not include product state/);
  });
});

function htmlWithApolloState(state: Record<string, unknown>): string {
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(state)), "utf8").toString("base64");
  return `<html><head><meta name="apollo-state" content="${encoded}"/></head></html>`;
}

async function withFetch(body: string, callback: (input: { requestedHeaders: Record<string, string> }) => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const requestedHeaders: Record<string, string> = {};

  globalThis.fetch = async (_url, init) => {
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      requestedHeaders[key.toLowerCase()] = value;
    }

    return new Response(body, { status: 200 });
  };

  try {
    await callback({ requestedHeaders });
  } finally {
    globalThis.fetch = originalFetch;
  }
}
