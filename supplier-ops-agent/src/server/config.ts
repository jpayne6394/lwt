export type RuntimeConfig = {
  port: number;
  host: string;
  databaseUrl?: string;
  storagePath: string;
  shopifyApiKey?: string;
  shopifyShop?: string;
  shopifyAccessToken?: string;
  shopifyApiVersion: string;
  emailWebhookUrl?: string;
  weeklySyncIntervalMs: number;
};

export const DEFAULT_SHOPIFY_API_KEY = "11a896486e45ed90e06e632a3e0bacec";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL,
    storagePath:
      env.SUPPLIER_OPS_DATA_PATH ??
      env.DATA_PATH ??
      (process.platform === "win32" ? ".supplier-ops-agent-store.json" : "/tmp/supplier-ops-agent-store.json"),
    shopifyApiKey: env.SHOPIFY_API_KEY ?? env.SHOPIFY_CLIENT_ID ?? DEFAULT_SHOPIFY_API_KEY,
    shopifyShop: env.SHOPIFY_SHOP,
    shopifyAccessToken: env.SHOPIFY_ACCESS_TOKEN,
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-01",
    emailWebhookUrl: env.EMAIL_WEBHOOK_URL,
    weeklySyncIntervalMs: Number(env.WEEKLY_SYNC_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
  };
}
