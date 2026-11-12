# Alabiq — Tech Stack & Installation Guide

> A multi-service logistics platform for Saudi Arabia. One codebase, one driver fleet, three service lines: **Pick & Drop** (airport transfers), **Food Delivery** (restaurant ordering within 15 km), and **Ecommerce** (partner store physical goods — feature-flagged off by default).

---

## Contents

1. [Tech Stack Overview](#tech-stack-overview)
2. [Frontend](#frontend)
3. [Backend](#backend)
4. [Infrastructure & Services](#infrastructure--services)
5. [Project Structure](#project-structure)
6. [Environment Variables](#environment-variables)
7. [Installation](#installation)
8. [Build & Deployment](#build--deployment)
9. [Key Scripts](#key-scripts)

---

## Tech Stack Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| **Mobile** | Capacitor 8 (Android WebView, minSdk 24 / targetSdk 36) |
| **Backend** | Node.js 18+, Express 4, plain JavaScript (CommonJS) |
| **Database / Auth / Storage / Realtime** | Supabase (Postgres 15) |
| **Maps & Routing** | Google Maps Platform (browser + server keys) |
| **Payments** | Manual STC Pay (live); Tap Payments (gated, off by default) |
| **Server** | Hostinger VPS, Nginx reverse proxy, PM2, Cloudflare |
| **Security** | Helmet, CORS allow-list, express-rate-limit, JWT Bearer tokens |

---

## Frontend

The frontend is a **React 19 single-page application** built with **Vite 8**. It serves both the public marketing site and the authenticated portals (customer, driver, merchant, admin).

### Core Framework & Build

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^19.2.6 | UI framework |
| `vite` | ^8.0.12 | Build tool and dev server |
| `@vitejs/plugin-react` | ^6.0.1 | React Fast Refresh support |
| `react-router-dom` | ^7.17.0 | Client-side routing |

### Styling

| Package | Version | Purpose |
|---|---|---|
| `tailwindcss` | ^4.3.0 | Utility-first CSS |
| `@tailwindcss/vite` | ^4.3.0 | Tailwind v4 Vite plugin (no `tailwind.config.js`) |
| `autoprefixer` / `postcss` | ^10.5.0 / ^8.5.15 | CSS processing |
| `tailwind-merge` | ^3.6.0 | Merge Tailwind classes without conflicts |
| `clsx` | ^2.1.1 | Conditional class joining |
| `class-variance-authority` | ^0.7.1 | Component variant management (shadcn/ui) |

> Tailwind v4 is configured entirely via the Vite plugin plus an `@theme` block in `src/index.css`. Reusable style constants live as exported strings in `portal/components/ui.jsx`.

### UI Libraries

| Package | Version | Purpose |
|---|---|---|
| `@radix-ui/react-slot` | ^1.3.3 | Primitive slot component |
| `lucide-react` | ^1.18.0 | Icon library |
| `framer-motion` | ^12.40.0 | Animations |
| `sweetalert2` | ^11.26.25 | Alert / modal dialogs |

### Maps & Location

| Package | Version | Purpose |
|---|---|---|
| `maplibre-gl` | ^5.24.0 | Legacy map renderer (mostly retired; some residual code remains) |
| `pmtiles` | ^4.4.1 | Legacy tile protocol (mostly retired) |

> **Note:** The active map provider is now **Google Maps Platform**. Residual `maplibre-gl` and `pmtiles` dependencies are leftover from a migration and should be cleaned up.

### Utilities & PDF

| Package | Version | Purpose |
|---|---|---|
| `html2canvas` | ^1.4.1 | HTML-to-canvas for receipt/invoice rendering |
| `jspdf` | ^4.2.1 | PDF generation |
| `qrcode` | ^1.5.4 | QR code generation |

### Mobile (Android)

| Package | Version | Purpose |
|---|---|---|
| `@capacitor/core` | ^8.4.2 | Native WebView wrapper |
| `@capacitor/android` | ^8.4.2 | Android platform integration |
| `@capacitor/cli` | ^8.4.2 | Capacitor CLI |
| `@capacitor/geolocation` | ^8.2.0 | Native Fused Location in the Android app |

### Linting

| Package | Version | Purpose |
|---|---|---|
| `eslint` | ^10.3.0 | Linter (flat config) |
| `@eslint/js` | ^10.0.1 | ESLint base config |
| `eslint-plugin-react-hooks` | ^7.1.1 | React Hooks rules |
| `eslint-plugin-react-refresh` | ^0.5.2 | React Refresh rules |
| `globals` | ^17.6.0 | Global variable definitions |

### Supabase Client

| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.108.1 | Auth, Realtime updates, Storage signed URLs |

> **Important:** Only the **anon/public** key is used in the frontend. The service-role key is backend-only.

---

## Backend

The backend is an **Express 4** application written in plain **JavaScript (CommonJS)** with no build step.

### Core Framework

| Package | Version | Purpose |
|---|---|---|
| `node` | >= 18 | Runtime |
| `express` | ^4.21.0 | HTTP server framework |
| `dotenv` | ^16.4.5 | Environment variable loading |

### Security

| Package | Version | Purpose |
|---|---|---|
| `helmet` | ^8.2.0 | Security headers (HSTS, CSP referrer policy, etc.) |
| `cors` | ^2.8.5 | CORS with allow-list enforcement |
| `express-rate-limit` | ^8.5.2 | Rate limiting (general + auth-specific) |

### Database, Auth & Realtime

| Package | Version | Purpose |
|---|---|---|
| `@supabase/supabase-js` | ^2.45.0 | Postgres client, Auth (service role), Storage, Realtime |

### WebSocket & Push

| Package | Version | Purpose |
|---|---|---|
| `ws` | ^8.21.0 | WebSocket server |
| `web-push` | ^3.6.7 | VAPID-based Web Push notifications (PWA) |

### Architecture

- **Three-layer, one-directional:**
  - `routes/` — paths, guards, rate limiters, validations
  - `controllers/` — parse request, call `lib/`, shape response
  - `lib/` — **the service layer**: all business logic and DB access (24+ files)

- Key invariants:
  - All money computed **server-side**; client amounts ignored
  - Database arbitrates concurrency via unique indexes + compare-and-swap
  - Realtime accelerates; polling guarantees
  - `lib/config.js` is the **only** file reading `process.env`

---

## Infrastructure & Services

### Hosting & Reverse Proxy

| Component | Details |
|---|---|
| **VPS** | Hostinger |
| **Process Manager** | PM2 (`alabiq-api`) |
| **Reverse Proxy** | Nginx (port 4000 -> 443 with HTTPS) |
| **DNS / CDN** | Cloudflare |
| **Static Hosting** | Nginx serves the built `dist/` folder |

### External APIs & Services

| Service | Use |
|---|---|
| **Supabase** | Postgres 15, Auth, Storage (private & public buckets), Realtime |
| **Google Maps Platform** | Maps JS API (frontend), Routes/Places/Geocoding proxies (backend) |
| **Tap Payments** | Card payments (gated by `TAP_SECRET_KEY`; off by default) |
| **STC Pay** | Manual bank-transfer payment (live path) |

### PWA

- `public/manifest.webmanifest` — standalone app metadata
- `public/sw.js` — Service Worker with shell caching and push handler (registered only in production builds)


---

## Project Structure

```
SmartMappiaa/
├── alabiq-web-main/
│   ├── frontend/                 # React 19 + Vite SPA
│   │   ├── src/
│   │   │   ├── main.jsx          # Router + all route definitions
│   │   │   ├── App.jsx           # Marketing landing page
│   │   │   ├── index.css         # Tailwind v4 @theme + brand tokens
│   │   │   ├── components/       # Shared marketing + booking UI
│   │   │   ├── sections/         # 12 marketing landing-page sections
│   │   │   ├── pages/            # Static info pages (Services, Support, Legal)
│   │   │   └── portal/           # Authenticated app
│   │   │       ├── auth/         # Login, signup
│   │   │       ├── user/         # Home, book, pay, track, profile, transactions
│   │   │       ├── driver/       # DriverPage, verification, dispatch
│   │   │       ├── merchant/     # Dashboard, layout, orders
│   │   │       ├── admin/        # AdminLayout, Dashboard, FoodAdmin, ErrorsView
│   │   │       ├── food/         # Home, restaurant, cart, checkout, orders
│   │   │       └── shop/         # Ecommerce (gated by SHOP_ENABLED)
│   │   ├── public/               # Static assets, manifest, service worker
│   │   ├── android/              # Capacitor Android project files
│   │   ├── .env.example          # Required env vars (see below)
│   │   └── vite.config.js        # Vite config with @ alias + /api proxy
│   │
│   └── backend/                  # Express API (CommonJS, no build step)
│       ├── server.js             # Entry point: dotenv + listen + dispatch sweeper
│       ├── app.js                # Express app: middleware + route mounts
│       ├── routes/               # 15 route modules
│       ├── controllers/          # 13+ controller modules + food/ + shop/
│       ├── middleware/           # auth guards, rate limiters, idempotency, foodAuth
│       ├── lib/                  # Service layer (24 files — business logic + DB)
│       ├── scripts/              # Seed, migration checks, demo simulators
│       ├── .env.example          # Required env vars (see below)
│       └── vercel.json           # Legacy Vercel config (not used in production)

---

## Environment Variables

### Frontend (`frontend/.env`)

> Only variables prefixed with `VITE_` are exposed to the browser. **Never** put the Supabase service-role key or any server secret here.

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE` | Yes | Backend base URL (e.g., `http://localhost:4000`) |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase **anon/public** key |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Yes | Google Maps JavaScript API key (restrict by HTTP referrer) |
| `VITE_GOOGLE_MAP_ID` | Yes | Google Cloud vector Map ID (required for `AdvancedMarkerElement`) |
| `VITE_TAP_PUBLIC_KEY` | No | Tap Payments publishable key (for Apple Pay Web SDK; public by design) |


### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase **service role** key (server only; bypasses RLS) |
| `SUPABASE_ANON_KEY` | No | Supabase anon key (used only by `npm run check:migrations`) |
| `PORT` | No | Server port (default: `4000`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (empty = allow all in dev) |
| `AUTO_VERIFY_STCPAY_TEST_MODE` | Yes | **Must be `false` in production** — auto-verifies payment proofs |
| `PAYMENT_MODE` | Yes | `stcpay_manual` \| `stcpay_manual_test_auto` \| `moyasar` \| `both` |
| `SMART_ALABIQ_STCPAY_NUMBER` | Yes | STC Pay account number shown to passengers |
| `SMART_ALABIQ_STCPAY_NAME` | Yes | STC Pay account name shown to passengers |
| `PAYMENT_PROOF_BUCKET` | Yes | Supabase Storage **private** bucket name for payment proofs |
| `PAYMENT_PROOF_UPLOAD_TTL` | No | Signed upload URL lifetime in seconds (default: `900`) |
| `PAYMENT_PROOF_DOWNLOAD_TTL` | No | Signed download URL lifetime in seconds (default: `3600`) |
| `PAYMENT_PROOF_MAX_BYTES` | No | Max upload size in bytes (default: `10485760` = 10 MB) |
| `MERCHANT_IMAGES_BUCKET` | No | Supabase Storage **public** bucket for restaurant/store images |
| `ADMIN_EMAILS` | Yes | Comma-separated admin emails (auto-promoted on sign-in) |
| `VAPID_PUBLIC_KEY` | No | Web Push public key |
| `VAPID_PRIVATE_KEY` | No | Web Push private key (server only) |
| `VAPID_SUBJECT` | No | Web Push contact email (e.g., `mailto:support@alabiq.com`) |
| `GOOGLE_MAPS_SERVER_KEY` | Yes | Google Maps server key (Routes, Places, Geocoding proxies) |
| `TAP_SECRET_KEY` | No | Tap Payments secret API key (gating card payments) |
| `TAP_PUBLIC_KEY` | No | Tap Payments public key |
| `TAP_MERCHANT_ID` | No | Tap merchant ID |
| `TAP_API_BASE` | No | Tap API base (`https://api.tap.company`) |
| `TAP_APPLE_PAY_ENABLED` | No | Apple Pay via Tap Web SDK (`false` by default) |
| `TAP_ALLOW_NON_3DS_ON_FILE` | No | Allow non-3DS saved-card charging (`false` by default) |
| `TAP_MAX_SAVED_CARDS` | No | Max saved cards per customer (default: `5`) |
| `PUBLIC_WEB_URL` | No | Absolute public web URL for redirects |
| `PUBLIC_API_BASE` | No | Absolute public API base URL |
| `SHOP_ENABLED` | No | Master switch for ecommerce (default: `false`) |
| `SHOP_MIN_ORDER` | No | Shop minimum order value (default: `50`) |
| `SHOP_DELIVERY_FEE` | No | Shop delivery fee (default: `15`) |
| `SHOP_RADIUS_KM` | No | Shop free delivery radius in km (default: `15`) |
| `DELIVERY_MAX_RADIUS_KM` | No | Fallback maximum distance in km (default: `50`). Only used until migration 0043 is applied — after that the live limit is the admin setting `app_settings.max_distance_km`, which covers rides and deliveries alike and ships as "no limit" |
| `SHOP_DEFAULT_MARGIN` | No | Fallback product margin (default: `5`) |
| `SHOP_LOW_STOCK` | No | Default low-stock threshold (default: `5`) |
| `SHOP_ORDER_EXPIRY_MINUTES` | No | Unpaid order auto-cancel time (default: `30`) |
| `SHOP_STALE_SWEEP_MS` | No | Stale order sweep interval (default: `60000`) |


---

## Installation

### Prerequisites

- **Node.js** >= 18
- **npm** (comes with Node)
- **JDK 21** (for Android builds; JDK 17 fails)
- **Supabase project** with Auth, Postgres 15, and two Storage buckets (private `payment-proofs`, public `merchant-images`)
- **Google Cloud project** with Maps JavaScript API, Routes API, Places API, Geocoding API, and a vector Map ID

---

### 1. Clone the repository

```bash
cd /path/to/SmartMappiaa
```

---

### 2. Set up environment files

**Frontend:**
```bash
cd alabiq-web-main/frontend
cp .env.example .env
# Edit .env and fill in:
#   VITE_API_BASE
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_GOOGLE_MAPS_BROWSER_KEY
#   VITE_GOOGLE_MAP_ID
```

**Backend:**
```bash
cd ../backend
cp .env.example .env
# Edit .env and fill in at minimum:
#   SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
#   PORT (optional, defaults to 4000)
#   CORS_ORIGINS (leave empty for local dev)
#   AUTO_VERIFY_STCPAY_TEST_MODE   <-- MUST be false in production
#   PAYMENT_MODE
#   SMART_ALABIQ_STCPAY_NUMBER
#   SMART_ALABIQ_STCPAY_NAME
#   PAYMENT_PROOF_BUCKET
#   ADMIN_EMAILS
#   GOOGLE_MAPS_SERVER_KEY
```

---

### 3. Install dependencies

**Frontend:**
```bash
cd alabiq-web-main/frontend
npm install
```

**Backend:**
```bash
cd alabiq-web-main/backend
npm install
```

---

### 4. Seed data (optional but recommended)

```bash
cd alabiq-web-main/backend

# Seed the bootstrap admin account (requires ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD)
npm run seed:admin

# Check migration security grants (needs SUPABASE_ANON_KEY set)
npm run check:migrations
```

---

### 5. Run the application

**Terminal 1 — Backend:**
```bash
cd alabiq-web-main/backend
npm run dev
# Server starts on http://localhost:4000
```

**Terminal 2 — Frontend:**
```bash
cd alabiq-web-main/frontend
npm run dev
# Dev server starts on http://localhost:5173
# (/api is proxied to http://127.0.0.1:4000 via vite.config.js)
```

> The frontend only ever uses the Supabase **anon** key. The service-role key never leaves the backend.



---

## Build & Deployment

### Frontend Production Build

```bash
cd alabiq-web-main/frontend
npm run build       # Static files output to dist/
npm run preview     # Serve the build locally for verification
```

> **VPS Deployment Quirk:** `package-lock.json` in this repo was generated on Windows. Vite 8 uses the `rolldown` bundler, which needs a platform-specific native binary. On Linux, you may need to regenerate the lockfile:
>
> ```bash
> rm -rf node_modules package-lock.json && npm install && npm run build
> ```
> This may recur on the next `git pull` that restores the Windows lockfile.

### Android APK Build

```bash
cd alabiq-web-main/frontend
npm run build
npx cap sync                # MANDATORY — syncs the new dist/ bundle into the Android project
cd android && ./gradlew assembleRelease
```

| Requirement | Value |
|---|---|
| JDK | **21** (JDK 17 fails) |
| minSdk / targetSdk | 24 / 36 |
| appId | `com.alabiq` |

### Backend Production Deployment

The backend runs on a **Hostinger VPS** under **PM2**:

```bash
cd alabiq-web-main/backend
git pull
npm install
# (Use the lockfile regeneration step above if needed for the backend too)
npm start
```

Nginx reverse-proxies `https://api.alabiq.com` to `localhost:4000`. HTTPS is managed by Certbot.

---

## Key Scripts

### Frontend (`frontend/package.json`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Start dev server (`http://localhost:5173`) |
| `build` | `vite build` | Production build to `dist/` |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `eslint .` | Run ESLint 10 (flat config) |

### Backend (`backend/package.json`)

| Script | Command | Purpose |
|---|---|---|
| `start` | `node server.js` | Start production server |
| `dev` | `node --watch server.js` | Start dev server with auto-restart |
| `seed:admin` | `node scripts/seed-admin.js` | Seed a single admin (env-driven credentials) |
| `set:password` | `node scripts/set-password.js` | Reset a user password |
| `seed:accounts` | `node scripts/seed-admin.js` | Seed bootstrap admin |
| `seed:drink-sizes` | `node scripts/seed-drink-sizes.js` | Seed drink size catalog |
| `seed:aling-marias` | `node scripts/seed-aling-marias.js` | Seed Aling Maria's restaurant |
| `check:migrations` | `node scripts/check-migrations.js` | Verify every migration is applied and its grants still hold |
| `check:shop` | `node scripts/check-shop.js` | Verify shop schema readiness |
| `check:hours` | `node scripts/check-store-hours.js` | Verify store hours config |
| `seed:shop` | `node scripts/seed-shop.js` | Seed shop products |
| `seed:demo` | `node scripts/demo/seed-demo.js` | Seed demo data |
| `seed:pay` | `node scripts/demo/seed-pay.js` | Seed demo payment data |
| `seed:request` | `node scripts/demo/seed-request.js` | Seed demo ride request |
| `sim:driver` | `node scripts/demo/simulate-driver.js` | Simulate driver flow |
| `seed:clean` | `node scripts/demo/seed-clean.js` | Clean demo data |

---

## Useful Notes

- **Auth model:** Supabase Auth issues JWTs. On sign-in, the backend `POST /api/auth/sync` resolves the user's role from the `profiles` table and `ADMIN_EMAILS`. Emails listed in `ADMIN_EMAILS` become `admin`; self-selected roles during signup are ignored.
- **Realtime:** Used for live driver-location updates and order-status broadcasts. Every broadcast failure is swallowed gracefully; polling is the guaranteed fallback.
- **Money model:** All fare, delivery fee, margin, VAT, and platform fee calculations happen server-side in `lib/`. The client may display hints, but the database + backend are the source of truth.
- **File uploads:** Payment proofs go to a **private** Supabase Storage bucket via signed URLs. Merchant/store images go to a **public** bucket.
- **No automated tests:** The highest-value first step would be unit tests for pure modules (`foodMoney.js`, `ledger.js`, `fare.js`, `validate.js`, `geo.js`) — no database required.
- **No transactions:** The Supabase client does not expose transactions, so multi-table writes are sequential. Moving them into Postgres RPCs is the main outstanding integrity improvement.
- **No 404 route:** The frontend `main.jsx` has no `*` catch-all; unknown paths render blank.

---

*Last updated: 2026-08-18*

