import type { RevenuePlayRecord } from "../market-radar/types.ts";

export type CampaignDraftStatus = "DRAFT_READY" | "APPROVED" | "DISMISSED";

export type CampaignDraftRecord = {
  id: string;
  title: string;
  status: CampaignDraftStatus;
  revenuePlayId?: string;
  subjectLines: string[];
  previewText: string;
  bodyText: string;
  productTitles: string[];
  segmentIdea: string;
  shopifyEmailAdminPath: string;
  createdAt: string;
  updatedAt: string;
};

export type BuildCampaignDraftInput = {
  revenuePlay?: RevenuePlayRecord;
  products?: Array<{ title: string; vendor?: string; price?: number; handle?: string }>;
  title?: string;
  now?: string;
};
