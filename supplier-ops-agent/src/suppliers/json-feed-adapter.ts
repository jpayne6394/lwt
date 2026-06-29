import { normalizeSupplierRecord } from "./normalization.ts";
import type { SupplierAdapter, SupplierAdapterContext, SupplierConfig } from "./types.ts";
import { SupplierAdapterError } from "./types.ts";

export class JsonFeedSupplierAdapter implements SupplierAdapter {
  readonly supplier: SupplierConfig;
  readonly #sourceUrl: string;

  constructor(supplier: SupplierConfig, sourceUrl: string) {
    this.supplier = supplier;
    this.#sourceUrl = sourceUrl;
  }

  async fetchProducts(context: SupplierAdapterContext = {}) {
    const response = await fetch(this.#sourceUrl);
    if (!response.ok) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `Supplier feed returned HTTP ${response.status}`,
      );
    }

    const body = await response.json();
    const records = Array.isArray(body) ? body : body.products;
    if (!Array.isArray(records)) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", "Supplier feed did not contain an array");
    }

    const capturedAt = (context.now ?? new Date()).toISOString();
    return records.map((record) =>
      normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record,
        capturedAt,
      }),
    );
  }
}

