const VALID_PROVIDERS = new Set(['google', 'mapbox']);

export function resolveMapConfiguration(env = {}) {
  const rawProvider = String(env.VITE_MAP_PROVIDER || 'google').trim().toLowerCase();

  if (!VALID_PROVIDERS.has(rawProvider)) {
    return {
      provider: null,
      error: `VITE_MAP_PROVIDER must be "google" or "mapbox" (received "${rawProvider}").`,
    };
  }

  if (rawProvider === 'google') {
    const missing = [];
    if (!env.VITE_GOOGLE_MAPS_BROWSER_KEY) missing.push('VITE_GOOGLE_MAPS_BROWSER_KEY');
    if (!env.VITE_GOOGLE_MAP_ID) missing.push('VITE_GOOGLE_MAP_ID');
    return {
      provider: rawProvider,
      error: missing.length ? `Google Maps is missing ${missing.join(' and ')}.` : null,
    };
  }

  const mapboxToken = String(env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
  if (!mapboxToken) {
    return { provider: rawProvider, error: 'Mapbox is missing VITE_MAPBOX_ACCESS_TOKEN.' };
  }
  if (!mapboxToken.startsWith('pk.')) {
    return {
      provider: rawProvider,
      error: 'VITE_MAPBOX_ACCESS_TOKEN must be a public Mapbox token beginning with "pk.".',
    };
  }
  return { provider: rawProvider, error: null };
}

export const mapConfiguration = resolveMapConfiguration(import.meta.env || {});
