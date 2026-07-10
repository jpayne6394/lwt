# LWT Intelligence Center v1.4 - Production Hardening

## Purpose

v1.4 prepares the accepted v1.3 Intelligence Center for a safer production deploy. It does not add new agents, live GA4/Search Console ingestion, Shopify pixel tracking, storefront edits, blog publishing, automated emails, price changes, purchase orders, scraping, or user-level shopper tracking.

## Baseline Before v1.4 Changes

- `npm test` passed.
- `/intelligence` returned HTTP 200 on the local dev server.
- The Action Queue tab opened.
- The Weekly Brief workspace rendered.
- The Shopper Behavior import panel existed.
- Browser console showed a Shopify App Bridge `missing required configuration fields: shop` error on `/intelligence`.

## What Changed

- Shopify App Bridge is no longer injected on `/intelligence`, which isolates the internal dashboard from embedded Shopify Admin setup requirements.
- App Bridge remains available on the non-intelligence admin UI when `SHOPIFY_API_KEY` is configured.
- `/intelligence` and `/api/intelligence/*` now support a production auth requirement through `INTERNAL_DASHBOARD_AUTH_REQUIRED`.
- Render and `NODE_ENV=production` default `INTERNAL_DASHBOARD_AUTH_REQUIRED` to `true`.
- If production auth is required but `INTERNAL_DASHBOARD_PASSWORD` is missing, Intelligence routes return setup-needed HTTP 503 instead of exposing the dashboard.
- The Shopper Behavior import panel now supports pasted CSV/JSON content in addition to native file picker uploads.
- Malformed import previews return operator-facing validation messages and do not store rows.
- Action Queue, Weekly Brief, and Shopper Recommendation backups can be exported from the UI or API.
- Run/import failures now surface concise operator messages instead of generic failures.

## Auth Setup

Local development can leave `INTERNAL_DASHBOARD_PASSWORD` empty. In that state, `/intelligence` displays an internal warning so the missing password is visible before deployment.

Production should set:

```bash
INTERNAL_DASHBOARD_PASSWORD=long-random-password
INTERNAL_DASHBOARD_AUTH_REQUIRED=true
```

Operators access the dashboard with HTTP Basic auth. The password is never rendered into the page and should not be logged.

For a deliberate private test deployment only, set:

```bash
INTERNAL_DASHBOARD_AUTH_REQUIRED=false
```

## Upload QA

The preferred import path remains native CSV/JSON file selection from the Shopper Behavior tab.

The paste fallback exists for environments where automated browser tests or locked-down browsers cannot drive a file picker:

1. Open `/intelligence`.
2. Open the Shopper Behavior tab.
3. Select the report type.
4. Paste aggregate CSV or JSON into **Paste CSV/JSON content**.
5. Click **Preview report**.
6. Confirm only after the preview says it is valid.

Invalid previews show what is missing and do not import data.

## Backup Exports

Action Queue:

- `GET /api/intelligence/exports/actions?format=csv`
- `GET /api/intelligence/exports/actions?format=json`

Weekly Briefs:

- `GET /api/intelligence/exports/weekly-briefs?format=markdown`
- `GET /api/intelligence/exports/weekly-briefs?format=json`

Shopper Recommendations:

- `GET /api/intelligence/exports/shopper-recommendations?format=csv`
- `GET /api/intelligence/exports/shopper-recommendations?format=json`

The UI exposes backup links from the Action Queue area.

## Render Readiness

Web service:

- Build command: `npm install`
- Start command: `npm run start`
- Health check path: `/healthz`
- Required data setting: `DATABASE_URL`
- Required production security setting: `INTERNAL_DASHBOARD_PASSWORD`
- Production auth flag: `INTERNAL_DASHBOARD_AUTH_REQUIRED=true`

Cron jobs:

- Inventory: `npm run intelligence:inventory`
- Daily BI: `npm run intelligence:daily-bi`
- Content Radar: `npm run intelligence:content-radar`
- Product Strategy: `npm run intelligence:product-strategy`
- Shopper Behavior: `npm run intelligence:shopper-behavior`

Database:

- Use Postgres for production.
- Apply `src/storage/schema.sql` before the first production run and before enabling memory/vector features.
- Keep the same `DATABASE_URL` available to the web service and intelligence cron jobs.

Environment variables:

- Shopify Admin: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_VERSION`
- Internal auth: `INTERNAL_DASHBOARD_PASSWORD`, `INTERNAL_DASHBOARD_AUTH_REQUIRED`
- Intelligence config: `CONTENT_TOPICS_PATH`, `SHOPPER_BEHAVIOR_IMPORT_DIR`
- Memory: `MEMORY_PROVIDER`, `MEMORY_VECTOR_ENABLED`, `EMBEDDING_PROVIDER`, `LOCAL_EMBEDDING_MODEL`, `LOCAL_LLM_TIMEOUT_MS`, `MEMORY_MAX_CONTEXT_CHARS`
- Optional sources: `X_BEARER_TOKEN`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `GOOGLE_TRENDS_PROVIDER_KEY`, `SEARCH_PROVIDER_KEY`
- Optional connector readiness only: `GA4_PROPERTY_ID`, `GA4_CREDENTIALS_JSON`, `SEARCH_CONSOLE_SITE_URL`, `SEARCH_CONSOLE_CREDENTIALS_JSON`

Import folder persistence:

- `SHOPPER_BEHAVIOR_IMPORT_DIR=imports/shopper-behavior` is used by folder imports and the Shopper Behavior cron.
- For production imports that must survive restarts, place files in durable storage provided by the hosting environment or use the UI upload/paste flow for one-time imports.
- Keep aggregate report files only. Do not store customer-level exports or browsing history.

## Manual QA Checklist

- Open `/intelligence` and confirm there is no Shopify App Bridge missing-shop console error.
- Open Action Queue and confirm the export links are visible.
- Generate or view the Weekly Brief and confirm Markdown output is available.
- Preview a valid pasted Shopper Behavior CSV and confirm it enables import.
- Preview a malformed CSV and confirm the message explains the missing columns and no import occurs.
- Confirm missing GA4/Search Console credentials show not-configured status without breaking the page.
- Confirm protected routes return 401 without Basic auth when `INTERNAL_DASHBOARD_PASSWORD` is set.
- Confirm production setup without `INTERNAL_DASHBOARD_PASSWORD` returns setup-needed 503 when auth is required.

## Intentionally Not Implemented

- New agents.
- Live GA4 ingestion.
- Live Search Console ingestion.
- Custom Shopify pixel or user-level tracking.
- Shopify theme or storefront edits.
- Blog publishing.
- Automatic customer emails.
- Price changes.
- Purchase order creation.
- Unauthorized scraping.
