import type { ShopifyVariant } from "../domain/types.ts";
import type { IntelligenceMetadata } from "../intelligence/types.ts";

export type SalesWindowKey = "today" | "7d" | "30d" | "90d" | "365d";

export type ConfidenceLevel = "low" | "medium" | "high";
export type EffortLevel = "low" | "medium" | "high";

export type SourceConnectionStatus = "connected" | "needs_credentials" | "paid_optional" | "manual_only" | "blocked";
export type SourceAccessMode = "safe_open_web" | "official_api" | "paid_api" | "manual_review";

export type SourceConnectionCard = {
  id: string;
  label: string;
  status: SourceConnectionStatus;
  accessMode: SourceAccessMode;
  notes: string;
  configured: boolean;
};

export type MarketSignal = {
  sourceId: string;
  sourceLabel: string;
  topic: string;
  title: string;
  url: string;
  capturedAt: string;
  keywords: string[];
};

export type EvidenceLink = {
  sourceId: string;
  sourceLabel: string;
  title: string;
  url: string;
  capturedAt: string;
};

export type CompetitorPriceSnapshot = {
  productHandle: string;
  productTitle: string;
  competitor: string;
  url: string;
  price: number;
  capturedAt: string;
};

export type SalesWindowSummary = {
  window: SalesWindowKey;
  label: string;
  orderCount: number;
  revenue: number;
  unitsSold: number;
};

export type ShopifyOrderSignal = {
  id: string;
  createdAt: string;
  totalPrice: number;
  lineItems: Array<{
    title: string;
    sku?: string;
    quantity: number;
    variantId?: string;
    productId?: string;
  }>;
};

export type MarketRadarMatchedProduct = {
  productId: string;
  variantId: string;
  handle: string;
  title: string;
  vendor: string;
  sku: string;
  price: number;
  cost: number | null;
  inventoryQuantity: number | null | undefined;
  tags: string[];
};

export type MarketExplanation = {
  topic: string;
  title: string;
  explanation: string;
  evidence: EvidenceLink[];
  matchedProducts: MarketRadarMatchedProduct[];
  confidence: ConfidenceLevel;
};

export type RevenuePlayActionType =
  | "BLOG_DRAFT"
  | "CAMPAIGN_DRAFT"
  | "BUNDLE_IDEA"
  | "PRICING_CHECK"
  | "RESTOCK_OPPORTUNITY"
  | "NEW_ITEM_OPPORTUNITY"
  | "FLOW_SETUP";

export type RevenuePlayTargetAgent = "bi" | "inventory" | "product_ops" | "campaign" | "blog" | "flow";
export type RevenuePlayStatus = "SUGGESTED" | "DRAFT_READY" | "APPROVED" | "CREATED_IN_SHOPIFY" | "DISMISSED";

export type RevenuePlayRecord = {
  id: string;
  title: string;
  explanation: string;
  actionType: RevenuePlayActionType;
  targetAgent: RevenuePlayTargetAgent;
  source: string;
  evidence: EvidenceLink[];
  matchedProducts: MarketRadarMatchedProduct[];
  inventoryContext: string;
  pricingContext: string;
  confidence: ConfidenceLevel;
  effort: EffortLevel;
  status: RevenuePlayStatus;
  claimWarnings: string[];
  createdAt: string;
  updatedAt: string;
};

export type MarketRadarRunOutput = {
  agent: "bi";
  mode: "dry_run";
  startedAt: string;
  finishedAt: string;
  summary: {
    signalsReviewed: number;
    competitorPricesReviewed: number;
    revenuePlays: number;
    highConfidencePlays: number;
    lightClaimWarnings: number;
  };
  salesWindows: SalesWindowSummary[];
  explanations: MarketExplanation[];
  sourceConnections: SourceConnectionCard[];
  revenuePlays: RevenuePlayRecord[];
  errors: string[];
  intelligence?: IntelligenceMetadata;
};

export type MarketRadarOutputRecord = MarketRadarRunOutput & {
  id: string;
  runId: string;
  createdAt: string;
};

export function toMatchedProduct(variant: ShopifyVariant): MarketRadarMatchedProduct {
  return {
    productId: variant.productId,
    variantId: variant.variantId,
    handle: variant.handle,
    title: variant.title,
    vendor: variant.vendor,
    sku: variant.sku,
    price: variant.price,
    cost: variant.cost ?? null,
    inventoryQuantity: variant.inventoryQuantity,
    tags: variant.tags ?? [],
  };
}
