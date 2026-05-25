import { AlertService } from "./alerts/alert-service.ts";
import { createWebhookEmailSender } from "./alerts/email.ts";
import { loadConfig } from "./server/config.ts";
import type { ServerContext } from "./server/server.ts";
import { ShopifyAdminGraphqlClient } from "./shopify/admin-graphql-client.ts";
import { ShopifyCatalogClient } from "./shopify/catalog-client.ts";
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
  const adapters = createAdaptersFromEnv(suppliers);
  const shopify = createShopifyClients(config);

  const runNow = async (dryRun: boolean) => {
    await runSupplierSync({
      adapters,
      repository,
      alerts,
      shopifyCatalogClient: shopify.catalogClient,
      shopifyClient: shopify.syncClient,
      dryRun,
    });
  };

  const serverContext: ServerContext = {
    repository,
    suppliers,
    alerts,
    runNow,
    shopifyApiKey: config.shopifyApiKey,
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
    syncClient: new ShopifySyncClient({
      graphql,
    }),
  };
}
