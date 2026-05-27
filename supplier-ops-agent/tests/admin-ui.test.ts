import assert from "node:assert/strict";
import test from "node:test";

import { renderAdminPage } from "../src/server/admin-ui.ts";

test("admin UI renders the required Shopify app sections and run-now control", () => {
  const html = renderAdminPage({
    activePath: "/",
    suppliers: [
      {
        id: "desbio",
        name: "DesBio",
        mode: "website",
        brands: ["DesBio"],
        notes: "Direct supplier portal.",
      },
    ],
    runs: [
      {
        id: "run_1",
        dryRun: true,
        status: "completed_with_issues",
        startedAt: "2026-05-25T04:00:00.000Z",
        completedAt: "2026-05-25T04:05:00.000Z",
        supplierCount: 4,
        changeCount: 206,
        issueCount: 98,
      },
    ],
    changes: [],
    issues: [],
    productOpsOutputs: [
      {
        id: "product_ops_1",
        runId: "run_1",
        createdAt: "2026-05-25T04:05:00.000Z",
        agent: "product_ops",
        runType: "full_product_ops_check",
        mode: "dry_run",
        startedAt: "2026-05-25T04:00:00.000Z",
        finishedAt: "2026-05-25T04:05:00.000Z",
        summary: {
          productsChecked: 12,
          variantsChecked: 10,
          suppliersChecked: 4,
          promoteReady: 5,
          lowStock: 1,
          outOfStock: 1,
          needsDataCleanup: 2,
          badPage: 1,
          doNotPromote: 0,
          reviewRequired: 2,
          errors: 0,
        },
        productsToPromote: [],
        productsToAvoid: [],
        promotionTasks: [],
        cleanupTasks: [],
        reviewTasks: [],
        errors: [],
        plannedChanges: [],
        blockedIssues: [],
      },
    ],
    marketRadarOutputs: [],
    revenuePlays: [],
    sourceConnections: [],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  });

  for (const label of ["Dashboard", "Suppliers", "Runs", "Change Ledger", "Match Issues", "Settings"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Dry run sync/);
  assert.match(html, /Run write sync/);
  assert.match(html, /action="\/api\/runs\?dryRun=true"/);
  assert.match(html, /id="sync-status"/);
  assert.match(html, /Product Ops/);
  assert.match(html, /Promote Ready/);
  assert.match(html, /<strong>5<\/strong>/);
  assert.match(html, /Review Required/);
  assert.match(html, /<strong>2<\/strong>/);
  assert.match(html, /<dt>Changes<\/dt><dd>206<\/dd>/);
  assert.match(html, /Latest Issues/);
  assert.match(html, /<strong>98<\/strong>/);
  assert.match(html, /data-run-form/);
  assert.match(html, /fetch\(form.action/);
  assert.match(html, /app-bridge/);
  assert.match(html, /<meta name="shopify-api-key" content="test-api-key">/);
  assert.match(html, /class="app-tabs"/);
  assert.doesNotMatch(html, /class="sidebar"/);
  assert.match(html, /Start Here/);
  assert.match(html, /Run the safe check/);
  assert.match(html, /Choose an agent/);
  assert.match(html, /Review drafts and handoffs/);
  assert.match(html, /Shopify shortcuts/);
  assert.match(html, /Open Products/);
  assert.match(html, /Open Orders/);
  assert.match(html, /Open Blog/);
  assert.match(html, /Open Marketing/);
  assert.match(html, /Open Flow/);
  assert.match(html, /data-shopify-admin-link/);
  assert.match(html, /data-shopify-path="\/products"/);
  assert.match(html, /Agent task launcher/);
  assert.match(html, /Safe supplier sync/);
  assert.match(html, /Refresh BI radar/);
  assert.match(html, /Review Product Ops/);
  assert.match(html, /Open Blog Publisher/);
  assert.match(html, /Create campaign brief/);
  assert.match(html, /Open Flow templates/);
  assert.match(html, /action="\/api\/market-radar"/);
  assert.match(html, /action="\/api\/campaign-drafts"/);
});

test("admin UI shows supplier and Shopify context for blocked issues", () => {
  const html = renderAdminPage({
    activePath: "/issues",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [
      {
        id: "issue_1",
        runId: "run_1",
        kind: "match_uncertain",
        reason: "Supplier product resembles an existing Shopify product but not confidently enough to automate",
        createdAt: "2026-05-25T04:00:00.000Z",
        supplierProduct: {
          supplierId: "research-nutritionals",
          supplierName: "Research Nutritionals",
          brand: "Research Nutritionals",
          sku: "RN123",
          title: "InflaQuell 180 Capsule Bottle",
          stockStatus: "in_stock",
          msrp: 75,
          productUrl: "https://example.com/supplier-product",
          capturedAt: "2026-05-25T04:00:00.000Z",
        },
        shopifyVariant: {
          productId: "gid://shopify/Product/1",
          variantId: "gid://shopify/ProductVariant/1",
          inventoryItemId: "gid://shopify/InventoryItem/1",
          locationId: "gid://shopify/Location/1",
          handle: "inflaquell-180-caps-by-researched-nutritionals",
          title: "InflaQuell 180 caps by Researched Nutritionals",
          vendor: "Researched Nutritionals",
          sku: "InflaQuell",
          barcode: "",
          price: 75,
          compareAtPrice: null,
          cost: null,
          status: "active",
        },
        data: { matchConfidence: 0.76 },
      },
    ],
    productOpsOutputs: [],
    marketRadarOutputs: [],
    revenuePlays: [],
    sourceConnections: [],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  });

  assert.match(html, /InflaQuell 180 Capsule Bottle/);
  assert.match(html, /RN123/);
  assert.match(html, /Research Nutritionals/);
  assert.match(html, /InflaQuell 180 caps by Researched Nutritionals/);
  assert.match(html, /matchConfidence/);
});

test("dashboard renders a command center with sub-agent selection and prioritized actions", () => {
  const html = renderAdminPage({
    activePath: "/",
    activeAgent: "product_ops",
    suppliers: [
      {
        id: "emerson-ecologics",
        name: "Emerson Ecologics",
        mode: "website",
        brands: ["Emerson"],
        notes: "Main supplier.",
      },
    ],
    runs: [
      {
        id: "run_2",
        dryRun: true,
        status: "completed_with_issues",
        startedAt: "2026-05-25T17:20:00.000Z",
        completedAt: "2026-05-25T17:22:00.000Z",
        supplierCount: 4,
        changeCount: 221,
        issueCount: 84,
      },
    ],
    changes: [],
    issues: [
      {
        id: "issue_1",
        runId: "run_2",
        kind: "match_uncertain",
        reason: "Supplier product resembles an existing Shopify product but not confidently enough to automate",
        createdAt: "2026-05-25T17:21:00.000Z",
      },
      {
        id: "issue_2",
        runId: "run_2",
        kind: "price_guardrail",
        reason: "Price change exceeds 25% guardrail",
        createdAt: "2026-05-25T17:21:00.000Z",
      },
    ],
    productOpsOutputs: [
      {
        id: "product_ops_2",
        runId: "run_2",
        createdAt: "2026-05-25T17:22:00.000Z",
        agent: "product_ops",
        runType: "full_product_ops_check",
        mode: "dry_run",
        startedAt: "2026-05-25T17:20:00.000Z",
        finishedAt: "2026-05-25T17:22:00.000Z",
        summary: {
          productsChecked: 241,
          variantsChecked: 4538,
          suppliersChecked: 4,
          promoteReady: 0,
          lowStock: 0,
          outOfStock: 47,
          needsDataCleanup: 0,
          badPage: 0,
          doNotPromote: 22,
          reviewRequired: 172,
          errors: 0,
        },
        productsToPromote: [],
        productsToAvoid: [],
        promotionTasks: [],
        cleanupTasks: [],
        reviewTasks: [
          {
            actionType: "REVIEW",
            title: "Supplier match uncertain or guardrail blocked for Magnesium.",
            detail: "Supplier match is not confident enough for promotion.",
            promotionStatus: "REVIEW_REQUIRED",
          },
        ],
        errors: [],
        plannedChanges: [],
        blockedIssues: [],
      },
    ],
    marketRadarOutputs: [
      {
        id: "radar_1",
        runId: "radar_1",
        createdAt: "2026-05-25T18:00:00.000Z",
        agent: "bi",
        mode: "dry_run",
        startedAt: "2026-05-25T18:00:00.000Z",
        finishedAt: "2026-05-25T18:00:00.000Z",
        summary: {
          signalsReviewed: 2,
          competitorPricesReviewed: 1,
          revenuePlays: 2,
          highConfidencePlays: 1,
          lightClaimWarnings: 1,
        },
        salesWindows: [
          { window: "today", label: "Today", orderCount: 1, revenue: 120, unitsSold: 3 },
          { window: "7d", label: "7 days", orderCount: 4, revenue: 320, unitsSold: 8 },
        ],
        explanations: [
          {
            topic: "magnesium sleep",
            title: "Magnesium sleep chatter is rising",
            explanation: "Market chatter plus stocked products creates a revenue opportunity.",
            evidence: [{ sourceId: "open-web", sourceLabel: "Open Web", title: "Trend", url: "https://example.com", capturedAt: "2026-05-25T18:00:00.000Z" }],
            matchedProducts: [],
            confidence: "high",
          },
        ],
        sourceConnections: [
          {
            id: "open-web",
            label: "Open Web / RSS",
            status: "connected",
            accessMode: "safe_open_web",
            notes: "Public URLs only.",
            configured: true,
          },
        ],
        revenuePlays: [
          {
            id: "play_1",
            title: "Write a magnesium sleep guide",
            explanation: "Use trend evidence to create revenue from a stocked product.",
            actionType: "BLOG_DRAFT",
            targetAgent: "blog",
            source: "Market Radar",
            evidence: [],
            matchedProducts: [],
            inventoryContext: "In stock",
            pricingContext: "Competitor price gap detected",
            confidence: "high",
            effort: "medium",
            status: "SUGGESTED",
            claimWarnings: ["Avoid cure/treat language."],
            createdAt: "2026-05-25T18:00:00.000Z",
            updatedAt: "2026-05-25T18:00:00.000Z",
          },
        ],
        errors: [],
      },
    ],
    revenuePlays: [],
    sourceConnections: [],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  });

  for (const label of ["Store Health", "BI Analyst", "Inventory Ops", "Product Ops", "Campaign Planner", "Blog Publisher"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Agent command center/);
  assert.match(html, /What this agent does/);
  assert.match(html, /Run from here/);
  assert.match(html, /Shopify handoff/);
  assert.match(html, /Action Queue/);
  assert.match(html, /Market Radar/);
  assert.match(html, /Revenue Plays/);
  assert.match(html, /Write a magnesium sleep guide/);
  assert.match(html, /Review uncertain matches/);
  assert.match(html, /68|172|84/);
  assert.match(html, /Product Ops is selected/);
});

test("admin UI renders blog, campaign, flow, and source workbench controls", () => {
  const baseModel = {
    activePath: "/",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    productOpsOutputs: [],
    marketRadarOutputs: [],
    revenuePlays: [],
    sourceConnections: [
      {
        id: "truth-social",
        label: "Truth Social",
        status: "manual_only" as const,
        accessMode: "manual_review" as const,
        notes: "Manual review until sanctioned access exists.",
        configured: false,
      },
    ],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  };

  const blogHtml = renderAdminPage({ ...baseModel, activeAgent: "blog" });
  assert.match(blogHtml, /Blog Template Builder/);
  assert.match(blogHtml, /Educational guide/);
  assert.match(blogHtml, /Create template draft/);

  const campaignHtml = renderAdminPage({ ...baseModel, activeAgent: "campaign" });
  assert.match(campaignHtml, /Campaign Draft Suite/);
  assert.match(campaignHtml, /Shopify Email handoff/);

  const flowHtml = renderAdminPage({ ...baseModel, activeAgent: "flow" });
  assert.match(flowHtml, /Flow Launchpad/);
  assert.match(flowHtml, /Open Shopify Flow app/);
  assert.match(flowHtml, /Flow Email Templates/);
  assert.match(flowHtml, /First purchase wellness welcome/);
  assert.match(flowHtml, /Customer post-purchase education/);
  assert.match(flowHtml, /data-flow-admin-link/);
  assert.match(flowHtml, /target="_top"/);

  const sourcesHtml = renderAdminPage({ ...baseModel, activePath: "/sources" });
  assert.match(sourcesHtml, /Source Connections/);
  assert.match(sourcesHtml, /Truth Social/);
  assert.match(sourcesHtml, /manual_only/);
});

test("supplier page explains how to use supplier coverage instead of only showing a table", () => {
  const html = renderAdminPage({
    activePath: "/suppliers",
    suppliers: [
      {
        id: "emerson-ecologics",
        name: "Emerson Ecologics",
        mode: "website",
        brands: ["Emerson"],
        notes: "Main supplier.",
      },
    ],
    runs: [],
    changes: [],
    issues: [],
    productOpsOutputs: [],
    marketRadarOutputs: [],
    revenuePlays: [],
    sourceConnections: [],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  });

  assert.match(html, /Supplier Command Center/);
  assert.match(html, /What you do here/);
  assert.match(html, /Check whether each supplier is connected/);
  assert.match(html, /Open Shopify products/);
  assert.match(html, /Start with dry-run sync/);
});

test("admin UI renders the Business Operating Agent command center", () => {
  const html = renderAdminPage({
    activePath: "/command",
    suppliers: [],
    runs: [],
    changes: [],
    issues: [],
    productOpsOutputs: [],
    marketRadarOutputs: [],
    revenuePlays: [],
    sourceConnections: [],
    blogDrafts: [],
    campaignDrafts: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
    aiProvider: "mock",
    autonomyMode: "approval",
    dailyCommandReports: [
      {
        id: "daily_command_1",
        created_at: "2026-05-26T12:00:00.000Z",
        chief_of_staff: {
          summary: "Review promotion and inventory work before Shopify changes.",
          risk_level: "medium",
          recommended_actions: [],
          requires_approval: true,
          safe_to_auto_execute: false,
          reasoning_summary: "Mock mode combines operational signals into review-first work.",
          rollback_plan: "Reject or roll back drafted actions before execution.",
        },
        sub_agents: {},
        inventory_risks: [],
        products_to_promote: [],
        products_to_remove_from_promotion: [],
        homepage_recommendations: [],
        email_campaign_ideas: [],
        seo_product_cleanup_tasks: [],
        urgent_issues: [],
        actions_requiring_owner_approval: [],
      },
    ],
    businessActionLogs: [
      {
        id: "action_log_1",
        timestamp: "2026-05-26T12:00:00.000Z",
        agent_name: "Marketing Agent",
        input_data: { source: "test" },
        recommendation: {
          id: "action_1",
          type: "WRITE",
          title: "Draft a Shopify Email campaign",
          reason: "Promote stocked products after owner review.",
          agent_name: "Marketing Agent",
          approval_status: "suggested",
          risk_level: "medium",
          requires_approval: true,
          safe_to_auto_execute: false,
          rollback_plan: "Discard the draft.",
        },
        approval_status: "suggested",
        execution_result: null,
        rollback_information: "Discard the draft.",
      },
    ],
  });

  for (const label of [
    "Business OS",
    "Daily Command Center",
    "Pending Approvals",
    "Agent Logs",
    "Inventory Risks",
    "Promo Recommendations",
    "Draft Campaigns",
    "Shopify Action Queue",
    "Build daily command report",
    "AI Provider",
    "Autonomy Mode",
    "Draft a Shopify Email campaign",
  ]) {
    assert.match(html, new RegExp(label));
  }
});
