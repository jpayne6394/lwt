import type { AiProvider, AutonomyMode } from "../business-os/types.ts";
import type { LocalLlmDataScope } from "../intelligence/types.ts";

export type RuntimeConfig = {
  port: number;
  host: string;
  aiProvider: AiProvider;
  openaiApiKey?: string;
  autonomyMode: AutonomyMode;
  localLlmRelayUrl?: string;
  localLlmRelayToken?: string;
  localLlmModel: string;
  localLlmTimeoutMs: number;
  localLlmDataScope: LocalLlmDataScope;
  localLlmMaxInputChars: number;
  databaseUrl?: string;
  storagePath: string;
  shopifyApiKey?: string;
  shopifyShop?: string;
  shopifyAccessToken?: string;
  shopifyApiVersion: string;
  applyChanges: boolean;
  emailWebhookUrl?: string;
  weeklySyncIntervalMs: number;
  marketRadarSourceUrls: string[];
  competitorPriceUrls: Array<{
    productHandle: string;
    productTitle: string;
    competitor: string;
    url: string;
  }>;
  sourceCredentials: {
    reddit: boolean;
    meta: boolean;
    x: boolean;
    pinterest: boolean;
    truthSocial: boolean;
  };
};

export const DEFAULT_SHOPIFY_API_KEY = "11a896486e45ed90e06e632a3e0bacec";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? "0.0.0.0",
    aiProvider: parseAiProvider(env.AI_PROVIDER),
    openaiApiKey: env.OPENAI_API_KEY,
    autonomyMode: parseAutonomyMode(env.AUTONOMY_MODE),
    localLlmRelayUrl: env.LOCAL_LLM_RELAY_URL,
    localLlmRelayToken: env.LOCAL_LLM_RELAY_TOKEN,
    localLlmModel: env.LOCAL_LLM_MODEL ?? "auto",
    localLlmTimeoutMs: parsePositiveNumber(env.LOCAL_LLM_TIMEOUT_MS, 15000),
    localLlmDataScope: parseLocalDataScope(env.LOCAL_LLM_DATA_SCOPE),
    localLlmMaxInputChars: parsePositiveNumber(env.LOCAL_LLM_MAX_INPUT_CHARS, 24000),
    databaseUrl: env.DATABASE_URL,
    storagePath:
      env.SUPPLIER_OPS_DATA_PATH ??
      env.DATA_PATH ??
      (process.platform === "win32" ? ".supplier-ops-agent-store.json" : "/tmp/supplier-ops-agent-store.json"),
    shopifyApiKey: env.SHOPIFY_API_KEY ?? env.SHOPIFY_CLIENT_ID ?? DEFAULT_SHOPIFY_API_KEY,
    shopifyShop: env.SHOPIFY_SHOP,
    shopifyAccessToken: env.SHOPIFY_ACCESS_TOKEN,
    shopifyApiVersion: env.SHOPIFY_API_VERSION ?? "2026-01",
    applyChanges: env.APPLY_CHANGES === "true",
    emailWebhookUrl: env.EMAIL_WEBHOOK_URL,
    weeklySyncIntervalMs: Number(env.WEEKLY_SYNC_INTERVAL_MS ?? 7 * 24 * 60 * 60 * 1000),
    marketRadarSourceUrls: parseList(env.MARKET_RADAR_SOURCE_URLS),
    competitorPriceUrls: parseCompetitorUrls(env.COMPETITOR_PRICE_URLS),
    sourceCredentials: {
      reddit: Boolean(env.REDDIT_ACCESS_TOKEN || env.REDDIT_CLIENT_ID),
      meta: Boolean(env.META_ACCESS_TOKEN || env.INSTAGRAM_ACCESS_TOKEN),
      x: Boolean(env.X_BEARER_TOKEN || env.TWITTER_BEARER_TOKEN),
      pinterest: Boolean(env.PINTEREST_ACCESS_TOKEN),
      truthSocial: Boolean(env.TRUTH_SOCIAL_APPROVED_ACCESS === "true"),
    },
  };
}

function parseAiProvider(value: string | undefined): RuntimeConfig["aiProvider"] {
  if (value === "mock" || value === "openai" || value === "hybrid") {
    return value;
  }
  return "hybrid";
}

function parseAutonomyMode(value: string | undefined): RuntimeConfig["autonomyMode"] {
  if (value === "supervised" || value === "autonomous") {
    return value;
  }
  return "approval";
}

function parseLocalDataScope(value: string | undefined): LocalLlmDataScope {
  if (value === "catalog" || value === "business" || value === "internal") {
    return value;
  }
  return "internal";
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated parsing.
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseCompetitorUrls(value: string | undefined): RuntimeConfig["competitorPriceUrls"] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as RuntimeConfig["competitorPriceUrls"];
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item.productHandle && item.productTitle && item.competitor && item.url);
    }
  } catch {
    return [];
  }
  return [];
}
