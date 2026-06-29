import assert from "node:assert/strict";
import test from "node:test";

import { createAgentMemoryService } from "../src/memory/memory-service.ts";
import type { EmbeddingClient } from "../src/memory/embedding-client.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

test("agent memory stores sanitized summaries and searches by keyword fallback", async () => {
  const repository = new MemoryRepository();
  const service = createAgentMemoryService({
    repository,
    embeddingClient: fallbackEmbeddingClient("offline"),
    vectorEnabled: true,
    maxContextChars: 600,
  });

  const document = await service.saveDocument({
    sourceType: "market_signal",
    title: "Magnesium sleep support trend",
    summary: "Customers are asking for calmer nighttime routines.",
    content:
      "Customer jane@example.com asked us to call 555-123-4567 about insomnia products. Public copy should say sleep support.",
    relatedProducts: ["Magnesium Glycinate"],
    relatedCollections: ["Sleep Support"],
    evidenceLinks: ["https://example.com/sleep-signal"],
    sensitivity: "internal",
    metadata: { source: "manual note" },
  });

  assert.equal(document.content.includes("jane@example.com"), false);
  assert.equal(document.content.includes("555-123-4567"), false);
  assert.match(document.content, /\[redacted-email\]/);
  assert.match(document.content, /\[redacted-phone\]/);

  const search = await service.searchMemory({
    query: "magnesium sleep support",
    limit: 3,
    agentName: "BI Analyst",
  });

  assert.equal(search.retrievalMode, "keyword_fallback");
  assert.equal(search.results[0].document.title, "Magnesium sleep support trend");
  assert.equal(search.context.documents[0].evidenceLinks[0], "https://example.com/sleep-signal");

  const status = await repository.memoryStatus();
  assert.equal(status.documentCount, 1);
  assert.equal(status.chunkCount, 1);

  assert.deepEqual(repository.listMemoryRetrievalLogs().map((log) => log.agentName), ["BI Analyst"]);
  assert.equal(JSON.stringify(repository.listMemoryRetrievalLogs()).includes("jane@example.com"), false);
});

test("agent memory ranks vector matches ahead of keyword-only matches", async () => {
  const repository = new MemoryRepository();
  const service = createAgentMemoryService({
    repository,
    embeddingClient: vectorEmbeddingClient(),
    vectorEnabled: true,
    maxContextChars: 1000,
  });

  await service.saveDocument({
    sourceType: "campaign_draft",
    title: "General immune support promo",
    summary: "Immune support campaign note.",
    content: "Immune support products are steady sellers.",
    sensitivity: "internal",
  });
  await service.saveDocument({
    sourceType: "market_signal",
    title: "Magnesium buyer intent spike",
    summary: "People are comparing magnesium forms for sleep support.",
    content: "Magnesium glycinate and sleep support questions are increasing.",
    sensitivity: "internal",
  });

  const search = await service.searchMemory({
    query: "what should we promote for magnesium sleep support",
    limit: 2,
  });

  assert.equal(search.retrievalMode, "vector");
  assert.equal(search.results[0].document.title, "Magnesium buyer intent spike");
  assert.equal(search.results[0].matchType, "vector");
});

test("agent memory trims context packets to the configured character budget", async () => {
  const repository = new MemoryRepository();
  const service = createAgentMemoryService({
    repository,
    embeddingClient: fallbackEmbeddingClient("missing relay"),
    vectorEnabled: false,
    maxContextChars: 140,
  });

  await service.saveDocument({
    sourceType: "business_note",
    title: "Long catalog note",
    summary: "Catalog cleanup context.",
    content: "catalog ".repeat(80),
    sensitivity: "internal",
  });

  const search = await service.searchMemory({ query: "catalog cleanup", limit: 1 });

  assert.ok(search.context.totalChars <= 140);
  assert.ok(search.context.documents[0].content.length <= 140);
});

function fallbackEmbeddingClient(reason: string): EmbeddingClient {
  return {
    async embed() {
      return { status: "fallback", reason };
    },
  };
}

function vectorEmbeddingClient(): EmbeddingClient {
  return {
    async embed(texts) {
      return {
        status: "embedded",
        model: "test-vector-model",
        vectors: texts.map((text) => {
          const normalized = text.toLowerCase();
          if (normalized.includes("magnesium") || normalized.includes("sleep")) return [1, 0, 0];
          if (normalized.includes("immune")) return [0, 1, 0];
          return [0, 0, 1];
        }),
      };
    },
  };
}
