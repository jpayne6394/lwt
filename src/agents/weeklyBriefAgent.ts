import type { ActionItem, ActionQueueResult, IntelligenceDashboard } from "./intelligenceTypes.ts";

export function generateWeeklyBriefMarkdown(input: { dashboard: IntelligenceDashboard; actionQueue: ActionQueueResult; generatedAt?: string }): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const { dashboard, actionQueue } = input;
  const topInventoryRisks = [
    ...dashboard.inventory.outOfStock,
    ...dashboard.inventory.lowStock,
    ...dashboard.inventory.highVelocityLowStock,
    ...dashboard.inventory.staleStock,
  ].slice(0, 5);
  const topActions = nextActions(actionQueue.items);

  return [
    "# LWT Weekly Operator Brief",
    "",
    `Date generated: ${generatedAt}`,
    "",
    "## Top Inventory Risks",
    linesOrFallback(
      topInventoryRisks.map((risk) => `- ${risk.title}: ${risk.reason}`),
      "- No inventory risks are currently available. Run Inventory Scan before relying on this section.",
    ),
    "",
    "## Top Shopper Behavior Signals",
    linesOrFallback(
      [
        ...dashboard.shopperBehavior.searchSignals.noResultSearches.slice(0, 3).map((term) => `- ${term.term}: ${term.noResultsCount ?? 0} no-result searches`),
        ...dashboard.shopperBehavior.frictionSignals.slice(0, 2).map((signal) => `- ${signal.productTitle}: ${signal.reason}`),
      ],
      "- No shopper behavior signals yet. Import aggregate reports first.",
    ),
    "",
    "## Top Product Strategy Recommendations",
    linesOrFallback(
      dashboard.productStrategy.suggestedPushes.slice(0, 5).map((item) => `- ${item}`),
      "- No product strategy recommendations yet.",
    ),
    "",
    "## Top Content Radar / Blog Opportunities",
    linesOrFallback(
      [
        ...dashboard.contentRadar.ideas.slice(0, 3).map((idea) => `- ${idea.suggestedTitle}`),
        ...dashboard.shopperBehavior.contentOpportunities.slice(0, 3).map((item) => `- ${item.title}`),
      ],
      "- No content or blog opportunities yet.",
    ),
    "",
    "## Action Queue Summary",
    `- Open: ${actionQueue.summary.openActions}`,
    `- Critical: ${actionQueue.summary.criticalActions}`,
    `- High priority: ${actionQueue.summary.highPriorityActions}`,
    `- Done this week: ${actionQueue.summary.doneThisWeek}`,
    `- Rejected: ${actionQueue.summary.rejectedActions}`,
    "",
    "## Next Recommended Actions",
    linesOrFallback(
      topActions.map((item) => `- [${item.status}] ${item.title} - ${item.suggestedAction}`),
      "- Create action items from the highest-value recommendations, then plan ownership for the week.",
    ),
    "",
    "## Notes",
    "- Aggregate shopper behavior only. No user-level behavior, customer profiles, or raw browsing history were used.",
    "- This brief is exported as Markdown only. It does not email, publish, change prices, or create purchase orders.",
  ].join("\n");
}

function nextActions(items: ActionItem[]): ActionItem[] {
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return items
    .filter((item) => item.status !== "done" && item.status !== "rejected")
    .sort((left, right) => rank[left.priority] - rank[right.priority] || left.createdAt.localeCompare(right.createdAt))
    .slice(0, 7);
}

function linesOrFallback(lines: string[], fallback: string): string {
  return lines.length ? lines.join("\n") : fallback;
}
