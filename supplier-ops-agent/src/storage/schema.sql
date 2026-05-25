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

create table if not exists alert_history (
  id text primary key,
  severity text not null,
  kind text not null,
  title text not null,
  body text not null,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

