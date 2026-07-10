import assert from "node:assert/strict";
import test from "node:test";

import { createRuntime } from "../src/runtime.ts";

test("local runtime feeds super-agent seed memory into the dev dashboard repository", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalSeedEnabled = process.env.LOCAL_DEV_MEMORY_SEED_ENABLED;
  const originalSeedPath = process.env.SUPER_AGENT_MEMORY_SEEDS_PATH;

  delete process.env.DATABASE_URL;
  process.env.LOCAL_DEV_MEMORY_SEED_ENABLED = "true";
  process.env.SUPER_AGENT_MEMORY_SEEDS_PATH = "config/super-agent-memory-seeds.json";

  try {
    const runtime = await createRuntime();
    const status = await runtime.serverContext.repository.memoryStatus();
    const documents = await runtime.serverContext.repository.recentMemoryDocuments({ limit: 20 });
    const dashboard = await runtime.serverContext.intelligenceService?.getDashboard();

    assert.equal(status.provider, "memory");
    assert.equal(status.documentCount, documents.length);
    assert(documents.length >= 3);
    assert(documents.some((document) => document.title === "LWT Super Agent Source And Memory Policy"));
    assert(documents.some((document) => document.sourceType === "market_signal"));
    assert(dashboard?.sourceSettings.listeningSeeds?.some((seed) => seed.topic === "magnesium"));
  } finally {
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
    restoreEnv("LOCAL_DEV_MEMORY_SEED_ENABLED", originalSeedEnabled);
    restoreEnv("SUPER_AGENT_MEMORY_SEEDS_PATH", originalSeedPath);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
