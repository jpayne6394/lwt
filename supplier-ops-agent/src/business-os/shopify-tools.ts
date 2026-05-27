import type { ShopifyVariant } from "../domain/types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import { applyBusinessGuardrails } from "./guardrails.ts";
import type { ApprovalStatus, AutonomyMode, BusinessActionLogRecord, BusinessRecommendedAction } from "./types.ts";

export type ShopifyToolbox = {
  readProducts(): Promise<ShopifyVariant[]>;
  readCollections(): Promise<Array<{ id: string; title: string; handle: string }>>;
  readProductInventoryStatus(): Promise<Array<{ variantId: string; title: string; inventoryQuantity: number | null }>>;
  draftProductUpdate(input: DraftProductUpdateInput): Promise<BusinessActionLogRecord>;
  draftHomepagePromotionChange(input: DraftHomepagePromotionChangeInput): Promise<BusinessActionLogRecord>;
  applyApprovedProductUpdate(actionLog: BusinessActionLogRecord): Promise<BusinessActionLogRecord>;
};

export type DraftProductUpdateInput = {
  productId: string;
  variantId: string;
  title: string;
  changes: Record<string, unknown>;
  reason: string;
};

export type DraftHomepagePromotionChangeInput = {
  title: string;
  handle: string;
  reason: string;
};

export function createShopifyToolbox(options: { repository: SupplierOpsRepository; autonomyMode: AutonomyMode }): ShopifyToolbox {
  return {
    readProducts: () => options.repository.listShopifyVariants(),
    async readCollections() {
      return [];
    },
    async readProductInventoryStatus() {
      const variants = await options.repository.listShopifyVariants();
      return variants.map((variant) => ({
        variantId: variant.variantId,
        title: variant.title,
        inventoryQuantity: variant.inventoryQuantity ?? null,
      }));
    },
    async draftProductUpdate(input: DraftProductUpdateInput) {
      const action = applyBusinessGuardrails(
        {
          id: `shopify_draft_product_update_${Date.now()}`,
          type: "FIX",
          title: input.title,
          reason: input.reason,
          agent_name: "Operator Agent",
          target: input.variantId,
          tool_call: {
            tool_name: "draft_product_update",
            arguments: {
              productId: input.productId,
              variantId: input.variantId,
              changes: input.changes,
            },
          },
          approval_status: "drafted",
          risk_level: "medium",
          requires_approval: true,
          safe_to_auto_execute: false,
          rollback_plan: "Discard the draft product update; no Shopify product data was changed.",
        },
        { autonomyMode: options.autonomyMode },
      );
      return recordAction(options.repository, action, null);
    },
    async draftHomepagePromotionChange(input: DraftHomepagePromotionChangeInput) {
      const action = applyBusinessGuardrails(
        {
          id: `shopify_draft_homepage_${Date.now()}`,
          type: "PROMOTE",
          title: input.title,
          reason: input.reason,
          agent_name: "Operator Agent",
          target: input.handle,
          tool_call: {
            tool_name: "draft_homepage_promotion_change",
            arguments: {
              handle: input.handle,
            },
          },
          approval_status: "drafted",
          risk_level: "medium",
          requires_approval: true,
          safe_to_auto_execute: false,
          rollback_plan: "Discard the homepage promotion draft; no theme or Online Store content was changed.",
        },
        { autonomyMode: options.autonomyMode },
      );
      return recordAction(options.repository, action, null);
    },
    async applyApprovedProductUpdate(actionLog: BusinessActionLogRecord) {
      if (actionLog.approval_status !== "approved") {
        const failed = {
          ...actionLog,
          id: `action_log_${Date.now()}_failed`,
          timestamp: new Date().toISOString(),
          approval_status: "failed" as ApprovalStatus,
          execution_result: "Product update blocked because owner approval is required before Shopify execution.",
        };
        await options.repository.recordBusinessActionLog?.(failed);
        return failed;
      }

      const executed = {
        ...actionLog,
        id: `action_log_${Date.now()}_executed`,
        timestamp: new Date().toISOString(),
        approval_status: "executed" as ApprovalStatus,
        execution_result: "Approved product update validated. Direct Shopify mutation remains disabled until write tools are explicitly enabled.",
      };
      await options.repository.recordBusinessActionLog?.(executed);
      return executed;
    },
  };
}

async function recordAction(
  repository: SupplierOpsRepository,
  recommendation: BusinessRecommendedAction,
  executionResult: string | null,
): Promise<BusinessActionLogRecord> {
  const record: BusinessActionLogRecord = {
    id: `action_log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    agent_name: recommendation.agent_name,
    input_data: recommendation.tool_call?.arguments ?? {},
    recommendation,
    approval_status: recommendation.approval_status,
    execution_result: executionResult,
    rollback_information: recommendation.rollback_plan,
  };
  await repository.recordBusinessActionLog?.(record);
  return record;
}
