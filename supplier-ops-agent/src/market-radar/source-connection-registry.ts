import type { SourceConnectionCard } from "./types.ts";

export type SourceConnectionFlags = {
  reddit?: boolean;
  meta?: boolean;
  x?: boolean;
  pinterest?: boolean;
  truthSocial?: boolean;
  competitorUrls?: boolean;
};

export function buildSourceConnectionCards(flags: SourceConnectionFlags = {}): SourceConnectionCard[] {
  return [
    {
      id: "open-web",
      label: "Open Web / RSS",
      status: "connected",
      accessMode: "safe_open_web",
      notes: "Public pages, blogs, newsletters, and RSS-style feeds can be checked without account scraping.",
      configured: true,
    },
    {
      id: "competitor-prices",
      label: "Competitor Price URLs",
      status: flags.competitorUrls ? "connected" : "needs_credentials",
      accessMode: "safe_open_web",
      notes: "Tracks user-provided public competitor product URLs only.",
      configured: Boolean(flags.competitorUrls),
    },
    {
      id: "reddit",
      label: "Reddit",
      status: flags.reddit ? "connected" : "needs_credentials",
      accessMode: "official_api",
      notes: "Use Reddit-approved access only; no password or cookie capture.",
      configured: Boolean(flags.reddit),
    },
    {
      id: "meta-instagram",
      label: "Meta / Instagram",
      status: flags.meta ? "connected" : "needs_credentials",
      accessMode: "official_api",
      notes: "Requires official Meta/Instagram business API access where available.",
      configured: Boolean(flags.meta),
    },
    {
      id: "x",
      label: "X",
      status: flags.x ? "connected" : "paid_optional",
      accessMode: "paid_api",
      notes: "X API access is optional and may be pay-per-use.",
      configured: Boolean(flags.x),
    },
    {
      id: "pinterest",
      label: "Pinterest",
      status: flags.pinterest ? "connected" : "needs_credentials",
      accessMode: "official_api",
      notes: "Pinterest trends and pins require official API access and rate-limit awareness.",
      configured: Boolean(flags.pinterest),
    },
    {
      id: "truth-social",
      label: "Truth Social",
      status: flags.truthSocial ? "connected" : "manual_only",
      accessMode: "manual_review",
      notes: "Manual review until a sanctioned automated access path exists.",
      configured: Boolean(flags.truthSocial),
    },
  ];
}
