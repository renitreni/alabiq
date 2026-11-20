# SmartMappia Docker Deployment Plan — Production Cutover

Target commit: `ce7c36b` ("Drop Supabase…") on branch `full`, already pushed to origin.
Server: `root@187.127.100.178` (srv1777854, Ubuntu, Docker 29.6 + Compose v5.1.4, 83 GB free disk).

---

## 1. Current production layout (verified on server)

| Piece | Where | Notes |
|---|---|---|
| Web frontend | nginx static, `alabiq.com` → `/opt/SmartMappiaa/alabiq-web-main/frontend/dist` | SPA fallback in place; TLS via Certbot |
| API | PM2 process `alabiq-api` → `127.0.0.1:4000` | Runs `backend/server.js` from checkout at old commit `e96b2c0` |
| API proxy | nginx `api.alabiq.com` → `127.0.0.1:4000` | Has SSE-safe `location = /api/events` block (buffering off, 75 s timeouts) and `client_max_body_size 12m` — **keep these** |
| Database | Supabase cloud project `wwaofiklnlkvdimfajgq` | API uses `SUPABASE_URL` + service-role key; **no DB password on the server** |
| Storage | Supabase Storage buckets (payment proofs, avatars, merchant images, driver docs) | Frontend build has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — it talks to Supabase directly |
| Routing | Google Routes API via backend `/api/route` (OSRM already retired in code) | Legacy `osrm` container still runs on `127.0.0.1:5000` — unused by current code, safe to stop after cutover |
| Neighbors | asclepius.sbs, thejobconnections.xyz, rozanatravels, yaramay.online, MariaDB on the same box | Must not be disturbed; compose stack must not bind host ports except the API |

## 2. New stack (from repo `docker-compose.yml`)

- `postgres` (16-alpine) — private, healthchecked, init script creates `alabiq_app` role
- `redis` (7-alpine) — private, appendonly
- `minio` (librefs S3) — private, holds payment proofs / driver docs / merchant images / avatars
- `realtime` (node) — internal on `:4100`, Redis-backed, publishes via `REALTIME_PUBLISH_TOKEN`
- `migrate` + `seed-reference` — one-shot containers, run baseline migrations + reference seed
- `api` — exposes `:4000` internally; needs `backend/.env`
- `frontend` — builds Vite app, serves on `:8080` (not needed for our cutover — see §5)

Baseline migrations: `backend/migrations/postgres/0001–0007`. No Supabase anywhere; new auth is app-owned (`app_users` with scrypt hashes, `app_sessions`, password-reset tables).

## 3. What changes at cutover (endpoint compatibility)

All public endpoints keep their shape (`/api/…`), and nginx keeps both hostnames, so URLs stay stable. The real changes:

1. **Frontend must be rebuilt and redeployed together with the API.** The current production frontend has Supabase keys compiled in (direct Supabase auth/storage calls). The new frontend no longer uses them (auth via API, realtime via `/api/events`). Mixing old frontend + new API breaks login. Rebuild `dist` from `ce7c36b` with `VITE_API_BASE=https://api.alabiq.com` and **no Supabase vars**.
2. **Auth data moves from Supabase Auth to `app_users`.** Password hashes: Supabase GoTrue = **bcrypt**, new backend = **scrypt** — not copyable. See decision D2.
3. **Files move from Supabase Storage to MinIO**, served via the API media gateway `/api/files/public/…` (public buckets) and signed URLs (private buckets). The repo already ships `scripts/migrate-public-media-urls.js` (dry-run, `--apply`) to rewrite persisted URLs.
4. **Password-reset emails now come from the app SMTP** (was Supabase Auth). Server `.env` currently has **no SMTP keys** — credentials must be procured before cutover.
5. `/api/events` SSE block and `client_max_body_size` in nginx carry over unchanged.

## 4. Data migration approach

**Status: tooling implemented and smoke-tested (see §10).**

Old schema differs from the new baseline (old tables FK to `auth.users`; new baseline is standalone, zero `auth.users` references). A raw `pg_dump` restore will **not** fit — an app-level ETL is required regardless of export path.

**Export — decision D1:** `backend/scripts/supabase-export.sql` (psql `\copy`, one CSV per table + `auth_users.csv` with an explicit GoTrue column list). Run from any machine with psql:

```sh
mkdir -p csv && cd csv
psql "$SUPABASE_DB_URL" -f backend/scripts/supabase-export.sql   # writes CSVs into ./csv
scp -r csv root@187.127.100.178:/opt/SmartMappiaa/import/
```

`SUPABASE_DB_URL` is the direct Postgres connection string from the Supabase dashboard (pooler host `:6543` with `?pgbouncer=true&connection_limit=1` also works). The old and new schemas are **column-for-column identical** for all 43 public tables (verified by diff), so no table restructuring — only the `auth.users` → `app_users` mapping, which keeps UUIDs so every FK stays valid.

**Transform & load:** `backend/scripts/import-supabase.js` (against the target DB, e.g. `docker compose exec api node scripts/import-supabase.js import --dir /import/csv`):

1. `auth_users.csv` → `app_users`, same UUIDs; skips deleted/anonymous/no-email rows (reported); `banned_until` → `disabled_at`; empty passwords get an unusable random scrypt hash (account stays locked until password reset). **bcrypt hashes are imported as-is** and handled by the verify-shim (D2).
2. Each `<table>.csv` → `import_staging.<table>` (typed via `LIKE public.<table>`), then `INSERT … ON CONFLICT DO NOTHING` under `session_replication_role = replica` — idempotent, safe to re-run.
3. Built-in tripwire: refuses to import once any `app_sessions` row exists (sessions only appear when the new API serves live logins).
4. `verify` (count comparison + orphan check, no writes) and `cleanup` (drops `import_staging`) subcommands.
5. Storage objects: download each bucket from Supabase Storage (service key) → upload into MinIO **preserving object keys** after `node scripts/setup-buckets.js` (idempotent), then `node scripts/migrate-public-media-urls.js --apply` rewrites stored public URLs to `${PUBLIC_API_BASE}/api/files/public/…`.

## 5. Target topology (minimal-change, two origins kept)

Keep the existing nginx layout — only the API upstream changes. This preserves CORS config, TLS, and every public URL.

```
alabiq.com          → nginx static dist (rebuilt from ce7c36b)      [unchanged config]
api.alabiq.com      → nginx → 127.0.0.1:4001 (docker api)           [was 127.0.0.1:4000 PM2]
                           /api/events SSE block kept
compose network          → postgres, redis, minio, realtime, api          [private, no host ports]
```

New checkout at `/opt/SmartMappiaa/alabiq-docker` (old checkout left untouched for instant rollback). API published as `127.0.0.1:4001:4000` via a `docker-compose.prod.yml` override. **Update 2026-10-22 (incident below):** the same mapping is now also in the base `docker-compose.yml`, so a plain `docker compose up -d` (without the overlay) cannot drop the host port again; Compose v2 dedupes the identical entry when both files are used. The compose `frontend` service is **not used** in production — the host nginx keeps serving static `dist`, which also matches `VITE_API_BASE=https://api.alabiq.com`.

## 6. Env plan

**Compose-level `.env`** (new): `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `MINIO_ROOT_USER/PASSWORD` (fresh strong values), `REALTIME_PUBLISH_TOKEN` (random).

**`backend/.env`** (adapted from existing, copy then edit):
- Remove: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SESSION_ENCRYPTION_KEY`, `SESSION_SQLITE_PATH`, `MAPBOX_SECRET_ACCESS_TOKEN`.
- Add: `APP_SIGNING_KEY` (random 32+ bytes), `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`MAIL_FROM` (**decision D3** — procure credentials).
- Keep as-is: `CORS_ORIGINS`, `PAYMENT_MODE=stcpay_manual`, STCPay vars, `VAPID_*`, `ADMIN_EMAILS`, `GOOGLE_MAPS_SERVER_KEY`, `TAP_*`, `PUBLIC_WEB_URL`, `PUBLIC_API_BASE`, `SHOP_ENABLED`, payment-proof TTL/size vars.
- `DATABASE_URL`, `OBJECT_STORAGE_*`, `REALTIME_*`, `PORT` are injected by compose — do not set in `.env`.

## 7. Cutover sequence

**Phase 0 — Pre-flight (needs input)**
- D1: Supabase DB password (or approve REST export).
- D2: password strategy (recommend bcrypt verify-shim — see below).
- D3: SMTP credentials for transactional mail.
- Fresh `pg_dump`-style safety: export counts from Supabase; snapshot the old checkout.

**Phase 1 — Stage the stack (no downtime)**
1. `git clone` to `/opt/SmartMappiaa/alabiq-docker`, checkout `ce7c36b`.
2. Write compose `.env`, `backend/.env`, `docker-compose.prod.yml` (port 4001 override).
3. `docker compose -f docker-compose.yml -f docker-compose.prod.yml build` then `up -d postgres redis minio realtime`; `migrate` + `seed-reference` run to completion; run `setup-buckets.js` via a one-shot `docker compose run --rm api node scripts/setup-buckets.js`.

**⚠️ Critical: Any backend code change requires `docker compose build api` + restart.** The API runs in a container with baked-in code — pulling git changes alone does not update the running container. Verify with `curl https://api.alabiq.com/api/health` → 200, then test a known endpoint.

**Phase 2 — Migrate data (old site still live)**
4. Export Supabase (per D1); run the ETL into the staged DB; copy storage objects into MinIO; run `migrate-public-media-urls.js --apply`.
5. Re-run row-count verification.

**Phase 3 — Smoke test (private)**
6. On the server: `curl 127.0.0.1:4001/health`, `/api/route`, login flow for a seeded test user, an authenticated endpoint per domain (rides, food, shop, ledger, admin), `/api/events` SSE stream, a file upload + signed download, password-reset email (SMTP).

**Phase 4 — Cutover (minutes of downtime)**
7. Rebuild frontend `dist` from `ce7c36b` with production build vars (no Supabase keys); `nginx -t && systemctl reload` isn't needed for static, but verify the site loads.
8. Flip `api.alabiq.com` upstream `4000 → 4001`, `nginx -t && systemctl reload nginx`.
9. Verify from outside: health, login (post-password-strategy), key endpoints, SSE, web app loads.

**Phase 5 — Rollback & cleanup**
- Rollback (if needed): flip nginx back to `4000`, `pm2 restart alabiq-api`. Old stack untouched until Phase 6.
- After a stable window (recommend 7 days): `pm2 stop alabiq-api && pm2 delete alabiq-api` (keep ecosystem file archived), stop the legacy `osrm` container, archive old checkout to `/opt/SmartMappiaa/legacy-alabiq-web-main.tar.gz`, set up a nightly `pg_dump` cron of the compose Postgres + MinIO volume backup.

## 8. Risks & decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Supabase export path | A: DB password → pg_dump (fast, complete) / B: REST export with service key (no password needed) | A; B is fallback |
| D2 | Password hash migration (bcrypt → scrypt) | ~~A: bcrypt verify-shim~~ **IMPLEMENTED** — `lib/passwords.js` verifies `$2a$/$2b$` via `bcryptjs` and `authController.login` re-hashes to scrypt on first successful login; non-scrypt formats still rejected | Done; track re-hash progress, remove bcrypt after the tail drains |
| D3 | SMTP | Any provider (host's own mail, SendGrid, Resend, Gmail app password) | Procure before Phase 1 |
| R1 | Old frontend during staging | Old frontend keeps using Supabase until cutover — both systems run in parallel; last write wins goes to Supabase until the nginx flip | Keep staging strictly read-only against the new DB until cutover |
| R2 | Long bcrypt tail | After D2-A, track re-hash progress; remove shim in a later release | — |
| R3 | MinIO public images | Public bucket served only through the API gateway — no extra host port | Already the design |

### Second origin — alabiq.yaramay.online (2026-11-12) ✅

- New nginx vhost `alabiq.yaramay.online`: static SPA from `/var/www/alabiq` + same-origin API proxy `location /api/` → `127.0.0.1:4001` (docker API), with the SSE-safe `location = /api/events` block (buffering off, 75 s timeouts) and `client_max_body_size 12m`. TLS via Certbot (expires 2027-02-10, auto-renew); port 80 → 301 HTTPS.
- Frontend built **on the server** from the live checkout `/opt/SmartMappiaa/smartmappiaa-docker/smartmappia-web-main` (f5a7782 + uncommitted fixes) with `VITE_API_BASE=https://alabiq.yaramay.online` passed inline (server `frontend/.env` untouched — still `VITE_MAP_PROVIDER=mapbox`); `dist/` rsynced to `/var/www/alabiq`.
- `backend/.env` `CORS_ORIGINS` now includes `https://alabiq.yaramay.online` (backup: `backend/.env.bak-20261112`); API container recreated via `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api`; `127.0.0.1:4001` listener re-verified.
- Smoke (external): site 200, HTTP→HTTPS 301, `POST /api/auth/login` 401 (reachable), CORS preflight returns `Access-Control-Allow-Origin: https://alabiq.yaramay.online`, `/api/events` 403 (auth-guarded, reachable). Neighbor sites (smartmappia.com, yaramay.online) re-verified 200.
- Note: both origins now share the same API/DB. `PUBLIC_API_BASE`/`PUBLIC_WEB_URL` in `backend/.env` still point at smartmappia.com — server-generated absolute URLs (emails, signed links) will use that origin.

## 9. Definition of done

- `api.alabiq.com` served by the Docker API (verify via response header/container log).
- All smoke endpoints green from an external client; web app login, ordering, tracking, admin dashboards functional.
- Zero references to Supabase in server envs; Supabase project can be paused.
- Nightly DB + object backups in place; rollback artifacts archived.

## 10. Implementation log

### 2026-11-20 (evening) — Routine redeploy: path-relative Vite asset URLs ✅

Commit `8d68ba4` (`app/Providers/AppServiceProvider.php`). Context: the
`yaramay.online` zone hit expiry on 2026-11-19 and was parked on the
registrar's `ns1/ns2.dns-expired.com` (SERVFAIL from 8.8.8.8/1.1.1.1; whois
showed `autoRenewPeriod`, expiry 2027-11-19 — renewal processed but NS not
restored). Server itself stayed healthy, but `@vite` rendered **absolute**
`https://alabiq.yaramay.online/build/...` URLs, so the HTML shell loaded while
every CSS/JS/webmanifest failed with `ERR_NAME_NOT_RESOLVED`. Fix: container
`Vite::createAssetPathsUsing()` in `AppServiceProvider::boot()` emits
origin-relative `/build/...` paths, so assets keep loading whenever the host is
reachable (IP / hosts-file) during any future DNS outage. No migrations, no
composer, no Vite rebuild (manifest-driven, runtime PHP only).

**Procedure:** local verify via framework boot (scripted `bootstrap/app.php`
render — `href|src="/build/assets/…"`); `php artisan test` → 97/97 Unit green
(5 Feature `QueryException` — local Docker pgsql down, unrelated). Checksum
dry-run (2 files: provider + this doc), rsync app root with §10 `.htaccess*`
excludes, host `view:clear` → `view:cache` (green).

**HTTPS smoke after (via `curl --resolve` — public DNS still parked at the
time):** `/` 200 serving **only** relative `/build/assets/…` refs (0 absolute
left), `/login` 200 same, `/build/assets/app-IprlBhKD.js` 200,
`/admin` 302 → `/admin/login`, `/api/health` 503 degraded (by design).

**Still open (ops, not code):** restore Hostinger nameservers for
`yaramay.online` in the registrar panel — until then the site is unreachable
by domain for real users regardless of this fix.

### 2026-11-20 — Routine redeploy: customer post-login redirect to demo restaurant + session-aware navbar ✅

Commit `2e4f43d`. Blade-only (3 views: `auth/app-login`, `auth/app-signup`,
`layouts/site`) — non-admin sign-in/sign-up fallback destination is now
`/demo/restaurant`; the site navbar checks `sm_api_session` via
`/api/auth/session` and swaps Log in/Sign up for Order Now → `/demo/restaurant`
+ Sign out (`POST /api/auth/logout` + localStorage cleanup) for signed-in
customers. No migrations, no composer, no Vite rebuild.

**Procedure:** checksum dry-run (only the 3 view files differ in content;
everything else timestamp-only; `.htaccess*` excluded per §10 gotcha), rsync
app root, host `view:clear` → `view:cache` (green).

**HTTPS smoke after (all green):** `/` 200, `/login` 200, `/demo/restaurant`
200, `/api/health` 503 degraded (by design). Content verification on live HTML:
landing page serves `siteNav()` + 2× `/demo/restaurant` hrefs + Sign out
buttons; `/login` + `/signup` both render `safe ? next : '/demo/restaurant'`.

### 2026-11-19 (evening) — Routine redeploy: demo restaurant page + dark login/admin shell ✅

Commits `3ec94e2` (demo restaurant, login redesign, UserSeeder, app.css fix),
`f9de3d8` (admin dark shell). No migrations (none changed — UserSeeder is
dev/test only and was **not** seeded on prod). Local `npm run build`, rsync
app root, alt-php84 `composer install` (no-op), `config:cache` → `view:cache`
→ `route:cache` (storage dirs already existed; 49 compiled views, `routes-v7.php`).

**⚠️ New gotcha — rsync `--delete` killed the docroot `.htaccess`.** It is
host-side only (not in the repo), and the exclude list didn't cover it, so the
first smoke came back 403/404 on every route until it was restored from
`.builds/backup-20261119-structural/app.tar.gz` (pre-migration copy — re-applied
the `alabiq-web-main/public` → `public` sed; the `.htaccess.bak-20261119` copy
was also deleted by the same rsync). **Future deploys must exclude
`--exclude='.htaccess'` (or exclude `.htaccess*`).**

**HTTPS smoke after (all green):** `/` 200, `/login` 200, `/demo/restaurant` 200
(banner + fixture dishes render), `/services/food` 200, new CSS asset
`app-DtZwm6h1.css` serving, `/api/health` 503 degraded (by design).

### 2026-11-19 (evening, hotfix) — Admin shell 500 fix ✅

Commit `9f7f4e9` (null-safe `$user->email` in `layouts/admin.blade.php` — the
portal shell 500'd when rendered without an authenticated session, e.g. the
standalone shell render; normal `/admin` traffic redirects to `/login` and was
never affected). Also carried `2caa373` (mobile drawer backdrop color). Blade-only
change — no Vite rebuild, no composer, no migrations. rsync app root with the
§10 `.htaccess*` exclude (dry-run verified: 5 files, `.htaccess` untouched),
`view:clear` → `view:cache` on host (49 compiled views).

**HTTPS smoke after (all green):** `/` 200, `/login` 200, `/demo/restaurant` 200,
`/services/food` 200, `/admin` 302 → `/login` (no 500), `/api/health` 503
degraded (by design).

### 2026-11-19 (PM) — Shared-hosting structural migration: app root flattened to `public_html/` ✅

Aligned the live host with the repo flattening (commit `7b74221`): the Laravel app moved
from `public_html/alabiq-web-main/` up to the domain docroot `public_html/` itself —
the host now mirrors the repo 1:1 (repo root = app root = docroot).

**Procedure executed (all via `ssh -p 65002 u805024096@178.16.135.22`):**

1. **Backup:** `tar -czf ~/domains/alabiq.yaramay.online/.builds/backup-20261119-structural/app.tar.gz`
   (whole `alabiq-web-main/` incl. vendor + `.env` + `public_html/.htaccess`; verified
   12,499 vendor files before touching anything).
2. **Env:** `mv alabiq-web-main/.env public_html/.env` (compose-style env now at app root).
3. **Rsync** from local repo root (excl. `.git .env* vendor node_modules storage archive
   .phpunit.cache bootstrap/cache/*.php`, incl. `.env.example`):
   `rsync -az ./ u805024096@178.16.135.22:~/domains/alabiq.yaramay.online/public_html/`
4. **Deps/migrations:** alt-php84 `composer install --no-dev --optimize-autoloader
   --ignore-platform-req=ext-pdo_pgsql --ignore-platform-req=ext-redis` (green),
   `artisan migrate --force` (no-op), `storage` copied from old app (sessions preserved).
5. **Cutover:** `.htaccess` `RewriteRule … alabiq-web-main/public/$1` → `public/$1`
   (old file kept at `.htaccess.bak-20261119`).
6. **Cleanup:** old `alabiq-web-main/` removed after smoke (backup tar retained).

**Two gotchas hit (documented for the next deploy):**

- **`config:cache` BEFORE storage dirs exist → empty `view.compiled`.** This repo ships
  no `config/view.php`; Laravel's default resolves `view.compiled` via
  `realpath(storage_path('framework/views'))`, which returns `false` when the dir is
  missing and caches as empty → every Blade render dies with
  *"Please provide a valid cache path"* (HTTP 500 on `/`, API still fine). **Order
  matters: create `storage/framework/{cache/data,sessions,views}` first, then
  `config:cache` → `view:cache` → `route:cache`.**
- **rsync excludes `storage/`** — first request then fails on session writes. Migrate
  the old app's storage (`cp -a old/storage/. storage/`) instead of starting empty.

**HTTPS smoke after (all green):** `/` 200 (Blade welcome, `/build/` Vite assets
resolving), `/services` `/support` `/privacy-policy` `/login` 200, `/api/health` 503
degraded (by design — no Redis), `/api/food/restaurants` 200, `/api/auth/session` 401,
login probe 401, http→https 301. Site served from the new root for the final smoke;
old dir deleted; rollback = restore tar + `.htaccess.bak-20261119`.

### 2026-11-19 — Shared-hosting redeploy: full-Laravel structure + pusher (feat/full-laravel) ✅

The host was migrated from the old three-part layout (`alabiq-web-main/laravel/`) to the new
full-Laravel app root (`alabiq-web-main/` is the app). Node `backend/`+`frontend/`, the Node
`realtime` service, and the Capacitor mobile apps are removed from the repo; realtime is
**pusher.com** (no local realtime service). See `PLAN-full-laravel.md` and `AGENTS.md` header.

**Local gate before deploy** (all green):
1. `docker compose down -v` → `docker compose up --build -d` (fresh volumes; all 25 migrations
   run on fresh pgsql; migrate/seed one-shots green).
2. Smoke: `GET /` 200 (Blade welcome), `GET /api/health` 200 (`db/redis: connected`),
   `GET /api/food/restaurants` 200, `GET /api/auth/session` 401.
3. `php artisan test` → 102/102 (feature suite on auto-created `alabiq_test` pgsql DB).
4. MariaDB portability: temp `mariadb:11.8` container + `php:8.4-cli` with `pdo_mysql` ran all
   25 migrations clean (validates the driver-aware SQL before touching the host).

**Host procedure** (SSH `ssh -p 65002 u805024096@178.16.135.22`, docroot
`/home/u805024096/domains/alabiq.yaramay.online/public_html`):

```sh
# 1. Preserve the server .env (old location), then rsync the new app root
cd public_html/alabiq-web-main && mv laravel/.env .env
rsync -az --delete \
  --exclude='.env' --exclude='.env.*' --exclude='vendor/' --exclude='node_modules/' \
  --exclude='storage/' --exclude='archive/' --exclude='.phpunit.cache/' \
  -e "ssh -p 65002" ./alabiq-web-main/ \
  u805024096@178.16.135.22:.../public_html/alabiq-web-main/
# host: stale backend/frontend dirs removed by hand (rsync can't delete excluded .env inside)
rm -rf backend frontend laravel   # laravel/ after copying laravel/storage/* into storage/

# 2. Point the docroot .htaccess at the new public/ (was laravel/public/)
sed -i "s|alabiq-web-main/laravel/public|alabiq-web-main/public|g" public_html/.htaccess

# 3. Rebuild deps + run new migrations (composer MUST run on alt-php 8.4 — default is 8.3)
COMPOSER_ALLOW_SUPERUSER=1 /opt/alt/php84/usr/bin/php /usr/local/bin/composer install \
  --no-dev --optimize-autoloader --ignore-platform-req=ext-pdo_pgsql --ignore-platform-req=ext-redis
/opt/alt/php84/usr/bin/php artisan migrate --force        # adds 000021–000025
/opt/alt/php84/usr/bin/php artisan db:seed --class=ReferenceDataSeeder --force
/opt/alt/php84/usr/bin/php artisan config:cache && route:cache && view:cache
```

**Fixes shipped in this deploy** (commit `f4a7f03`): migration 000021 MariaDB-safe (prefix-length
unique index on TEXT + `DROP CONSTRAINT` syntax), new migration 000025 (`ratings` table — was in
Express 0001 but missing from the mirror, broke `/api/food/restaurants`), restaurants controller
(aggregate from per-order ratings, driver-aware ILIKE→LIKE, `weekday/opens_at/closes_at` column
names), `public/.htaccess` re-tracked (lsphp84 pin), pusher package + `config/broadcasting.php`.

**HTTPS smoke after deploy** (`curl https://alabiq.yaramay.online`):

| Route | Result | Meaning |
|---|---|---|
| `GET /` | 200 | Blade welcome page (Vite assets served from `public/build`) |
| `GET /api/health` | **503** | BY DESIGN here: `db: connected`, `redis: error` — no Redis on shared host (degraded mode, same as 2026-11-18) |
| `GET /api/food/restaurants` | 200 | previously 500 — fixed (ratings table + LIKE portability) |
| `GET /api/auth/session` | 401 | auth middleware stack reachable |
| `POST /api/auth/login` (bad creds) | 401 | scrypt hasher works on alt-php 8.4 |
| `GET /api/shop/stores` | 503 | `SHOP_ENABLED=false` on this host (feature flag) |
| `GET /api/payments/config` | 500 | Phase-2.2 stub controller — pending parity work |
| `http://` → `https://` | 301 | redirect enforced |

**Demo walkthrough** (what to click):
1. Landing: `https://alabiq.yaramay.online/` — Blade welcome page.
2. API health: `https://alabiq.yaramay.online/api/health` — JSON `status: degraded` (no Redis on host).
3. Restaurant listing: `https://alabiq.yaramay.online/api/food/restaurants` — JSON `restaurants: []`
   (empty until merchants are seeded), `?q=shawarma` exercises the portable search.
4. Auth probe: `https://alabiq.yaramay.online/api/auth/session` in a browser → 401 JSON (middleware
   works); full login flow needs a seeded user (`php artisan db:seed --class=AdminSeeder` on host).

**Known gaps (unchanged from 2026-11-18):** no Redis (file cache/sync queue), no MinIO/S3,
no SMTP, `SHOP_ENABLED=false`, payments controllers are Phase-2.2 stubs, PUSHER_APP_* unset
(broadcasting configured but not publishing).

### 2026-11-18 — Shared-hosting deployment: alabiq.yaramay.online on Hostinger ✅

The repo was uploaded whole (git clone layout) to a **Hostinger shared-hosting** account as a
second deployment target for the Laravel migration. This is a fully separate environment from
the VPS Docker stack above — no Node, no PostgreSQL, no Redis, no MinIO.

- **Access:** `ssh -p 65002 u805024096@178.16.135.22` (key auth; Hostinger, `id-dci-web1784.main-hosting.eu`)
- **Docroot:** `/home/u805024096/domains/alabiq.yaramay.online/public_html` (whole git repo lives here)
- **Host capabilities:** Apache/LSWS + PHP 8.3 default (alt-php 8.2–8.6 available at `/opt/alt/phpXX/usr/bin/php`), **MariaDB 11.8 only** (`pdo_mysql`; no `pdo_pgsql`), Composer, no Node/Redis/psql. PHP CLI/web limits 3072 M.
- **Database:** `u805024096_alabiq` / user `u805024096_alabiq` @ `localhost:3306` (creds in server-side `laravel/.env` only — never commit).

**Setup performed:**
1. `public_html/.htaccess` — rewrites all requests into `alabiq-web-main/laravel/public/`, blocks `.git` and env files. Same two-layer pattern as the other Laravel sites on this account (`alesnaad.site`, `alyusr.website`), which keep Laravel at docroot and rewrite into `public/`.
2. `laravel/public/.htaccess` — standard Laravel front controller + **`SetHandler application/x-lsphp84`**: the domain default is PHP 8.3 but `composer.lock` (Symfony 8.1) requires ≥ 8.4.1, so the handler is pinned to alt-php 8.4 in `.htaccess`. **If this file is lost, the site 500s with a platform-check error.** Also added `X-XSRF-Token` header forwarding (Sanctum SPA auth), matching `asiatigertraveltour.com`.
3. `laravel/.env` — MySQL connection, `CACHE_STORE=file`, `SESSION_DRIVER=file` (no `sessions` table in schema), `QUEUE_CONNECTION=sync`, `FEATURE_SHOP_ENABLED=false`, `APP_URL=https://alabiq.yaramay.online`. Keys still empty: SMTP, Tap, VAPID, Mapbox, `ADMIN_EMAILS`.
4. `composer install --no-dev --optimize-autoloader` with `/opt/alt/php84/usr/bin/php` + `--ignore-platform-req=ext-pdo_pgsql` (composer.json requires pgsql, host has none). Created `bootstrap/cache` + `storage/*` (not in git). `artisan key:generate`, `config:cache`.
5. `artisan migrate --force` — all 20 migrations applied to MariaDB.

**Code fixes required for MySQL portability / runtime (applied in repo, synced to host):**
- `migrations 000001/000003` — driver-aware: `CREATE SCHEMA/EXTENSION` + functional `LOWER(email)` index + `gen_random_uuid()` default are pgsql-only, now skipped on mysql; `email`/`public_hash` use `varchar` on mysql (TEXT can't take a unique index). On MySQL the app must supply `merchants.public_hash` on insert (no DB default).
- `migration 000012` — explicit index name `bg_jobs_poll_idx` (MariaDB caps index identifiers at 64 chars).
- `app/Providers/RouteServiceProvider.php` — `Limit::decayMinutes()` was removed in the installed framework; folded the decay into `Limit::perMinute($limit, $decay/60)`.
- `bootstrap/app.php` — registered the middleware aliases the routes reference (`auth`, `admin`, `driver`, `driver.approved`, `merchant`, `merchant.vertical`, `feature`, `food.auth`, `partner.auth`, `idempotency`); without them every guarded route 500s with `Target class [x] does not exist`.
- `laravel/public/.htaccess` added to the repo (was missing entirely — both locally and on host).

**Verified:** `/api/health` returns JSON (`db: connected`; `status: degraded` + 503 because Redis is absent — expected on this host), auth-protected routes reach the middleware stack, HTTPS + HTTP→HTTPS working.

**Known gaps on this environment:** no Redis (cache/queue downgraded to file/sync), no MinIO/S3 (payment-proof and media storage unconfigured), no realtime channel, no SMTP (password reset fails), `GET /api/food/restaurants` still 500s — the Phase-B controller assumes an `App\Models\Rating` aggregate table that was never ported (Express aggregates the per-order `ratings` table on the fly), and its `ILIKE` search is pgsql-only. Frontend not deployed here (no Node); only the Laravel API runs.

---

### 2026-11-14 — Push-to-deploy: post-receive hook on the bare repo ✅

Pushing to branch `full` on `root@187.127.100.178:/opt/SmartMappiaa/smartmappiaa.git` now
**auto-deploys production** — no more manual steps. End-to-end tested (empty commit `f15ade7`).

- `hooks/post-receive` in the bare repo triggers only on `refs/heads/full` (branch deletion
  is ignored) and streams progress back to the pusher.
- `/opt/SmartMappiaa/deploy.sh` does the 2026-11-13 deploy sequence: reset the live checkout
  `/opt/SmartMappiaa/alabiq-docker` to the pushed sha → `docker compose -p smartmappia-web-main
  build api worker migrate frontend` → run migrations (`run --rm migrate`, idempotent) →
  `up -d` → wait for `127.0.0.1:4001/api/health` → swap `/var/www/alabiq` to the new dist
  (previous dist kept at `/var/www/alabiq.old`) → external smoke checks (health 200,
  login probe 401, port 4001 listener).
- A `flock` serializes concurrent deploys; every run appends to `/var/log/alabiq-deploy.log`.
- Safe-fail: if the API never becomes healthy, the web root is left untouched; if the copied
  dist lacks `index.html`, the swap is aborted.
- Rollback: reset `full` (or the checkout) to the last good sha and push / run
  `/opt/SmartMappiaa/deploy.sh`; restore `/var/www/alabiq.old` if needed.
- Canonical copies of both scripts live in the repo at `deploy/post-receive` and
  `deploy/server-deploy.sh` (uploaded to the server by hand — the bare repo does not track them).

---

### Incident 2026-10-22 — login down: "Network error: could not reach the server"

**Symptom:** `alabiq.com/login` showed *"Network error: could not reach the server"* for all users; `POST https://api.alabiq.com/api/auth/login` returned **502** in ~0.2 s.

**Root cause:** the host nginx proxies `api.alabiq.com` → `127.0.0.1:4001`, but the API container's host port mapping (`127.0.0.1:4001:4000`) only existed in the `docker-compose.prod.yml` overlay. At ~00:15 UTC the API container was recreated with a **plain `docker compose up -d`** (no `-f docker-compose.prod.yml`), so the new container had no published port. Nothing listened on `127.0.0.1:4001` → nginx 502 → the frontend renders it as a generic network error. (Separate issue found while verifying: `ruth@alabiq.com`'s password was rejected with 401 — hash updated directly in `app_users` to the owner's supplied value.)

**Fix (applied 2026-10-22 ~02:20 UTC):**
1. Server-side `docker-compose.yml` (backup `docker-compose.yml.bak-20261022`): added `ports: ["127.0.0.1:4001:4000"]` to the `api` service, then `docker compose up -d api` to recreate. Verified externally: login → HTTP 200 with token.
2. Same change committed to the repo, so the next deploy can't silently revert it. **The port mapping now lives in the base file AND the overlay — this is deliberate** (Compose v2 renders a single deduped binding when both files are used), so both `docker compose up -d` and the documented `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` produce a working API.

**Prevention checklist — run after ANY `docker compose` operation on srv1777854:**
- `ss -tlnp | grep 4001` — must show a listener bound to `127.0.0.1:4001`.
- `curl -sS -o /dev/null -w '%{http_code}' -X POST https://api.alabiq.com/api/auth/login -H 'Content-Type: application/json' -d '{"email":"x@x.x","password":"x"}'` — expect `401` (reachable, auth-rejected). **502 or timeout = port mapping lost; a "network error" report from users almost always means this.**
- Watch for the tell-tale: `docker ps` shows the API container "Up N hours" with **no published ports** while the site is down.

### Phases 2–4 summary

### Phase 2 — SKIPPED per owner decision (2026-10-16)

No Supabase data/storage migration. Production starts fresh on the standalone stack; the old Supabase project (`wwaofiklnlkvdimfajgq`) remains the only copy of pre-cutover accounts/orders/files. The ETL tooling stays in the repo should a retroactive import ever be wanted.

### Incident 2026-10-26 — API "Not found" after code deploy

**Symptom:** Admin portal "Accounts" tab returned `{"error": "Not found"}` for `/api/admin/users`. Frontend loaded but API calls failed.

**Root cause:** Backend code changes were pulled and frontend was rebuilt, but **Docker image was not rebuilt**. The running API container contained old code without the new `/api/admin/users` route. Nginx proxied to the container which returned 404.

**Fix (applied 2026-10-26):**
```bash
cd /opt/SmartMappiaa/alabiqa-docker/alabiq-web-main
docker compose build api      # Rebuild backend image with new code
docker compose up -d api      # Restart API container
```

**Prevention checklist — run after ANY code deploy affecting backend:**
- `docker compose build api` (or `docker compose build` for all)
- `docker compose up -d api`
- Verify new endpoints: `curl https://api.alabiq.com/api/admin/users` → should return `401 Authentication required` (not `404 Not found`)

**Key lesson:** **Any backend code change requires `docker compose build api` + restart.** Frontend rebuild alone is insufficient — the API runs in a container with baked-in code.

---

### 2026-11-13 — Partner-API fixes + Alabiq rebrand deployed (commit `de2be5c`) ✅

**Canonical repo is now `renitreni/alabiq`** (branch `feat-restaurant-delivery-api`, pushed to `origin`). The Alabiq repo history is unrelated to the old SmartMappiaa history, so deploys **force-push** the branch to the server bare repo: `git push --force root@187.127.100.178:/opt/SmartMappiaa/smartmappiaa.git <branch>:refs/heads/full`.

**New live checkout:** `/opt/SmartMappiaa/alabiq-docker` (clone of the bare repo; compose file at `alabiq-web-main/`). The old checkout `/opt/SmartMappiaa/smartmappiaa-docker/smartmappia-web-main` is kept untouched as rollback. Deploy steps:
1. `git fetch /opt/SmartMappiaa/smartmappiaa.git full && git reset --hard <sha>` in the new checkout.
2. Compose **must pin the project name** to reuse existing volumes: `docker compose -p smartmappiaa-web-main ...` (without it, compose derives `alabiq-web-main` from the directory and would start an empty DB).
3. `docker compose -p smartmappia-web-main build api worker` → `up -d` → verify `curl https://alabiq.yaramay.online/api/health`.
4. Frontend: `docker compose build frontend`, then `docker cp` `/usr/share/nginx/html/.` from a throwaway container into `/var/www/alabiq` (keep the previous dist at `/var/www/alabiq.old` until verified).

**Production DB roles still use the old names** — the DB predates the rebrand: `POSTGRES_USER=smartmappia`, `POSTGRES_DB=smartmappia`, `APP_DB_USER=smartmappia_app` (pinned in the checkout's `alabiq-web-main/.env`; passwords from the old checkout's `.env`). Migration 0006's stored checksum was updated once to match the rebrand-touched file (role-name strings only; the applied grants still target `smartmappia_app`, and default privileges keep covering new tables).

**Live site is `alabiq.yaramay.online`** (nginx → `/var/www/alabiq`, `/api/` → `127.0.0.1:4001`). There is no `alabiq.com` nginx site on this box despite earlier docs.

**What shipped:** migrations 0008–0011 (partner API schema, `payment_method 'external'`, `delivery_quotes.distance_km`), partner item-pricing validation, full Alabiq rebrand (web/Android/iOS assets), the `worker` service enabled with Redis GPS hot path.

**Incidents fixed during this deploy** (see commits `2bc04b5`…`de2be5c`):
- `deliveriesController.js` was truncated since Phase 6 (`buildDeliveryResponse` missing `}`) — API crash-looped; unit tests never loaded the controller. A syntax gate test (`test/syntaxGate.test.js`, node --check over controllers/routes/lib/middleware) now covers this.
- `worker.js` webhook processor destructured a non-existent named export — every tick crashed. Also `redis` was used but undeclared in `backend/package.json` (GPS path silently fell back to Postgres).

---

### Phase 4 — cutover complete (2026-10-16) ✅

- Frontend `dist` rebuilt from the Drop-Supabase code (no active Supabase deps; remaining "supabase" strings are passive legacy-URL handling) and deployed to the new checkout.
- nginx: `alabiq.com` root → new dist; `api.alabiq.com` upstream → `127.0.0.1:4001` (docker). Reloaded after `nginx -t`.
- Verified publicly: api 200, web 200, `/login` 200, prynz admin login 200 through `api.alabiq.com` with the session row landing in the docker Postgres.
- Decommissioned: PM2 `alabiq-api` stopped/deleted (`pm2 save`), legacy `osrm` container stopped, old Rizzkkk checkout archived to `/opt/SmartMappiaa/archive/alabiq-web-main-pre-cutover-20261016.tar.gz` (contains old env secrets — keep restricted) and removed; rsync backup removed. Port 4000 free.
- Seed accounts live on production: super admin `ferdzsabado@alabiq.com`, admins `ferdz@`/`prynz@alabiq.com`, test user/driver (credentials with owner).
- REMAINING GAPS: SMTP not configured (password-reset emails fail — D3); GitHub deploy key not registered (deploys flow via `git push server-deploy full`); the archived Rizzkkk PAT should be rotated; nightly DB/object backups not yet scheduled.

- Commit `affa193` (cutover tooling) + plan updates pushed to `renitreni/SmartMappiaa` (canonical remote; HEAD `b1eb157`).
- NOTE: the server's old checkout tracks `github.com/Rizzkkk/SmartMappiaa` — a different repo without these commits. Server has no GitHub key, so the branch is pushed from local to a bare repo on the server (`git remote add server-deploy root@187.127.100.178:/opt/SmartMappiaa/alabiqa.git`) and the deploy dir is a real `git clone` of it, with `origin` set to `git@github.com:renitreni/SmartMappiaa.git` for when a deploy key is registered. Also: a live GitHub PAT is embedded in the old checkout's origin URL — rotate it.
- Deployed to `/opt/SmartMappiaa/alabiqa-docker/alabiq-web-main`; previous rsync copy kept at `/opt/SmartMappiaa/alabiqa-docker-rsync-backup` until cutover is verified.
- Re-clone kept the same compose project name, so the existing Docker Postgres/Redis/MinIO **volumes were reused — all data preserved** (7 migrations, 4 buckets, 48 tables verified after the swap).
- `.env` (compose) and `backend/.env` written server-side with on-server-generated secrets; Supabase/session keys stripped; `APP_SIGNING_KEY` added. **SMTP keys still missing (D3)** — password reset emails will fail until supplied.
- Stack up: postgres/redis/minio/realtime healthy; API published on `127.0.0.1:4001`.
- Smoke: root 200, unknown login 401 (DB wired), `/api/route` 400, `/api/events` 403 (auth-guarded, reachable), CORS allows `https://alabiq.com`, `app_users` empty, `app_sessions` 0.
- nginx NOT flipped — production still served by PM2 on 4000. Old Rizzkkk checkout MUST stay until cutover (it is the live site).

### Original implementation

- **bcrypt verify-shim (D2):** `backend/lib/passwords.js` + transparent rehash in `authController.login`; new dep `bcryptjs` (pure JS, safe for alpine builds). Tests in `test/passwords.test.js`.
- **ETL importer:** `backend/scripts/import-supabase.js` (`import` / `verify` / `cleanup`) + `backend/scripts/supabase-export.sql` (psql `\copy` generator). New dep `pg-copy-streams`. npm aliases `import:supabase*`.
- **Prod compose overlay:** `docker-compose.prod.yml` — publishes API as `127.0.0.1:4001:4000`; run with `-f docker-compose.yml -f docker-compose.prod.yml`.
- **Smoke-tested locally:** baseline migrations + seed on throwaway Postgres 16 → synthetic 5-user `auth_users.csv` + `profiles.csv`/`merchants.csv` → import, re-run (idempotent: 0 inserted), bcrypt verify on imported hash, banned→disabled mapping, live-traffic tripwire (refuses with 1 session row), cleanup. Full suite **217/217 green**.
