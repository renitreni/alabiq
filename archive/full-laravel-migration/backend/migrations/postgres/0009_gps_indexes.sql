-- Phase 4: GPS hot path indexes and history table
-- Adds driver_location_history table and indexes for GPS ingestion, candidate queries, and worker job leases.

set local lock_timeout = '10s';
select pg_advisory_xact_lock(724318009);

-- Driver location history (sampled from Redis hot path by worker GPS_SAMPLING job)
create table public.driver_location_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  recorded_at timestamptz not null,
  accuracy double precision check(accuracy>=0),
  speed_kmh double precision check(speed_kmh>=0),
  heading double precision check(heading>=0 and heading<360),
  created_at timestamptz not null default now()
);

-- Composite index for driver timeline queries (latest fix per driver)
create index driver_location_history_driver_time on public.driver_location_history(driver_id, recorded_at desc);

-- Index for spatial/temporal queries (e.g., heatmaps, replay)
create index driver_location_history_time on public.driver_location_history(recorded_at desc);

-- Index for driver_locations: latest fix per driver (used by PG fallback in getCurrentLocation)
create index driver_locations_driver_time on public.driver_locations(driver_id, recorded_at desc);

-- Index for background_jobs: worker SKIP LOCKED claim pattern
-- Query: WHERE kind IN (...) AND completed_at IS NULL AND run_at <= now() AND (lease_owner IS NULL OR lease_expires_at <= now()) ORDER BY run_at
create index background_jobs_claim on public.background_jobs(kind, run_at, completed_at, lease_owner, lease_expires_at)
  where completed_at is null;

-- Partial index for active leases (lease renewal / cleanup)
create index background_jobs_active_lease on public.background_jobs(lease_owner, lease_expires_at)
  where lease_owner is not null and lease_expires_at is not null;