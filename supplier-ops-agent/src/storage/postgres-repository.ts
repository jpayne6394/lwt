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
import type { ProductOpsOutputRecord, ProductOpsRunOutput } from "../product-ops/types.ts";

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

  async saveShopifyVariants(variants: ShopifyVariant[]): Promise<void> {
    for (const variant of variants) {
      await this.#pool.query(
        `insert into shopify_variants (variant_id, product_id, sku, barcode, vendor, title, status, payload, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
         on conflict (variant_id) do update set
           product_id = excluded.product_id,
           sku = excluded.sku,
           barcode = excluded.barcode,
           vendor = excluded.vendor,
           title = excluded.title,
           status = excluded.status,
           payload = excluded.payload,
           updated_at = now()`,
        [
          variant.variantId,
          variant.productId,
          variant.sku || null,
          variant.barcode || null,
          variant.vendor,
          variant.title,
          variant.status,
          JSON.stringify(variant),
        ],
      );
    }
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

  async recordProductOpsOutput(runId: string, output: ProductOpsRunOutput): Promise<void> {
    await this.#pool.query(
      `insert into product_ops_outputs (id, run_id, payload) values ($1, $2, $3::jsonb)`,
      [`product_ops_${Date.now()}_${Math.random().toString(16).slice(2)}`, runId, JSON.stringify(output)],
    );
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

  async recentProductOpsOutputs(limit = 20): Promise<ProductOpsOutputRecord[]> {
    const result = await this.#pool.query(
      `select id, run_id, payload, created_at from product_ops_outputs order by created_at desc limit $1`,
      [limit],
    );
    return result.rows.map((row: any) => ({
      ...row.payload,
      id: row.id,
      runId: row.run_id,
      createdAt: row.created_at.toISOString(),
    }));
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

