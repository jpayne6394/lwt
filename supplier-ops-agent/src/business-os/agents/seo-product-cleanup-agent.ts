import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { hasCleanCatalogData, resultForAgent, type SubAgent } from "./shared.ts";

export function createSeoProductCleanupAgent(): SubAgent {
  return {
    name: "SEO/Product Cleanup Agent",
    async run(input: BusinessAgentInput) {
      const incomplete = input.shopifyVariants.filter((variant) => !hasCleanCatalogData(variant)).slice(0, 12);
      const actions = incomplete.map((variant) =>
        makeBusinessAction({
          type: "FIX",
          title: `Clean up ${variant.title}`,
          reason: "Product needs better image, description, product type, form, or taxonomy before stronger promotion.",
          agentName: "SEO/Product Cleanup Agent",
          target: variant.handle,
          toolName: "draft_product_update",
          toolArguments: { productId: variant.productId, variantId: variant.variantId },
          autonomyMode: input.autonomyMode,
        }),
      );

      return resultForAgent({
        summary: actions.length
          ? `${actions.length} products need cleanup before promotion.`
          : "Catalog data looks clean enough for current promotion review.",
        actions,
        reasoningSummary: "SEO/Product Cleanup Agent flags missing product metadata and keeps public claims review-first.",
      });
    },
  };
}
