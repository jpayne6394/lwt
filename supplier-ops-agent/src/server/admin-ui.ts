import type { AlertMessage } from "../alerts/alert-service.ts";
import type { CampaignDraftRecord } from "../campaigns/types.ts";
import { WELLNESS_BLOG_PROFILES } from "../content/blog-template-builder.ts";
import type { BlogDraftRecord } from "../content/types.ts";
import type { MarketRadarOutputRecord, RevenuePlayRecord, SourceConnectionCard } from "../market-radar/types.ts";
import type { ProductOpsOutputRecord, ProductOpsProductResult, ProductOpsTask } from "../product-ops/types.ts";
import type { BlockedIssueRecord, AppliedChangeRecord, SyncRun } from "../storage/repository.ts";
import type { SupplierConfig } from "../suppliers/types.ts";

export type ActiveAgent = "bi" | "inventory" | "product_ops" | "campaign" | "blog" | "flow";

export type AdminPageModel = {
  activePath: string;
  activeAgent?: ActiveAgent;
  suppliers: SupplierConfig[];
  runs: SyncRun[];
  changes: AppliedChangeRecord[];
  issues: BlockedIssueRecord[];
  productOpsOutputs: ProductOpsOutputRecord[];
  marketRadarOutputs: MarketRadarOutputRecord[];
  revenuePlays: RevenuePlayRecord[];
  sourceConnections: SourceConnectionCard[];
  blogDrafts: BlogDraftRecord[];
  campaignDrafts: CampaignDraftRecord[];
  alerts: AlertMessage[];
  shopifyApiKey?: string;
  applyChangesEnabled: boolean;
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/runs", label: "Runs" },
  { href: "/changes", label: "Change Ledger" },
  { href: "/issues", label: "Match Issues" },
  { href: "/sources", label: "Sources" },
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
  if (model.activePath.startsWith("/sources")) {
    return renderSources(model.sourceConnections);
  }
  if (model.activePath.startsWith("/settings")) {
    return renderSettings(model.suppliers, model.applyChangesEnabled);
  }
  return renderDashboard(model);
}

function renderDashboard(model: AdminPageModel): string {
  const latestRun = model.runs[0];
  const latestProductOps = model.productOpsOutputs[0];
  const latestRadar = model.marketRadarOutputs[0];
  const activeAgent = model.activeAgent ?? "product_ops";
  const issueCounts = countIssuesByKind(model.issues);

  return `
    <section class="briefing">
      <div class="briefing-copy">
        <h2>Store Health</h2>
        <p>${escapeHtml(storeHealthLine(latestRun, latestProductOps))}</p>
      </div>
      <div class="safety-chip">${model.applyChangesEnabled ? "Write mode enabled" : "Dry-run safe"}</div>
    </section>
    <section class="metrics health-metrics">
      ${metric("Suppliers", model.suppliers.length)}
      ${metric("Promote Ready", latestProductOps?.summary.promoteReady ?? 0)}
      ${metric("Revenue Plays", latestRadar?.summary.revenuePlays ?? model.revenuePlays.length)}
      ${metric("Review Required", latestProductOps?.summary.reviewRequired ?? 0)}
      ${metric("Latest Issues", latestRun?.issueCount ?? 0)}
    </section>
    ${renderAgentDock(activeAgent, latestRun, latestProductOps, latestRadar, model.revenuePlays)}
    <div class="dashboard-grid">
      ${renderLatestRunPanel(latestRun)}
      ${renderActionQueue(latestRun, latestProductOps, latestRadar, model.revenuePlays, issueCounts)}
    </div>
    ${renderAgentWorkspace(model, latestRun, latestProductOps, latestRadar, issueCounts)}
    <section class="panel">
      <h2>Alerts</h2>
      ${model.alerts.length ? model.alerts.map(renderAlert).join("") : `<p class="empty">No alerts yet.</p>`}
    </section>`;
}

function storeHealthLine(run: SyncRun | undefined, output: ProductOpsOutputRecord | undefined): string {
  if (!run) {
    return "No run yet. Start with a dry sync to build the first operations briefing.";
  }

  const reviewRequired = output?.summary.reviewRequired ?? 0;
  const plannedChanges = run.changeCount;
  if (run.status === "running") {
    return "A dry-run sync is in motion. The command center will update when the worker finishes.";
  }
  if (reviewRequired > 0) {
    return `${plannedChanges} dry-run changes are waiting; ${reviewRequired} products need review before promotion.`;
  }
  if ((output?.summary.promoteReady ?? 0) > 0) {
    return `${output?.summary.promoteReady ?? 0} products are ready for promotion review.`;
  }
  return `${plannedChanges} dry-run changes are ready for review.`;
}

function renderLatestRunPanel(run: SyncRun | undefined): string {
  return `<section class="panel">
    <h2>Latest run</h2>
    ${
      run
        ? `<dl class="run-summary">
            <div><dt>Status</dt><dd>${escapeHtml(run.status)}</dd></div>
            <div><dt>Changes</dt><dd>${run.changeCount}</dd></div>
            <div><dt>Issues</dt><dd>${run.issueCount}</dd></div>
            <div><dt>Dry run</dt><dd>${run.dryRun ? "Yes" : "No"}</dd></div>
          </dl>`
        : `<p class="empty">No supplier sync has run yet.</p>`
    }
  </section>`;
}

function renderAgentDock(
  activeAgent: ActiveAgent,
  run: SyncRun | undefined,
  output: ProductOpsOutputRecord | undefined,
  radar: MarketRadarOutputRecord | undefined,
  revenuePlays: RevenuePlayRecord[],
): string {
  const agents: Array<{ id: ActiveAgent; label: string; signal: string; value: number | string }> = [
    { id: "bi", label: "BI Analyst", signal: "Market radar", value: radar?.summary.revenuePlays ?? revenuePlays.length },
    { id: "inventory", label: "Inventory Ops", signal: "Planned changes", value: run?.changeCount ?? 0 },
    { id: "product_ops", label: "Product Ops", signal: "Review queue", value: output?.summary.reviewRequired ?? 0 },
    { id: "campaign", label: "Campaign Planner", signal: "Promotion candidates", value: output?.summary.promoteReady ?? 0 },
    { id: "blog", label: "Blog Publisher", signal: "Draft sources", value: output?.summary.promoteReady ?? 0 },
    { id: "flow", label: "Flow Launchpad", signal: "Automation ideas", value: revenuePlays.filter((play) => play.targetAgent === "flow").length },
  ];

  return `<section class="agent-dock" aria-label="Sub-agent selector">
    ${agents
      .map((agent) => {
        const selected = agent.id === activeAgent;
        return `<a class="agent-card ${selected ? "selected" : ""}" href="/?agent=${agent.id}">
          <span class="agent-name">${escapeHtml(agent.label)}</span>
          <strong>${escapeHtml(String(agent.value))}</strong>
          <span>${escapeHtml(agent.signal)}</span>
          ${selected ? `<em>${escapeHtml(agent.label)} is selected</em>` : ""}
        </a>`;
      })
      .join("")}
  </section>`;
}

function renderActionQueue(
  run: SyncRun | undefined,
  output: ProductOpsOutputRecord | undefined,
  radar: MarketRadarOutputRecord | undefined,
  revenuePlays: RevenuePlayRecord[],
  issueCounts: Map<BlockedIssueRecord["kind"], number>,
): string {
  const topRevenuePlays = (radar?.revenuePlays ?? revenuePlays).slice(0, 3);
  const actions = [
    radar
      ? actionQueueItem("BI Analyst", `Review ${radar.summary.revenuePlays} revenue plays`, `${radar.summary.signalsReviewed} market signals checked by Market Radar.`, "/?agent=bi")
      : actionQueueItem("BI Analyst", "Refresh Market Radar", "Create the first outside-market revenue briefing.", "/?agent=bi"),
    run && run.changeCount > 0
      ? actionQueueItem("Inventory Ops", `Review ${run.changeCount} dry-run changes`, "Open the change ledger before write mode.", "/changes")
      : undefined,
    output && output.summary.reviewRequired > 0
      ? actionQueueItem("Product Ops", "Clear Product Ops review queue", `${output.summary.reviewRequired} products need review before promotion.`, "/?agent=product_ops")
      : undefined,
    issueCounts.get("match_uncertain")
      ? actionQueueItem("Product Ops", "Review uncertain matches", `${issueCounts.get("match_uncertain")} supplier matches need mapping or confirmation.`, "/issues")
      : undefined,
    issueCounts.get("price_guardrail")
      ? actionQueueItem("Inventory Ops", "Inspect price guardrails", `${issueCounts.get("price_guardrail")} price changes are blocked for safety.`, "/issues")
      : undefined,
    issueCounts.get("stock_unknown")
      ? actionQueueItem("Inventory Ops", "Confirm unknown stock", `${issueCounts.get("stock_unknown")} products need supplier stock confirmation.`, "/issues")
      : undefined,
    output && output.summary.promoteReady > 0
      ? actionQueueItem("Campaign Planner", "Approve promote-ready products", `${output.summary.promoteReady} products can feed campaigns and blog drafts.`, "/?agent=campaign")
      : undefined,
    ...topRevenuePlays.map((play) => actionQueueItem(play.targetAgent, play.title, play.explanation, `/?agent=${play.targetAgent}`)),
  ].filter((item): item is string => item !== undefined);

  return `<section class="panel action-queue">
    <div class="panel-heading">
      <h2>Action Queue</h2>
      <span>${actions.length}</span>
    </div>
    ${actions.length ? actions.join("") : `<p class="empty">No priority actions yet.</p>`}
  </section>`;
}

function actionQueueItem(agent: string, title: string, detail: string, href: string): string {
  return `<a class="action-item" href="${escapeHtml(href)}">
    <span>${escapeHtml(agent)}</span>
    <strong>${escapeHtml(title)}</strong>
    <small>${escapeHtml(detail)}</small>
  </a>`;
}

function renderAgentWorkspace(
  model: AdminPageModel,
  run: SyncRun | undefined,
  output: ProductOpsOutputRecord | undefined,
  radar: MarketRadarOutputRecord | undefined,
  issueCounts: Map<BlockedIssueRecord["kind"], number>,
): string {
  const activeAgent = model.activeAgent ?? "product_ops";
  if (activeAgent === "bi") {
    return `<section class="panel agent-workspace">
      <div class="panel-heading">
        <h2>BI Analyst: Market Radar</h2>
        <form method="post" action="/api/market-radar" data-run-form data-running-label="Refreshing Market Radar...">
          <button type="submit">Refresh radar</button>
        </form>
      </div>
      <div class="agent-stats">
        ${metric("Signals", radar?.summary.signalsReviewed ?? 0)}
        ${metric("Revenue Plays", radar?.summary.revenuePlays ?? model.revenuePlays.length)}
        ${metric("Competitor Prices", radar?.summary.competitorPricesReviewed ?? 0)}
        ${metric("Claim Flags", radar?.summary.lightClaimWarnings ?? 0)}
      </div>
    </section>
    ${renderSalesWindows(radar)}
    ${renderMarketExplanations(radar)}
    ${renderRevenuePlays(radar?.revenuePlays ?? model.revenuePlays)}
    ${renderSources(model.sourceConnections)}`;
  }

  if (activeAgent === "inventory") {
    return `<section class="panel agent-workspace">
      <h2>Inventory Ops is selected</h2>
      <div class="agent-stats">
        ${metric("Planned Changes", run?.changeCount ?? 0)}
        ${metric("Unknown Stock", issueCounts.get("stock_unknown") ?? 0)}
        ${metric("Price Guardrails", issueCounts.get("price_guardrail") ?? 0)}
        ${metric("Out of Stock", output?.summary.outOfStock ?? 0)}
      </div>
    </section>`;
  }

  if (activeAgent === "campaign") {
    return `<section class="panel agent-workspace">
      <div class="panel-heading">
        <h2>Campaign Draft Suite</h2>
        <form method="post" action="/api/campaign-drafts">
          <button type="submit">Create campaign brief</button>
        </form>
      </div>
      <p>Build Shopify Email handoff briefs from BI revenue plays, Product Ops candidates, and seasonal product ideas. The app drafts copy and product picks; sending stays inside Shopify Email.</p>
    </section>
    ${renderCampaignDrafts(model.campaignDrafts)}
    ${renderRevenuePlays((radar?.revenuePlays ?? model.revenuePlays).filter((play) => play.targetAgent === "campaign"))}
    ${renderProductList("Campaign candidates", output?.productsToPromote ?? [])}`;
  }

  if (activeAgent === "blog") {
    return `<section class="panel agent-workspace">
      <h2>Blog Template Builder</h2>
      <p>Choose a wellness style profile, add your rough thought, and create a Shopify-ready draft for review. This is template-driven by default, with no AI cost.</p>
      <form class="draft-form" method="post" action="/api/blog-drafts">
        <label>Style profile
          <select name="profileId">
            ${WELLNESS_BLOG_PROFILES.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label)}</option>`).join("")}
          </select>
        </label>
        <label>Title
          <input name="title" required placeholder="Magnesium for better sleep">
        </label>
        <label>Rough thoughts
          <textarea name="roughThoughts" rows="5" placeholder="Paste your idea, angle, notes, or products to mention."></textarea>
        </label>
        <button type="submit">Create template draft</button>
      </form>
    </section>
    ${renderBlogProfiles()}
    ${renderBlogDrafts(model.blogDrafts)}
    ${renderRevenuePlays((radar?.revenuePlays ?? model.revenuePlays).filter((play) => play.targetAgent === "blog"))}
    ${renderProductList("Article source products", output?.productsToPromote ?? [])}`;
  }

  if (activeAgent === "flow") {
    return `<section class="panel agent-workspace">
      <div class="panel-heading">
        <h2>Flow Launchpad</h2>
        <a class="button-link" href="/admin/apps/flow" target="_blank" rel="noreferrer">Open Shopify Flow</a>
      </div>
      <p>Use this as the planning surface for automations. V1 tracks setup ideas and links you into Shopify Flow; it does not auto-edit workflows.</p>
    </section>
    ${renderFlowIdeas(radar?.revenuePlays ?? model.revenuePlays)}`;
  }

  return `<section class="panel agent-workspace">
    <h2>Product Ops is selected</h2>
    <p>${output ? `${output.summary.productsChecked} products checked against ${output.summary.variantsChecked} Shopify variants.` : "Run a dry sync to build Product Ops output."}</p>
  </section>
  ${renderProductOpsSummary(output)}
  ${renderProductList("Products to promote", output?.productsToPromote ?? [])}
  ${renderTaskList("Promotion tasks", output?.promotionTasks ?? [])}
  ${renderTaskList("Cleanup tasks", output?.cleanupTasks ?? [])}
  ${renderTaskList("Review tasks", output?.reviewTasks ?? [])}`;
}

function renderProductOpsSummary(output: ProductOpsOutputRecord | undefined): string {
  if (!output) {
    return `<section class="panel"><h2>Product Ops</h2><p class="empty">No Product Ops output yet.</p></section>`;
  }

  return `<section class="panel">
    <h2>Product Ops</h2>
    <dl class="run-summary">
      <div><dt>Mode</dt><dd>${escapeHtml(output.mode)}</dd></div>
      <div><dt>Products checked</dt><dd>${output.summary.productsChecked}</dd></div>
      <div><dt>Variants checked</dt><dd>${output.summary.variantsChecked}</dd></div>
      <div><dt>Promote ready</dt><dd>${output.summary.promoteReady}</dd></div>
      <div><dt>Low stock</dt><dd>${output.summary.lowStock}</dd></div>
      <div><dt>Out of stock</dt><dd>${output.summary.outOfStock}</dd></div>
      <div><dt>Needs cleanup</dt><dd>${output.summary.needsDataCleanup}</dd></div>
      <div><dt>Bad page</dt><dd>${output.summary.badPage}</dd></div>
      <div><dt>Do not promote</dt><dd>${output.summary.doNotPromote}</dd></div>
      <div><dt>Review required</dt><dd>${output.summary.reviewRequired}</dd></div>
      <div><dt>Errors</dt><dd>${output.summary.errors}</dd></div>
    </dl>
  </section>`;
}

function renderProductList(title: string, products: ProductOpsProductResult[]): string {
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    ${products.length ? `<table>
      <thead><tr><th>Product</th><th>Supplier</th><th>Status</th><th>Stock</th><th>Confidence</th><th>Reasons</th></tr></thead>
      <tbody>${products.slice(0, 25).map(renderProductOpsProduct).join("")}</tbody>
    </table>` : `<p class="empty">No products in this queue.</p>`}
  </section>`;
}

function renderProductOpsProduct(product: ProductOpsProductResult): string {
  const supplierPage = product.productUrl
    ? `<a class="inline-link" href="${escapeHtml(product.productUrl)}" target="_blank" rel="noreferrer">Supplier page</a>`
    : "";

  return `<tr>
    <td><div class="summary-cell">
      <strong>${escapeHtml(product.title)}</strong>
      <span>${escapeHtml(product.vendor ?? product.supplierName)} - ${escapeHtml(product.sku ?? "No SKU")}</span>
      ${supplierPage}
    </div></td>
    <td>${escapeHtml(product.supplierName)}</td>
    <td><span class="status-pill">${escapeHtml(product.promotionStatus)}</span></td>
    <td>${escapeHtml(product.stockStatus ?? "unknown")}</td>
    <td>${product.matchConfidence.toFixed(2)}</td>
    <td>${escapeHtml(product.reasons.join(" "))}</td>
  </tr>`;
}

function renderTaskList(title: string, tasks: ProductOpsTask[]): string {
  return `<section class="panel">
    <h2>${escapeHtml(title)}</h2>
    ${tasks.length ? `<table>
      <thead><tr><th>Action</th><th>Task</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>${tasks.slice(0, 25).map(renderProductOpsTask).join("")}</tbody>
    </table>` : `<p class="empty">No tasks in this queue.</p>`}
  </section>`;
}

function renderProductOpsTask(task: ProductOpsTask): string {
  return `<tr>
    <td>${escapeHtml(task.actionType)}</td>
    <td>${escapeHtml(task.title)}</td>
    <td>${escapeHtml(task.promotionStatus ?? "")}</td>
    <td>${escapeHtml(task.detail)}</td>
  </tr>`;
}

function countIssuesByKind(issues: BlockedIssueRecord[]): Map<BlockedIssueRecord["kind"], number> {
  const counts = new Map<BlockedIssueRecord["kind"], number>();
  for (const issue of issues) {
    counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1);
  }
  return counts;
}

function renderSalesWindows(radar: MarketRadarOutputRecord | undefined): string {
  return `<section class="panel">
    <h2>BI Sales Windows</h2>
    ${
      radar?.salesWindows.length
        ? `<div class="window-grid">${radar.salesWindows
            .map(
              (window) => `<article class="mini-card">
                <span>${escapeHtml(window.label)}</span>
                <strong>$${window.revenue.toFixed(2)}</strong>
                <small>${window.orderCount} orders - ${window.unitsSold} units</small>
              </article>`,
            )
            .join("")}</div>`
        : `<p class="empty">Refresh Market Radar to build today, 7, 30, 90, and 365 day sales windows.</p>`
    }
  </section>`;
}

function renderMarketExplanations(radar: MarketRadarOutputRecord | undefined): string {
  return `<section class="panel">
    <h2>Market Radar Explanations</h2>
    ${
      radar?.explanations.length
        ? radar.explanations
            .slice(0, 8)
            .map(
              (explanation) => `<article class="radar-explanation">
                <div>
                  <strong>${escapeHtml(explanation.title)}</strong>
                  <p>${escapeHtml(explanation.explanation)}</p>
                </div>
                <span class="status-pill">${escapeHtml(explanation.confidence)}</span>
              </article>`,
            )
            .join("")
        : `<p class="empty">No market explanations yet.</p>`
    }
  </section>`;
}

function renderRevenuePlays(plays: RevenuePlayRecord[]): string {
  return `<section class="panel">
    <h2>Revenue Plays</h2>
    ${
      plays.length
        ? `<table>
            <thead><tr><th>Idea</th><th>Action</th><th>Agent</th><th>Confidence</th><th>Status</th><th>Context</th></tr></thead>
            <tbody>${plays.slice(0, 25).map(renderRevenuePlay).join("")}</tbody>
          </table>`
        : `<p class="empty">No revenue plays yet. Refresh Market Radar to generate ideas.</p>`
    }
  </section>`;
}

function renderRevenuePlay(play: RevenuePlayRecord): string {
  return `<tr>
    <td><div class="summary-cell"><strong>${escapeHtml(play.title)}</strong><span>${escapeHtml(play.explanation)}</span>${play.claimWarnings.length ? `<span class="warning-text">${escapeHtml(play.claimWarnings.join(" "))}</span>` : ""}</div></td>
    <td>${escapeHtml(play.actionType)}</td>
    <td>${escapeHtml(play.targetAgent)}</td>
    <td>${escapeHtml(play.confidence)}</td>
    <td><span class="status-pill">${escapeHtml(play.status)}</span></td>
    <td>${escapeHtml(`${play.inventoryContext} ${play.pricingContext}`)}</td>
  </tr>`;
}

function renderBlogProfiles(): string {
  return `<section class="panel">
    <h2>Wellness style profiles</h2>
    <div class="card-grid">
      ${WELLNESS_BLOG_PROFILES.map(
        (profile) => `<article class="mini-card">
          <strong>${escapeHtml(profile.label)}</strong>
          <span>${escapeHtml(profile.summary)}</span>
        </article>`,
      ).join("")}
    </div>
  </section>`;
}

function renderBlogDrafts(drafts: BlogDraftRecord[]): string {
  return `<section class="panel">
    <h2>Blog drafts</h2>
    ${
      drafts.length
        ? `<table>
          <thead><tr><th>Draft</th><th>Profile</th><th>Status</th><th>Warnings</th><th>Shopify</th></tr></thead>
          <tbody>${drafts.slice(0, 20).map(renderBlogDraft).join("")}</tbody>
        </table>`
        : `<p class="empty">No blog drafts yet.</p>`
    }
  </section>`;
}

function renderBlogDraft(draft: BlogDraftRecord): string {
  const shopifyState = draft.shopifyArticleId
    ? `Created: ${draft.shopifyArticleHandle ?? draft.shopifyArticleId}`
    : `<form method="post" action="/api/blog-drafts/shopify"><input type="hidden" name="draftId" value="${escapeHtml(draft.id)}"><button type="submit">Create Shopify draft</button></form>`;
  return `<tr>
    <td><div class="summary-cell"><strong>${escapeHtml(draft.title)}</strong><span>${escapeHtml(draft.summary)}</span></div></td>
    <td>${escapeHtml(draft.profileLabel)}</td>
    <td><span class="status-pill">${escapeHtml(draft.status)}</span></td>
    <td>${escapeHtml(draft.claimWarnings.join(" ") || "None")}</td>
    <td>${shopifyState}</td>
  </tr>`;
}

function renderCampaignDrafts(drafts: CampaignDraftRecord[]): string {
  return `<section class="panel">
    <h2>Campaign drafts</h2>
    ${
      drafts.length
        ? `<table>
          <thead><tr><th>Campaign</th><th>Subject options</th><th>Segment</th><th>Handoff</th></tr></thead>
          <tbody>${drafts.slice(0, 20).map(
            (draft) => `<tr>
              <td><div class="summary-cell"><strong>${escapeHtml(draft.title)}</strong><span>${escapeHtml(draft.previewText)}</span></div></td>
              <td>${escapeHtml(draft.subjectLines.join(" | "))}</td>
              <td>${escapeHtml(draft.segmentIdea)}</td>
              <td><a class="inline-link" href="${escapeHtml(draft.shopifyEmailAdminPath)}">Shopify Email handoff</a></td>
            </tr>`,
          ).join("")}</tbody>
        </table>`
        : `<p class="empty">No campaign drafts yet.</p>`
    }
  </section>`;
}

function renderFlowIdeas(plays: RevenuePlayRecord[]): string {
  const flowPlays = plays.filter((play) => play.targetAgent === "flow" || play.actionType === "FLOW_SETUP");
  return `<section class="panel">
    <h2>Flow setup ideas</h2>
    ${
      flowPlays.length
        ? `<table>
          <thead><tr><th>Automation idea</th><th>Why</th><th>Status</th></tr></thead>
          <tbody>${flowPlays.map(
            (play) => `<tr><td>${escapeHtml(play.title)}</td><td>${escapeHtml(play.explanation)}</td><td><span class="status-pill">${escapeHtml(play.status)}</span></td></tr>`,
          ).join("")}</tbody>
        </table>`
        : `<p class="empty">No Flow ideas yet. Refresh Market Radar to create automation suggestions.</p>`
    }
  </section>`;
}

function renderSources(sources: SourceConnectionCard[]): string {
  return `<section class="panel">
    <h2>Source Connections</h2>
    <div class="card-grid">
      ${sources.length ? sources.map(renderSourceCard).join("") : `<p class="empty">No source connection cards configured yet.</p>`}
    </div>
  </section>`;
}

function renderSourceCard(source: SourceConnectionCard): string {
  return `<article class="mini-card source-card">
    <div class="panel-heading compact"><strong>${escapeHtml(source.label)}</strong><span class="status-pill">${escapeHtml(source.status)}</span></div>
    <span>${escapeHtml(source.notes)}</span>
    <small>${escapeHtml(source.accessMode)}${source.configured ? " - configured" : ""}</small>
  </article>`;
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

function renderSettings(suppliers: SupplierConfig[], applyChangesEnabled: boolean): string {
  return `<section class="panel">
    <h2>Automation settings</h2>
    <dl class="settings-list">
      <div><dt>Schedule</dt><dd>Weekly full sync, with manual run-now from Shopify admin.</dd></div>
      <div><dt>Write mode</dt><dd>${applyChangesEnabled ? "Enabled" : "Dry-run only until APPLY_CHANGES=true."}</dd></div>
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
  if (path.startsWith("/sources")) return "Sources";
  if (path.startsWith("/settings")) return "Settings";
  return "Dashboard";
}

function pageSubtitle(path: string): string {
  if (path.startsWith("/suppliers")) return "Configured supplier adapters and coverage.";
  if (path.startsWith("/runs")) return "Weekly and manual sync history.";
  if (path.startsWith("/changes")) return "Dry-run planned changes and real Shopify writes.";
  if (path.startsWith("/issues")) return "Blocked changes that need attention before automation proceeds.";
  if (path.startsWith("/sources")) return "Safe Market Radar source connections and platform status.";
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
    button, .button-link { border: 0; background: var(--accent); color: white; min-height: 40px; padding: 0 16px; border-radius: 6px; font-size: 14px; font-weight: 650; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
    button:hover { background: var(--accent-strong); }
    button.secondary { background: #36485c; }
    .run-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sync-status { min-height: 22px; color: var(--muted); font-size: 13px; flex-basis: 100%; }
    .sync-status.error { color: var(--error); }
    .briefing { background: #0f1f1d; color: #f8fbfa; border-radius: var(--radius); padding: 22px; margin-bottom: 16px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    .briefing h2 { margin: 0 0 6px; font-size: 22px; }
    .briefing p { color: #cfe0dc; max-width: 760px; }
    .safety-chip { display: inline-flex; align-items: center; min-height: 30px; padding: 0 10px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 999px; color: #dff7ef; font-size: 12px; font-weight: 720; white-space: nowrap; }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
    .metric, .panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .metric { padding: 16px; display: grid; gap: 10px; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 28px; }
    .agent-dock { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .agent-card { min-height: 112px; padding: 14px; display: grid; align-content: space-between; gap: 6px; color: var(--text); text-decoration: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    .agent-card:hover { border-color: #9bbcb6; }
    .agent-card.selected { border-color: var(--accent); box-shadow: inset 0 3px 0 var(--accent); }
    .agent-card strong { font-size: 26px; }
    .agent-card span { color: var(--muted); font-size: 12px; }
    .agent-card .agent-name { color: var(--text); font-size: 14px; font-weight: 760; }
    .agent-card em { color: var(--accent-strong); font-size: 12px; font-style: normal; font-weight: 700; }
    .dashboard-grid { display: grid; grid-template-columns: minmax(280px, 0.8fr) minmax(360px, 1.2fr); gap: 16px; align-items: start; }
    .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
    .panel-heading.compact { margin-bottom: 8px; }
    .panel-heading h2 { margin: 0; }
    .panel-heading span { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 999px; background: #eef6f5; color: var(--accent-strong); font-size: 12px; font-weight: 800; }
    .action-queue { display: grid; gap: 10px; }
    .action-item { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; color: var(--text); text-decoration: none; background: #fbfcfc; }
    .action-item:hover { border-color: #9bbcb6; background: #f5fbf9; }
    .action-item span { color: var(--accent-strong); font-size: 12px; font-weight: 760; }
    .action-item strong { font-size: 14px; }
    .action-item small { color: var(--muted); font-size: 12px; line-height: 1.4; }
    .agent-workspace p { max-width: 780px; }
    .agent-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
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
    .status-pill { display: inline-flex; align-items: center; min-height: 24px; padding: 0 8px; border-radius: 999px; background: #eef6f5; color: var(--accent-strong); font-size: 12px; font-weight: 700; white-space: nowrap; }
    .window-grid, .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .mini-card { border: 1px solid var(--border); border-radius: 6px; background: #fbfcfc; padding: 12px; display: grid; gap: 8px; }
    .source-card .panel-heading { align-items: flex-start; flex-direction: column; }
    .source-card .status-pill { align-self: flex-start; }
    .mini-card span, .mini-card small { color: var(--muted); font-size: 12px; line-height: 1.4; }
    .mini-card strong { font-size: 14px; }
    .radar-explanation { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px; background: #fbfcfc; }
    .radar-explanation p { margin-top: 4px; }
    .draft-form { display: grid; gap: 12px; margin-top: 16px; max-width: 720px; }
    label { display: grid; gap: 6px; color: var(--text); font-size: 13px; font-weight: 700; }
    input, select, textarea { width: 100%; border: 1px solid var(--border); border-radius: 6px; background: white; color: var(--text); padding: 10px 12px; font: inherit; font-size: 14px; }
    textarea { resize: vertical; }
    .warning-text { color: var(--warning) !important; }
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
      .briefing { flex-direction: column; }
      .agent-dock, .dashboard-grid, .agent-stats { grid-template-columns: 1fr; }
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
