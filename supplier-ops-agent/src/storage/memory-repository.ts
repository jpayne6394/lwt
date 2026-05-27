import type {
  AppliedChangeRecord,
  BlockedIssueRecord,
  CompleteSyncRunInput,
  CreateSyncRunInput,
  SupplierOpsRepository,
  SupplierSnapshot,
  SyncRun,
} from "./repository.ts";
import type { CampaignDraftRecord } from "../campaigns/types.ts";
import type { BlogDraftRecord } from "../content/types.ts";
import type { BusinessActionLogRecord, DailyCommandReport } from "../business-os/types.ts";
import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant } from "../domain/types.ts";
import type { MarketRadarOutputRecord, MarketRadarRunOutput, RevenuePlayRecord } from "../market-radar/types.ts";
import type { ProductOpsOutputRecord, ProductOpsRunOutput } from "../product-ops/types.ts";
import type { ActionQueueEvent, ActionQueueItem } from "../action-queue/types.ts";

export type MemoryRepositorySeed = {
  shopifyVariants?: ShopifyVariant[];
  mappings?: ProductMapping[];
};

export class MemoryRepository implements SupplierOpsRepository {
  readonly #shopifyVariants: ShopifyVariant[];
  readonly #mappings: ProductMapping[];
  readonly #runs: SyncRun[] = [];
  readonly #snapshots: SupplierSnapshot[] = [];
  readonly #changes: AppliedChangeRecord[] = [];
  readonly #issues: BlockedIssueRecord[] = [];
  readonly #productOpsOutputs: ProductOpsOutputRecord[] = [];
  readonly #marketRadarOutputs: MarketRadarOutputRecord[] = [];
  readonly #revenuePlays: RevenuePlayRecord[] = [];
  readonly #blogDrafts: BlogDraftRecord[] = [];
  readonly #campaignDrafts: CampaignDraftRecord[] = [];
  readonly #businessActionLogs: BusinessActionLogRecord[] = [];
  readonly #dailyCommandReports: DailyCommandReport[] = [];
  readonly #actionQueueItems: ActionQueueItem[] = [];
  readonly #actionQueueEvents: ActionQueueEvent[] = [];

  constructor(seed: MemoryRepositorySeed = {}) {
    this.#shopifyVariants = seed.shopifyVariants ?? [];
    this.#mappings = seed.mappings ?? [];
  }

  async createSyncRun(input: CreateSyncRunInput): Promise<SyncRun> {
    const run: SyncRun = {
      id: `run_${Date.now()}_${this.#runs.length + 1}`,
      dryRun: input.dryRun,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      supplierCount: input.supplierCount,
      changeCount: 0,
      issueCount: 0,
    };
    this.#runs.unshift(run);
    return run;
  }

  async completeSyncRun(runId: string, input: CompleteSyncRunInput): Promise<SyncRun> {
    const run = this.#runs.find((candidate) => candidate.id === runId);
    if (!run) {
      throw new Error(`Sync run ${runId} was not found`);
    }

    run.status = input.status;
    run.completedAt = new Date().toISOString();
    run.changeCount = input.changeCount;
    run.issueCount = input.issueCount;
    return run;
  }

  async listShopifyVariants(): Promise<ShopifyVariant[]> {
    return [...this.#shopifyVariants];
  }

  async saveShopifyVariants(variants: ShopifyVariant[]): Promise<void> {
    this.#shopifyVariants.splice(0, this.#shopifyVariants.length, ...variants);
  }

  async listMappings(): Promise<ProductMapping[]> {
    return [...this.#mappings];
  }

  async saveSupplierSnapshot(snapshot: SupplierSnapshot): Promise<void> {
    this.#snapshots.unshift(snapshot);
  }

  async recordAppliedChanges(runId: string, changes: PlannedChange[]): Promise<void> {
    this.#changes.unshift(
      ...changes.map((change, index) => ({
        ...change,
        id: `change_${Date.now()}_${this.#changes.length + index + 1}`,
        runId,
        createdAt: new Date().toISOString(),
      })),
    );
  }

  async recordBlockedIssues(runId: string, issues: BlockedIssue[]): Promise<void> {
    this.#issues.unshift(
      ...issues.map((issue, index) => ({
        ...issue,
        id: `issue_${Date.now()}_${this.#issues.length + index + 1}`,
        runId,
        createdAt: new Date().toISOString(),
      })),
    );
  }

  async recordProductOpsOutput(runId: string, output: ProductOpsRunOutput): Promise<void> {
    this.#productOpsOutputs.unshift({
      ...output,
      id: `product_ops_${Date.now()}_${this.#productOpsOutputs.length + 1}`,
      runId,
      createdAt: new Date().toISOString(),
    });
  }

  async recordMarketRadarOutput(output: MarketRadarRunOutput): Promise<void> {
    const id = `radar_${Date.now()}_${this.#marketRadarOutputs.length + 1}`;
    this.#marketRadarOutputs.unshift({
      ...output,
      id,
      runId: id,
      createdAt: new Date().toISOString(),
    });
    await this.recordRevenuePlays(output.revenuePlays);
  }

  async recentMarketRadarOutputs(limit = 20): Promise<MarketRadarOutputRecord[]> {
    return this.#marketRadarOutputs.slice(0, limit);
  }

  async recordRevenuePlays(plays: RevenuePlayRecord[]): Promise<void> {
    for (const play of plays) {
      const existingIndex = this.#revenuePlays.findIndex((candidate) => candidate.id === play.id);
      if (existingIndex >= 0) {
        this.#revenuePlays[existingIndex] = {
          ...this.#revenuePlays[existingIndex],
          ...play,
          status: this.#revenuePlays[existingIndex].status,
          updatedAt: play.updatedAt,
        };
      } else {
        this.#revenuePlays.unshift(play);
      }
    }
  }

  async updateRevenuePlayStatus(id: string, status: RevenuePlayRecord["status"]): Promise<RevenuePlayRecord | null> {
    const play = this.#revenuePlays.find((candidate) => candidate.id === id);
    if (!play) {
      return null;
    }
    play.status = status;
    play.updatedAt = new Date().toISOString();
    return play;
  }

  async recentRevenuePlays(limit = 50): Promise<RevenuePlayRecord[]> {
    return this.#revenuePlays.slice(0, limit);
  }

  async recordBlogDraft(draft: BlogDraftRecord): Promise<void> {
    this.#blogDrafts.unshift(draft);
  }

  async updateBlogDraftShopifyArticle(id: string, article: { id: string; handle: string }): Promise<BlogDraftRecord | null> {
    const draft = this.#blogDrafts.find((candidate) => candidate.id === id);
    if (!draft) {
      return null;
    }
    draft.status = "CREATED_IN_SHOPIFY";
    draft.shopifyArticleId = article.id;
    draft.shopifyArticleHandle = article.handle;
    draft.updatedAt = new Date().toISOString();
    return draft;
  }

  async recentBlogDrafts(limit = 50): Promise<BlogDraftRecord[]> {
    return this.#blogDrafts.slice(0, limit);
  }

  async recordCampaignDraft(draft: CampaignDraftRecord): Promise<void> {
    this.#campaignDrafts.unshift(draft);
  }

  async recentCampaignDrafts(limit = 50): Promise<CampaignDraftRecord[]> {
    return this.#campaignDrafts.slice(0, limit);
  }

  async recordBusinessActionLog(record: BusinessActionLogRecord): Promise<void> {
    this.#businessActionLogs.unshift(record);
  }

  async recentBusinessActionLogs(limit = 50): Promise<BusinessActionLogRecord[]> {
    return this.#businessActionLogs.slice(0, limit);
  }

  async recordDailyCommandReport(report: DailyCommandReport): Promise<void> {
    this.#dailyCommandReports.unshift(report);
  }

  async recentDailyCommandReports(limit = 20): Promise<DailyCommandReport[]> {
    return this.#dailyCommandReports.slice(0, limit);
  }

  async upsertActionQueueItem(item: ActionQueueItem): Promise<ActionQueueItem> {
    const existingIndex = this.#actionQueueItems.findIndex((candidate) => candidate.id === item.id);
    if (existingIndex >= 0) {
      this.#actionQueueItems[existingIndex] = item;
    } else {
      this.#actionQueueItems.unshift(item);
    }
    this.#actionQueueItems.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
    return item;
  }

  async findActionQueueItemByDedupeKey(dedupeKey: string): Promise<ActionQueueItem | null> {
    return this.#actionQueueItems.find((candidate) => candidate.dedupe_key === dedupeKey) ?? null;
  }

  async findActionQueueItemById(id: string): Promise<ActionQueueItem | null> {
    return this.#actionQueueItems.find((candidate) => candidate.id === id) ?? null;
  }

  async listActionQueueItems(limit = 100): Promise<ActionQueueItem[]> {
    return this.#actionQueueItems.slice(0, limit);
  }

  async listCompletedActionQueueItems(limit = 100): Promise<ActionQueueItem[]> {
    return this.#actionQueueItems
      .filter((item) => item.status === "done" || item.status === "rejected" || item.status === "ignored")
      .slice(0, limit);
  }

  async recordActionQueueEvent(event: ActionQueueEvent): Promise<void> {
    this.#actionQueueEvents.unshift(event);
  }

  async recentActionQueueEvents(limit = 100): Promise<ActionQueueEvent[]> {
    return this.#actionQueueEvents.slice(0, limit);
  }

  async recentRuns(limit = 20): Promise<SyncRun[]> {
    return this.#runs.slice(0, limit);
  }

  async recentChanges(limit = 50): Promise<AppliedChangeRecord[]> {
    return this.#changes.slice(0, limit);
  }

  async recentIssues(limit = 50): Promise<BlockedIssueRecord[]> {
    return this.#issues.slice(0, limit);
  }

  async recentProductOpsOutputs(limit = 20): Promise<ProductOpsOutputRecord[]> {
    return this.#productOpsOutputs.slice(0, limit);
  }

  listSupplierSnapshots(): SupplierSnapshot[] {
    return [...this.#snapshots];
  }

  listAppliedChanges(): AppliedChangeRecord[] {
    return [...this.#changes];
  }

  listBlockedIssues(): BlockedIssueRecord[] {
    return [...this.#issues];
  }

  listProductOpsOutputs(): ProductOpsOutputRecord[] {
    return [...this.#productOpsOutputs];
  }

  listMarketRadarOutputs(): MarketRadarOutputRecord[] {
    return [...this.#marketRadarOutputs];
  }

  listRevenuePlays(): RevenuePlayRecord[] {
    return [...this.#revenuePlays];
  }

  listBusinessActionLogs(): BusinessActionLogRecord[] {
    return [...this.#businessActionLogs];
  }

  listDailyCommandReports(): DailyCommandReport[] {
    return [...this.#dailyCommandReports];
  }

  listActionQueue(): ActionQueueItem[] {
    return [...this.#actionQueueItems];
  }

  listActionQueueEvents(): ActionQueueEvent[] {
    return [...this.#actionQueueEvents];
  }
}

