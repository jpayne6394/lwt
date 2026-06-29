export type RuntimeConfig = {
  port: number;
  host: string;
  databaseUrl?: string;
  shopifyApiKey?: string;
  shopifyShop?: string;
  shopifyAccessToken?: string;
  shopifyApiVersion: string;
  xBearerToken?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  redditUserAgent?: string;
  googleTrendsProviderKey?: string;
  searchProviderKey?: string;
  searchProviderUrl?: string;
  ga4PropertyId?: string;
  ga4CredentialsJson?: string;
  searchConsoleSiteUrl?: string;
  searchConsoleCredentialsJson?: string;
  internalDashboardPassword?: string;
  internalDashboardAuthRequired: boolean;
  contentTopicsPath: string;
  contentRadarSourcesPath: string;
  shopperBehaviorImportDir: string;
  emailWebhookUrl?: string;
  weeklySyncIntervalMs: number;
  memoryProvider: "memory" | "postgres";
  memoryVectorEnabled: boolean;
  embeddingProvider: "local" | "none";
  localLlmRelayUrl?: string;
  localLlmRelayToken?: string;
  localEmbeddingModel: string;
  localLlmTimeoutMs: number;
  memoryMaxContextChars: number;
};

export const DEFAULT_SHOPIFY_API_KEY = "11a896486e45ed90e06e632a3e0bacec";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    databaseUrl: env.DATABASE_URL,
    shopifyApiKey: env.SHOPIFY_API_KEY ?? env.SHOPIFY_CLIENT_ID ?? DEFAULT_SHOPIFY_API_KEY,
    shopifyShop: env.SHOPIFY_STORE_DOMAIN ?? env.SHOPIFY_SHOP,
    shopifyAccessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? env.SHOPIFY_ACCESS_TOKEN,
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-01",
    xBearerToken: env.X_BEARER_TOKEN ?? env.X_API_KEY,
    redditClientId: env.REDDIT_CLIENT_ID,
    redditClientSecret: env.REDDIT_CLIENT_SECRET,
    redditUserAgent: env.REDDIT_USER_AGENT,
    googleTrendsProviderKey: env.GOOGLE_TRENDS_PROVIDER_KEY,
    searchProviderKey: env.SEARCH_PROVIDER_KEY,
    searchProviderUrl: env.SEARCH_PROVIDER_URL,
    ga4PropertyId: env.GA4_PROPERTY_ID,
    ga4CredentialsJson: env.GA4_CREDENTIALS_JSON,
    searchConsoleSiteUrl: env.SEARCH_CONSOLE_SITE_URL,
    searchConsoleCredentialsJson: env.SEARCH_CONSOLE_CREDENTIALS_JSON,
    internalDashboardPassword: env.INTERNAL_DASHBOARD_PASSWORD,
    internalDashboardAuthRequired: parseBoolean(
      env.INTERNAL_DASHBOARD_AUTH_REQUIRED,
      env.RENDER === "true" || env.NODE_ENV === "production",
    ),
    contentTopicsPath: env.CONTENT_TOPICS_PATH ?? "config/content_topics.json",
    contentRadarSourcesPath: env.CONTENT_RADAR_SOURCES_PATH ?? "config/content-radar-sources.json",
    shopperBehaviorImportDir: env.SHOPPER_BEHAVIOR_IMPORT_DIR ?? "imports/shopper-behavior",
    emailWebhookUrl: env.EMAIL_WEBHOOK_URL,
    weeklySyncIntervalMs: Number(env.WEEKLY_SYNC_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
    memoryProvider: env.DATABASE_URL ? "postgres" : "memory",
    memoryVectorEnabled: parseBoolean(env.MEMORY_VECTOR_ENABLED, true),
    embeddingProvider: env.EMBEDDING_PROVIDER === "none" ? "none" : "local",
    localLlmRelayUrl: env.LOCAL_LLM_RELAY_URL,
    localLlmRelayToken: env.LOCAL_LLM_RELAY_TOKEN,
    localEmbeddingModel: env.LOCAL_EMBEDDING_MODEL ?? "auto",
    localLlmTimeoutMs: Number(env.LOCAL_LLM_TIMEOUT_MS ?? 15000),
    memoryMaxContextChars: Number(env.MEMORY_MAX_CONTEXT_CHARS ?? 24000),
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
