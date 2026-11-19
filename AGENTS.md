# AGENTS.md — Alabiq System Guide

> **Purpose:** single reference for AI coding sessions. Read this first; it replaces
> re-discovering the system from scratch. Update it when the system changes.
> Last global scan: **2026-11-19** · Branch at scan: `main` · **Full-Laravel
> takeover landed** — the repo root IS the Laravel 11 app; the Node `backend/`, React
> `frontend/`, Node realtime SSE service, and Capacitor mobile apps were removed
> (parked in `archive/full-laravel-migration/`, deleted in Phase 4). **Realtime is
> pusher.com** (`BROADCAST_CONNECTION=pusher`, `PUSHER_APP_*` in `.env`).
> **Production runs on Hostinger shared hosting** (Apache + MariaDB) — NOT the VPS;
> the VPS Docker stack is retired as the production host (see below and
> `DEPLOYMENT-PLAN.md` §10, 2026-11-19 entry).

---

## 1. What this is

**Alabiq** — multi-service logistics platform for **Saudi Arabia**. One codebase,
one driver fleet, three service lines:

1. **Pick & Drop** — airport transfers (original product)
2. **Food Delivery** — restaurant ordering within 15 km (live)
3. **Ecommerce** — partner-store goods (**feature-flagged off** by default via `SHOP_ENABLED`)

**Live (full-Laravel, since 2026-11-19):** `https://alabiq.yaramay.online` — Hostinger
**shared hosting** (`ssh -p 65002 u805024096@178.16.135.22`), docroot
`/home/u805024096/domains/alabiq.yaramay.online/public_html`. Deploy procedure:
`DEPLOYMENT-PLAN.md` §10 (2026-11-19 entry). The former production host — Hostinger VPS
`srv1777854` (`root@187.127.100.178`, Docker 29 + Compose v5, `alabiq.com` /
`api.alabiq.com`, Express-era) — is **no longer production**; its push-to-deploy
conduit is inactive.

---

## 2. Current architecture (as of 2026-11 — full-Laravel)

**The platform is now a single Laravel 11 application.** The Oct-2026 Express/React
stack (and everything Supabase-era before it) is archived, not deleted yet
(`archive/full-laravel-migration/`, removed in Phase 4). Anything describing
Express, React, SSE `/api/events`, or Supabase is **stale** — trust `DOCKER.md`,
`DEPLOYMENT-PLAN.md`, `PLAN-full-laravel.md`, and this file instead.

### Application stack (one codebase, two runtimes)

| Layer | Technology |
|---|---|
| Backend | **Laravel 11**, PHP 8.2+ (PSR-12, strict types where practical) |
| Web | **Blade** (public marketing site + admin portal) built by Vite + Tailwind 4 + Alpine.js; `routes/web.php` |
| API | `routes/api.php` — Sanctum tokens (default guard `api`), mirrors the old Express contracts |
| Auth | App-owned sessions + **scrypt** hashes via `App\Hashing\ScryptHasher`; `AppUser::getAuthPasswordName()` returns `password_hash`; roles resolved server-side from `profiles` + `ADMIN_EMAILS` |
| Realtime | **pusher.com** (`pusher/pusher-php-server`, `BROADCAST_CONNECTION=pusher`); the Node SSE service and `/api/events` endpoint were removed on `feat/full-laravel` |
| Maps | Mapbox (`MAPBOX_ACCESS_TOKEN`) |
| Payments | STC Pay manual bank transfer (live path, proof upload + admin verify); Tap Payments (env-gated) |
| Push | `minishlink/web-push` (VAPID keys) |
| Tests | PHPUnit 11 — Unit tests (pure logic) + Feature tests on a dedicated `alabiq_test` pgsql DB (auto-created by `tests/bootstrap.php`) |

- **Docker runtime** (local dev; formerly the VPS prod stack): PostgreSQL 16, Redis
  (cache/queue), MinIO (S3-compatible object storage), `queue-worker` +
  `scheduler` containers — `docker-compose.yml` at root, see `DOCKER.md`.
- **Shared-hosting runtime** (THE production host): Apache + **MariaDB** (no
  PostgreSQL/Redis/MinIO), PHP pinned to 8.4 (`SetHandler application/x-lsphp84` in
  `public/.htaccess`; CLI `/opt/alt/php84/usr/bin/php`), file cache/sessions, sync
  queue. `/api/health` returns **503 degraded there by design** (`db: connected`,
  `redis: error`).

### Production — shared hosting (live since 2026-11-19)

Hostinger shared hosting: `ssh -p 65002 u805024096@178.16.135.22`. **The app root IS
the domain docroot** `/home/u805024096/domains/alabiq.yaramay.online/public_html/`
(mirrors the repo 1:1 since the 2026-11-19 structural migration). Migrations are
driver-aware (pgsql-only statements skipped on mysql). Deploy = rsync the app root +
alt-php84 `composer install` + `artisan migrate/seed` + cache rebuild — full
procedure, ordering gotchas (storage dirs before `config:cache`), and HTTPS smoke
results: `DEPLOYMENT-PLAN.md` §10 (2026-11-19 PM entry is the current one).

**Known gaps on this host (accepted, 2026-11-19):** no Redis (degraded health by
design), no MinIO/S3, no SMTP, `SHOP_ENABLED=false`, payments controllers are
Phase-2.2 stubs, `PUSHER_APP_*` unset (broadcasting configured, not publishing).

### Deploy conduit — VPS push-to-deploy (**INACTIVE** since 2026-11-19)

Server bare repo `root@187.127.100.178:/opt/SmartMappiaa/smartmappiaa.git`, branch
`full` (**force-push** — unrelated histories) → `post-receive` →
`/opt/SmartMappiaa/deploy.sh`. Scripts live at `deploy/post-receive` +
`deploy/server-deploy.sh` (rewritten for full-Laravel 2026-11-19, but mothballed
with the VPS as production). Kept for rollback/reference only — production deploys
go through the shared-hosting procedure above. History: `DEPLOYMENT-PLAN.md` §10.

---

## 3. Repository layout

```
ALABIQ/                        ← git repo root = Laravel 11 app root (work here)
├── AGENTS.md                        ← this file (canonical system guide)
├── README.md                        ← repo landing / orientation
├── DEPLOYMENT-PLAN.md               ✅ topology, cutover, env plan, incident log
├── DOCKER.md                        ✅ current: full-Laravel Docker stack (local dev)
├── PLAN-full-laravel.md             ✅ migration plan + addenda (phases, risks)
├── .alabiq-server-credentials.env   SSH creds for prod VPS (git-excluded; never commit)
├── app/
│   ├── Console/  Jobs/  Support/    scheduled commands, queued jobs, helpers
│   ├── Exceptions/Handler.php
│   ├── Hashing/ScryptHasher.php     scrypt compatibility with legacy Node hashes
│   ├── Http/Controllers/            Admin/ AdminController AuthController AuthPageController
│   │                                BookingsController CardPaymentsController DriverController
│   │                                FilesController Food/ HealthController LocationsController
│   │                                MerchantController NotificationsController PageController
│   │                                Partner/ PaymentsController PaymentMethodsController
│   │                                PublicTrackingController RouteController Shop/ TrackingController
│   ├── Http/Middleware/             AppSessionGuard, RequireAdmin, RequireWebAdmin, FeatureFlag,
│   │                                FoodAuth, PartnerAuth, Idempotency, TrustProxy, rate limiters
│   ├── Models/                      Eloquent models (AppUser, Booking, Order, Merchant, …)
│   ├── Repositories/                data-access layer
│   └── Services/                    ★ business logic — FareService, FoodMoneyService,
│                                    ShopMoneyService, VatService, AppSessionsService,
│                                    EmailService, FileGrantsService, ObjectStorageService, TapService
├── bootstrap/app.php                Laravel 11 bootstrap (schedule via withSchedule,
│                                    #   commands via withCommands, broadcasting registered)
├── config/                          app, auth, alabiq, services (incl. `shop_enabled`),
│                                    #   broadcasting, caching, database, filesystems, mail,
│                                    #   queue, rate-limiter
├── database/
│   ├── migrations/                  25 migrations (mirror the archived Express schema)
│   └── seeders/                     Admin, ReferenceData, DatabaseSeeder
├── routes/
│   ├── api.php                      full API route map (mirrors old Express routes)
│   ├── web.php                      Blade site + admin portal routes
│   ├── channels.php                 pusher private-channel auth
│   └── console.php                  artisan commands
├── resources/views/                 site/ (marketing), admin/, auth/, layouts/
├── public/                          web root (index.php, built assets, .htaccess lsphp84 pin)
├── tests/                           Unit/ (pure logic) + Feature/ (pgsql `alabiq_test`);
│                                    bootstrap.php auto-creates the test DB
├── Dockerfile                       multi-stage: Vite build → php-fpm
├── docker-compose.yml               full local dev stack (DOCKER.md)
├── docker-entrypoint.sh  nginx/  postgres/  store-assets/
├── deploy/                          post-receive + server-deploy.sh — VPS push-to-deploy,
│                                    #   INACTIVE since prod moved to shared hosting (kept
│                                    #   for rollback/reference)
├── docs/                            partner-api-openapi.yaml
├── package.json / vite.config.js    Vite + Tailwind 4 + Alpine.js asset pipeline
└── archive/
    ├── full-laravel-migration/      old Express backend/ + React frontend/ (Phase 3
    │                                #   Blade-port reference; DELETE in Phase 4)
    ├── PROJECT-ANALYSIS-2026-10-06.md ⚠ pre-Docker analysis — historical only
    └── README-legacy-supabase.md    ⚠ pre-Docker install guide — historical only
```

**Deleted on `feat/full-laravel` (2026-11-19):** Node `backend/` (Express API, worker,
`migrations/postgres/`), React `frontend/` (incl. Capacitor mobile apps and the iOS CI
workflow), the Node `realtime/` SSE service, and `alabiq-web-main/` as a directory
(the Laravel app moved from `alabiq-web-main/laravel/` up to the repo root).

---

## 4. Hard invariants — do not break

1. **Strict layering, one direction:** `routes/` → `Http/Controllers/` → `Services/`
   (→ `Repositories/` for DB access). Controllers stay thin HTTP in/out; business
   logic lives in `app/Services/`. `config/` is the only place that reads `env()`.
2. **Money is sacred:** all fare/fee/margin/VAT math is server-side in
   `FareService`, `FoodMoneyService`, `ShopMoneyService`, `VatService` (+ ledger).
   Client-sent amounts are ignored.
3. **Auth:** scrypt password compatibility with legacy Node hashes is mandatory —
   `ScryptHasher` must match Node `scrypt` exactly (`Hash::check` verified).
   `AppUser::getAuthPasswordName()` = `password_hash`; the `web` session guard
   verifies scrypt hashes for the Blade admin portal; default guard stays `api`
   (Sanctum). Roles resolved server-side from `profiles` + `ADMIN_EMAILS` — never
   trust client-sent roles.
4. **Payments:** STC Pay proof upload → private bucket → manual admin verify.
   `AUTO_VERIFY_STCPAY_TEST_MODE` must be `false` in prod. Tap webhook is
   signature-checked with its own rate limit — do not remove the exemption.
5. **Feature flags:** `SHOP_ENABLED` → `config/services.php` `shop_enabled` gates
   shop routes on both web and API.
6. **Rate limiting:** general + auth limiters configured in `config/rate-limiter.php`;
   `TrustProxy` middleware is required behind nginx/Apache.
7. **Shared DB schema:** Laravel migrations must stay in sync with the archived
   Express schema (`archive/full-laravel-migration/backend/migrations/postgres/`)
   until Phase 4 deletes the archive.
8. **Driver-aware migrations:** no pgsql-only statements without a mysql guard —
   **production runs MariaDB** on the shared host.

---

## 5. Environment

### Laravel (`.env` at repo root)

`APP_KEY` · `APP_ENV` · `DB_CONNECTION` (`pgsql` in Docker dev; `mysql` on the
shared-hosting production) · `DB_HOST/DB_PORT/DB_DATABASE/DB_USERNAME/DB_PASSWORD` ·
`SESSION_DRIVER` · `CACHE_STORE` · `QUEUE_CONNECTION` · `BROADCAST_CONNECTION=pusher` ·
`PUSHER_APP_ID/KEY/SECRET/CLUSTER` · `MAPBOX_ACCESS_TOKEN` ·
`AWS_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET` (+ `AWS_USE_PATH_STYLE_ENDPOINT`)
· `MAIL_MAILER` + `MAIL_HOST/MAIL_PORT/MAIL_USERNAME/MAIL_PASSWORD/MAIL_FROM_ADDRESS` ·
`SMART_ALABIQ_STCPAY_NUMBER/NAME` · `AUTO_VERIFY_STCPAY_TEST_MODE` ·
`TAP_SECRET_KEY/TAP_PUBLIC_KEY/TAP_MERCHANT_ID` ·
`VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT` · `SHOP_ENABLED` · `ADMIN_EMAILS`

> ✅ `.env.example` exists at the repo root (restored 2026-11-19) — `cp .env.example .env`
> covers the compose-required `POSTGRES_PASSWORD` / `APP_DB_PASSWORD` /
> `MINIO_ROOT_PASSWORD` plus the Laravel keys above.

---

## 6. Commands

```bash
# Docker dev stack (full system: http://localhost:8080, alias 127.0.0.1:4001)
cp .env.example .env  # then set APP_KEY + the compose passwords (§5)
docker compose up --build
docker compose down          # keep data · add -v to ERASE db/redis/objects

# Laravel
composer install
php artisan key:generate
php artisan migrate --seed   # migrations + Admin/ReferenceData seeders
php artisan serve            # dev server (port 8000) — needs DB_* + SESSION_DRIVER=file
php artisan test             # PHPUnit — Unit + Feature (auto-creates alabiq_test DB)
php artisan route:clear      # after controller moves (stale routes-v*.php cache)
php artisan db:seed --class=AdminSeeder
vendor/bin/pint              # PSR-12 formatting

# Frontend assets (Vite — Blade layouts consume the build)
npm install
npm run dev                  # vite dev server
npm run build                # vite build → public/build

# Shared-hosting production deploy (summary — full procedure: DEPLOYMENT-PLAN.md §10)
rsync -az --delete --exclude='.env' --exclude='.env.*' --exclude='vendor/' \
  --exclude='node_modules/' --exclude='storage/' --exclude='archive/' \
  -e "ssh -p 65002" ./ u805024096@178.16.135.22:.../public_html/
ssh -p 65002 u805024096@178.16.135.22 \
  'cd .../public_html && COMPOSER_ALLOW_SUPERUSER=1 /opt/alt/php84/usr/bin/php \
   /usr/local/bin/composer install --no-dev --optimize-autoloader \
   --ignore-platform-req=ext-pdo_pgsql --ignore-platform-req=ext-redis \
   && /opt/alt/php84/usr/bin/php artisan migrate --force'
```

**Historical (archived Express/React stack — reference only, do not run):**
`backend/` used `npm run dev|test|db:migrate`, `frontend/` used `npm run dev|build|mobile:sync`.
The old checkout layout, topology, and cutover procedure are in `DEPLOYMENT-PLAN.md` §10.

---

## 7. Git & branches

- Remotes: `origin` = `git@github.com:renitreni/alabiq.git` (canonical since the
  2026-11-13 rebrand). The old PAT-bearing remotes are gone from this clone.
- Deploy conduit (VPS): server bare repo `root@187.127.100.178:/opt/SmartMappiaa/smartmappiaa.git`,
  branch `full` (**force-push** — unrelated histories) → `post-receive` →
  `/opt/SmartMappiaa/deploy.sh`; scripts at `deploy/`. **Inactive since 2026-11-19** —
  production moved to shared hosting (deploy = rsync + artisan, §6). Kept for
  rollback/reference.
- Active branch: **`main`** — `feat/full-laravel` was fast-forwarded into it on
  2026-11-19 (`aafc3d3..cb13510`) and deleted after the merge; only `main` remains:
  - `7b74221 refactor!: full-Laravel takeover — laravel/ moves to app root, Node backend + React frontend archived`
  - `175fa11 feat!: pusher.com realtime replaces Node SSE service; mobile implementation removed`
  - `f4a7f03 fix(shared-hosting): close schema gaps and pgsql-only queries for MariaDB deploy`
  - `8378ca0 docs(deploy): shared-hosting redeploy entry — full-Laravel structure, pusher, HTTPS smoke`
  Earlier history (merged to `main`): Laravel Phase A–D (models, migrations,
  middleware, money services, 97 unit tests), one-restaurant-one-app customer PWA,
  restaurant-delivery API, Phase 7 partner item-pricing, full Alabiq rebrand.

---

## 8. Known gaps & risks

**From `PLAN-full-laravel.md` (current truth):**

1. **Phase 2.2 dispatch parity pending:** `driver_locations` and `dispatch_offers`
   (live GPS fixes, driver offer fan-out) have **no Laravel migration/mirror** — they
   were Express-only. Porting them belongs to Phase 2.2.
2. **Phase 3 portal long tail:** the public site + admin portal are ported to Blade,
   but the customer/driver/merchant React portals (28.5k+ lines of JSX) are not —
   that is the real remaining cost. Pusher **private-channel auth wiring ships with
   the Phase 3 portal** — broadcasting scaffolding is registered, but client
   subscription/auth is not done.
3. **Phase 4 cutover & cleanup:** archive deletion (`archive/full-laravel-migration/`),
   final cutover validation, env/docs sweep.
4. **Feature tests require PostgreSQL** — they create/use the `alabiq_test` DB;
   SQLite is not the test path.
5. No frontend e2e tests; no staging env (dev → shared-hosting prod directly).
6. **Production runs MariaDB** — every migration/query addition needs a
   driver-awareness check (see invariant 8).
7. `AUTO_VERIFY_STCPAY_TEST_MODE` foot-gun (see §4).
8. **Production host constraints (accepted, documented in DEPLOYMENT-PLAN §10):**
   no Redis/MinIO/SMTP on shared hosting, `SHOP_ENABLED=false`, `PUSHER_APP_*`
   unset — closing these is a deliberate ops decision, not drift.

**Historical (resolved or archived with the Express stack):** multi-table writes
without transactions, doc drift around Supabase, `mapbox-gl` unused dep, missing
frontend 404 catch-all, `/admin/ferdz` demo route — all Express/React-era; verify
against current code before re-raising.

---

## 9. Working agreements for AI sessions

- Work at the **repo root** — it is the Laravel app; there is no `alabiq-web-main/`
  or `laravel/` subdirectory anymore.
- **Never** SSH to production (shared host or VPS) or touch live pages unless the
  owner explicitly asks.
- Targeted edits only; match existing naming/structure; no new dependencies or
  architecture changes without asking.
- **Backend:** PHP 8.2+, PSR-12, strict types where practical (run `vendor/bin/pint`
  on edited files). Blade + Tailwind 4 for web UI; Alpine.js for sprinkles.
- Run `php artisan test` after changing controllers/services/migrations; run
  `php -l` on edited files as a fast gate.
- Keep `routes/api.php` in sync with the archived Express route contracts; keep
  migrations driver-aware (pgsql + mysql) — **prod is MariaDB**.
- Docker-aware (dev stack): persistent volumes (`postgres_data`, `redis_data`,
  `object_data`), no extra host port bindings (neighbors share the box).
- After controller moves: `php artisan route:clear` (stale `routes-v*.php` cache
  breaks `route:list` and named-route resolution).
- When changing architecture, env vars, or deployment: **update this file** (and
  `DOCKER.md` / `DEPLOYMENT-PLAN.md` / `PLAN-full-laravel.md` where relevant) in the
  same change.

### Blade web layer (Phase 3, started 2026-11-19)

The Laravel app serves a Blade port of the archived React frontend (source of truth
for markup/copy: `archive/full-laravel-migration/frontend/`):

- **Public marketing site** — `routes/web.php` → `PageController`: `/` (landing with
  live merchant data from the `merchants`/`merchant_hours`/`app_settings` tables),
  `/services` + 3 subpages, `/support`, `/help-center`, and the legal pages
  (`/privacy-policy`, `/terms-of-service`, `/cookie-preferences`, `/account-deletion`).
  Views: `resources/views/site/`, layout `resources/views/layouts/site.blade.php`.
  Plus `/demo/restaurant` (2026-11-19) — unlisted sales demo of the
  one-restaurant customer app: fixture-only menu (no DB reads/writes) served
  by `PageController::demoRestaurant`, cart is in-memory Alpine state, checkout
  disabled. Blade port of the archived React `/demo/restaurant` page.
- **Admin portal** — session-guard login at `/login` (`AuthPageController`), then
  `/admin*` behind the `admin.web` middleware (`RequireWebAdmin`, redirects guests
  to `/login`). `Admin\PagesController` renders dashboard, bookings, drivers
  (approve/reject POST implemented — mirrors Express `setDriverApproval`),
  restaurant-orders, food, shop (gated on `services.shop_enabled`), reports
  (+CSV export), errors, admins, accounts, integrations, settings (writes
  `app_settings`, pgsql jsonb-cast / MySQL-portable). Views: `resources/views/admin/`,
  layout `resources/views/layouts/admin.blade.php`.
- **Auth wiring:** `AppUser::getAuthPasswordName()` returns `password_hash` so the
  `web` session guard verifies against scrypt hashes; the default guard stays `api`.
  Global exception renderables in `bootstrap/app.php` only answer JSON when
  `$request->expectsJson()` — web requests get Laravel's default redirects/pages.
- **Not ported (deliberately):** payment proof verify/reject and other money-moving
  admin actions were gated until payments-lib parity — verify current status in
  `routes/web.php` before assuming. The customer/driver/merchant React portals are
  not part of this pass (see risk 2).
- Host-side `.env` needs `DB_*` (127.0.0.1, `alabiq_app`), `SESSION_DRIVER=file`,
  `CACHE_STORE=file` to run `php artisan serve` outside Docker.

---

## 10. Doc map (what to read for what)

| Need | Read |
|---|---|
| Current system truth | this file → `DOCKER.md` |
| Repo landing / orientation | `README.md` |
| Prod topology, cutover, incidents, deploy procedure | `DEPLOYMENT-PLAN.md` (§10 log — 2026-11-19 entry is the live one) |
| Migration plan, phases, risks, addenda | `PLAN-full-laravel.md` |
| Historical pre-Docker analysis | `archive/PROJECT-ANALYSIS-2026-10-06.md` (⚠ historical only) |
| Historical pre-Docker install guide | `archive/README-legacy-supabase.md` (⚠ historical only) |
| Old Express/React source (Blade-port reference) | `archive/full-laravel-migration/{backend,frontend}/` |
| API contract reference | `routes/api.php`, `docs/partner-api-openapi.yaml` |
| Env var reference | `.env.example`, `config/*.php` |
