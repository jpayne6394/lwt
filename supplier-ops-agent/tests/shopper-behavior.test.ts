import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { parseBehaviorImportFile } from "../src/agents/behaviorImportAdapter.ts";
import { createIntelligenceService } from "../src/agents/intelligenceService.ts";
import { runShopperBehaviorAgent } from "../src/agents/shopperBehaviorAgent.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import type { ContentIdea } from "../src/agents/intelligenceTypes.ts";
import type { ShopifyVariant } from "../src/domain/types.ts";

const magnesiumVariant: ShopifyVariant = {
  productId: "gid://shopify/Product/100",
  variantId: "gid://shopify/ProductVariant/100",
  inventoryItemId: "gid://shopify/InventoryItem/100",
  locationId: "gid://shopify/Location/1",
  handle: "magnesium-glycinate",
  title: "Magnesium Glycinate",
  vendor: "Pure Encapsulations",
  sku: "MAG-GLY",
  barcode: "",
  price: 34,
  compareAtPrice: null,
  cost: 17,
  status: "active",
  inventoryQuantity: 1,
};

const magnesiumIdea: ContentIdea = {
  id: "idea_magnesium",
  topic: "magnesium",
  sourceSummary: "manual: magnesium",
  suggestedTitle: "How to Think About Different Forms of Magnesium",
  productTieIn: "Magnesium and mineral support products",
  complianceRisk: "Low",
  complianceReason: "No high-risk medical claims detected.",
  saferAngle: "Keep this educational and practitioner-guided.",
  suggestedCta: "Explore practitioner-guided wellness support",
  status: "idea",
  createdAt: "2026-06-28T12:00:00.000Z",
};

test("behavior import adapter parses aggregate search and product engagement reports", () => {
  const searchImport = parseBehaviorImportFile({
    filename: "shopify-search.csv",
    source: "shopify_search_discovery",
    importType: "search_terms",
    content:
      "term,search_count,click_count,purchase_count,no_results_count,no_click_count,date_range\n" +
      "Magnesium Glycinate,120,18,3,42,60,2026-06-01 to 2026-06-28\n",
  });
  const productImport = parseBehaviorImportFile({
    filename: "product-engagement.json",
    source: "manual_import",
    importType: "product_engagement",
    content: JSON.stringify([
      {
        product_title: "Magnesium Glycinate",
        shopify_product_id: "gid://shopify/Product/100",
        views: 240,
        add_to_carts: 8,
        purchases: 1,
        date_range: "2026-06-01 to 2026-06-28",
      },
    ]),
  });

  assert.equal(searchImport.searchTerms.length, 1);
  assert.equal(searchImport.searchTerms[0].normalizedTerm, "magnesium glycinate");
  assert.equal(searchImport.searchTerms[0].searchCount, 120);
  assert.equal(searchImport.searchTerms[0].noResultsCount, 42);
  assert.equal(productImport.productSignals.length, 2);
  assert.equal(productImport.productSignals[0].signalType, "high_views_low_cart");
});

test("shopper behavior agent imports manual reports and creates aggregate recommendations", async () => {
  const importDirectory = await createBehaviorImportDirectory();
  const repository = new MemoryRepository({ shopifyVariants: [magnesiumVariant] });
  await repository.saveContentIdeas([magnesiumIdea]);

  const result = await runShopperBehaviorAgent({
    repository,
    importDirectory,
    sourceConfig: {},
    listShopifyVariants: () => repository.listShopifyVariants(),
  });

  assert.equal(result.sources.ga4.status, "not_configured");
  assert.equal(result.sources.ga4.message, "Not configured - use manual import/fallback.");
  assert.ok(result.summaryCards.topSearches >= 1);
  assert.ok(result.summaryCards.noResultSearches >= 1);
  assert.ok(result.searchSignals.noResultSearches.some((term) => term.normalizedTerm === "magnesium glycinate"));
  assert.ok(result.recommendations.some((item) => item.recommendationType === "missing_collection"));
  assert.ok(result.recommendations.some((item) => item.recommendationType === "high_interest_low_stock"));
  assert.ok(result.contentOpportunities.some((item) => item.explanation.includes("confirmed by shopper behavior")));
  assert.ok(result.todaySummary.topRecommendedAction.includes("Magnesium"));
});

test("intelligence service exposes shopper behavior dashboard and sources", async () => {
  const importDirectory = await createBehaviorImportDirectory();
  const repository = new MemoryRepository({ shopifyVariants: [magnesiumVariant] });
  const service = createIntelligenceService({
    repository,
    sourceConfig: {},
    topics: ["magnesium"],
    behaviorImportDirectory: importDirectory,
    listShopifyVariants: () => repository.listShopifyVariants(),
  });

  const run = await service.run("shopper_behavior");
  assert.equal(run.sources.ga4.status, "not_configured");

  const dashboard = await service.getDashboard();
  assert.equal(dashboard.shopperBehavior.sources.search_console.message, "Not configured - use manual import/fallback.");
  assert.ok(dashboard.shopperBehavior.recommendations.length >= 1);
  assert.ok(dashboard.today.shopperBehavior.topRecommendedAction);
});

async function createBehaviorImportDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "lwt-shopper-behavior-"));
  await writeFile(
    join(directory, "sample-search-terms.csv"),
    [
      "term,search_count,click_count,purchase_count,no_results_count,no_click_count,date_range",
      "Magnesium Glycinate,120,18,3,42,60,2026-06-01 to 2026-06-28",
      "thyroid support,80,4,0,20,36,2026-06-01 to 2026-06-28",
    ].join("\n"),
  );
  await writeFile(
    join(directory, "sample-product-engagement.csv"),
    [
      "product_title,shopify_product_id,views,add_to_carts,purchases,date_range",
      "Magnesium Glycinate,gid://shopify/Product/100,240,8,1,2026-06-01 to 2026-06-28",
    ].join("\n"),
  );
  return directory;
}
