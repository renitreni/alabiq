# Alabiq — Backend

API-owned login sessions and password recovery state are currently stored in SQLite.
Supabase Auth still manages passwords and accounts; all other application data stays in Supabase.
The session tables are created automatically, so `sql/app_gateway.sql` is not needed for this mode.

Set `SESSION_SQLITE_PATH=/var/lib/alabiq/auth.sqlite` on the VPS. The local default is
`backend/data/auth.sqlite` (gitignored). Keep the production database outside the checkout and
preserve `SESSION_ENCRYPTION_KEY` across deployments. Sessions survive API restarts, expire after
30 idle days or 90 total days, and are revoked by logout/password changes. Recovery links expire
after one hour and completion tickets after 15 minutes; both are single-use.

This store is for a single VPS with a persistent local disk. Multiple API servers would need
shared session storage. Use SQLite's online backup API rather than copying a live database file:

```bash
cd /opt/Alabiqa/alabiq-web-main/backend
npm run backup:sessions -- /root/alabiq-deploy-backups/auth-backup.sqlite
```

Use a new filename for each backup. To restore, stop the API, preserve the existing database and
its `-wal`/`-shm` files together, place the backup at `SESSION_SQLITE_PATH` with mode `600`, and
restart the API. Recovery state also requires the same encryption key. A future switch back to
Supabase session storage needs the schema applied first and may require users to sign in again.

The API for Alabiq, a multi-service logistics platform for Saudi Arabia running three service
lines from one codebase and one driver fleet:

- **Pick & Drop** — scheduled airport transfers
- **Food Delivery** — restaurant ordering and delivery within a 15 km radius
- **Ecommerce** — partner stores selling physical goods, with stock and product variants
  (feature-flagged off by default via `SHOP_ENABLED`)

**Node.js + Express** (plain JavaScript, CommonJS, no build step) on **Supabase** (Postgres 15, Auth,
Storage, Realtime). Runs identically on a laptop and on the production VPS under PM2.

**Live:** `https://api.alabiq.com` (Nginx + HTTPS, PM2 process `alabiq-api`, Cloudflare in
front).

> Detailed engineering documentation is kept private and is **not** in this repository. If you have
> the working copy, see `docs/engineering/` — a 20-part handbook covering architecture, the data
> model, the dispatch engine, the money model, security, and operations. This README is intentionally
> self-contained so it stands alone without it.

---

## Architecture in brief

```
Client (React SPA / Android WebView)
  |
  v  Bearer JWT
Nginx  ->  Express (PM2, port 4000)
             |
   routes/ -> controllers/ -> lib/  ->  Supabase Postgres
                                         Auth, Storage, Realtime
```

Three layers, strictly one-directional:

| Layer | Responsibility | Must not |
|---|---|---|
| `routes/` | Paths, guards, rate limiters, validation schemas | Contain business logic |
| `controllers/` | Parse the request, call `lib/`, shape the response | Query the database directly |
| `lib/` | **All** business logic and database access | Reference `req` or `res` |

**There is no `services/` directory — `lib/` is the service layer.** It is substantial: 42 modules,
and `lib/dispatch.js` alone is 889 lines holding the platform's most concurrency-sensitive code.

Key invariants:

- **All money is computed server-side** from database values. Client-sent amounts are ignored.
- **One rounding rule.** `round2()` lives in `lib/money.js` and nowhere else. It is half-up, sign-safe
  and collapses non-finite input to `0`. It used to be copied into six modules and all six were
  identically wrong (`Number.EPSILON` stops working above roughly 2.0, so a 50.50 base at 15% VAT
  returned 7.57 instead of 7.58). **Never re-inline it.**
- **The database arbitrates concurrency** — partial unique indexes and compare-and-swap updates, not
  application locks.
- **Realtime accelerates; polling guarantees.** Every broadcast failure is swallowed by design.
- **`lib/config.js` is the only place that reads `process.env`.**
- **Every outbound call has a timeout** (`lib/httpTimeout.js`): Tap 15s, Supabase Realtime 3s, every
  PostgREST call 10s. One PM2 process with no queue and no bulkhead means a *slow* dependency is more
  dangerous than a dead one — each hung promise holds an Express handler and a pooler slot.

---

## Endpoints

Twelve route modules mounted in `app.js`.

**Auth** — `/api/auth`
- `POST /signup` — create an account. `role` accepts only `passenger` or `driver`; an email listed in
  `ADMIN_EMAILS` is refused (`403`) to block register-then-auto-promote.
- `POST /sync` — upsert the profile and resolve the role. A client-supplied role is never honoured.
- `PATCH /profile` · `POST /avatar/signed-url`

**Bookings (Pick & Drop)** — `/api/bookings`
- `POST /` · `GET /` — create, own history
- `GET /:code` — summary (public, code-gated) · `POST /:code/cancel`
- `PATCH /:code/contact` · `POST /:code/rate-driver`
- `GET /:code/payment-instructions` — STC Pay details and fare
- `POST /:code/payment-proof/signed-url` · `POST /:code/payment-proof`

**Tracking** — `GET /api/tracking/:code` (public, code-gated)

**Driver** — `/api/driver`
- Feed and rides: `GET /available` · `POST /rides/:code/accept` · `GET /rides` ·
  `POST /rides/:code/status` · `POST /rides/:code/cancel`
- Dispatch offers: `GET /offers` · `POST /offers/:id/accept` · `/decline`
- Deliveries: `GET /deliveries` · `/deliveries/available` · `POST /deliveries/:code/claim` ·
  `/cancel` · `/photo-url` · `/status`
- `POST /location` · `PATCH /services` · `GET /cash`
- KYC: `POST /documents/signed-url` · `POST /documents` · `GET /documents`

**Merchant** — `/api/merchant` (entire router behind `requireMerchant`)
- `GET|PATCH /profile` · logo and menu-image upload
- `GET /analytics` · `GET /menu` · categories and items CRUD
- Orders: `GET /orders` · `POST /orders/:code/accept` · `/reject` ·
  `PATCH /orders/:code/status` — **authority caps at `ready`**

**Payments (card, Tap)** — `/api/payments` and `/api/payment-methods`

Mounted **only when `TAP_SECRET_KEY` is set**; otherwise both are replaced wholesale by a
`503 { error: 'Card payment is not available yet.' }` stub. That gate is the whole design: there is no
client-side feature flag to drift out of sync.

- `GET /config` — **public**, returns `{ cardAvailable: true }`. Deliberately a constant; an
  unreachable endpoint already means "no card". Unlike `/api/health` it reveals nothing about test
  mode, keys, or which gateway is behind it.
- `POST /webhooks/tap` — **public by necessity** (the gateway has no credential). Verified by a
  constant-time HMAC-SHA256 over Tap's concatenation of named charge fields, keyed with
  `TAP_SECRET_KEY`, then re-fetched from Tap before anything is marked paid. There is no separate
  webhook secret and never was one that worked.
- `POST /bookings/:code/charge` — the ride charge. Static-segment-first routing, so `webhooks` can
  never be parsed as a booking code.
- `/api/payment-methods` — saved cards: list, set default, delete.

Food and shop keep their own charge endpoints (`POST /api/food/orders/:code/charge`,
`POST /api/shop/orders/:code/charge`) because each needs its vertical's order loading. Only the
webhook is shared.

**Two variables must be set before card works in any environment**, and neither failure is loud:

| Variable | If unset |
|---|---|
| `PUBLIC_WEB_URL` | Falls back to `CORS_ORIGINS[0]`, which makes that list's *order* silently load-bearing |
| `PUBLIC_API_BASE` | **No fallback.** Resolves to `''`, so Tap is given a relative webhook URL it cannot call. The charge succeeds, the customer is debited, and the confirmation never arrives. |
| `SESSION_ENCRYPTION_KEY` | Required in production for reset-state encryption and file-grant signing. Generate once and retain it. |

**Food** — `/api/food`
- Discovery: `GET /restaurants` · `/restaurants/:id` (public)
- Cart: `GET|POST|PATCH|DELETE /cart[...]`
- `POST /orders` — checkout. Re-reads menu prices, recomputes distance, enforces the SAR 30 minimum
  and 15 km radius. Accepts `Idempotency-Key`.
- `GET /orders` · `/orders/:code` · `PATCH /orders/:code/contact` · `POST /orders/:code/rate-driver`
- Payments: `GET|POST /orders/:code/pay[...]` (STC Pay proof) · `POST /orders/:code/charge` (card)
- `POST /events`

**Admin** — `/api/admin` (entire router behind `requireAdmin`)
- Rides: `GET /stats` · `/reports` · `/bookings[/:code]` ·
  `POST /bookings/:code/verify-payment` — **this triggers ride dispatch** · `/reject-payment` ·
  `/assign-driver`
- Drivers: `GET /drivers` · `POST /drivers/:id/approval` · `GET /drivers/cash` ·
  `POST /drivers/:id/settle-cash` · KYC review endpoints
- Food: `GET /food/overview` · `GET /food/settlement` (payout-versus-markup CSV) · merchants CRUD,
  suspend, reactivate, credit, owner provisioning · menu CRUD · full order control

**Notifications** — `/api/notifications` — `GET /push-config` · `POST /register` · `/unregister` ·
`GET /` · `PATCH /read`

**Maps proxies** (public, rate-limited, 60-second LRU cache)
- `GET /api/route` — Google Routes API
- `GET /api/locations/search` · `/details` · `/reverse` · `/nearby` — Places and Geocoding
  (`/reverse` also returns `street` and `buildingNumber`, used to prefill the checkout address)

The browser never holds a key with server privileges — `GOOGLE_MAPS_SERVER_KEY` stays here.

**Health** — `GET /api/health` — liveness plus a database ping.

---

**Ecommerce (shop)** — `/api/shop`, `/api/merchant/shop`, `/api/admin/shop`

Mirrors the food surface endpoint for endpoint. 69 endpoints in total: 17 customer, 20 store owner,
32 admin. `/api/shop` and `/api/merchant/shop` return `503` unless `SHOP_ENABLED=true`.

- `GET /api/shop/stores` · `GET /api/shop/stores/:id` — discovery and catalogue (public)
- cart CRUD · `POST /api/shop/orders` — checkout (idempotent; server recomputes all money)
- `/api/merchant/shop/*` — the store owner's portal: catalogue, variants, stock, order queue
- `/api/admin/shop/*` — stores, catalogue, orders, inventory, settlement

Two things worth knowing about this vertical:

**Checkout is a single Postgres transaction.** It writes four tables while decrementing stock, so it
runs inside the `shop_place_order` RPC rather than as a sequence of statements. The stock check rides
on the `UPDATE` predicate itself, so two concurrent checkouts for the last unit cannot both succeed.
Money is still computed in JavaScript (`lib/shopMoney.js`); the RPC only provides atomicity.

**Stock counts are not public.** Exact real-time inventory is sales velocity — polled over time it
reveals how many units of every SKU a store sells per day. The customer API returns a banded
`in_stock` / `low` / `out`, and the underlying columns are revoked from the public database roles.

## Auth and roles

Supabase Auth remains the server-side identity provider. Clients receive only random, revocable
Alabiq bearer sessions (30-day idle / 90-day absolute lifetime); Supabase credentials never
leave the API. Password resets exchange their single-use PKCE code through the API.
The frontend sends `Authorization: Bearer <session-token>`; `middleware/auth.js` verifies its hash,
expiry and revocation state, then reads the role from `profiles`.

| Guard | Requires |
|---|---|
| `requireToken` | Valid app session; profile may not exist |
| `requireAuth` | Valid app session **and** a `profiles` row |
| `requireAdmin` | `role = admin` |
| `requireDriver` | driver or admin |

### API gateway cutover

Before deploying this version:

1. Apply `backend/sql/app_gateway.sql` to the intended Supabase project.
2. Set `PUBLIC_WEB_URL`, `PUBLIC_API_BASE`, and a stable random
   `SESSION_ENCRYPTION_KEY` (`openssl rand -base64 32`) on the API server.
3. Deploy the API before rebuilding the web/native clients. Existing Supabase
   JWTs are intentionally not accepted by this release, so users sign in again.
4. Run `npm run migrate:media-urls` for a dry-run, then
   `npm run migrate:media-urls:apply` after checking the count. This moves
   persisted avatar/catalog URLs behind `/api/files/public/...`.
5. Apply `backend/deploy/nginx-api-gateway.conf.example` inside the existing
   `api.alabiq.com` HTTPS server block. It permits the API's bounded
   uploads and disables buffering for `/api/events`. Validate with `nginx -t`
   before reloading Nginx.

Password-reset delivery still uses the Supabase Auth SMTP configuration, but
the PKCE verifier, code exchange, password update, and session revocation are
owned by the API. Add the exact `${PUBLIC_WEB_URL}/reset-password` destination
to Supabase Auth's allowed redirect URLs.
| `requireMerchant` | merchant or admin |
| `requireApprovedDriver` | driver + `driver_approved` (admin bypasses) |
| `optionalAuth` | Attaches identity if present; never rejects |

- **Passengers** must be signed in to book.
- **Drivers** sign up but stay unapproved until six KYC documents are verified. Verifying the last
  one auto-approves. Only then can they see the feed or accept work.
- **Merchants** cannot self-register. An admin provisions the owner via
  `POST /api/admin/food/merchants/:id/owner`.
- **Admins** are granted solely by the `ADMIN_EMAILS` allow-list, never from a request body.
- **Admin passes the driver and merchant guards** — an admin account is a superset of every role.

Row Level Security is enabled on all 38 tables. The backend uses the `service_role` key and bypasses
it; RLS defends the path where a client uses the anon key directly.

---

## Get it running (local)

1. **Database** — in the Supabase SQL Editor run `backend/migrations/0001`–`0040` in order,
   **skipping `0004`**. There is no migration runner; SQL is applied by hand.

   > **`backend/migrations/` is gitignored and is not in the public repository.** If you are reading
   > this from a clone, ask for the SQL. It is excluded because several migrations carry the
   > column-level grants that keep margin and net-price columns confidential, and the reasoning in
   > their headers is commercially sensitive.

   > `0004_auto_approve_drivers.PILOT.sql` removes the KYC gate from every driver. Pilot demos only.
   > **Never run it in production.**

   > **Ordering is not advisory.** Apply schema changes *before* deploying code that reads the new
   > columns. Doing it the other way round has already caused a production outage here: the code
   > shipped, the SQL did not, and the API returned "column does not exist" as a scatter of unrelated
   > 500s. And because several tables have had table-wide `SELECT` revoked from the client roles, a
   > **new column on one of them is not automatically granted** — a migration that "succeeded" can
   > still leave the column invisible to the app.

2. **Storage** — create four buckets:

   | Bucket | Visibility |
   |---|---|
   | `payment-proofs` | **Private** |
   | `driver-docs` | **Private** |
   | `merchant-images` | Public |
   | `avatars` | Public (created lazily by the backend if absent) |

3. **Env** — `cp .env.example .env`, then fill at minimum `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `SMART_ALABIQ_STCPAY_NUMBER`,
   `GOOGLE_MAPS_SERVER_KEY`. `.env.example` lists every variable the code reads, with the default
   commented beside it and no values.

   Keep `AUTO_VERIFY_STCPAY_TEST_MODE=true` locally so payments self-verify.
   **It must be `false` in production.**

   Card payment stays off until `TAP_SECRET_KEY` is set, which is the intended default for local
   work. If you do turn it on locally, set `PUBLIC_WEB_URL` and `PUBLIC_API_BASE` too, and point
   `PUBLIC_API_BASE` at a public tunnel — the gateway calls it back and cannot reach `localhost`.

4. **Run** — `npm install && npm run dev` -> `http://localhost:4000`

5. **Accounts** — `npm run seed:accounts` (bootstrap admin from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`).

   > Never re-run a seed against production once real accounts exist — it resets passwords and
   > invalidates credentials already handed to real people.

6. **Verify** — `npm run check:migrations` and `curl http://localhost:4000/api/health`.

   > The checker probes `0001`-`0003` and `0005`-`0040` (no probe for `0004`, `0036`). Some entries
   > are grant/privilege checks rather than shape checks: `0030-priv`, `0037-grant`, `0038-grant`,
   > `0039-grant`, `0040-grant`. Those need `SUPABASE_ANON_KEY` set or they report `[SKIP]`, **which
   > is not a pass** — the service role sees every column, so a confidentiality leak is undetectable
   > without a non-privileged client.

7. **Tests** — `node --test` from `backend/`.

   > 87 assertions over the money layer: `lib/money.js`, the pinned defaults in `lib/config.js`,
   > `foodMoney.js`, `shopMoney.js`, `fare.js`, `deliveryPricing.js`, `vat.js`, plus the frontend
   > alert state machine. No database, no network, about 300 ms. `npm test` maps to the same command,
   > and **no test dependency was added** — the runner is Node's built-in `node:test`. Run it from
   > `backend/` so discovery works; naming the directory (`node --test test/`) fails on Node 22.
   >
   > `test/money-defaults.test.js` pins every commercial default as a literal number, so changing a
   > price produces a failing assertion in review rather than a silent one-character edit.

---

## Production

Deployed on a **Hostinger VPS**: Node under PM2 behind Nginx and Certbot, with Cloudflare in front.
`app.set('trust proxy', 1)` is on so rate limits key on the real client IP.

Redeploy:

```bash
cd /opt/Alabiqa && git pull && \
cd alabiq-web-main/backend && npm install --omit=dev && pm2 restart alabiq-api && \
cd ../frontend && npm install && npm run build
```

Restarts are safe — all dispatch state lives in Postgres, so the sweepers resume cleanly.

After deploying, check the boot log:

```bash
pm2 logs alabiq-api --lines 50
```

| Line | Meaning |
|---|---|
| `Dispatch sweeper running (...)` | Healthy. **Its absence means dispatch has no cascade.** |
| `Card payments (Tap) ENABLED.` | `TAP_SECRET_KEY` is set and `/api/payments` is mounted. Its absence means every card endpoint is a 503 stub. |
| `[cors] CORS_ORIGINS is not set` | **Every browser origin is allowed.** Fix immediately. |
| `[SECURITY] AUTO_VERIFY_STCPAY_TEST_MODE` | **Payments are auto-verifying.** Fix immediately. |
| `prune_error_logs failed` | Migration `0042` has not been applied. Errors are still logged to pm2 but nothing reaches the admin Errors page. |

A **restart** is required after any change to `.env` — the Supabase client and its 10s timeout are
constructed once at boot. After a *schema* change, `lib/profileSchema.js` re-probes a missing column
every 60 seconds, so it recovers on its own; nothing else caches schema state.

---

## Security notes

- **Rate limiting** — global 240/min plus 20/min on auth, and 22 per-endpoint limiters in
  `middleware/rateLimiters.js`. All of them answer with a JSON `{ error }` body, not the library's
  plain-text default. **When debugging a `429`, check these first** — a bare "(429)" surfaced through
  a chatty UI is almost always our own bucket, not a provider or a permissions problem.
  The Tap webhook is exempt from the global limiter, matched by exact path
  (`req.path === '/payments/webhooks/tap'`), because a `429` to a gateway converts a burst into a
  redelivery storm.
- **Error log** — `lib/errorLog.js` wraps `console.error` once at boot, so all 395 catch blocks
  also write a row to `error_logs` (migration `0042`) with the signed-in user attached, readable at
  Admin -> Errors. Messages and stacks are redacted of keys, bearer tokens and JWTs first, repeats
  are collapsed to one row per minute per distinct error, and the table is revoked from
  `anon`/`authenticated` outright. Writes are best-effort: a logging failure never breaks the
  request. **Never log a secret deliberately and rely on the redactor to catch it.**
- **Validation** — `lib/validate.js` whitelists request bodies, **rejects** unknown fields, and
  replaces `req.body` with only validated fields, so mass assignment is structurally impossible.
- **Geofencing** — driver status transitions asserting physical presence are gated on a fresh GPS fix
  and **fail closed**.
- **RLS** on every table; the `service_role` key bypasses it — keep it server-only, **never** under a
  `VITE_` name.
- **Column-level grants** (migration `0019`) hide `net_price`, `platform_margin_total`, and
  `margin_*` from client roles. Any migration touching `menu_items`, `orders`, or `order_items` must
  extend that grant list.
- `.env` is gitignored. Never commit secrets.

Before launch: set `CORS_ORIGINS`, set `AUTO_VERIFY_STCPAY_TEST_MODE=false`, remove test accounts,
and rotate seed passwords.

---

### Grants filter reads. They also have to filter writes.

Supabase grants table-wide `INSERT/UPDATE/DELETE` on every public-schema table to the `anon` and
`authenticated` roles by default, leaving Row Level Security as the only barrier. Wherever a policy
was broader than the columns it was meant to protect, the gap was total — a policy of
`using (id = auth.uid())` on `profiles` let **any signed-in user set their own `role` to `admin`**
straight through PostgREST, with nothing but the public key.

Migrations `0030` and `0032` revoke those write grants and give back only the columns each party
legitimately edits. `npm run check:migrations` verifies both directions: that the client roles have
lost the dangerous grants, and that a user can still edit their own name.

Two classes of check exist because the service role cannot detect either problem — it holds every
privilege and sees every column:

| Check | Client | Catches |
|---|---|---|
| Grant | anon key | a confidential column becoming readable |
| Privilege | `check_column_privilege` RPC | a client role regaining `UPDATE` |

Set `SUPABASE_ANON_KEY` in `.env` (it is public by design — it already ships in the frontend bundle)
or these report `[SKIP]`, which is not a pass.

## Project structure

```
backend/
├── app.js            Express app: middleware + route mounts (exported, never listens)
├── server.js         The entry point: dotenv, app.listen, startDispatchSweeper()
├── routes/           health, auth, bookings, tracking, admin, driver, merchant,
│                     notifications, route, food, locations
├── controllers/      13 modules + food/ (admin, orders, merchant, ratings, dispatch, docs)
├── middleware/       auth.js (6 guards), foodAuth.js (optionalAuth),
│                     rateLimiters.js (15 limiters), idempotency.js
├── lib/              THE SERVICE LAYER (42 files):
│                       money (the one round2), dispatch, foodMoney, shopMoney,
│                       fare, vat, deliveryPricing, ledger, driverCash,
│                       merchantCredit, foodOrderActions, shopOrderActions,
│                       tap, cardCharge, savedCards, gatewayPaid, stock,
│                       httpTimeout, geofence, geo, realtime, notifications,
│                       webPush, storage, uploadValidation, validate, audit,
│                       config, supabase, ...
├── migrations/       0001..0040 (skip 0004 in production) + utilities/
│                     GITIGNORED — not in the public repository
├── test/             money.test.js, money-defaults.test.js, helpers/pureEnv.js
│                     run with `node --test` from backend/
└── scripts/          seed-admin, seed-super-admin, set-password,
                      check-migrations, check-shop, demo/
```

---

## Web Push

1. Apply migration `0017`.
2. `npx web-push generate-vapid-keys`
3. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, then redeploy both projects.
4. Serve the frontend over HTTPS. iOS requires adding the site to the Home Screen.

Dead subscriptions (404/410) are pruned automatically. The notification inbox row is the durable
record; push and realtime are best-effort.

---

## Known gaps

- **Almost no automated tests.** `test/` covers `lib/money.js` and the pinned money defaults. Dispatch,
  the order lifecycle, validation and payouts have no regression net. The highest-value next files are
  `foodMoney.js` / `shopMoney.js`, `ledger.js`, `fare.js`, `deliveryPricing.js`, `validate.js` — all
  pure, none needing a database.
- **No migration runner.** SQL is applied by hand in the Supabase SQL Editor, so schema and deployed
  code drift independently and silently. `npm run check:migrations` is the only gate; treat it as
  required, not optional.
- **Transactions only where an RPC exists.** The Supabase client exposes none, so most multi-table
  writes are sequential and can leave partial state on a crash. Four Postgres functions cover the
  cases that could not tolerate it: `shop_place_order`, `shop_release_stock`,
  `set_default_payment_method`, `delete_account_pii`. Extending that approach is the main outstanding
  integrity improvement.
- **No monitoring or alerting.** An external uptime check on `/api/health` is the cheapest fix.
- **The merchant credit line is vestigial.** Order acceptance no longer writes
  `merchants.credit_used` (it was double-counting an amount already settled elsewhere), so that
  column, its limit, its 80% alert and the admin replenish action now gate nothing. Whether to retire
  or repurpose them is an open decision; until it is made, treat every merchant credit figure in the
  UI as historical rather than current. The commercial detail is in the private handbook.
- **`driver_cash_ledger` cannot reference a food or shop order.** `booking_id` is a foreign key to
  `bookings`, so the cash-on-delivery charge for a food/shop order writes the order code into the
  free-text `note` and leaves `booking_id` null. The balance is right; the row cannot be joined to its
  order. A migration adding a vertical-neutral reference is an open follow-up and has not been written.
- `GET /:code/payment-instructions` has no rate limiter, unlike its siblings.
- `ADMIN_API_KEY` / `DRIVER_API_KEY` / `PAYMENT_MODE` are legacy and read by no live code path.
- `vercel.json` and `api/index.js` are **dead** — hosting is the Hostinger VPS only.
