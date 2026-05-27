import { AlertService } from "./alerts/alert-service.ts";
import { createWebhookEmailSender } from "./alerts/email.ts";
import { createLlmClient } from "../lib/llm/index.ts";
import { createActionQueueService, revenuePlayToQueueInput } from "./action-queue/action-queue-service.ts";
import { createChiefOfStaffAgent } from "./business-os/chief-of-staff-agent.ts";
import { buildCampaignDraft } from "./campaigns/campaign-draft-planner.ts";
import type { BuildCampaignDraftInput } from "./campaigns/types.ts";
import { buildBlogDraft } from "./content/blog-template-builder.ts";
import type { BuildBlogDraftInput } from "./content/types.ts";
import { enhanceBlogDraftWithLlm, enhanceCampaignDraftWithLlm, enhanceMarketRadarWithLlm } from "./intelligence/local-enhancers.ts";
import { fetchCompetitorPriceSnapshots } from "./market-radar/competitor-price-monitor.ts";
import { buildMarketRadarOutput } from "./market-radar/market-radar-service.ts";
import { fetchOpenWebSignals } from "./market-radar/open-web-source.ts";
import { buildSourceConnectionCards } from "./market-radar/source-connection-registry.ts";
import { loadConfig } from "./server/config.ts";
import type { ServerContext } from "./server/server.ts";
import { ShopifyAdminGraphqlClient } from "./shopify/admin-graphql-client.ts";
import { ShopifyBiClient } from "./shopify/bi-client.ts";
import { ShopifyCatalogClient } from "./shopify/catalog-client.ts";
import { ShopifyContentClient } from "./shopify/content-client.ts";
import { ShopifySyncClient } from "./shopify/shopify-sync-client.ts";
import { FileRepository } from "./storage/file-repository.ts";
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
  const repository = await createRepository(config.databaseUrl, config.storagePath);
  const actionQueue = createActionQueueService(repository);
  const adapters = createAdaptersFromEnv(suppliers);
  const shopify = createShopifyClients(config);
  const llm = createLlmClient({
    provider: config.aiProvider,
    apiKey: config.openaiApiKey,
    autonomyMode: config.autonomyMode,
    localRelayUrl: config.localLlmRelayUrl,
    localRelayToken: config.localLlmRelayToken,
    localLlmModel: config.localLlmModel,
    localLlmTimeoutMs: config.localLlmTimeoutMs,
    localLlmDataScope: config.localLlmDataScope,
    localLlmMaxInputChars: config.localLlmMaxInputChars,
  });
  const chiefOfStaff = createChiefOfStaffAgent({
    repository,
    llm,
    autonomyMode: config.autonomyMode,
  });
  const sourceConnections = () =>
    buildSourceConnectionCards({
      ...config.sourceCredentials,
      competitorUrls: config.competitorPriceUrls.length > 0,
    });

  let activeRun: Promise<void> | null = null;
  const effectiveDryRun = (dryRun: boolean) => dryRun || !config.applyChanges;
  const startRun = (dryRun: boolean) => {
    if (activeRun) {
      return false;
    }

    const safeDryRun = effectiveDryRun(dryRun);
    activeRun = runSupplierSync({
      adapters,
      repository,
      alerts,
      shopifyCatalogClient: shopify.catalogClient,
      shopifyClient: shopify.syncClient,
      dryRun: safeDryRun,
    })
      .catch((error) => {
        console.error("Supplier sync failed", error);
      })
      .finally(() => {
        activeRun = null;
      });
    return true;
  };

  const runNow = async (dryRun: boolean) => {
    startRun(dryRun);
    await activeRun;
  };

  const serverContext: ServerContext = {
    repository,
    suppliers,
    alerts,
    runNow,
    startRun,
    sourceConnections: sourceConnections(),
    refreshMarketRadar: async () => {
      const now = new Date().toISOString();
      const [cachedVariants, productOpsOutputs, marketSignals, competitorPrices, orders] = await Promise.all([
        repository.listShopifyVariants(),
        repository.recentProductOpsOutputs?.(1) ?? Promise.resolve([]),
        fetchOpenWebSignals(config.marketRadarSourceUrls, now),
        fetchCompetitorPriceSnapshots(config.competitorPriceUrls, now),
        safeRecentOrders(shopify.biClient),
      ]);

      const variants =
        cachedVariants.length > 0
          ? cachedVariants
          : await shopify.catalogClient
              .listVariants()
              .then(async (freshVariants) => {
                await repository.saveShopifyVariants?.(freshVariants);
                return freshVariants;
              })
              .catch(() => cachedVariants);

      const baseOutput = buildMarketRadarOutput({
        shopifyVariants: variants,
        productOpsOutput: productOpsOutputs[0],
        sourceConnections: sourceConnections(),
        marketSignals,
        competitorPrices,
        orders,
        now,
      });
      const output = await enhanceMarketRadarWithLlm(baseOutput, llm);
      await repository.recordMarketRadarOutput?.(output);
      for (const play of output.revenuePlays) {
        await actionQueue.enqueue(revenuePlayToQueueInput(play, output.startedAt), output.finishedAt);
      }
      return output;
    },
    createBlogDraft: async (input: BuildBlogDraftInput) => {
      const draft = await enhanceBlogDraftWithLlm(buildBlogDraft(input), input as unknown as Record<string, unknown>, llm);
      await repository.recordBlogDraft?.(draft);
      return draft;
    },
    createCampaignDraft: async (input: BuildCampaignDraftInput) => {
      const draft = await enhanceCampaignDraftWithLlm(buildCampaignDraft(input), input as unknown as Record<string, unknown>, llm);
      await repository.recordCampaignDraft?.(draft);
      return draft;
    },
    createShopifyDraftArticle: async (draftId: string) => {
      const drafts = await repository.recentBlogDrafts?.(100);
      const draft = drafts?.find((candidate) => candidate.id === draftId);
      if (!draft) {
        throw new Error("Blog draft was not found");
      }
      const blogs = await shopify.contentClient.listBlogs();
      const blog = blogs[0];
      if (!blog) {
        throw new Error("No Shopify blogs were found");
      }
      const article = await shopify.contentClient.createDraftArticle({
        blogId: blog.id,
        title: draft.title,
        authorName: draft.authorName,
        bodyHtml: draft.bodyHtml,
        summary: draft.summary,
        tags: draft.tags,
        handle: draft.handle,
      });
      await repository.updateBlogDraftShopifyArticle?.(draft.id, {
        id: article.id,
        handle: article.handle,
      });
      return article;
    },
    buildDailyCommandReport: () => chiefOfStaff.buildDailyCommandReport(),
    shopifyApiKey: config.shopifyApiKey,
    applyChangesEnabled: config.applyChanges,
    aiProvider: config.aiProvider,
    autonomyMode: config.autonomyMode,
    getAiStatus: () => llm.getStatus(),
  };

  return {
    config,
    serverContext,
    runNow,
  };
}

async function createRepository(databaseUrl: string | undefined, storagePath: string): Promise<SupplierOpsRepository> {
  if (!databaseUrl) {
    return FileRepository.connect(storagePath);
  }

  return PostgresRepository.connect(databaseUrl);
}

function createShopifyClients(config: ReturnType<typeof loadConfig>) {
  if (!config.shopifyShop || !config.shopifyAccessToken) {
    const graphql = async () => {
      throw new Error("Shopify credentials are not configured");
    };

    return {
      catalogClient: new ShopifyCatalogClient(graphql),
      biClient: new ShopifyBiClient({ graphql }),
      contentClient: new ShopifyContentClient({ graphql }),
      syncClient: new ShopifySyncClient({
        graphql,
      }),
    };
  }

  const admin = new ShopifyAdminGraphqlClient({
    shop: config.shopifyShop,
    accessToken: config.shopifyAccessToken,
    apiVersion: config.shopifyApiVersion,
  });
  const graphql = (query: string, variables: Record<string, unknown>) => admin.graphql(query, variables);

  return {
    catalogClient: new ShopifyCatalogClient(graphql),
    biClient: new ShopifyBiClient({ graphql }),
    contentClient: new ShopifyContentClient({ graphql }),
    syncClient: new ShopifySyncClient({
      graphql,
    }),
  };
}

async function safeRecentOrders(client: ShopifyBiClient) {
  try {
    return await client.listRecentOrders();
  } catch {
    return [];
  }
}
