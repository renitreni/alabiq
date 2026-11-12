// DEMO-ONLY — one demo booking per demo customer (demo.customerN@alabiq.com).
//   npm run seed:customers:bookings
//
// Every booking is tagged DEMO_TAG in notes, so `npm run seed:clean` removes them.
// Pickups are at each customer's Riyadh district; dropoff is King Khalid Intl T1.
const {
  DEMO_TAG, database, findUserByEmail, insertRow, insertRows, frontendBase,
} = require('./_demo-lib');

// Approximate center of each district (lat/lng).
const DISTRICTS = {
  'Al Olaya, Riyadh': { lat: 24.6913, lng: 46.6852 },
  'Al Malqa, Riyadh': { lat: 24.8175, lng: 46.6168 },
  'Hittin, Riyadh': { lat: 24.7950, lng: 46.6140 },
  'Al Rawdah, Riyadh': { lat: 24.7530, lng: 46.7713 },
  'Al Narjis, Riyadh': { lat: 24.8600, lng: 46.6760 },
};
const AIRPORT = { lat: 24.9576, lng: 46.7012, address: 'King Khalid Intl — Terminal 1' };

const HOUR = 3600000;
const DAY = 24 * HOUR;

// One booking spec per demo customer email. `pickupInMs` is relative to now.
const SPECS = [
  {
    email: 'demo.customer1@alabiq.com',
    pickupInMs: 2 * HOUR, passengers: 2, luggage: 2, fare: 103.75,
    status: { payment_status: 'verified', booking_status: 'confirmed', verification_mode: 'test_auto', confirmed_at: true },
  },
  {
    email: 'demo.customer2@alabiq.com',
    pickupInMs: 5 * HOUR, passengers: 1, luggage: 1, fare: 96.50,
    status: { payment_status: 'awaiting_proof', booking_status: 'pending_payment' },
  },
  {
    email: 'demo.customer3@alabiq.com',
    pickupInMs: 1 * DAY + 3 * HOUR, passengers: 4, luggage: 4, fare: 118.25,
    status: { payment_status: 'verified', booking_status: 'confirmed', verification_mode: 'test_auto', confirmed_at: true },
  },
  {
    email: 'demo.customer4@alabiq.com',
    pickupInMs: 2 * DAY + 6 * HOUR, passengers: 2, luggage: 3, fare: 89.99,
    status: { payment_status: 'verified', booking_status: 'confirmed', verification_mode: 'test_auto', confirmed_at: true },
  },
  {
    email: 'demo.customer5@alabiq.com',
    pickupInMs: 3 * DAY + 9 * HOUR, passengers: 1, luggage: 0, fare: 110.00,
    status: { payment_status: 'awaiting_proof', booking_status: 'pending_payment' },
  },
];

async function run() {
  const now = Date.now();
  const results = [];

  for (const spec of SPECS) {
    const user = await findUserByEmail(spec.email);
    if (!user) throw new Error(`Demo customer not found: ${spec.email} (run seed:customers first)`);

    const { rows: [profile] } = (await database.query(
      'SELECT full_name, whatsapp_number, address FROM public.profiles WHERE id=$1', [user.id],
    ));
    const home = DISTRICTS[profile.address] || DISTRICTS['Al Olaya, Riyadh'];

    const pickupAt = now + spec.pickupInMs;
    const booking = await insertRow('bookings', {
      user_id: user.id,
      trip_type: 'house_to_airport',
      airport_terminal: AIRPORT.address,
      pickup_address: profile.address,
      pickup_lat: home.lat,
      pickup_lng: home.lng,
      dropoff_address: AIRPORT.address,
      dropoff_lat: AIRPORT.lat,
      dropoff_lng: AIRPORT.lng,
      pickup_datetime: new Date(pickupAt).toISOString(),
      passenger_count: spec.passengers,
      luggage_count: spec.luggage,
      notes: DEMO_TAG,
      passenger_name: profile.full_name,
      passenger_whatsapp: profile.whatsapp_number,
      passenger_email: spec.email,
      fare_amount: spec.fare,
      distance_km: (28 + spec.fare / 9).toFixed(2),
      total_amount: spec.fare,
      currency: 'SAR',
      payment_method: 'stcpay',
      ...spec.status,
      ...(spec.status.confirmed_at ? { confirmed_at: new Date(now).toISOString() } : {}),
      created_at: new Date(now - 20 * 60000).toISOString(),
    });

    const ev = (minsAgo, event_type, title, message) => ({
      booking_id: booking.id, event_type, title, message,
      created_at: new Date(now - minsAgo * 60000).toISOString(),
    });
    const events = [ev(20, 'booking_created', 'Booking created', 'Your booking has been created. Please continue to payment.')];
    if (spec.status.payment_status === 'verified') {
      events.push(
        ev(18, 'proof_uploaded', 'Payment proof uploaded', 'We received your payment proof. It is now under review.'),
        ev(17, 'payment_verified', 'Payment verified', 'Your payment has been verified. Finding you a driver…'),
      );
    }
    await insertRows('tracking_events', events);

    results.push({ email: spec.email, code: booking.booking_code, pickup: profile.address, when: new Date(pickupAt).toISOString(), status: booking.booking_status });
  }

  console.log('\n✅ Demo bookings created for all 5 customers');
  for (const r of results) {
    console.log(`   ${r.email}  ${r.code}  ${r.pickup}  @ ${r.when}  [${r.status}]`);
    console.log(`   Track: ${frontendBase()}/track/${r.code}`);
  }
  console.log();
}

run().catch((e) => { console.error('seed-customer-bookings failed:', e.message || e); process.exit(1); });
