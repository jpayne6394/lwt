# LWT Intelligence Center v1.2 Shopper Behavior

## Purpose

v1.2 adds a Shopper Behavior Intelligence layer to the existing `/intelligence` dashboard. It helps LWT understand aggregate shopper intent, search friction, product page friction, and content opportunities without adding custom tracking pixels or user-level behavior profiles.

## What Changed

- Added a `Shopper Behavior` tab to `/intelligence`.
- Added `Run Shopper Behavior Analysis`.
- Added aggregate CSV/JSON import support for search terms and product engagement reports.
- Added shopper behavior source statuses for Shopify, manual imports, GA4, and Search Console readiness.
- Added recommendation scoring for no-result searches, low-click searches, product page friction, low-stock interest, and content opportunities.
- Added Today tab shopper behavior summary.

## Data Sources

Allowed v1.2 sources:

- Existing Shopify product/order reads already supported by the app.
- Manual CSV/JSON report imports from Shopify Search & Discovery, Shopify analytics, GA4, and Search Console.
- Optional GA4/Search Console connector readiness when credentials are present.
- Clearly labeled manual sample/fallback data.

v1.2 does not add live GA4 or Search Console API ingestion yet.

## Privacy Rules

This layer uses aggregate behavior only.

- No custom Shopify pixel is added.
- No customer-level browsing history is stored.
- Store search terms are not attached to customer profiles.
- Sensitive wellness searches are used only for safe educational recommendations.
- Connector secrets stay in environment variables, not JSON config or UI.

## Manual Import Format

Default folder:

```text
imports/shopper-behavior/
```

Environment override:

```bash
SHOPPER_BEHAVIOR_IMPORT_DIR=imports/shopper-behavior
```

Sample files:

```text
imports/shopper-behavior/sample-search-terms.csv
imports/shopper-behavior/sample-product-engagement.csv
```

Search columns:

```text
term,search_count,click_count,purchase_count,no_results_count,no_click_count,date_range
```

Product engagement columns:

```text
product_title,shopify_product_id,views,add_to_carts,purchases,date_range
```

The importer reads only known aggregate columns and ignores unrelated fields.

## Connector Status Behavior

Missing analytics credentials do not break startup.

- GA4 missing credentials: `Not configured - use manual import/fallback.`
- Search Console missing credentials: `Not configured - use manual import/fallback.`
- Manual import folder: ready when the app can scan the folder.
- Shopify Search & Discovery and Shopify analytics: ready for CSV/JSON import.

## UI Route And Tab

Route:

```text
/intelligence
```

Tab:

```text
Shopper Behavior
```

Sections:

- What shoppers are looking for.
- Where shoppers get stuck.
- What we should change.
- What this means for content.
- Imported Reports / Source Status.

## API Endpoints

- `GET /api/intelligence/shopper-behavior`
- `GET /api/intelligence/shopper-behavior/sources`
- `GET /api/intelligence/shopper-behavior/recommendations`
- `POST /api/intelligence/run/shopper-behavior`
- `POST /api/intelligence/shopper-behavior/import`

The import endpoint triggers folder-based CSV/JSON import. It does not upload files in v1.2.

## Scoring

- High search plus no results creates `missing_collection` recommendations.
- High search plus low clicks creates `synonym_needed` recommendations.
- Product views with weak add-to-cart creates `product_page_copy_issue` recommendations.
- Add-to-cart with weak purchase creates `high_cart_low_purchase` recommendations.
- Shopper interest plus low inventory creates `high_interest_low_stock` warnings.
- Search terms that match Content Radar ideas create `blog_topic_opportunity` recommendations confirmed by shopper behavior.

Priority becomes `Critical` when volume and friction are both high; otherwise it is `Watch` or `Normal`.

## Connections To Existing Intelligence

- Inventory: low-stock products should not be pushed just because searches are high.
- Product Strategy: healthy inventory plus shopper interest can support homepage, collection, or product pushes.
- Content Radar: matching search terms raise content priority and suggest blog briefs or buying guides.

## Local Run

```bash
npm test
npm run dev
npm run intelligence:shopper-behavior
```

Then open:

```text
http://127.0.0.1:8080/intelligence
```

## Testing

Covered behaviors include:

- `/intelligence` renders the Shopper Behavior tab.
- Missing GA4/Search Console credentials are graceful.
- Manual CSV/JSON imports parse aggregate search and product engagement rows.
- Shopper behavior analysis produces recommendations.
- No-result searches produce collection/content recommendations.
- High interest plus low stock produces an inventory warning.
- Content opportunities can be confirmed by shopper behavior.
- API run endpoint works.

## Intentionally Not Implemented Yet

- Shopify custom pixel/event tracking.
- Storefront, Dawn/Liquid, Hydrogen, or theme edits.
- Live GA4 Data API ingestion.
- Live Search Console API ingestion.
- Upload/preview UI for reports.
- Blog publishing.
- Customer email automation.
- Price changes, purchase orders, or product hiding.

## Next Recommended Phase

Add a report upload and preview UI, then evaluate GA4/Search Console live connectors after credential setup and privacy review.
