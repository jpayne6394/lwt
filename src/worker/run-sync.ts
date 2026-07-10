import { AlertService } from "../alerts/alert-service.ts";
import { planSupplierSync } from "../domain/sync-planner.ts";
import type { BlockedIssue, PlannedChange, SupplierProduct, SyncPlan } from "../domain/types.ts";
import type { ShopifySyncClient } from "../shopify/shopify-sync-client.ts";
import type { SupplierOpsRepository, SyncRun } from "../storage/repository.ts";
import type { SupplierAdapter } from "../suppliers/types.ts";
import { SupplierAdapterError } from "../suppliers/types.ts";

export type SyncWritableShopifyClient = Pick<ShopifySyncClient, "applyChanges">;

export type RunSupplierSyncInput = {
  adapters: SupplierAdapter[];
  repository: SupplierOpsRepository;
  alerts: AlertService;
  shopifyClient: SyncWritableShopifyClient;
  dryRun: boolean;
};

export type RunSupplierSyncResult = {
  run: SyncRun;
  plan: SyncPlan;
};

export async function runSupplierSync(input: RunSupplierSyncInput): Promise<RunSupplierSyncResult> {
  const run = await input.repository.createSyncRun({
    dryRun: input.dryRun,
    supplierCount: input.adapters.length,
  });
  const supplierProducts: SupplierProduct[] = [];
  const issues: BlockedIssue[] = [];

  for (const adapter of input.adapters) {
    try {
      const products = await adapter.fetchProducts();
      supplierProducts.push(...products);
      await input.repository.saveSupplierSnapshot({
        supplierId: adapter.supplier.id,
        capturedAt: new Date().toISOString(),
        products,
      });
    } catch (error) {
      const issue = supplierErrorToIssue(adapter, error);
      issues.push(issue);
      await input.alerts.raise({
        severity: "error",
        kind: issueKindToAlertKind(issue),
        title: `${adapter.supplier.name} sync failed`,
        body: issue.reason,
        email: true,
      });
    }
  }

  const shopifyVariants = await input.repository.listShopifyVariants();
  const mappings = await input.repository.listMappings();
  const plan = planSupplierSync({
    supplierProducts,
    shopifyVariants,
    mappings,
  });

  const allIssues = [...issues, ...plan.issues];
  await input.repository.recordAppliedChanges(run.id, plan.changes);
  await input.repository.recordBlockedIssues(run.id, allIssues);

  if (!input.dryRun && plan.changes.length > 0) {
    await applyShopifyChanges(input, run.id, plan.changes, allIssues);
  }

  const completed = await input.repository.completeSyncRun(run.id, {
    status: allIssues.length > 0 ? "completed_with_issues" : "completed",
    changeCount: plan.changes.length,
    issueCount: allIssues.length,
  });
  await indexSupplierSyncMemory(input.repository, completed, supplierProducts, plan.changes, allIssues);

  return {
    run: completed,
    plan: {
      changes: plan.changes,
      issues: allIssues,
    },
  };
}

async function applyShopifyChanges(
  input: RunSupplierSyncInput,
  runId: string,
  changes: PlannedChange[],
  issues: BlockedIssue[],
): Promise<void> {
  try {
    await input.shopifyClient.applyChanges(changes);
  } catch (error) {
    const issue: BlockedIssue = {
      kind: "shopify_error",
      reason: error instanceof Error ? error.message : "Unknown Shopify write failure",
    };
    issues.push(issue);
    await input.repository.recordBlockedIssues(runId, [issue]);
    await input.alerts.raise({
      severity: "error",
      kind: "shopify_write_failed",
      title: "Shopify write failed",
      body: issue.reason,
      email: true,
    });
  }
}

function supplierErrorToIssue(adapter: SupplierAdapter, error: unknown): BlockedIssue {
  if (error instanceof SupplierAdapterError) {
    return {
      kind: "supplier_error",
      reason: error.message,
      data: {
        supplierId: error.supplierId,
        adapterKind: error.kind,
      },
    };
  }

  return {
    kind: "supplier_error",
    reason: error instanceof Error ? error.message : `${adapter.supplier.name} failed for an unknown reason`,
    data: {
      supplierId: adapter.supplier.id,
    },
  };
}

function issueKindToAlertKind(issue: BlockedIssue): string {
  const adapterKind = String(issue.data?.adapterKind ?? "");
  if (adapterKind === "login_failed") {
    return "supplier_login_failed";
  }
  if (adapterKind === "two_factor_required") {
    return "supplier_two_factor_required";
  }
  if (adapterKind === "not_configured") {
    return "supplier_not_configured";
  }
  return "supplier_sync_failed";
}

async function indexSupplierSyncMemory(
  repository: SupplierOpsRepository,
  completed: SyncRun,
  supplierProducts: SupplierProduct[],
  changes: PlannedChange[],
  issues: BlockedIssue[],
): Promise<void> {
  try {
    await repository.saveMemoryDocument({
      id: `supplier-sync-${completed.id}`,
      sourceType: "inventory_output",
      title: `Supplier sync ${completed.id}`,
      summary: `${supplierProducts.length} supplier products checked; ${changes.length} changes planned; ${issues.length} issues blocked.`,
      content: buildSupplierSyncMemoryContent(supplierProducts, changes, issues),
      relatedProducts: supplierProducts.map((product) => product.title).filter(Boolean).slice(0, 50),
      sensitivity: "internal",
      metadata: {
        runId: completed.id,
        status: completed.status,
        dryRun: completed.dryRun,
        supplierCount: completed.supplierCount,
        changeCount: completed.changeCount,
        issueCount: completed.issueCount,
      },
    });
  } catch {
    // Memory is advisory. Supplier sync should stay operational if memory schema/setup lags behind deployment.
  }
}

function buildSupplierSyncMemoryContent(
  supplierProducts: SupplierProduct[],
  changes: PlannedChange[],
  issues: BlockedIssue[],
): string {
  const suppliers = [...new Set(supplierProducts.map((product) => product.supplierName))].join(", ") || "No suppliers";
  const products = supplierProducts
    .slice(0, 20)
    .map((product) => `${product.supplierName}: ${product.title}${product.sku ? ` (${product.sku})` : ""} - ${product.stockStatus}`)
    .join("\n");
  const changeSummary = summarizeCounts(changes.map((change) => change.type));
  const issueSummary = summarizeCounts(issues.map((issue) => issue.kind));

  return [
    `Suppliers checked: ${suppliers}`,
    `Change types: ${changeSummary || "none"}`,
    `Issue types: ${issueSummary || "none"}`,
    products ? `Sample products:\n${products}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeCounts(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => `${value}: ${count}`).join(", ");
}
