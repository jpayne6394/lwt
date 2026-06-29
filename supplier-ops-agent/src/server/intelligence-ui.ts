import type {
  ActionItem,
  ActionItemPriority,
  ActionItemSource,
  ActionQueueResult,
  ConnectorStatus,
  ContentIdea,
  ContentRadarSourceSettings,
  IntelligenceDashboard,
  InventoryRiskItem,
  ProductSignal,
  ShopperBehaviorResult,
  ShopperBehaviorSourceStatus,
  ShopperProductSignal,
  ShopperRecommendation,
  ShopperSearchTerm,
  SourceItem,
} from "../agents/intelligenceTypes.ts";

export function renderIntelligencePage(model: IntelligenceDashboard | undefined): string {
  const dashboard = model ?? emptyDashboard();
  return `
    <section class="intelligence-summary">
      ${summaryCard("Inventory Risks", String(dashboard.summaryCards.inventoryRisks))}
      ${summaryCard("Sales Signal", dashboard.summaryCards.salesSignal)}
      ${summaryCard("Product Opportunities", String(dashboard.summaryCards.productOpportunities))}
      ${summaryCard("Content Ideas", String(dashboard.summaryCards.contentIdeas))}
      ${summaryCard("Shopper Recs", String(dashboard.shopperBehavior.summaryCards.newOpportunities))}
      ${summaryCard("Open Actions", String(dashboard.actionQueue.summary.openActions))}
    </section>

    <section class="intelligence-actions panel">
      <div>
        <h2>LWT Intelligence Center</h2>
        <p>Owner/operator brief for inventory, products, and content signals.</p>
      </div>
      <div class="button-row" data-intelligence-actions>
        ${runButton("inventory", "Run Inventory Scan")}
        ${runButton("content-radar", "Run Content Radar")}
        ${runButton("shopper-behavior", "Run Shopper Behavior Analysis")}
        ${runButton("daily-bi", "Run Daily Brief")}
        ${runButton("product-strategy", "Run Product Strategy")}
        <button type="button" data-weekly-brief-generate>Export Weekly Brief Markdown</button>
      </div>
      <p class="run-status" data-run-status></p>
      <div class="brief-workspace weekly-brief-workspace" data-weekly-brief-workspace hidden>
        <div class="panel-head">
          <h3>Weekly operator brief</h3>
          <button type="button" class="secondary-button" data-weekly-brief-copy>Copy Markdown</button>
        </div>
        <pre data-weekly-brief-output></pre>
      </div>
    </section>

    <section class="intel-tabs" data-tabs>
      <div class="tab-list" role="tablist">
        ${tabButton("today", "Today", true)}
        ${tabButton("inventory", "Inventory")}
        ${tabButton("strategy", "Product Strategy")}
        ${tabButton("radar", "Content Radar")}
        ${tabButton("shopper", "Shopper Behavior")}
        ${tabButton("actions", "Action Queue")}
        ${tabButton("sources", "Sources / Settings")}
      </div>
      ${tabPanel("today", renderToday(dashboard), true)}
      ${tabPanel("inventory", renderInventory(dashboard))}
      ${tabPanel("strategy", renderProductStrategy(dashboard))}
      ${tabPanel("radar", renderContentRadar(dashboard))}
      ${tabPanel("shopper", renderShopperBehavior(dashboard))}
      ${tabPanel("actions", renderActionQueue(dashboard.actionQueue))}
      ${tabPanel("sources", renderSources(dashboard))}
    </section>
    <script>${intelligenceScript()}</script>`;
}

function renderToday(model: IntelligenceDashboard): string {
  return `
    <section class="panel intelligence-panel">
      <div class="panel-head">
        <h2>LWT Daily Brief</h2>
        <span class="status-pill ${model.today.lastSuccessfulScanTime ? "success" : "warning"}">${model.today.lastSuccessfulScanTime ? "Scanned" : "Needs scan"}</span>
      </div>
      <p class="brief">${escapeHtml(model.today.brief)}</p>
      <div class="intel-grid two">
        ${listBlock("Priority actions", model.today.actionItems)}
        ${listBlock("Inventory alerts", model.today.inventoryAlerts)}
        ${listBlock("Recommendations", model.today.recommendations)}
        ${listBlock("Open action items", model.today.actionQueue.topOpenActions.map((item) => `${formatActionPriority(item.priority)}: ${item.title}`))}
        ${listBlock("Opportunity snapshot", [
          `Top shopper behavior opportunity: ${model.today.shopperBehavior.topRecommendedAction}`,
          `Top inventory risk: ${topInventoryRisk(model)}`,
          `Top content/blog opportunity: ${topContentOpportunity(model)}`,
        ])}
        ${listBlock("Shopper behavior", [
          model.today.shopperBehavior.topShopperSignal,
          model.today.shopperBehavior.topFrictionPoint,
          model.today.shopperBehavior.topRecommendedAction,
          `${model.today.shopperBehavior.openRecommendationCount} open shopper recommendations`,
        ])}
        ${listBlock("Report data", [
          model.today.reportData.description,
          `Last import: ${formatTimestamp(model.today.reportData.lastImportAt)}`,
        ])}
        ${listBlock("Last successful scan", [model.today.lastSuccessfulScanTime ?? "No successful intelligence scan yet."])}
      </div>
    </section>`;
}

function renderInventory(model: IntelligenceDashboard): string {
  return `
    <section class="panel intelligence-panel">
      <h2>Inventory</h2>
      <div class="intel-grid two">
        ${riskList("Out of stock", model.inventory.outOfStock)}
        ${riskList("Low stock", model.inventory.lowStock)}
        ${riskList("High velocity low stock", model.inventory.highVelocityLowStock, "Sales history is required for this signal.")}
        ${riskList("Dead or stale stock", model.inventory.staleStock, "Sales history is required for this signal.")}
      </div>
      <h3>Vendor / brand grouping</h3>
      ${
        model.inventory.vendorSummary.length
          ? `<table><thead><tr><th>Vendor</th><th>Critical</th><th>Watch</th><th>Normal</th></tr></thead><tbody>${model.inventory.vendorSummary
              .map(
                (vendor) =>
                  `<tr><td>${escapeHtml(vendor.vendor)}</td><td>${vendor.critical}</td><td>${vendor.watch}</td><td>${vendor.normal}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<p class="empty">No vendor inventory summary yet.</p>`
      }
    </section>`;
}

function renderProductStrategy(model: IntelligenceDashboard): string {
  return `
    <section class="panel intelligence-panel">
      <h2>Product Strategy</h2>
      <div class="intel-grid two">
        ${signalList("Top moving products", model.productStrategy.topMovingProducts, "Order history is not connected yet.")}
        ${signalList("Stock but low movement", model.productStrategy.stockButLowMovement, "Order history is not connected yet.")}
        ${signalList("Movement but low stock", model.productStrategy.movementButLowStock)}
        ${listBlock("Brands/categories worth featuring", model.productStrategy.brandsOrCategoriesToFeature)}
      </div>
      ${listBlock("Suggested collection/homepage pushes", model.productStrategy.suggestedPushes)}
      ${listBlock("Why this matters", model.productStrategy.explanations)}
    </section>`;
}

function renderContentRadar(model: IntelligenceDashboard): string {
  return `
    <section class="panel intelligence-panel">
      <h2>Content Radar</h2>
      <div class="intel-grid two">
        ${sourceItemList("Trending topics", model.contentRadar.sourceItems)}
        ${contentIdeaList("Suggested blog angles", model.contentRadar.ideas)}
      </div>
    </section>`;
}

function renderShopperBehavior(model: IntelligenceDashboard): string {
  const shopper = model.shopperBehavior;
  return `
    <section class="panel intelligence-panel">
      <div class="panel-head">
        <h2>Shopper Behavior</h2>
        <span class="status-pill ${shopper.imports.length ? "success" : "warning"}">${shopper.imports.length ? "Imports loaded" : "Waiting for import"}</span>
      </div>
      <div class="intelligence-summary compact-summary">
        ${summaryCard("Top Searches", String(shopper.summaryCards.topSearches))}
        ${summaryCard("No-Result Searches", String(shopper.summaryCards.noResultSearches))}
        ${summaryCard("Product Page Friction", String(shopper.summaryCards.productPageFriction))}
        ${summaryCard("New Opportunities", String(shopper.summaryCards.newOpportunities))}
      </div>
      ${shopperImportPanel(shopper)}
      <div class="intel-grid two">
        ${shopperSearchSection("What shoppers are looking for", shopper)}
        ${shopperFrictionSection("Where shoppers get stuck", shopper)}
        ${recommendationSection("What we should change", shopper.recommendations)}
        ${recommendationSection("What this means for content", shopper.contentOpportunities)}
      </div>
      <div class="mini-panel">
        <h3>Imported Reports / Source Status</h3>
        <div class="source-grid shopper-source-grid">
          ${Object.values(shopper.sources).map(shopperSourceStatus).join("")}
        </div>
        ${shopper.imports.length ? shopperImportTable(shopper.imports) : `<p class="empty">No shopper behavior imports yet. Place aggregate CSV/JSON files in the import folder and run Shopper Behavior Analysis.</p>`}
      </div>
    </section>`;
}

function shopperImportPanel(shopper: ShopperBehaviorResult): string {
  const latest = shopper.imports.find((item) => item.finishedAt);
  return `<div class="mini-panel import-panel">
    <div class="panel-head">
      <h3>Shopper Behavior Import</h3>
      <span class="status-pill ${latest ? "success" : "warning"}">${latest ? `${latest.rowCount} rows imported` : "No confirmed import"}</span>
    </div>
    <div class="import-controls" data-import-panel>
      <label>
        <span>Report type</span>
        <select data-import-report-type>
          <option value="shopify_search_terms">Shopify Search Terms</option>
          <option value="shopify_no_result_searches">Shopify No-Result Searches</option>
          <option value="shopify_product_engagement">Shopify Product Engagement</option>
          <option value="ga4_site_search">GA4 Site Search</option>
          <option value="ga4_landing_product_engagement">GA4 Landing/Product Page Engagement</option>
          <option value="search_console_queries">Search Console Queries</option>
          <option value="generic_shopper_behavior_csv">Generic Shopper Behavior CSV</option>
        </select>
      </label>
      <label>
        <span>CSV or JSON report</span>
        <input type="file" accept=".csv,.json,application/json,text/csv" data-import-file>
      </label>
      <label>
        <span>Paste CSV/JSON content</span>
        <textarea data-import-raw-content placeholder="Paste aggregate report content here when file picker testing is not available."></textarea>
      </label>
      <label>
        <span>Pasted content filename</span>
        <input type="text" value="pasted-shopper-report.csv" data-import-pasted-filename>
      </label>
      <div class="button-row import-buttons">
        <button type="button" data-import-preview>Preview report</button>
        <button type="button" class="secondary-button" data-import-confirm disabled>Confirm import</button>
        <button type="button" class="secondary-button" data-import-folder>Import folder reports</button>
      </div>
    </div>
    <p class="idea-feedback" data-import-feedback>Last import: ${escapeHtml(latest ? `${formatTimestamp(latest.finishedAt)} - ${latest.filename}` : "No successful import yet.")}</p>
    <pre class="import-preview" data-import-preview-output hidden></pre>
  </div>`;
}

function renderActionQueue(queue: ActionQueueResult): string {
  return `<section class="panel intelligence-panel action-queue-panel">
    <div class="panel-head">
      <h2>Action Queue</h2>
      <span class="status-pill ${queue.summary.criticalActions ? "danger" : queue.summary.openActions ? "warning" : "success"}">${queue.summary.openActions} open</span>
    </div>
    <div class="intelligence-summary compact-summary">
      ${summaryCard("Open Actions", String(queue.summary.openActions))}
      ${summaryCard("Critical", String(queue.summary.criticalActions))}
      ${summaryCard("High Priority", String(queue.summary.highPriorityActions))}
      ${summaryCard("Done This Week", String(queue.summary.doneThisWeek))}
    </div>
    <div class="action-filters">
      <label><span>Source</span><select data-action-filter="source">
        <option value="">All sources</option>
        <option value="inventory">Inventory</option>
        <option value="product_strategy">Product Strategy</option>
        <option value="content_radar">Content Radar</option>
        <option value="shopper_behavior">Shopper Behavior</option>
        <option value="blog_brief">Blog Brief</option>
        <option value="manual">Manual</option>
      </select></label>
      <label><span>Priority</span><select data-action-filter="priority">
        <option value="">All priorities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select></label>
      <label><span>Status</span><select data-action-filter="status">
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="planned">Planned</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
        <option value="rejected">Rejected</option>
      </select></label>
    </div>
    <p class="idea-feedback" data-action-filter-output></p>
    <div class="export-links">
      <a href="/api/intelligence/exports/actions?format=csv">Export Action Queue CSV</a>
      <a href="/api/intelligence/exports/actions?format=json">Export Action Queue JSON</a>
      <a href="/api/intelligence/exports/shopper-recommendations?format=csv">Export Shopper Recommendations CSV</a>
      <a href="/api/intelligence/exports/weekly-briefs?format=markdown">Export Weekly Briefs Markdown</a>
    </div>
    ${queue.items.length ? `<div class="row-list action-list">${queue.items.map(actionRow).join("")}</div>` : `<p class="empty">No action items yet. Use Add to Action Queue on recommendations.</p>`}
  </section>`;
}

function actionRow(action: ActionItem): string {
  return `<article class="recommendation-row action-row" data-action-row="${escapeHtml(action.id)}">
    <div class="idea-title-row">
      <strong>${escapeHtml(action.title)}</strong>
      <span class="status-pill ${action.priority === "critical" ? "danger" : action.priority === "high" ? "warning" : "success"}">${escapeHtml(formatActionPriority(action.priority))}</span>
      <span class="status-pill ${action.status === "rejected" ? "danger" : action.status === "done" ? "success" : "warning"}" data-action-status>${escapeHtml(formatActionStatus(action.status))}</span>
    </div>
    <p>${escapeHtml(action.explanation)}</p>
    <p><strong>Suggested action:</strong> ${escapeHtml(action.suggestedAction)}</p>
    <p>${escapeHtml([action.source, action.recommendationType, action.relatedProductTitle, action.relatedTopic, action.owner].filter(Boolean).join(" - "))}</p>
    <div class="idea-actions">
      ${actionStatusButton(action, "planned", "Mark planned")}
      ${actionStatusButton(action, "in_progress", "Mark in progress")}
      ${actionStatusButton(action, "done", "Mark done")}
      ${actionStatusButton(action, "rejected", "Reject")}
    </div>
    <div class="action-note-row">
      <input type="text" placeholder="Add note" data-action-note-input="${escapeHtml(action.id)}">
      <button type="button" class="secondary-button" data-action-note-button data-action-id="${escapeHtml(action.id)}">Add note</button>
    </div>
    <p class="idea-feedback" data-action-feedback></p>
  </article>`;
}

function renderSources(model: IntelligenceDashboard): string {
  const settings = model.sourceSettings ?? defaultSourceSettings();
  return `
    <section class="panel intelligence-panel">
      <h2>Sources / Settings</h2>
      <div class="source-grid">
        ${sourceStatus(model.sources.shopify)}
        ${sourceStatus(model.sources.x)}
        ${sourceStatus(model.sources.reddit)}
        ${sourceStatus(model.sources.search)}
      </div>
      <h3>Shopper behavior sources</h3>
      <div class="source-grid shopper-source-grid">
        ${Object.values(model.shopperBehavior.sources).map(shopperSourceStatus).join("")}
      </div>
      <div class="config-grid">
        ${settingsBlock("Topic clusters", settings.topicClusters)}
        ${settingsBlock("Keywords", settings.keywords)}
        ${settingsBlock("Excluded terms", settings.excludedTerms)}
        ${settingsBlock("Subreddits", settings.subreddits)}
        ${settingsBlock("X queries", settings.xQueries)}
        ${settingsBlock("Search queries", settings.searchQueries)}
        ${listBlock("Scan frequency", [settings.scanFrequencyNotes])}
      </div>
      ${listBlock("Missing env vars", missingEnvVars(model))}
      ${listBlock("Errors", model.errors.length ? model.errors : ["No source errors recorded."])}
      <div class="setup-note">
        <h3>Setup notes</h3>
        <p>Use Shopify Admin credentials for product and inventory reads. Use official X and Reddit API credentials only; the app does not scrape private or unauthorized social data.</p>
      </div>
    </section>`;
}

function summaryCard(label: string, value: string): string {
  return `<article class="intel-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function actionCreateButton(input: {
  source: ActionItemSource;
  priority: ActionItemPriority;
  recommendationType: string;
  title: string;
  explanation: string;
  suggestedAction: string;
  relatedProductId?: string;
  relatedProductTitle?: string;
  relatedTopic?: string;
}): string {
  return `<button type="button" class="secondary-button action-create-button"
    data-action-create
    data-action-source="${escapeHtml(input.source)}"
    data-action-priority="${escapeHtml(input.priority)}"
    data-action-recommendation-type="${escapeHtml(input.recommendationType)}"
    data-action-title="${escapeHtml(input.title)}"
    data-action-explanation="${escapeHtml(input.explanation)}"
    data-action-suggested-action="${escapeHtml(input.suggestedAction)}"
    data-action-related-product-id="${escapeHtml(input.relatedProductId ?? "")}"
    data-action-related-product-title="${escapeHtml(input.relatedProductTitle ?? "")}"
    data-action-related-topic="${escapeHtml(input.relatedTopic ?? "")}">Add to Action Queue</button>`;
}

function actionStatusButton(action: ActionItem, status: ActionItem["status"], label: string): string {
  return `<button type="button" class="secondary-button" data-action-status-button data-action-id="${escapeHtml(action.id)}" data-next-status="${escapeHtml(status)}">${escapeHtml(label)}</button>`;
}

function runButton(runType: string, label: string): string {
  return `<button type="button" data-run-type="${runType}">${escapeHtml(label)}</button>`;
}

function tabButton(id: string, label: string, selected = false): string {
  return `<button type="button" role="tab" aria-selected="${selected ? "true" : "false"}" aria-controls="tab-${id}" data-tab="${id}">${escapeHtml(label)}</button>`;
}

function tabPanel(id: string, content: string, selected = false): string {
  return `<div id="tab-${id}" role="tabpanel" data-panel="${id}" ${selected ? "" : "hidden"}>${content}</div>`;
}

function listBlock(title: string, items: string[]): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
        : `<p class="empty">No items yet.</p>`
    }
  </div>`;
}

function riskList(title: string, items: InventoryRiskItem[], fallback = "No items yet."): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="row-list">${items.map((item) => riskRow(item)).join("")}</div>`
        : `<p class="empty">${escapeHtml(fallback)}</p>`
    }
  </div>`;
}

function riskRow(item: InventoryRiskItem): string {
  return `<article class="signal-row">
    <span class="status-pill ${item.priority === "Critical" ? "danger" : "warning"}">${escapeHtml(item.priority)}</span>
    <div>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.vendor)}${item.quantity === null ? "" : ` - Qty ${item.quantity}`}</p>
      ${actionCreateButton({
        source: "inventory",
        priority: priorityFromLabel(item.priority),
        recommendationType: "inventory_risk",
        title: item.title,
        explanation: item.reason,
        suggestedAction: "Review availability before featuring or replenishment decisions.",
        relatedProductId: item.productId,
        relatedProductTitle: item.title,
      })}
    </div>
  </article>`;
}

function signalList(title: string, items: ProductSignal[], fallback = "No items yet."): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="row-list">${items.map((item) => `<article class="signal-row"><span class="status-pill ${item.priority === "Critical" ? "danger" : "warning"}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.productTitle)}</strong><p>${escapeHtml(item.reason)}</p>${actionCreateButton({
            source: "product_strategy",
            priority: priorityFromLabel(item.priority),
            recommendationType: item.signalType,
            title: item.reason,
            explanation: item.reason,
            suggestedAction: "Review this product strategy signal before changing merchandising.",
            relatedProductId: item.shopifyProductId,
            relatedProductTitle: item.productTitle,
          })}</div></article>`).join("")}</div>`
        : `<p class="empty">${escapeHtml(fallback)}</p>`
    }
  </div>`;
}

function sourceItemList(title: string, items: SourceItem[]): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="row-list">${items.slice(0, 12).map((item) => `<article class="source-row"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.source)} - ${escapeHtml(item.textExcerpt)}</p></article>`).join("")}</div>`
        : `<p class="empty">No content sources collected yet.</p>`
    }
  </div>`;
}

function contentIdeaList(title: string, items: ContentIdea[]): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="row-list">${items.slice(0, 12).map(contentIdeaRow).join("")}</div>
          <div class="brief-workspace" data-brief-workspace hidden>
            <div class="panel-head">
              <h3>Markdown blog brief</h3>
              <button type="button" class="secondary-button" data-brief-copy>Copy Markdown</button>
            </div>
            <pre data-brief-output></pre>
          </div>`
        : `<p class="empty">No content ideas yet.</p>`
    }
  </div>`;
}

function contentIdeaRow(idea: ContentIdea): string {
  return `<article class="idea-row" data-idea-card="${escapeHtml(idea.id)}">
    <div class="idea-main">
      <div class="idea-title-row">
        <strong>${escapeHtml(idea.suggestedTitle)}</strong>
        <span class="status-pill ${statusClassForIdea(idea.status)}" data-idea-status>${escapeHtml(formatIdeaStatus(idea.status))}</span>
      </div>
      <p>${escapeHtml(idea.productTieIn)}</p>
      <details>
        <summary>View details</summary>
        <dl class="idea-detail-list">
          <div><dt>Topic</dt><dd>${escapeHtml(idea.topic)}</dd></div>
          <div><dt>Source summary</dt><dd>${escapeHtml(idea.sourceSummary)}</dd></div>
          <div><dt>Compliance risk</dt><dd>${escapeHtml(idea.complianceRisk)} - ${escapeHtml(idea.complianceReason ?? "No additional note.")}</dd></div>
          <div><dt>Safer angle</dt><dd>${escapeHtml(idea.saferAngle ?? "Keep this educational and consult-first.")}</dd></div>
          <div><dt>CTA</dt><dd>${escapeHtml(idea.suggestedCta)}</dd></div>
        </dl>
      </details>
      <div class="idea-actions">
        <button type="button" class="secondary-button" data-idea-action="approve" data-idea-id="${escapeHtml(idea.id)}">Approve idea</button>
        <button type="button" class="secondary-button danger-button" data-idea-action="reject" data-idea-id="${escapeHtml(idea.id)}">Reject idea</button>
        <button type="button" data-idea-action="blog-brief" data-idea-id="${escapeHtml(idea.id)}">Generate brief</button>
        ${actionCreateButton({
          source: "content_radar",
          priority: idea.complianceRisk === "High" ? "high" : "medium",
          recommendationType: "content_idea",
          title: idea.suggestedTitle,
          explanation: idea.sourceSummary,
          suggestedAction: idea.suggestedCta,
          relatedTopic: idea.topic,
        })}
        ${actionCreateButton({
          source: "blog_brief",
          priority: idea.complianceRisk === "High" ? "high" : "medium",
          recommendationType: "blog_brief",
          title: `Draft blog brief for ${idea.topic}`,
          explanation: idea.sourceSummary,
          suggestedAction: "Generate and review the Markdown blog brief before any publishing step.",
          relatedTopic: idea.topic,
        })}
      </div>
      <p class="idea-feedback" data-idea-feedback></p>
    </div>
    <span class="status-pill ${riskClass(idea.complianceRisk)}">${escapeHtml(idea.complianceRisk)}</span>
  </article>`;
}

function shopperSearchSection(title: string, shopper: ShopperBehaviorResult): string {
  const terms = [
    ...shopper.searchSignals.topSearches.slice(0, 5),
    ...shopper.searchSignals.noResultSearches.slice(0, 5),
    ...shopper.searchSignals.noClickSearches.slice(0, 5),
  ];
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      terms.length
        ? `<div class="row-list">${dedupeBy(terms, (term) => term.id).slice(0, 12).map(shopperSearchRow).join("")}</div>`
        : `<p class="empty">No shopper search import yet.</p>`
    }
  </div>`;
}

function shopperSearchRow(term: ShopperSearchTerm): string {
  const details = [
    `${term.searchCount} searches`,
    `${term.noResultsCount ?? 0} no-result`,
    `${term.noClickCount ?? 0} no-click`,
    term.dateRange,
  ].filter(Boolean);
  return `<article class="source-row">
    <div>
      <strong>${escapeHtml(term.term)}</strong>
      <p>${escapeHtml(details.join(" - "))}</p>
    </div>
    <span class="status-pill ${term.noResultsCount ? "warning" : "success"}">${escapeHtml(term.source)}</span>
  </article>`;
}

function shopperFrictionSection(title: string, shopper: ShopperBehaviorResult): string {
  const items = [
    ...shopper.frictionSignals,
    ...shopper.searchSignals.noResultSearches.map((term) => ({
      id: `no_result_${term.id}`,
      productTitle: term.term,
      signalType: "high_search_no_results",
      metricName: "no_results_count",
      metricValue: term.noResultsCount ?? 0,
      priority: term.searchCount >= 75 ? "Critical" : "Watch",
      reason: `${term.term} has search volume but weak product engagement because results are missing or unclear.`,
      createdAt: term.createdAt,
      source: term.source,
      dateRange: term.dateRange,
    }) satisfies ShopperProductSignal),
  ];
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="row-list">${items.slice(0, 12).map(shopperProductSignalRow).join("")}</div>`
        : `<p class="empty">No product friction signal yet.</p>`
    }
  </div>`;
}

function shopperProductSignalRow(signal: ShopperProductSignal): string {
  return `<article class="signal-row">
    <span class="status-pill ${signal.priority === "Critical" ? "danger" : "warning"}">${escapeHtml(signal.priority)}</span>
    <div>
      <strong>${escapeHtml(signal.productTitle)}</strong>
      <p>${escapeHtml(signal.reason)}${signal.dateRange ? ` - ${escapeHtml(signal.dateRange)}` : ""}</p>
    </div>
  </article>`;
}

function recommendationSection(title: string, recommendations: ShopperRecommendation[]): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      recommendations.length
        ? `<div class="row-list">${recommendations.slice(0, 12).map(recommendationRow).join("")}</div>`
        : `<p class="empty">No recommendations yet.</p>`
    }
  </div>`;
}

function recommendationRow(recommendation: ShopperRecommendation): string {
  return `<article class="recommendation-row">
    <div class="idea-title-row">
      <strong>${escapeHtml(recommendation.title)}</strong>
      <span class="status-pill ${recommendation.priority === "Critical" ? "danger" : recommendation.priority === "Watch" ? "warning" : "success"}">${escapeHtml(recommendation.priority)}</span>
    </div>
    <p><strong>What happened:</strong> ${escapeHtml(recommendation.explanation)}</p>
    <p><strong>Suggested action:</strong> ${escapeHtml(recommendation.suggestedAction ?? "Review this opportunity before making store changes.")}</p>
    <p>${escapeHtml([recommendation.relatedTerm, recommendation.relatedProductTitle, recommendation.source, recommendation.dateRange].filter(Boolean).join(" - "))}</p>
    ${actionCreateButton({
      source: "shopper_behavior",
      priority: priorityFromLabel(recommendation.priority),
      recommendationType: recommendation.recommendationType,
      title: recommendation.title,
      explanation: recommendation.explanation,
      suggestedAction: recommendation.suggestedAction ?? "Review this shopper behavior recommendation.",
      relatedProductId: recommendation.relatedProductId,
      relatedProductTitle: recommendation.relatedProductTitle,
      relatedTopic: recommendation.relatedTerm,
    })}
  </article>`;
}

function shopperSourceStatus(status: ShopperBehaviorSourceStatus): string {
  const label = status.status === "not_configured" ? "Not configured" : status.status === "connected" ? "Ready" : "Error";
  return `<article class="source-card">
    <div class="panel-head"><h3>${escapeHtml(status.label)}</h3><span class="status-pill ${statusClass(status.status)}">${escapeHtml(label)}</span></div>
    <p>${escapeHtml(status.message ?? label)}</p>
    <p class="source-last-run">Last import: ${escapeHtml(formatTimestamp(status.lastImportAt))}</p>
    ${
      status.missingEnvVars.length
        ? `<p class="env-list">${escapeHtml(status.missingEnvVars.join(", "))}</p>`
        : `<p class="env-list">No secret shown</p>`
    }
  </article>`;
}

function shopperImportTable(imports: ShopperBehaviorResult["imports"]): string {
  return `<table>
    <thead><tr><th>Finished</th><th>Source</th><th>Type</th><th>Rows</th><th>Status</th><th>File</th></tr></thead>
    <tbody>${imports
      .slice(0, 10)
      .map(
        (item) => `<tr>
          <td>${escapeHtml(formatTimestamp(item.finishedAt))}</td>
          <td>${escapeHtml(item.source)}</td>
          <td>${escapeHtml(item.importType)}</td>
          <td>${item.rowCount}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(item.filename)}</td>
        </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function sourceStatus(status: ConnectorStatus): string {
  const label = status.status === "not_configured" ? "Connector not configured" : status.status === "connected" ? "Configured" : "Error";
  return `<article class="source-card">
    <div class="panel-head"><h3>${escapeHtml(status.label)}</h3><span class="status-pill ${statusClass(status.status)}">${escapeHtml(label)}</span></div>
    <p>${escapeHtml(status.message ?? label)}</p>
    <p class="source-last-run">Last run: ${escapeHtml(formatTimestamp(status.lastRunAt))}</p>
    ${
      status.missingEnvVars.length
        ? `<p class="env-list">${escapeHtml(status.missingEnvVars.join(", "))}</p>`
        : `<p class="env-list">Ready</p>`
    }
  </article>`;
}

function settingsBlock(title: string, items: string[]): string {
  return `<div class="mini-panel">
    <h3>${escapeHtml(title)}</h3>
    ${
      items.length
        ? `<div class="tag-list">${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
        : `<p class="empty">No settings configured.</p>`
    }
  </div>`;
}

function missingEnvVars(model: IntelligenceDashboard): string[] {
  const vars = Object.values(model.sources).flatMap((source) => source.missingEnvVars);
  return vars.length ? [...new Set(vars)] : ["No required connector env vars are missing."];
}

function topInventoryRisk(model: IntelligenceDashboard): string {
  const risk = [
    ...model.inventory.outOfStock,
    ...model.inventory.lowStock,
    ...model.inventory.highVelocityLowStock,
    ...model.inventory.staleStock,
  ][0];
  return risk ? `${risk.title} - ${risk.reason}` : "No inventory risk available yet.";
}

function topContentOpportunity(model: IntelligenceDashboard): string {
  return model.shopperBehavior.contentOpportunities[0]?.title ?? model.contentRadar.ideas[0]?.suggestedTitle ?? "No content/blog opportunity available yet.";
}

function statusClass(status: ConnectorStatus["status"]): string {
  if (status === "connected") return "success";
  if (status === "error") return "danger";
  return "warning";
}

function riskClass(risk: string): string {
  if (risk === "High") return "danger";
  if (risk === "Medium") return "warning";
  return "success";
}

function statusClassForIdea(status: ContentIdea["status"]): string {
  if (status === "approved" || status === "drafted") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function formatIdeaStatus(status: ContentIdea["status"]): string {
  if (status === "idea") return "Idea";
  if (status === "approved") return "Approved";
  if (status === "drafted") return "Drafted";
  return "Rejected";
}

function formatActionPriority(priority: ActionItemPriority): string {
  if (priority === "critical") return "Critical";
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  return "Low";
}

function formatActionStatus(status: ActionItem["status"]): string {
  if (status === "in_progress") return "In progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function priorityFromLabel(priority: string): ActionItemPriority {
  if (priority === "Critical") return "critical";
  if (priority === "Watch") return "high";
  return "medium";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "No successful run yet";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function intelligenceScript(): string {
  return `
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.getAttribute("data-tab");
        document.querySelectorAll("[data-tab]").forEach((item) => item.setAttribute("aria-selected", item === button ? "true" : "false"));
        document.querySelectorAll("[data-panel]").forEach((panel) => {
          panel.hidden = panel.getAttribute("data-panel") !== tab;
        });
      });
    });
    document.querySelectorAll("[data-run-type]").forEach((button) => {
      button.addEventListener("click", async () => {
        const status = document.querySelector("[data-run-status]");
        const runType = button.getAttribute("data-run-type");
        button.disabled = true;
        status.textContent = "Running " + button.textContent + "...";
        try {
          const response = await fetch("/api/intelligence/run/" + runType, { method: "POST" });
          if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            throw new Error(json.error || "Run failed with " + response.status + ". Check connector setup and try again.");
          }
          status.textContent = button.textContent + " complete. Refreshing...";
          window.location.reload();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Run failed.";
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-idea-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.getAttribute("data-idea-action");
        const id = button.getAttribute("data-idea-id");
        const card = button.closest("[data-idea-card]");
        const feedback = card ? card.querySelector("[data-idea-feedback]") : null;
        const status = card ? card.querySelector("[data-idea-status]") : null;
        const workspace = document.querySelector("[data-brief-workspace]");
        const output = document.querySelector("[data-brief-output]");
        if (!action || !id) return;
        button.disabled = true;
        if (feedback) feedback.textContent = action === "blog-brief" ? "Generating brief..." : "Saving status...";
        try {
          const response = await fetch("/api/intelligence/content-ideas/" + encodeURIComponent(id) + "/" + action, { method: "POST" });
          if (!response.ok) throw new Error("Request failed with " + response.status);
          const json = await response.json();
          if (json.idea && status) {
            status.textContent = json.idea.status.charAt(0).toUpperCase() + json.idea.status.slice(1);
            status.className = "status-pill " + (json.idea.status === "rejected" ? "danger" : "success");
          }
          if (json.markdown && output && workspace) {
            output.textContent = json.markdown;
            workspace.hidden = false;
          }
          if (feedback) feedback.textContent = action === "blog-brief" ? "Brief ready." : "Status saved.";
        } catch (error) {
          if (feedback) feedback.textContent = error instanceof Error ? error.message : "Request failed.";
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelector("[data-brief-copy]")?.addEventListener("click", async (event) => {
      const output = document.querySelector("[data-brief-output]");
      const text = output ? output.textContent || "" : "";
      if (!text) return;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        event.currentTarget.textContent = "Copied";
      }
    });
    let pendingImport = null;
    async function selectedImportFile() {
      const input = document.querySelector("[data-import-file]");
      const file = input && input.files && input.files[0] ? input.files[0] : null;
      if (file) return { filename: file.name, content: await file.text() };
      const raw = document.querySelector("[data-import-raw-content]")?.value || "";
      const pastedFilename = document.querySelector("[data-import-pasted-filename]")?.value || "pasted-shopper-report.csv";
      if (raw.trim()) return { filename: pastedFilename.trim() || "pasted-shopper-report.csv", content: raw };
      throw new Error("Choose a CSV/JSON file or paste report content before previewing. The report was not imported.");
    }
    document.querySelector("[data-import-preview]")?.addEventListener("click", async (event) => {
      const feedback = document.querySelector("[data-import-feedback]");
      const output = document.querySelector("[data-import-preview-output]");
      const confirm = document.querySelector("[data-import-confirm]");
      const reportType = document.querySelector("[data-import-report-type]")?.value;
      event.currentTarget.disabled = true;
      if (feedback) feedback.textContent = "Previewing report...";
      try {
        const file = await selectedImportFile();
        pendingImport = { ...file, reportType };
        const response = await fetch("/api/intelligence/shopper-behavior/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingImport),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Preview failed.");
        if (output) {
          output.hidden = false;
          output.textContent = JSON.stringify({
            valid: json.valid,
            rows: json.rowCount,
            mappedColumns: json.mappedColumns,
            missingColumns: json.missingColumns,
            sampleRows: json.sampleRows,
          }, null, 2);
        }
        if (confirm) confirm.disabled = !json.valid;
        if (feedback) feedback.textContent = json.operatorMessage || (json.valid ? "Preview valid. Confirm import when ready." : json.errors.join(" "));
      } catch (error) {
        pendingImport = null;
        if (confirm) confirm.disabled = true;
        if (feedback) feedback.textContent = error instanceof Error ? error.message : "Preview failed. The report was not imported.";
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    document.querySelector("[data-import-confirm]")?.addEventListener("click", async (event) => {
      const feedback = document.querySelector("[data-import-feedback]");
      if (!pendingImport) {
        if (feedback) feedback.textContent = "Preview a valid report before confirming.";
        return;
      }
      event.currentTarget.disabled = true;
      if (feedback) feedback.textContent = "Importing report...";
      try {
        const response = await fetch("/api/intelligence/shopper-behavior/import/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingImport),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Import failed.");
        if (feedback) feedback.textContent = "Imported " + json.importRecord.rowCount + " rows. Refreshing...";
        window.location.reload();
      } catch (error) {
        if (feedback) feedback.textContent = error instanceof Error ? error.message : "Import failed.";
        event.currentTarget.disabled = false;
      }
    });
    document.querySelector("[data-import-folder]")?.addEventListener("click", async (event) => {
      const feedback = document.querySelector("[data-import-feedback]");
      event.currentTarget.disabled = true;
      if (feedback) feedback.textContent = "Importing folder reports...";
      try {
        const response = await fetch("/api/intelligence/shopper-behavior/import", { method: "POST" });
        if (!response.ok) {
          const json = await response.json().catch(() => ({}));
          throw new Error(json.error || "Folder import failed with " + response.status + ". Check import folder files and try again.");
        }
        if (feedback) feedback.textContent = "Folder import complete. Refreshing...";
        window.location.reload();
      } catch (error) {
        if (feedback) feedback.textContent = error instanceof Error ? error.message : "Folder import failed.";
        event.currentTarget.disabled = false;
      }
    });
    document.querySelectorAll("[data-action-create]").forEach((button) => {
      button.addEventListener("click", async () => {
        const feedback = button.closest("article")?.querySelector("[data-action-feedback], [data-idea-feedback]") || button.parentElement?.querySelector("[data-idea-feedback]");
        button.disabled = true;
        if (feedback) feedback.textContent = "Adding to Action Queue...";
        try {
          const recommendation = {
            title: button.getAttribute("data-action-title"),
            priority: button.getAttribute("data-action-priority"),
            recommendationType: button.getAttribute("data-action-recommendation-type"),
            relatedProductId: button.getAttribute("data-action-related-product-id") || undefined,
            relatedProductTitle: button.getAttribute("data-action-related-product-title") || undefined,
            relatedTopic: button.getAttribute("data-action-related-topic") || undefined,
            explanation: button.getAttribute("data-action-explanation"),
            suggestedAction: button.getAttribute("data-action-suggested-action"),
          };
          const response = await fetch("/api/intelligence/actions/from-recommendation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: button.getAttribute("data-action-source"), recommendation }),
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Action create failed.");
          if (feedback) feedback.textContent = "Added to Action Queue.";
        } catch (error) {
          if (feedback) feedback.textContent = error instanceof Error ? error.message : "Action create failed.";
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-action-status-button]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-action-id");
        const status = button.getAttribute("data-next-status");
        const row = button.closest("[data-action-row]");
        const feedback = row ? row.querySelector("[data-action-feedback]") : null;
        const badge = row ? row.querySelector("[data-action-status]") : null;
        if (!id || !status) return;
        button.disabled = true;
        if (feedback) feedback.textContent = "Saving action...";
        try {
          const response = await fetch("/api/intelligence/actions/" + encodeURIComponent(id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Action update failed.");
          if (badge) badge.textContent = json.action.status === "in_progress" ? "In progress" : json.action.status.charAt(0).toUpperCase() + json.action.status.slice(1);
          if (feedback) feedback.textContent = "Action updated.";
        } catch (error) {
          if (feedback) feedback.textContent = error instanceof Error ? error.message : "Action update failed.";
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-action-note-button]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-action-id");
        const row = button.closest("[data-action-row]");
        const input = id ? document.querySelector("[data-action-note-input='" + CSS.escape(id) + "']") : null;
        const feedback = row ? row.querySelector("[data-action-feedback]") : null;
        if (!id || !input) return;
        button.disabled = true;
        try {
          const response = await fetch("/api/intelligence/actions/" + encodeURIComponent(id) + "/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: input.value }),
          });
          const json = await response.json();
          if (!response.ok) throw new Error(json.error || "Note create failed.");
          input.value = "";
          if (feedback) feedback.textContent = "Note added.";
        } catch (error) {
          if (feedback) feedback.textContent = error instanceof Error ? error.message : "Note create failed.";
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-action-filter]").forEach((select) => {
      select.addEventListener("change", async () => {
        const params = new URLSearchParams();
        document.querySelectorAll("[data-action-filter]").forEach((filter) => {
          if (filter.value) params.set(filter.getAttribute("data-action-filter"), filter.value);
        });
        const output = document.querySelector("[data-action-filter-output]");
        const response = await fetch("/api/intelligence/actions" + (params.toString() ? "?" + params.toString() : ""));
        const json = await response.json();
        if (output) output.textContent = json.items ? json.items.length + " matching actions." : "Filter failed.";
      });
    });
    document.querySelector("[data-weekly-brief-generate]")?.addEventListener("click", async (event) => {
      const status = document.querySelector("[data-run-status]");
      const workspace = document.querySelector("[data-weekly-brief-workspace]");
      const output = document.querySelector("[data-weekly-brief-output]");
      event.currentTarget.disabled = true;
      if (status) status.textContent = "Generating weekly brief...";
      try {
        const response = await fetch("/api/intelligence/weekly-brief/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Weekly brief failed.");
        if (output) output.textContent = json.markdown;
        if (workspace) workspace.hidden = false;
        if (status) status.textContent = "Weekly brief ready.";
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : "Weekly brief failed.";
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    document.querySelector("[data-weekly-brief-copy]")?.addEventListener("click", async (event) => {
      const output = document.querySelector("[data-weekly-brief-output]");
      const text = output ? output.textContent || "" : "";
      if (!text || !navigator.clipboard) return;
      await navigator.clipboard.writeText(text);
      event.currentTarget.textContent = "Copied";
    });
  `;
}

function emptyDashboard(): IntelligenceDashboard {
  return {
    summaryCards: { inventoryRisks: 0, salesSignal: "Setup needed", productOpportunities: 0, contentIdeas: 0 },
    today: {
      brief: "No intelligence runs yet.",
      actionItems: [],
      inventoryAlerts: [],
      recommendations: [],
      lastSuccessfulScanTime: null,
      shopperBehavior: {
        topShopperSignal: "No shopper search imports yet.",
        topFrictionPoint: "No product friction import yet.",
        topRecommendedAction: "Import shopper behavior reports to create recommendations.",
        openRecommendationCount: 0,
      },
      actionQueue: {
        topOpenActions: [],
        summaryText: "0 open actions, 0 critical, 0 high priority.",
      },
      reportData: {
        lastImportAt: null,
        mode: "no_report_data",
        description: "No manual report data has been imported yet; missing analytics connectors remain in graceful fallback mode.",
      },
    },
    inventory: { lowStock: [], outOfStock: [], highVelocityLowStock: [], staleStock: [], vendorSummary: [] },
    productStrategy: {
      generatedAt: new Date().toISOString(),
      topMovingProducts: [],
      stockButLowMovement: [],
      movementButLowStock: [],
      brandsOrCategoriesToFeature: [],
      suggestedPushes: [],
      explanations: [],
    },
    contentRadar: { sourceItems: [], ideas: [] },
    shopperBehavior: defaultShopperBehavior(),
    actionQueue: {
      summary: {
        openActions: 0,
        criticalActions: 0,
        highPriorityActions: 0,
        doneThisWeek: 0,
        rejectedActions: 0,
      },
      items: [],
    },
    sources: {
      shopify: { label: "Shopify", status: "not_configured", missingEnvVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"] },
      x: { label: "X", status: "not_configured", missingEnvVars: ["X_BEARER_TOKEN"] },
      reddit: { label: "Reddit", status: "not_configured", missingEnvVars: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"] },
      search: { label: "Search/Trends", status: "not_configured", missingEnvVars: ["SEARCH_PROVIDER_KEY"] },
    },
    sourceSettings: defaultSourceSettings(),
    errors: [],
  };
}

function defaultShopperBehavior(): ShopperBehaviorResult {
  return {
    generatedAt: new Date().toISOString(),
    sources: {
      shopify: {
        label: "Shopify products/orders",
        status: "not_configured",
        missingEnvVars: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
        message: "Not configured - shopper behavior still uses manual imports/fallback.",
      },
      shopify_search_discovery_import: {
        label: "Shopify Search & Discovery import",
        status: "connected",
        missingEnvVars: [],
        message: "Ready for CSV/JSON aggregate report import.",
      },
      shopify_analytics_import: {
        label: "Shopify analytics import",
        status: "connected",
        missingEnvVars: [],
        message: "Ready for CSV/JSON aggregate report import.",
      },
      ga4: {
        label: "GA4 connector",
        status: "not_configured",
        missingEnvVars: ["GA4_PROPERTY_ID", "GA4_CREDENTIALS_JSON"],
        message: "Not configured - use manual import/fallback.",
      },
      search_console: {
        label: "Search Console connector",
        status: "not_configured",
        missingEnvVars: ["SEARCH_CONSOLE_SITE_URL", "SEARCH_CONSOLE_CREDENTIALS_JSON"],
        message: "Not configured - use manual import/fallback.",
      },
      manual_import: {
        label: "Manual import folder",
        status: "connected",
        missingEnvVars: [],
        message: "Ready - place aggregate CSV/JSON reports in imports/shopper-behavior.",
      },
    },
    summaryCards: { topSearches: 0, noResultSearches: 0, productPageFriction: 0, newOpportunities: 0 },
    searchSignals: {
      topSearches: [],
      risingSearches: [],
      noResultSearches: [],
      noClickSearches: [],
      missingProductSearches: [],
      missingCollectionSearches: [],
      blogTopicSearches: [],
    },
    frictionSignals: [],
    recommendations: [],
    contentOpportunities: [],
    imports: [],
    todaySummary: {
      topShopperSignal: "No shopper search imports yet.",
      topFrictionPoint: "No product friction import yet.",
      topRecommendedAction: "Import shopper behavior reports to create recommendations.",
      openRecommendationCount: 0,
    },
    errors: [],
  };
}

function defaultSourceSettings(): ContentRadarSourceSettings {
  return {
    topicClusters: [],
    keywords: [],
    excludedTerms: [],
    subreddits: ["Supplements"],
    xQueries: [],
    searchQueries: [],
    scanFrequencyNotes: "Manual fallback runs on demand.",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
