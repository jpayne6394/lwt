# LWT Intelligence Center v1

## Purpose

LWT Intelligence Center v1 extends the existing `supplier-ops-agent` into an internal owner/operator dashboard at `/intelligence`.

The page is designed for fast daily decisions:

- Inventory risks that need review.
- Product/category signals worth featuring.
- Content and blog topics worth drafting.
- Connector status and setup gaps.
- Plain-English action items for today.

## Existing Inventory Checker Reused

The existing inventory checker lives in `src/worker/run-sync.ts`.

It already:

- Runs supplier adapters.
- Reads Shopify variant mappings from the repository.
- Plans inventory, cost, price, and draft-product changes.
- Records applied changes, blocked issues, and sanitized memory.

The Intelligence Center does not replace that workflow. It adds read-only intelligence agents beside it:

- `src/agents/inventoryAgent.ts`
- `src/agents/dailyBiAgent.ts`
- `src/agents/productStrategyAgent.ts`
- `src/agents/contentRadarAgent.ts`
- `src/agents/complianceGuardAgent.ts`

## Architecture

The app remains a TypeScript Node HTTP app with server-rendered HTML.

- Server routes: `src/server/server.ts`
- Admin shell: `src/server/admin-ui.ts`
- Intelligence UI: `src/server/intelligence-ui.ts`
- Orchestration: `src/agents/intelligenceService.ts`
- Storage contract: `src/storage/repository.ts`
- In-memory dev storage: `src/storage/memory-repository.ts`
- Postgres storage: `src/storage/postgres-repository.ts`
- Schema: `src/storage/schema.sql`

No Shopify theme, Dawn/Liquid storefront, or Hydrogen code is touched.

## Data Storage

The repo already uses Postgres with an in-memory fallback, so v1 extends that model instead of adding SQLite.

New tables:

- `intelligence_runs`
- `source_items`
- `product_signals`
- `content_ideas`

Local development uses the same repository methods in memory.

## Source Connectors

Missing connector credentials do not fail startup.

- Shopify: uses `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN`, with existing `SHOPIFY_SHOP` and `SHOPIFY_ACCESS_TOKEN` still supported.
- X: only uses the official X API when `X_BEARER_TOKEN` is present.
- Reddit: only uses official Reddit OAuth/API when `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT` are present.
- Search/trends: reports configured when `GOOGLE_TRENDS_PROVIDER_KEY` or `SEARCH_PROVIDER_KEY` is present.
- Manual topics: always available through `config/content_topics.json`.

The app does not scrape X or Reddit pages, bypass login, collect private data, or store full comment dumps.

## UI Routes

- `GET /intelligence`
- `GET /api/intelligence/summary`
- `GET /api/intelligence/inventory`
- `GET /api/intelligence/product-strategy`
- `GET /api/intelligence/content-radar`
- `GET /api/intelligence/sources`
- `POST /api/intelligence/run/inventory`
- `POST /api/intelligence/run/content-radar`
- `POST /api/intelligence/run/daily-bi`
- `POST /api/intelligence/run/product-strategy`

If `INTERNAL_DASHBOARD_PASSWORD` is set, `/intelligence` and `/api/intelligence/*` require HTTP Basic auth.

## Environment Variables

Required for Shopify reads:

```bash
SHOPIFY_STORE_DOMAIN=your-shop.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx
SHOPIFY_API_VERSION=2026-01
```

Optional connectors:

```bash
X_BEARER_TOKEN=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=lwt-intelligence-center/1.0
GOOGLE_TRENDS_PROVIDER_KEY=
SEARCH_PROVIDER_KEY=
SEARCH_PROVIDER_URL=
```

Internal dashboard/security:

```bash
INTERNAL_DASHBOARD_PASSWORD=
CONTENT_TOPICS_PATH=config/content_topics.json
DATABASE_URL=postgres://user:password@host:5432/supplier_ops
```

## Render Cron Setup

`render.yaml` keeps the existing web service and adds cron jobs:

- `lwt-intelligence-inventory`: daily at `0 11 * * *` UTC.
- `lwt-intelligence-daily-bi`: daily at `20 11 * * *` UTC.
- `lwt-intelligence-content-radar`: Mondays at `0 12 * * 1` UTC.
- `lwt-intelligence-product-strategy`: Mondays at `30 12 * * 1` UTC.

Each cron job calls `src/intelligence-worker.ts` through the matching npm script.

## Local Run

```bash
npm test
npm run dev
npm run intelligence:inventory
npm run intelligence:content-radar
npm run intelligence:daily-bi
npm run intelligence:product-strategy
```

Then open:

```text
http://127.0.0.1:8080/intelligence
```

## Shopify Flow Optional Setup

Flow webhooks are optional. Cron jobs still handle scans if Flow HTTP actions are unavailable on the Shopify plan.

Possible Flow ideas:

- Product inventory quantity changed -> send HTTP request to Render endpoint.
- Product out of stock -> send HTTP request to Render endpoint.
- Order created -> send HTTP request to Render endpoint.
- Product status updated -> send HTTP request to Render endpoint.

## Safety Boundaries

v1 does not:

- Publish Shopify products, blogs, or theme changes.
- Auto-email customers.
- Auto-change prices from intelligence routes.
- Auto-place purchase orders.
- Scrape private or unauthorized social data.
- Store unnecessary personal data.

Content ideas include a compliance risk label and safer CTA suggestion.

## Next Recommended Phases

1. Add Shopify order/sales read models so Daily BI can rank true top movers and stale stock.
2. Add approval workflow for content ideas.
3. Add a provider-backed Google Trends/search adapter once the provider endpoint is selected.
4. Add Shopify Flow HTTP endpoints for event-triggered refreshes.

Later implementation notes:

- v1.1 content brief workflow: `docs/LWT_INTELLIGENCE_CENTER_V1_1.md`
- v1.2 Shopper Behavior Agent: `docs/LWT_INTELLIGENCE_CENTER_V1_2_SHOPPER_BEHAVIOR.md`
