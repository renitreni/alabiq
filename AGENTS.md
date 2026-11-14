# AGENTS.md — Alabiq System Guide

> **Purpose:** single reference for AI coding sessions. Read this first; it replaces
> re-discovering the system from scratch. Update it when the system changes.
> Last global scan: **2026-11-12** · Branch at scan: `feat-fix-restaurant-orders` (clean tree)

---

## 1. What this is

**Alabiq** — multi-service logistics platform for **Saudi Arabia**. One codebase,
one driver fleet, three service lines:

1. **Pick & Drop** — airport transfers (original product)
2. **Food Delivery** — restaurant ordering within 15 km (live)
3. **Ecommerce** — partner-store goods (**feature-flagged off** by default via `SHOP_ENABLED`)

Live: `https://alabiq.com` + `https://api.alabiq.com`
Server: Hostinger VPS `srv1777854` (`root@187.127.100.178`, Ubuntu, Docker 29 + Compose v5).

---

## 2. Current architecture (as of 2026-11 — post-Supabase)

**The platform migrated OFF Supabase in Oct 2026.** Production is now a self-contained
Docker stack. Anything still describing Supabase (`archive/README-legacy-supabase.md`,
parts of `backend/README.md`, `archive/PROJECT-ANALYSIS-2026-10-06.md`) is **stale** —
trust `DOCKER.md`, `DEPLOYMENT-PLAN.md`, and this file instead.

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8 (rolldown), Tailwind 4, React Router 7, shadcn-style (radix-slot + CVA + tailwind-merge), framer-motion, sweetalert2, lucide-react |
| Mobile | Capacitor 8 — Android (appId `com.alabiq`) + iOS; native geolocation plugin |
| Backend | Node ≥ 20, Express 4, **plain JS CommonJS, no build step** |
| Data | **PostgreSQL 16** (Docker) via `pg` + `pg-copy-streams`; app-owned auth (`app_users`, scrypt hashes, `app_sessions` in Postgres) |
| Realtime | Dedicated `realtime` container (Node + Redis pub/sub, port 4100 internal); clients consume **SSE via `/api/events`** |
| Object storage | **MinIO** (S3-compatible, via `@aws-sdk/client-s3`) — payment proofs (private), merchant images, driver docs, avatars |
| Maps | Google Maps Platform (browser key; Routes/Places/Geocoding proxied server-side). `mapbox-gl` still a declared dep — cleanup debt |
| Payments | STC Pay manual bank transfer (live path, proof upload + admin verify); Tap Payments (env-gated, off by default) |
| Mail | SMTP via nodemailer (password reset) |
| Push | web-push (VAPID keys) |
| CI | GitHub Actions: unsigned iOS simulator build (`.github/workflows/ios-build.yml`) |
| Legacy | PM2 process `alabiq-api` on `127.0.0.1:4000` kept for rollback only |

### Production topology (DEPLOYMENT-PLAN.md §5 + 2026-11-13 entry — the current truth)

```
alabiq.yaramay.online → nginx static dist (/var/www/alabiq, copied from the frontend image)
                      /api/ → nginx → 127.0.0.1:4001 (docker api)   [SSE-safe /api/events block kept]
live checkout:  /opt/SmartMappiaa/alabiq-docker  (compose at alabiq-web-main/, project pinned: -p smartmappia-web-main)
old checkout:  /opt/SmartMappiaa/smartmappiaa-docker  (kept as rollback, do not delete)
compose network      → postgres, redis, minio, realtime, api, worker  [private, no host ports]
```

⚠ Production DB roles still use the **old names** (`smartmappia` / `smartmappia_app` / db `smartmappia`) — pinned in the live checkout's `.env`. Deploy = force-push branch to the server bare repo + `git reset --hard` + rebuild; full procedure in DEPLOYMENT-PLAN.md (2026-11-13 entry).

---

## 3. Repository layout

```
ALABIQ/                        ← git repo root (work here)
├── AGENTS.md                        ← this file (canonical system guide)
├── README.md                        ← new landing page pointing here
├── archive/                         stale docs moved here 2026-11-12:
│   ├── README-legacy-supabase.md    ⚠ pre-Docker install guide — historical only
│   └── PROJECT-ANALYSIS-2026-10-06.md ⚠ pre-migration analysis — historical only
├── DEPLOYMENT-PLAN.md               ✅ current: cutover plan, topology, env plan, incident log
├── .alabiq-server-credentials.env   SSH creds for prod VPS (git-excluded; never commit)
├── ALABIQ-backup-*.bundle     71 MB git bundle backup (gitignored)
├── .tmp-server-src/                 ad-hoc copies of FoodAdmin.jsx / ShopAdmin.jsx (Oct 28)
└── alabiq-web-main/            ← the actual application
    ├── docker-compose.yml           full dev stack; publishes api 127.0.0.1:4001:4000
    ├── docker-compose.prod.yml      prod overlay (same port mapping; no frontend container)
    ├── DOCKER.md                    ✅ current: stack description + migration status
    ├── .env.docker.example          compose vars (Postgres, MinIO, realtime token)
    ├── postgres/init/               creates alabiq_app role
    ├── realtime/                    standalone SSE/realtime service (Node, Redis-backed)
    ├── store-assets/
    ├── backend/
    │   ├── server.js                entry: dotenv → app.listen + dispatch sweeper
    │   ├── app.js                   helmet/CORS/rate-limit + 16 route mounts
    │   ├── api/index.js             serverless (Vercel) entry — legacy, app.js shared
    │   ├── routes/        (16)      auth, bookings, driver, food, shop, payments, files, events…
    │   ├── controllers/   (~25)     thin HTTP in/out; food/ and shop/ subdirs
    │   ├── repositories/  (~25)     ★ data-access layer (newer than old docs reflect)
    │   ├── lib/           (49)      business logic: fare, foodMoney, shopMoney, money, vat,
    │   │                            #   ledger (double-entry), dispatch, eta, geo, googleRoutes,
    │   │                            #   payments, tap, savedCards, stock, merchantHours, webPush…
    │   ├── middleware/    (4)       auth guards, foodAuth, idempotency, rateLimiters
    │   ├── migrations/postgres/     ✅ tracked baseline 0001–0007 (0005 = auth_sessions)
    │   ├── migrations/reconstructed/ ⚠ old Supabase-era SQL, reference only
    │   ├── scripts/                 seeds, checks, demo simulators, supabase import ETL
    │   └── test/          (49)      node:test unit tests (money, fare, vat, repos…)
    └── frontend/
        ├── src/main.jsx             all route definitions
        ├── src/App.jsx              marketing landing
        ├── src/sections/ pages/ components/   public site
        └── src/portal/              authenticated app
            ├── auth/ (23)           login, signup, forgot/reset, mobile variants
            ├── user/ (8)            home, book, pay, track, profile, transactions…
            ├── driver/ (3)          dispatch, driver page, verification
            ├── merchant/ (6)        food + shop merchant dashboards/orders
            ├── admin/ (17)          layout, dashboard, bookings, drivers, food/shop admin,
            │                      #   accounts, reports, errors, settings, RestaurantOrders
            ├── food/ (8)  shop/ (6)
            ├── demo/                demo pages (incl. /admin/ferdz)
            ├── components/ (22)     LocationPicker, NotificationBell…
            └── lib/ (28)            AuthProvider, api client, gatewayClient, geo, sessionStore…
```

---

## 4. Hard invariants — do not break

1. **Strict layering, one direction:** `routes/` → `controllers/` → `lib/` (→ `repositories/`
   for DB access). Controllers never hold business logic; `lib/config.js` is the only file
   allowed to read `process.env`.
2. **Money is sacred:** all fare/fee/margin/VAT math is server-side in `lib/` (`fare.js`,
   `foodMoney.js`, `shopMoney.js`, `money.js`, `vat.js`, `ledger.js` double-entry,
   `merchantCredit`-style modules). Client amounts are ignored.
3. **No multi-table transactions:** concurrency is arbitrated by unique indexes +
   compare-and-swap. Moving multi-writes into Postgres RPCs is the known top integrity fix.
4. **Auth:** app-owned sessions in Postgres (`app_sessions`). Roles resolved server-side
   from `profiles` + `ADMIN_EMAILS` — never trust client-sent roles.
5. **Payments:** STC Pay proof upload → private bucket → manual admin verify.
   `AUTO_VERIFY_STCPAY_TEST_MODE` must be `false` in prod (boot warning if on).
   Tap webhook (`/api/payments/webhooks/tap`) is exempt from the general rate limiter
   (signature-checked, own limiter — do not remove the skip).
6. **Feature flags:** `SHOP_ENABLED` gates shop routes on **both** backend and frontend.
7. **Rate limiting:** general 240/min (map-heavy screens legitimately burst), auth 20/min.
   `trust proxy = 1` — required behind nginx.

---

## 5. Environment

### Backend (`alabiq-web-main/backend/.env`)

`DATABASE_URL` · `APP_SIGNING_KEY` · `SMTP_HOST/USER/PASSWORD` · `MAIL_FROM` ·
`CORS_ORIGINS` (comma-separated allow-list; empty = loud warning + permissive pilot) ·
`AUTO_VERIFY_STCPAY_TEST_MODE` · `SMART_ALABIQ_STCPAY_NUMBER` · `ADMIN_EMAILS` ·
`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` · `MAPBOX_ACCESS_TOKEN`

### Frontend (`alabiq-web-main/frontend/.env`)

`VITE_API_BASE` · `VITE_MAP_PROVIDER` (google) · `VITE_GOOGLE_MAPS_BROWSER_KEY` ·
`VITE_GOOGLE_MAP_ID` · `VITE_MAPBOX_ACCESS_TOKEN` · `VITE_MAPBOX_STYLE`

### Compose (repo `alabiq-web-main/.env`, from `.env.docker.example`)

`POSTGRES_DB/USER/PASSWORD` · `APP_DB_USER/PASSWORD` · `REALTIME_PUBLISH_TOKEN` ·
`MINIO_ROOT_USER/PASSWORD` · `WEB_PORT` (default 8080)

---

## 6. Commands

```bash
# Docker dev stack (full system: http://localhost:8080)
cd alabiq-web-main && cp .env.docker.example .env && cp backend/.env.example backend/.env
docker compose up --build
docker compose down          # keep data · add -v to ERASE db/redis/objects

# Backend (standalone, needs DATABASE_URL + deps)
cd alabiq-web-main/backend
npm run dev                  # node --watch server.js
npm test                     # node --test (358 tests incl. syntax gate)
npm run db:migrate           # node scripts/migrate.js

# Frontend
cd alabiq-web-main/frontend
npm run dev                  # vite
npm run build                # vite build → dist/
npm run mobile:sync          # build + cap sync (Android/iOS)

# Useful backend scripts
npm run seed:admin / seed:super-admin / set:password
npm run import:supabase / :verify / :cleanup    # legacy Supabase → Postgres ETL
npm run migrate:media-urls:apply                 # rewrite stored media URLs
npm run reset:orders · delete:account
```

---

## 7. Git & branches

- Remotes: `origin` = `git@github.com:renitreni/alabiq.git` (canonical since the
  2026-11-13 rebrand; history is unrelated to the old SmartMappiaa repos). The
  old PAT-bearing remotes are gone from this clone.
- Deploy conduit: server bare repo `root@187.127.100.178:/opt/SmartMappiaa/smartmappiaa.git`,
  branch `full` (**force-push** — unrelated histories), consumed by the live
  checkout per DEPLOYMENT-PLAN.md (2026-11-13 entry). **Push-to-deploy is live
  (2026-11-14):** any push to `full` fires the bare repo's `post-receive` hook →
  `/opt/SmartMappiaa/deploy.sh` (build api/worker/migrate/frontend, migrate, up -d,
  health-check, swap `/var/www/alabiq`). Scripts: `deploy/post-receive` +
  `deploy/server-deploy.sh`; log: `/var/log/alabiq-deploy.log`.
- Active branches: `feat-restaurant-delivery-api` (current), `main`.
- Recent work: Phase 7 (2026-11-13) — partner item-pricing validation +
  migrations 0010–0011, `payment_method 'external'`, `delivery_quotes.distance_km`,
  worker service enabled (Redis GPS hot path), full Alabiq rebrand
  (web/Android/iOS). Also fixed: truncated `deliveriesController.js` (API boot
  crash, now covered by `test/syntaxGate.test.js`), worker webhook import bug,
  undeclared `redis` dependency.

---

## 8. Known gaps & risks (carry-over, verified where noted)

1. Multi-table writes without transactions (crash = corruption window).
2. Test coverage is backend-unit only; no frontend/e2e tests.
3. **Doc drift (partially resolved 2026-11-12):** stale Supabase-era root `README.md` and
   `PROJECT-ANALYSIS.md` were moved to `archive/`. Still open: `backend/README.md`
   (Supabase/SQLite-session era) needs a refresh.
4. `mapbox-gl` dependency unused (Google is the provider); `api/index.js` + `vercel.json` legacy.
5. `/admin/ferdz` demo route in the prod route table — ensure it's protected/disabled.
6. `AUTO_VERIFY_STCPAY_TEST_MODE` foot-gun (see §4).
7. No frontend 404 catch-all (unknown routes render blank).
8. No staging env — dev → prod VPS directly.
9. Root `.gitignore` doesn't cover `.env*` broadly; credentials safety relies on
   `.git/info/exclude` (machine-local) for some files.
10. Server credentials file + token-bearing remote live in the working tree — never
    commit, rotate the exposed PAT.

---

## 9. Working agreements for AI sessions

- Work in `alabiq-web-main/`; the repo root holds docs/backups only.
- **Never** SSH to the prod VPS or touch live pages unless the owner explicitly asks.
- Targeted edits only; match existing naming/structure; no new dependencies without asking.
- Backend: CommonJS, no build step, no TypeScript. Frontend: ESM + JSX.
- Run `npm test` in `backend/` after changing money/auth/dispatch/repository logic.
- Docker-aware: file permissions, volume mounts (`postgres_data`, `redis_data`,
  `object_data` are persistent), no extra host port bindings (neighbors share the box).
- When changing architecture, env vars, or deployment: **update this file** (and DOCKER.md /
  DEPLOYMENT-PLAN.md where relevant) in the same change.

---

## 10. Doc map (what to read for what)

| Need | Read |
|---|---|
| Current system truth | this file → `alabiq-web-main/DOCKER.md` |
| Repo landing / orientation | `README.md` |
| Prod topology, cutover, incidents | `DEPLOYMENT-PLAN.md` (§1 layout, §5 topology, §10 log) |
| Historical pre-Docker analysis | `archive/` (⚠ both files predate the Docker migration) |
| Backend endpoint/auth details | `alabiq-web-main/backend/README.md` (⚠ partially stale) |
| Env var reference | `backend/.env.example`, `frontend/.env.example`, `.env.docker.example` |
