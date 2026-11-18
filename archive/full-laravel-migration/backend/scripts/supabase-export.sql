-- Supabase -> standalone PostgreSQL data export
--
-- Run from an EMPTY working directory (CSV files are written relative to it):
--
--   mkdir -p csv && cd csv
--   psql "$SUPABASE_DB_URL" -f /path/to/backend/scripts/supabase-export.sql
--
-- SUPABASE_DB_URL is the direct Postgres connection string from the Supabase
-- dashboard (Settings -> Database). Use the pooler host ...pooler.supabase.com:6543
-- with options=?pgbouncer=true&connection_limit=1 if port 5432 is unreachable.
-- The role needs read access to auth.users (the postgres role has it).
--
-- Output: one CSV per public table (same names/columns as the new baseline),
-- plus auth_users.csv with the subset of GoTrue columns the importer needs.

-- GoTrue auth users: explicit column list so GoTrue version drift on either
-- side cannot break the export.
\copy (SELECT id, email, encrypted_password, email_confirmed_at, last_sign_in_at, created_at, updated_at, banned_until, deleted_at, is_anonymous FROM auth.users ORDER BY created_at) TO 'auth_users.csv' WITH CSV HEADER

-- Public schema: user data only. Column lists come from the reconstructed
-- pre-Drop-Supabase schema, which matches the standalone baseline column
-- for column (verified by diff). Avoid SELECT * ORDER BY needs a pk sort? no.
\copy (SELECT * FROM public.admin_login_events) TO 'admin_login_events.csv' WITH CSV HEADER
\copy (SELECT * FROM public.app_settings) TO 'app_settings.csv' WITH CSV HEADER
\copy (SELECT * FROM public.audit_logs) TO 'audit_logs.csv' WITH CSV HEADER
\copy (SELECT * FROM public.bookings) TO 'bookings.csv' WITH CSV HEADER
\copy (SELECT * FROM public.cart_items) TO 'cart_items.csv' WITH CSV HEADER
\copy (SELECT * FROM public.carts) TO 'carts.csv' WITH CSV HEADER
\copy (SELECT * FROM public.deliveries) TO 'deliveries.csv' WITH CSV HEADER
\copy (SELECT * FROM public.device_push_tokens) TO 'device_push_tokens.csv' WITH CSV HEADER
\copy (SELECT * FROM public.dispatch_offers) TO 'dispatch_offers.csv' WITH CSV HEADER
\copy (SELECT * FROM public.driver_cash_ledger) TO 'driver_cash_ledger.csv' WITH CSV HEADER
\copy (SELECT * FROM public.driver_documents) TO 'driver_documents.csv' WITH CSV HEADER
\copy (SELECT * FROM public.driver_locations) TO 'driver_locations.csv' WITH CSV HEADER
\copy (SELECT * FROM public.driver_ratings) TO 'driver_ratings.csv' WITH CSV HEADER
\copy (SELECT * FROM public.error_logs) TO 'error_logs.csv' WITH CSV HEADER
\copy (SELECT * FROM public.fd_analytics_events) TO 'fd_analytics_events.csv' WITH CSV HEADER
\copy (SELECT * FROM public.ledger_entries) TO 'ledger_entries.csv' WITH CSV HEADER
\copy (SELECT * FROM public.menu_categories) TO 'menu_categories.csv' WITH CSV HEADER
\copy (SELECT * FROM public.menu_items) TO 'menu_items.csv' WITH CSV HEADER
\copy (SELECT * FROM public.merchant_credit_ledger) TO 'merchant_credit_ledger.csv' WITH CSV HEADER
\copy (SELECT * FROM public.merchant_hours) TO 'merchant_hours.csv' WITH CSV HEADER
\copy (SELECT * FROM public.merchants) TO 'merchants.csv' WITH CSV HEADER
\copy (SELECT * FROM public.notification_events) TO 'notification_events.csv' WITH CSV HEADER
\copy (SELECT * FROM public.order_items) TO 'order_items.csv' WITH CSV HEADER
\copy (SELECT * FROM public.order_payments) TO 'order_payments.csv' WITH CSV HEADER
\copy (SELECT * FROM public.orders) TO 'orders.csv' WITH CSV HEADER
\copy (SELECT * FROM public.payment_customers) TO 'payment_customers.csv' WITH CSV HEADER
\copy (SELECT * FROM public.payment_proofs) TO 'payment_proofs.csv' WITH CSV HEADER
\copy (SELECT * FROM public.payments) TO 'payments.csv' WITH CSV HEADER
\copy (SELECT * FROM public.product_categories) TO 'product_categories.csv' WITH CSV HEADER
\copy (SELECT * FROM public.product_variants) TO 'product_variants.csv' WITH CSV HEADER
\copy (SELECT * FROM public.products) TO 'products.csv' WITH CSV HEADER
\copy (SELECT * FROM public.profiles) TO 'profiles.csv' WITH CSV HEADER
\copy (SELECT * FROM public.ratings) TO 'ratings.csv' WITH CSV HEADER
\copy (SELECT * FROM public.saved_payment_methods) TO 'saved_payment_methods.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_cart_items) TO 'shop_cart_items.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_carts) TO 'shop_carts.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_deliveries) TO 'shop_deliveries.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_order_items) TO 'shop_order_items.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_order_payments) TO 'shop_order_payments.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_orders) TO 'shop_orders.csv' WITH CSV HEADER
\copy (SELECT * FROM public.shop_ratings) TO 'shop_ratings.csv' WITH CSV HEADER
\copy (SELECT * FROM public.tracking_events) TO 'tracking_events.csv' WITH CSV HEADER
\copy (SELECT * FROM public.webhook_events) TO 'webhook_events.csv' WITH CSV HEADER
