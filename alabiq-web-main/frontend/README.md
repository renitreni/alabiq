# Alabiq — Frontend

The React app for Alabiq: the marketing site plus the customer, driver, merchant, and admin
portals for all three service lines: Pick & Drop airport transfers, Food Delivery, and Ecommerce
(partner stores selling physical goods, behind a feature flag until the first store trades).

**React 19 + Vite 8 + Tailwind CSS 4 + React Router 7.** The Alabiq API owns auth,
realtime, and file transfer; Supabase credentials remain server-side.
**Google Maps or Mapbox** for the browser map renderer; Google Maps Platform remains the backend
provider for routing, geocoding, and places. The same build is wrapped with **Capacitor 8** to ship
the Android app.

**Live:** https://alabiq.com (talks to `https://api.alabiq.com`).

> Detailed engineering documentation is kept private and is **not** in this repository. If you have
> the working copy, see `docs/engineering/` — in particular Part 11 for the full page-by-page
> reference. This README is intentionally self-contained so it stands alone without it.

---

## Run it

```bash
npm install
cp .env.example .env     # see the environment table below
npm run dev              # http://localhost:5173
```

Start the backend separately (`cd ../backend && npm run dev`).

```bash
npm run build            # static files land in dist/
npm run preview          # serve the build locally
npm run lint             # ESLint 10 flat config
npm test                 # provider configuration tests
```

The frontend contains no Supabase key or client. It stores only a random, revocable Alabiq
session token and sends it to the API as a bearer token.

---

## Environment

Compiled in at **build** time — a change requires a rebuild, not a restart.
`.env.example` is the authoritative reference.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | Backend base URL |
| `VITE_MAP_PROVIDER` | Browser renderer: `google` (default) or `mapbox` |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Required in Google mode. Maps JS API key restricted by HTTP referrer. |
| `VITE_GOOGLE_MAP_ID` | Required in Google mode. Vector Map ID for `AdvancedMarkerElement`. |
| `VITE_MAPBOX_ACCESS_TOKEN` | Required in Mapbox mode. Public (`pk.`) browser token only. |
| `VITE_MAPBOX_STYLE` | Optional Mapbox style URL; defaults to Mapbox Streets v12. |
| `VITE_TAP_PUBLIC_KEY` | Optional. Tap publishable key, needed only by the Apple Pay Web SDK. Public by design. |
| `VITE_APP_VERSION` | Optional. Recorded on push-subscription rows for debugging. |

> **`VITE_` is a security boundary.** Vite inlines any `VITE_`-prefixed variable into the public
> client bundle. Never give a server secret a `VITE_` name — in particular the Supabase service-role
> key or `TAP_SECRET_KEY`.

### Retired variables — delete them from any `.env` you still have

| Variable | Replaced by |
|---|---|
| `VITE_TAP_ENABLED` | `GET /api/payments/config` |
| `VITE_OSRM_BASE` | The backend `/api/route` proxy |
| `VITE_MAP_STYLE_URL` | Retired self-hosted/MapLibre renderer; no longer read |

**Card availability is not a client flag and must never become one again.** The frontend asks
`GET /api/payments/config` (`portal/lib/useCardAvailable.js`), and the whole `/api/payments` router
only exists when the backend has a Tap secret key — otherwise it is a `503` stub, and any failure
reading that endpoint is treated as "no card".

`VITE_TAP_ENABLED` was the counter-example: a build-time flag that could say "card is off" while the
backend had a live key, or the reverse. The two halves can no longer disagree because there is only
one half.

---

## Structure

```
src/
├── main.jsx          Router, providers, and EVERY route definition
├── App.jsx           The marketing landing page only — not an app shell
├── index.css         Tailwind import + @theme brand tokens + map pin CSS
│
├── components/       Marketing and generic shared components (+ booking/)
├── sections/         The 12 marketing landing-page sections
├── config/company.js Single source of truth for contact and legal details
│
└── portal/           THE APPLICATION — everything behind a login
    ├── auth/         Login, signup
    ├── user/         home, book, pay, track, profile, transactions, notifications
    ├── driver/       DriverPage, DriverVerification (KYC), DriverDispatch
    ├── merchant/     MerchantDashboard, MerchantLayout, MerchantOrders
    ├── admin/        AdminLayout, AdminPage, Dashboard, FoodAdmin
    ├── food/         home, restaurant, cart, checkout, orders, track
    ├── components/   Shared portal UI (ui.jsx design system, RideMap, LocationPicker,
    │                 CardPaySection, SavedCardPicker, NewOrderAlertBar)
    └── lib/          api.js, AuthProvider, useBroadcast, useCardAvailable,
                      alertSound.js, notify.js, constants, invoice, csv
```

**Two rules govern the whole frontend:**

1. **Every route is declared in `src/main.jsx`.** No nested or file-based routing — that one file is
   the complete map of the application.
2. **Every backend call goes through `src/portal/lib/api.js`.** No component calls `fetch` directly.
   One `request()` helper attaches the bearer token, handles the base URL, and surfaces errors;
   `{ silent: true }` suppresses the error dialog for polling loops.

---

## Routes

| Access | Routes |
|---|---|
| **Public** | `/` landing · `/login` · `/signup` · `/pay/:code` · `/track/:code` · `/food` · `/food/r/:id` · `/shop` · `/shop/s/:id` |
| **Any signed-in user** | `/notifications` · `/transactions` · `/profile` · `/food/cart` · `/food/checkout` · `/food/orders` · `/food/track/:code` · `/shop/cart` · `/shop/checkout` · `/shop/orders` · `/shop/track/:code` |
| **passenger** | `/home` · `/book` |
| **driver** | `/driver` |
| **merchant** | `/merchant` |
| **admin** | `/admin` |

`/pay/:code` and `/track/:code` are **deliberately public**, gated by an unguessable code — a
customer completing payment may not be signed in on that device, and a tracking link is shared with
whoever is meeting the passenger.

Driver, merchant, and admin each use **one route with conditional sub-screens** (tabs), not nested
routes. Sub-screens are therefore not linkable and are lost on refresh.

`/merchant` serves two different portals. `merchants.owner_id` is unique, so an owner maps to exactly
one business, and that row's `vertical` (`food` or `shop`) decides which dashboard renders.
`MerchantPortal` resolves it **server-side** and lazy-loads one of the two, so a restaurant owner
never downloads the store bundle or vice versa. The shell and nav are shared; only the tabs differ —
a restaurant manages a menu, a store manages products, variants and stock.

Role gating is via `RequireAuth`; the post-login landing page comes from `roleHome()` in
`portal/lib/constants.js`.

---

## State and data freshness

No Redux, Zustand, or React Query. Two contexts plus local state:

| Provider | State |
|---|---|
| `AuthProvider` | API session, profile, role, `driverApproved` — via `useAuth()` |
| `ViewModeProvider` | Admin "preview as" role, in `sessionStorage` |

Preview mode is a **UI convenience, not a permission change** — the API session is unchanged and the server
still sees an admin.

Every live screen uses the same pattern: an initial fetch, then an API event stream via
`useBroadcast`, with a polling fallback. `useBroadcast` returns `connected` so the page knows which
mode it is in. **Polling is the correctness guarantee**; realtime is the accelerator.

| Screen | Fallback |
|---|---|
| Customer tracking and most live screens | 8-second poll |
| Both merchant dashboards | 15-second poll **only while disconnected**, plus a visible offline banner |

The merchant dashboards previously discarded `connected` entirely, so a merchant whose websocket
dropped saw a frozen order list with nothing to indicate it. If you add a live screen, use
`connected` — do not assume the socket is up.

---

## Maps

The browser renderer is selected at build time with `VITE_MAP_PROVIDER`. Routing, ETA, address
search, reverse geocoding, and nearby places still use the backend Google proxies in either mode.

```
RideMap.jsx          shell: border, height, legend, provider selection
  ├─ google/GoogleMap.jsx   Google renderer (lazy chunk, script loader)
  └─ mapbox/MapboxMap.jsx   Mapbox GL renderer (lazy chunk)
RoutedRideMap.jsx    RideMap + fetchRoute(), refetch gated on a ~100 m signature
```

**No page imports a map vendor.** Consumers use `RideMap` or `RoutedRideMap`, and the vendor lives
behind them. This seam survived the last migration unchanged — **keep it that way.**

- Both renderers use the same DOM pin factory and reconcile markers by key. Google uses
  `AdvancedMarkerElement`; Mapbox uses DOM `Marker` instances.
- Routing goes through `portal/lib/osrm.js` — **filename retained, provider is now Google** — which
  calls the backend `/api/route` proxy and decodes the polyline inline.
- Geocoding and places are **never called from the browser**; `LocationPicker` uses `/api/locations/*`
  with a Places session token, a 550 ms debounce, and a ~150 m movement gate to control cost.
- Geolocation branches on `Capacitor.isNativePlatform()` — `@capacitor/geolocation` (Fused Location)
  in the app, `navigator.geolocation` in the browser.

---

## Payments

Three methods, and which of them a checkout screen may offer is decided **entirely by the backend**.

| Method | Availability |
|---|---|
| Manual STC Pay | Always. The customer uploads a transfer screenshot; an admin verifies it. |
| Cash | Rides, food and shop deliveries. Settled at the kerb or the door. |
| Card (Tap: cards, mada, Apple Pay, saved cards) | Only when the backend has a Tap secret key |

`portal/lib/useCardAvailable.js` is the single source of that answer for all three verticals. It
calls `GET /api/payments/config` once per page load and shares one module-level promise. Any failure
means "no card" — the entire `/api/payments` router is a `503` stub when Tap is unconfigured, so an
unreachable endpoint is already the answer.

A failure is deliberately **not** memoised: one dropped request on mobile data, or a `429` from the
backend's general limiter, would otherwise pin card as unavailable for the rest of the session.

**Do not reintroduce a build-time card flag.** `VITE_TAP_ENABLED` was exactly that and could
contradict the backend in either direction.

Card charges return either a URL to send the customer to (Tap's hosted page, or a 3DS step) or an
immediate `paid` when a saved card captured outright. Confirmation arrives by webhook to the backend,
never through the browser — the customer may close the tab and the order must still confirm.

---

## Notification sound

`portal/lib/alertSound.js` is the **only** `AudioContext` in the application. It serves merchant
new-order alerts, driver dispatch offers, passenger status changes and admin pings.

Three things about it are non-obvious and worth knowing before touching it:

1. **Every sound is synthesised.** There are **no audio assets in this repository.** The chime is a
   triangle oscillator plus an octave-up square through a `DynamicsCompressor` into a master gain.
2. **Loudness is a client-side concern only.** There is no backend lever. The push payload's
   `urgency: 'high'` is Web Push *delivery priority* — it tells the push service not to batch the
   message. No push protocol has a volume field. Anything louder is a change to `MASTER_GAIN`, the
   tone table or the compressor settings here.
3. **The autoplay policy will silently swallow it.** Browsers create an `AudioContext` suspended and
   only `resume()` inside a real user gesture, synchronously — deferring the call into a `.then()`
   fails without an error. `installAlertUnlock()` is wired once from `main.jsx` and must stay there.
   A second `AudioContext` elsewhere in the app will not be unlocked by it; that is exactly how
   driver and passenger chimes were dead for months.

New-order alerts repeat every 6 seconds until acknowledged, capped at 20 repeats. `NewOrderAlertBar`
is the acknowledge affordance, and it also badges the tab title — the only channel that reaches a
merchant on another tab, or a deaf merchant at all.

---

## Styling

Tailwind v4, utility-first. **No `tailwind.config.js` and no `postcss.config.js`** — Tailwind is
configured entirely through the Vite plugin plus an `@theme` block in `src/index.css` defining the
brand tokens (`bg-brand-orange`, `text-brand-grey`, and so on).

Reusable styles are exported as **string constants** (`btnPrimary`, `inputClass`, `btnGhost`) from
`portal/components/ui.jsx`, not as `@apply` classes.

---

## Mobile builds (Capacitor)

Android and iOS package the same `dist/` bundle inside a Capacitor WebView; there is no separate
mobile application codebase. Create `frontend/.env` from `.env.example` with the production API,
API and map configuration before building because Vite embeds these values in the bundle.

From `frontend/`, install dependencies and refresh both native projects:

```bash
npm ci
npm run mobile:sync     # runs the production web build, then `cap sync`
```

Use Node 22.13 or newer on the 22.x line, or Node 24+. Node 23 is outside the supported ranges of
the current build and lint dependencies.

`cap sync` is mandatory. It copies the current bundle, refreshes native plugin configuration, and
regenerates `ios/App/CapApp-SPM/Package.swift`; skipping it can package stale web code or stale
plugin paths.

### App icons and splash screens

The committed source assets live in `assets/`. They contain the official ALABIQ artwork
(`main-logo.png`, rider mark + ALABIQ wordmark) prepared in light and dark variants. To
regenerate every tracked iOS and Android icon and splash density:

```bash
npm run mobile:assets
```

Do not run the generator with `--pwa`: the website favicon and web-app manifest icons are
intentionally independent of the native branding.

### Android

| Requirement | Value |
|---|---|
| **JDK** | **21** — JDK 17 fails |
| Android SDK | compile/target API 36 |
| minSdk | 24 |
| appId | `com.alabiq` |

Select JDK 21, then build from `frontend/android`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
./gradlew assembleDebug
./gradlew assembleRelease
```

Android Studio's bundled JDK can be used when no standalone JDK 21 is installed:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

Release signing is deliberately external. Put `keystore.properties` in `android/` and point its
`storeFile` at a keystore outside the repository. Without it, the release variant builds unsigned.
For a Play upload, increment `versionCode`, configure signing, and run `./gradlew bundleRelease`.

Two integration constraints:

- The WebView origin is `https://localhost`, which must appear in the backend `CORS_ORIGINS`.
  **Position no longer matters, provided the backend sets `PUBLIC_WEB_URL`** — the payment-gateway
  redirect reads that variable and only falls back to `CORS_ORIGINS[0]` when it is unset. With the
  fallback in play, `https://localhost` must not be first or paying customers get redirected into the
  app's internal origin.
- The Google browser key's referrer restrictions must include `https://localhost/*`, or the map
  renders blank in the APK.

A PWA layer also exists: `public/manifest.webmanifest` and `public/sw.js` (shell cache plus a push
handler, registered only in production builds).

### iOS

| Requirement | Value |
|---|---|
| Xcode | Full Xcode installation with an iOS SDK (Command Line Tools alone are insufficient) |
| deployment target | iOS 15 |
| bundle id | `com.alabiq` |

After `npm run mobile:sync`, resolve packages and verify an unsigned Simulator build:

```bash
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme App
xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

Open `ios/App/App.xcodeproj` in Xcode to archive for distribution. The Apple developer team,
certificates, provisioning profiles, and export options remain outside the repository; select the
team in Xcode before producing an App Store archive.

---

## Production

Built on the VPS and served as static files by Nginx (apex and `www`), HTTPS via Certbot, Cloudflare
in front.

```bash
git pull && npm install && npm run build
```

> **Expect this on every VPS deploy.** Vite 8 uses the rolldown bundler, which needs a
> platform-specific native binary. The committed `package-lock.json` was generated on Windows, so npm
> skips the Linux one and the build fails with `Cannot find native binding`:
>
> ```bash
> rm -rf node_modules package-lock.json && npm install && npm run build
> ```
>
> It recurs because the next `git pull` restores the Windows lockfile.

---

## Known gaps

- **No 404 route** — `main.jsx` has no `*` catch-all, so an unknown path renders blank.
- **Minimal frontend tests.** Provider configuration is covered, but user flows and renderer
  behavior do not yet have automated browser tests. ESLint is not run in any gate.
- **Tabs instead of nested routes** in the driver, merchant, and admin portals — screens are not
  linkable, and the files have grown large (`DriverPage.jsx` 1,514 lines, `FoodAdmin.jsx` 1,448).
- **Per-page fetch/loading/error/polling duplication** — React Query would remove most of it.
- `src/App.css` is unused Vite starter leftovers.
- Duplicate booking submits create two bookings; ride creation has no idempotency key.
