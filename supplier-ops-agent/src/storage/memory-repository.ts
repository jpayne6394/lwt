import type {
  AppliedChangeRecord,
  BlockedIssueRecord,
  CompleteSyncRunInput,
  CreateSyncRunInput,
  SupplierOpsRepository,
  SupplierSnapshot,
  SyncRun,
} from "./repository.ts";
import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant } from "../domain/types.ts";

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

  async recentRuns(limit = 20): Promise<SyncRun[]> {
    return this.#runs.slice(0, limit);
  }

  async recentChanges(limit = 50): Promise<AppliedChangeRecord[]> {
    return this.#changes.slice(0, limit);
  }

  async recentIssues(limit = 50): Promise<BlockedIssueRecord[]> {
    return this.#issues.slice(0, limit);
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
}

