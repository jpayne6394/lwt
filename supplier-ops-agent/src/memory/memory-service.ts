import { createHash } from "node:crypto";

import { splitMemoryChunks } from "./chunking.ts";
import type { EmbeddingClient } from "./embedding-client.ts";
import { sanitizeMemoryDocumentInput, sanitizeText } from "./sanitizer.ts";
import type {
  AgentMemoryDocument,
  MemoryContextPacket,
  MemoryRetrievalMode,
  MemorySearchInput,
  MemorySearchResult,
  SaveMemoryDocumentInput,
} from "./types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";

export type AgentMemoryService = {
  saveDocument(input: SaveMemoryDocumentInput): Promise<AgentMemoryDocument>;
  searchMemory(input: MemorySearchInput & { agentName?: string }): Promise<{
    retrievalMode: MemoryRetrievalMode;
    results: MemorySearchResult[];
    context: MemoryContextPacket;
  }>;
};

export type CreateAgentMemoryServiceOptions = {
  repository: SupplierOpsRepository;
  embeddingClient: EmbeddingClient;
  vectorEnabled: boolean;
  maxContextChars: number;
};

export function createAgentMemoryService(options: CreateAgentMemoryServiceOptions): AgentMemoryService {
  return new DefaultAgentMemoryService(options);
}

class DefaultAgentMemoryService implements AgentMemoryService {
  readonly #repository: SupplierOpsRepository;
  readonly #embeddingClient: EmbeddingClient;
  readonly #vectorEnabled: boolean;
  readonly #maxContextChars: number;

  constructor(options: CreateAgentMemoryServiceOptions) {
    this.#repository = options.repository;
    this.#embeddingClient = options.embeddingClient;
    this.#vectorEnabled = options.vectorEnabled;
    this.#maxContextChars = options.maxContextChars;
  }

  async saveDocument(input: SaveMemoryDocumentInput): Promise<AgentMemoryDocument> {
    const sanitized = sanitizeMemoryDocumentInput(input);
    const chunkTexts = splitMemoryChunks([sanitized.title, sanitized.summary, sanitized.content].filter(Boolean).join("\n"));
    const embeddingResult = this.#vectorEnabled ? await this.#embeddingClient.embed(chunkTexts) : null;
    const chunks = chunkTexts.map((content, index) => ({
      content,
      embedding: embeddingResult?.status === "embedded" ? embeddingResult.vectors[index] : undefined,
      embeddingModel: embeddingResult?.status === "embedded" ? embeddingResult.model : undefined,
    }));

    return this.#repository.saveMemoryDocument({
      ...sanitized,
      chunks,
    });
  }

  async searchMemory(input: MemorySearchInput & { agentName?: string }): Promise<{
    retrievalMode: MemoryRetrievalMode;
    results: MemorySearchResult[];
    context: MemoryContextPacket;
  }> {
    const sanitizedQuery = sanitizeText(input.query, 1000);
    const embeddingResult = this.#vectorEnabled ? await this.#embeddingClient.embed([sanitizedQuery]) : null;
    const queryEmbedding = embeddingResult?.status === "embedded" ? embeddingResult.vectors[0] : undefined;
    const results = await this.#repository.searchMemory({
      ...input,
      query: sanitizedQuery,
      queryEmbedding,
    });
    const retrievalMode: MemoryRetrievalMode =
      queryEmbedding && results.some((result) => result.matchType === "vector" || result.matchType === "mixed")
        ? "vector"
        : results.length
          ? "keyword_fallback"
          : "none";
    const context = buildContextPacket(results, retrievalMode, this.#maxContextChars);

    await this.#repository.recordMemoryRetrieval({
      agentName: input.agentName,
      sanitizedQuery,
      queryHash: hashQuery(sanitizedQuery),
      retrievalMode,
      resultCount: results.length,
      usedLocalEmbeddings: Boolean(queryEmbedding),
      contextChars: context.totalChars,
    });

    return { retrievalMode, results, context };
  }
}

function buildContextPacket(
  results: MemorySearchResult[],
  retrievalMode: MemoryRetrievalMode,
  maxContextChars: number,
): MemoryContextPacket {
  let remaining = Math.max(0, maxContextChars);
  const documents = [];

  for (const result of results) {
    if (remaining <= 0) {
      break;
    }

    const content = result.document.content.slice(0, remaining);
    remaining -= content.length;
    documents.push({
      id: result.document.id,
      title: result.document.title,
      sourceType: result.document.sourceType,
      summary: result.document.summary,
      content,
      evidenceLinks: result.document.evidenceLinks,
      relatedProducts: result.document.relatedProducts,
      relatedCollections: result.document.relatedCollections,
      sensitivity: result.document.sensitivity,
    });
  }

  return {
    retrievalMode,
    totalChars: documents.reduce((sum, document) => sum + document.content.length, 0),
    documents,
  };
}

function hashQuery(query: string): string {
  return createHash("sha256").update(query).digest("hex");
}
