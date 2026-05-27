import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { resultForAgent, type SubAgent } from "./shared.ts";

export function createOperatorAgent(): SubAgent {
  return {
    name: "Operator Agent",
    async run(input: BusinessAgentInput) {
      const actions = [
        ...input.issues.slice(0, 10).map((issue) =>
          makeBusinessAction({
            type: "REVIEW",
            title: `Resolve ${issue.kind.replace(/_/g, " ")}`,
            reason: issue.reason,
            agentName: "Operator Agent",
            target: issue.kind,
            riskLevel: issue.kind.includes("price") || issue.kind.includes("shopify") ? "high" : "medium",
            autonomyMode: input.autonomyMode,
          }),
        ),
        makeBusinessAction({
          type: "AUTOMATE",
          title: "Build approved Shopify Action Queue",
          reason: "Keep model recommendations separate from validated backend tool execution.",
          agentName: "Operator Agent",
          target: "approval queue",
          toolName: "record_action_log",
          toolArguments: { mode: "approval_first" },
          autonomyMode: input.autonomyMode,
        }),
      ];

      return resultForAgent({
        summary: "Operator Agent tracks urgent issues, approvals, execution results, and rollback information.",
        actions,
        reasoningSummary: "Operator Agent keeps all business work in a logged approval queue before Shopify execution.",
      });
    },
  };
}
