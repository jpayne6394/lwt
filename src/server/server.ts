import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import type { AlertService } from "../alerts/alert-service.ts";
import { buildIntelligenceExport, type IntelligenceExportFormat, type IntelligenceExportKind } from "../agents/intelligenceExportService.ts";
import type { IntelligenceService } from "../agents/intelligenceService.ts";
import type { IntelligenceRunType } from "../agents/intelligenceTypes.ts";
import type { AgentMemoryService } from "../memory/memory-service.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { SupplierConfig } from "../suppliers/types.ts";
import { renderAdminPage } from "./admin-ui.ts";

export type ServerContext = {
  repository: SupplierOpsRepository;
  suppliers: SupplierConfig[];
  alerts: AlertService;
  runNow: (dryRun: boolean) => Promise<void>;
  shopifyApiKey?: string;
  memoryService?: AgentMemoryService;
  intelligenceService?: IntelligenceService;
  internalDashboardPassword?: string;
  internalDashboardAuthRequired?: boolean;
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
  if (url.pathname === "/intelligence" || url.pathname.startsWith("/api/intelligence")) {
    const authStatus = intelligenceAuthStatus(request, context);
    if (authStatus === "setup_required") {
      sendText(response, 503, "INTERNAL_DASHBOARD_PASSWORD is required before the Intelligence Center can be used in this environment.");
      return;
    }
    if (authStatus === "unauthorized") {
      response.writeHead(401, {
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="LWT Intelligence"',
      });
      response.end("Authentication required");
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname.startsWith("/api/intelligence")) {
    await handleIntelligenceApi(context, request, response, url);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const dryRun = url.searchParams.get("dryRun") === "true";
    await context.runNow(dryRun);
    response.writeHead(303, { Location: "/runs" });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/memory/search") {
    if (!context.memoryService) {
      sendJson(response, 503, { error: "Agent memory service is unavailable" });
      return;
    }
    const query = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const result = await context.memoryService.searchMemory({ query, limit, agentName: "api" });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/memory/documents") {
    if (!context.memoryService) {
      sendJson(response, 503, { error: "Agent memory service is unavailable" });
      return;
    }
    try {
      const input = await readJsonBody(request, 512_000);
      const document = await context.memoryService.saveDocument(input as Parameters<AgentMemoryService["saveDocument"]>[0]);
      sendJson(response, 201, { document });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid memory document" });
    }
    return;
  }

  if (request.method !== "GET") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const allowedPaths = new Set(["/", "/suppliers", "/runs", "/changes", "/issues", "/intelligence", "/memory", "/settings"]);
  if (!allowedPaths.has(url.pathname)) {
    sendText(response, 404, "Not found");
    return;
  }

  const [runs, changes, issues, memoryStatus, memoryDocuments, intelligence] = await Promise.all([
    context.repository.recentRuns(30),
    context.repository.recentChanges(100),
    context.repository.recentIssues(100),
    context.repository.memoryStatus(),
    url.pathname === "/memory" ? context.repository.recentMemoryDocuments({ limit: 20 }).catch(() => []) : Promise.resolve([]),
    url.pathname === "/intelligence" && context.intelligenceService ? context.intelligenceService.getDashboard() : Promise.resolve(undefined),
  ]);

  const html = renderAdminPage({
    activePath: url.pathname,
    suppliers: context.suppliers,
    runs,
    changes,
    issues,
    alerts: context.alerts.list(),
    shopifyApiKey: context.shopifyApiKey,
    memoryStatus,
    memoryDocuments,
    intelligence,
    intelligenceAuthWarning: url.pathname === "/intelligence" && !context.internalDashboardPassword
      ? "Internal dashboard auth is not configured. Set INTERNAL_DASHBOARD_PASSWORD before production."
      : undefined,
  });

  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

async function handleIntelligenceApi(
  context: ServerContext,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  if (!context.intelligenceService) {
    sendJson(response, 503, { error: "LWT Intelligence Center is unavailable" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/intelligence/summary") {
    sendJson(response, 200, await context.intelligenceService.getSummary());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/inventory") {
    sendJson(response, 200, await context.intelligenceService.getInventory());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/product-strategy") {
    sendJson(response, 200, await context.intelligenceService.getProductStrategy());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/content-radar") {
    sendJson(response, 200, await context.intelligenceService.getContentRadar());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/shopper-behavior") {
    sendJson(response, 200, await context.intelligenceService.getShopperBehavior());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/shopper-behavior/sources") {
    sendJson(response, 200, await context.intelligenceService.getShopperBehaviorSources());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/shopper-behavior/recommendations") {
    sendJson(response, 200, await context.intelligenceService.getShopperBehaviorRecommendations());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/shopper-behavior/import") {
    try {
      sendJson(response, 200, { imports: await context.intelligenceService.importShopperBehaviorReports() });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Shopper behavior import failed" });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/shopper-behavior/import/preview") {
    try {
      const input = await readJsonBody(request, 2_000_000);
      sendJson(response, 200, await context.intelligenceService.previewShopperBehaviorImport(input as Parameters<typeof context.intelligenceService.previewShopperBehaviorImport>[0]));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Shopper behavior import preview failed" });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/shopper-behavior/import/confirm") {
    try {
      const input = await readJsonBody(request, 2_000_000);
      sendJson(response, 200, await context.intelligenceService.confirmShopperBehaviorImport(input as Parameters<typeof context.intelligenceService.confirmShopperBehaviorImport>[0]));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Shopper behavior import confirm failed" });
    }
    return;
  }
  const exportRoute = parseExportRoute(url);
  if (request.method === "GET" && exportRoute) {
    try {
      if (exportRoute.kind === "weekly-briefs") {
        await context.intelligenceService.getWeeklyBrief();
      }
      const result = await buildIntelligenceExport(context.repository, exportRoute.kind, exportRoute.format);
      sendDownload(response, 200, result.body, result.contentType, result.filename);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Export failed" });
    }
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/actions") {
    sendJson(response, 200, await context.intelligenceService.listActionItems({
      source: url.searchParams.get("source") as Parameters<typeof context.intelligenceService.listActionItems>[0]["source"] | undefined,
      priority: url.searchParams.get("priority") as Parameters<typeof context.intelligenceService.listActionItems>[0]["priority"] | undefined,
      status: url.searchParams.get("status") as Parameters<typeof context.intelligenceService.listActionItems>[0]["status"] | undefined,
    }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/actions") {
    try {
      const input = await readJsonBody(request, 256_000);
      sendJson(response, 201, { action: await context.intelligenceService.createActionItem(input as Parameters<typeof context.intelligenceService.createActionItem>[0]) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Action item create failed" });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/actions/from-recommendation") {
    try {
      const input = await readJsonBody(request, 256_000);
      sendJson(response, 201, { action: await context.intelligenceService.createActionFromRecommendation(input as Parameters<typeof context.intelligenceService.createActionFromRecommendation>[0]) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Action item create failed" });
    }
    return;
  }
  const actionRoute = parseActionRoute(url.pathname);
  if (actionRoute) {
    if (request.method === "PATCH") {
      try {
        const input = await readJsonBody(request, 128_000);
        sendJson(response, 200, { action: await context.intelligenceService.updateActionItem(actionRoute.id, input as Parameters<typeof context.intelligenceService.updateActionItem>[1]) });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Action item update failed" });
      }
      return;
    }
    if (request.method === "POST" && actionRoute.action === "notes") {
      try {
        const input = await readJsonBody(request, 128_000) as { body?: string };
        sendJson(response, 201, { note: await context.intelligenceService.addActionNote(actionRoute.id, input.body ?? "") });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Action note create failed" });
      }
      return;
    }
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/weekly-brief") {
    sendJson(response, 200, await context.intelligenceService.getWeeklyBrief());
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/intelligence/weekly-brief/generate") {
    sendJson(response, 200, await context.intelligenceService.generateWeeklyBrief());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/sources") {
    sendJson(response, 200, await context.intelligenceService.getSources());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/intelligence/source-settings") {
    const dashboard = await context.intelligenceService.getDashboard();
    sendJson(response, 200, dashboard.sourceSettings);
    return;
  }

  const ideaRoute = parseContentIdeaRoute(url.pathname);
  if (ideaRoute) {
    if (request.method === "GET" && !ideaRoute.action) {
      const idea = await context.intelligenceService.getContentIdea(ideaRoute.id);
      if (!idea) {
        sendJson(response, 404, { error: "Content idea not found" });
        return;
      }
      sendJson(response, 200, { idea });
      return;
    }

    if (request.method === "POST" && ideaRoute.action === "approve") {
      try {
        const idea = await context.intelligenceService.updateContentIdeaStatus(ideaRoute.id, "approved");
        sendJson(response, 200, { idea });
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : "Content idea not found" });
      }
      return;
    }

    if (request.method === "POST" && ideaRoute.action === "reject") {
      try {
        const idea = await context.intelligenceService.updateContentIdeaStatus(ideaRoute.id, "rejected");
        sendJson(response, 200, { idea });
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : "Content idea not found" });
      }
      return;
    }

    if (request.method === "POST" && ideaRoute.action === "blog-brief") {
      try {
        sendJson(response, 200, await context.intelligenceService.generateBlogBrief(ideaRoute.id));
      } catch (error) {
        sendJson(response, 404, { error: error instanceof Error ? error.message : "Content idea not found" });
      }
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/intelligence/run/")) {
    const runType = parseRunType(url.pathname.replace("/api/intelligence/run/", ""));
    if (!runType) {
      sendJson(response, 404, { error: "Unknown intelligence run type" });
      return;
    }
    try {
      const result = await context.intelligenceService.run(runType);
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : "Run failed" });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function parseContentIdeaRoute(pathname: string): { id: string; action?: string } | null {
  const match = /^\/api\/intelligence\/content-ideas\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}

function parseActionRoute(pathname: string): { id: string; action?: string } | null {
  const match = /^\/api\/intelligence\/actions\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
}

function parseExportRoute(url: URL): { kind: IntelligenceExportKind; format: IntelligenceExportFormat } | null {
  const match = /^\/api\/intelligence\/exports\/([^/]+)$/.exec(url.pathname);
  if (!match) {
    return null;
  }
  const kind = decodeURIComponent(match[1]);
  if (kind !== "actions" && kind !== "weekly-briefs" && kind !== "shopper-recommendations") {
    return null;
  }
  const requestedFormat = url.searchParams.get("format") ?? (kind === "weekly-briefs" ? "markdown" : "json");
  const allowed = kind === "weekly-briefs" ? ["json", "markdown"] : ["json", "csv"];
  const format = allowed.includes(requestedFormat) ? requestedFormat as IntelligenceExportFormat : allowed[0] as IntelligenceExportFormat;
  return { kind, format };
}

function parseRunType(value: string): IntelligenceRunType | null {
  if (value === "inventory") return "inventory";
  if (value === "content-radar") return "content_radar";
  if (value === "daily-bi") return "daily_bi";
  if (value === "product-strategy") return "product_strategy";
  if (value === "shopper-behavior") return "shopper_behavior";
  return null;
}

function intelligenceAuthStatus(request: IncomingMessage, context: ServerContext): "authorized" | "unauthorized" | "setup_required" {
  const password = context.internalDashboardPassword;
  if (!password) {
    return context.internalDashboardAuthRequired ? "setup_required" : "authorized";
  }
  return isAuthorized(request, password) ? "authorized" : "unauthorized";
}

function isAuthorized(request: IncomingMessage, password: string): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    return false;
  }
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : decoded;
  return suppliedPassword === password;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

function sendDownload(response: ServerResponse, status: number, body: string, contentType: string, filename: string): void {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new Error("Request body is too large");
    }
    chunks.push(buffer);
  }

  if (!chunks.length) {
    throw new Error("Request body is required");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
