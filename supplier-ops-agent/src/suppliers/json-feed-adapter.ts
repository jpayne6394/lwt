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

    let body: unknown;
    try {
      body = parseJsonFeedBody(await response.text());
    } catch (error) {
      throw new SupplierAdapterError(
        this.supplier.id,
        "parse_failed",
        `Supplier feed did not contain valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const records = Array.isArray(body) ? body : isRecord(body) ? body.products : undefined;
    if (!Array.isArray(records)) {
      throw new SupplierAdapterError(this.supplier.id, "parse_failed", "Supplier feed did not contain an array");
    }

    const capturedAt = (context.now ?? new Date()).toISOString();
    return records.map((record) =>
      normalizeSupplierRecord({
        supplierId: this.supplier.id,
        supplierName: this.supplier.name,
        record: normalizeFeedRecord(record, this.supplier, this.#sourceUrl),
        capturedAt,
      }),
    );
  }
}

function parseJsonFeedBody(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    const parsedArray = parseJsonSlice(trimmed, "[", "]");
    if (parsedArray !== undefined) {
      return parsedArray;
    }

    const parsedObject = parseJsonSlice(trimmed, "{", "}");
    if (parsedObject !== undefined) {
      return parsedObject;
    }

    throw error;
  }
}

function parseJsonSlice(text: string, open: string, close: string): unknown | undefined {
  const start = text.indexOf(open);
  if (start === -1) {
    return undefined;
  }

  for (let end = text.lastIndexOf(close); end > start; end = text.lastIndexOf(close, end - 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    } catch {
      // Keep trying shorter slices; some suppliers prepend styles/scripts before the real feed.
    }
  }

  return undefined;
}

function normalizeFeedRecord(record: unknown, supplier: SupplierConfig, sourceUrl: string): Record<string, unknown> {
  if (!isRecord(record)) {
    return {};
  }

  if (Array.isArray(record.variants)) {
    return normalizeShopifyRecord(record, supplier, sourceUrl);
  }

  if (isRecord(record.prices)) {
    return normalizeWooRecord(record, supplier);
  }

  return record;
}

function normalizeShopifyRecord(
  record: Record<string, unknown>,
  supplier: SupplierConfig,
  sourceUrl: string,
): Record<string, unknown> {
  const variant = firstRecord(record.variants);
  const price = parseMoney(variant?.price);
  const compareAtPrice = parseMoney(variant?.compare_at_price);
  const isSale = price !== undefined && compareAtPrice !== undefined && compareAtPrice > price;
  const handle = cleanString(record.handle);

  return {
    brand: normalizedBrand(record.vendor, supplier.name),
    sku: variant?.sku,
    upc: variant?.barcode,
    title: record.title,
    available: variant?.available ?? record.available,
    quantity: variant?.inventory_quantity,
    msrp: isSale ? compareAtPrice : (price ?? compareAtPrice),
    sale_price: isSale ? price : undefined,
    url: handle ? `${originFor(sourceUrl)}/products/${handle}` : record.url,
    images: extractImageUrls(record.images),
  };
}

function normalizeWooRecord(record: Record<string, unknown>, supplier: SupplierConfig): Record<string, unknown> {
  const prices = record.prices as Record<string, unknown>;
  const minorUnit = parseInteger(prices.currency_minor_unit) ?? 2;
  const regularPrice = parseMinorMoney(prices.regular_price, minorUnit);
  const currentPrice = parseMinorMoney(prices.price, minorUnit);
  const listedSalePrice = parseMinorMoney(prices.sale_price, minorUnit);
  const salePrice =
    listedSalePrice && regularPrice && listedSalePrice < regularPrice
      ? listedSalePrice
      : currentPrice && regularPrice && currentPrice < regularPrice
        ? currentPrice
        : undefined;

  return {
    brand: supplier.name,
    sku: record.sku,
    title: record.name,
    stockStatus: record.is_in_stock === false ? "out_of_stock" : record.is_in_stock === true ? "in_stock" : undefined,
    msrp: regularPrice ?? currentPrice,
    sale_price: salePrice,
    url: record.permalink,
    images: extractImageUrls(record.images),
  };
}

function extractImageUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    const single = cleanString(value);
    return single ? [single] : undefined;
  }

  const urls = value
    .map((image) => (isRecord(image) ? image.src : image))
    .map(cleanString)
    .filter(Boolean);

  return urls.length > 0 ? urls : undefined;
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return isRecord(value[0]) ? value[0] : undefined;
}

function normalizedBrand(value: unknown, fallback: string): string {
  const raw = cleanString(value);
  if (!raw) {
    return fallback;
  }

  const compactRaw = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const compactFallback = fallback.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return compactRaw === compactFallback ? fallback : raw;
}

function originFor(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    return "";
  }
}

function parseMinorMoney(value: unknown, minorUnit: number): number | undefined {
  const parsed = parseMoney(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.round((parsed / 10 ** minorUnit) * 100) / 100;
}

function parseMoney(value: unknown): number | undefined {
  const text = cleanString(value);
  if (!text) {
    return undefined;
  }

  const parsed = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : undefined;
}

function parseInteger(value: unknown): number | undefined {
  const parsed = Number(cleanString(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

