# Supplier Ops Agent

Embedded Shopify admin app and background worker for supplier-driven inventory and pricing automation.

## What v1 does

- Checks Emerson Ecologics, BioResource/Pekana, Systemic Formulas, Research Nutritionals, World Health Mall, and DesBio through supplier adapters.
- Normalizes supplier stock, cost, MSRP/list price, sale price, SKU, UPC, product URL, and images.
- Matches products by manual mapping, exact SKU, exact UPC, then high-confidence vendor/title matching.
- Updates existing Shopify variants automatically, across active, draft, and archived products.
- Sets out-of-stock to `0`, in-stock without exact quantity to `10`, and exact supplier quantity when present.
- Uses supplier MSRP/list price first; otherwise falls back to `2x` cost. Supplier sales mirror into price plus compare-at price.
- Blocks uncertain matches, supplier failures, login/2FA problems, parser errors, and price swings over 25%.
- Creates newly discovered supplier products as Shopify drafts only.
- Stores sanitized agent memory for supplier runs, business notes, reports, market signals, drafts, and approval outcomes.
- Retrieves memory through pgvector when local embeddings are available, with keyword fallback when the local model is offline.
- Adds the internal LWT Intelligence Center at `/intelligence` for inventory risk, daily BI, product strategy, and content radar.

## Run locally

This workspace did not have `npm` on PATH, so the included scripts use Node's built-in TypeScript stripping in Node 22+.

```bash
node --test --experimental-strip-types "tests/**/*.test.ts"
node --experimental-strip-types src/index.ts
node --experimental-strip-types src/worker.ts --dry-run
node --experimental-strip-types src/intelligence-worker.ts content-radar
```

For production, install the declared dependencies with your package manager, create the Postgres schema from `src/storage/schema.sql`, set the environment variables from `.env.example`, and run `src/index.ts` behind your Shopify app URL.

## Agent memory

Agent memory is retrieval memory, not model training. The app stores short sanitized summaries and structured facts in Postgres, then pulls relevant context into local intelligence requests. Raw customer PII, unrestricted email threads, private social dumps, and unapproved protected content should not be stored.

Use a pgvector-compatible Postgres database:

```bash
DATABASE_URL=postgres://user:password@host:5432/supplier_ops
MEMORY_PROVIDER=postgres
MEMORY_VECTOR_ENABLED=true
EMBEDDING_PROVIDER=local
LOCAL_LLM_RELAY_URL=https://your-local-relay.example
LOCAL_LLM_RELAY_TOKEN=long-random-token
LOCAL_EMBEDDING_MODEL=auto
LOCAL_LLM_TIMEOUT_MS=15000
MEMORY_MAX_CONTEXT_CHARS=24000
```

Run `src/storage/schema.sql` against the database before enabling memory indexing. If the memory tables are not present yet, the dashboard shows setup-needed status and supplier sync continues without failing.

Memory APIs:

- `POST /api/memory/documents` stores one sanitized memory document.
- `GET /api/memory/search?q=search+terms` retrieves a bounded context packet for agents.
- `/memory` in the admin UI shows provider, retrieval mode, document count, chunk count, and vector readiness.

Supplier sync automatically records an `inventory_output` memory document after each run. Other report imports can use `POST /api/memory/documents` until dedicated import screens are added.

## LWT Intelligence Center

Open `/intelligence` for the internal owner/operator dashboard. It includes top summary cards, Today, Inventory, Product Strategy, Content Radar, and Sources / Settings tabs.

v1.1 adds config-backed content radar source settings and a safe content idea workflow for approve/reject plus Markdown blog brief generation. Briefs are copied for human review; the app does not publish blogs.

v1.2 adds a Shopper Behavior tab for aggregate search/product-friction imports, graceful GA4/Search Console readiness status, and store/content recommendations from manual CSV/JSON reports.

v1.3 adds UI report preview/confirm import, common column mapping, an Action Queue, and Markdown weekly operator brief export.

v1.4 hardens production readiness with required Render auth configuration, an `/intelligence` App Bridge isolation fix, paste-based report import QA, clearer operator errors, and backup exports for Action Queue, Weekly Brief, and Shopper Recommendation data.

v1.5 documents the Render production pilot checklist, real/sample report validation flow, schema setup, auth proof, cron/manual job validation, and go/no-go criteria.

Manual run API routes:

- `POST /api/intelligence/run/inventory`
- `POST /api/intelligence/run/content-radar`
- `POST /api/intelligence/run/shopper-behavior`
- `POST /api/intelligence/run/daily-bi`
- `POST /api/intelligence/run/product-strategy`
- `POST /api/intelligence/shopper-behavior/import/preview`
- `POST /api/intelligence/shopper-behavior/import/confirm`
- `GET /api/intelligence/actions`
- `POST /api/intelligence/weekly-brief/generate`
- `GET /api/intelligence/exports/actions?format=csv`
- `GET /api/intelligence/exports/actions?format=json`
- `GET /api/intelligence/exports/weekly-briefs?format=markdown`
- `GET /api/intelligence/exports/weekly-briefs?format=json`
- `GET /api/intelligence/exports/shopper-recommendations?format=csv`
- `GET /api/intelligence/exports/shopper-recommendations?format=json`

Set `INTERNAL_DASHBOARD_PASSWORD` to require HTTP Basic auth for `/intelligence` and `/api/intelligence/*`. Render and production environments require auth by default; set `INTERNAL_DASHBOARD_AUTH_REQUIRED=false` only for a deliberate private test deployment.

Full implementation notes are in `docs/LWT_INTELLIGENCE_CENTER_V1.md`, `docs/LWT_INTELLIGENCE_CENTER_V1_1.md`, `docs/LWT_INTELLIGENCE_CENTER_V1_2_SHOPPER_BEHAVIOR.md`, `docs/LWT_INTELLIGENCE_CENTER_V1_3_IMPORTS_ACTION_QUEUE.md`, `docs/LWT_INTELLIGENCE_CENTER_V1_4_HARDENING.md`, and `docs/LWT_INTELLIGENCE_CENTER_V1_5_PRODUCTION_PILOT.md`.

## Supplier setup

Use structured feeds first:

```bash
SUPPLIER_FEED_URL_DESBIO=https://example.com/desbio-products.json
```

Use website automation only when no feed/API exists:

```bash
SUPPLIER_WEBSITE_CONFIG_DESBIO={"loginUrl":"https://portal.example.com/login","productsUrl":"https://portal.example.com/products","selectors":{"username":"#email","password":"#password","submit":"button[type=submit]","productRows":"[data-product-row]"}}
SUPPLIER_USERNAME_DESBIO=portal-user
SUPPLIER_PASSWORD_DESBIO=portal-password
```

Website product rows should expose `data-*` fields such as `data-title`, `data-sku`, `data-upc`, `data-available`, `data-quantity`, `data-cost`, `data-msrp`, and `data-sale-price`.

## Shopify permissions

The app needs Shopify Admin API scopes for product and inventory automation:

- `read_products`
- `write_products`
- `read_inventory`
- `write_inventory`

The app UI is server-rendered and includes Shopify App Bridge so it can be embedded in Shopify admin.
