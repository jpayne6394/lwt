import type { SupplierOpsRepository } from "../storage/repository.ts";
import type {
  ActionItem,
  ActionItemPriority,
  ActionItemSource,
  ActionItemStatus,
  ActionNote,
  ActionQueueResult,
  ProductSignal,
  ShopperRecommendation,
} from "./intelligenceTypes.ts";

export type CreateActionItemInput = {
  title: string;
  source: ActionItemSource;
  priority?: ActionItemPriority;
  status?: ActionItemStatus;
  recommendationType?: string;
  relatedProductId?: string;
  relatedProductTitle?: string;
  relatedTopic?: string;
  explanation?: string;
  suggestedAction?: string;
  owner?: string;
};

export type CreateActionFromRecommendationInput = {
  source: ActionItemSource;
  recommendationId?: string;
  recommendation?: CreateActionItemInput;
};

export async function listActionQueue(
  repository: SupplierOpsRepository,
  input: { source?: ActionItemSource; priority?: ActionItemPriority; status?: ActionItemStatus; limit?: number } = {},
): Promise<ActionQueueResult> {
  const items = await repository.recentActionItems(input);
  return {
    summary: summarizeActionItems(await repository.recentActionItems({ limit: 500 })),
    items,
  };
}

export async function createActionItem(repository: SupplierOpsRepository, input: CreateActionItemInput): Promise<ActionItem> {
  return repository.createActionItem({
    title: input.title.trim(),
    source: input.source,
    priority: input.priority ?? "medium",
    status: input.status,
    recommendationType: input.recommendationType ?? "manual",
    relatedProductId: input.relatedProductId,
    relatedProductTitle: input.relatedProductTitle,
    relatedTopic: input.relatedTopic,
    explanation: input.explanation?.trim() || "Manual operator action.",
    suggestedAction: input.suggestedAction?.trim() || "Review and decide the next safe operator step.",
    owner: input.owner?.trim() || undefined,
  });
}

export async function updateActionItem(
  repository: SupplierOpsRepository,
  id: string,
  input: Partial<Pick<ActionItem, "title" | "priority" | "status" | "owner" | "explanation" | "suggestedAction" | "relatedProductId" | "relatedProductTitle" | "relatedTopic">>,
): Promise<ActionItem> {
  return repository.updateActionItem(id, input);
}

export async function addActionNote(repository: SupplierOpsRepository, actionId: string, body: string): Promise<ActionNote> {
  if (!body.trim()) {
    throw new Error("Action note body is required");
  }
  return repository.createActionNote({ actionId, body: body.trim() });
}

export async function createActionFromRecommendation(
  repository: SupplierOpsRepository,
  input: CreateActionFromRecommendationInput,
): Promise<ActionItem> {
  if (input.recommendation) {
    return createActionItem(repository, {
      ...input.recommendation,
      source: input.source,
      priority: input.recommendation.priority ?? "medium",
      recommendationType: input.recommendation.recommendationType ?? "recommendation",
    });
  }

  if (input.source === "shopper_behavior" && input.recommendationId) {
    const recommendations = await repository.recentShopperRecommendations({ limit: 200 });
    const recommendation = recommendations.find((candidate) => candidate.id === input.recommendationId);
    if (!recommendation) {
      throw new Error(`Shopper behavior recommendation ${input.recommendationId} was not found`);
    }
    return createActionItem(repository, actionFromShopperRecommendation(recommendation));
  }

  if ((input.source === "content_radar" || input.source === "blog_brief") && input.recommendationId) {
    const idea = await repository.getContentIdea(input.recommendationId);
    if (!idea) {
      throw new Error(`Content idea ${input.recommendationId} was not found`);
    }
    return createActionItem(repository, {
      title: input.source === "blog_brief" ? `Draft blog brief for ${idea.topic}` : idea.suggestedTitle,
      source: input.source,
      priority: idea.complianceRisk === "High" ? "high" : "medium",
      recommendationType: input.source === "blog_brief" ? "blog_brief" : "content_idea",
      relatedTopic: idea.topic,
      explanation: `${idea.sourceSummary} Compliance risk: ${idea.complianceRisk}.`,
      suggestedAction: input.source === "blog_brief" ? "Generate and review the Markdown blog brief before any publishing step." : idea.suggestedCta,
    });
  }

  throw new Error("Recommendation source and recommendationId are required");
}

export function actionFromProductSignal(signal: ProductSignal, source: ActionItemSource): CreateActionItemInput {
  return {
    title: signal.reason,
    source,
    priority: priorityFromLabel(signal.priority),
    recommendationType: signal.signalType,
    relatedProductId: signal.shopifyProductId,
    relatedProductTitle: signal.productTitle,
    explanation: signal.reason,
    suggestedAction: "Review this product signal before changing merchandising, content, pricing, or inventory operations.",
  };
}

export function summarizeActionItems(items: ActionItem[]) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    openActions: items.filter((item) => item.status === "open").length,
    criticalActions: items.filter((item) => item.status !== "done" && item.status !== "rejected" && item.priority === "critical").length,
    highPriorityActions: items.filter((item) => item.status !== "done" && item.status !== "rejected" && item.priority === "high").length,
    doneThisWeek: items.filter((item) => item.status === "done" && item.completedAt && new Date(item.completedAt).getTime() >= weekAgo).length,
    rejectedActions: items.filter((item) => item.status === "rejected").length,
  };
}

export function priorityFromLabel(priority: string | undefined): ActionItemPriority {
  if (priority === "Critical") return "critical";
  if (priority === "Watch") return "high";
  if (priority === "High") return "high";
  if (priority === "Low") return "low";
  return "medium";
}

function actionFromShopperRecommendation(recommendation: ShopperRecommendation): CreateActionItemInput {
  return {
    title: recommendation.title,
    source: "shopper_behavior",
    priority: priorityFromLabel(recommendation.priority),
    recommendationType: recommendation.recommendationType,
    relatedProductId: recommendation.relatedProductId,
    relatedProductTitle: recommendation.relatedProductTitle,
    relatedTopic: recommendation.relatedTerm,
    explanation: recommendation.explanation,
    suggestedAction: recommendation.suggestedAction ?? "Review this shopper behavior recommendation.",
  };
}
