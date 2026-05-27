import assert from "node:assert/strict";
import test from "node:test";

import { createChiefOfStaffAgent } from "../src/business-os/chief-of-staff-agent.ts";
import { applyBusinessGuardrails } from "../src/business-os/guardrails.ts";
import { createShopifyToolbox } from "../src/business-os/shopify-tools.ts";
import type { BusinessAgentResult, BusinessRecommendedAction } from "../src/business-os/types.ts";
import { createLlmClient } from "../lib/llm/index.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";
import type { ShopifyVariant } from "../src/domain/types.ts";

const sampleVariant: ShopifyVariant = {
  productId: "gid://shopify/Product/1",
  variantId: "gid://shopify/ProductVariant/1",
  inventoryItemId: "gid://shopify/InventoryItem/1",
  locationId: "gid://shopify/Location/1",
  handle: "magnesium-glycinate",
  title: "Magnesium Glycinate",
  vendor: "Living Well Today",
  sku: "MAG-120",
  barcode: "123456789012",
  price: 34,
  compareAtPrice: null,
  cost: 14,
  status: "active",
  productType: "Supplement",
  productForm: "Capsule",
  tags: ["sleep support"],
  imageUrls: ["https://example.com/magnesium.jpg"],
  descriptionHtml: "<p>Daily magnesium support.</p>",
  inventoryQuantity: 18,
  publishedAt: "2026-01-01T00:00:00.000Z",
};

test("mock LLM provider returns structured placeholder decisions without paid API usage", async () => {
  const client = createLlmClient({ provider: "mock", autonomyMode: "approval" });

  const decision = await client.decide<BusinessAgentResult>({
    agentName: "Inventory Agent",
    task: "Review inventory risk",
    input: { productsChecked: 1 },
  });

  assert.equal(typeof decision.summary, "string");
  assert.match(decision.risk_level, /low|medium|high/);
  assert.ok(Array.isArray(decision.recommended_actions));
  assert.equal(decision.requires_approval, true);
  assert.equal(decision.safe_to_auto_execute, false);
  assert.equal(typeof decision.reasoning_summary, "string");
  assert.equal(typeof decision.rollback_plan, "string");
});

test("Chief of Staff builds a daily command report from structured sub-agent outputs", async () => {
  const repository = new MemoryRepository({ shopifyVariants: [sampleVariant] });
  const agent = createChiefOfStaffAgent({
    repository,
    llm: createLlmClient({ provider: "mock", autonomyMode: "approval" }),
    autonomyMode: "approval",
  });

  const report = await agent.buildDailyCommandReport();

  assert.equal(report.chief_of_staff.requires_approval, true);
  assert.ok(report.id.startsWith("daily_command_"));
  assert.ok(report.created_at);

  for (const agentName of [
    "Inventory Agent",
    "Merchandising Agent",
    "Marketing Agent",
    "SEO/Product Cleanup Agent",
    "Research Agent",
    "Customer/Email Agent",
    "Operator Agent",
  ] as const) {
    assert.ok(report.sub_agents[agentName], `${agentName} is included`);
    assertAgentResultShape(report.sub_agents[agentName]);
  }

  assert.ok(Array.isArray(report.inventory_risks));
  assert.ok(Array.isArray(report.products_to_promote));
  assert.ok(Array.isArray(report.products_to_remove_from_promotion));
  assert.ok(Array.isArray(report.homepage_recommendations));
  assert.ok(Array.isArray(report.email_campaign_ideas));
  assert.ok(Array.isArray(report.seo_product_cleanup_tasks));
  assert.ok(Array.isArray(report.urgent_issues));
  assert.ok(Array.isArray(report.actions_requiring_owner_approval));
  assert.ok(report.actions_requiring_owner_approval.length > 0);

  const logs = await repository.recentBusinessActionLogs?.(50);
  assert.ok(logs);
  assert.ok(logs.length >= report.actions_requiring_owner_approval.length);
  assert.ok(logs.every((log) => log.timestamp && log.agent_name && log.recommendation && log.approval_status));
  assert.ok(logs.every((log) => typeof log.rollback_information === "string"));
});

test("guardrails force sensitive medical, vendor, price, email, and homepage actions into approval review", () => {
  const riskyActions: BusinessRecommendedAction[] = [
    action("WRITE", "Do an anxiety email", "Send customer email about anxiety cures", "Customer/Email Agent"),
    action("PROMOTE", "Promote Thorne product", "Vendor sensitive product", "Merchandising Agent", "Thorne Basic Nutrients"),
    action("FIX", "Change price", "Raise price from 30 to 45", "Operator Agent", "price"),
    action("AUTOMATE", "Homepage swap", "Change homepage hero", "Operator Agent", "homepage"),
  ];

  for (const riskyAction of riskyActions) {
    const guarded = applyBusinessGuardrails(riskyAction, { autonomyMode: "approval" });
    assert.equal(guarded.requires_approval, true);
    assert.equal(guarded.safe_to_auto_execute, false);
    assert.match(guarded.approval_status, /suggested|drafted/);
  }
});

test("Shopify toolbox reads data, drafts safely, and refuses product update execution until approved", async () => {
  const repository = new MemoryRepository({ shopifyVariants: [sampleVariant] });
  const toolbox = createShopifyToolbox({ repository, autonomyMode: "approval" });

  const products = await toolbox.readProducts();
  assert.equal(products.length, 1);

  const draft = await toolbox.draftProductUpdate({
    productId: sampleVariant.productId,
    variantId: sampleVariant.variantId,
    title: "Improve product copy",
    changes: { title: "Magnesium Glycinate - Practitioner Pick" },
    reason: "Better merchandising copy for approval.",
  });
  assert.equal(draft.approval_status, "drafted");
  assert.equal(draft.execution_result, null);

  const failed = await toolbox.applyApprovedProductUpdate(draft);
  assert.equal(failed.approval_status, "failed");
  assert.match(String(failed.execution_result), /approval/i);

  const logs = await repository.recentBusinessActionLogs?.(10);
  assert.ok(logs?.some((log) => log.recommendation.title === "Improve product copy"));
});

function assertAgentResultShape(result: BusinessAgentResult): void {
  assert.equal(typeof result.summary, "string");
  assert.match(result.risk_level, /low|medium|high/);
  assert.ok(Array.isArray(result.recommended_actions));
  assert.equal(typeof result.requires_approval, "boolean");
  assert.equal(typeof result.safe_to_auto_execute, "boolean");
  assert.equal(typeof result.reasoning_summary, "string");
  assert.equal(typeof result.rollback_plan, "string");
}

function action(
  type: BusinessRecommendedAction["type"],
  title: string,
  reason: string,
  agentName: string,
  target = title,
): BusinessRecommendedAction {
  return {
    id: `action_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    type,
    title,
    reason,
    target,
    agent_name: agentName,
    approval_status: "suggested",
    risk_level: "low",
    requires_approval: false,
    safe_to_auto_execute: true,
    rollback_plan: "Restore the previous reviewed draft.",
  };
}
