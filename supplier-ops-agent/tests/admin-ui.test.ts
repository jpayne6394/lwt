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
    alerts: [],
    shopifyApiKey: "test-api-key",
    applyChangesEnabled: false,
  });

  for (const label of ["Store Health", "BI Analyst", "Inventory Ops", "Product Ops", "Campaign Planner", "Blog Publisher"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Action Queue/);
  assert.match(html, /Review uncertain matches/);
  assert.match(html, /68|172|84/);
  assert.match(html, /Product Ops is selected/);
});
