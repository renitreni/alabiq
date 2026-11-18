-- Alabiq API-owned sessions and password recovery state.
-- Apply once in Supabase SQL Editor before deploying the matching backend.
begin;

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip inet
);

create index if not exists app_sessions_user_active_idx
  on public.app_sessions(user_id, revoked_at, absolute_expires_at);

create table if not exists public.password_reset_flows (
  state_hash text primary key,
  verifier_ciphertext text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists public.password_reset_tickets (
  ticket_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

alter table public.app_sessions enable row level security;
alter table public.password_reset_flows enable row level security;
alter table public.password_reset_tickets enable row level security;
revoke all on public.app_sessions, public.password_reset_flows, public.password_reset_tickets
  from anon, authenticated;
grant all on public.app_sessions, public.password_reset_flows, public.password_reset_tickets
  to service_role;

commit;
