import type { ShopifyVariant } from "../domain/types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import { readBehaviorImportDirectory } from "./behaviorImportAdapter.ts";
import { buildBehaviorRecommendations } from "./behaviorRecommendationEngine.ts";
import type {
  ContentIdea,
  ShopperBehaviorImportRecord,
  ShopperBehaviorResult,
  ShopperBehaviorSourceStatus,
  ShopperBehaviorSourceStatusMap,
  ShopperProductSignal,
  ShopperRecommendation,
  ShopperSearchTerm,
  ShopifyVariantProvider,
  SourceConfig,
} from "./intelligenceTypes.ts";
import { buildShopperSearchSignals } from "./shopperSearchAnalyzer.ts";

export type RunShopperBehaviorAgentInput = {
  repository: SupplierOpsRepository;
  sourceConfig: SourceConfig;
  importDirectory?: string;
  listShopifyVariants?: ShopifyVariantProvider;
};

export async function runShopperBehaviorAgent(input: RunShopperBehaviorAgentInput): Promise<ShopperBehaviorResult> {
  const errors: string[] = [];
  if (input.importDirectory) {
    try {
      await importShopperBehaviorReports(input.repository, input.importDirectory);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Shopper behavior import failed");
    }
  }

  const [searchTerms, productSignals, imports, contentIdeas, shopifyVariants] = await Promise.all([
    input.repository.recentShopperSearchTerms({ limit: 100 }).catch(() => []),
    input.repository.recentShopperProductSignals({ limit: 100 }).catch(() => []),
    input.repository.recentShopperBehaviorImports({ limit: 20 }).catch(() => []),
    input.repository.recentContentIdeas({ limit: 50 }).catch(() => []),
    listVariants(input),
  ]);
  const searchSignals = buildShopperSearchSignals(searchTerms);
  const builtRecommendations = buildBehaviorRecommendations({ searchTerms, productSignals, shopifyVariants, contentIdeas });
  const savedRecommendations = await input.repository
    .saveShopperRecommendations([...builtRecommendations.recommendations, ...builtRecommendations.contentOpportunities])
    .catch(() => []);
  const recommendations = savedRecommendations.length ? savedRecommendations : await input.repository.recentShopperRecommendations({ limit: 100 }).catch(() => []);
  const contentOpportunities = recommendations.filter((recommendation) => recommendation.recommendationType === "blog_topic_opportunity");

  return buildShopperBehaviorResult({
    sourceConfig: input.sourceConfig,
    searchTerms,
    productSignals,
    imports,
    recommendations,
    contentOpportunities,
    errors,
  });
}

export async function importShopperBehaviorReports(
  repository: SupplierOpsRepository,
  importDirectory: string,
): Promise<ShopperBehaviorImportRecord[]> {
  const parsedImports = await readBehaviorImportDirectory(importDirectory);
  const completed: ShopperBehaviorImportRecord[] = [];
  for (const parsed of parsedImports) {
    const record = await repository.createShopperBehaviorImport({
      source: parsed.source,
      importType: parsed.importType,
      filename: parsed.filename,
      metadataJson: { importMode: "manual_folder" },
    });
    try {
      const [searchTerms, productSignals] = await Promise.all([
        repository.saveShopperSearchTerms(parsed.searchTerms),
        repository.saveShopperProductSignals(parsed.productSignals),
      ]);
      completed.push(
        await repository.completeShopperBehaviorImport(record.id, {
          status: "completed",
          rowCount: searchTerms.length + productSignals.length,
          metadataJson: { importMode: "manual_folder", searchTerms: searchTerms.length, productSignals: productSignals.length },
        }),
      );
    } catch (error) {
      completed.push(
        await repository.completeShopperBehaviorImport(record.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Import failed",
        }),
      );
    }
  }
  return completed;
}

export function buildShopperBehaviorSourceStatuses(
  sourceConfig: SourceConfig,
  imports: ShopperBehaviorImportRecord[] = [],
): ShopperBehaviorSourceStatusMap {
  const lastImportAt = latestFinishedImport(imports);
  return {
    shopify: status(
      "Shopify products/orders",
      sourceConfig.shopifyStoreDomain && sourceConfig.shopifyAdminAccessToken ? [] : ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
      "Configured - existing Shopify product/order reads are available.",
      "Not configured - shopper behavior still uses manual imports/fallback.",
      lastImportAt,
    ),
    shopify_search_discovery_import: importStatus("Shopify Search & Discovery import", imports, "shopify_search_discovery"),
    shopify_analytics_import: importStatus("Shopify analytics import", imports, "shopify_analytics"),
    ga4: status(
      "GA4 connector",
      sourceConfig.ga4PropertyId && sourceConfig.ga4CredentialsJson ? [] : ["GA4_PROPERTY_ID", "GA4_CREDENTIALS_JSON"],
      "Configured - GA4 Data API ready.",
      "Not configured - use manual import/fallback.",
      lastImportAt,
    ),
    search_console: status(
      "Search Console connector",
      sourceConfig.searchConsoleSiteUrl && sourceConfig.searchConsoleCredentialsJson
        ? []
        : ["SEARCH_CONSOLE_SITE_URL", "SEARCH_CONSOLE_CREDENTIALS_JSON"],
      "Configured - Search Console API ready.",
      "Not configured - use manual import/fallback.",
      lastImportAt,
    ),
    manual_import: {
      label: "Manual import folder",
      status: "connected",
      missingEnvVars: [],
      lastImportAt,
      message: "Ready - place aggregate CSV/JSON reports in imports/shopper-behavior.",
    },
  };
}

export function emptyShopperBehaviorResult(sourceConfig: SourceConfig = {}, imports: ShopperBehaviorImportRecord[] = []): ShopperBehaviorResult {
  return buildShopperBehaviorResult({
    sourceConfig,
    searchTerms: [],
    productSignals: [],
    imports,
    recommendations: [],
    contentOpportunities: [],
    errors: [],
  });
}

export function buildShopperBehaviorResult(input: {
  sourceConfig: SourceConfig;
  searchTerms: ShopperSearchTerm[];
  productSignals: ShopperProductSignal[];
  imports: ShopperBehaviorImportRecord[];
  recommendations: ShopperRecommendation[];
  contentOpportunities: ShopperRecommendation[];
  errors: string[];
}): ShopperBehaviorResult {
  const searchSignals = buildShopperSearchSignals(input.searchTerms);
  const openRecommendations = input.recommendations.filter((recommendation) => recommendation.status === "open");
  return {
    generatedAt: new Date().toISOString(),
    sources: buildShopperBehaviorSourceStatuses(input.sourceConfig, input.imports),
    summaryCards: {
      topSearches: searchSignals.topSearches.length,
      noResultSearches: searchSignals.noResultSearches.length,
      productPageFriction: input.productSignals.length,
      newOpportunities: openRecommendations.length,
    },
    searchSignals,
    frictionSignals: input.productSignals,
    recommendations: input.recommendations,
    contentOpportunities: input.contentOpportunities,
    imports: input.imports,
    todaySummary: {
      topShopperSignal: searchSignals.topSearches[0]
        ? `${searchSignals.topSearches[0].term} (${searchSignals.topSearches[0].searchCount} searches)`
        : "No shopper search imports yet.",
      topFrictionPoint: input.productSignals[0]?.reason ?? "No product friction import yet.",
      topRecommendedAction: openRecommendations[0]?.title ?? "Import shopper behavior reports to create recommendations.",
      openRecommendationCount: openRecommendations.length,
    },
    errors: input.errors,
  };
}

function status(
  label: string,
  missingEnvVars: string[],
  connectedMessage: string,
  notConfiguredMessage: string,
  lastImportAt: string | null,
): ShopperBehaviorSourceStatus {
  if (missingEnvVars.length) {
    return {
      label,
      status: "not_configured",
      missingEnvVars,
      lastImportAt,
      message: notConfiguredMessage,
    };
  }
  return {
    label,
    status: "connected",
    missingEnvVars: [],
    lastImportAt,
    message: connectedMessage,
  };
}

function importStatus(
  label: string,
  imports: ShopperBehaviorImportRecord[],
  source: ShopperBehaviorImportRecord["source"],
): ShopperBehaviorSourceStatus {
  const latest = imports.find((item) => item.source === source);
  return {
    label,
    status: latest?.status === "failed" ? "error" : "connected",
    missingEnvVars: [],
    lastImportAt: latest?.finishedAt ?? null,
    error: latest?.error ?? undefined,
    message: latest ? "Latest aggregate import processed." : "Ready for CSV/JSON aggregate report import.",
  };
}

function latestFinishedImport(imports: ShopperBehaviorImportRecord[]): string | null {
  return imports.find((record) => record.finishedAt)?.finishedAt ?? null;
}

async function listVariants(input: RunShopperBehaviorAgentInput): Promise<ShopifyVariant[]> {
  if (input.listShopifyVariants) {
    return input.listShopifyVariants().catch(() => []);
  }
  return input.repository.listShopifyVariants().catch(() => []);
}
