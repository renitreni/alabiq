// ---------------------------------------------------------------------
// Invented data for the /admin/ferdz demo dashboard. Nothing here ever
// reaches the database — see demoApi.js for how it is served.
//
// Everything is derived from ONE seeded generator so the figures are
// identical on every reload and on everyone's screen. A demo whose totals
// shift when you refresh reads as broken.
//
// Dates are relative to load time, so the data never looks stale: the
// newest ride is minutes old and the revenue trend always ends on the
// current month.
// ---------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260826);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const round2 = (n) => Math.round(n * 100) / 100;
const uuid = (n) => `demo-${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`;

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

// Month 0 is the current (partial) month, 5 is the oldest.
function monthStart(back) {
  const d = new Date();
  d.setMonth(d.getMonth() - back, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Verified fares per month, oldest first. The whole point of the demo:
// a business settling into SAR 3-4k a month and still climbing.
const MONTHLY_REVENUE = [2140, 2480, 2870, 3210, 3630, 4110];

const PASSENGERS = [
  'Abdullah Al-Harbi', 'Sara Al-Qahtani', 'Mohammed Al-Otaibi', 'Noura Al-Zahrani',
  'Faisal Al-Dosari', 'Maria Santos', 'Khalid Al-Shammari', 'Reem Al-Ghamdi',
  'Yousef Al-Maliki', 'Joel Ramirez', 'Hind Al-Subaie', 'Omar Al-Rashid',
  'Lina Haddad', 'Tariq Al-Amri', 'Grace Mendoza', 'Ahmed Al-Juhani',
];

const DRIVER_NAMES = [
  'Bilal Ahmed', 'Rashid Khan', 'Emmanuel Cruz', 'Saeed Al-Balawi',
  'Imran Sheikh', 'Marlon Reyes', 'Hamza Al-Nasser', 'Zubair Ali',
  'Dennis Aquino', 'Yasir Al-Anazi', 'Noel Bautista', 'Adnan Farooq',
  'Sultan Al-Mutairi', 'Rico Villanueva', 'Waleed Al-Harthy',
];

const TRIP_TYPES = ['one_way', 'round_trip', 'hourly'];

const plate = () => `${pick(['A', 'B', 'J', 'R', 'T'])}${pick(['H', 'K', 'M', 'S'])}${pick(['A', 'D', 'N'])} ${Math.floor(between(1000, 9999))}`;
const mobile = () => `+9665${Math.floor(between(10000000, 99999999))}`;

// --- drivers ----------------------------------------------------------
// Two left unapproved so the "New drivers" attention card has work in it.
const drivers = DRIVER_NAMES.map((full_name, i) => ({
  id: uuid(100 + i),
  full_name,
  email: `${full_name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
  whatsapp_number: mobile(),
  mobile_number: mobile(),
  national_id: `2${Math.floor(between(100000000, 999999999))}`,
  vehicle_type: pick(['Sedan', 'SUV', 'Hiace', 'Pickup']),
  vehicle_plate: plate(),
  driver_approved: i >= DRIVER_NAMES.length - 2 ? false : true,
  created_at: new Date(now - between(20, 400) * DAY).toISOString(),
  // cash the driver is holding from cash rides, for the settlement screen
  cash_owed: i % 4 === 0 ? round2(between(40, 260)) : 0,
  cash_owed_limit: 500,
}));

const approvedDrivers = drivers.filter((d) => d.driver_approved);

// --- rides ------------------------------------------------------------
// Built month by month until each month's verified fares reach its target,
// so the revenue trend, the reports series and the booking list are all the
// same underlying rows and cannot disagree.
let rideSeq = 0;

function makeRide(createdAt, { booking_status, payment_status, payment_method }) {
  rideSeq += 1;
  const driver = ['driver_assigned', 'driver_on_the_way', 'arrived', 'in_progress', 'completed'].includes(booking_status)
    ? pick(approvedDrivers)
    : null;
  return {
    id: uuid(1000 + rideSeq),
    booking_code: `SM${String(10240 + rideSeq)}`,
    passenger_name: pick(PASSENGERS),
    passenger_whatsapp: mobile(),
    trip_type: pick(TRIP_TYPES),
    pickup_datetime: new Date(createdAt.getTime() + between(1, 30) * 60 * 60 * 1000).toISOString(),
    pickup_address: pick(['King Fahd Road, Riyadh', 'Al Olaya District, Riyadh', 'Exit 9, Riyadh', 'Al Malqa, Riyadh']),
    dropoff_address: pick(['King Khalid Airport', 'Riyadh Park Mall', 'Diplomatic Quarter', 'Al Nakheel District']),
    fare_amount: round2(between(25, 120)),
    currency: 'SAR',
    payment_method,
    payment_status,
    booking_status,
    driver_ride_status: booking_status === 'completed' ? 'completed' : null,
    assigned_driver_id: driver ? driver.id : null,
    created_at: createdAt.toISOString(),
  };
}

const rides = [];

MONTHLY_REVENUE.forEach((target, idx) => {
  const back = MONTHLY_REVENUE.length - 1 - idx;
  const start = monthStart(back);
  const end = back === 0 ? new Date(now) : monthStart(back - 1);
  const span = end.getTime() - start.getTime();
  const at = () => new Date(start.getTime() + rand() * span);

  let earned = 0;
  while (earned < target) {
    const ride = makeRide(at(), {
      booking_status: 'completed',
      payment_status: 'verified',
      payment_method: pick(['stc_pay', 'card', 'cash']),
    });
    // Don't overshoot the month's target on the last ride.
    if (earned + ride.fare_amount > target) ride.fare_amount = round2(target - earned);
    earned = round2(earned + ride.fare_amount);
    rides.push(ride);
  }

  // Every month also has rides that never became revenue.
  const cancelled = Math.floor(between(2, 5));
  for (let i = 0; i < cancelled; i += 1) {
    rides.push(makeRide(at(), {
      booking_status: 'cancelled',
      payment_status: pick(['refunded', 'awaiting_proof']),
      payment_method: pick(['stc_pay', 'card']),
    }));
  }
});

// Live and pending work, all in the last few days, so the attention cards
// and the "on the road" tile are never empty on the demo.
const recent = (daysBack) => new Date(now - daysBack * DAY);

[
  ['driver_on_the_way', 'verified', 0.02],
  ['in_progress', 'verified', 0.06],
  ['arrived', 'verified', 0.1],
  ['driver_assigned', 'verified', 0.15],
  ['confirmed', 'verified', 0.3],
  ['payment_under_review', 'proof_uploaded', 0.4],
  ['payment_under_review', 'proof_uploaded', 0.8],
  ['payment_under_review', 'proof_uploaded', 1.4],
  ['pending_payment', 'awaiting_proof', 0.5],
  ['pending_payment', 'awaiting_proof', 1.1],
  ['pending_payment', 'awaiting_proof', 2.2],
  ['pending_payment', 'awaiting_proof', 3.0],
].forEach(([booking_status, payment_status, daysBack]) => {
  rides.push(makeRide(recent(daysBack), {
    booking_status,
    payment_status,
    payment_method: payment_status === 'proof_uploaded' ? 'stc_pay' : pick(['stc_pay', 'card']),
  }));
});

rides.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

// --- restaurants and stores -------------------------------------------
const restaurants = [
  ['Aling Maria\'s Kitchen', 'Filipino'],
  ['Shawarma House', 'Middle Eastern'],
  ['Al Baik Corner', 'Fried Chicken'],
  ['Mandi Al Reef', 'Saudi'],
  ['Bombay Spice', 'Indian'],
  ['Green Bowl', 'Healthy'],
].map(([name, cuisine_type], i) => ({
  id: uuid(200 + i),
  name,
  cuisine_type,
  description: `${cuisine_type} favourites, delivered.`,
  logo_url: null,
  address: pick(['Al Olaya, Riyadh', 'Al Malqa, Riyadh', 'Al Nakheel, Riyadh']),
  street: 'King Abdulaziz Road',
  building_number: String(Math.floor(between(1000, 9999))),
  lat: round2(between(24.6, 24.85)),
  lng: round2(between(46.6, 46.8)),
  is_active: true,
  // one suspended, so the Food tab shows both states
  status: i === 4 ? 'suspended' : 'active',
  accepting_orders: true,
  credit_limit: 5000,
  credit_used: round2(between(200, 3400)),
  is_featured: i < 2,
  badge: i === 0 ? 'Popular' : null,
  owner_id: i < 4 ? uuid(300 + i) : null,
  created_at: new Date(now - between(60, 300) * DAY).toISOString(),
}));

const stores = [
  ['Riyadh Fresh Mart', 'Groceries'],
  ['Gadget Souq', 'Electronics'],
  ['Daily Pharmacy', 'Pharmacy'],
  ['Home Essentials', 'Household'],
].map(([name, cuisine_type], i) => ({
  id: uuid(400 + i),
  name,
  vertical: 'shop',
  cuisine_type,
  description: `${cuisine_type} delivered across Riyadh.`,
  logo_url: null,
  address: pick(['Al Olaya, Riyadh', 'Al Sahafah, Riyadh', 'Al Wurud, Riyadh']),
  street: 'Prince Turki Road',
  building_number: String(Math.floor(between(1000, 9999))),
  lat: round2(between(24.6, 24.85)),
  lng: round2(between(46.6, 46.8)),
  is_active: true,
  status: 'active',
  accepting_orders: true,
  credit_limit: 5000,
  credit_used: round2(between(150, 2600)),
  is_featured: i === 0,
  badge: null,
  owner_id: i < 3 ? uuid(500 + i) : null,
  created_at: new Date(now - between(60, 300) * DAY).toISOString(),
}));

// --- food and shop orders ---------------------------------------------
// VAT is added on top at 15% and snapshotted on the row, matching how the
// real orders are written.
const VAT_RATE = 0.15;

function moneyLines(subtotalLo, subtotalHi) {
  const subtotal = round2(between(subtotalLo, subtotalHi));
  const margin = round2(subtotal * between(0.14, 0.22));
  const deliveryFee = round2(pick([10, 12, 15]));
  const driverFee = round2(deliveryFee * 0.7);
  const vat = round2((subtotal + deliveryFee) * VAT_RATE);
  return {
    subtotal,
    margin,
    deliveryFee,
    driverFee,
    vat,
    total: round2(subtotal + deliveryFee + vat),
  };
}

const FOOD_ITEMS = [
  ['Chicken Adobo', 24], ['Beef Shawarma Plate', 32], ['Mandi Half Kilo', 48],
  ['Chicken Biryani', 28], ['Falafel Wrap', 14], ['Grilled Salmon Bowl', 55],
  ['Pancit Bihon', 22], ['Mixed Grill', 65], ['Hummus & Bread', 12],
];

const FOOD_STATUSES = ['delivered', 'delivered', 'delivered', 'out_for_delivery', 'preparing', 'accepted', 'pending'];

const foodOrders = Array.from({ length: 42 }, (_, i) => {
  const m = moneyLines(35, 180);
  const merchant = pick(restaurants);
  const status = i < 3 ? 'pending' : pick(FOOD_STATUSES);
  const paymentMethod = pick(['card', 'stc_pay', 'cash']);
  const paymentStatus = status === 'pending'
    ? pick(['awaiting', 'paid'])
    : paymentMethod === 'cash' && status !== 'delivered' ? 'pending' : 'paid';
  const createdAt = new Date(now - between(0.02, 45) * DAY);
  const driver = pick(approvedDrivers);
  const items = Array.from({ length: Math.floor(between(1, 4)) }, () => {
    const [name, price] = pick(FOOD_ITEMS);
    const quantity = Math.floor(between(1, 3));
    return {
      name_snapshot: name,
      size_snapshot: pick([null, 'Regular', 'Large']),
      quantity,
      line_total: round2(price * quantity),
    };
  });
  return {
    id: uuid(2000 + i),
    orderCode: `FD${String(4820 + i)}`,
    status,
    paymentStatus,
    paymentMethod,
    subtotal: m.subtotal,
    deliveryFee: m.deliveryFee,
    driverFee: m.driverFee,
    marginTotal: m.margin,
    vatAmount: m.vat,
    total: m.total,
    deliveryAddress: pick(['Al Olaya, Riyadh', 'Al Malqa, Riyadh', 'Al Nakheel, Riyadh']),
    deliveryStreet: 'King Abdulaziz Road',
    deliveryBuilding: String(Math.floor(between(1000, 9999))),
    merchantId: merchant.id,
    merchantName: merchant.name,
    customerName: pick(PASSENGERS),
    customerMobile: mobile(),
    items,
    riderName: ['out_for_delivery', 'delivered'].includes(status) ? driver.full_name : null,
    deliveryStatus: status === 'delivered' ? 'delivered' : status === 'out_for_delivery' ? 'on_the_way' : null,
    hasPickupPhoto: status === 'delivered',
    hasDeliveryPhoto: status === 'delivered',
    paymentReference: paymentStatus === 'awaiting' ? `STC${Math.floor(between(100000, 999999))}` : null,
    proofPath: null,
    proofUrl: null,
    createdAt: createdAt.toISOString(),
    acceptedAt: status === 'pending' ? null : new Date(createdAt.getTime() + 4 * 60 * 1000).toISOString(),
  };
});

// Cancelled after the customer had already paid online — the one condition
// that puts an order in the refund queue. Without these the Refunds panel
// on the Food tab is an empty screen.
[4, 11].forEach((i) => {
  Object.assign(foodOrders[i], {
    status: 'cancelled',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    rejectReason: 'Restaurant closed before the order was picked up',
  });
});

const SHOP_STATUSES = ['delivered', 'delivered', 'out_for_delivery', 'packed', 'accepted', 'pending'];
const SHOP_ITEMS = [
  ['Basmati Rice 5kg', 42], ['Olive Oil 1L', 38], ['USB-C Cable', 25],
  ['Paracetamol 500mg', 12], ['Laundry Detergent 3L', 34], ['Wireless Mouse', 65],
];

const shopOrders = Array.from({ length: 26 }, (_, i) => {
  const m = moneyLines(45, 260);
  const store = pick(stores);
  const status = i < 2 ? 'pending' : pick(SHOP_STATUSES);
  const paymentMethod = pick(['card', 'stc_pay', 'cash']);
  const createdAt = new Date(now - between(0.05, 45) * DAY);
  return {
    id: uuid(3000 + i),
    order_code: `SH${String(2310 + i)}`,
    status,
    subtotal: m.subtotal,
    delivery_fee: m.deliveryFee,
    driver_fee: m.driverFee,
    platform_margin_total: m.margin,
    vat_amount: m.vat,
    vat_rate: VAT_RATE,
    total: m.total,
    distance_km: round2(between(1.5, 14)),
    delivery_address: pick(['Al Olaya, Riyadh', 'Al Sahafah, Riyadh', 'Al Wurud, Riyadh']),
    delivery_street: 'Prince Turki Road',
    delivery_building: String(Math.floor(between(1000, 9999))),
    contact_phone: mobile(),
    payment_status: status === 'pending' ? pick(['awaiting', 'paid']) : 'paid',
    payment_method: paymentMethod,
    gateway_transaction_id: paymentMethod === 'card' ? `tap_${Math.floor(between(100000, 999999))}` : null,
    reject_reason: null,
    stock_reserved_at: createdAt.toISOString(),
    stock_released_at: null,
    created_at: createdAt.toISOString(),
    accepted_at: status === 'pending' ? null : new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString(),
    packed_at: null,
    ready_at: null,
    delivered_at: status === 'delivered' ? new Date(createdAt.getTime() + 55 * 60 * 1000).toISOString() : null,
    merchants: { id: store.id, name: store.name },
    shop_order_items: Array.from({ length: Math.floor(between(1, 4)) }, (_, k) => {
      const [name, price] = pick(SHOP_ITEMS);
      const quantity = Math.floor(between(1, 3));
      return {
        id: uuid(3500 + i * 10 + k),
        name_snapshot: name,
        variant_label_snapshot: null,
        sku_snapshot: `SKU-${Math.floor(between(1000, 9999))}`,
        unit_price: price,
        quantity,
        line_total: round2(price * quantity),
        margin_total: round2(price * quantity * 0.18),
      };
    }),
    shop_deliveries: status === 'delivered' || status === 'out_for_delivery'
      ? [{ status: status === 'delivered' ? 'delivered' : 'on_the_way', driver_id: pick(approvedDrivers).id, pickup_photo_path: 'demo', delivery_photo_path: status === 'delivered' ? 'demo' : null }]
      : [],
    profiles: { full_name: pick(PASSENGERS), mobile_number: mobile() },
  };
});

[3, 9].forEach((i) => {
  Object.assign(shopOrders[i], {
    status: i === 3 ? 'cancelled' : 'rejected',
    payment_status: 'paid',
    payment_method: 'card',
    reject_reason: i === 3 ? 'Customer cancelled after payment' : 'Item out of stock once picking started',
  });
});

// --- menus and catalogues ---------------------------------------------
const menusByMerchant = new Map(
  restaurants.map((m) => {
    const categories = ['Mains', 'Sides', 'Drinks'].map((name, ci) => ({
      id: uuid(600 + restaurants.indexOf(m) * 10 + ci),
      name,
      sort_order: ci,
      is_active: true,
    }));
    const items = categories.flatMap((c, ci) =>
      Array.from({ length: 3 }, (_, k) => {
        const [name, price] = FOOD_ITEMS[(ci * 3 + k) % FOOD_ITEMS.length];
        return {
          id: uuid(700 + restaurants.indexOf(m) * 20 + ci * 5 + k),
          category_id: c.id,
          name,
          description: 'Freshly prepared to order.',
          price,
          net_price: round2(price * 0.82),
          item_type: 'food',
          image_url: null,
          is_available: true,
          size_options: null,
        };
      })
    );
    return [m.id, { merchant: { id: m.id, name: m.name }, categories, items }];
  })
);

const cataloguesByStore = new Map(
  stores.map((s) => {
    const categories = ['Pantry', 'Household', 'Electronics'].map((name, ci) => ({
      id: uuid(800 + stores.indexOf(s) * 10 + ci),
      name,
      sort_order: ci,
      is_active: true,
    }));
    const products = categories.flatMap((c, ci) =>
      Array.from({ length: 3 }, (_, k) => {
        const [name, price] = SHOP_ITEMS[(ci * 3 + k) % SHOP_ITEMS.length];
        const stock = Math.floor(between(0, 40));
        return {
          id: uuid(900 + stores.indexOf(s) * 20 + ci * 5 + k),
          merchant_id: s.id,
          category_id: c.id,
          name,
          description: 'Everyday essential.',
          brand: pick(['Almarai', 'Nadec', 'Generic', 'Sadia']),
          unit: pick(['each', 'kg', 'pack']),
          weight_grams: Math.floor(between(100, 5000)),
          barcode: String(Math.floor(between(1e12, 9e12))),
          price,
          net_price: round2(price * 0.82),
          image_url: null,
          stock_quantity: stock,
          low_stock_threshold: 5,
          track_stock: true,
          is_available: stock > 0,
          created_at: new Date(now - between(30, 200) * DAY).toISOString(),
          product_variants: [],
        };
      })
    );
    return [s.id, { store: s, categories, products }];
  })
);

// --- error log --------------------------------------------------------
const ERROR_SAMPLES = [
  ['error', 'payments', 'Tap charge declined: insufficient funds', 'PaymentError', 'POST', '/api/food/orders/checkout', 402],
  ['error', 'dispatch', 'No driver accepted within the offer window', 'DispatchTimeout', 'POST', '/api/food/orders/FD4841/dispatch', 504],
  ['warn', 'storage', 'Signed URL generation retried once', 'StorageWarning', 'GET', '/api/admin/bookings/SM10312', 200],
  ['error', 'maps', 'Google Directions returned ZERO_RESULTS', 'MapsError', 'POST', '/api/rides/quote', 422],
  ['warn', 'rate-limit', 'Autocomplete bucket exhausted for one client', 'RateLimited', 'GET', '/api/places/autocomplete', 429],
  ['error', 'webhook', 'Tap webhook signature mismatch', 'SignatureError', 'POST', '/api/webhooks/tap', 401],
];

const errors = Array.from({ length: 18 }, (_, i) => {
  const [severity, label, message, error_name, method, path, status_code] = ERROR_SAMPLES[i % ERROR_SAMPLES.length];
  const occurred = new Date(now - between(0.01, 20) * DAY);
  return {
    id: uuid(4000 + i),
    occurred_at: occurred.toISOString(),
    severity,
    label,
    message,
    error_name,
    method,
    path,
    status_code,
    request_id: `req_${Math.floor(between(100000, 999999))}`,
    user_id: rand() > 0.5 ? uuid(100 + Math.floor(between(0, 14))) : null,
    user_email: rand() > 0.5 ? 'passenger@example.com' : null,
    user_role: pick(['passenger', 'driver', 'admin', null]),
    fingerprint: `fp_${label}_${error_name}`,
    suppressed_count: Math.floor(between(0, 6)),
    resolved_at: i > 11 ? new Date(occurred.getTime() + 3 * 60 * 60 * 1000).toISOString() : null,
    resolved_by: i > 11 ? uuid(1) : null,
    stack: `${error_name}: ${message}\n    at handler (/app/backend/controllers/${label}.js:88:19)\n    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    context: { demo: true },
  };
});

errors.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

// --- admins + login activity (0043) -----------------------------------
// Invented people, so the demo can show the Admins tab without exposing
// who the real admins are or what addresses they sign in from.
const admins = [
  {
    id: 'demo-admin-1',
    email: 'ferdzsabado@alabiq.com',
    full_name: 'Ferdz Sabado',
    mobile_number: '+966 50 000 0001',
    whatsapp_number: '+966 50 000 0001',
    role: 'admin',
    is_super_admin: true,
    disabled_at: null,
    disabled_by: null,
    env_managed: false,
    created_at: new Date(Date.now() - 240 * 86400000).toISOString(),
  },
  {
    id: 'demo-admin-2',
    email: 'operations@alabiq.com',
    full_name: 'Operations Desk',
    mobile_number: '+966 50 000 0002',
    whatsapp_number: null,
    role: 'admin',
    is_super_admin: false,
    disabled_at: null,
    disabled_by: null,
    env_managed: true,
    created_at: new Date(Date.now() - 120 * 86400000).toISOString(),
  },
  {
    id: 'demo-admin-3',
    email: 'night.shift@alabiq.com',
    full_name: 'Night Shift',
    mobile_number: null,
    whatsapp_number: null,
    role: 'admin',
    is_super_admin: false,
    disabled_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    disabled_by: 'demo-admin-1',
    env_managed: false,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
];

// A month of sign-ins, weighted so the two active accounts dominate and
// the deactivated one stops appearing nine days ago.
const loginEvents = [];
for (let i = 0; i < 90; i++) {
  const daysAgo = rand() * 30;
  const who =
    daysAgo > 9 && rand() < 0.25 ? admins[2] : rand() < 0.55 ? admins[0] : admins[1];
  loginEvents.push({
    id: `demo-login-${i}`,
    occurred_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    profile_id: who.id,
    email: who.email,
    role: 'admin',
    ip: `10.0.${Math.floor(rand() * 5)}.${Math.floor(rand() * 250) + 2}`,
    user_agent:
      rand() < 0.5
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36'
        : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15',
  });
}
loginEvents.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

// Mutable on purpose: demo mutations (approve a driver, verify a payment)
// write here so the change sticks on screen instead of snapping back.
export const store = {
  rides,
  drivers,
  restaurants,
  stores,
  foodOrders,
  shopOrders,
  errors,
  admins,
  loginEvents,
  menusByMerchant,
  cataloguesByStore,
  monthlyRevenue: MONTHLY_REVENUE,
  vatRate: VAT_RATE,
};

export { round2, monthStart };
