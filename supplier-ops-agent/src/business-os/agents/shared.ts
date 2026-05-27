import { combineRisk } from "../action-factory.ts";
import type { BusinessAgentInput, BusinessAgentName, BusinessAgentResult, BusinessRecommendedAction } from "../types.ts";

export type SubAgent = {
  name: BusinessAgentName;
  run(input: BusinessAgentInput): Promise<BusinessAgentResult>;
};

export function resultForAgent(input: {
  summary: string;
  actions: BusinessRecommendedAction[];
  reasoningSummary: string;
  rollbackPlan?: string;
}): BusinessAgentResult {
  const requiresApproval = input.actions.some((action) => action.requires_approval);
  return {
    summary: input.summary,
    risk_level: combineRisk(input.actions),
    recommended_actions: input.actions,
    requires_approval: requiresApproval,
    safe_to_auto_execute: input.actions.length > 0 && input.actions.every((action) => action.safe_to_auto_execute),
    reasoning_summary: input.reasoningSummary,
    rollback_plan: input.rollbackPlan ?? "All work is draft/review-first; reject suggested actions to leave Shopify unchanged.",
  };
}

export function hasCleanCatalogData(variant: BusinessAgentInput["shopifyVariants"][number]): boolean {
  return Boolean(variant.title && variant.vendor && variant.productType && variant.imageUrls?.length && variant.descriptionHtml);
}

export function isInStock(variant: BusinessAgentInput["shopifyVariants"][number]): boolean {
  return (variant.inventoryQuantity ?? 0) > 5;
}
