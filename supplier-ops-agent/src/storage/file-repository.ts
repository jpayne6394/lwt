import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { CampaignDraftRecord } from "../campaigns/types.ts";
import type { BlogDraftRecord } from "../content/types.ts";
import type { BusinessActionLogRecord, DailyCommandReport } from "../business-os/types.ts";
import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant } from "../domain/types.ts";
import type { MarketRadarOutputRecord, MarketRadarRunOutput, RevenuePlayRecord } from "../market-radar/types.ts";
import type { ProductOpsOutputRecord, ProductOpsRunOutput } from "../product-ops/types.ts";
import type {
  AppliedChangeRecord,
  BlockedIssueRecord,
  CompleteSyncRunInput,
  CreateSyncRunInput,
  SupplierOpsRepository,
  SupplierSnapshot,
  SyncRun,
} from "./repository.ts";

type FileRepositoryState = {
  shopifyVariants: ShopifyVariant[];
  mappings: ProductMapping[];
  runs: SyncRun[];
  snapshots: SupplierSnapshot[];
  changes: AppliedChangeRecord[];
  issues: BlockedIssueRecord[];
  productOpsOutputs: ProductOpsOutputRecord[];
  marketRadarOutputs: MarketRadarOutputRecord[];
  revenuePlays: RevenuePlayRecord[];
  blogDrafts: BlogDraftRecord[];
  campaignDrafts: CampaignDraftRecord[];
  businessActionLogs: BusinessActionLogRecord[];
  dailyCommandReports: DailyCommandReport[];
};

const EMPTY_STATE: FileRepositoryState = {
  shopifyVariants: [],
  mappings: [],
  runs: [],
  snapshots: [],
  changes: [],
  issues: [],
  productOpsOutputs: [],
  marketRadarOutputs: [],
  revenuePlays: [],
  blogDrafts: [],
  campaignDrafts: [],
  businessActionLogs: [],
  dailyCommandReports: [],
};

const MAX_RUNS = 50;
const MAX_SNAPSHOTS = 20;
const MAX_CHANGES = 300;
const MAX_ISSUES = 300;
const MAX_PRODUCT_OPS_OUTPUTS = 20;
const MAX_MARKET_RADAR_OUTPUTS = 20;
const MAX_REVENUE_PLAYS = 200;
const MAX_CONTENT_DRAFTS = 100;
const MAX_BUSINESS_ACTION_LOGS = 500;
const MAX_DAILY_COMMAND_REPORTS = 30;

export class FileRepository implements SupplierOpsRepository {
  readonly #filePath: string;
  #state: FileRepositoryState;
  #persistQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string, state: FileRepositoryState) {
    this.#filePath = filePath;
    this.#state = state;
  }

  static async connect(filePath: string): Promise<FileRepository> {
    const state = recoverInterruptedRuns(await readState(filePath));
    const repository = new FileRepository(filePath, state);
    if (state.runs.some((run) => run.status === "failed" && run.completedAt)) {
      await repository.#persist();
    }
    return repository;
  }

  async createSyncRun(input: CreateSyncRunInput): Promise<SyncRun> {
    const run: SyncRun = {
      id: `run_${Date.now()}_${this.#state.runs.length + 1}`,
      dryRun: input.dryRun,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      supplierCount: input.supplierCount,
      changeCount: 0,
      issueCount: 0,
    };
    this.#state.runs.unshift(run);
    this.#state.runs = this.#state.runs.slice(0, MAX_RUNS);
    await this.#persist();
    return run;
  }

  async completeSyncRun(runId: string, input: CompleteSyncRunInput): Promise<SyncRun> {
    const run = this.#state.runs.find((candidate) => candidate.id === runId);
    if (!run) {
      throw new Error(`Sync run ${runId} was not found`);
    }

    run.status = input.status;
    run.completedAt = new Date().toISOString();
    run.changeCount = input.changeCount;
    run.issueCount = input.issueCount;
    await this.#persist();
    return run;
  }

  async listShopifyVariants(): Promise<ShopifyVariant[]> {
    return [...this.#state.shopifyVariants];
  }

  async saveShopifyVariants(variants: ShopifyVariant[]): Promise<void> {
    this.#state.shopifyVariants = [...variants];
  }

  async listMappings(): Promise<ProductMapping[]> {
    return [...this.#state.mappings];
  }

  async saveSupplierSnapshot(snapshot: SupplierSnapshot): Promise<void> {
    this.#state.snapshots.unshift(snapshot);
    this.#state.snapshots = this.#state.snapshots.slice(0, MAX_SNAPSHOTS);
    await this.#persist();
  }

  async recordAppliedChanges(runId: string, changes: PlannedChange[]): Promise<void> {
    const now = new Date().toISOString();
    this.#state.changes.unshift(
      ...changes.map((change, index) => ({
        ...change,
        id: `change_${Date.now()}_${this.#state.changes.length + index + 1}`,
        runId,
        createdAt: now,
      })),
    );
    this.#state.changes = this.#state.changes.slice(0, MAX_CHANGES);
    await this.#persist();
  }

  async recordBlockedIssues(runId: string, issues: BlockedIssue[]): Promise<void> {
    const now = new Date().toISOString();
    this.#state.issues.unshift(
      ...issues.map((issue, index) => ({
        ...issue,
        id: `issue_${Date.now()}_${this.#state.issues.length + index + 1}`,
        runId,
        createdAt: now,
      })),
    );
    this.#state.issues = this.#state.issues.slice(0, MAX_ISSUES);
    await this.#persist();
  }

  async recordProductOpsOutput(runId: string, output: ProductOpsRunOutput): Promise<void> {
    this.#state.productOpsOutputs.unshift({
      ...output,
      id: `product_ops_${Date.now()}_${this.#state.productOpsOutputs.length + 1}`,
      runId,
      createdAt: new Date().toISOString(),
    });
    this.#state.productOpsOutputs = this.#state.productOpsOutputs.slice(0, MAX_PRODUCT_OPS_OUTPUTS);
    await this.#persist();
  }

  async recordMarketRadarOutput(output: MarketRadarRunOutput): Promise<void> {
    const id = `radar_${Date.now()}_${this.#state.marketRadarOutputs.length + 1}`;
    this.#state.marketRadarOutputs.unshift({
      ...output,
      id,
      runId: id,
      createdAt: new Date().toISOString(),
    });
    this.#state.marketRadarOutputs = this.#state.marketRadarOutputs.slice(0, MAX_MARKET_RADAR_OUTPUTS);
    await this.recordRevenuePlays(output.revenuePlays);
    await this.#persist();
  }

  async recordRevenuePlays(plays: RevenuePlayRecord[]): Promise<void> {
    for (const play of plays) {
      const existingIndex = this.#state.revenuePlays.findIndex((candidate) => candidate.id === play.id);
      if (existingIndex >= 0) {
        this.#state.revenuePlays[existingIndex] = {
          ...this.#state.revenuePlays[existingIndex],
          ...play,
          status: this.#state.revenuePlays[existingIndex].status,
          updatedAt: play.updatedAt,
        };
      } else {
        this.#state.revenuePlays.unshift(play);
      }
    }
    this.#state.revenuePlays = this.#state.revenuePlays.slice(0, MAX_REVENUE_PLAYS);
    await this.#persist();
  }

  async updateRevenuePlayStatus(id: string, status: RevenuePlayRecord["status"]): Promise<RevenuePlayRecord | null> {
    const play = this.#state.revenuePlays.find((candidate) => candidate.id === id);
    if (!play) {
      return null;
    }
    play.status = status;
    play.updatedAt = new Date().toISOString();
    await this.#persist();
    return play;
  }

  async recordBlogDraft(draft: BlogDraftRecord): Promise<void> {
    this.#state.blogDrafts.unshift(draft);
    this.#state.blogDrafts = this.#state.blogDrafts.slice(0, MAX_CONTENT_DRAFTS);
    await this.#persist();
  }

  async updateBlogDraftShopifyArticle(id: string, article: { id: string; handle: string }): Promise<BlogDraftRecord | null> {
    const draft = this.#state.blogDrafts.find((candidate) => candidate.id === id);
    if (!draft) {
      return null;
    }
    draft.status = "CREATED_IN_SHOPIFY";
    draft.shopifyArticleId = article.id;
    draft.shopifyArticleHandle = article.handle;
    draft.updatedAt = new Date().toISOString();
    await this.#persist();
    return draft;
  }

  async recordCampaignDraft(draft: CampaignDraftRecord): Promise<void> {
    this.#state.campaignDrafts.unshift(draft);
    this.#state.campaignDrafts = this.#state.campaignDrafts.slice(0, MAX_CONTENT_DRAFTS);
    await this.#persist();
  }

  async recentRuns(limit = 20): Promise<SyncRun[]> {
    return this.#state.runs.slice(0, limit);
  }

  async recentChanges(limit = 50): Promise<AppliedChangeRecord[]> {
    return this.#state.changes.slice(0, limit);
  }

  async recentIssues(limit = 50): Promise<BlockedIssueRecord[]> {
    return this.#state.issues.slice(0, limit);
  }

  async recentProductOpsOutputs(limit = 20): Promise<ProductOpsOutputRecord[]> {
    return this.#state.productOpsOutputs.slice(0, limit);
  }

  async recentMarketRadarOutputs(limit = 20): Promise<MarketRadarOutputRecord[]> {
    return this.#state.marketRadarOutputs.slice(0, limit);
  }

  async recentRevenuePlays(limit = 50): Promise<RevenuePlayRecord[]> {
    return this.#state.revenuePlays.slice(0, limit);
  }

  async recentBlogDrafts(limit = 50): Promise<BlogDraftRecord[]> {
    return this.#state.blogDrafts.slice(0, limit);
  }

  async recentCampaignDrafts(limit = 50): Promise<CampaignDraftRecord[]> {
    return this.#state.campaignDrafts.slice(0, limit);
  }

  async recordBusinessActionLog(record: BusinessActionLogRecord): Promise<void> {
    this.#state.businessActionLogs.unshift(record);
    this.#state.businessActionLogs = this.#state.businessActionLogs.slice(0, MAX_BUSINESS_ACTION_LOGS);
    await this.#persist();
  }

  async recentBusinessActionLogs(limit = 50): Promise<BusinessActionLogRecord[]> {
    return this.#state.businessActionLogs.slice(0, limit);
  }

  async recordDailyCommandReport(report: DailyCommandReport): Promise<void> {
    this.#state.dailyCommandReports.unshift(report);
    this.#state.dailyCommandReports = this.#state.dailyCommandReports.slice(0, MAX_DAILY_COMMAND_REPORTS);
    await this.#persist();
  }

  async recentDailyCommandReports(limit = 20): Promise<DailyCommandReport[]> {
    return this.#state.dailyCommandReports.slice(0, limit);
  }

  async #persist(): Promise<void> {
    const state = JSON.stringify(
      {
        ...this.#state,
        shopifyVariants: [],
        snapshots: [],
      },
      null,
      2,
    );
    this.#persistQueue = this.#persistQueue.then(async () => {
      await mkdir(dirname(this.#filePath), { recursive: true });
      await writeFile(this.#filePath, state);
    });
    return this.#persistQueue;
  }
}

function recoverInterruptedRuns(state: FileRepositoryState): FileRepositoryState {
  const completedAt = new Date().toISOString();
  return {
    ...state,
    runs: state.runs.map((run) =>
      run.status === "running"
        ? {
            ...run,
            status: "failed",
            completedAt,
            issueCount: Math.max(run.issueCount, 1),
          }
        : run,
    ),
  };
}

async function readState(filePath: string): Promise<FileRepositoryState> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as Partial<FileRepositoryState>;
    return {
      shopifyVariants: Array.isArray(parsed.shopifyVariants) ? parsed.shopifyVariants : [],
      mappings: Array.isArray(parsed.mappings) ? parsed.mappings : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      productOpsOutputs: Array.isArray(parsed.productOpsOutputs) ? parsed.productOpsOutputs : [],
      marketRadarOutputs: Array.isArray(parsed.marketRadarOutputs) ? parsed.marketRadarOutputs : [],
      revenuePlays: Array.isArray(parsed.revenuePlays) ? parsed.revenuePlays : [],
      blogDrafts: Array.isArray(parsed.blogDrafts) ? parsed.blogDrafts : [],
      campaignDrafts: Array.isArray(parsed.campaignDrafts) ? parsed.campaignDrafts : [],
      businessActionLogs: Array.isArray(parsed.businessActionLogs) ? parsed.businessActionLogs : [],
      dailyCommandReports: Array.isArray(parsed.dailyCommandReports) ? parsed.dailyCommandReports : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...EMPTY_STATE };
    }
    throw error;
  }
}
