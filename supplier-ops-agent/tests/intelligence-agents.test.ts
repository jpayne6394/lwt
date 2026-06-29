import assert from "node:assert/strict";
import test from "node:test";

import { assessContentCompliance } from "../src/agents/complianceGuardAgent.ts";
import { runContentRadarAgent } from "../src/agents/contentRadarAgent.ts";
import { runInventoryAgent } from "../src/agents/inventoryAgent.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import type { ShopifyVariant } from "../src/domain/types.ts";

test("content radar uses manual topics and reports missing social connectors without failing", async () => {
  const repository = new MemoryRepository();

  const result = await runContentRadarAgent({
    repository,
    topics: ["magnesium", "sleep support"],
    sourceConfig: {
      xBearerToken: undefined,
      redditClientId: undefined,
      redditClientSecret: undefined,
      redditUserAgent: undefined,
      searchProviderKey: undefined,
    },
  });

  assert.equal(result.connectorStatuses.x.status, "not_configured");
  assert.equal(result.connectorStatuses.reddit.status, "not_configured");
  assert.equal(result.connectorStatuses.search.status, "not_configured");
  assert.equal(result.ideas.length, 2);
  assert.equal(result.ideas[0].topic, "magnesium");
  assert.equal(result.ideas[0].complianceRisk, "Low");
  assert.match(result.ideas[0].suggestedTitle, /magnesium/i);
  assert.match(result.ideas[0].suggestedCta, /wellness/i);
});

test("compliance guard flags risky supplement claim language and offers safer copy", () => {
  const assessment = assessContentCompliance("This supplement can cure disease and prevent guaranteed symptoms.");

  assert.equal(assessment.risk, "High");
  assert.match(assessment.reason, /cure/i);
  assert.match(assessment.saferAngle, /support/i);
  assert.match(assessment.suggestedCta, /wellness plan/i);
});

test("inventory agent turns Shopify quantities into prioritized inventory signals", async () => {
  const variants: ShopifyVariant[] = [
    {
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
      category: "Minerals",
    },
    {
      productId: "gid://shopify/Product/2",
      variantId: "gid://shopify/ProductVariant/2",
      inventoryItemId: "gid://shopify/InventoryItem/2",
      locationId: "gid://shopify/Location/1",
      handle: "vitamin-d",
      title: "Vitamin D3",
      vendor: "Seeking Health",
      sku: "D3",
      barcode: "",
      price: 24,
      compareAtPrice: null,
      cost: 11,
      status: "active",
      inventoryQuantity: 3,
      category: "Immune Support",
    },
  ];

  const result = await runInventoryAgent({
    repository: new MemoryRepository({ shopifyVariants: variants }),
    lowStockThreshold: 5,
  });

  assert.equal(result.alerts.outOfStock.length, 1);
  assert.equal(result.alerts.lowStock.length, 1);
  assert.deepEqual(result.vendorSummary.map((vendor) => vendor.vendor), ["Pure Encapsulations", "Seeking Health"]);
  assert.equal(result.signals[0].priority, "Critical");
  assert.match(result.actionItems[0], /Magnesium Glycinate/);
});
