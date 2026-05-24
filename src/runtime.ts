import { AlertService } from "./alerts/alert-service.ts";
import { createWebhookEmailSender } from "./alerts/email.ts";
import { loadConfig } from "./server/config.ts";
import type { ServerContext } from "./server/server.ts";
import { ShopifyAdminGraphqlClient } from "./shopify/admin-graphql-client.ts";
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
  const adapters = createAdaptersFromEnv(suppliers);
  const shopifyClient = createShopifyClient(config);

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

