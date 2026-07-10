# LWT Intelligence Center v1.5 - Production Pilot Runbook

## Purpose

v1.5 prepares the accepted v1.4 Intelligence Center for a real weekly LWT operator pilot on Render. This is a validation and operations phase, not a feature expansion.

The pilot proves:

- Render can run the web service and intelligence cron jobs.
- Production environment variables are explicit.
- The Postgres schema path is documented.
- Internal auth blocks production exposure.
- Existing Shopify connector status is visible and safe.
- Manual aggregate report imports can drive recommendations.
- Operators can add recommendations to the Action Queue and export a Weekly Brief.

## Accepted baseline

- v1.1 blog brief workflow works.
- v1.2 Shopper Behavior Agent works.
- v1.3 import UI, Action Queue, Today action summary, and weekly Markdown brief export work.
- v1.4 hardening works.
- `npm test` passes.
- `/intelligence` returns HTTP 200 locally.
- Shopify App Bridge missing-shop errors are isolated away from `/intelligence`.
- Auth hardening exists.
- Paste-based Shopper Behavior import fallback works.
- Export endpoints work.
- Render/env/docs were updated in v1.4.
- No Shopify theme or storefront edits.
- No custom Shopify pixel.
- No live GA4 or Search Console ingestion.
- No user-level shopper tracking.

## Render setup checklist

Web service:

- Service type: `web`
- Build command: `npm install`
- Start command: `npm run start`
- Health check path: `/healthz`
- Node version: `24.14.0`
- `MEMORY_PROVIDER=postgres`
- `DATABASE_URL` set from the Render Postgres database
- `INTERNAL_DASHBOARD_AUTH_REQUIRED=true`
- `INTERNAL_DASHBOARD_PASSWORD` set as a secret

Cron services:

- Inventory: `npm run intelligence:inventory`
- Daily BI: `npm run intelligence:daily-bi`
- Content Radar: `npm run intelligence:content-radar`
- Product Strategy: `npm run intelligence:product-strategy`
- Shopper Behavior: `npm run intelligence:shopper-behavior`

Manual run endpoints:

- `POST /api/intelligence/run/inventory`
- `POST /api/intelligence/run/daily-bi`
- `POST /api/intelligence/run/content-radar`
- `POST /api/intelligence/run/product-strategy`
- `POST /api/intelligence/run/shopper-behavior`

## Required environment variables

Always required for the production pilot:

- `DATABASE_URL`
- `INTERNAL_DASHBOARD_AUTH_REQUIRED=true`
- `INTERNAL_DASHBOARD_PASSWORD`
- `CONTENT_TOPICS_PATH=config/content_topics.json`
- `SHOPPER_BEHAVIOR_IMPORT_DIR=imports/shopper-behavior`

Required only when the Shopify connector is used:

- `SHOPIFY_STORE_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_API_VERSION`

Rules:

- Do not commit secrets.
- Do not paste secrets into docs, tickets, screenshots, or logs.
- If `INTERNAL_DASHBOARD_AUTH_REQUIRED=true` and `INTERNAL_DASHBOARD_PASSWORD` is missing, `/intelligence` must return setup-required HTTP 503.
- Missing Shopify credentials must show `not_configured` and must not block manual import workflows.

## Optional environment variables

Social/search/content radar:

- `X_BEARER_TOKEN`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_USER_AGENT`
- `SEARCH_PROVIDER_KEY`
- `SEARCH_PROVIDER_URL`
- `GOOGLE_TRENDS_PROVIDER_KEY`

Analytics readiness only:

- `GA4_PROPERTY_ID`
- `GA4_CREDENTIALS_JSON`
- `SEARCH_CONSOLE_SITE_URL`
- `SEARCH_CONSOLE_CREDENTIALS_JSON`

Memory/embedding tuning:

- `MEMORY_VECTOR_ENABLED`
- `EMBEDDING_PROVIDER`
- `LOCAL_LLM_RELAY_URL`
- `LOCAL_LLM_RELAY_TOKEN`
- `LOCAL_EMBEDDING_MODEL`
- `LOCAL_LLM_TIMEOUT_MS`
- `MEMORY_MAX_CONTEXT_CHARS`

Missing optional connectors must not crash startup. They should show `not_configured` and keep manual/fallback workflows usable.

## Database setup and migration notes

Production uses Postgres when `DATABASE_URL` is set. Runtime selects `PostgresRepository.connect(DATABASE_URL)`.

Schema application is manual for the pilot. Apply `src/storage/schema.sql` before first production use and before enabling cron jobs.

Preferred Render shell command when `psql` is available:

```bash
psql "$DATABASE_URL" -f src/storage/schema.sql
```

Node fallback command using the app dependency:

```bash
node --input-type=module -e "import { readFile } from 'node:fs/promises'; import pg from 'pg'; const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); await pool.query(await readFile('src/storage/schema.sql', 'utf8')); await pool.end(); console.log('schema applied');"
```

The schema uses `create table if not exists` and `create index if not exists` for the Intelligence Center tables, including:

- `intelligence_runs`
- `content_ideas`
- `shopper_behavior_imports`
- `shopper_search_terms`
- `shopper_product_signals`
- `shopper_recommendations`
- `action_items`
- `action_notes`
- `weekly_briefs`

Do not rely on local in-memory data for production readiness. Memory mode is useful for local smoke testing only.

## Internal auth behavior

Production should run with:

```bash
INTERNAL_DASHBOARD_AUTH_REQUIRED=true
INTERNAL_DASHBOARD_PASSWORD=<secret value in Render>
```

Expected behavior:

- Unauthenticated `/intelligence`: HTTP 401 with Basic auth challenge.
- Invalid password: HTTP 401.
- Valid password: HTTP 200.
- Auth required but missing password: HTTP 503 setup-required response.
- Password is never rendered in HTML or JavaScript.
- Password should not be logged.

## How to log in

1. Open the Render service URL at `/intelligence`.
2. Browser displays an HTTP Basic auth prompt.
3. Enter any operator username.
4. Enter the exact `INTERNAL_DASHBOARD_PASSWORD` value from the secure password manager.
5. Confirm the Intelligence Center loads.

If the login prompt never appears in production, verify `INTERNAL_DASHBOARD_AUTH_REQUIRED=true` and `INTERNAL_DASHBOARD_PASSWORD` are set on the web service.

## Existing Shopify connector validation

The pilot uses only existing safe connector behavior.

When Shopify credentials are missing:

- Source status should show `not_configured`.
- Missing vars should name `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- Manual Shopper Behavior import workflows should still work.
- Cron/manual jobs should complete or fail gracefully.

When Shopify credentials are configured:

- Inventory scan can read product and inventory data through the existing Shopify Admin client.
- Use the Intelligence Center inventory scan for read-only intelligence validation.
- Do not run supplier write-mode sync as part of this pilot.

Pilot guardrails:

- No Shopify theme or storefront edits.
- No product price changes.
- No product status changes.
- No purchase orders.
- No customer emails.

## How to run inventory scan

From the UI:

1. Open `/intelligence`.
2. Use the Inventory Scan run control.
3. Confirm the run completes or shows a useful operator-facing error.
4. Review source status and inventory risk cards.

From Render shell or locally:

```bash
npm run intelligence:inventory
```

If Shopify credentials are not configured, document `Shopify connector not configured` and continue validating manual workflows.

## How to import reports

Use aggregate reports only. Do not import customer-level exports, user browsing history, or profile-level analytics.

Preferred reports:

- Shopify Search Terms export
- Shopify No-Result Searches export
- Shopify Product Engagement export
- GA4 Site Search export
- Search Console Queries export

UI path:

1. Open `/intelligence`.
2. Open the Shopper Behavior tab.
3. Choose the report type.
4. Upload a CSV/JSON file or paste CSV/JSON content into the paste fallback.
5. Click **Preview report**.
6. Confirm mapped columns and row count.
7. Fix missing-column errors if preview is invalid.
8. Click **Confirm import** only when preview is valid.

The preview step should catch missing required columns and should not store invalid rows.

## How to run Shopper Behavior Analysis

From the UI:

1. Import at least one valid aggregate report.
2. Click the Shopper Behavior run control.
3. Confirm recommendations update.
4. Review top recommendations and content opportunities.

From Render shell or locally:

```bash
npm run intelligence:shopper-behavior
```

## How to add recommendations to Action Queue

1. Open `/intelligence`.
2. Review Inventory, Product Strategy, Content Radar, or Shopper Behavior recommendations.
3. Click **Add to Action Queue** on a recommendation.
4. Open the Action Queue tab.
5. Confirm the new item appears.
6. Update status through `planned`, `in_progress`, `done`, or `rejected`.
7. Add notes when useful for weekly follow-up.

Action Queue exports:

- `GET /api/intelligence/exports/actions?format=csv`
- `GET /api/intelligence/exports/actions?format=json`

## How to generate and export the Weekly Brief

From the UI:

1. Open `/intelligence`.
2. Click **Export Weekly Brief Markdown**.
3. Review the Markdown output.
4. Copy Markdown for human review.

API/export endpoints:

- `POST /api/intelligence/weekly-brief/generate`
- `GET /api/intelligence/exports/weekly-briefs?format=markdown`
- `GET /api/intelligence/exports/weekly-briefs?format=json`

The brief is Markdown only. It does not email, publish, change prices, or create purchase orders.

## Cron/job notes

Render cron jobs should share the same `DATABASE_URL` as the web service so dashboard data is visible after jobs run.

Validate commands before relying on scheduled runs:

```bash
npm run intelligence:inventory
npm run intelligence:daily-bi
npm run intelligence:content-radar
npm run intelligence:product-strategy
npm run intelligence:shopper-behavior
```

There is no standalone weekly-brief cron script in v1.5. Generate Weekly Briefs from the UI or `POST /api/intelligence/weekly-brief/generate`.

## Backup exports

Action Queue:

- `GET /api/intelligence/exports/actions?format=csv`
- `GET /api/intelligence/exports/actions?format=json`

Weekly Briefs:

- `GET /api/intelligence/exports/weekly-briefs?format=markdown`
- `GET /api/intelligence/exports/weekly-briefs?format=json`

Shopper Recommendations:

- `GET /api/intelligence/exports/shopper-recommendations?format=csv`
- `GET /api/intelligence/exports/shopper-recommendations?format=json`

Download backups before destructive manual cleanup or before large pilot resets.

## Troubleshooting

`/intelligence` returns 503:

- `INTERNAL_DASHBOARD_AUTH_REQUIRED=true` but `INTERNAL_DASHBOARD_PASSWORD` is missing.
- Set the password in Render and restart the service.

`/intelligence` returns 401:

- Basic auth is active.
- Re-enter the operator password from the secure password manager.

Shopify shows `not_configured`:

- Set `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN` if read-only inventory validation is part of this pilot.
- If credentials are unavailable, continue with manual report imports and record the connector as not configured.

GA4 or Search Console shows `not_configured`:

- Expected in v1.5 unless credentials were intentionally added for readiness display.
- Do not proceed into live GA4/Search Console ingestion during this pilot.

Import preview invalid:

- Confirm the selected report type matches the file.
- Check required columns in the preview error.
- Use the sample files in `imports/shopper-behavior/` as templates.

Weekly Brief is empty:

- Run at least one intelligence job.
- Import a Shopper Behavior report.
- Add at least one recommendation to the Action Queue.

Export endpoint fails:

- Confirm auth credentials are included in production.
- Confirm schema has been applied.
- Confirm the web service and cron jobs use the same `DATABASE_URL`.

## Go/no-go checklist

Go for weekly operator pilot when all are true:

- `npm test` passes.
- `/healthz` returns OK on Render.
- `/intelligence` is protected by Basic auth.
- Missing production password returns setup-required 503.
- Postgres schema has been applied.
- Web service and cron jobs share the same `DATABASE_URL`.
- Shopify status is either configured or explicitly documented as `not_configured`.
- Missing optional connectors do not crash startup.
- At least one aggregate sample or real report previews and imports successfully.
- Shopper Behavior recommendations update after import.
- At least one recommendation can be added to Action Queue.
- Weekly Brief Markdown generates and exports.
- Backup export endpoints return CSV/JSON/Markdown as expected.
- No relevant App Bridge console error appears on `/intelligence`.

No-go until fixed:

- `/intelligence` is publicly accessible in production.
- Schema has not been applied to production Postgres.
- Cron jobs write to a different database than the web service.
- Import preview stores invalid rows.
- Export endpoints fail for operator backups.
- Any pilot flow attempts price changes, product writes, customer email, blog publishing, pixel tracking, scraping, or user-level shopper tracking.

## What remains intentionally manual

- Choosing which recommendations to act on.
- Assigning owners and writing Action Queue notes.
- Exporting Shopify/GA4/Search Console reports for manual import.
- Reviewing Weekly Brief Markdown.
- Publishing any blog content outside this app.
- Updating storefront content outside this app.
- Price, inventory, and purchase order decisions outside this pilot.

## What is not implemented yet

- No Shopify theme or storefront edits.
- No custom Shopify pixel.
- No live GA4 or Search Console ingestion.
- No Shopify blog publishing.
- No automatic customer emails.
- No price changes.
- No purchase orders.
- No unauthorized scraping.
- No user-level shopper tracking.
