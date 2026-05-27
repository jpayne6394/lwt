# Supplier Ops Agent

Embedded Shopify admin app and background worker for supplier-driven inventory and pricing automation.

## What v1 does

- Checks Emerson Ecologics, BioResource/Pekana, Systemic Formulas, Research Nutritionals, World Health Mall, DesBio, and Physicians' Standard through supplier adapters.
- Normalizes supplier stock, cost, MSRP/list price, sale price, SKU, UPC, product URL, and images.
- Matches products by manual mapping, exact SKU, exact UPC, then high-confidence vendor/title matching.
- Updates existing Shopify variants automatically, across active, draft, and archived products.
- Sets out-of-stock to `0`, in-stock without exact quantity to `10`, and exact supplier quantity when present.
- Uses supplier MSRP/list price first; otherwise falls back to `2x` cost. Supplier sales mirror into price plus compare-at price.
- Blocks uncertain matches, supplier failures, login/2FA problems, parser errors, and price swings over 25%.
- Creates newly discovered supplier products as Shopify drafts only.
- Adds a Product Operations Agent layer that classifies promotion readiness without changing product copy, tags, types, collections, or promotions.
- Adds a BI-led command workbench with Market Radar, revenue plays, source connection cards, blog template drafts, campaign briefs, and a Shopify Flow launchpad.

## Product Operations Agent

Every supplier run now emits a structured `product_ops` output. The output includes run mode, timing, products checked, variants checked, supplier count, promotion readiness counts, promotion queues, promotion tasks, cleanup tasks, review tasks, operational errors, planned supplier changes, and blocked issues.

Promotion statuses use this priority order:

1. `DO_NOT_PROMOTE`
2. `REVIEW_REQUIRED`
3. `OUT_OF_STOCK`
4. `LOW_STOCK`
5. `BAD_PAGE`
6. `NEEDS_DATA_CLEANUP`
7. `PROMOTE_READY`

Readiness checks cover active and published status, confident supplier match, stock status, image presence, price, description, title, vendor, product type, product form, useful tags, and do-not-promote/discontinued/risky tags.

Suggested tasks use these action types: `PROMOTE`, `FIX`, `WRITE`, `AUTOMATE`, `IGNORE`, and `REVIEW`. V1 only suggests work; it does not auto-edit titles, descriptions, tags, product types, metafields, collections, or promotions.

Dry-run is safe by default. Shopify writes only run when `APPLY_CHANGES=true` is set. Without that environment variable, manual write clicks and scheduled runs are forced into dry-run mode.

## BI Market Radar and command workbench

The dashboard now includes sub-agent workbenches for BI Analyst, Inventory Ops, Product Ops, Campaign Planner, Blog Publisher, and Flow Launchpad.

Market Radar is free-first and rule-based by default:

- Builds sales windows for today, 7, 30, 90, and 365 days when order scope is available.
- Uses cached Shopify catalog/Product Ops output, optional open-web URLs, optional competitor price URLs, and official/API-safe source statuses.
- Produces evidence-backed revenue plays for blog drafts, email campaign briefs, pricing checks, bundles/restock opportunities, and Flow setup ideas.
- Keeps social platforms as safe connector cards. Do not store social passwords or cookie-scraping sessions; use official API/OAuth access when available.
- Adds light health-claim warnings for risky language, but leaves final compliance review to the human reviewer.

Optional source env vars:

```bash
MARKET_RADAR_SOURCE_URLS=https://example.com/rss,https://example.com/wellness-newsletter
COMPETITOR_PRICE_URLS=[{"productHandle":"magnesium-glycinate","productTitle":"Magnesium Glycinate","competitor":"Competitor A","url":"https://competitor.example/products/magnesium"}]
REDDIT_ACCESS_TOKEN=optional-official-token
META_ACCESS_TOKEN=optional-official-token
X_BEARER_TOKEN=optional-paid-api-token
PINTEREST_ACCESS_TOKEN=optional-official-token
TRUTH_SOCIAL_APPROVED_ACCESS=false
```

Blog Publisher uses saved wellness templates, not paid AI calls. It can create local article drafts and then create Shopify draft articles after approval. Campaign Planner creates Shopify Email handoff briefs; it does not send emails. Flow Launchpad stores setup ideas, links into the Shopify Flow app, and includes copy-ready professional email templates for Flow-triggered customer and internal operations emails. It does not auto-edit workflows.

## Hybrid local intelligence

The Business OS page adds a Chief of Staff Agent that coordinates modular sub-agents in free-first hybrid mode now and OpenAI mode later. It is not a chatbot: every agent returns structured JSON, recommendations are logged, and Shopify tools stay behind approval.

Environment defaults are free-first. `hybrid` tries a protected local Ollama-style relay when it is configured and falls back to deterministic rules/templates when it is not:

```bash
AI_PROVIDER=hybrid
OPENAI_API_KEY=
AUTONOMY_MODE=approval
LOCAL_LLM_RELAY_URL=
LOCAL_LLM_RELAY_TOKEN=
LOCAL_LLM_MODEL=auto
LOCAL_LLM_TIMEOUT_MS=15000
LOCAL_LLM_DATA_SCOPE=internal
LOCAL_LLM_MAX_INPUT_CHARS=24000
```

To run the optional local brain on your computer:

```bash
# 1. Start Ollama locally and pull at least one chat model.
# 2. Set a private relay token, then run:
LOCAL_LLM_RELAY_TOKEN=your-long-random-token npm run local-llm-relay
```

If you expose that relay through a tunnel for Render, put the tunnel URL in `LOCAL_LLM_RELAY_URL` and the same token in `LOCAL_LLM_RELAY_TOKEN`. The relay requires `Authorization: Bearer <token>`, auto-detects the best installed chat model when `LOCAL_LLM_MODEL=auto`, and does not log raw prompts or model responses.

Hybrid intelligence can polish Chief of Staff reasoning, Market Radar explanations, blog drafts, Shopify Email briefs, and Flow email copy. The deterministic rule engine still owns risk scoring, action lanes, approvals, and Shopify safety. If the local brain is offline, malformed, or slow, the app keeps working in fallback mode.

Sub-agents:

- Inventory Agent
- Merchandising Agent
- Marketing Agent
- SEO/Product Cleanup Agent
- Research Agent
- Customer/Email Agent
- Operator Agent

The Chief of Staff creates a daily command report with inventory risks, products to promote, products to remove from promotion, homepage recommendations, email campaign ideas, SEO/product cleanup tasks, urgent issues, and actions requiring owner approval.

Approval statuses are `suggested`, `drafted`, `approved`, `rejected`, `executed`, `failed`, and `rolled_back`. Action logs store timestamp, agent name, input data, recommendation, approval status, execution result, and rollback information.

## LWT Action Queue

The LWT Action Queue is the shared backbone for recommendations from Product Ops, Market Radar, the Business OS daily command report, and manually created tasks. It standardizes every recommendation into one review-first schema with source workflow, source agent, action type, priority, area, title, description, related product/collection/campaign context, risk level, owner, due date, source reference, status, timestamps, and a dedupe key.

Queue statuses are `new`, `accepted`, `approved`, `edited`, `in_progress`, `waiting`, `done`, `rejected`, and `ignored`. Approvals, edits, rejections, completions, and repeated deduped recommendations are written to an event log. The dashboard reads from this queue first, so the cockpit shows the same pending work regardless of which agent created it.

Safe API endpoints:

```bash
POST /api/action-queue
POST /api/action-queue/approve
POST /api/action-queue/edit
POST /api/action-queue/reject
POST /api/action-queue/complete
GET  /api/action-queue/export?format=json
GET  /api/action-queue/export?format=csv
```

These endpoints only create, update, log, and export queue records. They do not write to Shopify, send emails, delete products, or execute product/homepage changes.

Guardrails keep the app safe by default:

- No unsupported medical claims.
- No price changes without approval.
- No product deletion.
- No overwriting Shopify CSV/product data without backup.
- No customer email sent without approval.
- No homepage changes without approval while `AUTONOMY_MODE=approval`.

Shopify wrappers can read products, read collections, read product inventory/status, draft product updates, draft homepage promotion changes, and validate approved product updates. The model never touches Shopify directly; it recommends tool calls, and the backend validates/logs them before anything can execute.

## Run locally

This workspace did not have `npm` on PATH, so the included scripts use Node's built-in TypeScript stripping in Node 22+.

```bash
node --test --experimental-strip-types "tests/**/*.test.ts"
node --experimental-strip-types src/index.ts
node --experimental-strip-types src/worker.ts --dry-run
```

For production, install the declared dependencies with your package manager, create the Postgres schema from `src/storage/schema.sql`, set the environment variables from `.env.example`, and run `src/index.ts` behind your Shopify app URL.

```bash
APPLY_CHANGES=false
```

Set `APPLY_CHANGES=true` only after reviewing dry-run output in the embedded Shopify admin app.

## Supplier setup

Use structured feeds first. These public product feeds are built in, so you do not need to add Render env vars for them unless you want to override the URL:

```bash
SUPPLIER_FEED_URL_PHYSICIANS_STANDARD=https://www.physiciansstandard.com/products.json?limit=250
SUPPLIER_FEED_URL_DESBIO=https://desbio.com/wp-json/wc/store/v1/products?per_page=100
SUPPLIER_FEED_URL_RESEARCH_NUTRITIONALS=https://www.researchednutritionals.com/wp-json/wc/store/v1/products?per_page=100
```

Use website automation only when no feed/API exists:

```bash
SUPPLIER_WEBSITE_CONFIG_DESBIO={"loginUrl":"https://portal.example.com/login","productsUrl":"https://portal.example.com/products","selectors":{"username":"#email","password":"#password","submit":"button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_DESBIO=portal-user
SUPPLIER_PASSWORD_DESBIO=portal-password
```

Physicians' Standard uses the `PHYSICIANS_STANDARD` environment suffix. Credentials can stay in Render for future authenticated cost/stock extraction, but the current public feed works without them:

```bash
SUPPLIER_USERNAME_PHYSICIANS_STANDARD=portal-user
SUPPLIER_PASSWORD_PHYSICIANS_STANDARD=portal-password
```

Research Nutritionals uses the `RESEARCH_NUTRITIONALS` suffix:

```bash
SUPPLIER_USERNAME_RESEARCH_NUTRITIONALS=portal-user
SUPPLIER_PASSWORD_RESEARCH_NUTRITIONALS=portal-password
```

Emerson Ecologics needs either an official feed/API URL or a known post-login catalog/export URL. Its login page uses bot protection, so credentials alone are not enough for reliable unattended automation:

```bash
SUPPLIER_COOKIE_EMERSON_ECOLOGICS=session-cookie-string
SUPPLIER_CATALOG_URLS_EMERSON_ECOLOGICS=https://www.emersonecologics.com/shop
SUPPLIER_WEBSITE_CONFIG_EMERSON_ECOLOGICS={"loginUrl":"https://emersonecologics.com/login","productsUrl":"https://emersonecologics.com/<post-login-catalog-or-export-url>","selectors":{"username":"#email","password":"#password","submit":"button[data-e2e=\"sign-in-button\"], button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_EMERSON_ECOLOGICS=portal-user
SUPPLIER_PASSWORD_EMERSON_ECOLOGICS=portal-password
```

To avoid manually copying cookies from browser Inspect, run the local capture helper:

```bash
npm run capture:emerson
```

It opens Emerson in a real browser, lets you log in once, and writes `.auth/emerson-cookie.env` with the `SUPPLIER_COOKIE_EMERSON_ECOLOGICS` value to add in Render.

Website product rows should expose `data-*` fields such as `data-title`, `data-sku`, `data-upc`, `data-available`, `data-quantity`, `data-cost`, `data-msrp`, and `data-sale-price`.

## Shopify permissions

The app needs Shopify Admin API scopes for product and inventory automation:

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`
- `read_orders` for BI sales windows
- `read_content`
- `write_content` for draft blog article creation

The app UI is server-rendered and includes Shopify App Bridge so it can be embedded in Shopify admin.
