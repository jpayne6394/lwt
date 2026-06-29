import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { renderAdminPage } from "../src/server/admin-ui.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

test("intelligence UI renders Shopper Behavior tab and run control", async () => {
  const importDirectory = await createBehaviorImportDirectory();
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    behaviorImportDirectory: importDirectory,
  });

  await service.run("shopper_behavior");
  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: await service.getDashboard(),
  });

  assert.match(html, /Shopper Behavior/);
  assert.match(html, /Run Shopper Behavior Analysis/);
  assert.match(html, /What shoppers are looking for/);
  assert.match(html, /Where shoppers get stuck/);
  assert.match(html, /What we should change/);
  assert.match(html, /What this means for content/);
  assert.match(html, /Imported Reports \/ Source Status/);
});

test("shopper behavior API runs imports and returns recommendations without analytics credentials", async () => {
  const importDirectory = await createBehaviorImportDirectory();
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    behaviorImportDirectory: importDirectory,
  });
  const server = startServer(
    {
      repository,
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      intelligenceService: service,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const sources = await fetch(`${baseUrl}/api/intelligence/shopper-behavior/sources`);
    assert.equal(sources.status, 200);
    const sourceJson = await sources.json();
    assert.equal(sourceJson.ga4.message, "Not configured - use manual import/fallback.");

    const run = await fetch(`${baseUrl}/api/intelligence/run/shopper-behavior`, { method: "POST" });
    assert.equal(run.status, 200);
    const runJson = await run.json();
    assert.equal(runJson.ok, true);
    assert.ok(runJson.result.recommendations.length >= 1);

    const response = await fetch(`${baseUrl}/api/intelligence/shopper-behavior`);
    assert.equal(response.status, 200);
    const behaviorJson = await response.json();
    assert.ok(behaviorJson.recommendations.some((item: { title: string }) => item.title.includes("Magnesium")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function createBehaviorImportDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lwt-shopper-behavior-server-"));
  await writeFile(
    join(directory, "sample-search-terms.csv"),
    [
      "term,search_count,click_count,purchase_count,no_results_count,no_click_count,date_range",
      "Magnesium Glycinate,90,6,0,30,44,2026-06-01 to 2026-06-28",
    ].join("\n"),
  );
  return directory;
}
