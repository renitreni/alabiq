-- One restaurant, one app: every merchant carries an unguessable public hash
-- identifying its scoped customer app (/app/<hash>) without exposing the uuid
-- primary key. brand_color optionally drives the PWA theme + app accent.
alter table public.merchants
  add column public_hash text,
  add column brand_color text;

-- 12 hex chars from a fresh uuid per row; the volatile function yields a
-- distinct value per row. A unique index below makes collision impossible
-- to persist in practice (16^12 keyspace).
update public.merchants
   set public_hash = substr(lower(replace(gen_random_uuid()::text, '-', '')), 1, 12)
 where public_hash is null;

alter table public.merchants
  alter column public_hash set not null,
  alter column public_hash set default substr(lower(replace(gen_random_uuid()::text, '-', '')), 1, 12);

create unique index if not exists merchants_public_hash_idx on public.merchants (public_hash);
