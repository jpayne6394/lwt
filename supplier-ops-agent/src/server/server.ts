import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import type { AlertService } from "../alerts/alert-service.ts";
import type { BuildCampaignDraftInput, CampaignDraftRecord } from "../campaigns/types.ts";
import type { BuildBlogDraftInput, BlogDraftRecord } from "../content/types.ts";
import type { DailyCommandReport } from "../business-os/types.ts";
import type { MarketRadarRunOutput, SourceConnectionCard } from "../market-radar/types.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { SupplierConfig } from "../suppliers/types.ts";
import type { ActiveAgent } from "./admin-ui.ts";
import { renderAdminPage } from "./admin-ui.ts";

export type ServerContext = {
  repository: SupplierOpsRepository;
  suppliers: SupplierConfig[];
  alerts: AlertService;
  runNow: (dryRun: boolean) => Promise<void>;
  startRun: (dryRun: boolean) => boolean;
  sourceConnections?: SourceConnectionCard[];
  refreshMarketRadar?: () => Promise<MarketRadarRunOutput>;
  createBlogDraft?: (input: BuildBlogDraftInput) => Promise<BlogDraftRecord>;
  createCampaignDraft?: (input: BuildCampaignDraftInput) => Promise<CampaignDraftRecord>;
  createShopifyDraftArticle?: (draftId: string) => Promise<{ id: string; handle: string; title: string }>;
  buildDailyCommandReport?: () => Promise<DailyCommandReport>;
  shopifyApiKey?: string;
  applyChangesEnabled: boolean;
  aiProvider?: string;
  autonomyMode?: string;
};

export type StartServerOptions = {
  port: number;
  host?: string;
};

export function startServer(context: ServerContext, options: StartServerOptions) {
  const server = createServer((request, response) => {
    void handleRequest(context, request, response);
  });

  server.listen(options.port, options.host ?? "0.0.0.0");
  return server;
}

async function handleRequest(context: ServerContext, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/market-radar") {
    if (!context.refreshMarketRadar) {
      sendJson(response, 501, { ok: false, error: "Market Radar is not configured" });
      return;
    }

    try {
      const output = await context.refreshMarketRadar();
      sendJson(response, 202, { ok: true, output, redirect: "/?agent=bi" });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Market Radar failed" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/command/daily-report") {
    if (!context.buildDailyCommandReport) {
      sendJson(response, 501, { ok: false, error: "Business Operating Agent is not configured" });
      return;
    }

    try {
      const report = await context.buildDailyCommandReport();
      if (wantsJson(request)) {
        sendJson(response, 201, { ok: true, report, redirect: "/command" });
      } else {
        response.writeHead(303, { Location: "/command" });
        response.end();
      }
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Command report failed" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const requestedDryRun = url.searchParams.get("dryRun") === "true";
    const dryRun = requestedDryRun || !context.applyChangesEnabled;
    const started = context.startRun(dryRun);

    if (wantsJson(request)) {
      sendJson(response, started ? 202 : 200, {
        ok: true,
        dryRun,
        applyChangesEnabled: context.applyChangesEnabled,
        started,
        alreadyRunning: !started,
        redirect: "/runs",
      });
      return;
    }

    response.writeHead(303, { Location: "/runs" });
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/blog-drafts") {
    if (!context.createBlogDraft) {
      sendJson(response, 501, { ok: false, error: "Blog drafting is not configured" });
      return;
    }

    try {
      const body = await readBody(request);
      const draft = await context.createBlogDraft({
        profileId: String(body.profileId ?? "educational-guide"),
        title: String(body.title ?? "Untitled wellness draft"),
        roughThoughts: String(body.roughThoughts ?? ""),
        authorName: String(body.authorName ?? "Living Well Today"),
      });
      if (wantsJson(request)) {
        sendJson(response, 201, { ok: true, draft, redirect: "/?agent=blog" });
      } else {
        response.writeHead(303, { Location: "/?agent=blog" });
        response.end();
      }
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Blog draft failed" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/blog-drafts/shopify") {
    if (!context.createShopifyDraftArticle) {
      sendJson(response, 501, { ok: false, error: "Shopify draft article creation is not configured" });
      return;
    }

    try {
      const body = await readBody(request);
      const article = await context.createShopifyDraftArticle(String(body.draftId ?? ""));
      sendJson(response, 201, { ok: true, article, redirect: "/?agent=blog" });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Shopify draft article failed" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/campaign-drafts") {
    if (!context.createCampaignDraft) {
      sendJson(response, 501, { ok: false, error: "Campaign drafting is not configured" });
      return;
    }

    try {
      const body = await readBody(request);
      const draft = await context.createCampaignDraft({
        title: body.title ? String(body.title) : undefined,
      });
      if (wantsJson(request)) {
        sendJson(response, 201, { ok: true, draft, redirect: "/?agent=campaign" });
      } else {
        response.writeHead(303, { Location: "/?agent=campaign" });
        response.end();
      }
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Campaign draft failed" });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/revenue-plays/status") {
    const body = await readBody(request);
    const id = String(body.id ?? "");
    const status = String(body.status ?? "");
    if (!id || !["SUGGESTED", "DRAFT_READY", "APPROVED", "CREATED_IN_SHOPIFY", "DISMISSED"].includes(status)) {
      sendJson(response, 400, { ok: false, error: "Invalid revenue play status update" });
      return;
    }
    const play = await context.repository.updateRevenuePlayStatus?.(id, status as any);
    sendJson(response, play ? 200 : 404, { ok: Boolean(play), play });
    return;
  }

  if (request.method !== "GET") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const allowedPaths = new Set(["/", "/command", "/suppliers", "/runs", "/changes", "/issues", "/sources", "/settings"]);
  if (!allowedPaths.has(url.pathname)) {
    sendText(response, 404, "Not found");
    return;
  }

  const [
    runs,
    changes,
    issues,
    productOpsOutputs,
    marketRadarOutputs,
    revenuePlays,
    blogDrafts,
    campaignDrafts,
    dailyCommandReports,
    businessActionLogs,
  ] = await Promise.all([
    context.repository.recentRuns(30),
    context.repository.recentChanges(100),
    context.repository.recentIssues(100),
    context.repository.recentProductOpsOutputs?.(10) ?? Promise.resolve([]),
    context.repository.recentMarketRadarOutputs?.(10) ?? Promise.resolve([]),
    context.repository.recentRevenuePlays?.(100) ?? Promise.resolve([]),
    context.repository.recentBlogDrafts?.(50) ?? Promise.resolve([]),
    context.repository.recentCampaignDrafts?.(50) ?? Promise.resolve([]),
    context.repository.recentDailyCommandReports?.(10) ?? Promise.resolve([]),
    context.repository.recentBusinessActionLogs?.(100) ?? Promise.resolve([]),
  ]);

  const html = renderAdminPage({
    activePath: url.pathname,
    activeAgent: parseActiveAgent(url.searchParams.get("agent")),
    suppliers: context.suppliers,
    runs,
    changes,
    issues,
    productOpsOutputs,
    marketRadarOutputs,
    revenuePlays,
    sourceConnections: context.sourceConnections ?? marketRadarOutputs[0]?.sourceConnections ?? [],
    blogDrafts,
    campaignDrafts,
    alerts: context.alerts.list(),
    shopifyApiKey: context.shopifyApiKey,
    applyChangesEnabled: context.applyChangesEnabled,
    aiProvider: context.aiProvider,
    autonomyMode: context.autonomyMode,
    dailyCommandReports,
    businessActionLogs,
  });

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function wantsJson(request: IncomingMessage): boolean {
  const accept = String(request.headers.accept ?? "");
  const requestedWith = String(request.headers["x-requested-with"] ?? "");
  return accept.includes("application/json") || requestedWith === "supplier-ops-fetch";
}

function parseActiveAgent(value: string | null): ActiveAgent {
  if (value === "bi" || value === "inventory" || value === "product_ops" || value === "campaign" || value === "blog" || value === "flow") {
    return value;
  }
  return "product_ops";
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  const contentType = String(request.headers["content-type"] ?? "");
  if (contentType.includes("application/json")) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}
