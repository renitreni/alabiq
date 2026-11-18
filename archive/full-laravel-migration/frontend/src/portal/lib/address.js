// Street + building number are collected separately from the geocoded
// address (Google's result rarely carries a Saudi building number), so every
// surface that shows an address to a human joins them the same way here.
export function formatAddressDetail({ street, building, address } = {}) {
  const detail = [building, street].map((p) => (p || '').trim()).filter(Boolean).join(' ');
  const base = (address || '').trim();
  if (!detail) return base;
  return base ? `${detail}, ${base}` : detail;
}
