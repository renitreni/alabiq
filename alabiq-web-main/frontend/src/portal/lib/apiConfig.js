// Canonical production API origin. VITE_API_BASE may override this for a
// staging build; production must never fall back to the device's localhost.
export const PRODUCTION_API_BASE = 'https://api.alabiq.com';

export function resolveApiBase({ dev = import.meta.env.DEV, configured = import.meta.env.VITE_API_BASE } = {}) {
  if (dev) return '';
  // A single-origin Docker/Nginx deployment serves the API under /api.
  if (configured === '/') return '';
  return String(configured || PRODUCTION_API_BASE).replace(/\/$/, '');
}
