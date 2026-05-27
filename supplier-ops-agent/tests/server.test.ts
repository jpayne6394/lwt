import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { AlertService } from "../src/alerts/alert-service.ts";
import { startServer } from "../src/server/server.ts";
import { MemoryRepository } from "../src/storage/memory-repository.ts";

test("server forces manual write run requests into dry-run when apply changes is disabled", async () => {
  let requestedDryRun: boolean | undefined;
  const server = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: (dryRun) => {
        requestedDryRun = dryRun;
        return true;
      },
      shopifyApiKey: "test-key",
      applyChangesEnabled: false,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runs`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const body = (await response.json()) as { dryRun: boolean; applyChangesEnabled: boolean };

    assert.equal(response.status, 202);
    assert.equal(requestedDryRun, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.applyChangesEnabled, false);
  } finally {
    server.close();
  }
});

test("server allows manual write run requests when apply changes is enabled", async () => {
  let requestedDryRun: boolean | undefined;
  const server = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: (dryRun) => {
        requestedDryRun = dryRun;
        return true;
      },
      shopifyApiKey: "test-key",
      applyChangesEnabled: true,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runs`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    const body = (await response.json()) as { dryRun: boolean; applyChangesEnabled: boolean };

    assert.equal(response.status, 202);
    assert.equal(requestedDryRun, false);
    assert.equal(body.dryRun, false);
    assert.equal(body.applyChangesEnabled, true);
  } finally {
    server.close();
  }
});

test("server exposes safe Market Radar refresh and draft endpoints", async () => {
  const repository = new MemoryRepository({
    shopifyVariants: [
      {
        productId: "gid://shopify/Product/1",
        variantId: "gid://shopify/ProductVariant/1",
        inventoryItemId: "gid://shopify/InventoryItem/1",
        locationId: "gid://shopify/Location/1",
        handle: "magnesium-glycinate",
        title: "Magnesium Glycinate",
        vendor: "Living Well Today",
        sku: "MAG-GLY",
        barcode: "",
        price: 34,
        compareAtPrice: null,
        cost: 16,
        status: "active",
        productType: "Supplement",
        productForm: "Capsule",
        tags: ["magnesium", "sleep"],
        imageUrls: [],
        descriptionHtml: "<p>Magnesium support.</p>",
        inventoryQuantity: 8,
        publishedAt: "2026-05-25T10:00:00.000Z",
      },
    ],
  });

  const server = startServer(
    {
      repository,
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: () => true,
      refreshMarketRadar: async () => {
        const variants = await repository.listShopifyVariants();
        const output = {
          id: "radar_runtime",
          runId: "radar_runtime",
          createdAt: "2026-05-25T12:00:00.000Z",
          agent: "bi" as const,
          mode: "dry_run" as const,
          startedAt: "2026-05-25T12:00:00.000Z",
          finishedAt: "2026-05-25T12:00:00.000Z",
          summary: {
            signalsReviewed: 0,
            competitorPricesReviewed: 0,
            revenuePlays: 1,
            highConfidencePlays: 0,
            lightClaimWarnings: 0,
          },
          salesWindows: [],
          explanations: [],
          sourceConnections: [],
          revenuePlays: [
            {
              id: "play_runtime",
              title: `Feature ${variants[0].title}`,
              explanation: "Use stocked products to create a safe draft.",
              actionType: "BLOG_DRAFT" as const,
              targetAgent: "blog" as const,
              source: "Market Radar",
              evidence: [],
              matchedProducts: [],
              inventoryContext: "In stock",
              pricingContext: "No competitor gap yet.",
              confidence: "medium" as const,
              effort: "medium" as const,
              status: "SUGGESTED" as const,
              claimWarnings: [],
              createdAt: "2026-05-25T12:00:00.000Z",
              updatedAt: "2026-05-25T12:00:00.000Z",
            },
          ],
          errors: [],
        };
        await repository.recordMarketRadarOutput?.(output);
        return output;
      },
      createBlogDraft: async (input) => {
        const draft = {
          id: "blog_draft_1",
          title: input.title,
          profileId: input.profileId,
          profileLabel: "Educational guide",
          status: "DRAFT_READY" as const,
          authorName: "Living Well Today",
          bodyHtml: `<h2>${input.title}</h2>`,
          summary: "Template draft.",
          tags: ["wellness"],
          handle: "magnesium-guide",
          relatedProducts: [],
          claimWarnings: [],
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        };
        await repository.recordBlogDraft?.(draft);
        return draft;
      },
      createCampaignDraft: async () => {
        const draft = {
          id: "campaign_draft_1",
          title: "Magnesium campaign",
          status: "DRAFT_READY" as const,
          subjectLines: ["Magnesium support"],
          previewText: "Support your evening routine.",
          bodyText: "Feature Magnesium Glycinate.",
          productTitles: ["Magnesium Glycinate"],
          segmentIdea: "Customers interested in sleep support.",
          shopifyEmailAdminPath: "/admin/marketing",
          createdAt: "2026-05-25T12:00:00.000Z",
          updatedAt: "2026-05-25T12:00:00.000Z",
        };
        await repository.recordCampaignDraft?.(draft);
        return draft;
      },
      shopifyApiKey: "test-key",
      applyChangesEnabled: false,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const radarResponse = await fetch(`${baseUrl}/api/market-radar`, {
      method: "POST",
      headers: { accept: "application/json" },
    });
    assert.equal(radarResponse.status, 202);
    assert.equal((await radarResponse.json() as { output: { summary: { revenuePlays: number } } }).output.summary.revenuePlays, 1);

    const blogResponse = await fetch(`${baseUrl}/api/blog-drafts`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        profileId: "educational-guide",
        title: "Magnesium Guide",
        roughThoughts: "Evening support.",
      }),
    });
    assert.equal(blogResponse.status, 201);
    assert.equal((await blogResponse.json() as { draft: { status: string } }).draft.status, "DRAFT_READY");

    const campaignResponse = await fetch(`${baseUrl}/api/campaign-drafts`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ title: "Magnesium campaign" }),
    });
    assert.equal(campaignResponse.status, 201);
    assert.equal((await campaignResponse.json() as { draft: { status: string } }).draft.status, "DRAFT_READY");
  } finally {
    server.close();
  }
});

test("server exposes manual action queue creation, approval logging, and safe exports", async () => {
  const repository = new MemoryRepository();
  const server = startServer(
    {
      repository,
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: () => true,
      shopifyApiKey: "test-key",
      applyChangesEnabled: false,
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const createResponse = await fetch(`${baseUrl}/api/action-queue`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        action_type: "WRITE",
        priority: "High",
        area: "Campaign",
        title: "Draft replenishment email",
        description: "Create draft copy only.",
        reason: "Customers may need reminder education.",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { item: { id: string; status: string; title: string } };
    assert.equal(created.item.status, "new");

    const approveResponse = await fetch(`${baseUrl}/api/action-queue/approve`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        id: created.item.id,
        actor: "Justin",
        note: "Approved for draft only.",
      }),
    });
    assert.equal(approveResponse.status, 200);
    assert.equal((await approveResponse.json() as { item: { status: string } }).item.status, "approved");

    const events = await repository.recentActionQueueEvents?.(10);
    assert.ok(events?.some((event) => event.event_type === "approved" && event.note === "Approved for draft only."));

    const csvResponse = await fetch(`${baseUrl}/api/action-queue/export?format=csv`);
    const csv = await csvResponse.text();
    assert.equal(csvResponse.status, 200);
    assert.match(csv, /Action Type,Priority,Area,Title,Status/);
    assert.match(csv, /WRITE,High,Campaign,Draft replenishment email,approved/);
    assert.doesNotMatch(csv, /send email/i);
  } finally {
    server.close();
  }
});

test("server renders the daily cockpit on the root path unless an agent workbench is requested", async () => {
  const server = startServer(
    {
      repository: new MemoryRepository(),
      suppliers: [],
      alerts: new AlertService(),
      runNow: async () => {},
      startRun: () => true,
      shopifyApiKey: "test-key",
      applyChangesEnabled: false,
      aiProvider: "mock",
      autonomyMode: "approval",
    },
    { port: 0, host: "127.0.0.1" },
  );

  await onceListening(server);
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const homeResponse = await fetch(`${baseUrl}/`);
    const homeHtml = await homeResponse.text();
    assert.equal(homeResponse.status, 200);
    assert.match(homeHtml, /Today&#39;s cockpit/);
    assert.match(homeHtml, /Mock mode: review only/);
    assert.doesNotMatch(homeHtml, /Agent command center/);

    const workbenchResponse = await fetch(`${baseUrl}/?agent=blog`);
    const workbenchHtml = await workbenchResponse.text();
    assert.equal(workbenchResponse.status, 200);
    assert.match(workbenchHtml, /Blog Template Builder/);
  } finally {
    server.close();
  }
});

function onceListening(server: ReturnType<typeof startServer>): Promise<void> {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    server.once("listening", resolve);
  });
}
