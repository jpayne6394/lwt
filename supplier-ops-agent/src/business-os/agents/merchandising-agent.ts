import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { hasCleanCatalogData, isInStock, resultForAgent, type SubAgent } from "./shared.ts";

export function createMerchandisingAgent(): SubAgent {
  return {
    name: "Merchandising Agent",
    async run(input: BusinessAgentInput) {
      const ready = input.shopifyVariants.filter((variant) => isInStock(variant) && hasCleanCatalogData(variant)).slice(0, 8);
      const outOfStockPromos = input.shopifyVariants.filter((variant) => (variant.inventoryQuantity ?? 0) <= 0).slice(0, 8);

      const actions = [
        ...ready.map((variant) =>
          makeBusinessAction({
            type: "PROMOTE",
            title: `Promote ${variant.title}`,
            reason: `${variant.title} is active, in stock, and has enough catalog data for a review-first promotion plan.`,
            agentName: "Merchandising Agent",
            target: variant.handle,
            toolName: "draft_homepage_promotion_change",
            toolArguments: { handle: variant.handle },
            autonomyMode: input.autonomyMode,
          }),
        ),
        ...outOfStockPromos.map((variant) =>
          makeBusinessAction({
            type: "REVIEW",
            title: `Remove ${variant.title} from promotion consideration`,
            reason: `${variant.title} is out of stock or unknown stock and should not be actively promoted.`,
            agentName: "Merchandising Agent",
            target: variant.handle,
            riskLevel: "medium",
            autonomyMode: input.autonomyMode,
          }),
        ),
      ];

      return resultForAgent({
        summary: actions.length
          ? `${ready.length} products can be reviewed for promotion and ${outOfStockPromos.length} should be pulled back.`
          : "No merchandising actions were suggested from the current cached catalog.",
        actions,
        reasoningSummary: "Merchandising Agent balances active status, inventory, images, descriptions, and product taxonomy.",
      });
    },
  };
}
