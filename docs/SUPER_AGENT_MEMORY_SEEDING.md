# Super Agent Memory Seeding

## Intent

The LWT super agent uses retrieval memory, not model fine-tuning. Seed memory with sanitized internal docs, aggregate reports, and attributed market/social summaries so the agent has useful context without storing raw private data.

## Current Seed Pack

Applied to LWT Supabase project `lwt-intelligence-staging` (`udqjdegsqxfvaocuuvab`):

- Source policy and compliance boundaries
- LWT Intelligence Center operating overview
- Agent memory retrieval contract
- Shopper behavior source model
- Content radar manual fallback settings
- Market/social watchlist for magnesium, sleep, stress, gut health, immune support, and practitioner-guided selection
- Approved social/internal source access plan
- Seeded aggregate shopper findings
- Current Supabase/Render operational status

## Repeatable SQL Generation

Generate SQL locally:

```bash
npm run memory:seed:sql
```

The generator reads:

- `README.md`
- `docs/LWT_INTELLIGENCE_CENTER_*.md`
- `config/content_topics.json`
- `config/content-radar-sources.json`
- `config/super-agent-memory-seeds.json`
- selected aggregate sample files in `imports/shopper-behavior/`

Apply generated SQL only to the LWT Supabase project. Do not apply to JRS.

## Social And Internal Access Rules

Allowed:

- Internal LWT docs and reports
- Aggregate Shopify/Search/GA4/Search Console exports
- Official API results with attribution
- Manual social listening summaries
- Approved product/catalog/SEO reports

Blocked:

- Raw social feed dumps
- Scraped platform data
- Private customer messages
- User-level shopper tracking
- Unrestricted email threads
- Secrets or tokens

## Verification Queries

```sql
select source_type, sensitivity, count(*)::int
from agent_memory_documents
where metadata->>'sourceBatch' = '2026-07-10'
group by source_type, sensitivity
order by source_type, sensitivity;

select count(*)::int as chunk_count
from agent_memory_chunks
where document_id in (
  select id from agent_memory_documents
  where metadata->>'sourceBatch' = '2026-07-10'
);
```

