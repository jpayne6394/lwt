import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { resultForAgent, type SubAgent } from "./shared.ts";

export function createResearchAgent(): SubAgent {
  return {
    name: "Research Agent",
    async run(input: BusinessAgentInput) {
      const radarCount = input.marketRadarOutputs.length;
      const actions = [
        makeBusinessAction({
          type: "REVIEW",
          title: radarCount ? "Review latest Market Pulse signals" : "Refresh Market Pulse research",
          reason: radarCount
            ? "Use approved external signals and competitor context to decide what to promote, write, or ignore."
            : "No current Market Pulse output is available; refresh safe/manual/API-ready sources before planning campaigns.",
          agentName: "Research Agent",
          target: "market-pulse",
          toolName: "refresh_market_radar",
          toolArguments: {},
          autonomyMode: input.autonomyMode,
        }),
      ];

      return resultForAgent({
        summary: "Research is evidence-gathering only; it summarizes safe market signals without scraping protected social content.",
        actions,
        reasoningSummary: "Research Agent prepares approved market context for BI, blog, campaign, and merchandising decisions.",
      });
    },
  };
}
