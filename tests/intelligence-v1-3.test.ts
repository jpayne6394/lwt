import assert from "node:assert/strict";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { renderAdminPage } from "../src/server/admin-ui.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

const searchCsv = [
  "search query,total searches,clicks,purchases,no_results,no_clicks,date range",
  "Magnesium Glycinate,120,18,3,42,60,2026-06-01 to 2026-06-28",
].join("\n");

test("v1.3 import preview maps common columns and reports missing required columns", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
  }) as any;

  const preview = await service.previewShopperBehaviorImport({
    filename: "shopify-search-terms.csv",
    reportType: "shopify_search_terms",
    content: searchCsv,
  });

  assert.equal(preview.valid, true);
  assert.deepEqual(preview.missingColumns, []);
  assert.equal(preview.source, "shopify_search_discovery");
  assert.equal(preview.importType, "search_terms");
  assert.equal(preview.rowCount, 1);
  assert.equal(preview.mappedColumns.term, "search_query");
  assert.equal(preview.mappedColumns.searchCount, "total_searches");
  assert.equal(preview.sampleRows[0].term, "Magnesium Glycinate");
  assert.equal(preview.sampleRows[0].searchCount, 120);
  assert.equal((await repository.recentShopperSearchTerms()).length, 0);

  const badPreview = await service.previewShopperBehaviorImport({
    filename: "broken-search.csv",
    reportType: "shopify_search_terms",
    content: "searches,clicks\n12,3",
  });

  assert.equal(badPreview.valid, false);
  assert.ok(badPreview.missingColumns.includes("term/query"));
  assert.match(badPreview.errors.join(" "), /Missing required column/);
});

test("v1.3 import confirm stores parsed aggregate records and mapping metadata", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
  }) as any;

  const result = await service.confirmShopperBehaviorImport({
    filename: "ga4-site-search.csv",
    reportType: "ga4_site_search",
    content: searchCsv,
  });

  assert.equal(result.importRecord.status, "completed");
  assert.equal(result.importRecord.rowCount, 1);
  assert.equal(result.importRecord.metadataJson.reportType, "ga4_site_search");
  assert.equal(result.searchTerms.length, 1);
  assert.equal(result.searchTerms[0].source, "ga4");

  const savedTerms = await repository.recentShopperSearchTerms();
  assert.equal(savedTerms.length, 1);
  assert.equal(savedTerms[0].normalizedTerm, "magnesium glycinate");

  const mappings = await (repository as any).recentBehaviorImportMappings({ limit: 1 });
  assert.equal(mappings[0].reportType, "ga4_site_search");
  assert.equal(mappings[0].columnMapping.term, "search_query");
});

test("v1.3 action queue creates actions from recommendations, updates status, and records notes", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
  }) as any;
  const [recommendation] = await repository.saveShopperRecommendations([
    {
      recommendationType: "missing_collection",
      title: "Create collection for Magnesium Glycinate.",
      explanation: "120 shoppers searched and many saw no results.",
      relatedTerm: "Magnesium Glycinate",
      priority: "Critical",
      source: "shopify_search_discovery",
      suggestedAction: "Review synonyms and collection coverage.",
    },
  ]);

  const action = await service.createActionFromRecommendation({
    source: "shopper_behavior",
    recommendationId: recommendation.id,
  });

  assert.equal(action.title, "Create collection for Magnesium Glycinate.");
  assert.equal(action.priority, "critical");
  assert.equal(action.status, "open");

  const planned = await service.updateActionItem(action.id, { status: "planned" });
  assert.equal(planned.status, "planned");

  const note = await service.addActionNote(action.id, "Owner will review merchandising this week.");
  assert.equal(note.actionId, action.id);

  const queue = await service.listActionItems({ status: "planned" });
  assert.equal(queue.items.length, 1);
  assert.equal(queue.summary.openActions, 0);
});

test("v1.3 dashboard and UI render import panel, action queue, Today summary, and weekly brief export", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: { ga4CredentialsJson: "secret-ga4-json", searchConsoleCredentialsJson: "secret-search-console-json" },
    topics: ["magnesium"],
  }) as any;

  await service.confirmShopperBehaviorImport({
    filename: "shopify-search-terms.csv",
    reportType: "shopify_search_terms",
    content: searchCsv,
  });
  await service.createActionItem({
    title: "Review no-result searches for magnesium glycinate",
    source: "shopper_behavior",
    priority: "high",
    recommendationType: "missing_collection",
    relatedTopic: "Magnesium Glycinate",
    explanation: "No-result searches need a weekly owner review.",
    suggestedAction: "Review search synonyms and collection coverage.",
  });

  const dashboard = await service.getDashboard();
  assert.equal(dashboard.today.actionQueue.topOpenActions.length, 1);
  assert.match(dashboard.today.reportData.description, /manual report/i);

  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: dashboard,
  });

  assert.match(html, /Shopper Behavior Import/);
  assert.match(html, /Preview report/);
  assert.match(html, /Confirm import/);
  assert.match(html, /Action Queue/);
  assert.match(html, /Open Actions/);
  assert.match(html, /Export Weekly Brief Markdown/);
  assert.match(html, /Add to Action Queue/);
  assert.doesNotMatch(html, /secret-ga4-json/);
  assert.doesNotMatch(html, /secret-search-console-json/);
});

test("v1.3 API supports import preview, confirm, action updates, and weekly Markdown brief", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
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
    const preview = await postJson(`${baseUrl}/api/intelligence/shopper-behavior/import/preview`, {
      filename: "shopify-search-terms.csv",
      reportType: "shopify_search_terms",
      content: searchCsv,
    });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).valid, true);

    const confirm = await postJson(`${baseUrl}/api/intelligence/shopper-behavior/import/confirm`, {
      filename: "shopify-search-terms.csv",
      reportType: "shopify_search_terms",
      content: searchCsv,
    });
    assert.equal(confirm.status, 200);
    const confirmJson = await confirm.json();
    assert.equal(confirmJson.importRecord.rowCount, 1);

    const created = await postJson(`${baseUrl}/api/intelligence/actions`, {
      title: "Review no-result searches for magnesium glycinate",
      source: "shopper_behavior",
      priority: "high",
      recommendationType: "missing_collection",
      relatedTopic: "Magnesium Glycinate",
      explanation: "No-result searches need owner review.",
      suggestedAction: "Review synonyms and collection coverage.",
    });
    assert.equal(created.status, 201);
    const actionJson = await created.json();
    assert.equal(actionJson.action.status, "open");

    const updated = await fetch(`${baseUrl}/api/intelligence/actions/${encodeURIComponent(actionJson.action.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).action.status, "in_progress");

    const note = await postJson(`${baseUrl}/api/intelligence/actions/${encodeURIComponent(actionJson.action.id)}/notes`, {
      body: "Owner started reviewing the import.",
    });
    assert.equal(note.status, 201);

    const brief = await postJson(`${baseUrl}/api/intelligence/weekly-brief/generate`, {});
    assert.equal(brief.status, 200);
    const briefJson = await brief.json();
    assert.match(briefJson.markdown, /# LWT Weekly Operator Brief/);
    assert.match(briefJson.markdown, /Action Queue Summary/);
    assert.match(briefJson.markdown, /in_progress/i);

    const latestBrief = await fetch(`${baseUrl}/api/intelligence/weekly-brief`);
    assert.equal(latestBrief.status, 200);
    assert.match((await latestBrief.json()).markdown, /Top Shopper Behavior Signals/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

async function postJson(url: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
