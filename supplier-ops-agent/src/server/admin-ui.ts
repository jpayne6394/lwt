import type { AlertMessage } from "../alerts/alert-service.ts";
import type { IntelligenceDashboard } from "../agents/intelligenceTypes.ts";
import type { BlockedIssueRecord, AppliedChangeRecord, SyncRun } from "../storage/repository.ts";
import type { MemoryStatus } from "../memory/types.ts";
import type { SupplierConfig } from "../suppliers/types.ts";
import { renderIntelligencePage } from "./intelligence-ui.ts";

export type AdminPageModel = {
  activePath: string;
  suppliers: SupplierConfig[];
  runs: SyncRun[];
  changes: AppliedChangeRecord[];
  issues: BlockedIssueRecord[];
  alerts: AlertMessage[];
  shopifyApiKey?: string;
  memoryStatus?: MemoryStatus;
  intelligence?: IntelligenceDashboard;
  intelligenceAuthWarning?: string;
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/runs", label: "Runs" },
  { href: "/changes", label: "Change Ledger" },
  { href: "/issues", label: "Match Issues" },
  { href: "/intelligence", label: "Intelligence" },
  { href: "/memory", label: "Agent Memory" },
  { href: "/settings", label: "Settings" },
];

export function renderAdminPage(model: AdminPageModel): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${renderAppBridgeHead(model)}
    <title>Supplier Ops Agent</title>
    <style>${styles()}</style>
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">Supplier Ops</div>
        <nav>${NAV_ITEMS.map((item) => navLink(item, model.activePath)).join("")}</nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1>${pageTitle(model.activePath)}</h1>
            <p>${pageSubtitle(model.activePath)}</p>
          </div>
          <form method="post" action="/api/runs">
            <button type="submit">Run weekly sync now</button>
          </form>
        </header>
        ${model.intelligenceAuthWarning ? renderAuthWarning(model.intelligenceAuthWarning) : ""}
        ${renderContent(model)}
      </main>
    </div>
  </body>
</html>`;
}

function renderAppBridgeHead(model: AdminPageModel): string {
  if (model.activePath.startsWith("/intelligence") || !model.shopifyApiKey) {
    return "";
  }
  return `<meta name="shopify-api-key" content="${escapeHtml(model.shopifyApiKey)}">
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-app-bridge></script>`;
}

function renderAuthWarning(message: string): string {
  return `<section class="auth-warning" role="status">
    <strong>Internal dashboard auth setup needed</strong>
    <span>${escapeHtml(message)}</span>
  </section>`;
}

function navLink(item: { href: string; label: string }, activePath: string): string {
  const active = item.href === activePath || (item.href !== "/" && activePath.startsWith(item.href));
  return `<a class="${active ? "active" : ""}" href="${item.href}">${escapeHtml(item.label)}</a>`;
}

function renderContent(model: AdminPageModel): string {
  if (model.activePath.startsWith("/suppliers")) {
    return renderSuppliers(model.suppliers);
  }
  if (model.activePath.startsWith("/runs")) {
    return renderRuns(model.runs);
  }
  if (model.activePath.startsWith("/changes")) {
    return renderChanges(model.changes);
  }
  if (model.activePath.startsWith("/issues")) {
    return renderIssues(model.issues);
  }
  if (model.activePath.startsWith("/intelligence")) {
    return renderIntelligencePage(model.intelligence);
  }
  if (model.activePath.startsWith("/memory")) {
    return renderMemoryPage(model.memoryStatus);
  }
  if (model.activePath.startsWith("/settings")) {
    return renderSettings(model.suppliers);
  }
  return renderDashboard(model);
}

function renderDashboard(model: AdminPageModel): string {
  const latestRun = model.runs[0];
  return `
    <section class="metrics">
      ${metric("Suppliers", model.suppliers.length)}
      ${metric("Recent Runs", model.runs.length)}
      ${metric("Applied Changes", model.changes.length)}
      ${metric("Open Issues", model.issues.length)}
      ${metric("Memory Docs", model.memoryStatus?.documentCount ?? 0)}
    </section>
    ${renderMemoryStatus(model.memoryStatus)}
    <section class="panel">
      <h2>Latest run</h2>
      ${
        latestRun
          ? `<dl class="run-summary">
              <div><dt>Status</dt><dd>${escapeHtml(latestRun.status)}</dd></div>
              <div><dt>Changes</dt><dd>${latestRun.changeCount}</dd></div>
              <div><dt>Issues</dt><dd>${latestRun.issueCount}</dd></div>
              <div><dt>Dry run</dt><dd>${latestRun.dryRun ? "Yes" : "No"}</dd></div>
            </dl>`
          : `<p class="empty">No supplier sync has run yet.</p>`
      }
    </section>
    <section class="panel">
      <h2>Alerts</h2>
      ${model.alerts.length ? model.alerts.map(renderAlert).join("") : `<p class="empty">No alerts yet.</p>`}
    </section>`;
}

function renderMemoryPage(status: MemoryStatus | undefined): string {
  return `
    ${renderMemoryStatus(status)}
    <section class="panel">
      <h2>How agent memory works</h2>
      <dl class="settings-list">
        <div><dt>Storage</dt><dd>Postgres is the durable source when DATABASE_URL is configured; otherwise this process uses in-memory fallback.</dd></div>
        <div><dt>Retrieval</dt><dd>Vector search is used when local embeddings are available. Keyword fallback keeps the app working when the local brain is offline.</dd></div>
        <div><dt>Privacy</dt><dd>Memory stores sanitized summaries and structured facts, not raw customer dumps or unrestricted private content.</dd></div>
        <div><dt>Safety</dt><dd>Memory can inform drafts and recommendations only. Shopify writes, emails, deletions, and price changes still require approval.</dd></div>
      </dl>
    </section>`;
}

function renderMemoryStatus(status: MemoryStatus | undefined): string {
  const current = status ?? {
    provider: "memory" as const,
    connected: false,
    vectorEnabled: false,
    retrievalMode: "none" as const,
    documentCount: 0,
    chunkCount: 0,
    message: "Agent memory status is unavailable.",
  };
  return `<section class="panel memory-status">
    <div class="panel-head">
      <h2>Agent Memory</h2>
      <span class="status-pill ${current.connected ? "success" : "warning"}">${current.connected ? "Connected" : "Unavailable"}</span>
    </div>
    <dl class="run-summary">
      <div><dt>Provider</dt><dd>${escapeHtml(current.provider)}</dd></div>
      <div><dt>Retrieval</dt><dd>${escapeHtml(formatRetrievalMode(current.retrievalMode))}</dd></div>
      <div><dt>Documents</dt><dd>${current.documentCount}</dd></div>
      <div><dt>Chunks</dt><dd>${current.chunkCount}</dd></div>
      <div><dt>Vector search</dt><dd>${current.vectorEnabled ? "Ready" : "Waiting for embeddings"}</dd></div>
    </dl>
    <p class="memory-note">${escapeHtml(current.message)}</p>
  </section>`;
}

function renderSuppliers(suppliers: SupplierConfig[]): string {
  return `<section class="panel">
    <h2>Supplier coverage</h2>
    <table>
      <thead><tr><th>Supplier</th><th>Mode</th><th>Brands</th><th>Notes</th></tr></thead>
      <tbody>
        ${suppliers
          .map(
            (supplier) => `<tr>
              <td>${escapeHtml(supplier.name)}</td>
              <td>${escapeHtml(supplier.mode)}</td>
              <td>${escapeHtml(supplier.brands.join(", "))}</td>
              <td>${escapeHtml(supplier.notes)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>`;
}

function renderRuns(runs: SyncRun[]): string {
  return `<section class="panel">
    <h2>Sync runs</h2>
    ${runs.length ? `<table>
      <thead><tr><th>Started</th><th>Status</th><th>Suppliers</th><th>Changes</th><th>Issues</th><th>Dry run</th></tr></thead>
      <tbody>${runs
        .map(
          (run) => `<tr>
            <td>${escapeHtml(run.startedAt)}</td>
            <td>${escapeHtml(run.status)}</td>
            <td>${run.supplierCount}</td>
            <td>${run.changeCount}</td>
            <td>${run.issueCount}</td>
            <td>${run.dryRun ? "Yes" : "No"}</td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>` : `<p class="empty">No runs yet.</p>`}
  </section>`;
}

function renderChanges(changes: AppliedChangeRecord[]): string {
  return `<section class="panel">
    <h2>Change ledger</h2>
    ${changes.length ? `<table>
      <thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Payload</th></tr></thead>
      <tbody>${changes
        .map(
          (change) => `<tr>
            <td>${escapeHtml(change.createdAt)}</td>
            <td>${escapeHtml(change.type)}</td>
            <td>${escapeHtml("reason" in change ? change.reason : "")}</td>
            <td><code>${escapeHtml(JSON.stringify(change))}</code></td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>` : `<p class="empty">No applied changes yet.</p>`}
  </section>`;
}

function renderIssues(issues: BlockedIssueRecord[]): string {
  return `<section class="panel">
    <h2>Blocked issues</h2>
    ${issues.length ? `<table>
      <thead><tr><th>Time</th><th>Kind</th><th>Reason</th><th>Data</th></tr></thead>
      <tbody>${issues
        .map(
          (issue) => `<tr>
            <td>${escapeHtml(issue.createdAt)}</td>
            <td>${escapeHtml(issue.kind)}</td>
            <td>${escapeHtml(issue.reason)}</td>
            <td><code>${escapeHtml(JSON.stringify(issue.data ?? {}))}</code></td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>` : `<p class="empty">No blocked issues.</p>`}
  </section>`;
}

function renderSettings(suppliers: SupplierConfig[]): string {
  return `<section class="panel">
    <h2>Automation settings</h2>
    <dl class="settings-list">
      <div><dt>Schedule</dt><dd>Weekly full sync, with manual run-now from Shopify admin.</dd></div>
      <div><dt>Inventory fallback</dt><dd>Exact quantity wins; in stock without quantity becomes 10; out of stock becomes 0.</dd></div>
      <div><dt>Pricing</dt><dd>Supplier MSRP/list price first; otherwise 2x supplier cost. Sales mirror with compare-at price.</dd></div>
      <div><dt>Guardrail</dt><dd>Price changes over 25%, uncertain matches, login/2FA, and parser errors are blocked and alerted.</dd></div>
      <div><dt>Configured suppliers</dt><dd>${suppliers.length}</dd></div>
    </dl>
  </section>`;
}

function renderAlert(alert: AlertMessage): string {
  return `<article class="alert ${escapeHtml(alert.severity)}">
    <strong>${escapeHtml(alert.title)}</strong>
    <span>${escapeHtml(alert.body)}</span>
  </article>`;
}

function metric(label: string, value: number): string {
  return `<article class="metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`;
}

function pageTitle(path: string): string {
  if (path.startsWith("/suppliers")) return "Suppliers";
  if (path.startsWith("/runs")) return "Runs";
  if (path.startsWith("/changes")) return "Change Ledger";
  if (path.startsWith("/issues")) return "Match Issues";
  if (path.startsWith("/intelligence")) return "LWT Intelligence Center";
  if (path.startsWith("/memory")) return "Agent Memory";
  if (path.startsWith("/settings")) return "Settings";
  return "Dashboard";
}

function pageSubtitle(path: string): string {
  if (path.startsWith("/suppliers")) return "Configured supplier adapters and coverage.";
  if (path.startsWith("/runs")) return "Weekly and manual sync history.";
  if (path.startsWith("/changes")) return "Every automated Shopify update, recorded before write.";
  if (path.startsWith("/issues")) return "Blocked changes that need attention before automation proceeds.";
  if (path.startsWith("/intelligence")) return "Inventory risk, product strategy, and content radar for today's operator decisions.";
  if (path.startsWith("/memory")) return "Cloud business memory and retrieval status for local intelligence.";
  if (path.startsWith("/settings")) return "Automation defaults and safety rules.";
  return "Supplier availability and pricing automation for Shopify.";
}

function formatRetrievalMode(mode: string): string {
  if (mode === "keyword_fallback") return "keyword fallback";
  return mode;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function styles(): string {
  return `
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --surface: #ffffff;
      --text: #1f2428;
      --muted: #68727d;
      --border: #d9dee3;
      --accent: #006c67;
      --accent-strong: #004c49;
      --warning: #9a6700;
      --error: #b42318;
      --radius: 8px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 240px minmax(0, 1fr); }
    .sidebar { background: #172321; color: #f8fbfa; padding: 24px 16px; }
    .brand { font-size: 18px; font-weight: 720; margin-bottom: 28px; }
    nav { display: grid; gap: 6px; }
    nav a { color: #dce5e2; text-decoration: none; padding: 10px 12px; border-radius: 6px; font-size: 14px; }
    nav a.active, nav a:hover { background: rgba(255, 255, 255, 0.12); color: #ffffff; }
    .main { padding: 28px; max-width: 1280px; width: 100%; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 4px; font-weight: 760; }
    h2 { font-size: 18px; margin: 0 0 16px; }
    p { margin: 0; color: var(--muted); }
    button { border: 0; background: var(--accent); color: white; min-height: 40px; padding: 0 16px; border-radius: 6px; font-size: 14px; font-weight: 650; cursor: pointer; }
    button:hover { background: var(--accent-strong); }
    input, select, textarea { width: 100%; min-height: 38px; border: 1px solid var(--border); border-radius: 6px; padding: 0 10px; background: #ffffff; color: var(--text); font: inherit; }
    input[type="file"] { padding: 8px 10px; }
    textarea { min-height: 92px; padding: 10px; resize: vertical; }
    label span { display: block; color: var(--muted); font-size: 12px; font-weight: 750; margin-bottom: 6px; }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric, .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .metric { padding: 16px; display: grid; gap: 10px; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 28px; }
    .panel { padding: 18px; margin-bottom: 16px; overflow: auto; }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .panel-head h2 { margin: 0; }
    .status-pill { display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; font-weight: 760; }
    .status-pill.success { color: #05603a; background: #d1fadf; }
    .status-pill.warning { color: #93370d; background: #fef0c7; }
    .memory-note { margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 680; }
    code { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #344054; }
    .run-summary, .settings-list { display: grid; gap: 10px; margin: 0; }
    .run-summary div, .settings-list div { display: grid; grid-template-columns: 160px 1fr; gap: 12px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .empty { color: var(--muted); padding: 10px 0; }
    .alert { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; }
    .alert.error { border-color: #fecdca; color: var(--error); background: #fff5f5; }
    .alert.warning { border-color: #fedf89; color: var(--warning); background: #fffbeb; }
    .alert.info { background: #f5fbff; }
    .auth-warning { display: grid; gap: 4px; border: 1px solid #fedf89; background: #fffbeb; color: #7a5c00; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; }
    .auth-warning span { color: #7a5c00; }
    .intelligence-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .intel-card { background: #fffaf0; border: 1px solid #dfc982; border-radius: 8px; padding: 16px; display: grid; gap: 8px; min-height: 96px; }
    .intel-card span { color: #596273; font-size: 13px; font-weight: 700; }
    .intel-card strong { color: #102a43; font-size: 24px; line-height: 1.15; }
    .compact-summary { margin: 4px 0 18px; }
    .intelligence-actions { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 16px; }
    .button-row { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 8px; min-width: 0; }
    .button-row button { background: #102a43; }
    .button-row button { flex: 1 1 180px; max-width: 220px; }
    .button-row button:hover { background: #183b5c; }
    .button-row button:disabled { cursor: wait; opacity: 0.72; }
    .run-status { grid-column: 1 / -1; min-height: 20px; color: #596273; }
    .intel-tabs { display: grid; gap: 14px; }
    .tab-list { display: flex; flex-wrap: wrap; gap: 8px; background: #eef2f4; border: 1px solid var(--border); border-radius: 8px; padding: 6px; width: fit-content; max-width: 100%; }
    .tab-list button { background: transparent; color: #334155; border-radius: 6px; min-height: 36px; padding: 0 12px; }
    .tab-list button[aria-selected="true"] { background: #102a43; color: #fffaf0; }
    .intelligence-panel { border-color: #d6dbe0; }
    .brief { color: #25364a; font-size: 16px; line-height: 1.55; margin-bottom: 18px; max-width: 780px; }
    .intel-grid { display: grid; gap: 14px; margin-bottom: 18px; }
    .intel-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 16px 0; }
    .mini-panel { border: 1px solid #e1e6ea; border-radius: 8px; padding: 14px; background: #ffffff; min-width: 0; }
    .mini-panel h3, .source-card h3, .setup-note h3 { color: #102a43; font-size: 14px; line-height: 1.25; margin: 0 0 10px; }
    .mini-panel ol { margin: 0; padding-left: 18px; display: grid; gap: 8px; color: #25364a; }
    .mini-panel li { line-height: 1.45; }
    .row-list { display: grid; gap: 10px; }
    .signal-row, .source-row, .idea-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid #edf0f2; padding-bottom: 10px; }
    .signal-row:last-child, .source-row:last-child, .idea-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .signal-row strong, .source-row strong, .idea-row strong { color: #1f2937; font-size: 14px; }
    .signal-row p, .source-row p, .idea-row p { margin-top: 3px; font-size: 13px; line-height: 1.45; }
    .idea-row { align-items: flex-start; }
    .idea-main { display: grid; gap: 8px; flex: 1 1 auto; min-width: 0; }
    .idea-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .idea-detail-list { display: grid; gap: 8px; margin: 8px 0 0; font-size: 13px; }
    .idea-detail-list div { display: grid; grid-template-columns: 130px 1fr; gap: 10px; }
    details summary { color: #334155; cursor: pointer; font-size: 13px; font-weight: 700; }
    .idea-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .idea-actions button { min-height: 34px; padding: 0 12px; font-size: 12px; }
    .secondary-button { background: #eef2f4; color: #102a43; }
    .secondary-button:hover { background: #dfe7eb; }
    .danger-button { color: #912018; }
    .idea-feedback { min-height: 18px; color: #596273; }
    .brief-workspace { border-top: 1px solid #edf0f2; margin-top: 12px; padding-top: 12px; }
    .brief-workspace pre { background: #111827; color: #f8fafc; border-radius: 8px; margin: 0; padding: 14px; overflow: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
    .weekly-brief-workspace { width: 100%; }
    .import-panel { margin-bottom: 18px; }
    .import-controls { display: grid; grid-template-columns: minmax(180px, 260px) minmax(240px, 1fr); gap: 12px; align-items: end; }
    .import-buttons { grid-column: 1 / -1; }
    .import-preview { background: #111827; color: #f8fafc; border-radius: 8px; margin: 12px 0 0; padding: 12px; overflow: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.45; }
    .recommendation-row { display: grid; gap: 7px; border-bottom: 1px solid #edf0f2; padding-bottom: 12px; }
    .recommendation-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .recommendation-row p { font-size: 13px; line-height: 1.45; }
    .action-create-button { width: fit-content; min-height: 32px; padding: 0 11px; font-size: 12px; }
    .action-queue-panel .compact-summary { margin-bottom: 14px; }
    .action-filters { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .action-list { margin-top: 12px; }
    .action-note-row { display: grid; grid-template-columns: minmax(160px, 1fr) auto; gap: 8px; align-items: center; }
    .export-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
    .export-links a { display: inline-flex; align-items: center; min-height: 32px; padding: 0 10px; border-radius: 6px; background: #edf7f5; color: #0f4f4a; font-size: 12px; font-weight: 750; text-decoration: none; }
    .export-links a:hover { background: #d6efeb; }
    .tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-list span { display: inline-flex; align-items: center; min-height: 28px; padding: 0 9px; border-radius: 6px; background: #edf7f5; color: #0f4f4a; font-size: 12px; font-weight: 700; }
    .source-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .shopper-source-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .source-card { border: 1px solid #e1e6ea; border-radius: 8px; padding: 14px; background: #ffffff; min-width: 0; }
    .source-card .panel-head { margin-bottom: 8px; align-items: flex-start; }
    .source-last-run { margin-top: 8px; font-size: 12px; }
    .env-list { margin-top: 8px; color: #7a5c00; font-size: 12px; font-weight: 700; word-break: break-word; }
    .setup-note { border-top: 1px solid #edf0f2; padding-top: 14px; }
    .status-pill.danger { color: #912018; background: #fee4e2; }
    @media (max-width: 860px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: static; }
      .main { padding: 18px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .intelligence-summary, .intel-grid.two, .config-grid, .source-grid, .import-controls, .action-filters { grid-template-columns: 1fr; }
      .import-buttons { grid-column: auto; }
      .action-note-row { grid-template-columns: 1fr; }
      .intelligence-actions { grid-template-columns: 1fr; }
      .button-row { justify-content: flex-start; }
      .idea-detail-list div { grid-template-columns: 1fr; }
    }
  `;
}
