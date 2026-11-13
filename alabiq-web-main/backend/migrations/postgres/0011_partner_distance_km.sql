-- Phase 1.2: Add distance_km to delivery_quotes
-- 
-- The quote validation computes the merchant->dropoff distance (haversineKm).
-- We persist it on the quote so the order creation can use the same value
-- rather than recomputing (which could drift if merchant coordinates change).
--
-- Advisory lock 724318011 (next in sequence after 0010's 724318010).

set local lock_timeout = '10s';
select pg_advisory_xact_lock(724318011);

-- Add distance_km to delivery_quotes (merchant -> dropoff distance at quote time)
-- This is computed during quote validation and persisted so the order can use it.
alter table public.delivery_quotes
  add column if not exists distance_km numeric(12,2) check (distance_km >= 0);