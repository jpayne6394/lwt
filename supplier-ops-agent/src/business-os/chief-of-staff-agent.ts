import type { LlmClient } from "../../lib/llm/index.ts";
import { combineRisk, makeBusinessAction } from "./action-factory.ts";
import { createCustomerEmailAgent } from "./agents/customer-email-agent.ts";
import { createInventoryAgent } from "./agents/inventory-agent.ts";
import { createMarketingAgent } from "./agents/marketing-agent.ts";
import { createMerchandisingAgent } from "./agents/merchandising-agent.ts";
import { createOperatorAgent } from "./agents/operator-agent.ts";
import { createResearchAgent } from "./agents/research-agent.ts";
import { createSeoProductCleanupAgent } from "./agents/seo-product-cleanup-agent.ts";
import type { SubAgent } from "./agents/shared.ts";
import type {
  AutonomyMode,
  BusinessActionLogRecord,
  BusinessAgentInput,
  BusinessAgentName,
  BusinessAgentResult,
  BusinessRecommendedAction,
  DailyCommandReport,
} from "./types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";

export type ChiefOfStaffAgent = {
  buildDailyCommandReport(): Promise<DailyCommandReport>;
};

export function createChiefOfStaffAgent(options: {
  repository: SupplierOpsRepository;
  llm: LlmClient;
  autonomyMode: AutonomyMode;
}): ChiefOfStaffAgent {
  const subAgents: SubAgent[] = [
    createInventoryAgent(),
    createMerchandisingAgent(),
    createMarketingAgent(),
    createSeoProductCleanupAgent(),
    createResearchAgent(),
    createCustomerEmailAgent(),
    createOperatorAgent(),
  ];

  return {
    async buildDailyCommandReport(): Promise<DailyCommandReport> {
      const now = new Date().toISOString();
      const [shopifyVariants, issues, productOpsOutputs, marketRadarOutputs, revenuePlays, campaignDrafts, blogDrafts] = await Promise.all([
        options.repository.listShopifyVariants(),
        options.repository.recentIssues(100),
        options.repository.recentProductOpsOutputs?.(10) ?? Promise.resolve([]),
        options.repository.recentMarketRadarOutputs?.(10) ?? Promise.resolve([]),
        options.repository.recentRevenuePlays?.(100) ?? Promise.resolve([]),
        options.repository.recentCampaignDrafts?.(50) ?? Promise.resolve([]),
        options.repository.recentBlogDrafts?.(50) ?? Promise.resolve([]),
      ]);
      const input: BusinessAgentInput = {
        now,
        autonomyMode: options.autonomyMode,
        shopifyVariants,
        issues,
        productOpsOutputs,
        marketRadarOutputs,
        revenuePlays,
        campaignDrafts,
        blogDrafts,
      };

      const agentResults = await Promise.all(subAgents.map(async (agent) => [agent.name, await agent.run(input)] as const));
      const subAgentMap = Object.fromEntries(agentResults) as Partial<Record<BusinessAgentName, BusinessAgentResult>>;
      const allActions = agentResults.flatMap(([, result]) => result.recommended_actions);
      const approvalActions = allActions.filter((action) => action.requires_approval || !action.safe_to_auto_execute);
      const chiefAction = makeBusinessAction({
        type: "REVIEW",
        title: "Review today's Business OS command report",
        reason: "Chief of Staff coordinates sub-agent recommendations and keeps Shopify changes approval-first.",
        agentName: "Chief of Staff Agent",
        target: "daily-command-report",
        autonomyMode: options.autonomyMode,
      });
      const chiefOfStaff = await buildChiefResult(options.llm, allActions, chiefAction);

      const report: DailyCommandReport = {
        id: `daily_command_${Date.now()}`,
        created_at: now,
        chief_of_staff: chiefOfStaff,
        sub_agents: subAgentMap,
        inventory_risks: actionsByAgents(allActions, ["Inventory Agent"]),
        products_to_promote: allActions.filter((action) => action.type === "PROMOTE"),
        products_to_remove_from_promotion: allActions.filter((action) => /remove|pull back|out of stock/i.test(action.title + " " + action.reason)),
        homepage_recommendations: allActions.filter((action) => /homepage|hero/i.test(action.title + " " + action.reason + " " + (action.target ?? ""))),
        email_campaign_ideas: actionsByAgents(allActions, ["Marketing Agent", "Customer/Email Agent"]).filter((action) => action.type === "WRITE"),
        seo_product_cleanup_tasks: actionsByAgents(allActions, ["SEO/Product Cleanup Agent"]),
        urgent_issues: allActions.filter((action) => action.risk_level === "high"),
        actions_requiring_owner_approval: approvalActions,
      };

      await options.repository.recordDailyCommandReport?.(report);
      await recordActions(options.repository, input, [...chiefOfStaff.recommended_actions, ...allActions]);
      return report;
    },
  };
}

async function buildChiefResult(
  llm: LlmClient,
  allActions: BusinessRecommendedAction[],
  fallbackAction: BusinessRecommendedAction,
): Promise<BusinessAgentResult> {
  if (llm.provider !== "mock") {
    return llm.decide<BusinessAgentResult>({
      agentName: "Chief of Staff Agent",
      task: "Create daily command report",
      input: { recommendedActionCount: allActions.length, actions: allActions },
    });
  }

  const actions = [fallbackAction];
  return {
    summary: `${allActions.length} recommendations are ready for owner review across inventory, merchandising, marketing, research, SEO, email, and operations.`,
    risk_level: combineRisk([...allActions, ...actions]),
    recommended_actions: actions,
    requires_approval: true,
    safe_to_auto_execute: false,
    reasoning_summary: "Chief of Staff Agent aggregates deterministic sub-agent outputs in mock mode and routes all risky work to approval.",
    rollback_plan: "Reject or roll back any queued action; no Shopify change is executed by report generation.",
  };
}

function actionsByAgents(actions: BusinessRecommendedAction[], agentNames: string[]): BusinessRecommendedAction[] {
  return actions.filter((action) => agentNames.includes(action.agent_name));
}

async function recordActions(
  repository: SupplierOpsRepository,
  input: BusinessAgentInput,
  actions: BusinessRecommendedAction[],
): Promise<void> {
  for (const action of actions) {
    const record: BusinessActionLogRecord = {
      id: `action_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      agent_name: action.agent_name,
      input_data: {
        product_count: input.shopifyVariants.length,
        issue_count: input.issues.length,
        autonomy_mode: input.autonomyMode,
      },
      recommendation: action,
      approval_status: action.approval_status,
      execution_result: null,
      rollback_information: action.rollback_plan,
    };
    await repository.recordBusinessActionLog?.(record);
  }
}
