-- Plain PostgreSQL baseline reconstructed from the application schema. Review README.md before production use.
-- PostgreSQL 15+. Deliberately fail on existing application tables.

set local lock_timeout = '10s';
select pg_advisory_xact_lock(724318001);
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  disabled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index app_users_email_lower_unique on public.app_users(lower(email));

create table public.profiles (
  id uuid primary key references public.app_users(id) on delete cascade,
  email text,
  full_name varchar(120),
  role text not null default 'passenger' check (role in ('passenger','driver','merchant','admin')),
  date_of_birth date,
  gender text,
  national_id text,
  mobile_number text,
  whatsapp_number text,
  vehicle_type text,
  vehicle_plate text,
  driver_approved boolean not null default false,
  driver_verification_status text not null default 'none',
  service_types text[] not null default array['pick_drop','food','shop'] check (cardinality(service_types)>0 and service_types <@ array['pick_drop','food','shop']::text[]),
  avatar_url text,
  address text,
  cash_owed numeric(14,2) not null default 0 check(cash_owed>=0),
  cash_owed_limit numeric(14,2) not null default 500 check(cash_owed_limit>0),
  is_super_admin boolean not null default false,
  disabled_at timestamptz,
  disabled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  unique(owner_id),
  vertical text not null default 'food' check(vertical in ('food','shop')),
  name text not null,
  cuisine_type text,
  description text,
  logo_url text,
  address text,
  street text,
  building_number text,
  lat double precision check(lat between -90 and 90),
  lng double precision check(lng between -180 and 180),
  service_radius_km numeric(10,2) not null default 15 check(service_radius_km>0),
  is_active boolean not null default false,
  status text not null default 'active' check(status in ('active','suspended','pending','rejected')),
  accepting_orders boolean not null default true,
  credit_limit numeric(14,2) not null default 500 check(credit_limit>=0),
  credit_used numeric(14,2) not null default 0 check(credit_used>=0),
  is_featured boolean not null default false,
  badge text,
  created_at timestamptz not null default now()
);

create table public.merchant_hours (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  weekday smallint not null check(weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check(opens_at<>closes_at),
  unique(merchant_id,weekday,opens_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default ('SM-' || upper(replace(gen_random_uuid()::text,'-',''))) ,
  user_id uuid references public.profiles(id) on delete set null,
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  order_type text not null default 'pick_drop' check(order_type in ('pick_drop','food','shop')),
  trip_type text not null,
  airport_terminal text,
  pickup_address text not null,
  pickup_street text,
  pickup_building text,
  pickup_lat double precision check(pickup_lat between -90 and 90),
  pickup_lng double precision check(pickup_lng between -180 and 180),
  dropoff_address text not null,
  dropoff_street text,
  dropoff_building text,
  dropoff_lat double precision check(dropoff_lat between -90 and 90),
  dropoff_lng double precision check(dropoff_lng between -180 and 180),
  pickup_datetime timestamptz not null,
  passenger_count integer not null default 1 check(passenger_count>0),
  luggage_count integer not null default 0 check(luggage_count>=0),
  notes text,
  passenger_name text,
  passenger_mobile text,
  passenger_whatsapp text,
  passenger_email text,
  fare_amount numeric(14,2) not null check(fare_amount>=0),
  distance_km numeric(12,2) check(distance_km>=0),
  distance_surcharge numeric(14,2) not null default 0 check(distance_surcharge>=0),
  vat_amount numeric(14,2) not null default 0 check(vat_amount>=0),
  vat_rate numeric(8,6) not null default 0.15 check(vat_rate between 0 and 1),
  total_amount numeric(14,2) check(total_amount>=0),
  currency text not null default 'SAR',
  payment_method text not null default 'stcpay' check(payment_method in ('stcpay','cash','tap')),
  payment_status text not null default 'awaiting_proof',
  booking_status text not null default 'pending_payment',
  driver_ride_status text,
  verification_mode text,
  gateway_charge_id text,
  confirmed_at timestamptz,
  test_auto_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  price numeric(14,2) not null check(price>0),
  net_price numeric(14,2) check(net_price>0 and net_price<=price),
  is_available boolean not null default true,
  item_type text not null default 'meal_package' check(item_type in ('meal_package','drink_dessert_addon')),
  size_options jsonb check(size_options is null or jsonb_typeof(size_options)='array'),
  created_at timestamptz not null default now()
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  description text,
  image_url text,
  price numeric(14,2) not null check(price>0),
  net_price numeric(14,2) check(net_price>0 and net_price<=price),
  is_available boolean not null default true,
  brand text,
  unit text,
  weight_grams integer check(weight_grams>=0),
  barcode text,
  stock_quantity integer not null default 0 check(stock_quantity>=0),
  low_stock_threshold integer not null default 5 check(low_stock_threshold>=0),
  track_stock boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text,
  label text not null,
  price numeric(14,2) check(price>0),
  net_price numeric(14,2) check(net_price>0 and (price is null or net_price<=price)),
  stock_quantity integer not null default 0 check(stock_quantity>=0),
  sort_order integer not null default 0,
  is_available boolean not null default true,
  unique(product_id,sku),
  created_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  unique(customer_id,merchant_id),
  created_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  size text,
  quantity integer not null check(quantity between 1 and 10000),
  unit_price numeric(14,2) not null check(unit_price>0),
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('FD-' || upper(replace(gen_random_uuid()::text,'-',''))),
  customer_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  status text not null default 'pending',
  subtotal numeric(14,2) not null check(subtotal>=0),
  delivery_fee numeric(14,2) not null default 0 check(delivery_fee>=0),
  delivery_surcharge numeric(14,2) not null default 0 check(delivery_surcharge>=0),
  driver_fee numeric(14,2) not null default 0 check(driver_fee>=0),
  driver_fee_rate numeric(8,6) not null default 0.9 check(driver_fee_rate between 0 and 1),
  platform_margin_total numeric(14,2) not null default 0 check(platform_margin_total>=0 and platform_margin_total<=subtotal),
  vat_amount numeric(14,2) not null default 0 check(vat_amount>=0),
  vat_rate numeric(8,6) not null default 0.15 check(vat_rate between 0 and 1),
  total numeric(14,2) not null check(total>=0),
  distance_km numeric(12,2) check(distance_km>=0),
  delivery_address text not null,
  delivery_lat double precision check(delivery_lat between -90 and 90),
  delivery_lng double precision check(delivery_lng between -180 and 180),
  delivery_street text,
  delivery_building text,
  contact_phone text,
  payment_status text not null default 'awaiting',
  payment_method text not null default 'stcpay',
  gateway_charge_id text,
  gateway_transaction_id text,
  accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  reject_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  preparing_reminder_count integer not null default 0 check(preparing_reminder_count>=0),
  preparing_reminder_last_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  size_snapshot text,
  name_snapshot text not null,
  unit_price numeric(14,2) not null check(unit_price>0),
  quantity integer not null check(quantity>0),
  line_total numeric(14,2) not null check(line_total=unit_price*quantity),
  margin_per_item numeric(14,2) not null default 0 check(margin_per_item>=0 and margin_per_item<=unit_price),
  margin_total numeric(14,2) not null default 0 check(margin_total=margin_per_item*quantity),
  created_at timestamptz not null default now()
);

create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  amount numeric(14,2) not null check(amount>=0),
  status text not null default 'awaiting',
  proof_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check(size_bytes>=0),
  gateway_transaction_id text unique,
  gateway_raw jsonb,
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'searching' check(status in ('searching','open','assigned','picked_up','delivered','cancelled')),
  fee numeric(14,2) not null default 0 check(fee>=0),
  pickup_photo_path text,
  delivery_photo_path text,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public.orders(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  food_rating smallint not null check(food_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.shop_carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  unique(customer_id,merchant_id),
  created_at timestamptz not null default now()
);

create table public.shop_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.shop_carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  quantity integer not null check(quantity between 1 and 10000),
  unit_price numeric(14,2) not null check(unit_price>0),
  created_at timestamptz not null default now()
);

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default ('SH-' || upper(replace(gen_random_uuid()::text,'-',''))),
  customer_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  status text not null default 'pending',
  subtotal numeric(14,2) not null check(subtotal>=0),
  delivery_fee numeric(14,2) not null default 0 check(delivery_fee>=0),
  delivery_surcharge numeric(14,2) not null default 0 check(delivery_surcharge>=0),
  driver_fee numeric(14,2) not null default 0 check(driver_fee>=0),
  driver_fee_rate numeric(8,6) not null default 0.9 check(driver_fee_rate between 0 and 1),
  platform_margin_total numeric(14,2) not null default 0 check(platform_margin_total>=0 and platform_margin_total<=subtotal),
  vat_amount numeric(14,2) not null default 0 check(vat_amount>=0),
  vat_rate numeric(8,6) not null default 0.15 check(vat_rate between 0 and 1),
  total numeric(14,2) not null check(total>=0),
  distance_km numeric(12,2) check(distance_km>=0),
  delivery_address text not null,
  delivery_lat double precision check(delivery_lat between -90 and 90),
  delivery_lng double precision check(delivery_lng between -180 and 180),
  delivery_street text,
  delivery_building text,
  contact_phone text,
  payment_status text not null default 'awaiting',
  payment_method text not null default 'stcpay',
  gateway_charge_id text,
  gateway_transaction_id text,
  accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  reject_reason text,
  cancelled_by text,
  cancelled_at timestamptz,
  packed_at timestamptz,
  stock_reserved_at timestamptz,
  stock_released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shop_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  variant_label_snapshot text,
  sku_snapshot text,
  reserved_qty integer not null default 0 check(reserved_qty>=0 and reserved_qty<=quantity),
  name_snapshot text not null,
  unit_price numeric(14,2) not null check(unit_price>0),
  quantity integer not null check(quantity>0),
  line_total numeric(14,2) not null check(line_total=unit_price*quantity),
  margin_per_item numeric(14,2) not null default 0 check(margin_per_item>=0 and margin_per_item<=unit_price),
  margin_total numeric(14,2) not null default 0 check(margin_total=margin_per_item*quantity),
  created_at timestamptz not null default now()
);

create table public.shop_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete restrict,
  provider text not null,
  amount numeric(14,2) not null check(amount>=0),
  status text not null default 'awaiting',
  proof_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check(size_bytes>=0),
  gateway_transaction_id text unique,
  gateway_raw jsonb,
  created_at timestamptz not null default now()
);

create table public.shop_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.shop_orders(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  status text not null default 'searching' check(status in ('searching','open','assigned','picked_up','delivered','cancelled')),
  fee numeric(14,2) not null default 0 check(fee>=0),
  pickup_photo_path text,
  delivery_photo_path text,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shop_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public.shop_orders(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  product_rating smallint not null check(product_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  file_url text not null,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint check(file_size_bytes>=0),
  file_hash text,
  status text not null default 'uploaded',
  verification_mode text,
  admin_reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  test_auto_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null,
  amount numeric(14,2) not null check(amount>=0),
  currency text not null default 'SAR',
  status text not null,
  manual_reference text,
  verified_by_admin_id uuid references public.profiles(id) on delete set null,
  verified_by_system boolean not null default false,
  verification_mode text,
  verified_at timestamptz,
  gateway_provider text,
  gateway_payment_id text unique,
  gateway_reference text,
  gateway_status text,
  gateway_raw jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  event_type text not null,
  title text,
  message text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  gross_fare numeric(14,2) not null,
  platform_commission numeric(14,2) not null,
  manual_payment_fee numeric(14,2) not null,
  driver_gross numeric(14,2) not null,
  driver_net numeric(14,2) not null,
  platform_net numeric(14,2) not null,
  payout_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.driver_cash_ledger (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete restrict,
  type text not null check(type in ('charge','settlement')),
  amount numeric(14,2) not null check(amount>0),
  balance_after numeric(14,2) not null check(balance_after>=0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  file_size_bytes bigint check(file_size_bytes>=0),
  file_hash text,
  expiry_date date,
  status text not null default 'pending',
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid references public.profiles(id) on delete set null,
  unique(driver_id,doc_type),
  created_at timestamptz not null default now()
);

create table public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  accuracy_meters double precision check(accuracy_meters>=0),
  heading double precision check(heading>=0 and heading<360),
  speed_kmh double precision check(speed_kmh>=0),
  recorded_at timestamptz not null default now()
);

create table public.dispatch_offers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  shop_order_id uuid references public.shop_orders(id) on delete cascade,
  round integer not null default 1 check(round>0),
  distance_km numeric(12,2) check(distance_km>=0),
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired','cancelled')),
  expires_at timestamptz not null,
  responded_at timestamptz,
  check(num_nonnulls(booking_id,order_id,shop_order_id)=1),
  created_at timestamptz not null default now()
);

create table public.driver_ratings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  shop_order_id uuid references public.shop_orders(id) on delete cascade,
  stars smallint not null check(stars between 1 and 5),
  comment text,
  check(num_nonnulls(booking_id,order_id,shop_order_id)=1),
  unique(booking_id),
  unique(order_id),
  unique(shop_order_id),
  created_at timestamptz not null default now()
);

create table public.merchant_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  shop_order_id uuid references public.shop_orders(id) on delete restrict,
  type text not null,
  amount numeric(14,2) not null,
  balance_after numeric(14,2) not null check(balance_after>=0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check(platform in ('android','ios','web')),
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  shop_order_id uuid references public.shop_orders(id) on delete cascade,
  type text not null,
  channel text not null default 'in_app',
  code text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fd_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  shop_order_id uuid references public.shop_orders(id) on delete set null,
  params jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table public.admin_login_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  email text,
  role text,
  ip text,
  user_agent text,
  occurred_at timestamptz not null default now()
);

create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  severity text not null default 'error',
  label text not null,
  message text not null,
  error_name text,
  stack text,
  request_id text,
  method text,
  path text,
  status_code integer,
  ip text,
  user_agent text,
  user_id uuid references public.profiles(id) on delete set null,
  user_email text,
  user_role text,
  fingerprint text,
  suppressed_count integer not null default 0 check(suppressed_count>=0),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create table public.payment_customers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'tap',
  gateway_customer_id text not null,
  unique(provider,gateway_customer_id),
  created_at timestamptz not null default now()
);

create table public.saved_payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'tap',
  gateway_customer_id text not null,
  gateway_card_id text not null,
  payment_agreement_id text,
  brand text,
  last4 text check(last4 ~ '^[0-9]{4}$'),
  exp_month smallint check(exp_month between 1 and 12),
  exp_year integer,
  funding text,
  is_default boolean not null default false,
  consent_at timestamptz not null default now(),
  consent_reference text,
  last_used_at timestamptz,
  deleted_at timestamptz,
  check(not is_default or deleted_at is null),
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text,
  gateway_payment_id text,
  signature_verified boolean not null default false,
  verified_by_fetch boolean not null default false,
  payload jsonb,
  payload_sha256 text,
  booking_id uuid references public.bookings(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  shop_order_id uuid references public.shop_orders(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.app_settings(key,value) values ('max_distance_km','null'::jsonb),('stcpay_enabled','true'::jsonb);
