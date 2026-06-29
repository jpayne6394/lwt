import type { ContentIdea } from "./intelligenceTypes.ts";

const RESTRICTED_LANGUAGE: Array<[RegExp, string]> = [
  [/\bcures?\b/gi, "supports"],
  [/\btreat(?:s|ed|ing|ment)?\b/gi, "supports"],
  [/\bdiagnos(?:e|es|ed|ing|is)\b/gi, "assess"],
  [/\bprevent(?:s|ed|ing|ion)?\b/gi, "help maintain"],
  [/\bguarantee(?:s|d)?\b/gi, "may support"],
];

export function generateBlogBriefMarkdown(idea: ContentIdea): string {
  const title = clean(idea.suggestedTitle);
  const topic = clean(idea.topic);
  const cta = clean(idea.suggestedCta);
  const saferAngle = clean(idea.saferAngle ?? "Keep the piece educational and framed around practitioner-guided wellness support.");

  return [
    `# ${title}`,
    "",
    "## Topic Summary",
    clean(idea.sourceSummary),
    "",
    "## Why This Matters",
    `${title} is a useful educational angle for LWT customers who want clearer, safer context before choosing wellness support.`,
    "",
    "## Target Audience",
    "- Customers comparing supplement forms or wellness services.",
    "- Readers who value practitioner-guided decisions.",
    "- Existing LWT shoppers who need plain-language education before a consult.",
    "",
    "## Suggested Outline",
    "1. Open with the common question behind the topic.",
    `2. Explain what ${topic} is and why customers ask about it.`,
    "3. Compare practical selection factors in neutral language.",
    `4. Connect the topic to ${clean(idea.productTieIn)} without making outcome promises.`,
    "5. Close with a consult-first next step.",
    "",
    "## LWT-Safe Educational Angle",
    saferAngle,
    "",
    "## Product / Category Tie-Ins",
    `- ${clean(idea.productTieIn)}`,
    "- Mention products as examples of categories to discuss with the LWT team.",
    "- Avoid implying a product is right for every reader.",
    "",
    "## Consult CTA",
    cta,
    "",
    "## Internal Link Suggestions",
    `- Collection or search page for ${topic}`,
    "- Practitioner consultation or contact page",
    "- Related educational posts that explain supplement quality and selection",
    "",
    "## Compliance Risk",
    `Risk: ${idea.complianceRisk}`,
    clean(idea.complianceReason ?? "No high-risk claim language was detected in the idea."),
    "",
    "## Claim-Risk Notes",
    "- Keep claims structure/function oriented and educational.",
    "- Avoid disease-state promises, outcome guarantees, and individualized advice in the article.",
    "- Use consult language where a reader may need personal guidance.",
    "",
    "## Safer Language Suggestions",
    "- Say \"may support\" instead of making a promise.",
    "- Say \"ask the LWT team\" when personal context matters.",
    "- Say \"educational guide\" rather than positioning the article as advice for a specific condition.",
  ]
    .map(clean)
    .join("\n");
}

function clean(value: string): string {
  return RESTRICTED_LANGUAGE.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}
