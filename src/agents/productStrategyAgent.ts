import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { ProductSignal, ProductStrategyResult } from "./intelligenceTypes.ts";

export type RunProductStrategyAgentInput = {
  repository: SupplierOpsRepository;
};

export async function runProductStrategyAgent(input: RunProductStrategyAgentInput): Promise<ProductStrategyResult> {
  const [signals, ideas] = await Promise.all([
    input.repository.recentProductSignals({ limit: 100 }),
    input.repository.recentContentIdeas({ limit: 50 }),
  ]);
  const criticalOrWatch = signals.filter((signal) => signal.priority === "Critical" || signal.priority === "Watch");
  const movementButLowStock = criticalOrWatch.filter((signal) => signal.signalType === "low_stock" || signal.signalType === "out_of_stock");
  const categories = summarizeAttentionAreas(signals, ideas);

  return {
    generatedAt: new Date().toISOString(),
    topMovingProducts: [],
    stockButLowMovement: [],
    movementButLowStock,
    brandsOrCategoriesToFeature: categories,
    suggestedPushes: suggestedPushes(categories, movementButLowStock),
    explanations: [
      "Product strategy is using inventory and content signals in v1.",
      "Top-moving products and stale-stock calls require Shopify order/sales history before the app can rank them honestly.",
      movementButLowStock.length
        ? "Products at stock risk should not be pushed hard until replenishment is reviewed."
        : "No stock-risk product signals are currently blocking feature pushes.",
    ],
  };
}

function summarizeAttentionAreas(signals: ProductSignal[], ideas: Awaited<ReturnType<SupplierOpsRepository["recentContentIdeas"]>>): string[] {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    if (signal.category) counts.set(signal.category, (counts.get(signal.category) ?? 0) + 1);
    if (signal.vendor) counts.set(signal.vendor, (counts.get(signal.vendor) ?? 0) + 1);
  }
  for (const idea of ideas) {
    counts.set(idea.topic, (counts.get(idea.topic) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value]) => value)
    .slice(0, 8);
}

function suggestedPushes(categories: string[], stockRisks: ProductSignal[]): string[] {
  const pushes = categories.slice(0, 4).map((category) => `Feature ${category} with educational content and practitioner-guided positioning.`);
  if (stockRisks.length) {
    pushes.push(`Avoid heavy promotion for ${stockRisks[0].productTitle} until inventory is reviewed.`);
  }
  if (!pushes.length) {
    pushes.push("Run Content Radar and Inventory Scan to generate product and category recommendations.");
  }
  return pushes;
}
