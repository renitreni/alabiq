// What the site keeps in browser storage, as shown on /cookie-preferences.
// test/deviceStorage.test.js fails if a key here is no longer used in src/.

export const ESSENTIAL_STORAGE = [
  { key: 'sm_api_session', label: 'Sign in session', purpose: 'Keeps you signed in on this device.' },
  { key: 'sm_pending_profile', label: 'Sign up details', purpose: 'Holds the details you entered at sign up until your email is confirmed.' },
  { key: 'mapbox.eventData', label: 'Map provider', purpose: 'Mapbox, our map provider, stores an anonymous identifier to count how many times the map loads.' },
];

// prefix: true matches every key starting with `key` (one entry per signed in user).
export const PREFERENCE_STORAGE = [
  { key: 'sm_food_favorites', label: 'Favourite restaurants', purpose: 'Restaurants you marked as favourites.' },
  { key: 'sm_sound_prefs', label: 'Alert sounds', purpose: 'Your sound settings for order and trip alerts.' },
  { key: 'sm_notifications_seen_at', label: 'Notifications read', purpose: 'When you last opened your notifications, so old ones are not shown as new.' },
  { key: 'sm_geo_prompted', label: 'Location prompt', purpose: 'Whether we already asked to use your location.' },
  { key: 'sm_push_prompt_dismissed:', prefix: true, label: 'Notification prompt', purpose: 'Whether you dismissed the offer to turn on notifications.' },
];

export function clearPreferenceStorage(storage = localStorage) {
  const prefixes = PREFERENCE_STORAGE.filter((s) => s.prefix).map((s) => s.key);
  const exact = PREFERENCE_STORAGE.filter((s) => !s.prefix).map((s) => s.key);
  const toRemove = [...exact];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (prefixes.some((p) => k.startsWith(p))) toRemove.push(k);
  }
  toRemove.forEach((k) => storage.removeItem(k));
}
