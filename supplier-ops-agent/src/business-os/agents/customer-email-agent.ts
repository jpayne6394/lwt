import { makeBusinessAction } from "../action-factory.ts";
import type { BusinessAgentInput } from "../types.ts";
import { resultForAgent, type SubAgent } from "./shared.ts";

export function createCustomerEmailAgent(): SubAgent {
  return {
    name: "Customer/Email Agent",
    async run(input: BusinessAgentInput) {
      const actions = [
        makeBusinessAction({
          type: "WRITE",
          title: "Draft triggered-email templates for Shopify Flow",
          reason: "Professional Flow-triggered email copy can be prepared here and pasted into Shopify after owner review.",
          agentName: "Customer/Email Agent",
          target: "Shopify Flow email templates",
          riskLevel: "medium",
          toolName: "draft_flow_email_template",
          toolArguments: { mode: "draft_only" },
          autonomyMode: input.autonomyMode,
        }),
      ];

      return resultForAgent({
        summary: "Customer/email work is draft-only; no customer email sends without approval.",
        actions,
        reasoningSummary: "Customer/Email Agent prepares lifecycle copy and Flow email handoffs while keeping sends blocked.",
      });
    },
  };
}
