import { readFile } from "node:fs/promises";

import { AlertService } from "./alerts/alert-service.ts";
import { createIntelligenceService } from "./agents/intelligenceService.ts";
import type { ContentRadarSourceSettings } from "./agents/intelligenceTypes.ts";
import { createWebhookEmailSender } from "./alerts/email.ts";
import { createDisabledEmbeddingClient, LocalRelayEmbeddingClient } from "./memory/embedding-client.ts";
import { createAgentMemoryService } from "./memory/memory-service.ts";
import type { SaveMemoryDocumentInput } from "./memory/types.ts";
import { loadConfig } from "./server/config.ts";
import type { ServerContext } from "./server/server.ts";
import { ShopifyAdminGraphqlClient } from "./shopify/admin-graphql-client.ts";
import { ShopifyCatalogClient } from "./shopify/catalog-client.ts";
import { ShopifySyncClient } from "./shopify/shopify-sync-client.ts";
import { MemoryRepository } from "./storage/memory-repository.ts";
import { PostgresRepository } from "./storage/postgres-repository.ts";
import type { SupplierOpsRepository } from "./storage/repository.ts";
import { createAdaptersFromEnv } from "./suppliers/factory.ts";
import { createSupplierRegistry } from "./suppliers/registry.ts";
import { runSupplierSync } from "./worker/run-sync.ts";

export async function createRuntime() {
  const config = loadConfig();
  const suppliers = createSupplierRegistry();
  const alerts = new AlertService({
    sendEmail: createWebhookEmailSender(config.emailWebhookUrl),
  });
  const repository = await createRepository(config.databaseUrl);
  const embeddingClient =
    config.embeddingProvider === "local"
      ? new LocalRelayEmbeddingClient({
          relayUrl: config.localLlmRelayUrl,
          relayToken: config.localLlmRelayToken,
          model: config.localEmbeddingModel,
          timeoutMs: config.localLlmTimeoutMs,
        })
      : createDisabledEmbeddingClient();
  const memoryService = createAgentMemoryService({
    repository,
    embeddingClient,
    vectorEnabled: config.memoryVectorEnabled,
    maxContextChars: config.memoryMaxContextChars,
  });
  await seedLocalDevMemory(memoryService, config);
  const adapters = createAdaptersFromEnv(suppliers);
  const shopifyClient = createShopifyClient(config);
  const contentTopics = await loadContentTopics(config.contentTopicsPath);
  const radarSettings = await loadContentRadarSettings(config.contentRadarSourcesPath, contentTopics);
  const intelligenceService = createIntelligenceService({
    repository,
    topics: contentTopics,
    radarSettings,
    sourceConfig: {
      shopifyStoreDomain: config.shopifyShop,
      shopifyAdminAccessToken: config.shopifyAccessToken,
      xBearerToken: config.xBearerToken,
      redditClientId: config.redditClientId,
      redditClientSecret: config.redditClientSecret,
      redditUserAgent: config.redditUserAgent,
      googleTrendsProviderKey: config.googleTrendsProviderKey,
      searchProviderKey: config.searchProviderKey,
      searchProviderUrl: config.searchProviderUrl,
      ga4PropertyId: config.ga4PropertyId,
      ga4CredentialsJson: config.ga4CredentialsJson,
      searchConsoleSiteUrl: config.searchConsoleSiteUrl,
      searchConsoleCredentialsJson: config.searchConsoleCredentialsJson,
      internalDashboardPassword: config.internalDashboardPassword,
    },
    behaviorImportDirectory: config.shopperBehaviorImportDir,
    listShopifyVariants: createShopifyVariantProvider(config, repository),
  });

  const runNow = async (dryRun: boolean) => {
    await runSupplierSync({
      adapters,
      repository,
      alerts,
      shopifyClient,
      dryRun,
    });
  };

  const serverContext: ServerContext = {
    repository,
    suppliers,
    alerts,
    runNow,
    shopifyApiKey: config.shopifyApiKey,
    memoryService,
    intelligenceService,
    internalDashboardPassword: config.internalDashboardPassword,
    internalDashboardAuthRequired: config.internalDashboardAuthRequired,
  };

  return {
    config,
    serverContext,
    runNow,
  };
}

async function createRepository(databaseUrl: string | undefined): Promise<SupplierOpsRepository> {
  if (!databaseUrl) {
    return new MemoryRepository();
  }

  return PostgresRepository.connect(databaseUrl);
}

async function seedLocalDevMemory(memoryService: AgentMemoryService, config: ReturnType<typeof loadConfig>): Promise<void> {
  if (!config.localDevMemorySeedEnabled || config.databaseUrl) {
    return;
  }

  const documents = await readSuperAgentMemorySeeds(config.superAgentMemorySeedsPath);
  for (const document of documents) {
    await memoryService.saveDocument(document);
  }
}

async function readSuperAgentMemorySeeds(path: string): Promise<SaveMemoryDocumentInput[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    const documents = parsed && typeof parsed === "object" ? (parsed as { documents?: unknown }).documents : undefined;
    if (!Array.isArray(documents)) {
      return [];
    }
    return documents.map(normalizeMemorySeedDocument).filter((document): document is SaveMemoryDocumentInput => Boolean(document));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    console.warn(`Local dev memory seed skipped: ${error instanceof Error ? error.message : "unknown error"}`);
    return [];
  }
}

function normalizeMemorySeedDocument(value: unknown): SaveMemoryDocumentInput | null {
  const document = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (
    typeof document.sourceType !== "string" ||
    typeof document.title !== "string" ||
    typeof document.summary !== "string" ||
    typeof document.content !== "string"
  ) {
    return null;
  }

  return {
    id: typeof document.id === "string" ? document.id : undefined,
    sourceType: document.sourceType as SaveMemoryDocumentInput["sourceType"],
    title: document.title,
    summary: document.summary,
    content: document.content,
    metadata: isPlainObject(document.metadata) ? document.metadata : {},
    relatedProducts: stringArray(document.relatedProducts),
    relatedCollections: stringArray(document.relatedCollections),
    relatedCampaigns: stringArray(document.relatedCampaigns),
    evidenceLinks: stringArray(document.evidenceLinks),
    sensitivity: isMemorySensitivity(document.sensitivity) ? document.sensitivity : "internal",
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isMemorySensitivity(value: unknown): value is SaveMemoryDocumentInput["sensitivity"] {
  return value === "public" || value === "internal" || value === "restricted";
}

function createShopifyClient(config: ReturnType<typeof loadConfig>) {
  if (!config.shopifyShop || !config.shopifyAccessToken) {
    return new ShopifySyncClient({
      graphql: async () => {
        throw new Error("Shopify credentials are not configured");
      },
    });
  }

  const admin = new ShopifyAdminGraphqlClient({
    shop: config.shopifyShop,
    accessToken: config.shopifyAccessToken,
    apiVersion: config.shopifyApiVersion,
  });

  return new ShopifySyncClient({
    graphql: (query, variables) => admin.graphql(query, variables),
  });
}

function createShopifyVariantProvider(config: ReturnType<typeof loadConfig>, repository: SupplierOpsRepository) {
  if (!config.shopifyShop || !config.shopifyAccessToken) {
    return () => repository.listShopifyVariants();
  }

  const admin = new ShopifyAdminGraphqlClient({
    shop: config.shopifyShop,
    accessToken: config.shopifyAccessToken,
    apiVersion: config.shopifyApiVersion,
  });
  const catalog = new ShopifyCatalogClient((query, variables) => admin.graphql(query, variables));
  return async () => {
    const liveVariants = await catalog.listVariants();
    return liveVariants.length ? liveVariants : repository.listShopifyVariants();
  };
}

async function loadContentTopics(path: string): Promise<string[]> {
  try {
    const json = JSON.parse(await readFile(path, "utf8")) as { topics?: string[] };
    if (Array.isArray(json.topics) && json.topics.length) {
      return json.topics.filter((topic): topic is string => typeof topic === "string" && Boolean(topic.trim()));
    }
  } catch {
    // The manual topic fallback keeps startup working before config files are deployed.
  }

  return [
    "magnesium",
    "sleep support",
    "stress support",
    "gut health",
    "immune support",
    "inflammation support",
    "energy support",
    "women's wellness",
    "men's wellness",
    "methylation / B vitamins",
    "omega 3",
    "probiotics",
    "vitamin D",
    "practitioner-guided supplement selection",
    "biofeedback",
    "neurofeedback",
    "red light therapy",
    "ZYTO",
    "supplement quality",
    "supplement interactions / ask practitioner angle",
  ];
}

async function loadContentRadarSettings(path: string, fallbackTopics: string[]): Promise<ContentRadarSourceSettings> {
  try {
    const json = JSON.parse(await readFile(path, "utf8")) as Partial<ContentRadarSourceSettings>;
    return {
      topicClusters: stringList(json.topicClusters).length ? stringList(json.topicClusters) : fallbackTopics,
      keywords: stringList(json.keywords),
      excludedTerms: stringList(json.excludedTerms),
      subreddits: stringList(json.subreddits).length ? stringList(json.subreddits) : ["Supplements"],
      xQueries: stringList(json.xQueries),
      searchQueries: stringList(json.searchQueries),
      scanFrequencyNotes: typeof json.scanFrequencyNotes === "string" ? json.scanFrequencyNotes : "Manual fallback runs on demand.",
      listeningSeeds: socialListeningSeeds(json.listeningSeeds),
    };
  } catch {
    return {
      topicClusters: fallbackTopics,
      keywords: [],
      excludedTerms: [],
      subreddits: ["Supplements"],
      xQueries: [],
      searchQueries: [],
      scanFrequencyNotes: "Manual fallback runs on demand until config/content-radar-sources.json is available.",
      listeningSeeds: [],
    };
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function socialListeningSeeds(value: unknown): ContentRadarSourceSettings["listeningSeeds"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const seed = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const topic = typeof seed.topic === "string" ? seed.topic.trim() : "";
    const audienceQuestion = typeof seed.audienceQuestion === "string" ? seed.audienceQuestion.trim() : "";
    const priority = seed.priority === "high" || seed.priority === "medium" || seed.priority === "low" ? seed.priority : "medium";
    if (!topic || !audienceQuestion) {
      return [];
    }
    return [{
      topic,
      priority,
      audienceQuestion,
      reactionThemes: stringList(seed.reactionThemes),
      objectionThemes: stringList(seed.objectionThemes),
      personalExperienceAngles: stringList(seed.personalExperienceAngles),
      popularStructurePatterns: stringList(seed.popularStructurePatterns),
      safeBlogAngles: stringList(seed.safeBlogAngles),
      relatedProducts: stringList(seed.relatedProducts),
      relatedCollections: stringList(seed.relatedCollections),
      sourceUrl: typeof seed.sourceUrl === "string" ? seed.sourceUrl.trim() : undefined,
      sourceNote: typeof seed.sourceNote === "string" ? seed.sourceNote.trim() : undefined,
    }];
  });
}
