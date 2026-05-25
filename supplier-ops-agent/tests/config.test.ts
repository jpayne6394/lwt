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
