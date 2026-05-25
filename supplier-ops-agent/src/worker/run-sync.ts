import { AlertService } from "../alerts/alert-service.ts";
import { planSupplierSync } from "../domain/sync-planner.ts";
import type { BlockedIssue, PlannedChange, ShopifyVariant, SupplierProduct, SyncPlan } from "../domain/types.ts";
import { buildProductOpsRunOutput } from "../product-ops/product-ops-agent.ts";
import type { ProductOpsRunOutput } from "../product-ops/types.ts";
import type { ShopifySyncClient } from "../shopify/shopify-sync-client.ts";
import type { SupplierOpsRepository, SyncRun } from "../storage/repository.ts";
import type { SupplierAdapter } from "../suppliers/types.ts";
import { SupplierAdapterError } from "../suppliers/types.ts";

export type SyncWritableShopifyClient = Pick<ShopifySyncClient, "applyChanges">;

export type SyncReadableShopifyCatalogClient = {
  listVariants(): Promise<ShopifyVariant[]>;
};

export type RunSupplierSyncInput = {
  adapters: SupplierAdapter[];
  repository: SupplierOpsRepository;
  alerts: AlertService;
  shopifyCatalogClient?: SyncReadableShopifyCatalogClient;
  shopifyClient: SyncWritableShopifyClient;
  dryRun: boolean;
};

export type RunSupplierSyncResult = {
  run: SyncRun;
  plan: SyncPlan;
  productOpsOutput: ProductOpsRunOutput;
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

  const shopifyVariants = await loadShopifyVariants(input, run.id, issues);
  const mappings = await input.repository.listMappings();
  if (input.shopifyCatalogClient && shopifyVariants.length === 0) {
    const allIssues = [...issues, ...shopifyCatalogUnavailableIssue()];
    await input.repository.recordBlockedIssues(run.id, allIssues);
    const completed = await input.repository.completeSyncRun(run.id, {
      status: "completed_with_issues",
      changeCount: 0,
      issueCount: allIssues.length,
    });
    const productOpsOutput = await recordProductOpsOutput({
      input,
      run: completed,
      supplierProducts,
      shopifyVariants,
      mappings,
      changes: [],
      issues: allIssues,
    });
    return {
      run: completed,
      plan: {
        changes: [],
        issues: allIssues,
      },
      productOpsOutput,
    };
  }

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
  const productOpsOutput = await recordProductOpsOutput({
    input,
    run: completed,
    supplierProducts,
    shopifyVariants,
    mappings,
    changes: plan.changes,
    issues: allIssues,
  });

  return {
    run: completed,
    plan: {
      changes: plan.changes,
      issues: allIssues,
    },
    productOpsOutput,
  };
}

async function recordProductOpsOutput(input: {
  input: RunSupplierSyncInput;
  run: SyncRun;
  supplierProducts: SupplierProduct[];
  shopifyVariants: ShopifyVariant[];
  mappings: Awaited<ReturnType<SupplierOpsRepository["listMappings"]>>;
  changes: PlannedChange[];
  issues: BlockedIssue[];
}): Promise<ProductOpsRunOutput> {
  const output = buildProductOpsRunOutput({
    runId: input.run.id,
    runType: "full_product_ops_check",
    dryRun: input.input.dryRun,
    startedAt: input.run.startedAt,
    finishedAt: input.run.completedAt ?? new Date().toISOString(),
    supplierProducts: input.supplierProducts,
    shopifyVariants: input.shopifyVariants,
    mappings: input.mappings,
    changes: input.changes,
    issues: input.issues,
    supplierCount: input.input.adapters.length,
  });

  await input.input.repository.recordProductOpsOutput?.(input.run.id, output);
  return output;
}

async function loadShopifyVariants(
  input: RunSupplierSyncInput,
  runId: string,
  issues: BlockedIssue[],
): Promise<ShopifyVariant[]> {
  if (!input.shopifyCatalogClient) {
    return input.repository.listShopifyVariants();
  }

  try {
    const variants = await input.shopifyCatalogClient.listVariants();
    await input.repository.saveShopifyVariants?.(variants);
    return variants;
  } catch (error) {
    const issue: BlockedIssue = {
      kind: "shopify_error",
      reason: `Shopify catalog refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    issues.push(issue);
    await input.alerts.raise({
      severity: "error",
      kind: "shopify_catalog_refresh_failed",
      title: "Shopify catalog refresh failed",
      body: issue.reason,
      email: true,
    });
    return input.repository.listShopifyVariants();
  }
}

function shopifyCatalogUnavailableIssue(): BlockedIssue[] {
  return [
    {
      kind: "shopify_error",
      reason: "Shopify catalog refresh returned no variants, so supplier planning was blocked to prevent draft-only writes.",
    },
  ];
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

