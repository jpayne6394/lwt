import type { LlmClient } from "../../lib/llm/index.ts";
import type { CampaignDraftRecord } from "../campaigns/types.ts";
import type { BlogDraftRecord } from "../content/types.ts";
import { claimWarnings } from "../market-radar/market-radar-service.ts";
import type { MarketRadarRunOutput } from "../market-radar/types.ts";
import type { IntelligenceMetadata } from "./types.ts";

export async function enhanceMarketRadarWithLlm(output: MarketRadarRunOutput, llm: LlmClient): Promise<MarketRadarRunOutput> {
  const decision = await llm.decide<{
    explanations?: Array<{ topic: string; explanation: string }>;
    revenuePlays?: Array<{ id: string; explanation: string }>;
  }>({
    agentName: "Research Agent",
    task: "Improve Market Radar explanations",
    input: {
      summary: output.summary,
      salesWindows: output.salesWindows,
      explanations: output.explanations,
      revenuePlays: output.revenuePlays,
    },
  });
  const intelligence = llm.getStatus();
  if (!usesGenerativeIntelligence(intelligence)) {
    return { ...output, intelligence };
  }

  const explanationMap = new Map((decision.explanations ?? []).map((item) => [item.topic, item.explanation]));
  const playMap = new Map((decision.revenuePlays ?? []).map((item) => [item.id, item.explanation]));
  return {
    ...output,
    intelligence,
    explanations: output.explanations.map((explanation) => ({
      ...explanation,
      explanation: safeText(explanationMap.get(explanation.topic), explanation.explanation),
    })),
    revenuePlays: output.revenuePlays.map((play) => {
      const explanation = safeText(playMap.get(play.id), play.explanation);
      return {
        ...play,
        explanation,
        claimWarnings: claimWarnings(`${play.title} ${explanation}`),
        updatedAt: output.finishedAt,
      };
    }),
  };
}

export async function enhanceBlogDraftWithLlm(
  draft: BlogDraftRecord,
  context: Record<string, unknown>,
  llm: LlmClient,
): Promise<BlogDraftRecord> {
  const decision = await llm.decide<{
    title?: string;
    summary?: string;
    bodyHtml?: string;
    tags?: string[];
  }>({
    agentName: "Blog Publisher",
    task: "Polish Shopify draft article",
    input: {
      draft,
      context,
    },
  });
  const intelligence = llm.getStatus();
  if (!usesGenerativeIntelligence(intelligence)) {
    return { ...draft, intelligence };
  }

  const title = safeText(decision.title, draft.title);
  const summary = safeText(decision.summary, draft.summary);
  const bodyHtml = safeHtml(decision.bodyHtml, draft.bodyHtml);
  return {
    ...draft,
    title,
    summary,
    bodyHtml,
    tags: Array.isArray(decision.tags) && decision.tags.length ? decision.tags.map(String).slice(0, 12) : draft.tags,
    handle: slugify(title),
    claimWarnings: claimWarnings(`${title} ${summary} ${bodyHtml}`),
    intelligence,
    updatedAt: new Date().toISOString(),
  };
}

export async function enhanceCampaignDraftWithLlm(
  draft: CampaignDraftRecord,
  context: Record<string, unknown>,
  llm: LlmClient,
): Promise<CampaignDraftRecord> {
  const decision = await llm.decide<{
    title?: string;
    subjectLines?: string[];
    previewText?: string;
    bodyText?: string;
    segmentIdea?: string;
  }>({
    agentName: "Marketing Agent",
    task: "Polish Shopify Email campaign draft",
    input: {
      draft,
      context,
    },
  });
  const intelligence = llm.getStatus();
  if (!usesGenerativeIntelligence(intelligence)) {
    return { ...draft, intelligence };
  }

  return {
    ...draft,
    title: safeText(decision.title, draft.title),
    subjectLines: Array.isArray(decision.subjectLines) && decision.subjectLines.length
      ? decision.subjectLines.map(String).slice(0, 5)
      : draft.subjectLines,
    previewText: safeText(decision.previewText, draft.previewText),
    bodyText: safeText(decision.bodyText, draft.bodyText),
    segmentIdea: safeText(decision.segmentIdea, draft.segmentIdea),
    intelligence,
    updatedAt: new Date().toISOString(),
  };
}

function usesGenerativeIntelligence(intelligence: IntelligenceMetadata): boolean {
  return intelligence.localBrain.status === "connected" || intelligence.localBrain.mode === "openai";
}

function safeText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function safeHtml(value: unknown, fallback: string): string {
  const html = safeText(value, fallback);
  return /<article[\s>]/i.test(html) ? html : `<article>${html}</article>`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
