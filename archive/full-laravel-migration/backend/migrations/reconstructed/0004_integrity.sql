-- Additional invariants recovered from application validation.
begin;
select pg_advisory_xact_lock(724318001);
alter table public.bookings add check(booking_status in
  ('pending_payment','payment_under_review','confirmed','driver_assigned','driver_on_the_way','arrived','in_progress','completed','cancelled'));
alter table public.bookings add check(driver_ride_status in ('accepted','on_the_way','arrived','started','completed','cancelled'));
alter table public.bookings add check(payment_status in ('awaiting_proof','proof_uploaded','verified','rejected','pending','failed','refunded'));
alter table public.bookings add check(verification_mode in ('test_auto','admin_manual','gateway_webhook'));
alter table public.profiles add check(driver_verification_status in ('none','submitted','approved','verified','rejected','pending'));
alter table public.driver_documents add check(status in ('pending','verified','rejected','expired'));
alter table public.orders add check(status in ('pending','accepted','preparing','ready','out_for_delivery','delivered','rejected','cancelled'));
alter table public.orders add check(payment_status in ('awaiting','paid','failed','refunded'));
alter table public.orders add check(payment_method in ('stcpay','cash','tap'));
alter table public.orders add check(cancelled_by in ('customer','merchant','admin','system','driver'));
alter table public.orders add check(total=subtotal+delivery_fee+vat_amount);
alter table public.orders add check(driver_fee<=delivery_fee and delivery_surcharge<=delivery_fee);
alter table public.shop_orders add check(status in ('pending','accepted','packing','ready','out_for_delivery','delivered','rejected','cancelled'));
alter table public.shop_orders add check(payment_status in ('awaiting','paid','failed','refunded'));
alter table public.shop_orders add check(payment_method in ('stcpay','cash','tap'));
alter table public.shop_orders add check(cancelled_by in ('customer','merchant','admin','system','driver'));
alter table public.shop_orders add check(total=subtotal+delivery_fee+vat_amount);
alter table public.shop_orders add check(driver_fee<=delivery_fee and delivery_surcharge<=delivery_fee);

-- Same-merchant and same-product checks supplement single-column FKs.
create function public.validate_catalog_links() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare actual uuid; expected_vertical text;
begin
  expected_vertical:=case when tg_table_name='menu_items' then 'food' else 'shop' end;
  perform 1 from public.merchants where id=new.merchant_id and vertical=expected_vertical;
  if not found then raise exception 'Wrong merchant vertical' using errcode='23514'; end if;
  if new.category_id is not null then
    if tg_table_name='menu_items' then
      select merchant_id into actual from public.menu_categories where id=new.category_id;
    else select merchant_id into actual from public.product_categories where id=new.category_id; end if;
    if actual is distinct from new.merchant_id then
      raise exception 'Category belongs to another merchant' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger menu_item_links before insert or update of merchant_id,category_id on public.menu_items
for each row execute function public.validate_catalog_links();
create trigger product_links before insert or update of merchant_id,category_id on public.products
for each row execute function public.validate_catalog_links();

create function public.validate_cart_links() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare cart_merchant uuid; item_merchant uuid; variant_product uuid;
begin
  if tg_table_name='cart_items' then
    select merchant_id into cart_merchant from public.carts where id=new.cart_id;
    select merchant_id into item_merchant from public.menu_items where id=new.menu_item_id;
  else
    select merchant_id into cart_merchant from public.shop_carts where id=new.cart_id;
    select merchant_id into item_merchant from public.products where id=new.product_id;
    if new.variant_id is not null then
      select product_id into variant_product from public.product_variants where id=new.variant_id;
      if variant_product is distinct from new.product_id then
        raise exception 'Variant belongs to another product' using errcode='23514';
      end if;
    end if;
  end if;
  if cart_merchant is null or item_merchant is distinct from cart_merchant then
    raise exception 'Cart item belongs to another merchant' using errcode='23514';
  end if;
  return new;
end $$;
create trigger food_cart_links before insert or update on public.cart_items
for each row execute function public.validate_cart_links();
create trigger shop_cart_links before insert or update on public.shop_cart_items
for each row execute function public.validate_cart_links();

-- Reject NaN and infinities even for otherwise unconstrained numeric/double fields.
do $$
declare c record;
begin
  for c in select table_name,column_name from information_schema.columns
    where table_schema='public' and data_type in ('numeric','double precision')
  loop
    execute format('alter table public.%I add check (%I::text not in (''NaN'',''Infinity'',''-Infinity''))',c.table_name,c.column_name);
  end loop;
end $$;
revoke all on function public.validate_catalog_links() from public,anon,authenticated;
revoke all on function public.validate_cart_links() from public,anon,authenticated;
commit;
