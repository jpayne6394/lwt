import assert from "node:assert/strict";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { loadConfig } from "../src/server/config.ts";
import { renderAdminPage } from "../src/server/admin-ui.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

const searchCsv = [
  "search query,total searches,clicks,purchases,no_results,no_clicks,date range",
  "Magnesium Glycinate,120,18,3,42,60,2026-06-01 to 2026-06-28",
].join("\n");

test("v1.4 keeps App Bridge off the internal Intelligence route while preserving it elsewhere", () => {
  const intelligenceHtml = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    intelligenceAuthWarning: "Internal dashboard auth is not configured. Set INTERNAL_DASHBOARD_PASSWORD before production.",
  });
  const dashboardHtml = renderAdminPage({
    activePath: "/",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
  });

  assert.doesNotMatch(intelligenceHtml, /shopifycloud\/app-bridge/);
  assert.doesNotMatch(intelligenceHtml, /<meta name="shopify-api-key" content="test-api-key">/);
  assert.match(intelligenceHtml, /Internal dashboard auth is not configured/);
  assert.match(dashboardHtml, /shopifycloud\/app-bridge/);
  assert.match(dashboardHtml, /<meta name="shopify-api-key" content="test-api-key">/);
});

test("v1.4 config requires internal dashboard auth on Render unless explicitly disabled", () => {
  const renderConfig = loadConfig({ RENDER: "true", PORT: "8080" } as NodeJS.ProcessEnv);
  const disabledConfig = loadConfig({ RENDER: "true", INTERNAL_DASHBOARD_AUTH_REQUIRED: "false", PORT: "8080" } as NodeJS.ProcessEnv);

  assert.equal(renderConfig.internalDashboardAuthRequired, true);
  assert.equal(disabledConfig.internalDashboardAuthRequired, false);
});

test("v1.4 protects intelligence routes and blocks production exposure when password is missing", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({ repository, sourceConfig: {}, topics: ["magnesium"] });
  const protectedServer = startServer(
    {
      repository,
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      intelligenceService: service,
      internalDashboardPassword: "secret-password",
      internalDashboardAuthRequired: true,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await new Promise<void>((resolve) => protectedServer.once("listening", resolve));
  const protectedAddress = protectedServer.address();
  assert(protectedAddress && typeof protectedAddress === "object");
  const protectedBase = `http://127.0.0.1:${protectedAddress.port}`;

  try {
    const missing = await fetch(`${protectedBase}/intelligence`);
    assert.equal(missing.status, 401);
    assert.match(await missing.text(), /Authentication required/);

    const invalid = await fetch(`${protectedBase}/api/intelligence/actions`, {
      headers: { Authorization: basicAuth("operator", "wrong-password") },
    });
    assert.equal(invalid.status, 401);

    const valid = await fetch(`${protectedBase}/intelligence`, {
      headers: { Authorization: basicAuth("operator", "secret-password") },
    });
    assert.equal(valid.status, 200);
    const html = await valid.text();
    assert.doesNotMatch(html, /secret-password/);
  } finally {
    await closeServer(protectedServer);
  }

  const setupServer = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      intelligenceService: createIntelligenceService({ repository: new MemoryRepository(), sourceConfig: {}, topics: ["magnesium"] }),
      internalDashboardAuthRequired: true,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await new Promise<void>((resolve) => setupServer.once("listening", resolve));
  const setupAddress = setupServer.address();
  assert(setupAddress && typeof setupAddress === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${setupAddress.port}/intelligence`);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /INTERNAL_DASHBOARD_PASSWORD is required/);
  } finally {
    await closeServer(setupServer);
  }
});

test("v1.4 import panel exposes a paste fallback and malformed CSV returns a plain validation error", async () => {
  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: await createIntelligenceService({ repository: new MemoryRepository(), sourceConfig: {}, topics: ["magnesium"] }).getDashboard(),
  });

  assert.match(html, /data-import-raw-content/);
  assert.match(html, /Paste CSV\/JSON content/);

  const repository = new MemoryRepository();
  const service = createIntelligenceService({ repository, sourceConfig: {}, topics: ["magnesium"] });
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

  try {
    const preview = await postJson(`http://127.0.0.1:${address.port}/api/intelligence/shopper-behavior/import/preview`, {
      filename: "broken.csv",
      reportType: "shopify_search_terms",
      content: "searches,clicks\n12,3",
    });
    assert.equal(preview.status, 200);
    const json = await preview.json();
    assert.equal(json.valid, false);
    assert.match(json.errors.join(" "), /Missing required column: term\/query/);
    assert.match(json.operatorMessage, /not imported/i);
  } finally {
    await closeServer(server);
  }
});

test("v1.4 export endpoints return action queue, weekly briefs, and shopper recommendations backups", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({ repository, sourceConfig: {}, topics: ["magnesium"] }) as any;
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
    explanation: "No-result searches need owner review.",
    suggestedAction: "Review synonyms and collection coverage.",
  });
  await service.generateWeeklyBrief();

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
    const actionsCsv = await fetch(`${baseUrl}/api/intelligence/exports/actions?format=csv`);
    assert.equal(actionsCsv.status, 200);
    assert.match(actionsCsv.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(await actionsCsv.text(), /Review no-result searches/);

    const briefsMarkdown = await fetch(`${baseUrl}/api/intelligence/exports/weekly-briefs?format=markdown`);
    assert.equal(briefsMarkdown.status, 200);
    assert.match(briefsMarkdown.headers.get("content-type") ?? "", /text\/markdown/);
    assert.match(await briefsMarkdown.text(), /# LWT Weekly Operator Brief/);

    const recommendationsJson = await fetch(`${baseUrl}/api/intelligence/exports/shopper-recommendations?format=json`);
    assert.equal(recommendationsJson.status, 200);
    const recommendationBackup = await recommendationsJson.json();
    assert.ok(recommendationBackup.items.length >= 1);
    assert.doesNotMatch(JSON.stringify(recommendationBackup), /secret|password|token/i);
  } finally {
    await closeServer(server);
  }
});

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function postJson(url: string, body: Record<string, unknown>) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function closeServer(server: ReturnType<typeof startServer>) {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
