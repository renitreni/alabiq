// ---------------------------------------------------------------------
// Notification presentation: maps the backend notification_events `type`
// strings to a human title, an icon, a color tone, and a deep link so the
// in-app bell (and the full Notifications page) can render them nicely.
//
// Types are logged by the backend for BOTH services (spec section 5):
//   Pick & Drop rides -> ride_driver_accepted / on_the_way / arrived /
//                        trip_started / completed / thank_you / cancelled
//   Food delivery     -> food_order_* / food_payment_* / food_rider_assigned /
//                        food_thank_you ...
// ---------------------------------------------------------------------
import {
  Car,
  Navigation,
  MapPin,
  CheckCircle2,
  XCircle,
  Heart,
  Bike,
  UtensilsCrossed,
  CreditCard,
  Bell,
  Wallet,
  AlarmClock,
} from 'lucide-react';

// Where a notification opens when tapped. Codes deep-link to live tracking;
// without a code we fall back to the relevant history hub.
const rideHref = (code) => (code ? `/track/${code}` : '/transactions');
const ridePayHref = (code) => (code ? `/pay/${code}` : '/transactions');
const foodHref = (code) => (code ? `/food/track/${code}` : '/food/orders');

const META = {
  // --- Pick & Drop ride lifecycle ---
  ride_booking_confirmed: { title: 'Ride booking created', body: 'Complete payment so we can find your driver.', icon: CheckCircle2, tone: 'green', href: ridePayHref },
  ride_booking_created: { title: 'New ride booking', body: 'A customer created a new airport transfer booking.', icon: Car, tone: 'orange', href: () => '/admin' },
  ride_driver_accepted: { title: 'A driver accepted your trip', body: 'Your driver is on the way to you.', icon: Car, tone: 'green', href: rideHref },
  ride_driver_on_the_way: { title: 'Your driver is on the way', body: 'Track their live location on the map.', icon: Navigation, tone: 'blue', href: rideHref },
  ride_driver_arrived: { title: 'Your driver has arrived', body: 'Please head to the pickup point.', icon: MapPin, tone: 'green', href: rideHref },
  ride_trip_started: { title: "You're on your way", body: 'Your trip to the destination has started.', icon: Navigation, tone: 'blue', href: rideHref },
  ride_completed: { title: 'Trip completed', body: 'Your invoice is ready to download.', icon: CheckCircle2, tone: 'green', href: rideHref },
  ride_thank_you: { title: 'Thank you for riding with Alabiq', body: 'We hope to see you again soon!', icon: Heart, tone: 'orange', href: rideHref },
  ride_cancelled: { title: 'Your trip was cancelled', body: 'This booking was cancelled.', icon: XCircle, tone: 'red', href: rideHref },
  ride_finding_new_driver: { title: 'Finding you a new driver', body: 'Your previous driver became unavailable — a nearby driver is being assigned.', icon: Car, tone: 'orange', href: rideHref },
  ride_cancelled_by_you: { title: 'You cancelled a ride', body: 'It was passed on to the next-nearest driver.', icon: XCircle, tone: 'grey', href: () => '/driver' },
  ride_reclaimed: { title: 'A ride was reassigned', body: 'You went offline, so it was offered to another driver.', icon: XCircle, tone: 'grey', href: () => '/driver' },
  ride_offer: { title: 'New ride request', body: 'A nearby trip is available.', icon: Bell, tone: 'blue', href: () => '/driver' },

  // --- Food delivery lifecycle ---
  food_order_placed: { title: 'Food order placed', body: 'Your restaurant order was created successfully.', icon: CheckCircle2, tone: 'green', href: foodHref },
  admin_food_order_created: { title: 'New food order', body: 'A customer placed a new restaurant order.', icon: UtensilsCrossed, tone: 'orange', href: () => '/admin' },
  merchant_food_order_created: { title: 'New restaurant order', body: 'Review the new order in your restaurant portal.', icon: UtensilsCrossed, tone: 'orange', href: () => '/merchant' },
  delivery_offer: { title: 'New delivery request', body: 'A nearby food delivery is available.', icon: Bike, tone: 'blue', href: () => '/driver' },
  food_order_accepted: { title: 'Restaurant accepted your order', body: 'The kitchen will start preparing it shortly.', icon: CheckCircle2, tone: 'blue', href: foodHref },
  food_order_rejected: { title: 'Order rejected', body: 'The restaurant could not accept your order.', icon: XCircle, tone: 'red', href: foodHref },
  food_order_preparing: { title: 'Your order is being prepared', body: 'The restaurant is cooking your food.', icon: UtensilsCrossed, tone: 'blue', href: foodHref },
  // tone must be a TONE_CLASSES key (constants.js) — 'orange' is not one and
  // falls back to grey, which is why these use amber.
  food_order_preparing_reminder: { title: 'Start preparing this order', body: 'An order is still waiting. Tap "Start preparing" so the customer knows the kitchen began.', icon: AlarmClock, tone: 'amber', href: () => '/merchant' },
  // ?tab= lands on the Restaurant Orders tab rather than the overview — this
  // alert is only actionable there. AdminPage reads it on mount.
  admin_food_order_preparing_overdue: { title: 'Restaurant has not started preparing', body: 'An order is past the reminder window and still not in the kitchen.', icon: AlarmClock, tone: 'red', href: () => '/admin?tab=restaurant' },
  food_order_delayed: { title: 'Your order is taking a little longer', body: 'We are following up with the restaurant.', icon: AlarmClock, tone: 'amber', href: foodHref },
  food_order_ready: { title: 'Your order is ready', body: 'Waiting for a rider to pick it up.', icon: UtensilsCrossed, tone: 'blue', href: foodHref },
  food_rider_assigned: { title: 'A rider is assigned to your order', body: 'They are heading to the restaurant.', icon: Bike, tone: 'blue', href: foodHref },
  food_delivery_assigned: { title: 'New delivery assigned', body: 'Open the driver portal for delivery details.', icon: Bike, tone: 'blue', href: () => '/driver' },
  food_order_out_for_delivery: { title: 'Your order was picked up', body: 'Your rider is on the way to you.', icon: Bike, tone: 'blue', href: foodHref },
  food_finding_new_rider: { title: 'Finding you a new rider', body: 'Your previous rider became unavailable — a nearby rider is being assigned.', icon: Bike, tone: 'orange', href: foodHref },
  food_delivery_cancelled: { title: 'You cancelled a delivery', body: 'It was passed on to the next-nearest rider.', icon: XCircle, tone: 'grey', href: () => '/driver' },
  food_delivery_reclaimed: { title: 'A delivery was reassigned', body: 'You went offline, so it was offered to another rider.', icon: XCircle, tone: 'grey', href: () => '/driver' },
  food_order_delivered: { title: 'Your order was delivered', body: 'Enjoy your meal! Your receipt is ready.', icon: CheckCircle2, tone: 'green', href: foodHref },
  food_order_cancelled: { title: 'Your order was cancelled', body: 'This order will not be delivered.', icon: XCircle, tone: 'red', href: foodHref },
  food_thank_you: { title: 'Thank you for ordering with Alabiq', body: 'We hope you enjoyed your meal!', icon: Heart, tone: 'orange', href: foodHref },
  food_payment_confirmed: { title: 'Payment confirmed', body: 'Your payment was received successfully.', icon: CreditCard, tone: 'green', href: foodHref },
  food_payment_rejected: { title: 'Payment could not be verified', body: 'Please submit your payment again.', icon: XCircle, tone: 'red', href: foodHref },
  food_payment_refunded: { title: 'Payment refunded', body: 'Your payment has been refunded.', icon: Wallet, tone: 'grey', href: foodHref },

  // --- Merchant / system ---
  service_suspended: { title: 'Service suspended', body: 'Your account service was suspended.', icon: XCircle, tone: 'red', href: () => '/merchant' },
  credit_replenished: { title: 'Credit replenished', body: 'Your platform credit was topped up.', icon: Wallet, tone: 'green', href: () => '/merchant' },
};

const FALLBACK = { title: 'Notification', body: '', icon: Bell, tone: 'grey', href: () => '/notifications' };

export function notificationMeta(type, code = null) {
  const m = META[type] || FALLBACK;
  return {
    title: m.title,
    body: m.body,
    icon: m.icon,
    tone: m.tone,
    href: typeof m.href === 'function' ? m.href(code) : '/notifications',
  };
}

// Compact "3m ago" / "2h ago" / date for the notification list.
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
