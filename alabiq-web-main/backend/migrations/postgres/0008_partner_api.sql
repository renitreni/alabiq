-- Phase 1: Partner API additive schema
-- Adds partner credentials, quotes, idempotency keys, background jobs, and order extensions
-- All additive; no historical tables dropped.

set local lock_timeout = '10s';
select pg_advisory_xact_lock(724318008);

-- Partner API credentials (one per merchant/branch)
create table public.partner_api_credentials (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null
);
create unique index partner_credentials_merchant_active on public.partner_api_credentials(merchant_id) where revoked_at is null;
create index partner_credentials_prefix on public.partner_api_credentials(key_prefix);

-- Delivery quotes (bound to branch, external_order_id, drop-off, fee, expiry)
create table public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  external_order_id text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  dropoff_address text,
  dropoff_instructions text,
  delivery_fee_minor integer not null,
  currency text not null default 'SAR',
  pricing_version text not null,
  request_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_order_id uuid references public.orders(id) on delete set null
);
create unique index delivery_quotes_tenant_external on public.delivery_quotes(merchant_id, external_order_id) where consumed_at is null;
create index delivery_quotes_expires on public.delivery_quotes(expires_at) where consumed_at is null;

-- Partner idempotency keys (durable, survives restarts)
create table public.partner_idempotency_keys (
  credential_id uuid not null references public.partner_api_credentials(id) on delete cascade,
  operation text not null check (operation in ('quote','create','cancel','preparation','rotate_tracking')),
  key text not null,
  request_hash text not null,
  state text not null default 'in_progress' check (state in ('in_progress','completed','failed_retryable')),
  http_status integer,
  response_body_encrypted bytea,
  resource_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (credential_id, operation, key)
);
create index partner_idempotency_expires on public.partner_idempotency_keys(expires_at) where state = 'in_progress';

-- Background jobs (for dispatch, webhooks, GPS sampling)
create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedup_key text,
  payload jsonb not null,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  lease_owner text,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index background_jobs_due on public.background_jobs(run_at) where completed_at is null;
create unique index background_jobs_dedup on public.background_jobs(kind, dedup_key) where dedup_key is not null;
create index background_jobs_lease on public.background_jobs(lease_owner) where lease_expires_at > now();

-- Order/delivery extensions for partner-sourced orders
alter table public.orders add column if not exists source text not null default 'alabiq_marketplace'
  check (source in ('alabiq_marketplace','restaurant_partner'));
alter table public.orders add column if not exists external_order_id text;
alter table public.orders add column if not exists payment_collection text not null default 'alabiq'
  check (payment_collection in ('alabiq','restaurant'));
alter table public.orders add column if not exists payment_method text;
-- payment_method already exists with check constraint; we'll extend it in 0009
-- External payment reference (for reconciliation)
alter table public.orders add column if not exists external_payment_reference text;
-- Encrypted idempotency response reference (for replay with tracking token)
alter table public.orders add column if not exists idempotency_response_encrypted bytea;
-- Tracking token hash + expiry/revocation (public tracking authorization)
alter table public.orders add column if not exists tracking_token_hash char(64);
alter table public.orders add column if not exists tracking_token_expires_at timestamptz;
alter table public.orders add column if not exists tracking_token_revoked_at timestamptz;

-- Unique constraint for partner-sourced orders (tenant-scoped)
create unique index orders_partner_external on public.orders(merchant_id, external_order_id)
  where source = 'restaurant_partner' and external_order_id is not null;

-- Webhook endpoints per merchant
create table public.partner_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  url text not null,
  secret_encrypted bytea not null,
  events text[] not null default array['delivery.searching','delivery.rider_assigned','delivery.picked_up','delivery.delivered','delivery.cancelled','delivery.search_exhausted'],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index partner_webhooks_merchant on public.partner_webhook_endpoints(merchant_id);

-- Webhook delivery attempts (outbox pattern)
create table public.partner_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.partner_webhook_endpoints(id) on delete cascade,
  event_type text not null,
  delivery_id uuid not null references public.orders(id) on delete cascade,
  payload jsonb not null,
  sequence integer not null,
  attempt integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index partner_webhook_deliveries_pending on public.partner_webhook_deliveries(next_attempt_at) where completed_at is null;
create index partner_webhook_deliveries_endpoint on public.partner_webhook_deliveries(endpoint_id);
