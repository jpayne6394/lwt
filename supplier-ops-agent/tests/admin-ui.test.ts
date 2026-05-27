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

  for (const label of ["Command Center", "Suppliers", "Runs", "Change Ledger", "Match Issues", "Settings"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Dry run sync/);
  assert.match(html, /Run write sync/);
  assert.match(html, /action="\/api\/runs\?dryRun=true"/);
  assert.match(html, /id="sync-status"/);
  assert.match(html, /Revenue Plays/);
  assert.match(html, /<strong>5<\/strong>/);
  assert.match(html, /Pending Approvals/);
  assert.match(html, /<strong>2<\/strong>/);
  assert.match(html, /Inventory Risk/);
  assert.match(html, /Drafts Ready/);
  assert.match(html, /data-run-form/);
  assert.match(html, /fetch\(form.action/);
  assert.match(html, /app-bridge/);
  assert.match(html, /<meta name="shopify-api-key" content="test-api-key">/);
  assert.match(html, /class="app-tabs"/);
  assert.doesNotMatch(html, /class="sidebar"/);
  assert.match(html, /CEO Daily Brief/);
  assert.match(html, /Refresh CEO brief/);
  assert.match(html, /Decision Queue/);
  assert.match(html, /Today&#39;s Business Brief/);
  assert.match(html, /Agent Workrooms/);
  assert.match(html, /Customer\/Email/);
  assert.match(html, /Agent Companion/);
  assert.match(html, /data-companion-open/);
  assert.match(html, /Shopify shortcuts/);
  assert.match(html, /Open Products/);
  assert.match(html, /Open Orders/);
  assert.match(html, /Open Marketing/);
  assert.match(html, /Open Flow/);
  assert.match(html, /data-shopify-admin-link/);
  assert.match(html, /data-shopify-path="\/products"/);
  assert.match(html, /Mock mode: review only/);
  assert.doesNotMatch(html, /Agent task launcher/);
  assert.doesNotMatch(html, /AI Provider/);
  assert.doesNotMatch(html, /Autonomy Mode/);
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

test("dashboard renders a simple daily business cockpit with prioritized next steps", () => {
  const html = renderAdminPage({
    activePath: "/",
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
          lowStock: 1,
          outOfStock: 47,
          needsDataCleanup: 0,
          badPage: 0,
          doNotPromote: 22,
          reviewRequired: 172,
          errors: 0,
        },
        productsToPromote: [
          {
            supplierId: "emerson-ecologics",
            supplierName: "Emerson Ecologics",
            productId: "gid://shopify/Product/22",
            variantId: "gid://shopify/ProductVariant/22",
            title: "Magnesium Glycinate",
            vendor: "Living Well Today",
            sku: "MAG-GLY",
            promotionStatus: "PROMOTE_READY",
            matchConfidence: 0.98,
            flags: [],
            reasons: ["Ready for promotion and stocked."],
            price: 34,
            stockStatus: "in_stock",
          },
        ],
        productsToAvoid: [],
        promotionTasks: [
          {
            actionType: "PROMOTE",
            title: "Promote Magnesium Glycinate",
            detail: "Product Ops marked this product promote-ready after supplier and catalog checks.",
            promotionStatus: "PROMOTE_READY",
            productId: "gid://shopify/Product/22",
            variantId: "gid://shopify/ProductVariant/22",
            sku: "MAG-GLY",
          },
        ],
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
    campaignDrafts: [
      {
        id: "campaign_1",
        title: "Sleep support email brief",
        status: "DRAFT_READY",
        revenuePlayId: "play_1",
        subjectLines: ["Build a calmer nighttime routine"],
        previewText: "A review-first email brief for stocked sleep support products.",
        bodyText: "Draft only.",
        productTitles: ["Magnesium Glycinate"],
        segmentIdea: "Customers interested in sleep support.",
        shopifyEmailAdminPath: "/marketing",
        createdAt: "2026-05-25T18:00:00.000Z",
        updatedAt: "2026-05-25T18:00:00.000Z",
      },
    ],
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
    aiProvider: "mock",
    autonomyMode: "approval",
  });

  for (const label of ["CEO Daily Brief", "Decision Queue", "Today&#39;s Business Brief", "Promotion Suggestions", "Inventory Risks", "Agent Workrooms"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Mock mode: review only/);
  assert.match(html, /Pending Approvals/);
  assert.match(html, /Revenue Plays/);
  assert.match(html, /Drafts ready/);
  assert.match(html, /Agent Companion/);
  assert.match(html, /Customer\/Email/);
  assert.match(html, /Write a magnesium sleep guide/);
  assert.match(html, /Promote Magnesium Glycinate/);
  assert.match(html, /Product Ops marked this product promote-ready/);
  assert.match(html, /Pending Approvals[\s\S]*Supplier match uncertain or guardrail blocked for Magnesium/);
  assert.match(html, /Inventory Risks[\s\S]*Supplier match uncertain or guardrail blocked for Magnesium/);
  assert.match(html, /Promotion Suggestions[\s\S]*Promote Magnesium Glycinate/);
  assert.match(html, /Sleep support email brief/);
  assert.match(html, /Open Products/);
  assert.match(html, /Open Marketing/);
  assert.match(html, /Open Flow/);
  assert.doesNotMatch(html, /Agent command center/);
  assert.doesNotMatch(html, /What this agent does/);
  assert.doesNotMatch(html, /Agent Logs/);
  assert.doesNotMatch(html, /AI Provider/);
  assert.doesNotMatch(html, /Autonomy Mode/);
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

test("admin UI renders the mock-mode cockpit without developer labels", () => {
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
    aiProvider: "hybrid",
    autonomyMode: "approval",
    aiStatus: {
      provider: "hybrid",
      dataScope: "internal",
      maxInputChars: 24000,
      localBrain: {
        status: "connected",
        mode: "local",
        model: "qwen3:8b",
        message: "Local brain connected.",
      },
    },
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
        operating_cycle: {
          generated_at: "2026-05-26T12:00:00.000Z",
          mode: "approval",
          top_priority: {
            id: "cycle_action_1",
            type: "FIX",
            title: "Review inventory risk for Vitamin D3 + K2",
            reason: "Low stock should pause promotion.",
            agent_name: "Inventory Agent",
            approval_status: "suggested",
            risk_level: "medium",
            requires_approval: true,
            safe_to_auto_execute: false,
            rollback_plan: "Reject the recommendation.",
          },
          revenue_move_of_the_day: {
            id: "cycle_action_2",
            type: "PROMOTE",
            title: "Promote Magnesium Glycinate",
            reason: "Product is stocked and ready for review.",
            agent_name: "Merchandising Agent",
            approval_status: "suggested",
            risk_level: "low",
            requires_approval: true,
            safe_to_auto_execute: false,
            rollback_plan: "Reject the recommendation.",
          },
          business_health: {
            status: "watch",
            summary: "One inventory risk needs review, but a revenue move is ready.",
            revenue_status: "1 revenue move ready",
            inventory_status: "1 inventory blocker",
            approval_status: "2 approval decisions",
          },
          lanes: {
            do_today: [
              {
                id: "cycle_action_1",
                type: "FIX",
                title: "Review inventory risk for Vitamin D3 + K2",
                reason: "Low stock should pause promotion.",
                agent_name: "Inventory Agent",
                approval_status: "suggested",
                risk_level: "medium",
                requires_approval: true,
                safe_to_auto_execute: false,
                rollback_plan: "Reject the recommendation.",
              },
            ],
            review: [],
            draft: [
              {
                id: "cycle_action_3",
                type: "WRITE",
                title: "Draft sleep support campaign",
                reason: "Campaign copy should be prepared for review.",
                agent_name: "Marketing Agent",
                approval_status: "suggested",
                risk_level: "medium",
                requires_approval: true,
                safe_to_auto_execute: false,
                rollback_plan: "Discard the draft.",
              },
            ],
            wait: [],
            ignore: [],
          },
          agent_handoffs: [
            {
              agent_name: "Marketing Agent",
              focus: "Draft sleep support campaign",
              action_count: 1,
              next_step: "Draft and approve copy.",
              risk_level: "medium",
            },
          ],
          do_not_promote: [],
        },
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
    actionQueueItems: [
      {
        id: "queue_1",
        dedupe_key: "market-radar|PROMOTE|magnesium-glycinate|draft-a-shopify-email-campaign",
        source_workflow: "market-radar",
        source_agent: "BI",
        action_type: "PROMOTE",
        priority: "High",
        area: "Market Signals",
        title: "Draft a Shopify Email campaign",
        description: "Campaign draft only.",
        reason: "Market signals and stocked products support a review-first email.",
        related_product_handle: "magnesium-glycinate",
        related_product_title: "Magnesium Glycinate",
        related_vendor: "Living Well Today",
        related_collection: "Sleep Support",
        related_campaign: "Sleep support email",
        risk_level: "Low",
        status: "new",
        owner: "LWT",
        due_date: null,
        confidence_score: 0.84,
        source_payload: { signal_count: 4 },
        source_reference: "market_radar_1",
        occurrence_count: 1,
        created_at: "2026-05-26T12:00:00.000Z",
        updated_at: "2026-05-26T12:00:00.000Z",
        last_seen_at: "2026-05-26T12:00:00.000Z",
      },
    ],
    actionQueueEvents: [
      {
        id: "event_1",
        action_id: "queue_1",
        event_type: "approved",
        actor: "Justin",
        note: "Approved for draft only.",
        created_at: "2026-05-26T12:05:00.000Z",
        snapshot: {},
      },
    ],
  });

  for (const label of [
    "CEO Daily Brief",
    "Hybrid: local brain ready",
    "Local Brain",
    "connected",
    "qwen3:8b",
    "Decision Queue",
    "Pending Approvals",
    "Recent Activity",
    "Inventory Risks",
    "Promotion Suggestions",
    "Shopify Action Queue",
    "Refresh CEO brief",
    "Agent Workrooms",
    "Agent Companion",
    "Daily Operating Cycle",
    "Do Today",
    "Draft",
    "Wait",
    "Ignore",
    "Revenue move of the day",
    "Review inventory risk for Vitamin D3 \\+ K2",
    "Draft sleep support campaign",
    "Draft a Shopify Email campaign",
    "High",
    "Market Signals",
    "Approved for draft only",
    "data-action-queue-form",
    "action=\"/api/action-queue/approve\"",
    "action=\"/api/action-queue/edit\"",
    "action=\"/api/action-queue/reject\"",
    "data-shopify-action-link",
    "data-companion-open",
  ]) {
    assert.match(html, new RegExp(label));
  }

  assert.doesNotMatch(html, /AI Provider/);
  assert.doesNotMatch(html, /Autonomy Mode/);
  assert.doesNotMatch(html, /Chief of Staff/);
  assert.doesNotMatch(html, /Agent Logs/);
  assert.doesNotMatch(html, /tool calls/);
});
