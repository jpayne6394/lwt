import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant } from "../domain/types.ts";
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
};

const EMPTY_STATE: FileRepositoryState = {
  shopifyVariants: [],
  mappings: [],
  runs: [],
  snapshots: [],
  changes: [],
  issues: [],
};

const MAX_RUNS = 50;
const MAX_SNAPSHOTS = 20;
const MAX_CHANGES = 1_000;
const MAX_ISSUES = 1_000;

export class FileRepository implements SupplierOpsRepository {
  readonly #filePath: string;
  #state: FileRepositoryState;
  #persistQueue: Promise<void> = Promise.resolve();

  private constructor(filePath: string, state: FileRepositoryState) {
    this.#filePath = filePath;
    this.#state = state;
  }

  static async connect(filePath: string): Promise<FileRepository> {
    return new FileRepository(filePath, await readState(filePath));
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
    await this.#persist();
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

  async recentRuns(limit = 20): Promise<SyncRun[]> {
    return this.#state.runs.slice(0, limit);
  }

  async recentChanges(limit = 50): Promise<AppliedChangeRecord[]> {
    return this.#state.changes.slice(0, limit);
  }

  async recentIssues(limit = 50): Promise<BlockedIssueRecord[]> {
    return this.#state.issues.slice(0, limit);
  }

  async #persist(): Promise<void> {
    const state = JSON.stringify(this.#state, null, 2);
    this.#persistQueue = this.#persistQueue.then(async () => {
      await mkdir(dirname(this.#filePath), { recursive: true });
      await writeFile(this.#filePath, state);
    });
    return this.#persistQueue;
  }
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
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...EMPTY_STATE };
    }
    throw error;
  }
}
