import assert from "node:assert/strict";
import test from "node:test";

import { planSupplierSync } from "../src/domain/sync-planner.ts";
import type { ShopifyVariant, SupplierProduct } from "../src/domain/types.ts";

const shopifyVariant: ShopifyVariant = {
  productId: "gid://shopify/Product/1",
  variantId: "gid://shopify/ProductVariant/1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  locationId: "gid://shopify/Location/10",
  handle: "mold-plus-by-desbio",
  title: "MOLD:PLUS by DesBio",
  vendor: "DesBio",
  sku: "MOLD",
  barcode: "",
  price: 36,
  compareAtPrice: null,
  cost: 17.95,
  status: "active",
};

test("sync planner creates inventory, cost, and price changes for matched products", () => {
  const supplierProducts: SupplierProduct[] = [
    {
      supplierId: "desbio",
      supplierName: "DesBio",
      sku: "MOLD",
      title: "MOLD:PLUS by DesBio",
      stockStatus: "in_stock",
      quantity: 8,
      cost: 18,
      msrp: 40,
      capturedAt: "2026-05-24T12:00:00.000Z",
    },
  ];

  const plan = planSupplierSync({
    supplierProducts,
    shopifyVariants: [shopifyVariant],
    mappings: [],
  });

  assert.deepEqual(plan.issues, []);
  assert.deepEqual(
    plan.changes.map((change) => change.type),
    ["inventory", "cost", "price"],
  );
});

test("sync planner drafts new products when no Shopify match exists", () => {
  const product: SupplierProduct = {
    supplierId: "desbio",
    supplierName: "DesBio",
    sku: "NEW-SKU",
    title: "New Supplier Item",
    brand: "DesBio",
    stockStatus: "in_stock",
    cost: 12,
    msrp: 24,
    capturedAt: "2026-05-24T12:00:00.000Z",
  };

  const plan = planSupplierSync({
    supplierProducts: [product],
    shopifyVariants: [shopifyVariant],
    mappings: [],
  });

  assert.deepEqual(plan.changes, [
    {
      type: "draft_product",
      supplierProduct: product,
      draftPrice: 24,
      reason: "No matching Shopify product found",
    },
  ]);
  assert.deepEqual(plan.issues, []);
});

test("sync planner blocks uncertain matches and big price swings", () => {
  const plan = planSupplierSync({
    supplierProducts: [
      {
        supplierId: "desbio",
        supplierName: "DesBio",
        title: "Vague Mold Product",
        stockStatus: "in_stock",
        cost: 20,
        msrp: 80,
        capturedAt: "2026-05-24T12:00:00.000Z",
      },
      {
        supplierId: "desbio",
        supplierName: "DesBio",
        sku: "MOLD",
        title: "MOLD:PLUS by DesBio",
        stockStatus: "in_stock",
        cost: 20,
        msrp: 80,
        capturedAt: "2026-05-24T12:00:00.000Z",
      },
    ],
    shopifyVariants: [shopifyVariant],
    mappings: [],
  });

  assert.equal(plan.changes.some((change) => change.type === "price"), false);
  assert.deepEqual(
    plan.issues.map((issue) => issue.kind),
    ["match_uncertain", "price_guardrail"],
  );
});
