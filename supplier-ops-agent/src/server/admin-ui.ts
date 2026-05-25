import type { AlertMessage } from "../alerts/alert-service.ts";
import type { BlockedIssueRecord, AppliedChangeRecord, SyncRun } from "../storage/repository.ts";
import type { SupplierConfig } from "../suppliers/types.ts";

export type AdminPageModel = {
  activePath: string;
  suppliers: SupplierConfig[];
  runs: SyncRun[];
  changes: AppliedChangeRecord[];
  issues: BlockedIssueRecord[];
  alerts: AlertMessage[];
  shopifyApiKey?: string;
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/runs", label: "Runs" },
  { href: "/changes", label: "Change Ledger" },
  { href: "/issues", label: "Match Issues" },
  { href: "/settings", label: "Settings" },
];

export function renderAdminPage(model: AdminPageModel): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="shopify-api-key" content="${escapeHtml(model.shopifyApiKey ?? "")}">
    <title>Supplier Ops Agent</title>
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-app-bridge></script>
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
          <div class="run-actions">
            <form method="post" action="/api/runs?dryRun=true" data-run-form data-running-label="Running dry sync...">
              <button type="submit">Dry run sync</button>
            </form>
            <form method="post" action="/api/runs" data-run-form data-running-label="Running write sync...">
              <button class="secondary" type="submit">Run write sync</button>
            </form>
          </div>
          <div id="sync-status" class="sync-status" role="status" aria-live="polite"></div>
        </header>
        ${renderContent(model)}
      </main>
    </div>
    <script>${clientScript()}</script>
  </body>
</html>`;
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
      ${metric("Latest Changes", latestRun?.changeCount ?? 0)}
      ${metric("Latest Issues", latestRun?.issueCount ?? 0)}
    </section>
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
      <thead><tr><th>Time</th><th>Kind</th><th>Supplier item</th><th>Shopify candidate</th><th>Reason</th><th>Data</th></tr></thead>
      <tbody>${issues
        .map(
          (issue) => `<tr>
            <td>${escapeHtml(issue.createdAt)}</td>
            <td>${escapeHtml(issue.kind)}</td>
            <td>${renderSupplierProductSummary(issue.supplierProduct)}</td>
            <td>${renderShopifyVariantSummary(issue.shopifyVariant)}</td>
            <td>${escapeHtml(issue.reason)}</td>
            <td><code>${escapeHtml(JSON.stringify(issue.data ?? {}))}</code></td>
          </tr>`,
        )
        .join("")}</tbody>
    </table>` : `<p class="empty">No blocked issues.</p>`}
  </section>`;
}

function renderSupplierProductSummary(product: BlockedIssueRecord["supplierProduct"]): string {
  if (!product) {
    return `<span class="muted">No supplier item</span>`;
  }

  const title = escapeHtml(product.title);
  const sku = product.sku ? `SKU ${escapeHtml(product.sku)}` : "No SKU";
  const brand = product.brand ? escapeHtml(product.brand) : escapeHtml(product.supplierName);
  const stock = escapeHtml(product.stockStatus);
  const url = product.productUrl
    ? `<a class="inline-link" href="${escapeHtml(product.productUrl)}" target="_blank" rel="noreferrer">Supplier page</a>`
    : "";

  return `<div class="summary-cell">
    <strong>${title}</strong>
    <span>${brand} · ${sku} · ${stock}</span>
    ${url}
  </div>`;
}

function renderShopifyVariantSummary(variant: BlockedIssueRecord["shopifyVariant"]): string {
  if (!variant) {
    return `<span class="muted">No candidate</span>`;
  }

  const sku = variant.sku ? `SKU ${escapeHtml(variant.sku)}` : "No SKU";
  const price = Number.isFinite(variant.price) ? `$${variant.price.toFixed(2)}` : "No price";

  return `<div class="summary-cell">
    <strong>${escapeHtml(variant.title)}</strong>
    <span>${escapeHtml(variant.vendor)} · ${sku} · ${price}</span>
    <span>${escapeHtml(variant.status)}</span>
  </div>`;
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
  if (path.startsWith("/settings")) return "Settings";
  return "Dashboard";
}

function pageSubtitle(path: string): string {
  if (path.startsWith("/suppliers")) return "Configured supplier adapters and coverage.";
  if (path.startsWith("/runs")) return "Weekly and manual sync history.";
  if (path.startsWith("/changes")) return "Dry-run planned changes and real Shopify writes.";
  if (path.startsWith("/issues")) return "Blocked changes that need attention before automation proceeds.";
  if (path.startsWith("/settings")) return "Automation defaults and safety rules.";
  return "Supplier availability and pricing automation for Shopify.";
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
    button.secondary { background: #36485c; }
    .run-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sync-status { min-height: 22px; color: var(--muted); font-size: 13px; flex-basis: 100%; }
    .sync-status.error { color: var(--error); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric, .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .metric { padding: 16px; display: grid; gap: 10px; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 28px; }
    .panel { padding: 18px; margin-bottom: 16px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 11px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 680; }
    code { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #344054; }
    .run-summary, .settings-list { display: grid; gap: 10px; margin: 0; }
    .run-summary div, .settings-list div { display: grid; grid-template-columns: 160px 1fr; gap: 12px; }
    dt { color: var(--muted); }
    dd { margin: 0; }
    .empty { color: var(--muted); padding: 10px 0; }
    .muted { color: var(--muted); }
    .inline-link { color: var(--accent); text-decoration: none; font-weight: 650; }
    .inline-link:hover { color: var(--accent-strong); text-decoration: underline; }
    .summary-cell { display: grid; gap: 4px; min-width: 220px; }
    .summary-cell strong { font-size: 13px; }
    .summary-cell span, .summary-cell a { color: var(--muted); font-size: 12px; }
    .summary-cell a { color: var(--accent); }
    .alert { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; }
    .alert.error { border-color: #fecdca; color: var(--error); background: #fff5f5; }
    .alert.warning { border-color: #fedf89; color: var(--warning); background: #fffbeb; }
    .alert.info { background: #f5fbff; }
    @media (max-width: 860px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar { position: static; }
      .main { padding: 18px; }
      .topbar { align-items: flex-start; flex-direction: column; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `;
}

function clientScript(): string {
  return `
    const syncStatus = document.getElementById("sync-status");
    const runForms = Array.from(document.querySelectorAll("[data-run-form]"));
    runForms.forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const buttons = runForms.flatMap((candidate) => Array.from(candidate.querySelectorAll("button")));
        buttons.forEach((button) => {
          button.disabled = true;
          button.dataset.originalText = button.textContent || "";
        });
        const submitter = event.submitter || form.querySelector("button");
        if (submitter) {
          submitter.textContent = form.dataset.runningLabel || "Running sync...";
        }
        syncStatus.classList.remove("error");
        syncStatus.textContent = form.dataset.runningLabel || "Running sync...";

        try {
          const response = await fetch(form.action, {
            method: "POST",
            headers: {
              accept: "application/json",
              "x-requested-with": "supplier-ops-fetch",
            },
          });
          const body = await response.json();
          if (!response.ok || !body.ok) {
            throw new Error(body.error || "Sync failed");
          }
          syncStatus.textContent = body.started ? "Sync started. Opening Runs..." : "Sync already running. Opening Runs...";
          window.location.assign(body.redirect || "/runs");
        } catch (error) {
          syncStatus.classList.add("error");
          syncStatus.textContent = error instanceof Error ? error.message : "Sync failed";
          buttons.forEach((button) => {
            button.disabled = false;
            button.textContent = button.dataset.originalText || button.textContent || "Run sync";
          });
        }
      });
    });
  `;
}
