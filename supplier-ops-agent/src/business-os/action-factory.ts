import { applyBusinessGuardrails } from "./guardrails.ts";
import type { AutonomyMode, BusinessActionType, BusinessRecommendedAction, RiskLevel } from "./types.ts";

export function makeBusinessAction(input: {
  type: BusinessActionType;
  title: string;
  reason: string;
  agentName: string;
  target?: string;
  riskLevel?: RiskLevel;
  approvalStatus?: BusinessRecommendedAction["approval_status"];
  safeToAutoExecute?: boolean;
  requiresApproval?: boolean;
  rollbackPlan?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  autonomyMode: AutonomyMode;
}): BusinessRecommendedAction {
  return applyBusinessGuardrails(
    {
      id: `action_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: input.type,
      title: input.title,
      reason: input.reason,
      agent_name: input.agentName,
      target: input.target,
      tool_call: input.toolName
        ? {
            tool_name: input.toolName,
            arguments: input.toolArguments ?? {},
          }
        : undefined,
      approval_status: input.approvalStatus ?? "suggested",
      risk_level: input.riskLevel ?? "low",
      requires_approval: input.requiresApproval ?? true,
      safe_to_auto_execute: input.safeToAutoExecute ?? false,
      rollback_plan: input.rollbackPlan ?? "Reject the recommendation; no Shopify state changes until execution is approved.",
    },
    { autonomyMode: input.autonomyMode },
  );
}

export function combineRisk(actions: BusinessRecommendedAction[]): RiskLevel {
  if (actions.some((action) => action.risk_level === "high")) return "high";
  if (actions.some((action) => action.risk_level === "medium")) return "medium";
  return "low";
}
