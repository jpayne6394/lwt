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

test("loadConfig uses a free file-backed store when Postgres is not configured", () => {
  const config = loadConfig({
    SUPPLIER_OPS_DATA_PATH: "/tmp/custom-supplier-store.json",
  });

  assert.equal(config.storagePath, "/tmp/custom-supplier-store.json");
});

test("loadConfig defaults Shopify writes off unless APPLY_CHANGES is explicitly true", () => {
  assert.equal(loadConfig({}).applyChanges, false);
  assert.equal(loadConfig({ APPLY_CHANGES: "false" }).applyChanges, false);
  assert.equal(loadConfig({ APPLY_CHANGES: "true" }).applyChanges, true);
});

test("loadConfig exposes free-first AI provider and approval autonomy settings", () => {
  assert.equal(loadConfig({}).aiProvider, "hybrid");
  assert.equal(loadConfig({}).autonomyMode, "approval");
  assert.equal(loadConfig({ OPENAI_API_KEY: "sk-test" }).openaiApiKey, "sk-test");
  assert.equal(loadConfig({ AI_PROVIDER: "hybrid" }).aiProvider, "hybrid");
  assert.equal(loadConfig({ AI_PROVIDER: "openai", AUTONOMY_MODE: "supervised" }).aiProvider, "openai");
  assert.equal(loadConfig({ AI_PROVIDER: "openai", AUTONOMY_MODE: "supervised" }).autonomyMode, "supervised");
});

test("loadConfig exposes protected local intelligence relay settings", () => {
  const config = loadConfig({
    LOCAL_LLM_RELAY_URL: "https://local-brain.example",
    LOCAL_LLM_RELAY_TOKEN: "relay-secret",
    LOCAL_LLM_MODEL: "auto",
    LOCAL_LLM_TIMEOUT_MS: "12000",
    LOCAL_LLM_DATA_SCOPE: "internal",
    LOCAL_LLM_MAX_INPUT_CHARS: "18000",
  });

  assert.equal(config.localLlmRelayUrl, "https://local-brain.example");
  assert.equal(config.localLlmRelayToken, "relay-secret");
  assert.equal(config.localLlmModel, "auto");
  assert.equal(config.localLlmTimeoutMs, 12000);
  assert.equal(config.localLlmDataScope, "internal");
  assert.equal(config.localLlmMaxInputChars, 18000);
});
