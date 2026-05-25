import assert from "node:assert/strict";
import test from "node:test";

import { buildCampaignDraft } from "../src/campaigns/campaign-draft-planner.ts";
import { buildBlogDraft, WELLNESS_BLOG_PROFILES } from "../src/content/blog-template-builder.ts";
import { extractCompetitorPrice } from "../src/market-radar/competitor-price-monitor.ts";
import { buildSourceConnectionCards } from "../src/market-radar/source-connection-registry.ts";
import { buildMarketRadarOutput } from "../src/market-radar/market-radar-service.ts";
import type { ProductOpsOutputRecord } from "../src/product-ops/types.ts";
import type { ShopifyVariant } from "../src/domain/types.ts";

const magnesiumVariant: ShopifyVariant = {
  productId: "gid://shopify/Product/1",
  variantId: "gid://shopify/ProductVariant/1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  locationId: "gid://shopify/Location/1",
  handle: "magnesium-glycinate",
  title: "Magnesium Glycinate",
  vendor: "Living Well Today",
  sku: "MAG-GLY",
  barcode: "",
  price: 34,
  compareAtPrice: null,
  cost: 16,
  status: "active",
  productType: "Supplement",
  productForm: "Capsule",
  tags: ["sleep", "stress", "magnesium"],
  imageUrls: ["https://example.com/magnesium.jpg"],
  descriptionHtml: "<p>Magnesium support.</p>",
  inventoryQuantity: 14,
  publishedAt: "2026-05-25T10:00:00.000Z",
};

const productOps: ProductOpsOutputRecord = {
  id: "product_ops_1",
  runId: "run_1",
  createdAt: "2026-05-25T10:00:00.000Z",
  agent: "product_ops",
  runType: "full_product_ops_check",
  mode: "dry_run",
  startedAt: "2026-05-25T10:00:00.000Z",
  finishedAt: "2026-05-25T10:02:00.000Z",
  summary: {
    productsChecked: 1,
    variantsChecked: 1,
    suppliersChecked: 1,
    promoteReady: 1,
    lowStock: 0,
    outOfStock: 0,
    needsDataCleanup: 0,
    badPage: 0,
    doNotPromote: 0,
    reviewRequired: 0,
    errors: 0,
  },
  productsToPromote: [
    {
      title: "Magnesium Glycinate",
      supplierName: "Emerson Ecologics",
      vendor: "Living Well Today",
      sku: "MAG-GLY",
      promotionStatus: "PROMOTE_READY",
      stockStatus: "in_stock",
      matchConfidence: 1,
      reasons: ["Complete active page with stock."],
    },
  ],
  productsToAvoid: [],
  promotionTasks: [],
  cleanupTasks: [],
  reviewTasks: [],
  errors: [],
  plannedChanges: [],
  blockedIssues: [],
};

test("market radar turns market signals and Shopify context into revenue plays", () => {
  const output = buildMarketRadarOutput({
    shopifyVariants: [magnesiumVariant],
    productOpsOutput: productOps,
    sourceConnections: buildSourceConnectionCards({ reddit: true }),
    marketSignals: [
      {
        sourceId: "open-web",
        sourceLabel: "Open Web",
        topic: "magnesium sleep",
        title: "Magnesium and sleep support questions are rising",
        url: "https://example.com/wellness/magnesium-sleep",
        capturedAt: "2026-05-25T12:00:00.000Z",
        keywords: ["magnesium", "sleep", "stress"],
      },
      {
        sourceId: "reddit",
        sourceLabel: "Reddit",
        topic: "magnesium sleep",
        title: "People ask whether magnesium glycinate helps sleep",
        url: "https://reddit.com/r/Supplements/example",
        capturedAt: "2026-05-25T12:05:00.000Z",
        keywords: ["magnesium", "sleep"],
      },
    ],
    competitorPrices: [
      {
        productHandle: "magnesium-glycinate",
        productTitle: "Magnesium Glycinate",
        competitor: "Competitor A",
        url: "https://competitor.example/magnesium",
        price: 39,
        capturedAt: "2026-05-25T12:10:00.000Z",
      },
    ],
    now: "2026-05-25T12:15:00.000Z",
  });

  assert.equal(output.agent, "bi");
  assert.equal(output.summary.signalsReviewed, 2);
  assert.equal(output.summary.revenuePlays, 4);
  assert.ok(output.salesWindows.some((window) => window.window === "7d"));
  assert.ok(output.explanations.some((explanation) => /magnesium sleep/i.test(explanation.title)));
  assert.ok(output.revenuePlays.some((play) => play.actionType === "BLOG_DRAFT" && play.targetAgent === "blog"));
  assert.ok(output.revenuePlays.some((play) => play.actionType === "CAMPAIGN_DRAFT" && play.targetAgent === "campaign"));
  assert.ok(output.revenuePlays.some((play) => play.actionType === "PRICING_CHECK" && play.targetAgent === "inventory"));
  assert.ok(output.revenuePlays.some((play) => play.actionType === "FLOW_SETUP" && play.targetAgent === "flow"));
  assert.match(output.revenuePlays[0].explanation, /revenue/i);
  assert.equal(output.revenuePlays[0].status, "SUGGESTED");
});

test("source connection cards mark safe, optional, paid, and manual-only sources", () => {
  const cards = buildSourceConnectionCards({ reddit: true, x: false, pinterest: false, truthSocial: false });

  assert.equal(cards.find((card) => card.id === "open-web")?.status, "connected");
  assert.equal(cards.find((card) => card.id === "reddit")?.status, "connected");
  assert.equal(cards.find((card) => card.id === "x")?.status, "paid_optional");
  assert.equal(cards.find((card) => card.id === "truth-social")?.status, "manual_only");
});

test("competitor price monitor extracts a likely price from page text", () => {
  assert.equal(extractCompetitorPrice("Sale price $39.95 Regular price $49.95"), 39.95);
  assert.equal(extractCompetitorPrice("No price listed"), null);
});

test("blog template builder creates Shopify-ready wellness profile drafts with light claim warnings", () => {
  const draft = buildBlogDraft({
    profileId: "educational-guide",
    title: "Magnesium for Better Sleep",
    roughThoughts: "Explain why people use magnesium at night. Do not overpromise.",
    relatedProducts: [magnesiumVariant],
    authorName: "Living Well Today",
    now: "2026-05-25T12:00:00.000Z",
  });

  assert.equal(WELLNESS_BLOG_PROFILES.length, 5);
  assert.equal(draft.status, "DRAFT_READY");
  assert.match(draft.bodyHtml, /Magnesium for Better Sleep/);
  assert.match(draft.bodyHtml, /Magnesium Glycinate/);
  assert.match(draft.summary, /educational guide/i);
  assert.deepEqual(draft.claimWarnings, []);
});

test("campaign draft planner creates a Shopify Email handoff from a revenue play", () => {
  const radar = buildMarketRadarOutput({
    shopifyVariants: [magnesiumVariant],
    productOpsOutput: productOps,
    sourceConnections: buildSourceConnectionCards({}),
    marketSignals: [
      {
        sourceId: "open-web",
        sourceLabel: "Open Web",
        topic: "magnesium sleep",
        title: "Magnesium sleep chatter",
        url: "https://example.com/sleep",
        capturedAt: "2026-05-25T12:00:00.000Z",
        keywords: ["magnesium", "sleep"],
      },
    ],
    now: "2026-05-25T12:00:00.000Z",
  });

  const draft = buildCampaignDraft({
    revenuePlay: radar.revenuePlays.find((play) => play.actionType === "CAMPAIGN_DRAFT")!,
    products: [magnesiumVariant],
    now: "2026-05-25T12:00:00.000Z",
  });

  assert.equal(draft.status, "DRAFT_READY");
  assert.match(draft.subjectLines.join(" "), /Magnesium/i);
  assert.match(draft.bodyText, /Magnesium Glycinate/);
  assert.match(draft.shopifyEmailAdminPath, /marketing/);
});
