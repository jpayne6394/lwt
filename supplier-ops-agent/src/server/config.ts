export type RuntimeConfig = {
  port: number;
  host: string;
  databaseUrl?: string;
  shopifyShop?: string;
  shopifyAccessToken?: string;
  shopifyApiVersion: string;
  emailWebhookUrl?: string;
  weeklySyncIntervalMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL,
    shopifyShop: env.SHOPIFY_SHOP,
    shopifyAccessToken: env.SHOPIFY_ACCESS_TOKEN,
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-01",
    emailWebhookUrl: env.EMAIL_WEBHOOK_URL,
    weeklySyncIntervalMs: Number(env.WEEKLY_SYNC_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
  };
}

