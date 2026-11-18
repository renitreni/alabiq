// ---------------------------------------------------------------------
// Helper to extract the orders array from the admin food/shop orders response.
// Both /api/admin/food/orders and /api/admin/shop/orders return { data: [...] }.
// FoodAdmin/ShopAdmin already read (res.orders || res.data || []) for backward compat.
// ---------------------------------------------------------------------
export function extractOrders(res) {
  if (!res) return [];
  const orders = res.orders || res.data;
  return Array.isArray(orders) ? orders : [];
}