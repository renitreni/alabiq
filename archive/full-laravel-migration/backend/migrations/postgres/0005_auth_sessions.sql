-- App-managed bearer sessions and single-use password recovery state.
create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash char(64) not null unique,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip inet
);
create index app_sessions_user_idx on public.app_sessions(user_id);
create index app_sessions_expiry_idx on public.app_sessions(idle_expires_at,absolute_expires_at);

create table public.password_reset_flows (
  state_hash char(64) primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_flows_expiry_idx on public.password_reset_flows(expires_at);

create table public.password_reset_tokens (
  token_hash char(64) primary key,
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_tokens_expiry_idx on public.password_reset_tokens(expires_at);
