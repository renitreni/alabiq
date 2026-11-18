// ---------------------------------------------------------------------
// Ecommerce — live order tracking: /shop/track/:code
//
// Realtime first on the shop-order-<code> channel, with the standard 8 s
// polling fallback whenever the socket is not connected. Realtime
// accelerates; polling guarantees.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Phone, MessageCircle, ShoppingBag, MapPin, Clock } from 'lucide-react';
import { api } from '../lib/api';
import useReturnedCharge from '../lib/useReturnedCharge';
import { formatAddressDetail } from '../lib/address';
import { notifyMerchantCancelled } from '../lib/notify';
import { bearingDeg } from '../lib/geo';
import { useBroadcast } from '../lib/useBroadcast';
import {
  fmtSAR,
  shopStatusMeta,
  shopPaymentMeta,
  SHOP_TRACK_STEPS,
  trackStepIndex,
  SHOP_PAYMENT_METHODS,
  TONE_CLASSES,
} from '../lib/constants';
import { PortalShell, Card, Spinner, btnGhost } from '../components/ui';
import RoutedRideMap from '../components/RoutedRideMap';
import EditableContact from '../components/EditableContact';
import RateDriver from '../components/RateDriver';
import PaymentPanel from '../food/PaymentPanel';

const POLL_MS = 8000;
const TERMINAL = ['delivered', 'cancelled', 'rejected'];

function StatusStepper({ status, deliveryStatus }) {
  const activeIndex = trackStepIndex(SHOP_TRACK_STEPS, status, deliveryStatus);
  return (
    <ol className="space-y-3">
      {SHOP_TRACK_STEPS.map((step, i) => {
        const done = activeIndex >= 0 && i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={step.id} className="flex gap-3">
            <span
              className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                done ? 'bg-green-500' : active ? 'bg-brand-orange' : 'bg-brand-border'
              }`}
            />
            <span className="min-w-0">
              <span
                className={`block font-bold text-sm ${
                  active ? 'text-brand-black' : done ? 'text-brand-dark' : 'text-brand-grey'
                }`}
              >
                {step.label}
              </span>
              {active && <span className="block text-xs text-brand-grey mt-0.5">{step.desc}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ShopTrackPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Live rider position. Shop tracking previously drew only the store and the
  // delivery address, so the map was static for the entire delivery even
  // though a rider was moving the whole time.
  const [riderLive, setRiderLive] = useState(null); // { lat, lng, at, heading, speedKmh, etaMinutes }
  const [riderHeading, setRiderHeading] = useState(0);
  const prevRiderRef = useRef(null);

  const load = useCallback(() => {
    api
      .shopOrder(code)
      .then((d) => {
        setData(d);
        if (d?.rider?.location) {
          setRiderLive((prev) => {
            const fresh = d.rider.location;
            // Keep the newer of poll vs broadcast — they race.
            if (prev && new Date(prev.at) > new Date(fresh.at)) return prev;
            return { ...fresh, etaMinutes: d.rider.etaMinutes };
          });
        }
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [code]);

  // Back from Tap's hosted page: confirm the charge directly rather than
  // waiting on a webhook that may never arrive. No-op on every other visit.
  useReturnedCharge(load);

  useEffect(load, [load]);

  // Bearing derived from two consecutive fixes — the fallback for devices with
  // no compass. The chip's own reading is preferred at render (see `heading`).
  useEffect(() => {
    if (!riderLive?.lat || !riderLive?.lng) return;
    const prev = prevRiderRef.current;
    const cur = { lat: riderLive.lat, lng: riderLive.lng };
    if (prev && (prev.lat !== cur.lat || prev.lng !== cur.lng)) {
      const b = bearingDeg(prev, cur);
      if (b != null) setRiderHeading(b);
    }
    prevRiderRef.current = cur;
  }, [riderLive?.lat, riderLive?.lng]);

  const heading = riderLive?.heading ?? riderHeading;

  // The store withdrew an order it had already accepted. Announced once — the
  // ref, not the status, is what stops the 8 s poll re-firing the modal — and
  // then left as a banner below so it survives the dismissal.
  const cancelAnnounced = useRef(false);
  // Not named `order`: the render body destructures that name out of `data`
  // further down, once it is known to be loaded.
  const loadedOrder = data?.order;
  useEffect(() => {
    const o = loadedOrder;
    if (!o || o.status !== 'cancelled' || o.cancelled_by !== 'merchant') return;
    if (cancelAnnounced.current) return;
    cancelAnnounced.current = true;
    notifyMerchantCancelled({
      noun: 'store',
      reason: o.reject_reason,
      // Only when money was actually taken. Cash was never collected.
      refundLabel: o.payment_status === 'paid' ? fmtSAR(o.total) : null,
    });
  }, [loadedOrder]);

  const status = data?.order?.status;
  const realtimeEnabled = !!status && !TERMINAL.includes(status);
  // A GPS ping only moves the pin; anything else is a real state change and
  // needs a refetch. Previously every payload triggered a full reload, which
  // at GPS cadence would be a request per ping.
  const connected = useBroadcast(
    `shop-order-${code}`,
    {
      status: (payload) => {
        if (payload && payload.riderLocation) {
          setRiderLive({ ...payload.riderLocation, etaMinutes: payload.riderEtaMinutes ?? null });
        } else {
          load();
        }
      },
    },
    realtimeEnabled
  );

  // Polling fallback: only while the socket is down and the order is live.
  useEffect(() => {
    if (connected || !realtimeEnabled) return undefined;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [connected, realtimeEnabled, load]);

  if (error) {
    return (
      <PortalShell title="Track order" onBack={() => navigate('/shop/orders')}>
        <Card className="p-8 text-center">
          <p className="font-bold text-brand-black">{error}</p>
        </Card>
      </PortalShell>
    );
  }

  if (!data) {
    return (
      <PortalShell title="Track order">
        <div className="flex justify-center py-16">
          <Spinner className="!w-8 !h-8" />
        </div>
      </PortalShell>
    );
  }

  const { order, items, store, rider, driverRating } = data;
  const statusMeta = shopStatusMeta(order.status);
  const paymentMeta = shopPaymentMeta(order.payment_status);
  const awaitingOnlinePayment =
    order.payment_method !== 'cash' && ['awaiting', 'failed'].includes(order.payment_status);

  const markers = [];
  if (store?.lat != null && store?.lng != null) {
    markers.push({ key: 'store', lat: store.lat, lng: store.lng, type: 'pickup', label: store.name });
  }
  if (order.delivery_lat != null && order.delivery_lng != null) {
    markers.push({
      key: 'drop',
      lat: order.delivery_lat,
      lng: order.delivery_lng,
      type: 'dropoff',
      label: 'Delivery',
    });
  }
  // The moving rider. Stable key so the map tweens this marker between fixes
  // instead of destroying and recreating it (which would snap, not glide).
  if (riderLive?.lat != null && riderLive?.lng != null) {
    markers.push({
      key: 'rider',
      lat: riderLive.lat,
      lng: riderLive.lng,
      type: 'driver',
      label: rider?.name || 'Your rider',
      heading,
    });
  }

  const dropoff =
    order.delivery_lat != null ? { lat: order.delivery_lat, lng: order.delivery_lng } : null;
  const storePoint = store?.lat != null ? { lat: store.lat, lng: store.lng } : null;
  // Route the leg the rider is actually on: to the store before pickup, to the
  // customer after it. Before a rider is assigned, show store -> customer.
  // The delivery row is the finer signal — 'assigned' means a rider has the
  // job but has not collected yet, while the order still reads 'ready'.
  const deliveryStatus = data?.delivery?.status ?? data?.rider?.status ?? null;
  const pickedUp = order.status === 'out_for_delivery' || deliveryStatus === 'picked_up';
  // Once the rider physically has the order, their live ETA is the honest
  // number; before that the server's floored band covers the packing stage.
  const liveRiderEta = riderLive?.etaMinutes ?? rider?.etaMinutes ?? null;
  const etaLabel = pickedUp && liveRiderEta != null ? `${liveRiderEta} min` : (data?.eta?.label ?? null);
  const routeFrom = riderLive ? { lat: riderLive.lat, lng: riderLive.lng } : storePoint;
  const routeTo = riderLive && !pickedUp ? storePoint : dropoff;

  return (
    <PortalShell
      title={store?.name || 'Your order'}
      subtitle={order.order_code}
      onBack={() => navigate('/shop/orders')}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${TONE_CLASSES[statusMeta.tone]}`}>
          {statusMeta.label}
        </span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${TONE_CLASSES[paymentMeta.tone]}`}>
          {paymentMeta.label}
        </span>
        {connected && realtimeEnabled && (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold border border-green-200 bg-green-50 text-green-700">
            Live
          </span>
        )}
      </div>

      {order.status === 'rejected' && order.reject_reason && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {order.reject_reason}
        </div>
      )}

      {/* Survives dismissing the modal above — a customer who closes it should
          still be able to find out what happened and what is owed. */}
      {order.status === 'cancelled' && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <p className="font-bold">
            {order.cancelled_by === 'merchant'
              ? 'The store cancelled this order'
              : 'This order was cancelled'}
          </p>
          {order.reject_reason && <p className="mt-1 font-medium">{order.reject_reason}</p>}
          {order.payment_status === 'paid' && (
            <p className="mt-1 font-medium">
              Your payment of {fmtSAR(order.total)} will be refunded — usually within a few hours,
              and up to one working day.
            </p>
          )}
        </div>
      )}

      {/* ETA hero — the real Google driving time, floored at 45 minutes to
          cover the packing stage a routing API cannot see. Once the rider
          has the order their own live ETA is the honest number. */}
      {etaLabel && (
        <Card className="p-5 mb-4 bg-gradient-to-br from-brand-orange/10 to-white">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl font-black text-brand-black leading-none tabular-nums">{etaLabel}</p>
              <p className="text-sm font-bold text-brand-dark mt-2">
                {pickedUp ? 'Your rider is heading to you' : 'Estimated arrival'}
              </p>
            </div>
            <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
              <Clock className="w-7 h-7 text-brand-orange" />
            </div>
          </div>
        </Card>
      )}

      {awaitingOnlinePayment && (
        <div className="mb-4">
          <PaymentPanel code={order.order_code} vertical="shop" onPaid={load} />
        </div>
      )}

      {markers.length > 0 && (
        <Card className="p-0 overflow-hidden mb-4">
          <RoutedRideMap
            markers={markers}
            from={routeFrom}
            to={routeTo}
            height={240}
            follow={!!riderLive}
            followTarget={pickedUp ? dropoff : storePoint}
          />
        </Card>
      )}

      <Card className="p-4 mb-4">
        <StatusStepper status={order.status} deliveryStatus={deliveryStatus} />
      </Card>

      {rider && (
        <Card className="p-4 mb-4">
          <p className="text-xs text-brand-grey mb-2">Your rider</p>
          <div className="flex items-center justify-between gap-3">
            <p className="font-bold text-brand-black">{rider.name || 'Rider'}</p>
            {rider.phone && (
              <div className="flex gap-2">
                <a href={`tel:${rider.phone}`} className={btnGhost + ' !py-1.5 !px-3 text-sm'}>
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href={`https://wa.me/${rider.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btnGhost + ' !py-1.5 !px-3 text-sm'}
                >
                  <MessageCircle className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Where it is coming FROM. The API has always returned the store's
          address; only the food tracking page rendered it. */}
      {store && (
        <Card className="p-4 mb-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-orange/15 to-brand-red/10 flex items-center justify-center overflow-hidden shrink-0">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <ShoppingBag className="w-5 h-5 text-brand-orange/60" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-brand-grey">Collecting from</p>
            <p className="font-bold text-brand-dark truncate">{store.name}</p>
            {store.address && (
              <p className="text-xs text-brand-grey truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" /> {store.address}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="p-4 mb-4">
        <p className="text-xs text-brand-grey mb-2">Delivering to</p>
        <p className="text-sm font-medium text-brand-dark flex gap-2">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-brand-grey" />
          {formatAddressDetail({
            street: order.delivery_street,
            building: order.delivery_building,
            address: order.delivery_address,
          })}
        </p>
        <div className="mt-3">
          <EditableContact
            value={order.contact_phone}
            editable={!TERMINAL.includes(order.status)}
            onSave={async (next) => {
              await api.shopOrderContact(order.order_code, next);
              load();
            }}
          />
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <p className="font-bold text-brand-black mb-3 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4" /> Your items
        </p>
        <div className="space-y-2 text-sm">
          {(items || []).map((it) => (
            <div key={it.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="font-medium text-brand-dark">
                  {it.quantity} x {it.name_snapshot}
                </span>
                {it.variant_label_snapshot && (
                  <span className="text-brand-grey"> ({it.variant_label_snapshot})</span>
                )}
                {it.sku_snapshot && (
                  <span className="block text-[11px] font-mono text-brand-grey">{it.sku_snapshot}</span>
                )}
              </span>
              <span className="font-bold shrink-0">{fmtSAR(it.line_total)}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-brand-border space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-grey">Subtotal</span>
            <span className="font-bold">{fmtSAR(order.subtotal)}</span>
          </div>
          {/* delivery_fee INCLUDES the surcharge, so the base line is the
              difference — the two must add up to what was charged. */}
          {Number(order.delivery_surcharge) > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-brand-grey">Delivery</span>
                <span className="font-bold">
                  {fmtSAR(Number(order.delivery_fee) - Number(order.delivery_surcharge))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-grey">
                  Distance surcharge
                  {order.distance_km != null && (
                    <span className="text-brand-grey/70"> ({order.distance_km} km)</span>
                  )}
                </span>
                <span className="font-bold">{fmtSAR(order.delivery_surcharge)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-brand-grey">Delivery</span>
              <span className="font-bold">{fmtSAR(order.delivery_fee)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-brand-grey">VAT ({Math.round((order.vat_rate || 0) * 100)}%)</span>
            <span className="font-bold">{fmtSAR(order.vat_amount)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-brand-border">
            <span className="font-black text-brand-black">Total</span>
            <span className="font-black text-brand-orange">{fmtSAR(order.total)}</span>
          </div>
          <p className="text-xs text-brand-grey pt-1">
            Paid with {SHOP_PAYMENT_METHODS[order.payment_method] || order.payment_method}
          </p>
        </div>
      </Card>

      {order.status === 'delivered' && rider && (
        <RateDriver kind="shop" code={order.order_code} driverName={rider.name} existing={driverRating} />
      )}
    </PortalShell>
  );
}
