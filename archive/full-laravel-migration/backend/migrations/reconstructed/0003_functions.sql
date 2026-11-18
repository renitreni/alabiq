-- Atomic stock and saved-card operations. Inputs come from trusted backend pricing only.
begin;
select pg_advisory_xact_lock(724318001);

create function public.shop_place_order(p_order jsonb,p_lines jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  o public.shop_orders%rowtype; p public.products%rowtype; v public.product_variants%rowtype;
  l jsonb; pid uuid; vid uuid; qty integer; reserved integer; available integer;
  customer uuid; merchant uuid; cart uuid;
begin
  if p_order is null or jsonb_typeof(p_order)<>'object' then
    raise exception 'Order must be an object' using errcode='22023';
  end if;
  customer := nullif(p_order->>'customer_id','')::uuid;
  merchant := nullif(p_order->>'merchant_id','')::uuid;
  if customer is null or merchant is null then
    raise exception 'customer_id and merchant_id are required' using errcode='23502';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'At least one order line is required' using errcode='22023';
  end if;
  -- Serializes checkout for the same customer/store and prevents a stale duplicate checkout.
  perform pg_advisory_xact_lock(hashtextextended(customer::text||':'||merchant::text,0));
  select id into cart from public.shop_carts
    where customer_id=customer and merchant_id=merchant for update;
  if cart is null or not exists(select 1 from public.shop_cart_items where cart_id=cart) then
    raise exception 'Cart is empty' using errcode='22023';
  end if;
  perform 1 from public.shop_cart_items where cart_id=cart for update;
  perform 1 from public.merchants where id=merchant and vertical='shop'
    and is_active and status='active' and accepting_orders for share;
  if not found then raise exception 'Store unavailable' using errcode='22023'; end if;

  -- Reject duplicates, stale lines, cross-store products, and mismatched variants.
  if exists(select 1 from jsonb_array_elements(p_lines) x
    group by x->>'product_id',coalesce(nullif(x->>'variant_id',''),'') having count(*)>1) then
    raise exception 'Duplicate product/variant line' using errcode='22023';
  end if;
  if jsonb_array_length(p_lines)<>(select count(*) from public.shop_cart_items where cart_id=cart) then
    raise exception 'Cart changed; reload checkout' using errcode='22023';
  end if;

  -- Deterministic product/variant lock order prevents competing carts from deadlocking.
  for l in select value from jsonb_array_elements(p_lines)
    order by value->>'product_id',value->>'variant_id'
  loop
    pid:=nullif(l->>'product_id','')::uuid; vid:=nullif(l->>'variant_id','')::uuid;
    qty:=(l->>'quantity')::integer;
    if qty is null or qty<1 or qty>10000 then
      raise exception 'Invalid quantity' using errcode='22023';
    end if;
    perform 1 from public.shop_cart_items where cart_id=cart and product_id=pid
      and variant_id is not distinct from vid and quantity=qty;
    if not found then raise exception 'Cart changed; reload checkout' using errcode='22023'; end if;
    select * into p from public.products where id=pid for update;
    if not found or p.merchant_id<>merchant or not p.is_available then
      raise exception 'Product unavailable or belongs to another store' using errcode='22023';
    end if;
    if vid is not null then
      select * into v from public.product_variants where id=vid for update;
      if not found or v.product_id<>pid or not v.is_available then
        raise exception 'Variant unavailable or belongs to another product' using errcode='22023';
      end if;
    end if;
    if (l->>'unit_price')::numeric is distinct from
      (case when vid is null then p.price else coalesce(v.price,p.price) end) then
      raise exception 'Price changed; reload checkout' using errcode='22023';
    end if;
    if p.track_stock then
      available:=case when vid is null then p.stock_quantity else v.stock_quantity end;
      if available<qty then
        raise exception 'Insufficient stock' using errcode='SM001',
          detail=jsonb_build_object('failure_reason','out_of_stock','product',p.name,
            'requested',qty,'available',available)::text;
      end if;
      if vid is null then update public.products set stock_quantity=stock_quantity-qty where id=pid;
      else update public.product_variants set stock_quantity=stock_quantity-qty where id=vid; end if;
    end if;
  end loop;

  insert into public.shop_orders(customer_id,merchant_id,subtotal,delivery_fee,delivery_surcharge,
    driver_fee,driver_fee_rate,platform_margin_total,vat_amount,vat_rate,total,distance_km,
    delivery_address,delivery_lat,delivery_lng,delivery_street,delivery_building,contact_phone,
    payment_method,stock_reserved_at)
  values(customer,merchant,(p_order->>'subtotal')::numeric,
    (p_order->>'delivery_fee')::numeric,coalesce((p_order->>'delivery_surcharge')::numeric,0),
    coalesce((p_order->>'driver_fee')::numeric,0),coalesce((p_order->>'driver_fee_rate')::numeric,0.9),
    (p_order->>'platform_margin_total')::numeric,(p_order->>'vat_amount')::numeric,
    (p_order->>'vat_rate')::numeric,(p_order->>'total')::numeric,
    nullif(p_order->>'distance_km','')::numeric,p_order->>'delivery_address',
    nullif(p_order->>'delivery_lat','')::double precision,nullif(p_order->>'delivery_lng','')::double precision,
    nullif(p_order->>'delivery_street',''),nullif(p_order->>'delivery_building',''),
    nullif(p_order->>'contact_phone',''),p_order->>'payment_method',now()) returning * into o;

  for l in select value from jsonb_array_elements(p_lines)
  loop
    pid:=(l->>'product_id')::uuid; vid:=nullif(l->>'variant_id','')::uuid; qty:=(l->>'quantity')::integer;
    select case when track_stock then qty else 0 end into reserved from public.products where id=pid;
    insert into public.shop_order_items(order_id,product_id,variant_id,name_snapshot,
      variant_label_snapshot,sku_snapshot,unit_price,quantity,reserved_qty,line_total,margin_per_item,margin_total)
    values(o.id,pid,vid,l->>'name_snapshot',nullif(l->>'variant_label_snapshot',''),
      nullif(l->>'sku_snapshot',''),(l->>'unit_price')::numeric,qty,reserved,
      (l->>'line_total')::numeric,(l->>'margin_per_item')::numeric,(l->>'margin_total')::numeric);
  end loop;
  if o.subtotal<>(select sum(line_total) from public.shop_order_items where order_id=o.id)
    or o.platform_margin_total<>(select sum(margin_total) from public.shop_order_items where order_id=o.id)
    or o.total<>o.subtotal+o.delivery_fee+o.vat_amount then
    raise exception 'Inconsistent order totals' using errcode='23514';
  end if;
  delete from public.shop_cart_items where cart_id=cart;
  return jsonb_build_object('order_id',o.id,'order_code',o.order_code);
end $$;

create function public.shop_release_stock(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare o public.shop_orders%rowtype; l public.shop_order_items%rowtype;
begin
  select * into o from public.shop_orders where id=p_order_id for update;
  if not found then return jsonb_build_object('released',false,'reason','order_not_found'); end if;
  if o.stock_released_at is not null then
    return jsonb_build_object('released',false,'reason','already_released');
  end if;
  if o.status not in ('cancelled','rejected') then
    return jsonb_build_object('released',false,'reason','order_not_cancelled');
  end if;
  for l in select * from public.shop_order_items where order_id=o.id and reserved_qty>0
    order by product_id,variant_id
  loop
    -- Match checkout's lock order; use the reservation snapshot even if track_stock changed later.
    perform 1 from public.products where id=l.product_id for update;
    if l.variant_id is null then
      update public.products set stock_quantity=stock_quantity+l.reserved_qty where id=l.product_id;
    else
      update public.product_variants set stock_quantity=stock_quantity+l.reserved_qty where id=l.variant_id;
    end if;
    if not found then raise exception 'Reserved inventory missing' using errcode='23503'; end if;
  end loop;
  update public.shop_orders set stock_released_at=now() where id=o.id;
  return jsonb_build_object('released',true);
end $$;

create function public.set_default_payment_method(p_user_id uuid,p_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  -- Lock the parent row to serialize competing switches, including the no-current-default case.
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then return false; end if;
  perform 1 from public.saved_payment_methods where id=p_id and user_id=p_user_id
    and deleted_at is null for update;
  if not found then return false; end if;
  update public.saved_payment_methods set is_default=false where user_id=p_user_id and is_default;
  update public.saved_payment_methods set is_default=true where id=p_id;
  return true;
end $$;

create function public.prune_error_logs(keep_days integer default 90)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n bigint;
begin
  if keep_days is null or keep_days<1 then raise exception 'keep_days must be positive'; end if;
  delete from public.error_logs where occurred_at<now()-make_interval(days=>keep_days);
  get diagnostics n=row_count; return n;
end $$;
create function public.prune_admin_login_events(keep_days integer default 365)
returns bigint language plpgsql security invoker set search_path=pg_catalog,public as $$
declare n bigint;
begin
  if keep_days is null or keep_days<1 then raise exception 'keep_days must be positive'; end if;
  delete from public.admin_login_events where occurred_at<now()-make_interval(days=>keep_days);
  get diagnostics n=row_count; return n;
end $$;

-- Scrub identifiable snapshots before the application deletes the Auth identity.
-- Financial rows survive through ON DELETE SET NULL. This does not erase Storage files,
-- external gateway records, free-text PII, backups, or arbitrary JSON: see README.
create function public.delete_account_pii(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare user_role text;
begin
  select role into user_role from public.profiles where id=p_user_id for update;
  if not found then return false; end if;
  if user_role not in ('passenger','driver') then raise exception 'Account requires admin handover'; end if;
  if exists(select 1 from public.bookings where (user_id=p_user_id or assigned_driver_id=p_user_id)
      and booking_status not in ('completed','cancelled'))
    or exists(select 1 from public.orders where customer_id=p_user_id and status not in ('delivered','cancelled','rejected'))
    or exists(select 1 from public.shop_orders where customer_id=p_user_id and status not in ('delivered','cancelled','rejected'))
    or exists(select 1 from public.deliveries where driver_id=p_user_id and status not in ('delivered','cancelled'))
    or exists(select 1 from public.shop_deliveries where driver_id=p_user_id and status not in ('delivered','cancelled')) then
    raise exception 'Account has unfinished work';
  end if;
  update public.bookings set passenger_name='Deleted account',passenger_mobile=null,
    passenger_whatsapp=null,passenger_email=null,pickup_address='Deleted',dropoff_address='Deleted',
    pickup_street=null,pickup_building=null,dropoff_street=null,dropoff_building=null,
    pickup_lat=null,pickup_lng=null,dropoff_lat=null,dropoff_lng=null,notes=null where user_id=p_user_id;
  update public.orders set delivery_address='Deleted',delivery_street=null,delivery_building=null,
    delivery_lat=null,delivery_lng=null,contact_phone=null where customer_id=p_user_id;
  update public.shop_orders set delivery_address='Deleted',delivery_street=null,delivery_building=null,
    delivery_lat=null,delivery_lng=null,contact_phone=null where customer_id=p_user_id;
  update public.error_logs set user_email=null,ip=null,user_agent=null where user_id=p_user_id;
  delete from public.device_push_tokens where user_id=p_user_id;
  delete from public.saved_payment_methods where user_id=p_user_id;
  delete from public.payment_customers where user_id=p_user_id;
  return true;
end $$;

revoke all on function public.shop_place_order(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.shop_place_order(jsonb,jsonb) to service_role;
revoke all on function public.shop_release_stock(uuid) from public,anon,authenticated;
grant execute on function public.shop_release_stock(uuid) to service_role;
revoke all on function public.set_default_payment_method(uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_default_payment_method(uuid,uuid) to service_role;
revoke all on function public.prune_error_logs(integer) from public,anon,authenticated;
grant execute on function public.prune_error_logs(integer) to service_role;
revoke all on function public.prune_admin_login_events(integer) from public,anon,authenticated;
grant execute on function public.prune_admin_login_events(integer) to service_role;
revoke all on function public.delete_account_pii(uuid) from public,anon,authenticated;
grant execute on function public.delete_account_pii(uuid) to service_role;
commit;

