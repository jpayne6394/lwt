export type RiskLevel = "low" | "medium" | "high";

export type ApprovalStatus = "suggested" | "drafted" | "approved" | "rejected" | "executed" | "failed" | "rolled_back";

export type BusinessActionType = "PROMOTE" | "FIX" | "WRITE" | "AUTOMATE" | "REVIEW" | "IGNORE";

export type AutonomyMode = "approval" | "supervised" | "autonomous";

export type AiProvider = "mock" | "openai";

export type BusinessAgentName =
  | "Chief of Staff Agent"
  | "Inventory Agent"
  | "Merchandising Agent"
  | "Marketing Agent"
  | "SEO/Product Cleanup Agent"
  | "Research Agent"
  | "Customer/Email Agent"
  | "Operator Agent";

export type RecommendedToolCall = {
  tool_name: string;
  arguments: Record<string, unknown>;
};

export type BusinessRecommendedAction = {
  id: string;
  type: BusinessActionType;
  title: string;
  reason: string;
  agent_name: string;
  target?: string;
  tool_call?: RecommendedToolCall;
  approval_status: ApprovalStatus;
  risk_level: RiskLevel;
  requires_approval: boolean;
  safe_to_auto_execute: boolean;
  rollback_plan: string;
  guardrail_notes?: string[];
};

export type BusinessAgentResult = {
  summary: string;
  risk_level: RiskLevel;
  recommended_actions: BusinessRecommendedAction[];
  requires_approval: boolean;
  safe_to_auto_execute: boolean;
  reasoning_summary: string;
  rollback_plan: string;
};

export type DailyCommandReport = {
  id: string;
  created_at: string;
  chief_of_staff: BusinessAgentResult;
  sub_agents: Partial<Record<BusinessAgentName, BusinessAgentResult>>;
  inventory_risks: BusinessRecommendedAction[];
  products_to_promote: BusinessRecommendedAction[];
  products_to_remove_from_promotion: BusinessRecommendedAction[];
  homepage_recommendations: BusinessRecommendedAction[];
  email_campaign_ideas: BusinessRecommendedAction[];
  seo_product_cleanup_tasks: BusinessRecommendedAction[];
  urgent_issues: BusinessRecommendedAction[];
  actions_requiring_owner_approval: BusinessRecommendedAction[];
};

export type BusinessActionLogRecord = {
  id: string;
  timestamp: string;
  agent_name: string;
  input_data: Record<string, unknown>;
  recommendation: BusinessRecommendedAction;
  approval_status: ApprovalStatus;
  execution_result: string | null;
  rollback_information: string;
};

export type BusinessAgentInput = {
  now: string;
  autonomyMode: AutonomyMode;
  shopifyVariants: Array<{
    productId: string;
    variantId: string;
    inventoryItemId?: string;
    locationId?: string;
    handle: string;
    title: string;
    vendor: string;
    sku?: string;
    price?: number;
    status?: string;
    productType?: string;
    productForm?: string;
    tags?: string[];
    imageUrls?: string[];
    descriptionHtml?: string;
    inventoryQuantity?: number | null;
    publishedAt?: string | null;
  }>;
  issues: Array<{ kind: string; reason: string; data?: Record<string, unknown> }>;
  productOpsOutputs: unknown[];
  marketRadarOutputs: unknown[];
  revenuePlays: unknown[];
  campaignDrafts: unknown[];
  blogDrafts: unknown[];
};
