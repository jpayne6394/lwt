import assert from "node:assert/strict";
import test from "node:test";

import { matchSupplierProduct } from "../src/domain/product-matcher.ts";
import type { ProductMapping, ShopifyVariant, SupplierProduct } from "../src/domain/types.ts";

const variants: ShopifyVariant[] = [
  {
    productId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    inventoryItemId: "gid://shopify/InventoryItem/1",
    locationId: "gid://shopify/Location/1",
    handle: "mold-plus-by-desbio",
    title: "MOLD:PLUS by DesBio",
    vendor: "DesBio",
    sku: "MOLD",
    barcode: "",
    price: 36,
    compareAtPrice: null,
    cost: 17.95,
    status: "active",
  },
  {
    productId: "gid://shopify/Product/2",
    variantId: "gid://shopify/ProductVariant/2",
    inventoryItemId: "gid://shopify/InventoryItem/2",
    locationId: "gid://shopify/Location/1",
    handle: "vrm3-micro-by-systemic-formulas",
    title: "VRM3 Micro by Systemic Formulas",
    vendor: "Systemic Formulas",
    sku: "",
    barcode: "123456789012",
    price: 38,
    compareAtPrice: null,
    cost: 19,
    status: "active",
  },
];

test("matcher uses manual mapping before SKU and UPC matches", () => {
  const product: SupplierProduct = {
    supplierId: "desbio",
    supplierName: "DesBio",
    sku: "MOLD",
    title: "Completely Different Supplier Title",
    stockStatus: "in_stock",
    capturedAt: "2026-05-24T12:00:00.000Z",
  };

  const mappings: ProductMapping[] = [
    {
      supplierId: "desbio",
      supplierSku: "MOLD",
      shopifyVariantId: "gid://shopify/ProductVariant/2",
    },
  ];

  assert.deepEqual(matchSupplierProduct(product, variants, mappings), {
    status: "matched",
    strategy: "manual",
    confidence: 1,
    variant: variants[1],
  });
});

test("matcher uses exact SKU and UPC before high-confidence title matching", () => {
  assert.equal(
    matchSupplierProduct(
      {
        supplierId: "desbio",
        supplierName: "DesBio",
        sku: "mold",
        title: "MOLD PLUS",
        stockStatus: "in_stock",
        capturedAt: "2026-05-24T12:00:00.000Z",
      },
      variants,
      [],
    ).strategy,
    "sku",
  );

  assert.equal(
    matchSupplierProduct(
      {
        supplierId: "systemic-formulas",
        supplierName: "Systemic Formulas",
        upc: "123456789012",
        title: "VRM3 Micro",
        stockStatus: "in_stock",
        capturedAt: "2026-05-24T12:00:00.000Z",
      },
      variants,
      [],
    ).strategy,
    "upc",
  );
});

test("matcher accepts high-confidence vendor and title matches without SKU", () => {
  const result = matchSupplierProduct(
    {
      supplierId: "systemic-formulas",
      supplierName: "Systemic Formulas",
      brand: "Systemic Formulas",
      title: "VRM3 Micro by Systemic Formulas",
      stockStatus: "in_stock",
      capturedAt: "2026-05-24T12:00:00.000Z",
    },
    variants,
    [],
  );

  assert.equal(result.status, "matched");
  assert.equal(result.strategy, "title_vendor");
});

test("matcher blocks duplicate exact SKU matches", () => {
  const result = matchSupplierProduct(
    {
      supplierId: "desbio",
      supplierName: "DesBio",
      sku: "MOLD",
      title: "MOLD:PLUS by DesBio",
      stockStatus: "in_stock",
      capturedAt: "2026-05-24T12:00:00.000Z",
    },
    [
      variants[0],
      {
        ...variants[0],
        productId: "gid://shopify/Product/3",
        variantId: "gid://shopify/ProductVariant/3",
      },
    ],
    [],
  );

  assert.deepEqual(result, {
    status: "blocked",
    reason: "Multiple Shopify variants matched supplier SKU MOLD",
  });
});
