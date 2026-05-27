import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { resultForAgent, type SubAgent } from "./shared.ts";

export function createInventoryAgent(): SubAgent {
  return {
    name: "Inventory Agent",
    async run(input: BusinessAgentInput) {
      const lowInventory = input.shopifyVariants.filter((variant) => (variant.inventoryQuantity ?? 0) <= 5);
      const actions = lowInventory.slice(0, 12).map((variant) =>
        makeBusinessAction({
          type: "FIX",
          title: `Review inventory risk for ${variant.title}`,
          reason: `${variant.title} has ${variant.inventoryQuantity ?? "unknown"} units available and should not be pushed without supplier confirmation.`,
          agentName: "Inventory Agent",
          target: variant.handle,
          riskLevel: (variant.inventoryQuantity ?? 0) <= 0 ? "high" : "medium",
          toolName: "read_product_inventory_status",
          toolArguments: { variantId: variant.variantId },
          autonomyMode: input.autonomyMode,
        }),
      );

      return resultForAgent({
        summary: actions.length
          ? `${actions.length} inventory risks need owner review before promotion.`
          : "No immediate inventory risks found in the cached Shopify catalog.",
        actions,
        reasoningSummary: "Inventory Agent checks cached Shopify inventory quantities and flags low or unknown stock before promotion.",
      });
    },
  };
}
