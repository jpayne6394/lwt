import type { BlockedIssue, PlannedChange, ShopifyVariant, SupplierProduct } from "../domain/types.ts";

export type ProductOpsRunType = "inventory_check" | "product_health_check" | "full_product_ops_check";
export type ProductOpsMode = "dry_run" | "apply_changes";

export type PromotionStatus =
  | "PROMOTE_READY"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "NEEDS_DATA_CLEANUP"
  | "BAD_PAGE"
  | "DO_NOT_PROMOTE"
  | "REVIEW_REQUIRED";

export type ProductOpsActionType = "PROMOTE" | "FIX" | "WRITE" | "AUTOMATE" | "IGNORE" | "REVIEW";

export type ProductOpsProductResult = {
  supplierId: string;
  supplierName: string;
  productId?: string;
  variantId?: string;
  title: string;
  vendor?: string;
  sku?: string;
  productUrl?: string;
  promotionStatus: PromotionStatus;
  matchConfidence: number;
  flags: string[];
  reasons: string[];
  price?: number;
  stockStatus?: SupplierProduct["stockStatus"];
};

export type ProductOpsTask = {
  actionType: ProductOpsActionType;
  title: string;
  detail: string;
  promotionStatus?: PromotionStatus;
  supplierId?: string;
  productId?: string;
  variantId?: string;
  sku?: string;
};

export type ProductOpsError = {
  source: string;
  kind: BlockedIssue["kind"];
  message: string;
  supplierId?: string;
};

export type ProductOpsRunOutput = {
  runId: string;
  agent: "product_ops";
  runType: ProductOpsRunType;
  mode: ProductOpsMode;
  startedAt: string;
  finishedAt: string;
  summary: {
    productsChecked: number;
    variantsChecked: number;
    suppliersChecked: number;
    promoteReady: number;
    lowStock: number;
    outOfStock: number;
    needsDataCleanup: number;
    badPage: number;
    doNotPromote: number;
    reviewRequired: number;
    errors: number;
  };
  productsToPromote: ProductOpsProductResult[];
  productsToAvoid: ProductOpsProductResult[];
  promotionTasks: ProductOpsTask[];
  cleanupTasks: ProductOpsTask[];
  reviewTasks: ProductOpsTask[];
  errors: ProductOpsError[];
  plannedChanges: PlannedChange[];
  blockedIssues: BlockedIssue[];
};

export type ProductOpsOutputRecord = ProductOpsRunOutput & {
  id: string;
  createdAt: string;
};
