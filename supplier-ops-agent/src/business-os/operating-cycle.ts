import { combineRisk } from "./action-factory.ts";
import type {
  AutonomyMode,
  BusinessAgentName,
  BusinessAgentResult,
  BusinessRecommendedAction,
  DailyOperatingCycle,
  RiskLevel,
} from "./types.ts";

export function buildDailyOperatingCycle(input: {
  now: string;
  autonomyMode: AutonomyMode;
  actions: BusinessRecommendedAction[];
  subAgents: Partial<Record<BusinessAgentName, BusinessAgentResult>>;
  inventoryRisks: BusinessRecommendedAction[];
  productsToPromote: BusinessRecommendedAction[];
  productsToRemoveFromPromotion: BusinessRecommendedAction[];
  urgentIssues: BusinessRecommendedAction[];
  emailCampaignIdeas: BusinessRecommendedAction[];
}): DailyOperatingCycle {
  const actions = uniqueActions(input.actions);
  const ranked = [...actions].sort((left, right) => actionScore(right) - actionScore(left));
  const ignore = ranked.filter((action) => action.type === "IGNORE");
  const active = ranked.filter((action) => action.type !== "IGNORE");
  const doToday = active.slice(0, 5);
  const review = active
    .filter((action) => isReviewAction(action))
    .slice(0, 10);
  const draft = active
    .filter((action) => isDraftAction(action))
    .slice(0, 10);
  const used = new Set([...doToday, ...review, ...draft].map((action) => action.id));
  const wait = active
    .filter((action) => !used.has(action.id))
    .slice(0, 10);
  const doNotPromote = uniqueActions([
    ...input.productsToRemoveFromPromotion,
    ...actions.filter((action) => /do not promote|pull back|remove from promotion|out of stock/i.test(`${action.title} ${action.reason}`)),
  ]);
  const revenueMove = ranked.find((action) => action.type === "PROMOTE" && !doNotPromote.some((blocked) => blocked.id === action.id)) ??
    ranked.find((action) => action.type === "WRITE") ??
    null;

  return {
    generated_at: input.now,
    mode: input.autonomyMode,
    top_priority: doToday[0] ?? null,
    revenue_move_of_the_day: revenueMove,
    business_health: buildBusinessHealth(input, actions, doNotPromote),
    lanes: {
      do_today: doToday,
      review,
      draft,
      wait,
      ignore,
    },
    agent_handoffs: buildAgentHandoffs(input.subAgents),
    do_not_promote: doNotPromote,
  };
}

function uniqueActions(actions: BusinessRecommendedAction[]): BusinessRecommendedAction[] {
  const seen = new Set<string>();
  const unique: BusinessRecommendedAction[] = [];
  for (const action of actions) {
    const key = action.id || `${action.agent_name}|${action.type}|${action.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(action);
  }
  return unique;
}

function actionScore(action: BusinessRecommendedAction): number {
  const riskScore = action.risk_level === "high" ? 45 : action.risk_level === "medium" ? 25 : 8;
  const typeScore: Record<BusinessRecommendedAction["type"], number> = {
    FIX: 34,
    REVIEW: 30,
    PROMOTE: 28,
    WRITE: 22,
    AUTOMATE: 12,
    IGNORE: -40,
  };
  const approvalScore = action.requires_approval || !action.safe_to_auto_execute ? 8 : 0;
  const inventoryBoost = /inventory|stock|supplier|price/i.test(`${action.agent_name} ${action.title} ${action.reason}`) ? 12 : 0;
  const revenueBoost = /promote|campaign|revenue|email|blog|homepage/i.test(`${action.title} ${action.reason}`) ? 8 : 0;
  return riskScore + typeScore[action.type] + approvalScore + inventoryBoost + revenueBoost;
}

function isReviewAction(action: BusinessRecommendedAction): boolean {
  if (action.risk_level === "high") return true;
  if (action.type === "FIX" || action.type === "REVIEW") return true;
  return /guardrail|blocked|vendor|claim|price|homepage|approval/i.test(`${action.title} ${action.reason}`);
}

function isDraftAction(action: BusinessRecommendedAction): boolean {
  return action.type === "WRITE" || action.approval_status === "drafted";
}

function buildBusinessHealth(
  input: {
    inventoryRisks: BusinessRecommendedAction[];
    productsToPromote: BusinessRecommendedAction[];
    urgentIssues: BusinessRecommendedAction[];
    actions: BusinessRecommendedAction[];
    emailCampaignIdeas: BusinessRecommendedAction[];
  },
  actions: BusinessRecommendedAction[],
  doNotPromote: BusinessRecommendedAction[],
): DailyOperatingCycle["business_health"] {
  const approvalCount = actions.filter((action) => action.requires_approval || !action.safe_to_auto_execute).length;
  const inventoryCount = input.inventoryRisks.length;
  const revenueCount = input.productsToPromote.length + input.emailCampaignIdeas.length;
  const status = input.urgentIssues.length > 0 || doNotPromote.length > 0 ? "attention" : inventoryCount > 0 || approvalCount > 0 ? "watch" : "healthy";
  const risk = combineRisk(actions);
  return {
    status,
    summary:
      status === "attention"
        ? `${input.urgentIssues.length + doNotPromote.length} urgent or promotion-blocking items need owner review before the store pushes harder.`
        : status === "watch"
          ? `${approvalCount} decisions are queued; ${revenueCount} revenue moves can move forward after review.`
          : "The daily operating cycle found no urgent blockers; keep monitoring revenue plays and supplier status.",
    revenue_status: revenueCount ? `${revenueCount} revenue moves ready for review` : "No revenue move selected yet",
    inventory_status: inventoryCount ? `${inventoryCount} inventory or supplier blockers` : "No inventory blockers found",
    approval_status: `${approvalCount} approval decisions in ${risk} risk mode`,
  };
}

function buildAgentHandoffs(subAgents: Partial<Record<BusinessAgentName, BusinessAgentResult>>): DailyOperatingCycle["agent_handoffs"] {
  return (Object.entries(subAgents) as Array<[BusinessAgentName, BusinessAgentResult]>)
    .filter(([, result]) => result)
    .map(([agentName, result]) => ({
      agent_name: agentName,
      focus: result.recommended_actions[0]?.title ?? result.summary,
      action_count: result.recommended_actions.length,
      next_step: nextStepForResult(result),
      risk_level: result.risk_level,
    }));
}

function nextStepForResult(result: BusinessAgentResult): string {
  const risk = result.risk_level;
  const firstAction = result.recommended_actions[0];
  if (!firstAction) return "No owner action needed today.";
  if (risk === "high") return "Review before any promotion or Shopify handoff.";
  if (firstAction.type === "WRITE") return "Draft and approve copy before sending or publishing.";
  if (firstAction.type === "PROMOTE") return "Approve the promotion plan before adding traffic.";
  if (firstAction.type === "FIX") return "Clear the blocker before promotion.";
  if (firstAction.type === "AUTOMATE") return "Turn into a checklist before configuring Shopify Flow.";
  return "Review the recommendation and keep it approval-first.";
}
