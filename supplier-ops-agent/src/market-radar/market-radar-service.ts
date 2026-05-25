import type { ShopifyVariant } from "../domain/types.ts";
import type { ProductOpsOutputRecord } from "../product-ops/types.ts";
import {
  toMatchedProduct,
  type CompetitorPriceSnapshot,
  type ConfidenceLevel,
  type EvidenceLink,
  type MarketExplanation,
  type MarketRadarRunOutput,
  type MarketSignal,
  type RevenuePlayActionType,
  type RevenuePlayRecord,
  type RevenuePlayTargetAgent,
  type SalesWindowSummary,
  type ShopifyOrderSignal,
  type SourceConnectionCard,
} from "./types.ts";

export type BuildMarketRadarInput = {
  shopifyVariants: ShopifyVariant[];
  productOpsOutput?: ProductOpsOutputRecord;
  sourceConnections: SourceConnectionCard[];
  marketSignals?: MarketSignal[];
  competitorPrices?: CompetitorPriceSnapshot[];
  orders?: ShopifyOrderSignal[];
  now?: string;
};

const SALES_WINDOWS: Array<{ window: SalesWindowSummary["window"]; label: string; days: number }> = [
  { window: "today", label: "Today", days: 1 },
  { window: "7d", label: "7 days", days: 7 },
  { window: "30d", label: "30 days", days: 30 },
  { window: "90d", label: "90 days", days: 90 },
  { window: "365d", label: "365 days", days: 365 },
];

const RISKY_CLAIM_WORDS = /\b(cure|treat|diagnose|prevent|disease|cancer|covid|diabetes|depression|anxiety)\b/i;

export function buildMarketRadarOutput(input: BuildMarketRadarInput): MarketRadarRunOutput {
  const now = input.now ?? new Date().toISOString();
  const signals = input.marketSignals?.length ? input.marketSignals : buildSeedSignals(input.shopifyVariants, now);
  const explanations = buildExplanations(signals, input.shopifyVariants);
  const revenuePlays = buildRevenuePlays({
    explanations,
    competitorPrices: input.competitorPrices ?? [],
    productOpsOutput: input.productOpsOutput,
    now,
  });

  return {
    agent: "bi",
    mode: "dry_run",
    startedAt: now,
    finishedAt: now,
    summary: {
      signalsReviewed: signals.length,
      competitorPricesReviewed: input.competitorPrices?.length ?? 0,
      revenuePlays: revenuePlays.length,
      highConfidencePlays: revenuePlays.filter((play) => play.confidence === "high").length,
      lightClaimWarnings: revenuePlays.reduce((count, play) => count + play.claimWarnings.length, 0),
    },
    salesWindows: buildSalesWindows(input.orders ?? [], now),
    explanations,
    sourceConnections: input.sourceConnections,
    revenuePlays,
    errors: [],
  };
}

function buildSeedSignals(variants: ShopifyVariant[], now: string): MarketSignal[] {
  return variants
    .filter((variant) => variant.status === "active")
    .slice(0, 12)
    .map((variant) => {
      const keywords = uniqueWords([...variant.tags, variant.productType, variant.productForm, variant.title]);
      return {
        sourceId: "shopify-catalog",
        sourceLabel: "Shopify Catalog",
        topic: keywords.slice(0, 2).join(" ") || variant.title,
        title: `${variant.title} has Shopify context ready for revenue planning`,
        url: `/products/${variant.handle}`,
        capturedAt: now,
        keywords,
      };
    });
}

function buildSalesWindows(orders: ShopifyOrderSignal[], now: string): SalesWindowSummary[] {
  const currentTime = new Date(now).getTime();
  return SALES_WINDOWS.map((window) => {
    const cutoff = currentTime - window.days * 24 * 60 * 60 * 1000;
    const scoped = orders.filter((order) => new Date(order.createdAt).getTime() >= cutoff);
    return {
      window: window.window,
      label: window.label,
      orderCount: scoped.length,
      revenue: roundMoney(scoped.reduce((sum, order) => sum + order.totalPrice, 0)),
      unitsSold: scoped.reduce(
        (sum, order) => sum + order.lineItems.reduce((lineSum, item) => lineSum + item.quantity, 0),
        0,
      ),
    };
  });
}

function buildExplanations(signals: MarketSignal[], variants: ShopifyVariant[]): MarketExplanation[] {
  const groups = new Map<string, MarketSignal[]>();
  for (const signal of signals) {
    const key = normalizeTopic(signal.topic);
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }

  return [...groups.entries()].map(([topic, topicSignals]) => {
    const matchedProducts = matchProducts(topicSignals, variants);
    const evidence = topicSignals.map(signalToEvidence);
    const confidence: ConfidenceLevel = evidence.length >= 2 && matchedProducts.length > 0 ? "high" : matchedProducts.length ? "medium" : "low";
    return {
      topic,
      title: `${titleCase(topic)} revenue signal`,
      explanation:
        matchedProducts.length > 0
          ? `${topicSignals.length} market signal${topicSignals.length === 1 ? "" : "s"} connect to ${matchedProducts.length} Shopify product${matchedProducts.length === 1 ? "" : "s"}. Use stocked products, supplier status, and pricing context to create revenue-focused next steps.`
          : `${topicSignals.length} market signal${topicSignals.length === 1 ? "" : "s"} are worth watching, but no strong Shopify product match was found yet.`,
      evidence,
      matchedProducts,
      confidence,
    };
  });
}

function buildRevenuePlays(input: {
  explanations: MarketExplanation[];
  competitorPrices: CompetitorPriceSnapshot[];
  productOpsOutput?: ProductOpsOutputRecord;
  now: string;
}): RevenuePlayRecord[] {
  const plays: RevenuePlayRecord[] = [];

  for (const explanation of input.explanations) {
    if (!explanation.matchedProducts.length) {
      continue;
    }

    plays.push(
      revenuePlay({
        explanation,
        now: input.now,
        actionType: "BLOG_DRAFT",
        targetAgent: "blog",
        title: `Draft a ${explanation.topic} article`,
        effort: "medium",
        pricingContext: pricingContextFor(explanation, input.competitorPrices),
      }),
      revenuePlay({
        explanation,
        now: input.now,
        actionType: "CAMPAIGN_DRAFT",
        targetAgent: "campaign",
        title: `Plan a ${explanation.topic} email campaign`,
        effort: "medium",
        pricingContext: pricingContextFor(explanation, input.competitorPrices),
      }),
    );

    const competitorMatch = findCompetitorMatch(explanation, input.competitorPrices);
    if (competitorMatch) {
      plays.push(
        revenuePlay({
          explanation,
          now: input.now,
          actionType: "PRICING_CHECK",
          targetAgent: "inventory",
          title: `Review ${competitorMatch.productTitle} competitor price`,
          effort: "low",
          pricingContext: `${competitorMatch.competitor} is showing ${formatMoney(competitorMatch.price)} for ${competitorMatch.productTitle}.`,
        }),
      );
    } else if (hasLowStockProduct(explanation)) {
      plays.push(
        revenuePlay({
          explanation,
          now: input.now,
          actionType: "RESTOCK_OPPORTUNITY",
          targetAgent: "inventory",
          title: `Restock products tied to ${explanation.topic}`,
          effort: "low",
          pricingContext: "No competitor price signal yet.",
        }),
      );
    } else if ((input.productOpsOutput?.summary.promoteReady ?? 0) > 1) {
      plays.push(
        revenuePlay({
          explanation,
          now: input.now,
          actionType: "BUNDLE_IDEA",
          targetAgent: "product_ops",
          title: `Consider a ${explanation.topic} product bundle`,
          effort: "high",
          pricingContext: "Bundle pricing needs margin review before launch.",
        }),
      );
    }

    plays.push(
      revenuePlay({
        explanation,
        now: input.now,
        actionType: "FLOW_SETUP",
        targetAgent: "flow",
        title: `Create a Flow checklist for ${explanation.topic}`,
        effort: "low",
        pricingContext: "No automatic Flow edits; open Shopify Flow from the launchpad.",
      }),
    );
  }

  return plays;
}

function revenuePlay(input: {
  explanation: MarketExplanation;
  now: string;
  actionType: RevenuePlayActionType;
  targetAgent: RevenuePlayTargetAgent;
  title: string;
  effort: "low" | "medium" | "high";
  pricingContext: string;
}): RevenuePlayRecord {
  const warnings = claimWarnings([input.title, input.explanation.explanation, input.explanation.topic].join(" "));
  return {
    id: `play_${slugify(input.actionType)}_${slugify(input.explanation.topic)}_${hashText(input.title)}`,
    title: input.title,
    explanation: `${input.explanation.explanation} Recommended revenue move: ${actionDescription(input.actionType)}.`,
    actionType: input.actionType,
    targetAgent: input.targetAgent,
    source: "Market Radar",
    evidence: input.explanation.evidence,
    matchedProducts: input.explanation.matchedProducts,
    inventoryContext: inventoryContextFor(input.explanation),
    pricingContext: input.pricingContext,
    confidence: input.explanation.confidence,
    effort: input.effort,
    status: "SUGGESTED",
    claimWarnings: warnings,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function matchProducts(signals: MarketSignal[], variants: ShopifyVariant[]) {
  const keywords = new Set(signals.flatMap((signal) => signal.keywords.map(normalizeKeyword)).filter(Boolean));
  const topicWords = new Set(signals.flatMap((signal) => normalizeTopic(signal.topic).split(" ")));
  for (const word of topicWords) {
    keywords.add(word);
  }

  return variants
    .filter((variant) => {
      const haystack = uniqueWords([variant.title, variant.vendor, variant.productType, variant.productForm, ...(variant.tags ?? [])]);
      return haystack.some((word) => keywords.has(word));
    })
    .slice(0, 8)
    .map(toMatchedProduct);
}

function signalToEvidence(signal: MarketSignal): EvidenceLink {
  return {
    sourceId: signal.sourceId,
    sourceLabel: signal.sourceLabel,
    title: signal.title,
    url: signal.url,
    capturedAt: signal.capturedAt,
  };
}

function inventoryContextFor(explanation: MarketExplanation): string {
  const inStock = explanation.matchedProducts.filter((product) => (product.inventoryQuantity ?? 0) > 0).length;
  const lowStock = explanation.matchedProducts.filter((product) => {
    const quantity = product.inventoryQuantity ?? 0;
    return quantity > 0 && quantity <= 3;
  }).length;
  return `${inStock} matched product${inStock === 1 ? "" : "s"} in stock${lowStock ? `; ${lowStock} low-stock warning${lowStock === 1 ? "" : "s"}` : ""}.`;
}

function pricingContextFor(explanation: MarketExplanation, competitorPrices: CompetitorPriceSnapshot[]): string {
  const match = findCompetitorMatch(explanation, competitorPrices);
  if (!match) {
    return "No competitor price gap has been captured yet.";
  }
  const product = explanation.matchedProducts.find((candidate) => candidate.handle === match.productHandle);
  const ownPrice = product ? `Shopify price ${formatMoney(product.price)}; ` : "";
  return `${ownPrice}${match.competitor} price ${formatMoney(match.price)}.`;
}

function findCompetitorMatch(explanation: MarketExplanation, competitorPrices: CompetitorPriceSnapshot[]): CompetitorPriceSnapshot | undefined {
  const handles = new Set(explanation.matchedProducts.map((product) => product.handle));
  return competitorPrices.find((price) => handles.has(price.productHandle));
}

function hasLowStockProduct(explanation: MarketExplanation): boolean {
  return explanation.matchedProducts.some((product) => {
    const quantity = product.inventoryQuantity ?? 0;
    return quantity > 0 && quantity <= 3;
  });
}

export function claimWarnings(text: string): string[] {
  if (!RISKY_CLAIM_WORDS.test(text)) {
    return [];
  }
  return ["Light claim review: avoid disease, cure, treat, diagnose, or prevent language before publishing."];
}

function actionDescription(type: RevenuePlayActionType): string {
  switch (type) {
    case "BLOG_DRAFT":
      return "turn the signal into a Shopify draft article";
    case "CAMPAIGN_DRAFT":
      return "create a Shopify Email handoff brief";
    case "PRICING_CHECK":
      return "review price and margin against competitors";
    case "BUNDLE_IDEA":
      return "package stocked products into a bundle or collection";
    case "RESTOCK_OPPORTUNITY":
      return "protect demand by checking stock before promotion";
    case "NEW_ITEM_OPPORTUNITY":
      return "review supplier new items against market demand";
    case "FLOW_SETUP":
      return "set up or document a Shopify Flow automation";
  }
}

function normalizeTopic(value: string): string {
  return uniqueWords([value]).slice(0, 4).join(" ") || "market signal";
}

function uniqueWords(values: Array<string | undefined>): string[] {
  const words = new Set<string>();
  for (const value of values) {
    for (const word of String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      if (word.length > 2) {
        words.add(word);
      }
    }
  }
  return [...words];
}

function normalizeKeyword(value: string): string {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" ");
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
