import type { BuildCampaignDraftInput, CampaignDraftRecord } from "./types.ts";

export function buildCampaignDraft(input: BuildCampaignDraftInput): CampaignDraftRecord {
  const now = input.now ?? new Date().toISOString();
  const products = input.products ?? input.revenuePlay?.matchedProducts ?? [];
  const productTitles = products.map((product) => product.title).slice(0, 6);
  const topic = input.revenuePlay?.title.replace(/^(draft|plan|review|create|consider)\s+/i, "") ?? input.title ?? "Wellness campaign";
  const title = input.title ?? topic;
  const firstProduct = productTitles[0] ?? "featured wellness picks";

  return {
    id: `campaign_${Date.now()}_${hashText(title)}`,
    title,
    status: "DRAFT_READY",
    revenuePlayId: input.revenuePlay?.id,
    subjectLines: [
      `${firstProduct}: a timely wellness focus`,
      `Fresh ideas for ${shortTopic(topic)}`,
      `Shop the ${shortTopic(topic)} edit`,
    ],
    previewText: `A practical Living Well Today note with products and next steps for ${shortTopic(topic)}.`,
    bodyText: buildBodyText({ title, topic, productTitles }),
    productTitles,
    segmentIdea: `Customers interested in ${shortTopic(topic)}, related product tags, or recent buyers of matched products.`,
    shopifyEmailAdminPath: "/admin/marketing",
    createdAt: now,
    updatedAt: now,
  };
}

function buildBodyText(input: { title: string; topic: string; productTitles: string[] }): string {
  const productLine = input.productTitles.length
    ? `Featured products: ${input.productTitles.join(", ")}.`
    : "Choose products from the Market Radar recommendation before sending.";
  return [
    input.title,
    "",
    `This campaign is based on the ${shortTopic(input.topic)} revenue signal.`,
    productLine,
    "Keep the copy educational, practical, and review any health claims before sending.",
    "",
    "CTA: Shop the selected wellness support products.",
  ].join("\n");
}

function shortTopic(value: string): string {
  return value.replace(/\s+(article|campaign|guide|email)$/i, "").trim() || "wellness";
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
