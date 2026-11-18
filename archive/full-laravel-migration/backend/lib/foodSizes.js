// ---------------------------------------------------------------------
// Menu item size options (migration 0023) — shared validation + lookup.
//
// menu_items.size_options is a jsonb array:
//   [{ id: 'small', label: 'Small', price: 22, enabled: true }, ...]
// NULL / empty means the item has no sizes (one-tap add, list price).
//
// The admin/merchant item endpoints call normalizeSizeOptions() so only
// a well-formed array ever reaches the DB; the cart + checkout call
// findSizeOption() to resolve the ENABLED option the customer picked —
// its price replaces the list price for that line.
// ---------------------------------------------------------------------

const MAX_SIZES = 6;
const ID_RE = /^[a-z0-9_-]{1,30}$/;

// Validate + clean a client-sent size_options value.
// Returns { ok: true, value } (value is null or a clean array) or
// { ok: false, error }.
function normalizeSizeOptions(raw) {
  if (raw == null) return { ok: true, value: null };
  if (!Array.isArray(raw)) return { ok: false, error: 'size_options must be an array' };
  if (raw.length === 0) return { ok: true, value: null };
  if (raw.length > MAX_SIZES) {
    return { ok: false, error: `size_options must have at most ${MAX_SIZES} entries` };
  }

  const seen = new Set();
  const value = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: 'each size option must be an object' };
    }
    const id = String(entry.id || '').trim().toLowerCase();
    if (!ID_RE.test(id)) {
      return { ok: false, error: 'size option id must be 1-30 chars of a-z, 0-9, _ or -' };
    }
    if (seen.has(id)) return { ok: false, error: `duplicate size option id "${id}"` };
    seen.add(id);

    const label = String(entry.label || '').trim();
    if (!label || label.length > 40) {
      return { ok: false, error: 'size option label is required (max 40 chars)' };
    }

    const price = Number(entry.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
      return { ok: false, error: `size option "${label}" needs a price between 0.01 and 100000` };
    }

    value.push({
      id,
      label,
      price: Math.round(price * 100) / 100,
      enabled: entry.enabled !== false,
    });
  }
  return { ok: true, value };
}

// True when the item actually sells in sizes (at least one enabled option).
function hasEnabledSizes(sizeOptions) {
  return Array.isArray(sizeOptions) && sizeOptions.some((s) => s && s.enabled !== false);
}

// Resolve the ENABLED option with this id, or null.
function findSizeOption(sizeOptions, sizeId) {
  if (!Array.isArray(sizeOptions) || !sizeId) return null;
  const match = sizeOptions.find((s) => s && s.id === sizeId);
  return match && match.enabled !== false ? match : null;
}

module.exports = { normalizeSizeOptions, hasEnabledSizes, findSizeOption, MAX_SIZES };
