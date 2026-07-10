import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { DailyBiResult } from "./intelligenceTypes.ts";

export type RunDailyBiAgentInput = {
  repository: SupplierOpsRepository;
};

export async function runDailyBiAgent(input: RunDailyBiAgentInput): Promise<DailyBiResult> {
  const [runs, signals, ideas] = await Promise.all([
    input.repository.recentIntelligenceRuns({ limit: 20 }),
    input.repository.recentProductSignals({ limit: 20 }),
    input.repository.recentContentIdeas({ status: "idea", limit: 20 }),
  ]);
  const lastSuccessfulScanTime = runs.find((run) => run.status === "completed")?.finishedAt ?? null;
  const criticalSignals = signals.filter((signal) => signal.priority === "Critical");
  const watchSignals = signals.filter((signal) => signal.priority === "Watch");
  const actionItems = [
    ...criticalSignals.slice(0, 2).map((signal) => `Review ${signal.productTitle}: ${signal.reason}`),
    ...watchSignals.slice(0, 2).map((signal) => `Watch ${signal.productTitle}: ${signal.reason}`),
    ...ideas.slice(0, 2).map((idea) => `Draft blog brief: ${idea.suggestedTitle}`),
  ].slice(0, 5);

  return {
    generatedAt: new Date().toISOString(),
    brief: buildBrief(criticalSignals.length, watchSignals.length, ideas.length),
    actionItems: actionItems.length ? actionItems : ["Run Inventory Scan and Content Radar to populate today's action list."],
    inventoryAlerts: signals.slice(0, 5).map((signal) => `${signal.priority}: ${signal.productTitle} - ${signal.reason}`),
    recommendations: ideas.slice(0, 5).map((idea) => `${idea.topic}: ${idea.suggestedTitle}`),
    lastSuccessfulScanTime,
    salesSignal: "Order/sales history is not connected in v1; sales signal is limited to inventory and content data.",
  };
}

function buildBrief(criticalCount: number, watchCount: number, ideaCount: number): string {
  if (criticalCount || watchCount || ideaCount) {
    return `LWT has ${criticalCount} critical inventory risks, ${watchCount} watch items, and ${ideaCount} content ideas ready for review.`;
  }
  return "No intelligence runs have produced actionable signals yet. Start with Inventory Scan and Content Radar.";
}
