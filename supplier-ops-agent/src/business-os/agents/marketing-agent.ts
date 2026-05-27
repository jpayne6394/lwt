import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { hasCleanCatalogData, isInStock, resultForAgent, type SubAgent } from "./shared.ts";

export function createMarketingAgent(): SubAgent {
  return {
    name: "Marketing Agent",
    async run(input: BusinessAgentInput) {
      const candidates = input.shopifyVariants.filter((variant) => isInStock(variant) && hasCleanCatalogData(variant)).slice(0, 4);
      const actions = [
        makeBusinessAction({
          type: "WRITE",
          title: candidates.length ? `Draft a Shopify Email campaign for ${candidates[0].title}` : "Draft a Shopify Email campaign brief",
          reason: candidates.length
            ? "Stocked, catalog-ready products can support an owner-reviewed Shopify Email campaign."
            : "Create a reusable email campaign brief once product candidates are selected.",
          agentName: "Marketing Agent",
          target: candidates.map((variant) => variant.handle).join(", "),
          riskLevel: "medium",
          toolName: "draft_campaign_brief",
          toolArguments: { handles: candidates.map((variant) => variant.handle) },
          autonomyMode: input.autonomyMode,
        }),
      ];

      return resultForAgent({
        summary: "Marketing is draft-only: briefs and copy can be prepared, but no customer email is sent automatically.",
        actions,
        reasoningSummary: "Marketing Agent turns safe product candidates and business signals into Shopify Email handoff drafts.",
      });
    },
  };
}
