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
    runs: [],
    changes: [],
    issues: [],
    alerts: [],
    shopifyApiKey: "test-api-key",
  });

  for (const label of ["Dashboard", "Suppliers", "Runs", "Change Ledger", "Match Issues", "Settings"]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Dry run sync/);
  assert.match(html, /Run write sync/);
  assert.match(html, /action="\/api\/runs\?dryRun=true"/);
  assert.match(html, /id="sync-status"/);
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
    alerts: [],
    shopifyApiKey: "test-api-key",
  });

  assert.match(html, /InflaQuell 180 Capsule Bottle/);
  assert.match(html, /RN123/);
  assert.match(html, /Research Nutritionals/);
  assert.match(html, /InflaQuell 180 caps by Researched Nutritionals/);
  assert.match(html, /matchConfidence/);
});
