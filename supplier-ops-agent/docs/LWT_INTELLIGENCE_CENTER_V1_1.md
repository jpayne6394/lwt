# LWT Intelligence Center v1.1

## Purpose

v1.1 continues from the accepted v1 Intelligence Center. It verifies the baseline, polishes the Sources / Settings and Content Radar UI, adds config-backed radar settings, and introduces a safe blog brief workflow for content ideas.

This is still an internal owner/operator tool. It drafts Markdown briefs only; it does not publish blogs or change storefront content.

## What Changed

- Sources now show explicit manual fallback copy when credentials are missing: `Not configured - using manual fallback only.`
- Radar settings are loaded from `config/content-radar-sources.json`.
- The Sources / Settings tab displays topic clusters, keywords, excluded terms, subreddits, X queries, search queries, and scan cadence notes.
- Content ideas now support details, approve/reject actions, and Markdown brief generation.
- Blog briefs are generated as Markdown in the UI with copy support.
- New API routes support idea details, status changes, and brief generation.

## Config Files

Topic seeds remain in:

```text
config/content_topics.json
```

Radar source settings live in:

```text
config/content-radar-sources.json
```

Environment override:

```bash
CONTENT_RADAR_SOURCES_PATH=config/content-radar-sources.json
```

The radar settings file does not store secrets. Official connector credentials remain environment variables.

## Connector Readiness

Missing connector credentials do not fail the dashboard.

- Shopify reads require `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_ACCESS_TOKEN`.
- X uses the official API only when `X_BEARER_TOKEN` is present.
- Reddit uses official OAuth/API only when `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_USER_AGENT` are present.
- Search/trends reports configured when a selected provider key is present.
- Manual topic fallback always remains available.

The app does not scrape X or Reddit pages, bypass login, collect private social data, or label fallback data as live connector data.

## Blog Brief Workflow

From the Content Radar tab:

1. Review idea details.
2. Approve or reject the idea.
3. Generate a Markdown blog brief.
4. Copy the Markdown for human review and editing.

Generated briefs include:

- Working title.
- Topic summary.
- Why the topic matters.
- Target audience.
- Suggested outline.
- LWT-safe educational angle.
- Product/category tie-ins.
- Consult CTA.
- Internal link suggestions.
- Compliance risk.
- Claim-risk notes.
- Safer language suggestions.

The workflow does not publish to Shopify, create blog posts, email customers, or schedule content.

## API Routes Added

- `GET /api/intelligence/source-settings`
- `GET /api/intelligence/content-ideas/:id`
- `POST /api/intelligence/content-ideas/:id/approve`
- `POST /api/intelligence/content-ideas/:id/reject`
- `POST /api/intelligence/content-ideas/:id/blog-brief`

Existing run routes remain unchanged.

## Safety Boundaries

v1.1 does not:

- Touch Shopify theme, Dawn/Liquid, Hydrogen, or storefront code.
- Publish blogs.
- Auto-email customers.
- Change prices.
- Create purchase orders.
- Scrape unauthorized X or Reddit content.
- Store connector secrets in JSON config files.
- Pretend manual fallback data is live connector data.

## Local Verification

Recommended commands:

```bash
npm test
npm run dev
```

Then open:

```text
http://127.0.0.1:8080/intelligence
```

Useful API checks:

```bash
GET /api/intelligence/sources
GET /api/intelligence/source-settings
POST /api/intelligence/run/content-radar
POST /api/intelligence/content-ideas/:id/approve
POST /api/intelligence/content-ideas/:id/blog-brief
```
