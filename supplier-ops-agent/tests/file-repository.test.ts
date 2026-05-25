import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ShopifyVariant } from "../src/domain/types.ts";
import type { ProductOpsRunOutput } from "../src/product-ops/types.ts";
import { FileRepository } from "../src/storage/file-repository.ts";

const variant: ShopifyVariant = {
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
};

test("file repository persists runs, changes, and issues across instances", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supplier-ops-agent-"));
  const filePath = join(directory, "store.json");

  try {
    const repository = await FileRepository.connect(filePath);
    const run = await repository.createSyncRun({ dryRun: true, supplierCount: 1 });
    await repository.saveShopifyVariants([variant]);
    await repository.recordAppliedChanges(run.id, [
      {
        type: "inventory",
        variantId: variant.variantId,
        inventoryItemId: variant.inventoryItemId,
        locationId: variant.locationId,
        quantity: 10,
        reason: "Supplier stock in stock without exact quantity",
      },
    ]);
    await repository.recordBlockedIssues(run.id, [
      {
        kind: "price_guardrail",
        supplierProduct: {
          supplierId: "desbio",
          supplierName: "DesBio",
          sku: "MOLD",
          title: "MOLD:PLUS by DesBio",
          stockStatus: "in_stock",
          capturedAt: "2026-05-24T12:00:00.000Z",
        },
        shopifyVariant: variant,
        reason: "Price change exceeds 25% guardrail",
      },
    ]);
    await repository.recordProductOpsOutput(run.id, productOpsOutput(run.id));
    await repository.completeSyncRun(run.id, {
      status: "completed_with_issues",
      changeCount: 1,
      issueCount: 1,
    });

    const reloaded = await FileRepository.connect(filePath);

    assert.equal((await reloaded.recentRuns())[0].status, "completed_with_issues");
    assert.deepEqual(await reloaded.listShopifyVariants(), []);
    assert.equal((await reloaded.recentChanges())[0].type, "inventory");
    assert.equal((await reloaded.recentIssues())[0].kind, "price_guardrail");
    assert.equal((await reloaded.recentProductOpsOutputs())[0].agent, "product_ops");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("file repository marks interrupted running runs as failed on restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supplier-ops-agent-"));
  const filePath = join(directory, "store.json");

  try {
    const repository = await FileRepository.connect(filePath);
    await repository.createSyncRun({ dryRun: true, supplierCount: 1 });

    const reloaded = await FileRepository.connect(filePath);
    const [run] = await reloaded.recentRuns();

    assert.equal(run.status, "failed");
    assert.equal(run.issueCount, 1);
    assert.ok(run.completedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function productOpsOutput(runId: string): ProductOpsRunOutput {
  return {
    runId,
    agent: "product_ops",
    runType: "full_product_ops_check",
    mode: "dry_run",
    startedAt: "2026-05-25T04:00:00.000Z",
    finishedAt: "2026-05-25T04:05:00.000Z",
    summary: {
      productsChecked: 1,
      variantsChecked: 1,
      suppliersChecked: 1,
      promoteReady: 0,
      lowStock: 0,
      outOfStock: 0,
      needsDataCleanup: 0,
      badPage: 0,
      doNotPromote: 0,
      reviewRequired: 1,
      errors: 0,
    },
    productsToPromote: [],
    productsToAvoid: [],
    promotionTasks: [],
    cleanupTasks: [],
    reviewTasks: [],
    errors: [],
    plannedChanges: [],
    blockedIssues: [],
  };
}
