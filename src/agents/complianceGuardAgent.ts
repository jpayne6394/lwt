import type { ComplianceRisk } from "./intelligenceTypes.ts";

export type ComplianceAssessment = {
  risk: ComplianceRisk;
  reason: string;
  saferAngle: string;
  suggestedCta: string;
};

const HIGH_RISK_PATTERNS = [
  /\bcure\b/i,
  /\btreat\b/i,
  /\bprevent\b/i,
  /\bdiagnose\b/i,
  /\bguaranteed?\b/i,
  /\bbefore\s*\/?\s*after\b/i,
  /\bmedical advice\b/i,
];

const DISEASE_TERMS = [
  "cancer",
  "diabetes",
  "arthritis",
  "depression",
  "anxiety",
  "autoimmune",
  "lyme",
  "covid",
  "heart disease",
  "hypertension",
];

export function assessContentCompliance(text: string): ComplianceAssessment {
  const hits = HIGH_RISK_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source.replace(/\\b/g, ""));
  const diseaseHits = DISEASE_TERMS.filter((term) => text.toLowerCase().includes(term));

  if (hits.length || diseaseHits.length) {
    return {
      risk: hits.length > 1 || diseaseHits.length ? "High" : "Medium",
      reason: buildReason(hits, diseaseHits),
      saferAngle: "Frame this as general wellness education and practitioner-guided support, not a supplement promise.",
      suggestedCta: "Ask what fits your wellness plan",
    };
  }

  return {
    risk: "Low",
    reason: "No high-risk disease, cure, treatment, prevention, diagnosis, guarantee, or medical-advice language detected.",
    saferAngle: "Keep the topic educational and focused on wellness support, quality, and practitioner guidance.",
    suggestedCta: "Browse wellness support products",
  };
}

function buildReason(patternHits: string[], diseaseHits: string[]): string {
  const reasons: string[] = [];
  if (patternHits.length) {
    reasons.push(`Risky claim language found: ${patternHits.join(", ")}`);
  }
  if (diseaseHits.length) {
    reasons.push(`Disease terms need careful handling: ${diseaseHits.join(", ")}`);
  }
  return reasons.join(". ");
}
