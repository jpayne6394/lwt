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
