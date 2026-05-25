import type { MarketRadarMatchedProduct } from "../market-radar/types.ts";

export type BlogDraftStatus = "DRAFT_READY" | "CREATED_IN_SHOPIFY" | "DISMISSED";

export type BlogStyleProfile = {
  id: string;
  label: string;
  summary: string;
  sections: string[];
};

export type BlogDraftRecord = {
  id: string;
  title: string;
  profileId: string;
  profileLabel: string;
  status: BlogDraftStatus;
  authorName: string;
  bodyHtml: string;
  summary: string;
  tags: string[];
  handle: string;
  relatedProducts: MarketRadarMatchedProduct[];
  claimWarnings: string[];
  shopifyArticleId?: string;
  shopifyArticleHandle?: string;
  createdAt: string;
  updatedAt: string;
};

export type BuildBlogDraftInput = {
  profileId: string;
  title: string;
  roughThoughts: string;
  relatedProducts?: MarketRadarMatchedProduct[];
  authorName?: string;
  now?: string;
};
