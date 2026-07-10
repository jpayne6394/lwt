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

test("agent memory page renders the local dev training feed", () => {
  const html = renderAdminPage({
    activePath: "/memory",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    memoryStatus: {
      provider: "postgres",
      connected: true,
      vectorEnabled: false,
      retrievalMode: "keyword_fallback",
      documentCount: 1,
      chunkCount: 1,
      message: "Agent memory is connected; keyword fallback is active until embeddings are indexed.",
    },
    memoryDocuments: [
      {
        id: "lwt-memory-policy",
        sourceType: "business_note",
        title: "LWT Super Agent Source And Memory Policy",
        summary: "Use no-paid dev-mode retrieval memory from internal and manual sources.",
        content: "No paid fine-tuning, no scraping, and no customer-level shopper tracking.",
        metadata: { sourceBatch: "2026-07-10" },
        relatedProducts: ["magnesium"],
        relatedCollections: ["supplements"],
        relatedCampaigns: [],
        evidenceLinks: ["internal://lwt/super-agent/policy"],
        sensitivity: "internal",
        createdAt: "2026-07-10T12:00:00.000Z",
        updatedAt: "2026-07-10T12:00:00.000Z",
      },
    ],
  });

  assert.match(html, /Local Dev Training Feed/);
  assert.match(html, /retrieval memory/);
  assert.match(html, /LWT Super Agent Source And Memory Policy/);
  assert.match(html, /business_note/);
  assert.match(html, /internal/);
  assert.match(html, /sourceBatch: 2026-07-10/);
  assert.match(html, /internal:\/\/lwt\/super-agent\/policy/);
});
