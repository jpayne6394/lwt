import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant, SupplierProduct } from "../domain/types.ts";

export type SyncRunStatus = "running" | "completed" | "completed_with_issues" | "failed";

export type SyncRun = {
  id: string;
  dryRun: boolean;
  status: SyncRunStatus;
  startedAt: string;
  completedAt: string | null;
  supplierCount: number;
  changeCount: number;
  issueCount: number;
};

export type SupplierSnapshot = {
  supplierId: string;
  capturedAt: string;
  products: SupplierProduct[];
};

export type AppliedChangeRecord = PlannedChange & {
  id: string;
  runId: string;
  createdAt: string;
};

export type BlockedIssueRecord = BlockedIssue & {
  id: string;
  runId: string;
  createdAt: string;
};

export type CreateSyncRunInput = {
  dryRun: boolean;
  supplierCount: number;
};

export type CompleteSyncRunInput = {
  status: SyncRunStatus;
  changeCount: number;
  issueCount: number;
};

export type SupplierOpsRepository = {
  createSyncRun(input: CreateSyncRunInput): Promise<SyncRun>;
  completeSyncRun(runId: string, input: CompleteSyncRunInput): Promise<SyncRun>;
  listShopifyVariants(): Promise<ShopifyVariant[]>;
  saveShopifyVariants?(variants: ShopifyVariant[]): Promise<void>;
  listMappings(): Promise<ProductMapping[]>;
  saveSupplierSnapshot(snapshot: SupplierSnapshot): Promise<void>;
  recordAppliedChanges(runId: string, changes: PlannedChange[]): Promise<void>;
  recordBlockedIssues(runId: string, issues: BlockedIssue[]): Promise<void>;
  recentRuns(limit?: number): Promise<SyncRun[]>;
  recentChanges(limit?: number): Promise<AppliedChangeRecord[]>;
  recentIssues(limit?: number): Promise<BlockedIssueRecord[]>;
};

