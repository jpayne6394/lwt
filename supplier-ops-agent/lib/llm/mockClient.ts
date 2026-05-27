import type { BusinessAgentResult } from "../../src/business-os/types.ts";
import type { LlmClient, LlmDecisionRequest } from "./index.ts";

export function createMockLlmClient(_options: { autonomyMode: string }): LlmClient {
  return {
    provider: "mock",
    getStatus() {
      return {
        provider: "mock",
        dataScope: "catalog",
        maxInputChars: 0,
        generatedAt: new Date().toISOString(),
        localBrain: {
          status: "unavailable",
          mode: "rules",
          model: null,
          message: "Mock mode is using deterministic rules and templates.",
        },
      };
    },
    async decide<T>(request: LlmDecisionRequest): Promise<T> {
      const decision: BusinessAgentResult = {
        summary: `${request.agentName} mock decision for ${request.task}.`,
        risk_level: "low",
        recommended_actions: [
          {
            id: `mock_${slugify(request.agentName)}_${Date.now()}`,
            type: "REVIEW",
            title: `Review ${request.task}`,
            reason: "Mock provider keeps the workflow operational without paid API usage.",
            agent_name: request.agentName,
            approval_status: "suggested",
            risk_level: "low",
            requires_approval: true,
            safe_to_auto_execute: false,
            rollback_plan: "Dismiss the mock recommendation or regenerate the command report.",
          },
        ],
        requires_approval: true,
        safe_to_auto_execute: false,
        reasoning_summary: "Mock mode uses deterministic placeholders until AI_PROVIDER=openai is enabled.",
        rollback_plan: "Reject the suggested action; no external system was changed.",
      };
      return decision as T;
    },
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
