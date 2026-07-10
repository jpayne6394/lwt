# Social Listening Blog Feed Design

## Purpose

Feed LWT blog generation with public conversation signals: questions, objections, personal-experience themes, and popular content structures. This is retrieval and content-radar evidence, not model fine-tuning and not raw social scraping.

## Scope

The first version uses curated listening seeds in `config/content-radar-sources.json`. Each seed stores a topic, representative audience question, reaction themes, objection themes, personal-experience angles, safe blog angles, related products, and structure patterns. Official X and Reddit APIs remain optional connectors. If credentials are missing, the manual seed pack still feeds `source_items` and `content_ideas`.

## Guardrails

Do not create fake accounts, bypass CAPTCHA or phone verification, scrape private or unauthorized pages, store raw comment dumps, store private messages, or collect user-level shopper tracking. Store summaries and patterns only. Recommendations and blog briefs remain advisory and must not publish without human approval.

## Data Flow

1. `content-radar-sources.json` defines topic clusters, API query settings, and curated listening seeds.
2. `runContentRadarAgent` converts each seed into a `manual` source item with `scoreJson.source = curated_social_listening_seed`.
3. Content ideas prefer curated listening evidence when available, so blog briefs can model the audience question and post structure.
4. Production seeding can upsert the same summarized signals into LWT Supabase `source_items`, `content_ideas`, and `agent_memory_documents`.

## Success Criteria

- Content radar works when social credentials are missing.
- Seeded source items include question, reaction, objection, personal-experience, and structure metadata.
- Blog ideas mention curated social listening evidence and use safe blog angles.
- No JRS database, Shopify storefront/theme edits, pixels, blog publishing, auto-emails, price changes, purchase orders, scraping, user-level tracking, or secrets.
