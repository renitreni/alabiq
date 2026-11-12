// Run: node backend/migrations/reconstructed/tests/verify.cjs
// Requires Docker. Uses a disposable container, no exposed ports or mounted data.
const {execFileSync,spawn}=require('node:child_process');
const {readFileSync,readdirSync}=require('node:fs');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const container='smartmappia-schema-'+randomUUID().slice(0,8);
const root=join(__dirname,'..');
let checks=0;
function docker(args,options={}){return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});}
function sql(text){return docker(['exec','-i',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{input:text}).trim();}
function ok(label,fn){fn();checks++;console.log('PASS '+label);}
function fail(text,match){assert.throws(()=>sql(text),match);}
function concurrent(text){return new Promise(resolve=>{let err='';const p=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1']);p.stderr.on('data',d=>err+=d);p.stdout.resume();p.on('close',code=>resolve({code,err}));p.stdin.end(text);});}
const uid='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
const mid='20000000-0000-0000-0000-000000000001', hidden='20000000-0000-0000-0000-000000000002';
const product='30000000-0000-0000-0000-000000000001', variant='40000000-0000-0000-0000-000000000001';
const cart='50000000-0000-0000-0000-000000000001';
const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
function order(user=uid){return {customer_id:user,merchant_id:mid,subtotal:20,delivery_fee:10,delivery_surcharge:0,driver_fee:9,driver_fee_rate:0.9,platform_margin_total:4,vat_amount:3,vat_rate:0.15,total:33,distance_km:'',delivery_address:'Test',delivery_lat:'',delivery_lng:'',payment_method:'cash'};}
function line(extra={}){return {product_id:product,variant_id:'',name_snapshot:'Test item',unit_price:10,quantity:2,line_total:20,margin_per_item:2,margin_total:4,...extra};}
function checkout(o=order(),lines=[line()]){return 'set role service_role; select public.shop_place_order('+literal(o)+','+literal(lines)+');';}
function cartLine(vid=null){sql("insert into shop_cart_items(cart_id,product_id,variant_id,quantity,unit_price) values('"+cart+"','"+product+"',"+(vid?"'"+vid+"'":'null')+",2,10);");}
(async()=>{
try{
  docker(['run','-d','--name',container,'--label','codex.task=smartmappia-migration-test','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',process.env.PG_TEST_IMAGE||'postgres:16-alpine']);
  let ready=false;
  for(let i=0;i<60;i++){try{docker(['exec',container,'pg_isready','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
  assert(ready,'PostgreSQL ready');
  sql(readFileSync(join(__dirname,'bootstrap.sql'),'utf8'));
  for(const f of readdirSync(root).filter(f=>/^\d.*\.sql$/.test(f)).sort())ok('apply '+f,()=>sql(readFileSync(join(root,f),'utf8')));
  ok('all 43 tables and RLS enabled',()=>assert.equal(sql("select count(*) from pg_tables where schemaname='public' and rowsecurity"),'43'));
  const contractChecks=await require('./migration-contract.cjs')(sql);
  console.log('PASS '+contractChecks+' existing migration-checker probes through local SQL adapter');
  ok('baseline replay fails without damaging existing schema',()=>fail(readFileSync(join(root,'0001_schema.sql'),'utf8'),/already exists/));
  sql("insert into auth.users values('"+uid+"'),('"+other+"'); insert into profiles(id,full_name) values('"+uid+"','One'),('"+other+"','Two');"+
    "insert into merchants(id,vertical,name,is_active) values('"+mid+"','shop','Visible',true),('"+hidden+"','shop','Hidden',false);"+
    "insert into products(id,merchant_id,name,price,net_price,stock_quantity) values('"+product+"','"+mid+"','Test item',10,8,3);"+
    "insert into products(merchant_id,name,price,stock_quantity) values('"+hidden+"','Secret',10,3);"+
    "insert into product_variants(id,product_id,label,stock_quantity) values('"+variant+"','"+product+"','Size',3);"+
    "insert into shop_carts(id,customer_id,merchant_id) values('"+cart+"','"+uid+"','"+mid+"');");
  cartLine();
  ok('anon only sees listed catalogue',()=>assert.equal(sql("set role anon; select count(*) from products"),'1'));
  ok('anon can read variant inheriting a price',()=>assert.equal(sql("set role anon; select count(id) from product_variants"),'1'));
  ok('net price and stock denied',()=>{for(const c of ['net_price','stock_quantity','low_stock_threshold'])fail("set role anon; select "+c+" from products",/permission denied/);});
  ok('sensitive tables denied',()=>{for(const t of ['saved_payment_methods','payment_customers','app_settings','error_logs','admin_login_events'])fail("set role authenticated; select * from "+t,/permission denied/);});
  ok('role escalation denied',()=>fail("set role authenticated; update profiles set role='admin' where id='"+uid+"'",/permission denied/));
  ok('RPC execution denied to public clients',()=>fail("set role authenticated; select shop_release_stock(gen_random_uuid())",/permission denied/));
  ok('safe profile update stays owner-scoped',()=>{
    sql("set role authenticated; set request.jwt.claim.sub='"+uid+"'; update profiles set full_name='Changed';");
    assert.equal(sql("select string_agg(full_name,',' order by id) from profiles"),'Changed,Two');
  });
  ok('negative inventory rejected',()=>fail("update products set stock_quantity=-1 where id='"+product+"'",/check constraint/));
  ok('non-finite money rejected',()=>fail("update products set price='NaN' where id='"+product+"'",/check constraint/));
  ok('cart null-variant duplicate rejected',()=>assert.throws(()=>cartLine(),/duplicate key/));
  ok('zero quantity rejected',()=>fail(checkout(order(),[line({quantity:0})]),/Invalid quantity/));
  ok('duplicate checkout lines rejected',()=>fail(checkout(order(),[line(),line()]),/Duplicate/));
  ok('stale price rejected',()=>fail(checkout(order(),[line({unit_price:11})]),/Price changed/));
  ok('malformed UUID rejected',()=>fail(checkout(order(),[line({variant_id:'not-a-uuid'})]),/invalid input syntax/));
  ok('totals mismatch rolls stock back',()=>{
    fail(checkout({...order(),total:34}),/check constraint|Inconsistent/);
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'3');
    assert.equal(sql('select count(*) from shop_orders'),'0');
  });
  const result=JSON.parse(sql(checkout()));
  ok('atomic checkout reserves stock and clears cart',()=>{
    assert.match(result.order_code,/^SH-/);
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'1');
    assert.equal(sql("select count(*) from shop_cart_items where cart_id='"+cart+"'"),'0');
    assert.equal(sql("select reserved_qty from shop_order_items where order_id='"+result.order_id+"'"),'2');
  });
  ok('stale replay rejected',()=>fail(checkout(),/Cart is empty/));
  ok('active order cannot release stock',()=>assert.equal(JSON.parse(sql("set role service_role;select shop_release_stock('"+result.order_id+"')")).released,false));
  cartLine();
  ok('stock shortage returns SM001 payload and preserves cart',()=>{
    fail(checkout(),/Insufficient stock/);
    assert.equal(sql("select count(*) from shop_cart_items where cart_id='"+cart+"'"),'1');
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'1');
  });
  sql("update shop_orders set status='cancelled' where id='"+result.order_id+"'; update products set track_stock=false where id='"+product+"';");
  ok('release uses original reservation after stock tracking changes',()=>assert.equal(JSON.parse(sql("set role service_role;select shop_release_stock('"+result.order_id+"')")).released,true));
  ok('repeated release cannot inflate stock',()=>{
    assert.equal(JSON.parse(sql("set role service_role;select shop_release_stock('"+result.order_id+"')")).released,false);
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'3');
  });
  sql("update products set track_stock=true where id='"+product+"';delete from shop_cart_items where cart_id='"+cart+"';");
  cartLine(variant);
  const vr=JSON.parse(sql(checkout(order(),[line({variant_id:variant})])));
  ok('variant reserves its own inventory',()=>{
    assert.equal(sql("select stock_quantity from product_variants where id='"+variant+"'"),'1');
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'3');
  });
  ok('cash payment deduplicated',()=>{
    const q="insert into shop_order_payments(order_id,provider,amount,status) values('"+vr.order_id+"','cash',33,'paid');";
    sql(q);fail(q,/duplicate key/);
  });
  ok('gateway payment deduplicated',()=>{
    const q="insert into shop_order_payments(order_id,provider,amount,status,gateway_transaction_id) values('"+vr.order_id+"','tap',33,'paid','charge-test');";
    sql(q);fail(q,/duplicate key/);
  });
  ok('dispatch one-job and pending uniqueness constraints',()=>{
    fail("insert into dispatch_offers(driver_id,expires_at) values('"+other+"',now()+interval '1 minute')",/check constraint/);
    const q="insert into dispatch_offers(driver_id,shop_order_id,expires_at) values('"+other+"','"+vr.order_id+"',now()+interval '1 minute');";
    sql(q);fail(q,/duplicate key/);
  });
  const cardA=randomUUID(),cardB=randomUUID(),cardOther=randomUUID();
  sql("insert into saved_payment_methods(id,user_id,gateway_customer_id,gateway_card_id) values('"+cardA+"','"+uid+"','cus1','card1'),('"+cardB+"','"+uid+"','cus1','card2'),('"+cardOther+"','"+other+"','cus2','card3');");
  ok('default card cannot cross accounts',()=>assert.equal(sql("set role service_role; select set_default_payment_method('"+uid+"','"+cardOther+"')"),'f'));
  const defaults=await Promise.all([cardA,cardB].map(id=>concurrent("set role service_role;select set_default_payment_method('"+uid+"','"+id+"')")));
  ok('concurrent default switches leave exactly one default',()=>{
    assert(defaults.every(r=>r.code===0),JSON.stringify(defaults));
    assert.equal(sql("select count(*) from saved_payment_methods where user_id='"+uid+"' and is_default"),'1');
  });
  ok('overnight and multiple opening windows supported',()=>{
    sql("insert into merchant_hours(merchant_id,weekday,opens_at,closes_at) values('"+mid+"',1,'22:00','02:00'),('"+mid+"',1,'09:00','12:00');");
    fail("insert into merchant_hours(merchant_id,weekday,opens_at,closes_at) values('"+mid+"',1,'09:00','13:00')",/duplicate key/);
  });
  ok('active account cannot be scrubbed',()=>fail("set role service_role;select delete_account_pii('"+uid+"')",/unfinished work/));
  sql("update shop_orders set status='cancelled' where id='"+vr.order_id+"';select shop_release_stock('"+vr.order_id+"');");
  // Two independent customers race for the final unit. Exactly one can commit.
  sql("delete from shop_cart_items;update products set stock_quantity=2 where id='"+product+"';");
  cartLine();
  const cart2=randomUUID();
  sql("insert into shop_carts(id,customer_id,merchant_id) values('"+cart2+"','"+other+"','"+mid+"');insert into shop_cart_items(cart_id,product_id,quantity,unit_price) values('"+cart2+"','"+product+"',2,10);");
  const races=await Promise.all([concurrent(checkout(order())),concurrent(checkout(order(other)))]);
  ok('concurrent checkouts cannot oversell',()=>{
    assert.equal(races.filter(r=>r.code===0).length,1,JSON.stringify(races));
    assert.equal(sql("select stock_quantity from products where id='"+product+"'"),'0');
  });
  sql("update shop_orders set status='cancelled';");
  ok('account scrub and Auth deletion preserve financial history',()=>{
    const before=sql("select count(*) from shop_orders");
    sql("set role service_role;select delete_account_pii('"+uid+"');reset role;delete from auth.users where id='"+uid+"';");
    assert.equal(sql("select count(*) from profiles where id='"+uid+"'"),'0');
    assert.equal(sql("select count(*) from shop_orders"),before);
    assert.equal(sql("select count(*) from shop_orders where customer_id='"+uid+"'"),'0');
  });
  ok('retention rejects invalid intervals',()=>fail("set role service_role;select prune_error_logs(0)",/positive/));
  console.log('\n'+checks+' checks passed on '+sql('show server_version'));
}finally{
  docker(['rm','-f',container]);
}
})().catch(e=>{console.error(e.stderr?.toString()||e.stack);process.exitCode=1;});
