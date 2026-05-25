import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import type { AlertService } from "../alerts/alert-service.ts";
import type { SupplierOpsRepository } from "../storage/repository.ts";
import type { SupplierConfig } from "../suppliers/types.ts";
import { renderAdminPage } from "./admin-ui.ts";

export type ServerContext = {
  repository: SupplierOpsRepository;
  suppliers: SupplierConfig[];
  alerts: AlertService;
  runNow: (dryRun: boolean) => Promise<void>;
  startRun: (dryRun: boolean) => boolean;
  shopifyApiKey?: string;
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

  if (request.method === "POST" && url.pathname === "/api/runs") {
    const dryRun = url.searchParams.get("dryRun") === "true";
    const started = context.startRun(dryRun);

    if (wantsJson(request)) {
      sendJson(response, started ? 202 : 200, {
        ok: true,
        dryRun,
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

  if (request.method !== "GET") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const allowedPaths = new Set(["/", "/suppliers", "/runs", "/changes", "/issues", "/settings"]);
  if (!allowedPaths.has(url.pathname)) {
    sendText(response, 404, "Not found");
    return;
  }

  const [runs, changes, issues] = await Promise.all([
    context.repository.recentRuns(30),
    context.repository.recentChanges(100),
    context.repository.recentIssues(100),
  ]);

  const html = renderAdminPage({
    activePath: url.pathname,
    suppliers: context.suppliers,
    runs,
    changes,
    issues,
    alerts: context.alerts.list(),
    shopifyApiKey: context.shopifyApiKey,
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
