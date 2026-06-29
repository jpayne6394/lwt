# LWT Intelligence Center v1.3 - Imports and Action Queue

## Purpose

v1.3 makes the Intelligence Center useful as a weekly operator tool without requiring live GA4 or Search Console credentials. It adds report upload/preview, column validation, a trackable Action Queue, and a Markdown weekly operator brief.

## What Changed From v1.2

- Shopper Behavior now has a UI import panel for CSV/JSON reports.
- Imports can be previewed before storage.
- Common Shopify, GA4, Search Console, and generic column names are mapped automatically.
- Recommendations can be added to an Action Queue.
- Actions can be planned, moved in progress, marked done, rejected, and annotated.
- Today includes top open actions, data freshness, and a compact opportunity snapshot.
- Weekly brief Markdown can be generated and copied from `/intelligence`.

## Importing Reports

Open `/intelligence`, choose the Shopper Behavior tab, and use **Shopper Behavior Import**.

1. Select a report type.
2. Choose a CSV or JSON file.
3. Click **Preview report**.
4. Review mapped columns, sample rows, row count, and missing-column messages.
5. Click **Confirm import** only after the preview is valid.

Folder import is still available through **Import folder reports**. Place aggregate CSV/JSON files in `imports/shopper-behavior/` and run the folder import or Shopper Behavior Analysis.

## Supported Report Types

- Shopify Search Terms
- Shopify No-Result Searches
- Shopify Product Engagement
- GA4 Site Search
- GA4 Landing/Product Page Engagement
- Search Console Queries
- Generic Shopper Behavior CSV

## Supported Columns

Search reports can use:

- `query`, `term`, `search_term`, `search query`
- `searches`, `search_count`, `total searches`, `impressions`
- `clicks`, `click_count`
- `purchases`, `purchase_count`, `conversions`, `orders`
- `no_results`, `no_results_count`, `zero_results`
- `no_clicks`, `no_click_count`
- `date_range`, `date`, `period`

Product engagement reports can use:

- `product_title`, `item_name`, `product`, `title`
- `product_id`, `shopify_product_id`
- `views`, `page_views`, `item_views`, `product_views`, `sessions`
- `add_to_carts`, `add_to_cart`, `carts`
- `purchases`, `orders`, `conversions`
- `date_range`, `date`, `period`

If a required column is missing, the preview stays invalid and no rows are stored.

## Sample CSV Files

Use these as templates:

- `imports/shopper-behavior/sample-shopify-search-terms.csv`
- `imports/shopper-behavior/sample-no-result-searches.csv`
- `imports/shopper-behavior/sample-product-engagement.csv`
- `imports/shopper-behavior/sample-ga4-site-search.csv`
- `imports/shopper-behavior/sample-search-console-queries.csv`

## Action Queue Workflow

Recommendation cards include **Add to Action Queue**. The queue stores:

- source
- priority
- status
- explanation
- suggested action
- related product or topic
- owner, when added later

Use the Action Queue tab to filter by source, priority, and status. Operators can move actions through:

- open
- planned
- in progress
- done
- rejected

Notes can be added to actions for lightweight weekly follow-up.

## Weekly Brief Export

Click **Export Weekly Brief Markdown** from `/intelligence`. The generated Markdown includes:

- date generated
- top inventory risks
- top shopper behavior signals
- top product strategy recommendations
- top content/blog opportunities
- action queue counts
- next recommended actions

The app only generates Markdown. It does not email, publish, or schedule distribution.

## Privacy Rules

- Shopper behavior remains aggregate-only.
- No user-level behavior is stored.
- No customer profiles are built.
- Search terms are not attached to customers.
- Raw browsing history is not stored.
- Blog/topic suggestions must remain educational and avoid disease-claim positioning.

## What Remains Manual

- Exporting reports from Shopify, GA4, and Search Console.
- Reviewing missing-column previews.
- Confirming imports.
- Deciding whether to act on recommendations.
- Publishing blogs or changing storefront content.
- Assigning owners if the operator wants ownership tracking.

## Intentionally Not Implemented

- Live GA4 credential setup.
- Live Search Console credential setup.
- Custom Shopify pixels or user-level event tracking.
- Shopify theme/storefront edits.
- Blog publishing.
- Automatic customer emails.
- Price changes.
- Purchase order creation.
- Unauthorized platform scraping.

## Next Recommended Phase

v1.4 should connect official analytics APIs only after the manual import workflow is trusted. Keep the same aggregate data model, add connector-specific setup screens, and preserve the same preview/validation behavior before any imported analytics data affects recommendations.
