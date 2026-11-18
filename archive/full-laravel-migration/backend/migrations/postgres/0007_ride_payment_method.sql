-- The ride checkout API uses this explicit name for its manual transfer path.
-- Older rows and the food/shop flows may still use the shorter `stcpay` value.
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_method_check
  check(payment_method in ('stcpay','stcpay_manual','cash','tap'));
