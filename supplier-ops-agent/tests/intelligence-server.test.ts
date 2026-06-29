import assert from "node:assert/strict";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { renderAdminPage } from "../src/server/admin-ui.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import type { ShopifyVariant } from "../src/domain/types.ts";

test("admin UI renders the intelligence center nav and manual run controls", () => {
  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    memoryStatus: {
      provider: "memory",
      connected: true,
      vectorEnabled: false,
      retrievalMode: "none",
      documentCount: 0,
      chunkCount: 0,
      message: "Agent memory is available.",
    },
    intelligence: {
      summaryCards: {
        inventoryRisks: 0,
        salesSignal: "Setup needed",
        productOpportunities: 0,
        contentIdeas: 0,
      },
      today: {
        brief: "No intelligence runs yet.",
        actionItems: [],
        inventoryAlerts: [],
        recommendations: [],
        lastSuccessfulScanTime: null,
        shopperBehavior: {
          topShopperSignal: "No shopper search imports yet.",
          topFrictionPoint: "No product friction import yet.",
          topRecommendedAction: "Import shopper behavior reports to create recommendations.",
          openRecommendationCount: 0,
        },
        actionQueue: {
          topOpenActions: [],
          summaryText: "0 open actions, 0 critical, 0 high priority.",
        },
        reportData: {
          lastImportAt: null,
          mode: "no_report_data",
          description: "No manual report data has been imported yet; missing analytics connectors remain in graceful fallback mode.",
        },
      },
      inventory: { lowStock: [], outOfStock: [], highVelocityLowStock: [], staleStock: [], vendorSummary: [] },
      productStrategy: {
        topMovingProducts: [],
        stockButLowMovement: [],
        movementButLowStock: [],
        brandsOrCategoriesToFeature: [],
        suggestedPushes: [],
        explanations: [],
      },
      contentRadar: { sourceItems: [], ideas: [] },
      shopperBehavior: {
        generatedAt: new Date().toISOString(),
        sources: {
          shopify: { label: "Shopify products/orders", status: "not_configured", missingEnvVars: [] },
          shopify_search_discovery_import: { label: "Shopify Search & Discovery import", status: "connected", missingEnvVars: [] },
          shopify_analytics_import: { label: "Shopify analytics import", status: "connected", missingEnvVars: [] },
          ga4: { label: "GA4 connector", status: "not_configured", missingEnvVars: ["GA4_PROPERTY_ID"] },
          search_console: { label: "Search Console connector", status: "not_configured", missingEnvVars: ["SEARCH_CONSOLE_SITE_URL"] },
          manual_import: { label: "Manual import folder", status: "connected", missingEnvVars: [] },
        },
        summaryCards: { topSearches: 0, noResultSearches: 0, productPageFriction: 0, newOpportunities: 0 },
        searchSignals: {
          topSearches: [],
          risingSearches: [],
          noResultSearches: [],
          noClickSearches: [],
          missingProductSearches: [],
          missingCollectionSearches: [],
          blogTopicSearches: [],
        },
        frictionSignals: [],
        recommendations: [],
        contentOpportunities: [],
        imports: [],
        todaySummary: {
          topShopperSignal: "No shopper search imports yet.",
          topFrictionPoint: "No product friction import yet.",
          topRecommendedAction: "Import shopper behavior reports to create recommendations.",
          openRecommendationCount: 0,
        },
        errors: [],
      },
      actionQueue: {
        summary: {
          openActions: 0,
          criticalActions: 0,
          highPriorityActions: 0,
          doneThisWeek: 0,
          rejectedActions: 0,
        },
        items: [],
      },
      sources: {
        shopify: { status: "not_configured", label: "Shopify", missingEnvVars: ["SHOPIFY_STORE_DOMAIN"] },
        x: { status: "not_configured", label: "X", missingEnvVars: ["X_BEARER_TOKEN"] },
        reddit: { status: "not_configured", label: "Reddit", missingEnvVars: ["REDDIT_CLIENT_ID"] },
        search: { status: "not_configured", label: "Search/Trends", missingEnvVars: ["SEARCH_PROVIDER_KEY"] },
      },
      errors: [],
    },
  });

  assert.match(html, /Intelligence/);
  assert.match(html, /LWT Daily Brief/);
  assert.match(html, /Run Inventory Scan/);
  assert.match(html, /Run Content Radar/);
  assert.match(html, /Connector not configured/);
});

test("intelligence API returns source status and can run content radar without social credentials", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    listShopifyVariants: () => repository.listShopifyVariants(),
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
    const sources = await fetch(`${baseUrl}/api/intelligence/sources`);
    assert.equal(sources.status, 200);
    const sourceJson = await sources.json();
    assert.equal(sourceJson.x.status, "not_configured");

    const run = await fetch(`${baseUrl}/api/intelligence/run/content-radar`, { method: "POST" });
    assert.equal(run.status, 200);
    const runJson = await run.json();
    assert.equal(runJson.ok, true);
    assert.equal(runJson.result.ideas.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("intelligence dashboard keeps inventory vendor summary for rendering", async () => {
  const variant: ShopifyVariant = {
    productId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    inventoryItemId: "gid://shopify/InventoryItem/1",
    locationId: "gid://shopify/Location/1",
    handle: "magnesium",
    title: "Magnesium Glycinate",
    vendor: "Pure Encapsulations",
    sku: "MAG-1",
    barcode: "",
    price: 30,
    compareAtPrice: null,
    cost: 15,
    status: "active",
    inventoryQuantity: 0,
  };
  const repository = new MemoryRepository({ shopifyVariants: [variant] });
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    listShopifyVariants: () => repository.listShopifyVariants(),
  });

  await service.run("inventory");
  const dashboard = await service.getDashboard();
  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: dashboard,
  });

  assert.equal(dashboard.inventory.vendorSummary.length, 1);
  assert.match(html, /Pure Encapsulations/);
});

test("intelligence UI renders v1.1 source setup and blog brief workflow controls", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    radarSettings: {
      topicClusters: ["magnesium"],
      keywords: ["glycinate"],
      excludedTerms: ["cure"],
      subreddits: ["Supplements"],
      xQueries: ["magnesium sleep"],
      searchQueries: ["magnesium forms"],
      scanFrequencyNotes: "Weekly while using manual fallback.",
    },
  });

  await service.run("content_radar");
  const dashboard = await service.getDashboard();
  const html = renderAdminPage({
    activePath: "/intelligence",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    intelligence: dashboard,
  });

  assert.match(html, /Not configured - using manual fallback only/);
  assert.match(html, /Approve idea/);
  assert.match(html, /Reject idea/);
  assert.match(html, /Generate brief/);
  assert.match(html, /Topic clusters/);
  assert.match(html, /Supplements/);
});

test("intelligence API approves ideas and returns blog brief markdown", async () => {
  const repository = new MemoryRepository();
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
  });
  await service.run("content_radar");
  const idea = (await repository.recentContentIdeas({ limit: 1 }))[0];
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
    const approve = await fetch(`${baseUrl}/api/intelligence/content-ideas/${idea.id}/approve`, { method: "POST" });
    assert.equal(approve.status, 200);
    const approvedJson = await approve.json();
    assert.equal(approvedJson.idea.status, "approved");

    const brief = await fetch(`${baseUrl}/api/intelligence/content-ideas/${idea.id}/blog-brief`, { method: "POST" });
    assert.equal(brief.status, 200);
    const briefJson = await brief.json();
    assert.match(briefJson.markdown, /# How to Think About Different Forms of Magnesium/);
    assert.match(briefJson.markdown, /## Suggested Outline/);
    assert.doesNotMatch(briefJson.markdown, /\bcure\b/i);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
