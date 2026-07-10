import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type {
  ShopperBehaviorImportSource,
  ShopperBehaviorImportType,
  ShopperProductSignal,
  ShopperSearchTerm,
} from "./intelligenceTypes.ts";
import { normalizeSearchTerm } from "./shopperSearchAnalyzer.ts";

export type BehaviorImportFileInput = {
  filename: string;
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  content: string;
};

export type ParsedBehaviorImport = {
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  filename: string;
  searchTerms: Omit<ShopperSearchTerm, "id" | "createdAt">[];
  productSignals: Omit<ShopperProductSignal, "id" | "createdAt">[];
};

export async function readBehaviorImportDirectory(directory: string): Promise<ParsedBehaviorImport[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const imports: ParsedBehaviorImport[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (extension !== ".csv" && extension !== ".json") continue;
    const source = sourceForFilename(entry.name);
    const importType = importTypeForFilename(entry.name);
    const content = await readFile(join(directory, entry.name), "utf8");
    imports.push(parseBehaviorImportFile({ filename: entry.name, source, importType, content }));
  }
  return imports;
}

export function parseBehaviorImportFile(input: BehaviorImportFileInput): ParsedBehaviorImport {
  const rows = parseRows(input.content, input.filename);
  if (input.importType === "product_engagement") {
    return {
      ...input,
      searchTerms: [],
      productSignals: rows.flatMap((row) => productSignalsFromRow(row, input.source)),
    };
  }

  return {
    ...input,
    searchTerms: rows.flatMap((row) => searchTermFromRow(row, input.source)),
    productSignals: [],
  };
}

function parseRows(content: string, filename: string): Array<Record<string, string>> {
  return parseBehaviorRows(content, filename);
}

export function parseBehaviorRows(content: string, filename: string): Array<Record<string, string>> {
  if (extname(filename).toLowerCase() === ".json") {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`${filename} must contain a JSON array`);
    }
    return parsed.map((row) => normalizeRow(row as Record<string, unknown>));
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return [];
  }
  const headers = splitCsvLine(lines[0]).map(normalizeBehaviorColumnName);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function searchTermFromRow(row: Record<string, string>, source: ShopperBehaviorImportSource): Omit<ShopperSearchTerm, "id" | "createdAt">[] {
  const term = firstValue(row, ["term", "query", "search_term", "search_query"]);
  if (!term) {
    return [];
  }
  const now = new Date().toISOString();
  return [
    {
      term,
      normalizedTerm: normalizeSearchTerm(term),
      source,
      searchCount: numberValue(row, ["search_count", "searches", "query_count", "total_searches", "impressions"]),
      clickCount: optionalNumberValue(row, ["click_count", "clicks"]),
      purchaseCount: optionalNumberValue(row, ["purchase_count", "purchases", "orders", "conversions"]),
      noResultsCount: optionalNumberValue(row, ["no_results_count", "no_results", "zero_results"]),
      noClickCount: optionalNumberValue(row, ["no_click_count", "no_clicks", "no_click_count"]),
      firstSeenAt: now,
      lastSeenAt: now,
      scoreJson: { dateRange: firstValue(row, ["date_range", "date", "period"]) },
      dateRange: firstValue(row, ["date_range", "date", "period"]),
    },
  ];
}

function productSignalsFromRow(row: Record<string, string>, source: ShopperBehaviorImportSource): Array<Omit<ShopperProductSignal, "id" | "createdAt">> {
  const productTitle = firstValue(row, ["product_title", "title", "product", "item_name"]);
  if (!productTitle) {
    return [];
  }
  const views = numberValue(row, ["views", "product_views", "sessions", "page_views", "item_views"]);
  const addToCarts = numberValue(row, ["add_to_carts", "add_to_cart", "carts"]);
  const purchases = numberValue(row, ["purchases", "orders", "conversions"]);
  const dateRange = firstValue(row, ["date_range", "date", "period"]);
  const shopifyProductId = firstValue(row, ["shopify_product_id", "product_id"]);
  const signals: Array<Omit<ShopperProductSignal, "id" | "createdAt">> = [];

  if (views >= 50 && addToCarts / Math.max(views, 1) < 0.08) {
    signals.push({
      shopifyProductId,
      productTitle,
      signalType: "high_views_low_cart",
      metricName: "view_to_cart_rate",
      metricValue: addToCarts / Math.max(views, 1),
      priority: views >= 150 ? "Critical" : "Watch",
      reason: `${productTitle} has ${views} views but only ${addToCarts} add-to-carts.`,
      source,
      dateRange,
    });
  }

  if (addToCarts >= 5 && purchases / Math.max(addToCarts, 1) < 0.3) {
    signals.push({
      shopifyProductId,
      productTitle,
      signalType: "high_cart_low_purchase",
      metricName: "cart_to_purchase_rate",
      metricValue: purchases / Math.max(addToCarts, 1),
      priority: addToCarts >= 10 ? "Critical" : "Watch",
      reason: `${productTitle} has ${addToCarts} add-to-carts but only ${purchases} purchases.`,
      source,
      dateRange,
    });
  }

  return signals;
}

function sourceForFilename(filename: string): ShopperBehaviorImportSource {
  const normalized = filename.toLowerCase();
  if (normalized.includes("ga4")) return "ga4";
  if (normalized.includes("console")) return "search_console";
  if (normalized.includes("analytics")) return "shopify_analytics";
  if (normalized.includes("search")) return "shopify_search_discovery";
  return "manual_import";
}

function importTypeForFilename(filename: string): ShopperBehaviorImportType {
  const normalized = filename.toLowerCase();
  if (normalized.includes("product") || normalized.includes("engagement")) return "product_engagement";
  return "search_terms";
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeBehaviorColumnName(key), value === undefined || value === null ? "" : String(value)]),
  );
}

export function normalizeBehaviorColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
}

export function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function firstValue(row: Record<string, string>, keys: string[]): string | undefined {
  return keys.map((key) => row[key]?.trim()).find(Boolean);
}

function numberValue(row: Record<string, string>, keys: string[]): number {
  return optionalNumberValue(row, keys) ?? 0;
}

function optionalNumberValue(row: Record<string, string>, keys: string[]): number | undefined {
  const raw = firstValue(row, keys);
  if (!raw) return undefined;
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}
