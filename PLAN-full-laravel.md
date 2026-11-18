# Plan — Full Laravel Takeover (structure change + Blade frontend)

**Goal:** `alabiq-web-main/laravel/` becomes the single application at `alabiq-web-main/` root. Node/Express `backend/` and React `frontend/` are removed. The React UI is rebuilt as Blade views. One full-Laravel Docker stack.

**Branch:** `feat/full-laravel` (off `main`, with the pending WIP committed first — the rate-limiter fix in `RouteServiceProvider` and middleware aliases in `bootstrap/app.php` are needed).

---

## Assumptions (settled — correct me at review if any is wrong)

1. **A1 — Landing spot:** Laravel contents move up **one level** (`alabiq-web-main/laravel/*` → `alabiq-web-main/*`), not to the `ALABIQ` repo root. This keeps live deploy paths (`/opt/SmartMappiaa/alabiq-docker`, compose at `alabiq-web-main/`) valid.
2. **A2 — Blade stack:** Blade + Alpine.js + Laravel's built-in Vite asset pipeline. No Livewire/Inertia initially (no new deps without sign-off; Alpine covers portal interactivity, Google Maps JS SDK covers map screens server-proxied as today).
3. **A3 — API preserved:** `/api/*` contract stays byte-compatible for Capacitor mobile apps + partner integrations. Node services are only removed once Laravel reaches parity.
4. **A4 — Realtime (AMENDED 2026-11-19):** **pusher.com now.** The Node `realtime` container is removed (service dir deleted, SSE `/api/events` endpoint and controller removed, nginx SSE block removed); `pusher/pusher-php-server` installed, `config/broadcasting.php` + `routes/channels.php` registered via `withBroadcasting()`. Private-channel auth wiring ships with the Phase 3 portal. (Supersedes the original "keep realtime until Reverb" plan.)
5. **A5 — Mobile (AMENDED 2026-11-19):** **mobile implementation removed entirely** — the Capacitor `mobile/` dir (extracted from `frontend/`) and the `ios-build.yml` workflow are deleted. No mobile target in the full-Laravel repo. (Supersedes the original extraction plan.)
6. **A6 — No prod touch:** all work local; deploy only when explicitly asked (per AGENTS.md §9).

## Current state (verified 2026-11-18)

- **Laravel:** 26 controller files — 8 still return 501 stubs (`PaymentsController`, `DriverController` (6 methods), `CardPaymentsController`, `MerchantController` (13 methods), `Shop/OrdersController`, `Partner/DeliveriesController` (15 methods), `Food/OrdersController`, `PaymentMethodsController`). No `resources/` dir → no views, no `web.php` (`routes/` has only `api.php` + `console.php`). Console commands `dispatch:sweep`, `food:remind-preparing`, `shop:check-stale` are placeholders.
- **Migrations drift (verified):** Express `0001–0012` vs Laravel's 20 base tables. **Already covered:** 0011 `delivery_quotes.distance_km` (`..._000017:65`), 0012 `merchants.public_hash`/`brand_color` (`..._000003:41-51`, in `Merchant::$fillable`). **Still missing:** the `orders` partner columns from 0008/0010 (`source`, `external_order_id`, `payment_collection`, `idempotency_response_encrypted`, `tracking_token_hash`, `tracking_token_expires_at`, `tracking_token_revoked_at` — `..._000006` has none), the `partner_idempotency_keys` table, the `driver_location_history` table (0009), and 0009's extra `background_jobs` claim/lease indexes. Do **not** blind-port 0008–0012 — that would double-create `delivery_quotes`, `background_jobs`, and the merchants columns.
- **Frontend:** 156 JSX files, ~28.5k lines in `src/portal` alone + ~16 marketing section components + legal/support pages.
- **Docker:** `laravel/docker-compose.laravel.yml` already defines Laravel replacements for migrate/seed/api/worker (zeroes the Node replicas). To be folded into one compose file, not an overlay.
- **CI:** `.github/workflows/ios-build.yml` paths point at `alabiq-web-main/frontend` — must be updated before/with the move.

## Target structure (after Phase 1)

```
alabiq-web-main/            ← Laravel app root
├── app/  bootstrap/  config/  database/  routes/  tests/
├── resources/              ← NEW: views/, js/, css/ (Blade port lands here)
├── public/                 ← index.php + Vite build output
├── docker-compose.yml      ← single full-Laravel stack
├── Dockerfile              ← multi-stage: node (Vite) → php-fpm
├── nginx/  docker-entrypoint.sh
├── postgres/  realtime/  store-assets/  docs/   ← kept
└── mobile/                 ← NEW: extracted Capacitor android/ios projects
ALABIQ/ (repo root)
├── AGENTS.md / DOCKER.md / DEPLOYMENT-PLAN.md   ← updated
└── archive/full-laravel-migration/              ← backend/ + frontend/ parked here, deleted in Phase 4
```

---

## Phase 0 — Prep (~30 min)

1. Commit the pending Laravel WIP (rate-limiter fix, middleware aliases) on `main`, then cut `feat/full-laravel`.
2. Extract mobile: move `frontend/android`, `frontend/ios`, `capacitor.config.ts|json`, any native assets → `alabiq-web-main/mobile/`; adjust `webDir` to `../public/build` (or keep a small sync script).
3. Tag a rollback point (annotated git tag `pre-full-laravel`).

## Phase 1 — Structural move, no behavior change (~1 day)

1. `git mv laravel/* alabiq-web-main/` root (artisan, app, bootstrap, config, database, public, routes, tests, composer.*, Dockerfile, nginx/, docker-entrypoint.sh, phpunit.xml, .env.example...). Merge `.gitignore`s; fold `laravel/.env.example` + `.env.testing` into the app root.
2. Park `backend/` + `frontend/` → `archive/full-laravel-migration/` (kept as reference for the Blade port; deleted in Phase 4). Remove now-stale root files: old `docker-compose.yml` Node services, `docker-compose.prod.yml`, `docker-compose.laravel.yml`, `.env.docker.example` (rewrite as single `.env.example`), `backend/`+`frontend/` dirs, `api/index.js`-era vercel refs.
3. Rewrite **one** `docker-compose.yml`: `postgres`, `redis`, `minio`, `realtime` (kept), `migrate` (`artisan migrate --force`), `seed-reference` (`db:seed --class=ReferenceDataSeeder`), `app` (php-fpm+nginx serving web+API on `${WEB_PORT:-8080}`, internal 9000), `queue-worker` (`artisan queue:work`), `scheduler` (`artisan schedule:work`). Same resource limits/healthchecks as the overlay; host publish `127.0.0.1:4001:9000` preserved for the SSE/nginx block.
4. `Dockerfile` → multi-stage: `node:20-alpine` builds Vite assets (`npm ci && npm run build`) → copied into the php-fpm image; `docker-entrypoint.sh` re-enables `view:cache` (delete the "no view:cache" comment); nginx `default.conf` gets a proper `location / { try_files $uri $uri/ /index.php?$query_string; }` for web routes, static asset caching for `build/`, and keeps the SSE-safe `/api/events` block.
5. Update `.github/workflows/ios-build.yml` paths (`frontend/**` → `mobile/**`; `working-directory`, cache paths; `mobile:sync` step repointed).
6. **Gate:** `docker compose up -d --build` full stack green; `php artisan test` (102 tests, 6 files) passing; `health:check` OK; API smoke test against `/api/health` + one authed endpoint.

## Phase 2 — Backend parity before Node dies (~multi-day, sized during execution)

1. Port the **missing deltas only** → new Laravel migrations (driver-aware, mysql-safe per the shared-hosting constraint): `orders` partner columns (`source`, `external_order_id`, `payment_collection`, `idempotency_response_encrypted`, `tracking_token_hash`/`expires_at`/`revoked_at` from 0008/0010), `partner_idempotency_keys` table, `driver_location_history` table + 0009 `background_jobs` claim/lease indexes. (0011/0012 already exist — see Current state.)
2. Implement the 8 stub controllers to Express parity, route-by-route: diff `routes/api.php` vs `backend/routes/` handlers and port logic from `backend/lib/` (fare, foodMoney, shopMoney, vat, ledger, dispatch, payments/STC Pay, tap, savedCards, webPush...).
3. Fill in real console commands: `dispatch:sweep`, `food:remind-preparing`, `shop:check-stale` (logic sources: `backend/lib/dispatch.js`, worker sweepers).
4. Contract harness: PHPUnit feature tests hitting each `/api/*` route family, asserting response shapes match the Express versions (mobile apps are the canary). Include feature-flag behavior (`SHOP_ENABLED`/`FEATURE_SHOP_ENABLED`) and idempotency middleware parity.
5. **Gate:** full route family checklist green in Docker; only then are the Node services permanently removed from compose.

## Phase 3 — Blade conversion (~weeks; the long tail — page by page)

1. Scaffold `resources/`: `views/layouts/` (marketing, portal, admin), `views/components/` (Blade components mirroring the React UI kit: buttons, cards, modals, LocationPicker...), `js/app.js` (Alpine), `css/`. Tailwind 4 via Vite to match current styling.
2. Add `routes/web.php` + Web controllers; reuse `AppSessionGuard` as the web guard (cookie-based, same `app_sessions` table — no auth migration).
3. Conversion order (each: Blade view + web controller + feature test + visual check):
   1. Marketing site (sections, services, support, legal)
   2. Auth screens (23 files)
   3. User portal (home, book, pay, track, profile, transactions — map screens via Google Maps JS SDK)
   4. Food/Shop storefronts (incl. `/app/:hash` restaurant PWA manifest + brand_color)
   5. Merchant dashboards
   6. Driver app (dispatch screen = SSE consumer)
   7. Admin (17 files)
4. Decision needed mid-phase: keep React app reachable under a legacy path/subdomain during transition, or hard cut per area (recommend: hard cut per area, behind a config flag).
5. Demo pages (`/demo/*`, `/admin/ferdz`) — port or drop; flag the foot-gun from AGENTS.md §8.5.

## Phase 4 — Cutover & cleanup (~1 day + deploy)

1. Remove archived `backend/`+`frontend/` from the repo; remove Node `realtime` only if Reverb/SSE-fallback decision is made (default: keep).
2. Update `AGENTS.md`, `DOCKER.md`, `DEPLOYMENT-PLAN.md`, root `README.md`; env var docs now Laravel-only.
3. Deploy-procedure updates for the VPS (build contexts changed; `deploy/server-deploy.sh` references old paths) — **execute only when the owner asks**.
4. Final verification: full stack from clean clone; `php artisan test`; route checklist; mobile `mobile:sync` smoke.

## Addendum — discovered during Phase 1/2.1 execution (2026-11-19)

- **Baseline-schema gaps beyond 0008–0012:** the Express 0001 schema has tables with **no Laravel mirror at all** — `driver_locations` (live GPS fixes, PG fallback for dispatch) and `dispatch_offers` (driver offer fan-out). Porting these belongs to Phase 2.2 (dispatch parity), tracked here so it isn't lost.
- **Executed deviations from this plan:** (1) the multi-stage Vite Dockerfile + Blade scaffold landed in Phase 1 instead of Phase 3 so the stack serves web+API from one container set and `mobile/` cap-sync has a web build; (2) the dead custom `app/Console/Kernel.php` was removed — its schedule moved to `bootstrap/app.php` `withSchedule()` and console routes load via `withCommands()` (Laravel 11); (3) local dev DB was **baselined** (all 24 migration names marked applied) because the volume was already migrated by Express 0001–0012 — the 4 delta migrations run for real only on fresh databases; (4) feature tests now run on a dedicated `alabiq_test` pgsql DB (auto-created by `tests/bootstrap.php`) instead of the unrunnable sqlite config.
- **Fixes found along the way:** `AppUserFactory` used `bcrypt()` which the custom ScryptHasher binding breaks (now `Hash::make`); `AppSession` model had Eloquent timestamps on for a table with no `updated_at` (now `$timestamps = false`).
- **2026-11-19 amendments (owner decision):** A4 realtime is **pusher.com now** — Node `realtime` service fully removed (dir, compose service, `/api/events` SSE controller+route, nginx SSE block); pusher package + broadcasting config + empty `routes/channels.php` in place. A5 mobile is **removed entirely** — `mobile/` and `ios-build.yml` deleted.

## Risks

- **R1 — Scope:** 28.5k+ lines of portal JSX is the real cost; structure move (Phases 0–1) is cheap and independent — land it first.
- **R2 — Auth/session:** web guard must share `app_sessions` semantics (idle/absolute expiry) or users get logged out differently between web and mobile.
- **R3 — SSE:** `/api/events` must survive nginx buffering configs in the new unified nginx; driver dispatch depends on it.
- **R4 — Schema drift:** shared-hosting MariaDB target means new migrations must stay driver-aware (per 2026-11-18 DEPLOYMENT-PLAN entry).
- **R5 — CI:** iOS build breaks the moment `frontend/` is deleted unless Phase 1 step 5 lands in the same commit.
