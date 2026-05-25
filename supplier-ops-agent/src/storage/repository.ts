import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant, SupplierProduct } from "../domain/types.ts";
import type { CampaignDraftRecord } from "../campaigns/types.ts";
import type { BlogDraftRecord } from "../content/types.ts";
import type { MarketRadarOutputRecord, MarketRadarRunOutput, RevenuePlayRecord } from "../market-radar/types.ts";
import type { ProductOpsOutputRecord, ProductOpsRunOutput } from "../product-ops/types.ts";

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
  recordProductOpsOutput?(runId: string, output: ProductOpsRunOutput): Promise<void>;
  recordMarketRadarOutput?(output: MarketRadarRunOutput): Promise<void>;
  recentMarketRadarOutputs?(limit?: number): Promise<MarketRadarOutputRecord[]>;
  recordRevenuePlays?(plays: RevenuePlayRecord[]): Promise<void>;
  updateRevenuePlayStatus?(id: string, status: RevenuePlayRecord["status"]): Promise<RevenuePlayRecord | null>;
  recentRevenuePlays?(limit?: number): Promise<RevenuePlayRecord[]>;
  recordBlogDraft?(draft: BlogDraftRecord): Promise<void>;
  updateBlogDraftShopifyArticle?(id: string, article: { id: string; handle: string }): Promise<BlogDraftRecord | null>;
  recentBlogDrafts?(limit?: number): Promise<BlogDraftRecord[]>;
  recordCampaignDraft?(draft: CampaignDraftRecord): Promise<void>;
  recentCampaignDrafts?(limit?: number): Promise<CampaignDraftRecord[]>;
  recentRuns(limit?: number): Promise<SyncRun[]>;
  recentChanges(limit?: number): Promise<AppliedChangeRecord[]>;
  recentIssues(limit?: number): Promise<BlockedIssueRecord[]>;
  recentProductOpsOutputs?(limit?: number): Promise<ProductOpsOutputRecord[]>;
};

