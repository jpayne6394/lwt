import { parseBehaviorImportFile, parseBehaviorRows } from "./behaviorImportAdapter.ts";
import type {
  BehaviorImportColumnMapping,
  BehaviorImportMappedField,
  BehaviorImportPreview,
  BehaviorImportPreviewRow,
  ShopperBehaviorImportSource,
  ShopperBehaviorImportType,
  ShopperBehaviorReportType,
} from "./intelligenceTypes.ts";

export type BehaviorImportContentInput = {
  filename: string;
  reportType: ShopperBehaviorReportType;
  content: string;
};

type ReportConfig = {
  source: ShopperBehaviorImportSource;
  importType: ShopperBehaviorImportType;
  requiredGroups: Array<{ label: string; fields: BehaviorImportMappedField[] }>;
};

const FIELD_ALIASES: Record<BehaviorImportMappedField, string[]> = {
  term: ["query", "term", "search_term", "search_query"],
  searchCount: ["searches", "search_count", "total_searches", "query_count", "impressions"],
  clickCount: ["clicks", "click_count"],
  purchaseCount: ["purchases", "purchase_count", "conversions", "orders"],
  noResultsCount: ["no_results", "no_results_count", "zero_results"],
  noClickCount: ["no_clicks", "no_click_count"],
  productTitle: ["product_title", "item_name", "product", "title"],
  shopifyProductId: ["product_id", "shopify_product_id"],
  views: ["views", "page_views", "item_views", "product_views", "sessions"],
  addToCarts: ["add_to_carts", "add_to_cart", "carts"],
  dateRange: ["date_range", "date", "period"],
};

const REPORT_CONFIGS: Record<ShopperBehaviorReportType, ReportConfig> = {
  shopify_search_terms: {
    source: "shopify_search_discovery",
    importType: "search_terms",
    requiredGroups: [{ label: "term/query", fields: ["term"] }, { label: "search count", fields: ["searchCount"] }],
  },
  shopify_no_result_searches: {
    source: "shopify_search_discovery",
    importType: "search_terms",
    requiredGroups: [{ label: "term/query", fields: ["term"] }, { label: "no results", fields: ["noResultsCount"] }],
  },
  shopify_product_engagement: {
    source: "shopify_analytics",
    importType: "product_engagement",
    requiredGroups: [{ label: "product title", fields: ["productTitle"] }, { label: "views", fields: ["views"] }],
  },
  ga4_site_search: {
    source: "ga4",
    importType: "search_terms",
    requiredGroups: [{ label: "term/query", fields: ["term"] }, { label: "search count", fields: ["searchCount"] }],
  },
  ga4_landing_product_engagement: {
    source: "ga4",
    importType: "product_engagement",
    requiredGroups: [{ label: "product title", fields: ["productTitle"] }, { label: "views", fields: ["views"] }],
  },
  search_console_queries: {
    source: "search_console",
    importType: "search_terms",
    requiredGroups: [{ label: "term/query", fields: ["term"] }, { label: "search count", fields: ["searchCount"] }],
  },
  generic_shopper_behavior_csv: {
    source: "manual_import",
    importType: "search_terms",
    requiredGroups: [{ label: "term/query", fields: ["term"] }, { label: "search count", fields: ["searchCount"] }],
  },
};

export function previewBehaviorImport(input: BehaviorImportContentInput): BehaviorImportPreview {
  const config = REPORT_CONFIGS[input.reportType];
  if (!config) {
    throw new Error(`Unsupported report type: ${input.reportType}`);
  }

  const rows = parseBehaviorRows(input.content, input.filename);
  const headers = Object.keys(rows[0] ?? {});
  const mappedColumns = mapColumns(headers);
  const missingColumns = config.requiredGroups
    .filter((group) => !group.fields.some((field) => mappedColumns[field]))
    .map((group) => group.label);
  const errors = [
    ...(!rows.length ? ["No rows found. Upload or paste a CSV/JSON report with headers and at least one aggregate row."] : []),
    ...missingColumns.map((column) => `Missing required column: ${column}.`),
  ];
  const normalizedRows = rows.map((row) => previewRow(row, mappedColumns));
  const valid = errors.length === 0;

  return {
    valid,
    reportType: input.reportType,
    source: config.source,
    importType: config.importType,
    filename: input.filename,
    rowCount: rows.length,
    mappedColumns,
    missingColumns,
    sampleRows: normalizedRows.slice(0, 5),
    errors,
    operatorMessage: valid
      ? "Preview valid. Confirm import when ready."
      : `This report was not imported. ${errors.join(" ")} Fix the export columns or choose the matching report type, then preview again.`,
  };
}

export function parsePreviewedBehaviorImport(input: BehaviorImportContentInput) {
  const preview = previewBehaviorImport(input);
  if (!preview.valid) {
    throw new Error(preview.errors.join(" "));
  }
  return {
    preview,
    parsed: parseBehaviorImportFile({
      filename: input.filename,
      source: preview.source,
      importType: preview.importType,
      content: input.content,
    }),
  };
}

function mapColumns(headers: string[]): BehaviorImportColumnMapping {
  const mapping: BehaviorImportColumnMapping = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[BehaviorImportMappedField, string[]]>) {
    const match = aliases.find((alias) => headers.includes(alias));
    if (match) {
      mapping[field] = match;
    }
  }
  return mapping;
}

function previewRow(row: Record<string, string>, mapping: BehaviorImportColumnMapping): BehaviorImportPreviewRow {
  return {
    term: stringValue(row, mapping.term),
    searchCount: numberValue(row, mapping.searchCount),
    clickCount: numberValue(row, mapping.clickCount),
    purchaseCount: numberValue(row, mapping.purchaseCount),
    noResultsCount: numberValue(row, mapping.noResultsCount),
    noClickCount: numberValue(row, mapping.noClickCount),
    productTitle: stringValue(row, mapping.productTitle),
    shopifyProductId: stringValue(row, mapping.shopifyProductId),
    views: numberValue(row, mapping.views),
    addToCarts: numberValue(row, mapping.addToCarts),
    dateRange: stringValue(row, mapping.dateRange),
  };
}

function stringValue(row: Record<string, string>, key: string | undefined): string | undefined {
  const value = key ? row[key]?.trim() : undefined;
  return value || undefined;
}

function numberValue(row: Record<string, string>, key: string | undefined): number | undefined {
  const raw = stringValue(row, key);
  if (!raw) return undefined;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}
