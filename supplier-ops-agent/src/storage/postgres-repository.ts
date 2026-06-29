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
  MemoryRetrievalLogInput,
  MemorySearchInput,
  MemorySearchResult,
  MemoryStatus,
  SaveMemoryDocumentInput,
} from "../memory/types.ts";

export class PostgresRepository implements SupplierOpsRepository {
  readonly #pool: any;

  private constructor(pool: any) {
    this.#pool = pool;
  }

  static async connect(databaseUrl: string): Promise<PostgresRepository> {
    const pg = await import("pg");
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return new PostgresRepository(pool);
  }

  async createSyncRun(input: CreateSyncRunInput): Promise<SyncRun> {
    const id = `run_${Date.now()}`;
    const result = await this.#pool.query(
      `insert into sync_runs (id, dry_run, status, supplier_count, change_count, issue_count)
       values ($1, $2, 'running', $3, 0, 0)
       returning id, dry_run, status, started_at, completed_at, supplier_count, change_count, issue_count`,
      [id, input.dryRun, input.supplierCount],
    );
    return rowToRun(result.rows[0]);
  }

  async completeSyncRun(runId: string, input: CompleteSyncRunInput): Promise<SyncRun> {
    const result = await this.#pool.query(
      `update sync_runs
       set status = $2, completed_at = now(), change_count = $3, issue_count = $4
       where id = $1
       returning id, dry_run, status, started_at, completed_at, supplier_count, change_count, issue_count`,
      [runId, input.status, input.changeCount, input.issueCount],
    );
    if (!result.rows[0]) {
      throw new Error(`Sync run ${runId} was not found`);
    }
    return rowToRun(result.rows[0]);
  }

  async listShopifyVariants(): Promise<ShopifyVariant[]> {
    const result = await this.#pool.query(`select payload from shopify_variants order by updated_at desc`);
    return result.rows.map((row: any) => row.payload as ShopifyVariant);
  }

  async listMappings(): Promise<ProductMapping[]> {
    const result = await this.#pool.query(
      `select supplier_id, supplier_sku, supplier_upc, supplier_title, shopify_variant_id from product_mappings`,
    );
    return result.rows.map((row: any) => ({
      supplierId: row.supplier_id,
      supplierSku: row.supplier_sku ?? undefined,
      supplierUpc: row.supplier_upc ?? undefined,
      supplierTitle: row.supplier_title ?? undefined,
      shopifyVariantId: row.shopify_variant_id,
    }));
  }

  async saveSupplierSnapshot(snapshot: SupplierSnapshot): Promise<void> {
    await this.#pool.query(
      `insert into supplier_snapshots (supplier_id, captured_at, products) values ($1, $2, $3::jsonb)`,
      [snapshot.supplierId, snapshot.capturedAt, JSON.stringify(snapshot.products)],
    );
  }

  async recordAppliedChanges(runId: string, changes: PlannedChange[]): Promise<void> {
    for (const change of changes) {
      await this.#pool.query(
        `insert into applied_changes (id, run_id, type, payload) values ($1, $2, $3, $4::jsonb)`,
        [`change_${Date.now()}_${Math.random().toString(16).slice(2)}`, runId, change.type, JSON.stringify(change)],
      );
    }
  }

  async recordBlockedIssues(runId: string, issues: BlockedIssue[]): Promise<void> {
    for (const issue of issues) {
      await this.#pool.query(
        `insert into blocked_issues (id, run_id, kind, reason, payload) values ($1, $2, $3, $4, $5::jsonb)`,
        [
          `issue_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          runId,
          issue.kind,
          issue.reason,
          JSON.stringify(issue),
        ],
      );
    }
  }

  async recentRuns(limit = 20): Promise<SyncRun[]> {
    const result = await this.#pool.query(
      `select id, dry_run, status, started_at, completed_at, supplier_count, change_count, issue_count
       from sync_runs order by started_at desc limit $1`,
      [limit],
    );
    return result.rows.map(rowToRun);
  }

  async recentChanges(limit = 50): Promise<AppliedChangeRecord[]> {
    const result = await this.#pool.query(
      `select id, run_id, type, payload, created_at from applied_changes order by created_at desc limit $1`,
      [limit],
    );
    return result.rows.map((row: any) => ({
      ...row.payload,
      id: row.id,
      runId: row.run_id,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async recentIssues(limit = 50): Promise<BlockedIssueRecord[]> {
    const result = await this.#pool.query(
      `select id, run_id, kind, reason, payload, created_at from blocked_issues order by created_at desc limit $1`,
      [limit],
    );
    return result.rows.map((row: any) => ({
      ...row.payload,
      id: row.id,
      runId: row.run_id,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async saveMemoryDocument(input: SaveMemoryDocumentInput): Promise<AgentMemoryDocument> {
    const id = input.id ?? randomUUID();
    const result = await this.#pool.query(
      `insert into agent_memory_documents (
        id, source_type, title, summary, content, metadata, related_products,
        related_collections, related_campaigns, evidence_links, sensitivity, updated_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb, $11, now())
      on conflict (id) do update set
        source_type = excluded.source_type,
        title = excluded.title,
        summary = excluded.summary,
        content = excluded.content,
        metadata = excluded.metadata,
        related_products = excluded.related_products,
        related_collections = excluded.related_collections,
        related_campaigns = excluded.related_campaigns,
        evidence_links = excluded.evidence_links,
        sensitivity = excluded.sensitivity,
        updated_at = now()
      returning *`,
      [
        id,
        input.sourceType,
        input.title,
        input.summary,
        input.content,
        JSON.stringify(input.metadata ?? {}),
        input.relatedProducts ?? [],
        input.relatedCollections ?? [],
        input.relatedCampaigns ?? [],
        JSON.stringify(input.evidenceLinks ?? []),
        input.sensitivity ?? "internal",
      ],
    );

    await this.#pool.query(`delete from agent_memory_chunks where document_id = $1`, [id]);
    const chunks =
      input.chunks?.length ? input.chunks : splitMemoryChunks([input.title, input.summary, input.content].join("\n")).map((content) => ({ content }));
    for (const [index, chunk] of chunks.entries()) {
      await this.#pool.query(
        `insert into agent_memory_chunks (id, document_id, chunk_index, content, embedding, embedding_model)
         values ($1, $2, $3, $4, $5::vector, $6)`,
        [randomUUID(), id, index, chunk.content, vectorLiteral(chunk.embedding), chunk.embeddingModel ?? null],
      );
    }

    return rowToMemoryDocument(result.rows[0]);
  }

  async searchMemory(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    if (input.queryEmbedding?.length) {
      const vectorResults = await this.#tryVectorSearch(input);
      if (vectorResults.length) {
        return vectorResults;
      }
    }
    return this.#keywordSearch(input);
  }

  async #tryVectorSearch(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    try {
      const result = await this.#pool.query(
        `select d.*, max(1 - (c.embedding <=> $2::vector)) as score, min(c.content) as matched_text
         from agent_memory_documents d
         join agent_memory_chunks c on c.document_id = d.id
         where c.embedding is not null
           and ($3::text[] is null or d.source_type = any($3::text[]))
           and ($4::text is null or exists (select 1 from unnest(d.related_products) product where lower(product) = lower($4)))
           and ($5::text is null or exists (select 1 from unnest(d.related_collections) collection where lower(collection) = lower($5)))
           and sensitivity_rank(d.sensitivity) <= sensitivity_rank($6)
         group by d.id
         order by score desc, d.updated_at desc
         limit $1`,
        [
          input.limit ?? 10,
          vectorLiteral(input.queryEmbedding),
          input.sourceTypes ?? null,
          input.relatedProduct ?? null,
          input.relatedCollection ?? null,
          input.maxSensitivity ?? "restricted",
        ],
      );
      return result.rows.map((row: any) => ({
        document: rowToMemoryDocument(row),
        score: Number(row.score ?? 0),
        matchType: "vector",
        matchedText: row.matched_text ?? row.summary,
      }));
    } catch {
      return [];
    }
  }

  async #keywordSearch(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const terms = tokenize(input.query);
    if (!terms.length) {
      return [];
    }
    const result = await this.#pool.query(
      `select d.*,
        (
          select count(*)
          from unnest($2::text[]) term
          where lower(concat_ws(' ', d.title, d.summary, d.content)) like '%' || term || '%'
        )::float / greatest(array_length($2::text[], 1), 1) as score
       from agent_memory_documents d
       where ($3::text[] is null or d.source_type = any($3::text[]))
         and ($4::text is null or exists (select 1 from unnest(d.related_products) product where lower(product) = lower($4)))
         and ($5::text is null or exists (select 1 from unnest(d.related_collections) collection where lower(collection) = lower($5)))
         and sensitivity_rank(d.sensitivity) <= sensitivity_rank($6)
       order by score desc, d.updated_at desc
       limit $1`,
      [
        input.limit ?? 10,
        terms,
        input.sourceTypes ?? null,
        input.relatedProduct ?? null,
        input.relatedCollection ?? null,
        input.maxSensitivity ?? "restricted",
      ],
    );

    return result.rows
      .filter((row: any) => Number(row.score) > 0)
      .map((row: any) => ({
        document: rowToMemoryDocument(row),
        score: Number(row.score),
        matchType: "keyword",
        matchedText: row.content,
      }));
  }

  async recordMemoryRetrieval(input: MemoryRetrievalLogInput): Promise<void> {
    await this.#pool.query(
      `insert into agent_memory_retrieval_logs (
        id, agent_name, sanitized_query, query_hash, retrieval_mode,
        result_count, used_local_embeddings, context_chars
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        input.agentName ?? null,
        input.sanitizedQuery,
        input.queryHash,
        input.retrievalMode,
        input.resultCount,
        input.usedLocalEmbeddings,
        input.contextChars,
      ],
    );
  }

  async memoryStatus(): Promise<MemoryStatus> {
    try {
      const result = await this.#pool.query(
        `select
          (select count(*) from agent_memory_documents)::int as document_count,
          (select count(*) from agent_memory_chunks)::int as chunk_count,
          (select count(*) from agent_memory_chunks where embedding is not null)::int as vector_chunk_count,
          (select max(updated_at) from agent_memory_documents) as last_indexed_at`,
      );
      const row = result.rows[0];
      const vectorEnabled = Number(row.vector_chunk_count) > 0;
      const documentCount = Number(row.document_count);
      return {
        provider: "postgres",
        connected: true,
        vectorEnabled,
        retrievalMode: vectorEnabled ? "vector" : documentCount ? "keyword_fallback" : "none",
        documentCount,
        chunkCount: Number(row.chunk_count),
        lastIndexedAt: row.last_indexed_at ? row.last_indexed_at.toISOString() : undefined,
        message: vectorEnabled
          ? "Agent memory is connected with vector retrieval."
          : "Agent memory is connected; keyword fallback is active until embeddings are indexed.",
      };
    } catch (error) {
      return {
        provider: "postgres",
        connected: false,
        vectorEnabled: false,
        retrievalMode: "none",
        documentCount: 0,
        chunkCount: 0,
        message: `Agent memory needs the Postgres schema update before indexing can run: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  async createIntelligenceRun(input: { type: IntelligenceRunType }): Promise<IntelligenceRunRecord> {
    const result = await this.#pool.query(
      `insert into intelligence_runs (id, type, status, summary_json)
       values ($1, $2, 'running', '{}'::jsonb)
       returning id, type, started_at, finished_at, status, error, summary_json`,
      [`intel_run_${Date.now()}_${Math.random().toString(16).slice(2)}`, input.type],
    );
    return rowToIntelligenceRun(result.rows[0]);
  }

  async completeIntelligenceRun(
    runId: string,
    input: { status: IntelligenceRunStatus; error?: string | null; summaryJson?: Record<string, unknown> },
  ): Promise<IntelligenceRunRecord> {
    const result = await this.#pool.query(
      `update intelligence_runs
       set status = $2, finished_at = now(), error = $3, summary_json = $4::jsonb
       where id = $1
       returning id, type, started_at, finished_at, status, error, summary_json`,
      [runId, input.status, input.error ?? null, JSON.stringify(input.summaryJson ?? {})],
    );
    if (!result.rows[0]) {
      throw new Error(`Intelligence run ${runId} was not found`);
    }
    return rowToIntelligenceRun(result.rows[0]);
  }

  async recentIntelligenceRuns(input: { type?: IntelligenceRunType; limit?: number } = {}): Promise<IntelligenceRunRecord[]> {
    const result = await this.#pool.query(
      `select id, type, started_at, finished_at, status, error, summary_json
       from intelligence_runs
       where ($2::text is null or type = $2)
       order by started_at desc
       limit $1`,
      [input.limit ?? 20, input.type ?? null],
    );
    return result.rows.map(rowToIntelligenceRun);
  }

  async saveSourceItems(items: Omit<SourceItem, "id">[] | SourceItem[]): Promise<SourceItem[]> {
    const saved: SourceItem[] = [];
    for (const item of items) {
      const id = "id" in item ? item.id : randomUUID();
      const result = await this.#pool.query(
        `insert into source_items (
          id, source, source_url, source_author_or_subreddit, title, text_excerpt,
          collected_at, score_json, raw_json
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        on conflict (id) do update set
          source = excluded.source,
          source_url = excluded.source_url,
          source_author_or_subreddit = excluded.source_author_or_subreddit,
          title = excluded.title,
          text_excerpt = excluded.text_excerpt,
          collected_at = excluded.collected_at,
          score_json = excluded.score_json,
          raw_json = excluded.raw_json
        returning *`,
        [
          id,
          item.source,
          item.sourceUrl ?? null,
          item.sourceAuthorOrSubreddit ?? null,
          item.title,
          item.textExcerpt,
          item.collectedAt,
          JSON.stringify(item.scoreJson ?? {}),
          JSON.stringify(item.rawJson ?? null),
        ],
      );
      saved.push(rowToSourceItem(result.rows[0]));
    }
    return saved;
  }

  async recentSourceItems(input: { source?: SourceItem["source"]; limit?: number } = {}): Promise<SourceItem[]> {
    const result = await this.#pool.query(
      `select *
       from source_items
       where ($2::text is null or source = $2)
       order by collected_at desc
       limit $1`,
      [input.limit ?? 50, input.source ?? null],
    );
    return result.rows.map(rowToSourceItem);
  }

  async saveProductSignals(signals: Omit<ProductSignal, "id" | "createdAt">[] | ProductSignal[]): Promise<ProductSignal[]> {
    const saved: ProductSignal[] = [];
    for (const signal of signals) {
      const id = "id" in signal ? signal.id : randomUUID();
      const createdAt = "createdAt" in signal ? signal.createdAt : new Date().toISOString();
      const result = await this.#pool.query(
        `insert into product_signals (
          id, shopify_product_id, product_title, vendor, category, signal_type, priority, reason, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          shopify_product_id = excluded.shopify_product_id,
          product_title = excluded.product_title,
          vendor = excluded.vendor,
          category = excluded.category,
          signal_type = excluded.signal_type,
          priority = excluded.priority,
          reason = excluded.reason,
          created_at = excluded.created_at
        returning *`,
        [
          id,
          signal.shopifyProductId ?? null,
          signal.productTitle,
          signal.vendor ?? null,
          signal.category ?? null,
          signal.signalType,
          signal.priority,
          signal.reason,
          createdAt,
        ],
      );
      saved.push(rowToProductSignal(result.rows[0]));
    }
    return saved;
  }

  async recentProductSignals(input: { signalType?: string; limit?: number } = {}): Promise<ProductSignal[]> {
    const result = await this.#pool.query(
      `select *
       from product_signals
       where ($2::text is null or signal_type = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 50, input.signalType ?? null],
    );
    return result.rows.map(rowToProductSignal);
  }

  async saveContentIdeas(ideas: Omit<ContentIdea, "id" | "createdAt">[] | ContentIdea[]): Promise<ContentIdea[]> {
    const saved: ContentIdea[] = [];
    for (const idea of ideas) {
      const id = "id" in idea ? idea.id : randomUUID();
      const createdAt = "createdAt" in idea ? idea.createdAt : new Date().toISOString();
      const result = await this.#pool.query(
        `insert into content_ideas (
          id, topic, source_summary, suggested_title, product_tie_in, compliance_risk,
          compliance_reason, safer_angle, suggested_cta, status, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (id) do update set
          topic = excluded.topic,
          source_summary = excluded.source_summary,
          suggested_title = excluded.suggested_title,
          product_tie_in = excluded.product_tie_in,
          compliance_risk = excluded.compliance_risk,
          compliance_reason = excluded.compliance_reason,
          safer_angle = excluded.safer_angle,
          suggested_cta = excluded.suggested_cta,
          status = excluded.status,
          created_at = excluded.created_at
        returning *`,
        [
          id,
          idea.topic,
          idea.sourceSummary,
          idea.suggestedTitle,
          idea.productTieIn,
          idea.complianceRisk,
          idea.complianceReason ?? null,
          idea.saferAngle ?? null,
          idea.suggestedCta,
          idea.status,
          createdAt,
        ],
      );
      saved.push(rowToContentIdea(result.rows[0]));
    }
    return saved;
  }

  async recentContentIdeas(input: { status?: ContentIdea["status"]; limit?: number } = {}): Promise<ContentIdea[]> {
    const result = await this.#pool.query(
      `select *
       from content_ideas
       where ($2::text is null or status = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 50, input.status ?? null],
    );
    return result.rows.map(rowToContentIdea);
  }

  async getContentIdea(id: string): Promise<ContentIdea | null> {
    const result = await this.#pool.query(`select * from content_ideas where id = $1`, [id]);
    return result.rows[0] ? rowToContentIdea(result.rows[0]) : null;
  }

  async updateContentIdeaStatus(id: string, status: ContentIdeaStatus): Promise<ContentIdea> {
    const result = await this.#pool.query(
      `update content_ideas
       set status = $2
       where id = $1
       returning *`,
      [id, status],
    );
    if (!result.rows[0]) {
      throw new Error(`Content idea ${id} was not found`);
    }
    return rowToContentIdea(result.rows[0]);
  }

  async createShopperBehaviorImport(
    input: Omit<ShopperBehaviorImportRecord, "id" | "startedAt" | "finishedAt" | "status" | "error" | "rowCount">,
  ): Promise<ShopperBehaviorImportRecord> {
    const result = await this.#pool.query(
      `insert into shopper_behavior_imports (id, source, import_type, filename, status, metadata_json)
       values ($1, $2, $3, $4, 'running', $5::jsonb)
       returning *`,
      [`shopper_import_${Date.now()}_${Math.random().toString(16).slice(2)}`, input.source, input.importType, input.filename, JSON.stringify(input.metadataJson ?? {})],
    );
    return rowToShopperBehaviorImport(result.rows[0]);
  }

  async completeShopperBehaviorImport(
    importId: string,
    input: { status: ShopperBehaviorImportRecord["status"]; error?: string | null; rowCount?: number; metadataJson?: Record<string, unknown> },
  ): Promise<ShopperBehaviorImportRecord> {
    const result = await this.#pool.query(
      `update shopper_behavior_imports
       set status = $2, finished_at = now(), error = $3, row_count = coalesce($4, row_count), metadata_json = coalesce($5::jsonb, metadata_json)
       where id = $1
       returning *`,
      [importId, input.status, input.error ?? null, input.rowCount ?? null, input.metadataJson ? JSON.stringify(input.metadataJson) : null],
    );
    if (!result.rows[0]) {
      throw new Error(`Shopper behavior import ${importId} was not found`);
    }
    return rowToShopperBehaviorImport(result.rows[0]);
  }

  async recentShopperBehaviorImports(input: { source?: ShopperBehaviorImportRecord["source"]; limit?: number } = {}): Promise<ShopperBehaviorImportRecord[]> {
    const result = await this.#pool.query(
      `select *
       from shopper_behavior_imports
       where ($2::text is null or source = $2)
       order by started_at desc
       limit $1`,
      [input.limit ?? 50, input.source ?? null],
    );
    return result.rows.map(rowToShopperBehaviorImport);
  }

  async saveBehaviorImportMapping(input: Omit<BehaviorImportMappingRecord, "id" | "createdAt">): Promise<BehaviorImportMappingRecord> {
    const result = await this.#pool.query(
      `insert into behavior_import_mappings (
        id, report_type, source, import_type, filename, column_mapping, missing_columns
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7)
      returning *`,
      [
        randomUUID(),
        input.reportType,
        input.source,
        input.importType,
        input.filename,
        JSON.stringify(input.columnMapping ?? {}),
        input.missingColumns ?? [],
      ],
    );
    return rowToBehaviorImportMapping(result.rows[0]);
  }

  async recentBehaviorImportMappings(input: { reportType?: BehaviorImportMappingRecord["reportType"]; limit?: number } = {}): Promise<BehaviorImportMappingRecord[]> {
    const result = await this.#pool.query(
      `select *
       from behavior_import_mappings
       where ($2::text is null or report_type = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 20, input.reportType ?? null],
    );
    return result.rows.map(rowToBehaviorImportMapping);
  }

  async saveShopperSearchTerms(terms: Omit<ShopperSearchTerm, "id" | "createdAt">[] | ShopperSearchTerm[]): Promise<ShopperSearchTerm[]> {
    const saved: ShopperSearchTerm[] = [];
    for (const term of terms) {
      const id = "id" in term ? term.id : randomUUID();
      const createdAt = "createdAt" in term ? term.createdAt : new Date().toISOString();
      const result = await this.#pool.query(
        `insert into shopper_search_terms (
          id, term, normalized_term, source, search_count, click_count, purchase_count,
          no_results_count, no_click_count, first_seen_at, last_seen_at, score_json, created_at, date_range
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
        on conflict (id) do update set
          term = excluded.term,
          normalized_term = excluded.normalized_term,
          source = excluded.source,
          search_count = excluded.search_count,
          click_count = excluded.click_count,
          purchase_count = excluded.purchase_count,
          no_results_count = excluded.no_results_count,
          no_click_count = excluded.no_click_count,
          first_seen_at = excluded.first_seen_at,
          last_seen_at = excluded.last_seen_at,
          score_json = excluded.score_json,
          date_range = excluded.date_range
        returning *`,
        [
          id,
          term.term,
          term.normalizedTerm,
          term.source,
          term.searchCount,
          term.clickCount ?? null,
          term.purchaseCount ?? null,
          term.noResultsCount ?? null,
          term.noClickCount ?? null,
          term.firstSeenAt,
          term.lastSeenAt,
          JSON.stringify(term.scoreJson ?? {}),
          createdAt,
          term.dateRange ?? null,
        ],
      );
      saved.push(rowToShopperSearchTerm(result.rows[0]));
    }
    return saved;
  }

  async recentShopperSearchTerms(input: { source?: ShopperSearchTerm["source"]; limit?: number } = {}): Promise<ShopperSearchTerm[]> {
    const result = await this.#pool.query(
      `select *
       from shopper_search_terms
       where ($2::text is null or source = $2)
       order by search_count desc, last_seen_at desc
       limit $1`,
      [input.limit ?? 100, input.source ?? null],
    );
    return result.rows.map(rowToShopperSearchTerm);
  }

  async saveShopperProductSignals(signals: Omit<ShopperProductSignal, "id" | "createdAt">[] | ShopperProductSignal[]): Promise<ShopperProductSignal[]> {
    const saved: ShopperProductSignal[] = [];
    for (const signal of signals) {
      const id = "id" in signal ? signal.id : randomUUID();
      const createdAt = "createdAt" in signal ? signal.createdAt : new Date().toISOString();
      const result = await this.#pool.query(
        `insert into shopper_product_signals (
          id, shopify_product_id, product_title, signal_type, metric_name,
          metric_value, priority, reason, created_at, source, date_range
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (id) do update set
          shopify_product_id = excluded.shopify_product_id,
          product_title = excluded.product_title,
          signal_type = excluded.signal_type,
          metric_name = excluded.metric_name,
          metric_value = excluded.metric_value,
          priority = excluded.priority,
          reason = excluded.reason,
          source = excluded.source,
          date_range = excluded.date_range
        returning *`,
        [
          id,
          signal.shopifyProductId ?? null,
          signal.productTitle,
          signal.signalType,
          signal.metricName,
          signal.metricValue,
          signal.priority,
          signal.reason,
          createdAt,
          signal.source ?? null,
          signal.dateRange ?? null,
        ],
      );
      saved.push(rowToShopperProductSignal(result.rows[0]));
    }
    return saved;
  }

  async recentShopperProductSignals(input: { signalType?: string; limit?: number } = {}): Promise<ShopperProductSignal[]> {
    const result = await this.#pool.query(
      `select *
       from shopper_product_signals
       where ($2::text is null or signal_type = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 100, input.signalType ?? null],
    );
    return result.rows.map(rowToShopperProductSignal);
  }

  async saveShopperRecommendations(
    recommendations: Omit<ShopperRecommendation, "id" | "createdAt" | "status">[] | ShopperRecommendation[],
  ): Promise<ShopperRecommendation[]> {
    const saved: ShopperRecommendation[] = [];
    for (const recommendation of recommendations) {
      const id = "id" in recommendation ? recommendation.id : randomUUID();
      const createdAt = "createdAt" in recommendation ? recommendation.createdAt : new Date().toISOString();
      const status = "status" in recommendation ? recommendation.status : "open";
      const result = await this.#pool.query(
        `insert into shopper_recommendations (
          id, recommendation_type, title, explanation, related_term, related_product_id,
          related_product_title, priority, status, created_at, source, date_range, suggested_action
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        on conflict (id) do update set
          recommendation_type = excluded.recommendation_type,
          title = excluded.title,
          explanation = excluded.explanation,
          related_term = excluded.related_term,
          related_product_id = excluded.related_product_id,
          related_product_title = excluded.related_product_title,
          priority = excluded.priority,
          status = excluded.status,
          source = excluded.source,
          date_range = excluded.date_range,
          suggested_action = excluded.suggested_action
        returning *`,
        [
          id,
          recommendation.recommendationType,
          recommendation.title,
          recommendation.explanation,
          recommendation.relatedTerm ?? null,
          recommendation.relatedProductId ?? null,
          recommendation.relatedProductTitle ?? null,
          recommendation.priority,
          status,
          createdAt,
          recommendation.source ?? null,
          recommendation.dateRange ?? null,
          recommendation.suggestedAction ?? null,
        ],
      );
      saved.push(rowToShopperRecommendation(result.rows[0]));
    }
    return saved;
  }

  async recentShopperRecommendations(input: { status?: ShopperRecommendationStatus; limit?: number } = {}): Promise<ShopperRecommendation[]> {
    const result = await this.#pool.query(
      `select *
       from shopper_recommendations
       where ($2::text is null or status = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 100, input.status ?? null],
    );
    return result.rows.map(rowToShopperRecommendation);
  }

  async createActionItem(
    input: Omit<ActionItem, "id" | "createdAt" | "updatedAt" | "completedAt" | "status"> & { status?: ActionItemStatus },
  ): Promise<ActionItem> {
    const status = input.status ?? "open";
    const result = await this.#pool.query(
      `insert into action_items (
        id, title, source, priority, status, recommendation_type, related_product_id,
        related_product_title, related_topic, explanation, suggested_action, owner, completed_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, case when $5 = 'done' then now() else null end)
      returning *`,
      [
        randomUUID(),
        input.title,
        input.source,
        input.priority,
        status,
        input.recommendationType,
        input.relatedProductId ?? null,
        input.relatedProductTitle ?? null,
        input.relatedTopic ?? null,
        input.explanation,
        input.suggestedAction,
        input.owner ?? null,
      ],
    );
    return rowToActionItem(result.rows[0]);
  }

  async updateActionItem(
    id: string,
    input: Partial<
      Pick<ActionItem, "title" | "priority" | "status" | "owner" | "explanation" | "suggestedAction" | "relatedProductId" | "relatedProductTitle" | "relatedTopic">
    >,
  ): Promise<ActionItem> {
    const result = await this.#pool.query(
      `update action_items
       set title = coalesce($2, title),
           priority = coalesce($3, priority),
           status = coalesce($4, status),
           owner = coalesce($5, owner),
           explanation = coalesce($6, explanation),
           suggested_action = coalesce($7, suggested_action),
           related_product_id = coalesce($8, related_product_id),
           related_product_title = coalesce($9, related_product_title),
           related_topic = coalesce($10, related_topic),
           updated_at = now(),
           completed_at = case
             when $4 = 'done' and completed_at is null then now()
             when $4 is not null and $4 <> 'done' then null
             else completed_at
           end
       where id = $1
       returning *`,
      [
        id,
        input.title ?? null,
        input.priority ?? null,
        input.status ?? null,
        input.owner ?? null,
        input.explanation ?? null,
        input.suggestedAction ?? null,
        input.relatedProductId ?? null,
        input.relatedProductTitle ?? null,
        input.relatedTopic ?? null,
      ],
    );
    if (!result.rows[0]) {
      throw new Error(`Action item ${id} was not found`);
    }
    return rowToActionItem(result.rows[0]);
  }

  async recentActionItems(
    input: { source?: ActionItemSource; priority?: ActionItemPriority; status?: ActionItemStatus; limit?: number } = {},
  ): Promise<ActionItem[]> {
    const result = await this.#pool.query(
      `select *
       from action_items
       where ($2::text is null or source = $2)
         and ($3::text is null or priority = $3)
         and ($4::text is null or status = $4)
       order by created_at desc
       limit $1`,
      [input.limit ?? 100, input.source ?? null, input.priority ?? null, input.status ?? null],
    );
    return result.rows.map(rowToActionItem);
  }

  async createActionNote(input: Omit<ActionNote, "id" | "createdAt">): Promise<ActionNote> {
    const result = await this.#pool.query(
      `insert into action_notes (id, action_id, body)
       values ($1, $2, $3)
       returning *`,
      [randomUUID(), input.actionId, input.body],
    );
    return rowToActionNote(result.rows[0]);
  }

  async recentActionNotes(input: { actionId?: string; limit?: number } = {}): Promise<ActionNote[]> {
    const result = await this.#pool.query(
      `select *
       from action_notes
       where ($2::text is null or action_id = $2)
       order by created_at desc
       limit $1`,
      [input.limit ?? 100, input.actionId ?? null],
    );
    return result.rows.map(rowToActionNote);
  }

  async saveWeeklyBrief(input: Omit<WeeklyBriefRecord, "id" | "generatedAt">): Promise<WeeklyBriefRecord> {
    const result = await this.#pool.query(
      `insert into weekly_briefs (id, markdown, metadata_json)
       values ($1, $2, $3::jsonb)
       returning *`,
      [randomUUID(), input.markdown, JSON.stringify(input.metadataJson ?? {})],
    );
    return rowToWeeklyBrief(result.rows[0]);
  }

  async recentWeeklyBriefs(input: { limit?: number } = {}): Promise<WeeklyBriefRecord[]> {
    const result = await this.#pool.query(
      `select *
       from weekly_briefs
       order by generated_at desc
       limit $1`,
      [input.limit ?? 10],
    );
    return result.rows.map(rowToWeeklyBrief);
  }
}

function rowToRun(row: any): SyncRun {
  return {
    id: row.id,
    dryRun: row.dry_run,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    supplierCount: Number(row.supplier_count),
    changeCount: Number(row.change_count),
    issueCount: Number(row.issue_count),
  };
}

function rowToMemoryDocument(row: any): AgentMemoryDocument {
  return {
    id: row.id,
    sourceType: row.source_type,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: row.metadata ?? {},
    relatedProducts: row.related_products ?? [],
    relatedCollections: row.related_collections ?? [],
    relatedCampaigns: row.related_campaigns ?? [],
    evidenceLinks: row.evidence_links ?? [],
    sensitivity: row.sensitivity ?? "internal",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToIntelligenceRun(row: any): IntelligenceRunRecord {
  return {
    id: row.id,
    type: row.type,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    error: row.error ?? null,
    summaryJson: row.summary_json ?? {},
  };
}

function rowToSourceItem(row: any): SourceItem {
  return {
    id: row.id,
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    sourceAuthorOrSubreddit: row.source_author_or_subreddit ?? undefined,
    title: row.title,
    textExcerpt: row.text_excerpt,
    collectedAt: row.collected_at.toISOString(),
    scoreJson: row.score_json ?? {},
    rawJson: row.raw_json ?? undefined,
  };
}

function rowToProductSignal(row: any): ProductSignal {
  return {
    id: row.id,
    shopifyProductId: row.shopify_product_id ?? undefined,
    productTitle: row.product_title,
    vendor: row.vendor ?? undefined,
    category: row.category ?? undefined,
    signalType: row.signal_type,
    priority: row.priority,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToContentIdea(row: any): ContentIdea {
  return {
    id: row.id,
    topic: row.topic,
    sourceSummary: row.source_summary,
    suggestedTitle: row.suggested_title,
    productTieIn: row.product_tie_in,
    complianceRisk: row.compliance_risk,
    complianceReason: row.compliance_reason ?? undefined,
    saferAngle: row.safer_angle ?? undefined,
    suggestedCta: row.suggested_cta,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToShopperBehaviorImport(row: any): ShopperBehaviorImportRecord {
  return {
    id: row.id,
    source: row.source,
    importType: row.import_type,
    filename: row.filename,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    error: row.error ?? null,
    rowCount: Number(row.row_count ?? 0),
    metadataJson: row.metadata_json ?? {},
  };
}

function rowToBehaviorImportMapping(row: any): BehaviorImportMappingRecord {
  return {
    id: row.id,
    reportType: row.report_type,
    source: row.source,
    importType: row.import_type,
    filename: row.filename,
    columnMapping: row.column_mapping ?? {},
    missingColumns: row.missing_columns ?? [],
    createdAt: row.created_at.toISOString(),
  };
}

function rowToShopperSearchTerm(row: any): ShopperSearchTerm {
  return {
    id: row.id,
    term: row.term,
    normalizedTerm: row.normalized_term,
    source: row.source,
    searchCount: Number(row.search_count ?? 0),
    clickCount: row.click_count === null ? undefined : Number(row.click_count),
    purchaseCount: row.purchase_count === null ? undefined : Number(row.purchase_count),
    noResultsCount: row.no_results_count === null ? undefined : Number(row.no_results_count),
    noClickCount: row.no_click_count === null ? undefined : Number(row.no_click_count),
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    scoreJson: row.score_json ?? {},
    createdAt: row.created_at.toISOString(),
    dateRange: row.date_range ?? undefined,
  };
}

function rowToShopperProductSignal(row: any): ShopperProductSignal {
  return {
    id: row.id,
    shopifyProductId: row.shopify_product_id ?? undefined,
    productTitle: row.product_title,
    signalType: row.signal_type,
    metricName: row.metric_name,
    metricValue: Number(row.metric_value ?? 0),
    priority: row.priority,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
    source: row.source ?? undefined,
    dateRange: row.date_range ?? undefined,
  };
}

function rowToShopperRecommendation(row: any): ShopperRecommendation {
  return {
    id: row.id,
    recommendationType: row.recommendation_type,
    title: row.title,
    explanation: row.explanation,
    relatedTerm: row.related_term ?? undefined,
    relatedProductId: row.related_product_id ?? undefined,
    relatedProductTitle: row.related_product_title ?? undefined,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    source: row.source ?? undefined,
    dateRange: row.date_range ?? undefined,
    suggestedAction: row.suggested_action ?? undefined,
  };
}

function rowToActionItem(row: any): ActionItem {
  return {
    id: row.id,
    title: row.title,
    source: row.source,
    priority: row.priority,
    status: row.status,
    recommendationType: row.recommendation_type,
    relatedProductId: row.related_product_id ?? undefined,
    relatedProductTitle: row.related_product_title ?? undefined,
    relatedTopic: row.related_topic ?? undefined,
    explanation: row.explanation,
    suggestedAction: row.suggested_action,
    owner: row.owner ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
  };
}

function rowToActionNote(row: any): ActionNote {
  return {
    id: row.id,
    actionId: row.action_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToWeeklyBrief(row: any): WeeklyBriefRecord {
  return {
    id: row.id,
    generatedAt: row.generated_at.toISOString(),
    markdown: row.markdown,
    metadataJson: row.metadata_json ?? {},
  };
}

function vectorLiteral(vector: number[] | undefined): string | null {
  return vector?.length ? `[${vector.join(",")}]` : null;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2);
}
