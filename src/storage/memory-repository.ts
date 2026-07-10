import { randomUUID } from "node:crypto";

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
import type {
  ActionItem,
  ActionItemPriority,
  ActionItemSource,
  ActionItemStatus,
  ActionNote,
  BehaviorImportMappingRecord,
  ContentIdea,
  ContentIdeaStatus,
  IntelligenceRunRecord,
  IntelligenceRunStatus,
  IntelligenceRunType,
  ProductSignal,
  ShopperBehaviorImportRecord,
  ShopperProductSignal,
  ShopperRecommendation,
  ShopperRecommendationStatus,
  ShopperSearchTerm,
  SourceItem,
  WeeklyBriefRecord,
} from "../agents/intelligenceTypes.ts";
import { splitMemoryChunks } from "../memory/chunking.ts";
import type {
  AgentMemoryDocument,
  MemoryChunk,
  MemoryRetrievalLog,
  MemoryRetrievalLogInput,
  MemorySearchInput,
  MemorySearchResult,
  MemoryStatus,
  SaveMemoryDocumentInput,
} from "../memory/types.ts";

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
  readonly #memoryDocuments: AgentMemoryDocument[] = [];
  readonly #memoryChunks: MemoryChunk[] = [];
  readonly #memoryRetrievalLogs: MemoryRetrievalLog[] = [];
  readonly #intelligenceRuns: IntelligenceRunRecord[] = [];
  readonly #sourceItems: SourceItem[] = [];
  readonly #productSignals: ProductSignal[] = [];
  readonly #contentIdeas: ContentIdea[] = [];
  readonly #shopperBehaviorImports: ShopperBehaviorImportRecord[] = [];
  readonly #shopperSearchTerms: ShopperSearchTerm[] = [];
  readonly #shopperProductSignals: ShopperProductSignal[] = [];
  readonly #shopperRecommendations: ShopperRecommendation[] = [];
  readonly #behaviorImportMappings: BehaviorImportMappingRecord[] = [];
  readonly #actionItems: ActionItem[] = [];
  readonly #actionNotes: ActionNote[] = [];
  readonly #weeklyBriefs: WeeklyBriefRecord[] = [];

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

  async saveMemoryDocument(input: SaveMemoryDocumentInput): Promise<AgentMemoryDocument> {
    const now = new Date().toISOString();
    const existing = input.id ? this.#memoryDocuments.find((document) => document.id === input.id) : undefined;
    const document: AgentMemoryDocument = {
      id: input.id ?? randomUUID(),
      sourceType: input.sourceType,
      title: input.title,
      summary: input.summary,
      content: input.content,
      metadata: input.metadata ?? {},
      relatedProducts: input.relatedProducts ?? [],
      relatedCollections: input.relatedCollections ?? [],
      relatedCampaigns: input.relatedCampaigns ?? [],
      evidenceLinks: input.evidenceLinks ?? [],
      sensitivity: input.sensitivity ?? "internal",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const existingIndex = this.#memoryDocuments.findIndex((candidate) => candidate.id === document.id);
    if (existingIndex >= 0) {
      this.#memoryDocuments.splice(existingIndex, 1, document);
    } else {
      this.#memoryDocuments.unshift(document);
    }

    for (let index = this.#memoryChunks.length - 1; index >= 0; index -= 1) {
      if (this.#memoryChunks[index].documentId === document.id) {
        this.#memoryChunks.splice(index, 1);
      }
    }

    const chunkInputs =
      input.chunks?.length ? input.chunks : splitMemoryChunks([document.title, document.summary, document.content].join("\n")).map((content) => ({ content }));
    this.#memoryChunks.unshift(
      ...chunkInputs.map((chunk, index) => ({
        id: randomUUID(),
        documentId: document.id,
        chunkIndex: index,
        content: chunk.content,
        embedding: chunk.embedding,
        embeddingModel: chunk.embeddingModel,
        createdAt: now,
      })),
    );

    return document;
  }

  async recentMemoryDocuments(input: { sourceType?: AgentMemoryDocument["sourceType"]; limit?: number } = {}): Promise<AgentMemoryDocument[]> {
    const filtered = input.sourceType
      ? this.#memoryDocuments.filter((document) => document.sourceType === input.sourceType)
      : this.#memoryDocuments;
    return [...filtered]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input.limit ?? 20);
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const terms = tokenize(input.query);
    const maxSensitivityRank = input.maxSensitivity ? sensitivityRank(input.maxSensitivity) : sensitivityRank("restricted");
    const results = this.#memoryDocuments
      .filter((document) => {
        if (input.sourceTypes?.length && !input.sourceTypes.includes(document.sourceType)) return false;
        if (input.relatedProduct && !document.relatedProducts.some((product) => equalsNormalized(product, input.relatedProduct ?? ""))) return false;
        if (
          input.relatedCollection &&
          !document.relatedCollections.some((collection) => equalsNormalized(collection, input.relatedCollection ?? ""))
        ) {
          return false;
        }
        return sensitivityRank(document.sensitivity) <= maxSensitivityRank;
      })
      .map((document) => scoreMemoryDocument(document, this.#memoryChunks.filter((chunk) => chunk.documentId === document.id), terms, input.queryEmbedding))
      .filter((result): result is MemorySearchResult => Boolean(result))
      .sort((left, right) => right.score - left.score);

    return results.slice(0, input.limit ?? 10);
  }

  async recordMemoryRetrieval(input: MemoryRetrievalLogInput): Promise<void> {
    this.#memoryRetrievalLogs.unshift({
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  async memoryStatus(): Promise<MemoryStatus> {
    const vectorEnabled = this.#memoryChunks.some((chunk) => chunk.embedding?.length);
    return {
      provider: "memory",
      connected: true,
      vectorEnabled,
      retrievalMode: vectorEnabled ? "vector" : this.#memoryDocuments.length ? "keyword_fallback" : "none",
      documentCount: this.#memoryDocuments.length,
      chunkCount: this.#memoryChunks.length,
      lastIndexedAt: this.#memoryDocuments[0]?.updatedAt,
      message: this.#memoryDocuments.length
        ? "Agent memory is using the in-memory fallback for this process."
        : "Agent memory is available but has not indexed documents yet.",
    };
  }

  async createIntelligenceRun(input: { type: IntelligenceRunType }): Promise<IntelligenceRunRecord> {
    const run: IntelligenceRunRecord = {
      id: `intel_run_${Date.now()}_${this.#intelligenceRuns.length + 1}`,
      type: input.type,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      error: null,
      summaryJson: {},
    };
    this.#intelligenceRuns.unshift(run);
    return run;
  }

  async completeIntelligenceRun(
    runId: string,
    input: { status: IntelligenceRunStatus; error?: string | null; summaryJson?: Record<string, unknown> },
  ): Promise<IntelligenceRunRecord> {
    const run = this.#intelligenceRuns.find((candidate) => candidate.id === runId);
    if (!run) {
      throw new Error(`Intelligence run ${runId} was not found`);
    }
    run.status = input.status;
    run.finishedAt = new Date().toISOString();
    run.error = input.error ?? null;
    run.summaryJson = input.summaryJson ?? {};
    return run;
  }

  async recentIntelligenceRuns(input: { type?: IntelligenceRunType; limit?: number } = {}): Promise<IntelligenceRunRecord[]> {
    const filtered = input.type ? this.#intelligenceRuns.filter((run) => run.type === input.type) : this.#intelligenceRuns;
    return filtered.slice(0, input.limit ?? 20);
  }

  async saveSourceItems(items: Omit<SourceItem, "id">[] | SourceItem[]): Promise<SourceItem[]> {
    const saved = items.map((item) => ({
      ...item,
      id: "id" in item ? item.id : randomUUID(),
    }));
    this.#sourceItems.unshift(...saved);
    return saved;
  }

  async recentSourceItems(input: { source?: SourceItem["source"]; limit?: number } = {}): Promise<SourceItem[]> {
    const filtered = input.source ? this.#sourceItems.filter((item) => item.source === input.source) : this.#sourceItems;
    return filtered.slice(0, input.limit ?? 50);
  }

  async saveProductSignals(signals: Omit<ProductSignal, "id" | "createdAt">[] | ProductSignal[]): Promise<ProductSignal[]> {
    const saved = signals.map((signal) => ({
      ...signal,
      id: "id" in signal ? signal.id : randomUUID(),
      createdAt: "createdAt" in signal ? signal.createdAt : new Date().toISOString(),
    }));
    this.#productSignals.unshift(...saved);
    return saved;
  }

  async recentProductSignals(input: { signalType?: string; limit?: number } = {}): Promise<ProductSignal[]> {
    const filtered = input.signalType ? this.#productSignals.filter((signal) => signal.signalType === input.signalType) : this.#productSignals;
    return filtered.slice(0, input.limit ?? 50);
  }

  async saveContentIdeas(ideas: Omit<ContentIdea, "id" | "createdAt">[] | ContentIdea[]): Promise<ContentIdea[]> {
    const saved = ideas.map((idea) => ({
      ...idea,
      id: "id" in idea ? idea.id : randomUUID(),
      createdAt: "createdAt" in idea ? idea.createdAt : new Date().toISOString(),
    }));
    this.#contentIdeas.unshift(...saved);
    return saved;
  }

  async getContentIdea(id: string): Promise<ContentIdea | null> {
    return this.#contentIdeas.find((idea) => idea.id === id) ?? null;
  }

  async updateContentIdeaStatus(id: string, status: ContentIdeaStatus): Promise<ContentIdea> {
    const idea = this.#contentIdeas.find((candidate) => candidate.id === id);
    if (!idea) {
      throw new Error(`Content idea ${id} was not found`);
    }
    idea.status = status;
    return idea;
  }

  async recentContentIdeas(input: { status?: ContentIdea["status"]; limit?: number } = {}): Promise<ContentIdea[]> {
    const filtered = input.status ? this.#contentIdeas.filter((idea) => idea.status === input.status) : this.#contentIdeas;
    return filtered.slice(0, input.limit ?? 50);
  }

  async createShopperBehaviorImport(
    input: Omit<ShopperBehaviorImportRecord, "id" | "startedAt" | "finishedAt" | "status" | "error" | "rowCount">,
  ): Promise<ShopperBehaviorImportRecord> {
    const record: ShopperBehaviorImportRecord = {
      ...input,
      id: `shopper_import_${Date.now()}_${this.#shopperBehaviorImports.length + 1}`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      error: null,
      rowCount: 0,
    };
    this.#shopperBehaviorImports.unshift(record);
    return record;
  }

  async completeShopperBehaviorImport(
    importId: string,
    input: { status: ShopperBehaviorImportRecord["status"]; error?: string | null; rowCount?: number; metadataJson?: Record<string, unknown> },
  ): Promise<ShopperBehaviorImportRecord> {
    const record = this.#shopperBehaviorImports.find((candidate) => candidate.id === importId);
    if (!record) {
      throw new Error(`Shopper behavior import ${importId} was not found`);
    }
    record.status = input.status;
    record.finishedAt = new Date().toISOString();
    record.error = input.error ?? null;
    record.rowCount = input.rowCount ?? record.rowCount;
    record.metadataJson = input.metadataJson ?? record.metadataJson;
    return record;
  }

  async recentShopperBehaviorImports(input: { source?: ShopperBehaviorImportRecord["source"]; limit?: number } = {}): Promise<ShopperBehaviorImportRecord[]> {
    const filtered = input.source ? this.#shopperBehaviorImports.filter((record) => record.source === input.source) : this.#shopperBehaviorImports;
    return filtered.slice(0, input.limit ?? 50);
  }

  async saveBehaviorImportMapping(input: Omit<BehaviorImportMappingRecord, "id" | "createdAt">): Promise<BehaviorImportMappingRecord> {
    const record: BehaviorImportMappingRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.#behaviorImportMappings.unshift(record);
    return record;
  }

  async recentBehaviorImportMappings(input: { reportType?: BehaviorImportMappingRecord["reportType"]; limit?: number } = {}): Promise<BehaviorImportMappingRecord[]> {
    const filtered = input.reportType ? this.#behaviorImportMappings.filter((record) => record.reportType === input.reportType) : this.#behaviorImportMappings;
    return filtered.slice(0, input.limit ?? 20);
  }

  async saveShopperSearchTerms(terms: Omit<ShopperSearchTerm, "id" | "createdAt">[] | ShopperSearchTerm[]): Promise<ShopperSearchTerm[]> {
    const saved = terms.map((term) => ({
      ...term,
      id: "id" in term ? term.id : randomUUID(),
      createdAt: "createdAt" in term ? term.createdAt : new Date().toISOString(),
    }));
    this.#shopperSearchTerms.unshift(...saved);
    return saved;
  }

  async recentShopperSearchTerms(input: { source?: ShopperSearchTerm["source"]; limit?: number } = {}): Promise<ShopperSearchTerm[]> {
    const filtered = input.source ? this.#shopperSearchTerms.filter((term) => term.source === input.source) : this.#shopperSearchTerms;
    return filtered.slice(0, input.limit ?? 100);
  }

  async saveShopperProductSignals(signals: Omit<ShopperProductSignal, "id" | "createdAt">[] | ShopperProductSignal[]): Promise<ShopperProductSignal[]> {
    const saved = signals.map((signal) => ({
      ...signal,
      id: "id" in signal ? signal.id : randomUUID(),
      createdAt: "createdAt" in signal ? signal.createdAt : new Date().toISOString(),
    }));
    this.#shopperProductSignals.unshift(...saved);
    return saved;
  }

  async recentShopperProductSignals(input: { signalType?: string; limit?: number } = {}): Promise<ShopperProductSignal[]> {
    const filtered = input.signalType ? this.#shopperProductSignals.filter((signal) => signal.signalType === input.signalType) : this.#shopperProductSignals;
    return filtered.slice(0, input.limit ?? 100);
  }

  async saveShopperRecommendations(
    recommendations: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[] | ShopperRecommendation[],
  ): Promise<ShopperRecommendation[]> {
    const saved = recommendations.map((recommendation) => ({
      ...recommendation,
      id: "id" in recommendation ? recommendation.id : randomUUID(),
      createdAt: "createdAt" in recommendation ? recommendation.createdAt : new Date().toISOString(),
      status: "status" in recommendation ? recommendation.status : "open" as const,
    }));
    this.#shopperRecommendations.unshift(...saved);
    return saved;
  }

  async recentShopperRecommendations(input: { status?: ShopperRecommendationStatus; limit?: number } = {}): Promise<ShopperRecommendation[]> {
    const filtered = input.status ? this.#shopperRecommendations.filter((recommendation) => recommendation.status === input.status) : this.#shopperRecommendations;
    return filtered.slice(0, input.limit ?? 100);
  }

  async createActionItem(
    input: Omit<ActionItem, "id" | "createdAt" | "updatedAt" | "completedAt" | "status"> & { status?: ActionItemStatus },
  ): Promise<ActionItem> {
    const now = new Date().toISOString();
    const status = input.status ?? "open";
    const item: ActionItem = {
      ...input,
      id: randomUUID(),
      status,
      createdAt: now,
      updatedAt: now,
      completedAt: status === "done" ? now : undefined,
    };
    this.#actionItems.unshift(item);
    return item;
  }

  async updateActionItem(
    id: string,
    input: Partial<
      Pick<ActionItem, "title" | "priority" | "status" | "owner" | "explanation" | "suggestedAction" | "relatedProductId" | "relatedProductTitle" | "relatedTopic">
    >,
  ): Promise<ActionItem> {
    const item = this.#actionItems.find((candidate) => candidate.id === id);
    if (!item) {
      throw new Error(`Action item ${id} was not found`);
    }
    Object.assign(item, input);
    item.updatedAt = new Date().toISOString();
    if (input.status === "done") {
      item.completedAt = item.completedAt ?? item.updatedAt;
    }
    if (input.status && input.status !== "done") {
      item.completedAt = undefined;
    }
    return item;
  }

  async recentActionItems(
    input: { source?: ActionItemSource; priority?: ActionItemPriority; status?: ActionItemStatus; limit?: number } = {},
  ): Promise<ActionItem[]> {
    const filtered = this.#actionItems.filter((item) => {
      if (input.source && item.source !== input.source) return false;
      if (input.priority && item.priority !== input.priority) return false;
      if (input.status && item.status !== input.status) return false;
      return true;
    });
    return filtered.slice(0, input.limit ?? 100);
  }

  async createActionNote(input: Omit<ActionNote, "id" | "createdAt">): Promise<ActionNote> {
    const note: ActionNote = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.#actionNotes.unshift(note);
    return note;
  }

  async recentActionNotes(input: { actionId?: string; limit?: number } = {}): Promise<ActionNote[]> {
    const filtered = input.actionId ? this.#actionNotes.filter((note) => note.actionId === input.actionId) : this.#actionNotes;
    return filtered.slice(0, input.limit ?? 100);
  }

  async saveWeeklyBrief(input: Omit<WeeklyBriefRecord, "id" | "generatedAt">): Promise<WeeklyBriefRecord> {
    const record: WeeklyBriefRecord = {
      ...input,
      id: randomUUID(),
      generatedAt: new Date().toISOString(),
    };
    this.#weeklyBriefs.unshift(record);
    return record;
  }

  async recentWeeklyBriefs(input: { limit?: number } = {}): Promise<WeeklyBriefRecord[]> {
    return this.#weeklyBriefs.slice(0, input.limit ?? 10);
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

  listMemoryRetrievalLogs(): MemoryRetrievalLog[] {
    return [...this.#memoryRetrievalLogs];
  }

  listIntelligenceRuns(): IntelligenceRunRecord[] {
    return [...this.#intelligenceRuns];
  }
}

function scoreMemoryDocument(
  document: AgentMemoryDocument,
  chunks: MemoryChunk[],
  terms: string[],
  queryEmbedding?: number[],
): MemorySearchResult | null {
  const text = [document.title, document.summary, document.content, ...chunks.map((chunk) => chunk.content)].join(" ");
  const keywordScore = scoreKeywordMatch(text, terms);
  const vectorScore = queryEmbedding ? Math.max(0, ...chunks.map((chunk) => cosineSimilarity(queryEmbedding, chunk.embedding))) : 0;

  if (keywordScore <= 0 && vectorScore <= 0) {
    return null;
  }

  const hasVector = vectorScore > 0;
  const score = vectorScore * 10 + keywordScore;
  return {
    document,
    score,
    matchType: hasVector ? "vector" : "keyword",
    matchedText: chunks[0]?.content ?? document.summary,
  };
}

function scoreKeywordMatch(text: string, terms: string[]): number {
  if (!terms.length) {
    return 0;
  }
  const normalized = normalize(text);
  const matches = terms.filter((term) => normalized.includes(term)).length;
  return matches / terms.length;
}

function cosineSimilarity(left: number[], right: number[] | undefined): number {
  if (!right?.length || left.length !== right.length) {
    return 0;
  }
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return leftMagnitude && rightMagnitude ? dot / (leftMagnitude * rightMagnitude) : 0;
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\W+/)
    .filter((term) => term.length > 2);
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function equalsNormalized(left: string, right: string): boolean {
  return normalize(left).trim() === normalize(right).trim();
}

function sensitivityRank(value: "public" | "internal" | "restricted"): number {
  return { public: 0, internal: 1, restricted: 2 }[value];
}
