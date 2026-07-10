export type MemorySourceType =
  | "product_report"
  | "catalog_report"
  | "seo_report"
  | "inventory_output"
  | "market_signal"
  | "campaign_draft"
  | "blog_draft"
  | "approval_outcome"
  | "business_note";

export type MemorySensitivity = "public" | "internal" | "restricted";

export type AgentMemoryDocument = {
  id: string;
  sourceType: MemorySourceType;
  title: string;
  summary: string;
  content: string;
  metadata: Record<string, unknown>;
  relatedProducts: string[];
  relatedCollections: string[];
  relatedCampaigns: string[];
  evidenceLinks: string[];
  sensitivity: MemorySensitivity;
  createdAt: string;
  updatedAt: string;
};

export type MemoryChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  embeddingModel?: string;
  createdAt: string;
};

export type SaveMemoryChunkInput = {
  content: string;
  embedding?: number[];
  embeddingModel?: string;
};

export type SaveMemoryDocumentInput = {
  id?: string;
  sourceType: MemorySourceType;
  title: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
  relatedProducts?: string[];
  relatedCollections?: string[];
  relatedCampaigns?: string[];
  evidenceLinks?: string[];
  sensitivity?: MemorySensitivity;
  chunks?: SaveMemoryChunkInput[];
};

export type MemoryMatchType = "keyword" | "vector" | "mixed";

export type MemorySearchInput = {
  query: string;
  queryEmbedding?: number[];
  sourceTypes?: MemorySourceType[];
  relatedProduct?: string;
  relatedCollection?: string;
  maxSensitivity?: MemorySensitivity;
  limit?: number;
};

export type MemorySearchResult = {
  document: AgentMemoryDocument;
  score: number;
  matchType: MemoryMatchType;
  matchedText: string;
};

export type MemoryRetrievalMode = "vector" | "keyword_fallback" | "none";

export type MemoryContextDocument = {
  id: string;
  title: string;
  sourceType: MemorySourceType;
  summary: string;
  content: string;
  evidenceLinks: string[];
  relatedProducts: string[];
  relatedCollections: string[];
  sensitivity: MemorySensitivity;
};

export type MemoryContextPacket = {
  retrievalMode: MemoryRetrievalMode;
  totalChars: number;
  documents: MemoryContextDocument[];
};

export type MemoryRetrievalLogInput = {
  agentName?: string;
  sanitizedQuery: string;
  queryHash: string;
  retrievalMode: MemoryRetrievalMode;
  resultCount: number;
  usedLocalEmbeddings: boolean;
  contextChars: number;
};

export type MemoryRetrievalLog = MemoryRetrievalLogInput & {
  id: string;
  createdAt: string;
};

export type MemoryStatus = {
  provider: "memory" | "postgres";
  connected: boolean;
  vectorEnabled: boolean;
  retrievalMode: MemoryRetrievalMode;
  documentCount: number;
  chunkCount: number;
  lastIndexedAt?: string;
  message: string;
};
