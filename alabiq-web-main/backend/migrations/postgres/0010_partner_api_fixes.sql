-- Phase 1.1: Partner API fixes (post-0009)
-- 
-- Fixes two issues from 0008:
-- 1. Line 88 promised to extend orders.payment_method check constraint in 0009,
--    but 0009 (GPS indexes) never did. The partner code writes 'external' as
--    payment_method for restaurant_partner orders. We add 'external' to the
--    existing check constraint here.
-- 2. 0008 added NOT NULL columns with inline CHECK constraints directly on the
--    live orders table. For any remaining new constraints we use NOT VALID +
--    VALIDATE CONSTRAINT (non-blocking) to avoid long table locks on large tables.
--    The payment_method change below follows this pattern.
--
-- Advisory lock 724318010 (next in sequence after 0009's 724318009).

set local lock_timeout = '10s';
select pg_advisory_xact_lock(724318010);

-- 1) Extend orders.payment_method check constraint to include 'external'
--    (partner-sourced orders where payment is collected by the restaurant).
--    The constraint currently allows ('stcpay','cash','tap') per 0001_schema.sql:238.
--    We add 'external' using the non-blocking NOT VALID + VALIDATE pattern.
--
--    PostgreSQL does not support "ADD CONSTRAINT IF NOT EXISTS ... NOT VALID" in one
--    statement. We drop the old constraint first (if it exists), then add the new
--    one NOT VALID, then validate it. This is safe because the new constraint is a
--    strict superset of the old one ('external' is the only addition).

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('stcpay','cash','tap','external'))
  not valid;

alter table public.orders
  validate constraint orders_payment_method_check;

-- 2) Ensure the tracking_token_revoked_at column exists (added in 0008 but
--    guard with IF NOT EXISTS for idempotency on re-apply)
alter table public.orders
  add column if not exists tracking_token_revoked_at timestamptz;

-- 3) Add comment documenting the 'external' payment method
comment on column public.orders.payment_method is
  'Payment method: stcpay, cash, tap, or external (restaurant collects payment directly).';