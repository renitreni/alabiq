// ---------------------------------------------------------------------
// One restaurant — one app: shell for /app/:hash/*
// Resolves the unguessable public hash to a single restaurant, then pins
// every child route (menu/cart/checkout/orders/track) to that merchant via
// context — the scoped app never offers a path to another restaurant.
//
// Also makes the scoped URL installable as the restaurant's own PWA: while
// mounted it swaps the document manifest for the same-origin per-restaurant
// one (/api/food/manifest/<hash>) and recolors theme-color, restoring the
// platform values on the way out. A slim install banner appears when the
// browser offers beforeinstallprompt; it scrolls away under the sticky
// page header and can be dismissed.
// ---------------------------------------------------------------------
import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Download, RefreshCw, UtensilsCrossed, X } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui';

const RestaurantAppContext = createContext(null);

// Child pages read the pinned restaurant + scoped base path from here.
export function useRestaurantApp() {
  const ctx = useContext(RestaurantAppContext);
  if (!ctx) throw new Error('useRestaurantApp must be used inside <AppShell>');
  return ctx;
}

const DEFAULT_THEME = '#f97316';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function useScopedPwa(hash, restaurant) {
  useEffect(() => {
    if (!restaurant) return undefined;

    let manifest = document.querySelector('link[rel="manifest"]');
    let createdManifest = false;
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.appendChild(manifest);
      createdManifest = true;
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevManifest = manifest.getAttribute('href');
    const prevTheme = themeMeta?.getAttribute('content') || null;

    // Same-origin manifest keeps the install prompt reliable; scope/start_url
    // pin the installed window to this restaurant's subtree.
    manifest.setAttribute('href', `/api/food/manifest/${hash}`);
    const theme = HEX_COLOR.test(restaurant.brand_color || '') ? restaurant.brand_color : DEFAULT_THEME;
    if (themeMeta) themeMeta.setAttribute('content', theme);

    return () => {
      if (createdManifest) manifest.remove();
      else if (prevManifest) manifest.setAttribute('href', prevManifest);
      if (themeMeta && prevTheme) themeMeta.setAttribute('content', prevTheme);
    };
  }, [hash, restaurant]);
}

// The browser fires beforeinstallprompt once and it cannot be re-triggered,
// so stash the event until the customer taps Install.
function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;
  return async () => {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
  };
}

function FullPage({ children }) {
  return (
    <div className="min-h-screen bg-brand-muted flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-brand-border rounded-3xl shadow-sm p-10 text-center">
        {children}
      </div>
    </div>
  );
}

export default function AppShell() {
  const { hash } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [bannerGone, setBannerGone] = useState(false);
  const install = useInstallPrompt();

  const basePath = `/app/${hash}`;
  const restaurant = data?.restaurant || null;

  async function load() {
    setError(null);
    try {
      setData(await api.foodRestaurantByHash(hash));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    setData(null);
    load();
  }, [hash]); // eslint-disable-line react-hooks/exhaustive-deps

  useScopedPwa(hash, restaurant);

  // Unknown or suspended hash: the scoped app must not confirm what lived
  // here, and there is deliberately no link out to platform browsing.
  if (error) {
    return (
      <FullPage>
        <UtensilsCrossed className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
        <p className="font-bold text-brand-dark mb-1">This restaurant app is unavailable</p>
        <p className="text-sm text-brand-grey mb-4">
          The link may be wrong, or the restaurant is no longer listed.
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-orange text-white font-black px-5 py-2.5 text-sm cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </FullPage>
    );
  }

  if (!restaurant) {
    return (
      <FullPage>
        <Spinner className="!w-8 !h-8 mx-auto" />
      </FullPage>
    );
  }

  return (
    <RestaurantAppContext.Provider value={{ hash, restaurant, basePath }}>
      {install && !bannerGone && (
        <div className="bg-brand-black text-white">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-brand-orange flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </span>
            <p className="text-sm font-bold truncate flex-1">
              Install {restaurant.name} on your device
            </p>
            <button
              type="button"
              onClick={install}
              className="shrink-0 rounded-lg bg-white text-brand-black text-xs font-black px-3 py-1.5 cursor-pointer"
            >
              Install
            </button>
            <button
              type="button"
              onClick={() => setBannerGone(true)}
              aria-label="Dismiss"
              className="shrink-0 p-1.5 rounded-lg text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <Outlet />
    </RestaurantAppContext.Provider>
  );
}
