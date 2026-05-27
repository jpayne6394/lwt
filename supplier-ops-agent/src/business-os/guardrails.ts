import type { AutonomyMode, BusinessRecommendedAction, RiskLevel } from "./types.ts";

export const HIGH_RISK_HEALTH_TERMS = [
  "cancer",
  "infection",
  "covid",
  "lyme",
  "autism",
  "anxiety",
  "depression",
  "insomnia",
  "mold illness",
  "parasites",
  "treats",
  "cures",
  "prevents",
  "diagnoses",
  "heals",
  "reverses",
  "fixes",
  "eliminates",
  "guaranteed",
];

export const SAFER_PUBLIC_LANGUAGE: Record<string, string> = {
  anxiety: "stress support / calm support",
  insomnia: "sleep support / nighttime routine",
  depression: "mood support",
  autism: "neuro support / practitioner-guided neuro wellness",
  infection: "immune support / respiratory wellness",
  covid: "immune support / respiratory wellness",
  lyme: "practitioner review / immune & detox support",
  "mold illness": "environmental support / detox support",
  parasites: "digestive & detox support",
  cancer: "practitioner review / do not auto-market",
};

export const VENDOR_SENSITIVE_BRANDS = ["Designs for Health", "Beyond Balance", "Thorne"];

export function applyBusinessGuardrails(
  action: BusinessRecommendedAction,
  context: { autonomyMode: AutonomyMode },
): BusinessRecommendedAction {
  const haystack = [action.title, action.reason, action.target, action.tool_call?.tool_name, JSON.stringify(action.tool_call?.arguments ?? {})]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const notes: string[] = [...(action.guardrail_notes ?? [])];
  let requiresApproval = action.requires_approval || context.autonomyMode === "approval";
  let safeToAutoExecute = action.safe_to_auto_execute && context.autonomyMode === "autonomous";
  let riskLevel: RiskLevel = action.risk_level;

  const riskyTerms = HIGH_RISK_HEALTH_TERMS.filter((term) => haystack.includes(term));
  if (riskyTerms.length > 0) {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = maxRisk(riskLevel, "high");
    notes.push(`Health-claim review required: ${riskyTerms.join(", ")}.`);
  }

  const sensitiveVendor = VENDOR_SENSITIVE_BRANDS.find((vendor) => haystack.includes(vendor.toLowerCase()));
  if (sensitiveVendor) {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = maxRisk(riskLevel, "medium");
    notes.push(`${sensitiveVendor} is vendor-sensitive; prefer REVIEW over automatic promotion.`);
  }

  if (/\b(price|discount|compare-at|compare at|cost|margin)\b/.test(haystack)) {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = maxRisk(riskLevel, "medium");
    notes.push("Price, margin, and compare-at changes require owner approval.");
  }

  if (/\b(delete|remove product|archive product)\b/.test(haystack)) {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = "high";
    notes.push("Deletion or destructive product actions are blocked from automatic execution.");
  }

  if (/\b(send email|customer email|shopify email|campaign send)\b/.test(haystack)) {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = maxRisk(riskLevel, "medium");
    notes.push("Customer emails can be drafted only; sending requires owner approval.");
  }

  if (/\b(homepage|hero|theme|online store)\b/.test(haystack) && context.autonomyMode === "approval") {
    requiresApproval = true;
    safeToAutoExecute = false;
    riskLevel = maxRisk(riskLevel, "medium");
    notes.push("Homepage and theme changes require approval while AUTONOMY_MODE=approval.");
  }

  return {
    ...action,
    requires_approval: requiresApproval,
    safe_to_auto_execute: safeToAutoExecute,
    risk_level: riskLevel,
    approval_status: requiresApproval && action.approval_status === "executed" ? "suggested" : action.approval_status,
    guardrail_notes: unique(notes),
  };
}

function maxRisk(current: RiskLevel, next: RiskLevel): RiskLevel {
  const order = { low: 1, medium: 2, high: 3 };
  return order[next] > order[current] ? next : current;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
