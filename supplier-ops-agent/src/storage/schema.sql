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

create table if not exists product_ops_outputs (
  id text primary key,
  run_id text not null references sync_runs(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists market_radar_outputs (
  id text primary key,
  run_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists revenue_plays (
  id text primary key,
  action_type text not null,
  target_agent text not null,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists revenue_plays_status_idx on revenue_plays (status);
create index if not exists revenue_plays_target_agent_idx on revenue_plays (target_agent);

create table if not exists blog_drafts (
  id text primary key,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaign_drafts (
  id text primary key,
  status text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists business_action_logs (
  id text primary key,
  agent_name text not null,
  approval_status text not null,
  input_data jsonb not null default '{}'::jsonb,
  recommendation jsonb not null,
  execution_result text,
  rollback_information text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists business_action_logs_agent_idx on business_action_logs (agent_name);
create index if not exists business_action_logs_approval_idx on business_action_logs (approval_status);

create table if not exists daily_command_reports (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists action_queue_items (
  id text primary key,
  dedupe_key text not null unique,
  status text not null,
  source_workflow text not null,
  source_agent text not null,
  action_type text not null,
  priority text not null,
  area text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists action_queue_items_status_idx on action_queue_items (status);
create index if not exists action_queue_items_area_idx on action_queue_items (area);
create index if not exists action_queue_items_priority_idx on action_queue_items (priority);

create table if not exists action_queue_events (
  id text primary key,
  action_id text not null,
  event_type text not null,
  actor text not null,
  note text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists action_queue_events_action_id_idx on action_queue_events (action_id);
create index if not exists action_queue_events_event_type_idx on action_queue_events (event_type);

create table if not exists alert_history (
  id text primary key,
  severity text not null,
  kind text not null,
  title text not null,
  body text not null,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

