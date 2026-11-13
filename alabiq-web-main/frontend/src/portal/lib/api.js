// ---------------------------------------------------------------------
// Backend client. Auth is automatic: if a Alabiq session exists, every
// request carries its revocable bearer token, so the backend
// knows who the caller is and what role they have.
// ---------------------------------------------------------------------
import { notifyError } from './notify';
import { getSessionToken, setSessionToken } from './sessionStore';
import { resolveApiBase } from './apiConfig';

export const API_BASE = resolveApiBase();

async function authHeader() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Pass { silent: true } for background/polling calls so a transient failure
// doesn't fire a popup every few seconds. All other errors show one via Swal.
async function request(path, { method = 'GET', body, headers = {}, silent = false } = {}) {
  // /admin/ferdz renders the whole admin portal against invented data. The
  // switch is the URL, not a flag: a flag set on mount outlives an unmount
  // that never runs and would leak fake numbers into the live /admin. Read
  // per call, leaving the route makes the very next call real again.
  if (path.startsWith('/api/admin') && window.location.pathname.startsWith('/admin/ferdz')) {
    const { resolveDemo } = await import('../demo/demoApi');
    try {
      return await resolveDemo(path, method, body);
    } catch (err) {
      if (!silent) notifyError(err.message);
      throw err;
    }
  }

  const auth = await authHeader();

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...auth, ...headers },
      body: body !== undefined ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    // Network/CORS failure: the server couldn't be reached at all.
    const err = new Error('Network error: could not reach the server. Please check your connection.');
    err.status = 0;
    if (!silent) notifyError(err.message);
    throw err;
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.details = data && data.details;
    // Machine-readable reason (card_declined, min_order, out_of_stock, ...)
    // so a caller can branch on WHY rather than string-matching the message.
    err.failure_reason = data && data.failure_reason;
    if (res.status === 401 && !path.endsWith('/auth/login')) setSessionToken(null);
    if (!silent) notifyError(msg);
    throw err;
  }
  return data;
}

export const api = {
  base: API_BASE,

  // --- auth ---
  authLogin: (body) => request('/api/auth/login', { method: 'POST', body }),
  authSession: () => request('/api/auth/session', { silent: true }),
  authLogout: () => request('/api/auth/logout', { method: 'POST', silent: true }),
  authSignup: (body) => request('/api/auth/signup', { method: 'POST', body }),
  changePassword: (password) => request('/api/auth/password', { method: 'POST', body: { password } }),
  requestPasswordReset: (email) => request('/api/auth/password/reset/request', { method: 'POST', body: { email }, silent: true }),
  exchangePasswordReset: (token) => request('/api/auth/password/reset/exchange', { method: 'POST', body: { token }, silent: true }),
  completePasswordReset: (ticket, password) => request('/api/auth/password/reset/complete', { method: 'POST', body: { ticket, password } }),
  // Fire-and-forget: called once after a real credential sign-in so the
  // super admin can see who signed in and when. Silent because a failure
  // here must never surface as a popup on an otherwise successful login.
  recordLogin: () => request('/api/auth/login-event', { method: 'POST', silent: true }),
  authSync: (body = {}) => request('/api/auth/sync', { method: 'POST', body, silent: true }),
  // Profile page: name / phones / address / avatar.
  updateProfile: (body) => request('/api/auth/profile', { method: 'PATCH', body }),
  avatarSignedUrl: (body) => request('/api/auth/avatar/signed-url', { method: 'POST', body }),
  // Permanent, and required by both app stores. 204 on success.
  deleteAccount: () => request('/api/auth/account', { method: 'DELETE' }),
  uploadFile: async (grant, file) => {
    const form = new FormData();
    form.append('grant', grant);
    form.append('file', file, file.name);
    return request('/api/files/upload', { method: 'POST', body: form });
  },

  // --- saved cards ("card on file"), shared by all three services ---
  // A card is never ADDED here: Tap only mints one as a side effect of a
  // real charge with save_card, so saving happens at checkout. These only
  // list, remove and re-prioritise. The ids are our own uuids — the gateway
  // references never reach the browser.
  paymentMethods: () => request('/api/payment-methods', { silent: true }),
  // The customer just came back from Tap's hosted page. Tap appends tap_id
  // to the redirect URL; handing it back asks the server to confirm the
  // charge directly with Tap instead of waiting for a webhook that may
  // never arrive. Idempotent — the webhook landing first makes this a no-op.
  verifyCharge: (chargeId) =>
    request(`/api/payments/charges/${encodeURIComponent(chargeId)}/verify`, {
      method: 'POST',
      silent: true,
    }),
  deletePaymentMethod: (id) => request(`/api/payment-methods/${id}`, { method: 'DELETE' }),
  setDefaultPaymentMethod: (id) => request(`/api/payment-methods/${id}/default`, { method: 'POST' }),

  // --- passenger ---
  createBooking: (b) => request('/api/bookings', { method: 'POST', body: b }),
  myBookings: () => request('/api/bookings', { silent: true }), // Pick & Drop history
  getBooking: (code) => request(`/api/bookings/${code}`),
  cancelBooking: (code, reason) => request(`/api/bookings/${code}/cancel`, { method: 'POST', body: { reason } }),
  // Contact number stays editable while the trip is active (even in progress).
  updateBookingContact: (code, body) => request(`/api/bookings/${code}/contact`, { method: 'PATCH', body }),
  paymentConfig: () => request('/api/payments/config', { silent: true }),
  paymentInstructions: (code) => request(`/api/bookings/${code}/payment-instructions`),
  proofSignedUrl: (code, body) => request(`/api/bookings/${code}/payment-proof/signed-url`, { method: 'POST', body }),
  recordProof: (code, body) => request(`/api/bookings/${code}/payment-proof`, { method: 'POST', body }),
  // Card charge for a ride. The path is /bookings/:code/charge, not
  // /:code/charge, so the sibling /webhooks/tap route can never be matched
  // as a booking code.
  // The key belongs to the payment ATTEMPT, not to the call: it is what makes
  // a retry after a timeout land on the same gateway charge instead of a
  // second one. CardPaySection holds one per attempt and passes it in.
  bookingCardCharge: (code, body = {}, idempotencyKey) =>
    request(`/api/payments/bookings/${code}/charge`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey || crypto.randomUUID() },
    }),

  // --- public tracking (guest access with token) ---
  publicDeliveryTracking: (trackingId, token) => request(`/api/public/deliveries/${trackingId}`, { 
    silent: true, 
    headers: { 'X-Tracking-Token': token } 
  }),
  publicDeliveryTrackingSSE: (trackingId, token) => request(`/api/public/deliveries/${trackingId}/stream`, { 
    silent: true, 
    headers: { 'X-Tracking-Token': token } 
  }),

  // --- tracking ---
  tracking: (code) => request(`/api/tracking/${code}`, { silent: true }), // polled every 8s

  // --- location search / nearby places (Google Places + Geocoding via backend) ---
  // `token` is a per-typing-session token shared with locationDetails so the
  // autocomplete keystrokes bill as one cheap Places session.
  locationSearch: (q, coords = {}, token) => {
    const params = new URLSearchParams({ q });
    if (coords.lat != null && coords.lng != null) {
      params.set('lat', coords.lat);
      params.set('lng', coords.lng);
    }
    if (token) params.set('token', token);
    return request(`/api/locations/search?${params}`, { silent: true });
  },
  // Resolve a selected autocomplete prediction to its coordinates (ends the session).
  locationDetails: (id, token) => {
    const params = new URLSearchParams({ id });
    if (token) params.set('token', token);
    return request(`/api/locations/details?${params}`, { silent: true });
  },
  locationReverse: (lat, lng) => request(`/api/locations/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, { silent: true }),
  locationNearby: (lat, lng, radius = 1200) =>
    request(`/api/locations/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}`, { silent: true }),

  // --- admin (role enforced by backend) ---
  adminStats: () => request('/api/admin/stats'),
  adminReports: (range) => request(`/api/admin/reports?range=${encodeURIComponent(range)}`),
  adminList: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.booking_status) query.set('booking_status', params.booking_status);
    if (params.payment_status) query.set('payment_status', params.payment_status);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/bookings${qs ? `?${qs}` : ''}`);
  },
  adminDetail: (code) => request(`/api/admin/bookings/${code}`),
  adminVerify: (code, body = {}) => request(`/api/admin/bookings/${code}/verify-payment`, { method: 'POST', body }),
  adminReject: (code, reason) => request(`/api/admin/bookings/${code}/reject-payment`, { method: 'POST', body: { reason } }),
  adminAssign: (code, driver_id) => request(`/api/admin/bookings/${code}/assign-driver`, { method: 'POST', body: { driver_id } }),
  adminDrivers: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/drivers${qs ? `?${qs}` : ''}`);
  },
  adminApproveDriver: (driverId, approved = true) =>
    request(`/api/admin/drivers/${driverId}/approval`, { method: 'POST', body: { approved } }),
  adminDriverDocuments: (driverId) => request(`/api/admin/drivers/${driverId}/documents`),
  adminReviewDoc: (driverId, docId, body) =>
    request(`/api/admin/drivers/${driverId}/documents/${docId}/review`, { method: 'POST', body }),
  // Driver cash settlement (pick & drop cash rides)
  // Backend error log (admin Errors tab). The list is polled by a refresh
  // button rather than an interval, so these are not silent — an admin who
  // clicks refresh should be told if it failed.
  adminErrors: (query = '') => request(`/api/admin/errors${query}`),
  adminErrorSummary: () => request('/api/admin/errors/summary'),
  adminErrorDetail: (id) => request(`/api/admin/errors/${id}`),
  adminResolveError: (id, resolved = true) =>
    request(`/api/admin/errors/${id}/resolve`, { method: 'POST', body: { resolved } }),

  // --- super admin (0043): admins, settings, login activity ---------
  // Every one of these 403s for a plain admin server-side; hiding the tab
  // is presentation, not the control.
  adminAdmins: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/admins${qs ? `?${qs}` : ''}`);
  },
  adminCreateAdmin: (body) => request('/api/admin/admins', { method: 'POST', body }),
  adminUpdateAdmin: (id, body) => request(`/api/admin/admins/${id}`, { method: 'PATCH', body }),
  adminResetAdminPassword: (id, password) =>
    request(`/api/admin/admins/${id}/password`, { method: 'POST', body: { password } }),
  adminDeactivateAdmin: (id) => request(`/api/admin/admins/${id}/deactivate`, { method: 'POST' }),
  adminReactivateAdmin: (id) => request(`/api/admin/admins/${id}/reactivate`, { method: 'POST' }),
  adminSettings: () => request('/api/admin/settings'),
  adminUpdateSettings: (body) => request('/api/admin/settings', { method: 'PATCH', body }),
  adminLoginEvents: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    // Backward compatibility
    if (params.profile_id) query.set('profile_id', params.profile_id);
    if (params.since) query.set('since', params.since);
    const qs = query.toString();
    return request(`/api/admin/login-events${qs ? `?${qs}` : ''}`);
  },
  adminLoginSummary: (days = 30) => request(`/api/admin/login-events/summary?days=${days}`),

  adminDriverCash: () => request('/api/admin/drivers/cash'),
  adminSettleDriverCash: (driverId, body) =>
    request(`/api/admin/drivers/${driverId}/settle-cash`, { method: 'POST', body }),

  // --- driver (identity from token) ---
  driverAvailable: (lat, lng) => {
    const q = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
    return request(`/api/driver/available${q}`, { silent: true }); // polled feed
  },
  driverRides: () => request('/api/driver/rides', { silent: true }), // polled feed
  driverCash: () => request('/api/driver/cash', { silent: true }), // what the driver owes us
  driverAccept: (code) => request(`/api/driver/rides/${code}/accept`, { method: 'POST' }),
  // coords: the driver's current {lat,lng} — required server-side to confirm
  // "arrived" (GPS-vicinity check; a stale/missing fix is rejected, not
  // silently allowed through).
  driverStatus: (code, status, coords) =>
    request(`/api/driver/rides/${code}/status`, { method: 'POST', body: { status, lat: coords?.lat, lng: coords?.lng } }),
  // Give up an accepted ride before it starts -> auto re-dispatched to next-nearest.
  driverCancelRide: (code, reason) => request(`/api/driver/rides/${code}/cancel`, { method: 'POST', body: { reason } }),
  driverLocation: (body) => request('/api/driver/location', { method: 'POST', body, silent: true }), // 12s GPS ping
  // Which verticals this driver works: ['pick_drop','food','shop'].
  driverServices: (service_types) =>
    request('/api/driver/services', { method: 'PATCH', body: { service_types } }),
  // driver verification documents
  driverDocSignedUrl: (body) => request('/api/driver/documents/signed-url', { method: 'POST', body }),
  driverRecordDoc: (body) => request('/api/driver/documents', { method: 'POST', body }),
  driverDocuments: () => request('/api/driver/documents', { silent: true }),

  // --- notifications ---
  // The signed-in user's own notification history (last 50), powering the bell.
  listNotifications: () => request('/api/notifications', { silent: true }),
  notificationPushConfig: () => request('/api/notifications/push-config', { silent: true }),
  registerPushToken: (body) => request('/api/notifications/register', { method: 'POST', body, silent: true }),
  unregisterPushToken: (token) => request('/api/notifications/unregister', { method: 'POST', body: { token }, silent: true }),
  markNotificationsRead: () => request('/api/notifications/read', { method: 'PATCH', silent: true }),

  // --- food delivery: customer ---
  foodRestaurants: (params = '') => request(`/api/food/restaurants${params}`, { silent: true }),
  foodRestaurant: (id) => request(`/api/food/restaurants/${id}`, { silent: true }),
  foodCart: (merchantId) => request(`/api/food/cart?merchant_id=${encodeURIComponent(merchantId)}`, { silent: true }),
  foodCartAdd: (body) => request('/api/food/cart/items', { method: 'POST', body }),
  foodCartUpdate: (id, quantity) => request(`/api/food/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
  foodCartRemove: (id) => request(`/api/food/cart/items/${id}`, { method: 'DELETE' }),
  // Checkout: the backend recomputes all money and enforces the 30 SAR
  // minimum + 15 km radius; a 422 carries failure_reason for the UI.
  foodCheckout: (body, idempotencyKey) =>
    request('/api/food/orders', { method: 'POST', body, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}, silent: true }),
  foodOrders: ({ silent } = {}) => request('/api/food/orders', { silent: !!silent }),
  foodOrder: (code) => request(`/api/food/orders/${code}`, { silent: true }), // polled on tracking
  foodOrderContact: (code, contact_phone) =>
    request(`/api/food/orders/${code}/contact`, { method: 'PATCH', body: { contact_phone } }),
  foodPaymentInfo: (code) => request(`/api/food/orders/${code}/pay`),
  foodPaySignedUrl: (code, body) => request(`/api/food/orders/${code}/pay/signed-url`, { method: 'POST', body }),
  foodRecordPayment: (code, body) => request(`/api/food/orders/${code}/pay`, { method: 'POST', body }),
  foodCardCharge: (code, body = {}, idempotencyKey) =>
    request(`/api/food/orders/${code}/charge`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey || crypto.randomUUID() },
    }),
  foodEvent: (body) => request('/api/food/events', { method: 'POST', body, silent: true }),

  // --- ecommerce ("shop"): customer ---
  // Mirrors the food block one-for-one. Two differences worth knowing:
  //   * responses carry a banded `availability` ('in_stock'|'low'|'out'),
  //     never an exact stock count — exact inventory is withheld by the
  //     column grants in migration 0029
  //   * shopCheckout can fail with 409 out_of_stock in addition to the
  //     422 min_order / outside_radius that food has
  shopStores: (params = '') => request(`/api/shop/stores${params}`, { silent: true }),
  shopStore: (id) => request(`/api/shop/stores/${id}`, { silent: true }),
  shopCart: (merchantId) => request(`/api/shop/cart?merchant_id=${encodeURIComponent(merchantId)}`, { silent: true }),
  shopCartAdd: (body) => request('/api/shop/cart/items', { method: 'POST', body }),
  shopCartUpdate: (id, quantity) => request(`/api/shop/cart/items/${id}`, { method: 'PATCH', body: { quantity } }),
  shopCartRemove: (id) => request(`/api/shop/cart/items/${id}`, { method: 'DELETE' }),
  // Idempotency-Key stops a double-tap or a retry creating two orders — and,
  // because checkout reserves stock, two reservations.
  shopCheckout: (body, idempotencyKey) =>
    request('/api/shop/orders', {
      method: 'POST',
      body,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
      silent: true,
    }),
  shopOrders: () => request('/api/shop/orders'),
  shopOrder: (code) => request(`/api/shop/orders/${code}`, { silent: true }), // polled on tracking
  shopOrderContact: (code, contact_phone) =>
    request(`/api/shop/orders/${code}/contact`, { method: 'PATCH', body: { contact_phone } }),
  shopPaymentInfo: (code) => request(`/api/shop/orders/${code}/pay`),
  shopPaySignedUrl: (code, body) => request(`/api/shop/orders/${code}/pay/signed-url`, { method: 'POST', body }),
  shopRecordPayment: (code, body) => request(`/api/shop/orders/${code}/pay`, { method: 'POST', body }),
  shopCardCharge: (code, body = {}, idempotencyKey) =>
    request(`/api/shop/orders/${code}/charge`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey || crypto.randomUUID() },
    }),
  rateShopDriver: (code, body) =>
    request(`/api/shop/orders/${code}/rate-driver`, { method: 'POST', body, silent: true }),
  shopEvent: (body) => request('/api/shop/events', { method: 'POST', body, silent: true }),

  // --- food delivery: driver dispatch (Grab-style offers + deliveries) ---
  driverOffers: () => request('/api/driver/offers', { silent: true }), // polled while online
  driverOfferAccept: (id) => request(`/api/driver/offers/${id}/accept`, { method: 'POST', silent: true }),
  driverOfferDecline: (id) => request(`/api/driver/offers/${id}/decline`, { method: 'POST', silent: true }),
  driverDeliveries: () => request('/api/driver/deliveries', { silent: true }),
  driverOpenDeliveries: (lat, lng) => {
    const q = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : '';
    return request(`/api/driver/deliveries/available${q}`, { silent: true }); // polled feed
  },
  driverClaimDelivery: (code) => request(`/api/driver/deliveries/${code}/claim`, { method: 'POST' }),
  // Give up an accepted delivery before pickup -> auto re-dispatched to next-nearest.
  driverCancelDelivery: (code, reason) =>
    request(`/api/driver/deliveries/${code}/cancel`, { method: 'POST', body: { reason } }),
  // Photo proof is mandatory: upload first, then send the path with the status.
  driverDeliveryPhotoUrl: (code, body) => request(`/api/driver/deliveries/${code}/photo-url`, { method: 'POST', body }),
  // coords: the driver's current {lat,lng} — required server-side to confirm
  // picked_up/delivered are actually happening near the restaurant/customer.
  driverDeliveryStatus: (code, status, photo_path, coords) =>
    request(`/api/driver/deliveries/${code}/status`, {
      method: 'POST',
      body: { status, photo_path, lat: coords?.lat, lng: coords?.lng },
    }),

  // --- business owner / merchant ---
  // Vertical-agnostic endpoint returning { merchant: { id, name, vertical, ... } }
  // Used by MerchantPortal for auto-detection and admin vertical selection.
  merchantMe: () => request('/api/merchant/me'),
  merchantProfile: () => request('/api/merchant/profile'),
  merchantUpdateProfile: (body) => request('/api/merchant/profile', { method: 'PATCH', body }),
  merchantHours: () => request('/api/merchant/hours'),
  merchantSetHours: (hours) => request('/api/merchant/hours', { method: 'PUT', body: { hours } }),
  merchantSetAccepting: (accepting) =>
    request('/api/merchant/accepting-orders', {
      method: 'PATCH',
      body: { accepting_orders: accepting },
    }),
  merchantLogoSignedUrl: (body) => request('/api/merchant/logo/signed-url', { method: 'POST', body }),
  merchantLogoConfirm: (body) => request('/api/merchant/logo/confirm', { method: 'POST', body }),
  merchantMenuItemImageSignedUrl: (body) =>
    request('/api/merchant/menu/items/image/signed-url', { method: 'POST', body }),
  merchantMenuItemImageConfirm: (body) =>
    request('/api/merchant/menu/items/image/confirm', { method: 'POST', body }),
  merchantAnalytics: () => request('/api/merchant/analytics'),
  merchantMenu: () => request('/api/merchant/menu'),
  merchantAddCategory: (body) => request('/api/merchant/menu/categories', { method: 'POST', body }),
  merchantUpdateCategory: (id, body) => request(`/api/merchant/menu/categories/${id}`, { method: 'PATCH', body }),
  merchantDeleteCategory: (id) => request(`/api/merchant/menu/categories/${id}`, { method: 'DELETE' }),
  merchantAddItem: (body) => request('/api/merchant/menu/items', { method: 'POST', body }),
  merchantUpdateItem: (id, body) => request(`/api/merchant/menu/items/${id}`, { method: 'PATCH', body }),
  merchantDeleteItem: (id) => request(`/api/merchant/menu/items/${id}`, { method: 'DELETE' }),
  // Order management (the restaurant's own live incoming-orders dashboard).
  merchantOrders: (query = '') => request(`/api/merchant/orders${query}`),
  merchantAcceptOrder: (code) => request(`/api/merchant/orders/${code}/accept`, { method: 'POST', silent: true }),
  merchantRejectOrder: (code, reason) => request(`/api/merchant/orders/${code}/reject`, { method: 'POST', body: { reason } }),
  merchantOrderStatus: (code, status) => request(`/api/merchant/orders/${code}/status`, { method: 'PATCH', body: { status } }),
  // Withdraw an order the restaurant already accepted. `reason` is required
  // by the server — the customer is shown it verbatim.
  merchantCancelOrder: (code, reason) =>
    request(`/api/merchant/orders/${code}/cancel`, { method: 'POST', body: { reason } }),

  // --- store owner (ecommerce merchant portal) ---
  // Parallel to the block above. The store owner never sees net_price: it is
  // absent from every response here and rejected by every route schema, so
  // the markup stays an admin-only number.
  merchantShopProfile: () => request('/api/merchant/shop/profile'),
  merchantShopUpdateProfile: (body) => request('/api/merchant/shop/profile', { method: 'PATCH', body }),
  merchantShopImageSignedUrl: (body) =>
    request('/api/merchant/shop/images/signed-url', { method: 'POST', body }),
  merchantShopHours: () => request('/api/merchant/shop/hours'),
  merchantShopSetHours: (hours) =>
    request('/api/merchant/shop/hours', { method: 'PUT', body: { hours } }),
  merchantShopSetAccepting: (accepting) =>
    request('/api/merchant/shop/accepting-orders', {
      method: 'PATCH',
      body: { accepting_orders: accepting },
    }),
  merchantShopCatalogue: () => request('/api/merchant/shop/catalogue'),
  merchantShopAnalytics: () => request('/api/merchant/shop/analytics'),
  merchantShopAddCategory: (body) => request('/api/merchant/shop/categories', { method: 'POST', body }),
  merchantShopUpdateCategory: (id, body) =>
    request(`/api/merchant/shop/categories/${id}`, { method: 'PATCH', body }),
  merchantShopDeleteCategory: (id) =>
    request(`/api/merchant/shop/categories/${id}`, { method: 'DELETE' }),
  merchantShopAddProduct: (body) => request('/api/merchant/shop/products', { method: 'POST', body }),
  merchantShopUpdateProduct: (id, body) =>
    request(`/api/merchant/shop/products/${id}`, { method: 'PATCH', body }),
  merchantShopDeleteProduct: (id) => request(`/api/merchant/shop/products/${id}`, { method: 'DELETE' }),
  merchantShopAddVariant: (productId, body) =>
    request(`/api/merchant/shop/products/${productId}/variants`, { method: 'POST', body }),
  merchantShopUpdateVariant: (productId, variantId, body) =>
    request(`/api/merchant/shop/products/${productId}/variants/${variantId}`, { method: 'PATCH', body }),
  merchantShopDeleteVariant: (productId, variantId) =>
    request(`/api/merchant/shop/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
  merchantShopSetStock: (productId, body) =>
    request(`/api/merchant/shop/products/${productId}/stock`, { method: 'PATCH', body }),
  merchantShopInventory: () => request('/api/merchant/shop/inventory'),
  merchantShopOrders: () => request('/api/merchant/shop/orders'),
  merchantShopAcceptOrder: (code) =>
    request(`/api/merchant/shop/orders/${code}/accept`, { method: 'POST', silent: true }),
  merchantShopRejectOrder: (code, reason) =>
    request(`/api/merchant/shop/orders/${code}/reject`, { method: 'POST', body: { reason } }),
  merchantShopOrderStatus: (code, status) =>
    request(`/api/merchant/shop/orders/${code}/status`, { method: 'PATCH', body: { status } }),
  // Withdraw an order the store already accepted. `reason` is required by the
  // server — the customer is shown it verbatim.
  merchantShopCancelOrder: (code, reason) =>
    request(`/api/merchant/shop/orders/${code}/cancel`, { method: 'POST', body: { reason } }),

  // --- ecommerce: admin ---
  // The only block that sends or receives net_price. Everything else in this
  // file deals in list prices only.
  adminShopOverview: () => request('/api/admin/shop/overview'),
  adminShopStores: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/shop/stores${qs ? `?${qs}` : ''}`);
  },
  adminShopCreateStore: (body) => request('/api/admin/shop/stores', { method: 'POST', body }),
  adminShopUpdateStore: (id, body) => request(`/api/admin/shop/stores/${id}`, { method: 'PATCH', body }),
  adminShopDeleteStore: (id) => request(`/api/admin/shop/stores/${id}`, { method: 'DELETE' }),
  adminShopSuspend: (id, reason) =>
    request(`/api/admin/shop/stores/${id}/suspend`, { method: 'POST', body: { reason } }),
  adminShopReactivate: (id) => request(`/api/admin/shop/stores/${id}/reactivate`, { method: 'POST' }),
  adminShopCredit: (id, body) => request(`/api/admin/shop/stores/${id}/credit`, { method: 'POST', body }),
  adminShopStoreImageSignedUrl: (id, body) =>
    request(`/api/admin/shop/stores/${id}/image/signed-url`, { method: 'POST', body }),

  // Opening hours + "closed now" (0038). One merchant_hours table, so the
  // food and shop paths differ only in the URL prefix.
  adminShopHours: (id) => request(`/api/admin/shop/stores/${id}/hours`),
  adminShopSetHours: (id, hours) =>
    request(`/api/admin/shop/stores/${id}/hours`, { method: 'PUT', body: { hours } }),
  adminShopSetAccepting: (id, accepting) =>
    request(`/api/admin/shop/stores/${id}/accepting-orders`, {
      method: 'PATCH',
      body: { accepting_orders: accepting },
    }),
  adminFoodHours: (id) => request(`/api/admin/food/merchants/${id}/hours`),
  adminFoodSetHours: (id, hours) =>
    request(`/api/admin/food/merchants/${id}/hours`, { method: 'PUT', body: { hours } }),
  adminFoodSetAccepting: (id, accepting) =>
    request(`/api/admin/food/merchants/${id}/accepting-orders`, {
      method: 'PATCH',
      body: { accepting_orders: accepting },
    }),
  adminShopSetOwner: (id, body) => request(`/api/admin/shop/stores/${id}/owner`, { method: 'POST', body }),
  adminShopSetOwnerPassword: (id, body) =>
    request(`/api/admin/shop/stores/${id}/owner/password`, { method: 'POST', body }),
  adminShopCatalogue: (id, params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/shop/stores/${id}/catalogue${qs ? `?${qs}` : ''}`);
  },
  adminShopAddCategory: (id, body) =>
    request(`/api/admin/shop/stores/${id}/categories`, { method: 'POST', body }),
  adminShopUpdateCategory: (catId, body) =>
    request(`/api/admin/shop/categories/${catId}`, { method: 'PATCH', body }),
  adminShopDeleteCategory: (catId) => request(`/api/admin/shop/categories/${catId}`, { method: 'DELETE' }),
  adminShopAddProduct: (id, body) =>
    request(`/api/admin/shop/stores/${id}/products`, { method: 'POST', body }),
  adminShopUpdateProduct: (productId, body) =>
    request(`/api/admin/shop/products/${productId}`, { method: 'PATCH', body }),
  adminShopDeleteProduct: (productId) =>
    request(`/api/admin/shop/products/${productId}`, { method: 'DELETE' }),
  adminShopAddVariant: (productId, body) =>
    request(`/api/admin/shop/products/${productId}/variants`, { method: 'POST', body }),
  adminShopUpdateVariant: (productId, variantId, body) =>
    request(`/api/admin/shop/products/${productId}/variants/${variantId}`, { method: 'PATCH', body }),
  adminShopDeleteVariant: (productId, variantId) =>
    request(`/api/admin/shop/products/${productId}/variants/${variantId}`, { method: 'DELETE' }),
  adminShopInventory: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.merchant_id) query.set('merchant_id', params.merchant_id);
    if (params.low_stock_only) query.set('low_stock_only', params.low_stock_only);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/shop/inventory${qs ? `?${qs}` : ''}`);
  },
  adminShopOrders: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.payment_status) query.set('payment_status', params.payment_status);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/shop/orders${qs ? `?${qs}` : ''}`);
  },
  adminShopAcceptOrder: (code) =>
    request(`/api/admin/shop/orders/${code}/accept`, { method: 'POST', silent: true }),
  adminShopRejectOrder: (code, reason) =>
    request(`/api/admin/shop/orders/${code}/reject`, { method: 'POST', body: { reason } }),
  adminShopOrderStatus: (code, status) =>
    request(`/api/admin/shop/orders/${code}/status`, { method: 'PATCH', body: { status } }),
  adminShopVerifyPayment: (code, reference) =>
    request(`/api/admin/shop/orders/${code}/verify-payment`, { method: 'POST', body: { reference } }),
  adminShopRejectPayment: (code, reason) =>
    request(`/api/admin/shop/orders/${code}/reject-payment`, { method: 'POST', body: { reason } }),
  adminShopRefund: (code) => request(`/api/admin/shop/orders/${code}/refund`, { method: 'POST' }),
  // The refund queue: cancelled/rejected orders still marked paid.
  adminShopRefunds: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/shop/refunds${qs ? `?${qs}` : ''}`);
  },
  adminShopCancelOrder: (code, reason) =>
    request(`/api/admin/shop/orders/${code}/cancel`, { method: 'POST', body: { reason } }),
  adminShopAssignDriver: (code, driver_id) =>
    request(`/api/admin/shop/orders/${code}/assign-driver`, { method: 'POST', body: { driver_id } }),
  adminShopOrderPhotos: (code) => request(`/api/admin/shop/orders/${code}/photos`),
  adminShopSettlement: (from, to) =>
    request(`/api/admin/shop/settlement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // --- driver ratings (1-5 stars after a delivered order / completed trip) ---
  rateFoodDriver: (code, body) => request(`/api/food/orders/${code}/rate-driver`, { method: 'POST', body, silent: true }),
  rateRideDriver: (code, body) => request(`/api/bookings/${code}/rate-driver`, { method: 'POST', body, silent: true }),

  // --- food delivery: admin (admins run the restaurants — no owner accounts) ---
  adminFoodOverview: () => request('/api/admin/food/overview'),
  // Settlement report: what we owe each restaurant vs. our markup, by date range.
  adminFoodSettlement: (from, to) =>
    request(`/api/admin/food/settlement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  adminFoodMerchants: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/food/merchants${qs ? `?${qs}` : ''}`);
  },
  adminFoodCreateMerchant: (body) => request('/api/admin/food/merchants', { method: 'POST', body }),
  adminFoodUpdateMerchant: (id, body) => request(`/api/admin/food/merchants/${id}`, { method: 'PATCH', body }),
  adminFoodDeleteMerchant: (id) => request(`/api/admin/food/merchants/${id}`, { method: 'DELETE' }),
  adminFoodSuspend: (id, reason) => request(`/api/admin/food/merchants/${id}/suspend`, { method: 'POST', body: { reason } }),
  adminFoodReactivate: (id) => request(`/api/admin/food/merchants/${id}/reactivate`, { method: 'POST' }),
  adminFoodCredit: (id, body) => request(`/api/admin/food/merchants/${id}/credit`, { method: 'POST', body }),
  adminFoodMerchantMenu: (id) => request(`/api/admin/food/merchants/${id}/menu`),
  adminFoodAddCategory: (id, body) => request(`/api/admin/food/merchants/${id}/menu/categories`, { method: 'POST', body }),
  adminFoodUpdateCategory: (catId, body) => request(`/api/admin/food/categories/${catId}`, { method: 'PATCH', body }),
  adminFoodDeleteCategory: (catId) => request(`/api/admin/food/categories/${catId}`, { method: 'DELETE' }),
  adminFoodAddItem: (id, body) => request(`/api/admin/food/merchants/${id}/menu/items`, { method: 'POST', body }),
  adminFoodModerateItem: (id, body) => request(`/api/admin/food/items/${id}`, { method: 'PATCH', body }),
  adminFoodDeleteItem: (id) => request(`/api/admin/food/items/${id}`, { method: 'DELETE' }),
  adminFoodOrders: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.payment_status) query.set('payment_status', params.payment_status);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/food/orders${qs ? `?${qs}` : ''}`);
  },
  adminFoodAcceptOrder: (code) => request(`/api/admin/food/orders/${code}/accept`, { method: 'POST', silent: true }),
  adminFoodRejectOrder: (code, reason) => request(`/api/admin/food/orders/${code}/reject`, { method: 'POST', body: { reason } }),
  adminFoodOrderStatus: (code, status) => request(`/api/admin/food/orders/${code}/status`, { method: 'PATCH', body: { status } }),
  adminFoodVerifyPayment: (code) => request(`/api/admin/food/orders/${code}/verify-payment`, { method: 'POST' }),
  adminFoodRejectPayment: (code, reason) => request(`/api/admin/food/orders/${code}/reject-payment`, { method: 'POST', body: { reason } }),
  adminFoodCancelOrder: (code, reason) => request(`/api/admin/food/orders/${code}/cancel`, { method: 'POST', body: { reason } }),
  adminFoodRefund: (code) => request(`/api/admin/food/orders/${code}/refund`, { method: 'POST' }),
  adminFoodRefunds: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    return request(`/api/admin/food/refunds${qs ? `?${qs}` : ''}`);
  },
  adminFoodOrderPhotos: (code) => request(`/api/admin/food/orders/${code}/photos`),
  adminFoodAssignDriver: (code, driver_id) => request(`/api/admin/food/orders/${code}/assign-driver`, { method: 'POST', body: { driver_id } }),
  // Merchant image upload (logo/menu photo) -> PUBLIC bucket signed URL.
  adminFoodMerchantImageSignedUrl: (id, body) =>
    request(`/api/admin/food/merchants/${id}/image/signed-url`, { method: 'POST', body }),
  // Owner account provisioning (contract-signing step). The admin chooses the
  // password; the second call re-issues it if the owner loses it.
  adminFoodSetMerchantOwner: (id, body) =>
    request(`/api/admin/food/merchants/${id}/owner`, { method: 'POST', body }),
  adminFoodSetOwnerPassword: (id, body) =>
    request(`/api/admin/food/merchants/${id}/owner/password`, { method: 'POST', body }),

  // --- User Accounts (all roles) ---
  adminListUsers: async (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params.search) query.set('search', params.search);
    if (params.role) query.set('role', params.role);
    if (params.status) query.set('status', params.status);
    if (params.filters) query.set('filters', JSON.stringify(params.filters));
    const qs = query.toString();
    const res = await request(`/api/admin/users${qs ? `?${qs}` : ''}`);
    const users = Array.isArray(res?.users) ? res.users : Array.isArray(res?.data) ? res.data : [];
    const pagination = res?.pagination || {};
    return {
      ...res,
      users,
      total: res?.total ?? pagination.total ?? users.length,
      page: res?.page ?? pagination.page ?? params.page ?? 1,
      limit: res?.limit ?? pagination.limit ?? params.limit ?? users.length,
      totalPages: res?.totalPages ?? pagination.totalPages ?? 1,
    };
  },
  adminUpdateUserRole: (id, role) =>
    request(`/api/admin/users/${id}/role`, { method: 'PATCH', body: { role } }),
  adminDeactivateUser: (id) =>
    request(`/api/admin/users/${id}/deactivate`, { method: 'POST' }),
  adminReactivateUser: (id) =>
    request(`/api/admin/users/${id}/reactivate`, { method: 'POST' }),
  adminResetUserPassword: (id) =>
    request(`/api/admin/users/${id}/password`, { method: 'POST' }),

  // --- Admin Partner API (Integrations) ---
  adminPartnerCredentials: () => request('/api/admin/partner/credentials'),
  adminPartnerCreateCredential: (body) => request('/api/admin/partner/credentials', { method: 'POST', body }),
  adminPartnerRevokeCredential: (id) => request(`/api/admin/partner/credentials/${id}/revoke`, { method: 'POST' }),
  adminPartnerRotateCredential: (id) => request(`/api/admin/partner/credentials/${id}/rotate`, { method: 'POST' }),
  adminPartnerWebhookEndpoints: () => request('/api/admin/partner/webhook-endpoints'),
  adminPartnerCreateWebhookEndpoint: (body) => request('/api/admin/partner/webhook-endpoints', { method: 'POST', body }),
  adminPartnerUpdateWebhookEndpoint: (id, body) => request(`/api/admin/partner/webhook-endpoints/${id}`, { method: 'PATCH', body }),
  adminPartnerDeleteWebhookEndpoint: (id) => request(`/api/admin/partner/webhook-endpoints/${id}`, { method: 'DELETE' }),
  adminPartnerWebhookDeliveries: (endpointId, params = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);
    const qs = query.toString();
    return request(`/api/admin/partner/webhook-endpoints/${endpointId}/deliveries${qs ? `?${qs}` : ''}`);
  },
  adminPartnerReplayWebhookDelivery: (endpointId, deliveryId) =>
    request(`/api/admin/partner/webhook-endpoints/${endpointId}/deliveries/${deliveryId}/replay`, { method: 'POST' }),
};
