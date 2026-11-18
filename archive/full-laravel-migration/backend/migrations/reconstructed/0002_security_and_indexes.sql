-- Access rules and indexes. All application writes except safe profile edits use backend service_role.
begin;
select pg_advisory_xact_lock(724318001);
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

grant select (id, email, full_name, role, date_of_birth, gender, national_id, mobile_number, whatsapp_number, vehicle_type, vehicle_plate, driver_approved, driver_verification_status, service_types, avatar_url, address, created_at, updated_at) on public.profiles to anon, authenticated;
create policy profiles_read on public.profiles for select to anon, authenticated using (id = (select auth.uid()));

grant select (id, vertical, name, cuisine_type, description, logo_url, address, street, building_number, lat, lng, service_radius_km, is_active, status, accepting_orders, is_featured, badge, created_at) on public.merchants to anon, authenticated;
create policy merchants_read on public.merchants for select to anon, authenticated using (is_active and status = 'active');

grant select (id, merchant_id, weekday, opens_at, closes_at) on public.merchant_hours to anon, authenticated;
create policy merchant_hours_read on public.merchant_hours for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active'));

grant select (id, booking_code, user_id, assigned_driver_id, order_type, trip_type, airport_terminal, pickup_address, pickup_street, pickup_building, pickup_lat, pickup_lng, dropoff_address, dropoff_street, dropoff_building, dropoff_lat, dropoff_lng, pickup_datetime, passenger_count, luggage_count, notes, passenger_name, passenger_mobile, passenger_whatsapp, passenger_email, fare_amount, distance_km, distance_surcharge, vat_amount, vat_rate, total_amount, currency, payment_method, payment_status, booking_status, driver_ride_status, verification_mode, gateway_charge_id, confirmed_at, test_auto_verified_at, created_at) on public.bookings to anon, authenticated;
create policy bookings_read on public.bookings for select to anon, authenticated using (user_id = (select auth.uid()));

grant select (id, merchant_id, name, description, image_url, sort_order, is_active, created_at) on public.menu_categories to anon, authenticated;
create policy menu_categories_read on public.menu_categories for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active'));

grant select (id, merchant_id, category_id, name, description, image_url, price, is_available, item_type, size_options, created_at) on public.menu_items to anon, authenticated;
create policy menu_items_read on public.menu_items for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active') and is_available);

grant select (id, merchant_id, name, description, image_url, sort_order, is_active, created_at) on public.product_categories to anon, authenticated;
create policy product_categories_read on public.product_categories for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active'));

grant select (id, merchant_id, category_id, name, description, image_url, price, is_available, brand, unit, weight_grams, barcode, track_stock, created_at) on public.products to anon, authenticated;
create policy products_read on public.products for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active') and is_available);

grant select (id, product_id, sku, label, price, sort_order, is_available, created_at) on public.product_variants to anon, authenticated;
create policy product_variants_read on public.product_variants for select to anon, authenticated using (is_available and exists(select 1 from public.products p where p.id=product_id));

grant select (id, customer_id, merchant_id, created_at) on public.carts to anon, authenticated;
create policy carts_read on public.carts for select to anon, authenticated using (customer_id = (select auth.uid()));

grant select (id, cart_id, menu_item_id, size, quantity, unit_price, created_at) on public.cart_items to anon, authenticated;
create policy cart_items_read on public.cart_items for select to anon, authenticated using (exists(select 1 from public.carts c where c.id=cart_id and c.customer_id=(select auth.uid())));

grant select (id, order_code, customer_id, merchant_id, status, subtotal, delivery_fee, delivery_surcharge, vat_amount, vat_rate, total, distance_km, delivery_address, delivery_lat, delivery_lng, delivery_street, delivery_building, contact_phone, payment_status, payment_method, accepted_at, ready_at, delivered_at, reject_reason, cancelled_by, cancelled_at, created_at) on public.orders to anon, authenticated;
create policy orders_read on public.orders for select to anon, authenticated using (customer_id = (select auth.uid()));

grant select (id, order_id, menu_item_id, size_snapshot, name_snapshot, unit_price, quantity, line_total, created_at) on public.order_items to anon, authenticated;
create policy order_items_read on public.order_items for select to anon, authenticated using (exists(select 1 from public.orders o where o.id=order_id and o.customer_id=(select auth.uid())));

grant select (id, order_id, customer_id, merchant_id, food_rating, comment, created_at) on public.ratings to anon, authenticated;
create policy ratings_read on public.ratings for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active'));

grant select (id, customer_id, merchant_id, created_at) on public.shop_carts to anon, authenticated;
create policy shop_carts_read on public.shop_carts for select to anon, authenticated using (customer_id = (select auth.uid()));

grant select (id, cart_id, product_id, variant_id, quantity, unit_price, created_at) on public.shop_cart_items to anon, authenticated;
create policy shop_cart_items_read on public.shop_cart_items for select to anon, authenticated using (exists(select 1 from public.shop_carts c where c.id=cart_id and c.customer_id=(select auth.uid())));

grant select (id, order_code, customer_id, merchant_id, status, subtotal, delivery_fee, delivery_surcharge, vat_amount, vat_rate, total, distance_km, delivery_address, delivery_lat, delivery_lng, delivery_street, delivery_building, contact_phone, payment_status, payment_method, accepted_at, ready_at, delivered_at, reject_reason, cancelled_by, cancelled_at, packed_at, stock_reserved_at, stock_released_at, created_at) on public.shop_orders to anon, authenticated;
create policy shop_orders_read on public.shop_orders for select to anon, authenticated using (customer_id = (select auth.uid()));

grant select (id, order_id, product_id, variant_id, variant_label_snapshot, sku_snapshot, name_snapshot, unit_price, quantity, line_total, created_at) on public.shop_order_items to anon, authenticated;
create policy shop_order_items_read on public.shop_order_items for select to anon, authenticated using (exists(select 1 from public.shop_orders o where o.id=order_id and o.customer_id=(select auth.uid())));

grant select (id, order_id, customer_id, merchant_id, product_rating, comment, created_at) on public.shop_ratings to anon, authenticated;
create policy shop_ratings_read on public.shop_ratings for select to anon, authenticated using (exists(select 1 from public.merchants m where m.id=merchant_id and m.is_active and m.status='active'));

grant select (id, user_id, booking_id, order_id, shop_order_id, type, channel, code, read_at, sent_at, created_at) on public.notification_events to anon, authenticated;
create policy notification_events_read on public.notification_events for select to anon, authenticated using (user_id = (select auth.uid()));

grant update(full_name,mobile_number,whatsapp_number,date_of_birth,gender,avatar_url,address) on public.profiles to authenticated;
create policy profiles_edit_self on public.profiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));

create unique index cart_item_identity on public.cart_items(cart_id,menu_item_id,coalesce(size,''));
create unique index shop_cart_item_identity on public.shop_cart_items(cart_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));
create unique index uq_spm_one_default on public.saved_payment_methods(user_id) where is_default and deleted_at is null;
create unique index uq_spm_active_card on public.saved_payment_methods(user_id,provider,gateway_card_id) where deleted_at is null;
create unique index driver_cash_booking_charge on public.driver_cash_ledger(booking_id) where type='charge' and booking_id is not null;
create index driver_latest_fix on public.driver_locations(driver_id,recorded_at desc);
create index error_logs_unresolved on public.error_logs(occurred_at desc) where resolved_at is null;
create index error_logs_fingerprint on public.error_logs(fingerprint,occurred_at desc);
create index login_events_time on public.admin_login_events(occurred_at desc);
create index offers_expiry on public.dispatch_offers(expires_at) where status='pending';
create unique index dispatch_one_pending_booking_id on public.dispatch_offers(booking_id) where status='pending' and booking_id is not null;
create unique index dispatch_one_pending_order_id on public.dispatch_offers(order_id) where status='pending' and order_id is not null;
create unique index dispatch_one_pending_shop_order_id on public.dispatch_offers(shop_order_id) where status='pending' and shop_order_id is not null;
create unique index order_cash_once on public.order_payments(order_id) where provider='cash' and status='paid';
create unique index shop_order_cash_once on public.shop_order_payments(order_id) where provider='cash' and status='paid';
create index profiles_disabled_by_idx on public.profiles(disabled_by);
create index merchants_owner_id_idx on public.merchants(owner_id);
create index merchant_hours_merchant_id_idx on public.merchant_hours(merchant_id);
create index bookings_user_id_idx on public.bookings(user_id);
create index bookings_assigned_driver_id_idx on public.bookings(assigned_driver_id);
create index menu_categories_merchant_id_idx on public.menu_categories(merchant_id);
create index menu_items_merchant_id_idx on public.menu_items(merchant_id);
create index menu_items_category_id_idx on public.menu_items(category_id);
create index product_categories_merchant_id_idx on public.product_categories(merchant_id);
create index products_merchant_id_idx on public.products(merchant_id);
create index products_category_id_idx on public.products(category_id);
create index product_variants_product_id_idx on public.product_variants(product_id);
create index carts_customer_id_idx on public.carts(customer_id);
create index carts_merchant_id_idx on public.carts(merchant_id);
create index cart_items_cart_id_idx on public.cart_items(cart_id);
create index cart_items_menu_item_id_idx on public.cart_items(menu_item_id);
create index orders_customer_id_idx on public.orders(customer_id);
create index orders_merchant_id_idx on public.orders(merchant_id);
create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_menu_item_id_idx on public.order_items(menu_item_id);
create index order_payments_order_id_idx on public.order_payments(order_id);
create index deliveries_order_id_idx on public.deliveries(order_id);
create index deliveries_driver_id_idx on public.deliveries(driver_id);
create index ratings_order_id_idx on public.ratings(order_id);
create index ratings_customer_id_idx on public.ratings(customer_id);
create index ratings_merchant_id_idx on public.ratings(merchant_id);
create index shop_carts_customer_id_idx on public.shop_carts(customer_id);
create index shop_carts_merchant_id_idx on public.shop_carts(merchant_id);
create index shop_cart_items_cart_id_idx on public.shop_cart_items(cart_id);
create index shop_cart_items_product_id_idx on public.shop_cart_items(product_id);
create index shop_cart_items_variant_id_idx on public.shop_cart_items(variant_id);
create index shop_orders_customer_id_idx on public.shop_orders(customer_id);
create index shop_orders_merchant_id_idx on public.shop_orders(merchant_id);
create index shop_order_items_order_id_idx on public.shop_order_items(order_id);
create index shop_order_items_product_id_idx on public.shop_order_items(product_id);
create index shop_order_items_variant_id_idx on public.shop_order_items(variant_id);
create index shop_order_payments_order_id_idx on public.shop_order_payments(order_id);
create index shop_deliveries_order_id_idx on public.shop_deliveries(order_id);
create index shop_deliveries_driver_id_idx on public.shop_deliveries(driver_id);
create index shop_ratings_order_id_idx on public.shop_ratings(order_id);
create index shop_ratings_customer_id_idx on public.shop_ratings(customer_id);
create index shop_ratings_merchant_id_idx on public.shop_ratings(merchant_id);
create index payment_proofs_booking_id_idx on public.payment_proofs(booking_id);
create index payment_proofs_admin_reviewer_id_idx on public.payment_proofs(admin_reviewer_id);
create index payments_booking_id_idx on public.payments(booking_id);
create index payments_verified_by_admin_id_idx on public.payments(verified_by_admin_id);
create index tracking_events_booking_id_idx on public.tracking_events(booking_id);
create index tracking_events_created_by_user_id_idx on public.tracking_events(created_by_user_id);
create index ledger_entries_booking_id_idx on public.ledger_entries(booking_id);
create index ledger_entries_driver_id_idx on public.ledger_entries(driver_id);
create index driver_cash_ledger_driver_id_idx on public.driver_cash_ledger(driver_id);
create index driver_cash_ledger_booking_id_idx on public.driver_cash_ledger(booking_id);
create index driver_cash_ledger_created_by_idx on public.driver_cash_ledger(created_by);
create index driver_documents_driver_id_idx on public.driver_documents(driver_id);
create index driver_documents_reviewed_by_admin_id_idx on public.driver_documents(reviewed_by_admin_id);
create index driver_locations_driver_id_idx on public.driver_locations(driver_id);
create index dispatch_offers_driver_id_idx on public.dispatch_offers(driver_id);
create index dispatch_offers_booking_id_idx on public.dispatch_offers(booking_id);
create index dispatch_offers_order_id_idx on public.dispatch_offers(order_id);
create index dispatch_offers_shop_order_id_idx on public.dispatch_offers(shop_order_id);
create index driver_ratings_driver_id_idx on public.driver_ratings(driver_id);
create index driver_ratings_customer_id_idx on public.driver_ratings(customer_id);
create index driver_ratings_booking_id_idx on public.driver_ratings(booking_id);
create index driver_ratings_order_id_idx on public.driver_ratings(order_id);
create index driver_ratings_shop_order_id_idx on public.driver_ratings(shop_order_id);
create index merchant_credit_ledger_merchant_id_idx on public.merchant_credit_ledger(merchant_id);
create index merchant_credit_ledger_order_id_idx on public.merchant_credit_ledger(order_id);
create index merchant_credit_ledger_shop_order_id_idx on public.merchant_credit_ledger(shop_order_id);
create index merchant_credit_ledger_created_by_idx on public.merchant_credit_ledger(created_by);
create index device_push_tokens_user_id_idx on public.device_push_tokens(user_id);
create index notification_events_user_id_idx on public.notification_events(user_id);
create index notification_events_booking_id_idx on public.notification_events(booking_id);
create index notification_events_order_id_idx on public.notification_events(order_id);
create index notification_events_shop_order_id_idx on public.notification_events(shop_order_id);
create index fd_analytics_events_user_id_idx on public.fd_analytics_events(user_id);
create index fd_analytics_events_merchant_id_idx on public.fd_analytics_events(merchant_id);
create index fd_analytics_events_order_id_idx on public.fd_analytics_events(order_id);
create index fd_analytics_events_shop_order_id_idx on public.fd_analytics_events(shop_order_id);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index app_settings_updated_by_idx on public.app_settings(updated_by);
create index admin_login_events_profile_id_idx on public.admin_login_events(profile_id);
create index error_logs_user_id_idx on public.error_logs(user_id);
create index error_logs_resolved_by_idx on public.error_logs(resolved_by);
create index payment_customers_user_id_idx on public.payment_customers(user_id);
create index saved_payment_methods_user_id_idx on public.saved_payment_methods(user_id);
create index webhook_events_booking_id_idx on public.webhook_events(booking_id);
create index webhook_events_order_id_idx on public.webhook_events(order_id);
create index webhook_events_shop_order_id_idx on public.webhook_events(shop_order_id);

-- RPC privilege introspection is service-only; avoid dynamic SQL injection.
create function public.check_column_privilege(p_role text,p_table text,p_column text,p_privilege text)
returns boolean language sql stable security invoker set search_path=pg_catalog
as $$ select has_column_privilege(p_role,format('public.%I',p_table),p_column,p_privilege); $$;
revoke all on function public.check_column_privilege(text,text,text,text) from public,anon,authenticated;
grant execute on function public.check_column_privilege(text,text,text,text) to service_role;
commit;
