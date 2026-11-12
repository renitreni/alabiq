# Alabiq — Project Analysis

Date: 2026-10-06 · Source: `~/www/SmartMappiaa` (copied into workspace at `Y - SmartMappia/SmartMappiaa/`, excluding `node_modules`/`dist`/build output)
Repo: single git repo, branch `full` · ~736 MB working tree (mostly `node_modules`, Android build output, media)

## 1. What it is

**Alabiq** is a multi-service logistics platform for **Saudi Arabia** — one codebase, one driver fleet, three service lines:

1. **Pick & Drop** — airport transfers (the original product; backend is even named `alabiq-backend` "Airport Pick & Drop backend")
2. **Food Delivery** — restaurant ordering within a 15 km radius (live)
3. **Ecommerce** — partner-store physical goods (**feature-flagged off** by default via `SHOP_ENABLED`)

## 2. Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8 (rolldown), Tailwind CSS 4, React Router 7, shadcn-style UI (radix-slot + CVA + tailwind-merge), framer-motion, sweetalert2, lucide icons |
| Mobile | Capacitor 8 — Android (minSdk 24 / targetSdk 36, appId `com.alabiq`) and iOS; native geolocation plugin |
| Backend | Node ≥ 20, Express 4, **plain JavaScript CommonJS, no build step** (~28k LOC incl. tests/scripts) |
| Data | **Supabase** — Postgres 15, Auth (JWT), Storage (private `payment-proofs` + public `merchant-images` buckets), Realtime |
| Maps | Google Maps Platform (browser key + server key; Routes/Places/Geocoding proxied server-side). **Mapbox GL is still a declared dependency** despite the README calling Google the active provider — cleanup debt |
| Payments | STC Pay manual bank transfer (**live path**); Tap Payments (card/Apple Pay, gated by env vars, off by default) |
| Infra | Hostinger VPS, PM2 (`alabiq-api`), Nginx reverse proxy (4000 → 443), Certbot HTTPS, Cloudflare; legacy Vercel configs still in repo |
| Security | Helmet, CORS allow-list, express-rate-limit (general + auth limiters), JWT Bearer, idempotency middleware |

## 3. Repository layout

```
SmartMappiaa/
├── .github/workflows/ios-build.yml   # CI: unsigned iOS simulator build (macOS runner, on push to full/main)
├── alabiq-web-main/
│   ├── frontend/                     # ~42k LOC src, 132 jsx + 43 js files
│   │   ├── src/
│   │   │   ├── main.jsx              # all route definitions (BrowserRouter)
│   │   │   ├── App.jsx               # marketing landing (16 sections: Hero, PickDrop, Restaurants, Shop, FAQ…)
│   │   │   ├── sections/ pages/ components/   # public site
│   │   │   └── portal/               # authenticated app
│   │   │       ├── auth/    (23)     # login, signup, forgot/reset, mobile variants
│   │   │       ├── user/    (8)      # home, book, pay, track, profile, transactions, notifications
│   │   │       ├── driver/  (3)      # dispatch, driver page, verification
│   │   │       ├── merchant/(6)      # food + shop merchant dashboards/orders
│   │   │       ├── admin/   (14)     # layout, dashboard, bookings, drivers, food admin, errors, reports
│   │   │       ├── food/    (8)      # home, restaurant, cart, checkout, orders, track
│   │   │       ├── shop/    (6)      # store home/page, cart, checkout, orders, track (flagged)
│   │   │       ├── components/(22)   # shared UI: LocationPicker, CardPaySection, NotificationBell…
│   │   │       └── lib/     (28)     # AuthProvider, api client, gateway client, geo, csv…
│   │   ├── public/                   # PWA: manifest + sw.js (prod-only), 29 MB media
│   │   ├── android/  ios/            # Capacitor projects (iOS recently added — top commits are iOS CI)
│   │   └── capacitor.config.json
│   └── backend/
│       ├── server.js                 # entry: dotenv + listen + stale-order sweeper
│       ├── app.js                    # middleware + 21 route mounts, conditional shop/cards flags
│       ├── routes/        (15)       # auth, bookings, driver, food, shop, payments, tracking, admin…
│       ├── controllers/   (17+)      # thin: parse → call lib → shape response
│       ├── lib/           (49)       # THE service layer: fare, foodMoney, shopMoney, ledger, vat,
│       │                             #   dispatch, eta, geo, geofence, googleRoutes, payments, tap,
│       │                             #   savedCards, stock, storeHours, realtime, webPush, audit…
│       ├── middleware/    (4)        # auth guards, foodAuth, idempotency, rate limiters
│       ├── migrations/reconstructed/ # consolidated schema: 4 SQL files (schema, security/indexes,
│       │                             #   functions, integrity) + per-migration tests
│       ├── sql/app_gateway.sql
│       ├── scripts/                  # 20+ seeds/checks/demo simulators
│       └── test/        (17)         # node:test unit tests for pure modules
└── .alabiq-server-credentials.env  # SSH creds for the prod VPS (present in working tree)
```

## 4. Architecture & key invariants

- **Strict three-layer, one-directional flow**: `routes/` (paths, guards, limiters, validation) → `controllers/` (HTTP in/out only) → `lib/` (all business logic + DB access). `lib/config.js` is the only file allowed to read `process.env`.
- **Money is sacred**: all fare / delivery fee / margin / VAT / platform-fee math is server-side in `lib/` (`fare.js`, `foodMoney.js`, `shopMoney.js`, `money.js`, `vat.js`, `ledger.js` double-entry ledger, `merchantCredit.js`). Client amounts are ignored.
- **Concurrency**: database arbitrates via unique indexes + compare-and-swap; no multi-table transactions (Supabase client limitation) — README flags moving multi-writes into Postgres RPCs as the top integrity improvement.
- **Auth**: Supabase Auth JWTs; `POST /api/auth/sync` resolves role from `profiles` + `ADMIN_EMAILS` (self-selected roles at signup ignored). Middleware enforces role guards per route.
- **Payments**: STC Pay = manual transfer + uploaded proof to private bucket via signed URLs; admin verifies. `AUTO_VERIFY_STCPAY_TEST_MODE` must be `false` in prod. Tap Payments for cards is env-gated and off.
- **Realtime**: Supabase Realtime for driver location + order status; WebSocket (`ws`) server + web-push for PWA notifications. Broadcast failures swallowed; polling is the guaranteed fallback.
- **Feature flags**: `SHOP_ENABLED` gates shop routes both backend (`app.js` mounts `shopClosed` middleware when off) and frontend; card payments similarly gated.
- **API gateway**: recent commit "Move clients behind API gateway" — backend has `api/index.js` + `lib/gatewayClient.js` on the frontend, suggesting an abstraction layer over direct Supabase calls (newest active work).

## 5. Development state

- **Single repo, branch `full`** (also `main`, `apk`, `ios` remotes). Latest commits: iOS simulator CI, iOS build number, optional media columns, API gateway move — mobile + gateway work is the current focus.
- **Uncommitted work on `full` (auth-session refactoring, 9 modified + 6 new files)**: new `lib/authClient.js` + `lib/authStore.js` (with `better-sqlite3` added as a dependency — an embedded auth-session store), `scripts/backup-auth-store.js`, 3 new test files, changes to `authController.js`, `config.js`, `server.js`, `.env.example`. This looks like replacing Supabase-hosted sessions with a self-managed SQLite-backed session store. **Not yet committed.**
- **Tests exist but are thin**: 17 backend unit tests (node:test, pure modules only — fare, money, vat, foodMoney, shopMoney, authStore…); frontend has a `test/` harness but the README itself says "No automated tests" and recommends starting with the pure modules.
- **Seeds/demo**: rich script suite (seed admins/user/driver/restaurant/shop, demo simulators, migration checker, order reset, account deletion).
- **Deployment**: VPS via PM2 + Nginx; GitHub Actions builds unsigned iOS simulator app on PRs/pushes affecting frontend; Capacitor Android APK built locally (JDK 21 required).
- **Docs**: a genuinely excellent, current root README (tech stack, env vars, install, deployment, key scripts, known gaps). `AGENTS.md` adds server-access rules (SSH to prod only on explicit request; never do visual QA on live pages).
- **Security note**: `.alabiq-server-credentials.env` sits in the repo root but is excluded via `.git/info/exclude` and never appears in git history — verified safe, though it relies on a machine-local exclude rather than the tracked `.gitignore`.

## 6. Strengths

1. **Excellent documentation** — the README is among the best self-described small-team docs: stack with versions, every env var, deployment quirks (Windows lockfile vs rolldown), known gaps.
2. **Clear invariants** — money server-side, layered architecture, config single-point-of-access, feature flags enforced on both ends.
3. **Disciplined layering for a solo/small team** — controllers stay thin, business logic concentrated in well-named lib modules.
4. **Sensible BaaS choice** — Supabase gives Postgres + Auth + Storage + Realtime without ops overhead; app code focuses on domain logic.
5. **Test seeds for the right modules** — pure money/geo/auth logic has unit tests where they matter most.

## 7. Risks & improvement opportunities

1. **No DB transactions** — multi-table writes are sequential; a crash mid-write corrupts state. Postgres RPCs would fix it (README agrees).
2. **Test coverage** — only 17 backend unit tests; zero frontend/e2e coverage. Highest-value: money modules (already done), then order-lifecycle integration tests.
3. **Schema management drift** — migrations were "reconstructed" into 4 consolidated files; the README still references "migration 0043". One-off SQL (`sql/app_gateway.sql`) alongside migrations.
4. **Dependency residue** — `mapbox-gl` (and possibly maplibre remnants) still installed though Google Maps is the stated provider; Vercel configs linger unused.
5. **Two payment modes with a live manual path** — STC Pay proof verification is manual admin work; `AUTO_VERIFY_STCPAY_TEST_MODE` is a foot-gun if ever flipped in prod.
6. **Uncommitted auth-store refactor** — the SQLite session store is half-landed (new dep, new files, no commit). Risk of loss; also `better-sqlite3` is a native module — deployment story on the VPS needs verifying.
7. **No frontend 404 catch-all** — unknown routes render blank (README-known).
8. **No staging environment evident** — dev → prod VPS directly; demo seeds suggest prod-adjacent testing.
9. **`/admin/ferdz` demo route** — a demo admin page shipped in the route table; ensure it's disabled/protected in production.
10. **Server credentials rely on `.git/info/exclude`** — the root `.gitignore` doesn't cover `.env` files; the credentials file is safe only because of a machine-local exclude (verified: not in git history). Anyone regenerating it under a different name gets no protection.

## 8. Suggested next steps

- Commit or stash the in-flight auth-session refactor (SQLite auth store) — it's the only uncommitted work and touches auth, the most sensitive surface.
- Verify `.alabiq-server-credentials.env` is gitignored and rotate if it was ever committed.
- Add the missing `*` catch-all route in `main.jsx`.
- Expand tests to order-lifecycle integration (book → dispatch → pay → reconcile).
- Clean up map dependencies and Vercel configs.
