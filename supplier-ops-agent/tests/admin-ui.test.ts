import assert from "node:assert/strict";
import test from "node:test";

import { renderAdminPage } from "../src/server/admin-ui.ts";

test("admin UI renders the required Shopify app sections and run-now control", () => {
  const html = renderAdminPage({
    activePath: "/",
    suppliers: [
      {
        id: "desbio",
        name: "DesBio",
        mode: "website",
        brands: ["DesBio"],
        notes: "Direct supplier portal.",
      },
    ],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    memoryStatus: {
      provider: "postgres",
      connected: true,
      vectorEnabled: false,
      retrievalMode: "keyword_fallback",
      documentCount: 2,
      chunkCount: 4,
      message: "Agent memory is connected; keyword fallback is active until embeddings are indexed.",
    },
  });

  for (const label of ["Dashboard", "Suppliers", "Runs", "Change Ledger", "Match Issues", "Intelligence", "Agent Memory", "Settings"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Run weekly sync now/);
  assert.match(html, /app-bridge/);
  assert.match(html, /<meta name="shopify-api-key" content="test-api-key">/);
  assert.match(html, /keyword fallback/);
  assert.match(html, /Memory Docs/);
});
