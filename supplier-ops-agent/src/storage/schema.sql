create table if not exists suppliers (
  id text primary key,
  name text not null,
  mode text not null,
  brands jsonb not null default '[]'::jsonb,
  notes text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_credentials (
  supplier_id text primary key references suppliers(id) on delete cascade,
  encrypted_payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists supplier_snapshots (
  id bigserial primary key,
  supplier_id text not null,
  captured_at timestamptz not null,
  products jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists shopify_variants (
  variant_id text primary key,
  product_id text not null,
  sku text,
  barcode text,
  vendor text,
  title text,
  status text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists shopify_variants_sku_idx on shopify_variants (lower(sku));
create index if not exists shopify_variants_barcode_idx on shopify_variants (barcode);

create table if not exists product_mappings (
  id bigserial primary key,
  supplier_id text not null,
  supplier_sku text,
  supplier_upc text,
  supplier_title text,
  shopify_variant_id text not null,
  confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_mappings_supplier_sku_idx
  on product_mappings (supplier_id, lower(supplier_sku))
  where supplier_sku is not null;

create unique index if not exists product_mappings_supplier_upc_idx
  on product_mappings (supplier_id, supplier_upc)
  where supplier_upc is not null;

create table if not exists sync_runs (
  id text primary key,
  dry_run boolean not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  supplier_count integer not null default 0,
  change_count integer not null default 0,
  issue_count integer not null default 0
);

create table if not exists applied_changes (
  id text primary key,
  run_id text not null references sync_runs(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists blocked_issues (
  id text primary key,
  run_id text not null references sync_runs(id) on delete cascade,
  kind text not null,
  reason text not null,
  payload jsonb not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists alert_history (
  id text primary key,
  severity text not null,
  kind text not null,
  title text not null,
  body text not null,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create extension if not exists vector;

create or replace function sensitivity_rank(value text)
returns integer
language sql
immutable
as $$
  select case value
    when 'public' then 0
    when 'internal' then 1
    when 'restricted' then 2
    else 2
  end
$$;

create table if not exists agent_memory_documents (
  id text primary key,
  source_type text not null,
  title text not null,
  summary text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  related_products text[] not null default array[]::text[],
  related_collections text[] not null default array[]::text[],
  related_campaigns text[] not null default array[]::text[],
  evidence_links jsonb not null default '[]'::jsonb,
  sensitivity text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_memory_documents_source_type_idx
  on agent_memory_documents (source_type);

create index if not exists agent_memory_documents_sensitivity_idx
  on agent_memory_documents (sensitivity);

create table if not exists agent_memory_chunks (
  id text primary key,
  document_id text not null references agent_memory_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector,
  embedding_model text,
  created_at timestamptz not null default now()
);

create index if not exists agent_memory_chunks_document_idx
  on agent_memory_chunks (document_id, chunk_index);

create table if not exists agent_memory_retrieval_logs (
  id text primary key,
  agent_name text,
  sanitized_query text not null,
  query_hash text not null,
  retrieval_mode text not null,
  result_count integer not null,
  used_local_embeddings boolean not null default false,
  context_chars integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists agent_memory_retrieval_logs_created_at_idx
  on agent_memory_retrieval_logs (created_at desc);

create table if not exists intelligence_runs (
  id text primary key,
  type text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  error text,
  summary_json jsonb not null default '{}'::jsonb
);

create index if not exists intelligence_runs_type_started_idx
  on intelligence_runs (type, started_at desc);

create table if not exists source_items (
  id text primary key,
  source text not null,
  source_url text,
  source_author_or_subreddit text,
  title text not null,
  text_excerpt text not null,
  collected_at timestamptz not null,
  score_json jsonb not null default '{}'::jsonb,
  raw_json jsonb
);

create index if not exists source_items_source_collected_idx
  on source_items (source, collected_at desc);

create table if not exists product_signals (
  id text primary key,
  shopify_product_id text,
  product_title text not null,
  vendor text,
  category text,
  signal_type text not null,
  priority text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists product_signals_type_created_idx
  on product_signals (signal_type, created_at desc);

create table if not exists content_ideas (
  id text primary key,
  topic text not null,
  source_summary text not null,
  suggested_title text not null,
  product_tie_in text not null,
  compliance_risk text not null,
  compliance_reason text,
  safer_angle text,
  suggested_cta text not null,
  status text not null default 'idea',
  created_at timestamptz not null default now()
);

create index if not exists content_ideas_status_created_idx
  on content_ideas (status, created_at desc);

create table if not exists shopper_behavior_imports (
  id text primary key,
  source text not null,
  import_type text not null,
  filename text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  error text,
  row_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists shopper_behavior_imports_source_started_idx
  on shopper_behavior_imports (source, started_at desc);

create table if not exists behavior_import_mappings (
  id text primary key,
  report_type text not null,
  source text not null,
  import_type text not null,
  filename text not null,
  column_mapping jsonb not null default '{}'::jsonb,
  missing_columns text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists behavior_import_mappings_type_created_idx
  on behavior_import_mappings (report_type, created_at desc);

create table if not exists shopper_search_terms (
  id text primary key,
  term text not null,
  normalized_term text not null,
  source text not null,
  search_count integer not null default 0,
  click_count integer,
  purchase_count integer,
  no_results_count integer,
  no_click_count integer,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  score_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  date_range text
);

create index if not exists shopper_search_terms_normalized_idx
  on shopper_search_terms (normalized_term);

create index if not exists shopper_search_terms_source_count_idx
  on shopper_search_terms (source, search_count desc);

create table if not exists shopper_product_signals (
  id text primary key,
  shopify_product_id text,
  product_title text not null,
  signal_type text not null,
  metric_name text not null,
  metric_value numeric not null,
  priority text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  source text,
  date_range text
);

create index if not exists shopper_product_signals_type_created_idx
  on shopper_product_signals (signal_type, created_at desc);

create table if not exists shopper_recommendations (
  id text primary key,
  recommendation_type text not null,
  title text not null,
  explanation text not null,
  related_term text,
  related_product_id text,
  related_product_title text,
  priority text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  source text,
  date_range text,
  suggested_action text
);

create index if not exists shopper_recommendations_status_created_idx
  on shopper_recommendations (status, created_at desc);

create table if not exists action_items (
  id text primary key,
  title text not null,
  source text not null,
  priority text not null,
  status text not null default 'open',
  recommendation_type text not null,
  related_product_id text,
  related_product_title text,
  related_topic text,
  explanation text not null,
  suggested_action text not null,
  owner text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists action_items_status_priority_idx
  on action_items (status, priority, created_at desc);

create index if not exists action_items_source_created_idx
  on action_items (source, created_at desc);

create table if not exists action_notes (
  id text primary key,
  action_id text not null references action_items(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists action_notes_action_created_idx
  on action_notes (action_id, created_at desc);

create table if not exists weekly_briefs (
  id text primary key,
  generated_at timestamptz not null default now(),
  markdown text not null,
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists weekly_briefs_generated_idx
  on weekly_briefs (generated_at desc);
