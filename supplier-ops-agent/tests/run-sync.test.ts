import assert from "node:assert/strict";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import { runSupplierSync } from "../src/worker/run-sync.ts";
import { SupplierAdapterError } from "../src/suppliers/types.ts";
import type { PlannedChange, ShopifyVariant, SupplierProduct } from "../src/domain/types.ts";
import type { SupplierAdapter } from "../src/suppliers/types.ts";

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

test("runSupplierSync records snapshots, changes, issues, and applies writes outside dry-run mode", async () => {
  const product: SupplierProduct = {
    supplierId: "desbio",
    supplierName: "DesBio",
    sku: "MOLD",
    title: "MOLD:PLUS by DesBio",
    stockStatus: "in_stock",
    cost: 18,
    msrp: 40,
    capturedAt: "2026-05-24T12:00:00.000Z",
  };
  const applied: PlannedChange[] = [];
  const repository = new MemoryRepository({
    shopifyVariants: [shopifyVariant],
  });
  const alerts = new AlertService();

  const result = await runSupplierSync({
    adapters: [successfulAdapter(product)],
    repository,
    alerts,
    shopifyClient: {
      applyChanges: async (changes) => {
        applied.push(...changes);
      },
    },
    dryRun: false,
  });

  assert.equal(result.run.status, "completed");
  assert.equal(repository.listSupplierSnapshots()[0].products.length, 1);
  assert.deepEqual(repository.listAppliedChanges().map((change) => change.type), ["inventory", "cost", "price"]);
  assert.equal(repository.listBlockedIssues().length, 0);
  assert.equal(applied.length, 3);
});

test("runSupplierSync refreshes Shopify catalog before planning changes", async () => {
  const product: SupplierProduct = {
    supplierId: "desbio",
    supplierName: "DesBio",
    sku: "MOLD",
    title: "MOLD:PLUS by DesBio",
    stockStatus: "in_stock",
    cost: 18,
    msrp: 40,
    capturedAt: "2026-05-24T12:00:00.000Z",
  };
  const repository = new MemoryRepository();
  const alerts = new AlertService();

  const result = await runSupplierSync({
    adapters: [successfulAdapter(product)],
    repository,
    alerts,
    shopifyCatalogClient: {
      listVariants: async () => [shopifyVariant],
    },
    shopifyClient: {
      applyChanges: async () => {},
    },
    dryRun: true,
  });

  assert.deepEqual(result.plan.changes.map((change) => change.type), ["inventory", "cost", "price"]);
  assert.equal((await repository.listShopifyVariants())[0].variantId, shopifyVariant.variantId);
});

test("runSupplierSync blocks planning when configured Shopify catalog refresh returns no variants", async () => {
  const product: SupplierProduct = {
    supplierId: "desbio",
    supplierName: "DesBio",
    sku: "MOLD",
    title: "MOLD:PLUS by DesBio",
    stockStatus: "in_stock",
    capturedAt: "2026-05-24T12:00:00.000Z",
  };
  const repository = new MemoryRepository();
  const alerts = new AlertService();

  const result = await runSupplierSync({
    adapters: [successfulAdapter(product)],
    repository,
    alerts,
    shopifyCatalogClient: {
      listVariants: async () => [],
    },
    shopifyClient: {
      applyChanges: async () => {
        throw new Error("should not write");
      },
    },
    dryRun: false,
  });

  assert.equal(result.plan.changes.length, 0);
  assert.equal(result.run.status, "completed_with_issues");
  assert.equal(repository.listBlockedIssues()[0].kind, "shopify_error");
});

test("runSupplierSync alerts and records failed supplier adapters", async () => {
  const sentEmails: unknown[] = [];
  const repository = new MemoryRepository({
    shopifyVariants: [shopifyVariant],
  });
  const alerts = new AlertService({
    sendEmail: async (message) => {
      sentEmails.push(message);
    },
  });

  const result = await runSupplierSync({
    adapters: [failingAdapter()],
    repository,
    alerts,
    shopifyClient: {
      applyChanges: async () => {},
    },
    dryRun: false,
  });

  assert.equal(result.run.status, "completed_with_issues");
  assert.deepEqual(repository.listBlockedIssues().map((issue) => issue.kind), ["supplier_error"]);
  assert.equal(alerts.list()[0].kind, "supplier_login_failed");
  assert.equal(sentEmails.length, 1);
});

function successfulAdapter(product: SupplierProduct): SupplierAdapter {
  return {
    supplier: {
      id: product.supplierId,
      name: product.supplierName,
      mode: "website",
      brands: [product.supplierName],
      notes: "test",
    },
    async fetchProducts() {
      return [product];
    },
  };
}

function failingAdapter(): SupplierAdapter {
  return {
    supplier: {
      id: "desbio",
      name: "DesBio",
      mode: "website",
      brands: ["DesBio"],
      notes: "test",
    },
    async fetchProducts() {
      throw new SupplierAdapterError("desbio", "login_failed", "Bad supplier login");
    },
  };
}
