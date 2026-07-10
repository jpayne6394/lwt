import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SHOPIFY_API_KEY, loadConfig } from "../src/server/config.ts";

test("loadConfig uses the Supplier Ops Shopify API key as a free deploy fallback", () => {
  const config = loadConfig({});

  assert.equal(config.shopifyApiKey, DEFAULT_SHOPIFY_API_KEY);
});

test("loadConfig allows Render environment variables to override the Shopify API key", () => {
  const config = loadConfig({
    SHOPIFY_API_KEY: "env-api-key",
  });

  assert.equal(config.shopifyApiKey, "env-api-key");
});

test("loadConfig enables free-first cloud memory defaults", () => {
  const config = loadConfig({});

  assert.equal(config.memoryProvider, "memory");
  assert.equal(config.memoryVectorEnabled, true);
  assert.equal(config.embeddingProvider, "local");
  assert.equal(config.localEmbeddingModel, "auto");
  assert.equal(config.memoryMaxContextChars, 24000);
  assert.equal(config.localDevMemorySeedEnabled, true);
  assert.equal(config.superAgentMemorySeedsPath, "config/super-agent-memory-seeds.json");
});

test("loadConfig selects Postgres memory when DATABASE_URL is configured", () => {
  const config = loadConfig({
    DATABASE_URL: "postgres://example",
    MEMORY_VECTOR_ENABLED: "false",
    EMBEDDING_PROVIDER: "none",
    MEMORY_MAX_CONTEXT_CHARS: "12000",
  });

  assert.equal(config.memoryProvider, "postgres");
  assert.equal(config.memoryVectorEnabled, false);
  assert.equal(config.embeddingProvider, "none");
  assert.equal(config.memoryMaxContextChars, 12000);
  assert.equal(config.localDevMemorySeedEnabled, false);
});

test("loadConfig accepts intelligence connector environment variables", () => {
  const config = loadConfig({
    SHOPIFY_STORE_DOMAIN: "living-well-today.myshopify.com",
    SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_admin",
    X_BEARER_TOKEN: "x-token",
    REDDIT_CLIENT_ID: "reddit-id",
    REDDIT_CLIENT_SECRET: "reddit-secret",
    REDDIT_USER_AGENT: "lwt-test",
    GOOGLE_TRENDS_PROVIDER_KEY: "trends-key",
    INTERNAL_DASHBOARD_PASSWORD: "secret",
    CONTENT_TOPICS_PATH: "config/test-topics.json",
  });

  assert.equal(config.shopifyShop, "living-well-today.myshopify.com");
  assert.equal(config.shopifyAccessToken, "shpat_admin");
  assert.equal(config.xBearerToken, "x-token");
  assert.equal(config.redditClientId, "reddit-id");
  assert.equal(config.redditClientSecret, "reddit-secret");
  assert.equal(config.redditUserAgent, "lwt-test");
  assert.equal(config.googleTrendsProviderKey, "trends-key");
  assert.equal(config.internalDashboardPassword, "secret");
  assert.equal(config.contentTopicsPath, "config/test-topics.json");
});
