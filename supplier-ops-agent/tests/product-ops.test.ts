import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductOpsRunOutput,
  evaluateProductReadiness,
} from "../src/product-ops/product-ops-agent.ts";
import type { BlockedIssue, ProductMapping, ShopifyVariant, SupplierProduct } from "../src/domain/types.ts";

const readySupplierProduct: SupplierProduct = {
  supplierId: "desbio",
  supplierName: "DesBio",
  brand: "DesBio",
  sku: "MOLD",
  title: "MOLD:PLUS by DesBio",
  stockStatus: "in_stock",
  quantity: 8,
  msrp: 36,
  capturedAt: "2026-05-24T12:00:00.000Z",
};

const readyVariant: ShopifyVariant = {
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
  productType: "Homeopathic",
  productForm: "Liquid",
  tags: ["immune", "detox"],
  imageUrls: ["https://example.com/mold-plus.jpg"],
  descriptionHtml: "<p>DesBio MOLD:PLUS homeopathic support.</p>",
  inventoryQuantity: 8,
  publishedAt: "2026-05-24T12:00:00.000Z",
};

test("product readiness marks a complete active in-stock confident match promote-ready", () => {
  const result = evaluateProductReadiness({
    supplierProduct: readySupplierProduct,
    shopifyVariant: readyVariant,
    matchConfidence: 1,
    issues: [],
  });

  assert.equal(result.promotionStatus, "PROMOTE_READY");
  assert.deepEqual(result.flags, []);
});

test("product readiness uses the required promotion status priority", () => {
  const result = evaluateProductReadiness({
    supplierProduct: {
      ...readySupplierProduct,
      stockStatus: "out_of_stock",
      quantity: 0,
    },
    shopifyVariant: {
      ...readyVariant,
      inventoryQuantity: 0,
      tags: ["immune", "do-not-promote"],
      imageUrls: [],
      descriptionHtml: "",
    },
    matchConfidence: 0.4,
    issues: [
      {
        kind: "match_uncertain",
        reason: "Supplier product resembles an existing Shopify product but not confidently enough to automate",
      },
    ],
  });

  assert.equal(result.promotionStatus, "DO_NOT_PROMOTE");
  assert.match(result.reasons.join(" "), /do-not-promote/i);
});

test("readiness flags low stock, out of stock, cleanup data, bad page, and review requirements", () => {
  assert.equal(
    evaluateProductReadiness({
      supplierProduct: { ...readySupplierProduct, quantity: 2 },
      shopifyVariant: { ...readyVariant, inventoryQuantity: 2 },
      matchConfidence: 1,
      issues: [],
      lowStockThreshold: 3,
    }).promotionStatus,
    "LOW_STOCK",
  );

  assert.equal(
    evaluateProductReadiness({
      supplierProduct: readySupplierProduct,
      shopifyVariant: { ...readyVariant, publishedAt: null },
      matchConfidence: 1,
      issues: [],
    }).promotionStatus,
    "DO_NOT_PROMOTE",
  );

  assert.equal(
    evaluateProductReadiness({
      supplierProduct: { ...readySupplierProduct, stockStatus: "out_of_stock" },
      shopifyVariant: readyVariant,
      matchConfidence: 1,
      issues: [],
    }).promotionStatus,
    "OUT_OF_STOCK",
  );

  assert.equal(
    evaluateProductReadiness({
      supplierProduct: readySupplierProduct,
      shopifyVariant: {
        ...readyVariant,
        productType: "",
        productForm: "",
        tags: [],
      },
      matchConfidence: 1,
      issues: [],
    }).promotionStatus,
    "NEEDS_DATA_CLEANUP",
  );

  assert.equal(
    evaluateProductReadiness({
      supplierProduct: readySupplierProduct,
      shopifyVariant: {
        ...readyVariant,
        imageUrls: [],
      },
      matchConfidence: 1,
      issues: [],
    }).promotionStatus,
    "BAD_PAGE",
  );

  assert.equal(
    evaluateProductReadiness({
      supplierProduct: readySupplierProduct,
      shopifyVariant: readyVariant,
      matchConfidence: 0.5,
      issues: [
        {
          kind: "price_guardrail",
          reason: "Price change exceeds 25% guardrail",
        },
      ],
    }).promotionStatus,
    "REVIEW_REQUIRED",
  );
});

test("Product Ops output summarizes promotion status and produces structured tasks", () => {
  const blockedIssue: BlockedIssue = {
    kind: "match_uncertain",
    supplierProduct: {
      ...readySupplierProduct,
      sku: "OTHER",
      title: "Other DesBio Item",
    },
    reason: "Supplier product resembles an existing Shopify product but not confidently enough to automate",
  };
  const mappings: ProductMapping[] = [];

  const output = buildProductOpsRunOutput({
    runId: "run_1",
    runType: "full_product_ops_check",
    dryRun: true,
    startedAt: "2026-05-25T04:00:00.000Z",
    finishedAt: "2026-05-25T04:05:00.000Z",
    supplierProducts: [readySupplierProduct, blockedIssue.supplierProduct!],
    shopifyVariants: [readyVariant],
    mappings,
    changes: [],
    issues: [blockedIssue],
    supplierCount: 1,
  });

  assert.equal(output.agent, "product_ops");
  assert.equal(output.mode, "dry_run");
  assert.equal(output.summary.productsChecked, 2);
  assert.equal(output.summary.variantsChecked, 1);
  assert.equal(output.summary.promoteReady, 1);
  assert.equal(output.summary.reviewRequired, 1);
  assert.equal(output.productsToPromote[0].promotionStatus, "PROMOTE_READY");
  assert.equal(output.productsToAvoid[0].promotionStatus, "REVIEW_REQUIRED");
  assert.equal(output.promotionTasks[0].actionType, "PROMOTE");
  assert.equal(output.reviewTasks[0].actionType, "REVIEW");
  assert.match(output.reviewTasks[0].title, /Supplier match uncertain/i);
});
