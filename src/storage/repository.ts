import type { BlockedIssue, PlannedChange, ProductMapping, ShopifyVariant, SupplierProduct } from "../domain/types.ts";
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
import type {
  AgentMemoryDocument,
  MemoryRetrievalLogInput,
  MemorySearchInput,
  MemorySearchResult,
  MemoryStatus,
  SaveMemoryDocumentInput,
} from "../memory/types.ts";

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
  listMappings(): Promise<ProductMapping[]>;
  saveSupplierSnapshot(snapshot: SupplierSnapshot): Promise<void>;
  recordAppliedChanges(runId: string, changes: PlannedChange[]): Promise<void>;
  recordBlockedIssues(runId: string, issues: BlockedIssue[]): Promise<void>;
  recentRuns(limit?: number): Promise<SyncRun[]>;
  recentChanges(limit?: number): Promise<AppliedChangeRecord[]>;
  recentIssues(limit?: number): Promise<BlockedIssueRecord[]>;
  saveMemoryDocument(input: SaveMemoryDocumentInput): Promise<AgentMemoryDocument>;
  recentMemoryDocuments(input?: { sourceType?: AgentMemoryDocument["sourceType"]; limit?: number }): Promise<AgentMemoryDocument[]>;
  searchMemory(input: MemorySearchInput): Promise<MemorySearchResult[]>;
  recordMemoryRetrieval(input: MemoryRetrievalLogInput): Promise<void>;
  memoryStatus(): Promise<MemoryStatus>;
  createIntelligenceRun(input: { type: IntelligenceRunType }): Promise<IntelligenceRunRecord>;
  completeIntelligenceRun(
    runId: string,
    input: { status: IntelligenceRunStatus; error?: string | null; summaryJson?: Record<string, unknown> },
  ): Promise<IntelligenceRunRecord>;
  recentIntelligenceRuns(input?: { type?: IntelligenceRunType; limit?: number }): Promise<IntelligenceRunRecord[]>;
  saveSourceItems(items: Omit<SourceItem, "id">[] | SourceItem[]): Promise<SourceItem[]>;
  recentSourceItems(input?: { source?: SourceItem["source"]; limit?: number }): Promise<SourceItem[]>;
  saveProductSignals(signals: Omit<ProductSignal, "id" | "createdAt">[] | ProductSignal[]): Promise<ProductSignal[]>;
  recentProductSignals(input?: { signalType?: string; limit?: number }): Promise<ProductSignal[]>;
  saveContentIdeas(ideas: Omit<ContentIdea, "id" | "createdAt">[] | ContentIdea[]): Promise<ContentIdea[]>;
  getContentIdea(id: string): Promise<ContentIdea | null>;
  updateContentIdeaStatus(id: string, status: ContentIdeaStatus): Promise<ContentIdea>;
  recentContentIdeas(input?: { status?: ContentIdea["status"]; limit?: number }): Promise<ContentIdea[]>;
  createShopperBehaviorImport(
    input: Omit<ShopperBehaviorImportRecord, "id" | "startedAt" | "finishedAt" | "status" | "error" | "rowCount">,
  ): Promise<ShopperBehaviorImportRecord>;
  completeShopperBehaviorImport(
    importId: string,
    input: { status: ShopperBehaviorImportRecord["status"]; error?: string | null; rowCount?: number; metadataJson?: Record<string, unknown> },
  ): Promise<ShopperBehaviorImportRecord>;
  recentShopperBehaviorImports(input?: { source?: ShopperBehaviorImportRecord["source"]; limit?: number }): Promise<ShopperBehaviorImportRecord[]>;
  saveBehaviorImportMapping(input: Omit<BehaviorImportMappingRecord, "id" | "createdAt">): Promise<BehaviorImportMappingRecord>;
  recentBehaviorImportMappings(input?: { reportType?: BehaviorImportMappingRecord["reportType"]; limit?: number }): Promise<BehaviorImportMappingRecord[]>;
  saveShopperSearchTerms(terms: Omit<ShopperSearchTerm, "id" | "createdAt">[] | ShopperSearchTerm[]): Promise<ShopperSearchTerm[]>;
  recentShopperSearchTerms(input?: { source?: ShopperSearchTerm["source"]; limit?: number }): Promise<ShopperSearchTerm[]>;
  saveShopperProductSignals(
    signals: Omit<ShopperProductSignal, "id" | "createdAt">[] | ShopperProductSignal[],
  ): Promise<ShopperProductSignal[]>;
  recentShopperProductSignals(input?: { signalType?: string; limit?: number }): Promise<ShopperProductSignal[]>;
  saveShopperRecommendations(
    recommendations: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[] | ShopperRecommendation[],
  ): Promise<ShopperRecommendation[]>;
  recentShopperRecommendations(input?: { status?: ShopperRecommendationStatus; limit?: number }): Promise<ShopperRecommendation[]>;
  createActionItem(input: Omit<ActionItem, "id" | "createdAt" | "updatedAt" | "completedAt" | "status"> & { status?: ActionItemStatus }): Promise<ActionItem>;
  updateActionItem(
    id: string,
    input: Partial<
      Pick<ActionItem, "title" | "priority" | "status" | "owner" | "explanation" | "suggestedAction" | "relatedProductId" | "relatedProductTitle" | "relatedTopic">
    >,
  ): Promise<ActionItem>;
  recentActionItems(input?: { source?: ActionItemSource; priority?: ActionItemPriority; status?: ActionItemStatus; limit?: number }): Promise<ActionItem[]>;
  createActionNote(input: Omit<ActionNote, "id" | "createdAt">): Promise<ActionNote>;
  recentActionNotes(input?: { actionId?: string; limit?: number }): Promise<ActionNote[]>;
  saveWeeklyBrief(input: Omit<WeeklyBriefRecord, "id" | "generatedAt">): Promise<WeeklyBriefRecord>;
  recentWeeklyBriefs(input?: { limit?: number }): Promise<WeeklyBriefRecord[]>;
};
