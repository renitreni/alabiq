// ---------------------------------------------------------------------
// Driver dispatch UI (Grab-style), mounted inside DriverPage.
//   1. Exclusive offer card: when this driver is the nearest online one,
//      a food delivery / ride offer appears with a live 30-second
//      countdown and Accept / Decline. On timeout it silently moves to
//      the next driver (the backend cascade).
//   2. My deliveries: the food orders this driver is carrying, with
//      Picked up -> Delivered actions and customer contact.
//   3. Open deliveries: jobs whose cascade exhausted — first come, first
//      served (accepting is still atomic server-side).
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, Check, X, MapPin, Phone, MessageCircle, Store, Timer, Camera, Banknote, Navigation } from 'lucide-react';
import { api } from '../lib/api';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled, uploadProofFile } from '../lib/gatewayClient';
import { fmtSAR, whatsappLink, googleMapsNavLink } from '../lib/constants';
import { formatAddressDetail } from '../lib/address';
import { notifyAlert } from '../lib/notify';
import { Card, Badge, Spinner, btnPrimary, btnGhost, fileInputClass } from '../components/ui';

const OFFERS_POLL_MS = 5000;
const POOL_POLL_MS = 15000;

function Countdown({ expiresAt }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [expiresAt]);
  return (
    <div className={`flex items-center gap-1.5 font-black tabular-nums text-lg ${left <= 10 ? 'text-red-600' : 'text-brand-orange'}`}>
      <Timer className="w-5 h-5" />
      {left}s
    </div>
  );
}

function OfferCard({ offer, busy, onAccept, onDecline }) {
  // Food and shop offers render the SAME card — the rider does the same job
  // either way. Only the pickup noun changes.
  const isDelivery = offer.kind === 'food' || offer.kind === 'shop';
  const job = offer.food || offer.shop;
  const pickupNoun = offer.kind === 'shop' ? 'Store' : 'Restaurant';
  return (
    <Card className="p-4 border-2 border-brand-orange/60 shadow-lg shadow-brand-orange/10 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <Badge tone="amber">
          {isDelivery ? <Bike className="w-3.5 h-3.5" /> : null}
          {isDelivery ? 'New delivery offer' : 'New ride offer'}
        </Badge>
        <Countdown expiresAt={offer.expiresAt} />
      </div>

      {isDelivery && job && (
        <div className="space-y-1 text-sm">
          <p className="font-black text-brand-black flex items-center gap-1.5">
            <Store className="w-4 h-4 text-brand-orange shrink-0" /> {job.merchantName || pickupNoun}
          </p>
          {job.pickupAddress && (
            <p className="text-brand-grey text-xs truncate">
              Pick up: {formatAddressDetail({ street: job.pickupStreet, building: job.pickupBuilding, address: job.pickupAddress })}
            </p>
          )}
          <p className="text-brand-grey text-xs truncate">
            Deliver to: {formatAddressDetail({ street: job.dropoffStreet, building: job.dropoffBuilding, address: job.dropoffAddress })}
          </p>
          <p className="text-xs">
            <span className="text-brand-grey">Order value:</span>{' '}
            <span className="font-bold text-brand-dark">{fmtSAR(job.total)}</span>
            {offer.distanceKm != null && (
              <span className="text-brand-grey"> · {offer.distanceKm} km away</span>
            )}
          </p>
        </div>
      )}
      {!isDelivery && offer.ride && (
        <div className="space-y-1 text-sm">
          <p className="font-black text-brand-black">Airport transfer · {fmtSAR(offer.ride.fareAmount)}</p>
          <p className="text-brand-grey text-xs truncate">
            From: {formatAddressDetail({ street: offer.ride.pickupStreet, building: offer.ride.pickupBuilding, address: offer.ride.pickupAddress })}
          </p>
          <p className="text-brand-grey text-xs truncate">
            To: {formatAddressDetail({ street: offer.ride.dropoffStreet, building: offer.ride.dropoffBuilding, address: offer.ride.dropoffAddress })}
          </p>
          {offer.distanceKm != null && (
            <p className="text-xs text-brand-grey">{offer.distanceKm} km from you</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button type="button" disabled={busy} onClick={() => onAccept(offer)} className={btnPrimary + ' flex-1 !py-3'}>
          {busy ? <Spinner className="!border-white/40 !border-t-white" /> : <><Check className="w-4 h-4" /> Accept</>}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecline(offer)}
          className={btnGhost + ' !py-3 !text-red-600 !border-red-200 hover:!bg-red-50'}
        >
          <X className="w-4 h-4" /> Pass
        </button>
      </div>
    </Card>
  );
}

function DeliveryCard({ delivery, busy, onStatus, onCancel }) {
  const enRoute = delivery.orderStatus === 'out_for_delivery';
  const [photo, setPhoto] = useState(null);
  const nextStatus = enRoute ? 'delivered' : 'picked_up';
  // Navigate to the pickup point before pickup, then to the customer.
  const pickupNoun = delivery.kind === 'shop' ? 'store' : 'restaurant';
  // These coordinates come straight from the database (orders.delivery_lat /
  // merchants.lat) with no centroid guessing in the path, so they are already
  // the exact spot the customer pinned. The address rides along as a fallback
  // because merchants.lat is nullable — an unpinned store would otherwise
  // leave the rider with no navigation at all.
  const navTarget = enRoute
    ? { lat: delivery.dropoffLat, lng: delivery.dropoffLng, address: delivery.dropoffAddress }
    : { lat: delivery.merchant?.lat, lng: delivery.merchant?.lng, address: delivery.merchant?.address };
  const navUrl = googleMapsNavLink(navTarget);

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono font-bold text-brand-dark">{delivery.orderCode}</p>
        <Badge tone={enRoute ? 'blue' : 'amber'}>
          {enRoute ? 'Delivering' : `Waiting at ${pickupNoun}`}
        </Badge>
      </div>
      <div className="mt-2 space-y-1 text-sm">
        <p className="text-brand-dark flex items-start gap-1.5">
          <Store className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">{delivery.merchant?.name || (delivery.kind === 'shop' ? 'Store' : 'Restaurant')}</span>
            {delivery.merchant?.address && (
              <span className="text-brand-grey">
                {' · '}
                {formatAddressDetail({
                  street: delivery.merchant.street,
                  building: delivery.merchant.buildingNumber,
                  address: delivery.merchant.address,
                })}
              </span>
            )}
          </span>
        </p>
        <p className="text-brand-dark flex items-start gap-1.5">
          <MapPin className="w-4 h-4 text-brand-orange shrink-0 mt-0.5" />
          <span>
            <span className="font-bold">{delivery.customer?.name || 'Customer'}</span>
            <span className="text-brand-grey">
              {' · '}
              {formatAddressDetail({ street: delivery.dropoffStreet, building: delivery.dropoffBuilding, address: delivery.dropoffAddress })}
            </span>
          </span>
        </p>
      </div>

      {/* Cash on delivery: the amount the rider must collect at the door. */}
      {delivery.collectCash != null && (
        <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <Banknote className="w-4 h-4 shrink-0" />
          Collect {fmtSAR(delivery.collectCash)} in cash from the customer.
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        {delivery.customer?.mobile && (
          <a href={`tel:${delivery.customer.mobile}`} className={btnGhost + ' !py-2 !px-3 !text-xs'}>
            <Phone className="w-3.5 h-3.5" /> Call
          </a>
        )}
        {whatsappLink(delivery.customer?.whatsapp || delivery.customer?.mobile) && (
          <a
            href={whatsappLink(delivery.customer?.whatsapp || delivery.customer?.mobile, `Hi, I am delivering your Alabiq order ${delivery.orderCode}.`)}
            target="_blank"
            rel="noreferrer"
            className={btnGhost + ' !py-2 !px-3 !text-xs !text-green-700 !border-green-200'}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </a>
        )}
        {navUrl && (
          <a
            href={navUrl}
            target="_blank"
            rel="noreferrer"
            className={btnGhost + ' !py-2 !px-3 !text-xs !text-white !bg-brand-dark hover:!bg-black !border-brand-dark'}
          >
            <Navigation className="w-3.5 h-3.5" /> {enRoute ? 'Navigate to customer' : `Navigate to ${pickupNoun}`}
          </a>
        )}
      </div>

      {/* Mandatory photo proof, then the status button unlocks. The delivery
          shot must show either the customer holding the order (handover) or
          the order at their address (contactless/left-at-door) — this is
          driver guidance only, not an automated check on the photo content. */}
      <div className="mt-3 pt-3 border-t border-brand-border">
        <p className="text-xs font-bold text-brand-dark mb-1.5 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-brand-orange" />
          {enRoute ? 'Take a photo to confirm delivery' : `Take a photo of the order at the ${pickupNoun}`}
        </p>
        {enRoute && (
          <p className="text-[11px] text-brand-grey mb-1.5">
            Show the customer holding the order — or, if left at their door, show it at their address.
          </p>
        )}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setPhoto(e.target.files?.[0] || null)}
          className={fileInputClass + ' !py-2 !text-xs'}
        />
        <button
          type="button"
          disabled={busy || !photo}
          onClick={() => onStatus(delivery, nextStatus, photo)}
          className={btnPrimary + ' w-full mt-2 !py-2.5 !text-xs'}
          title={!photo ? 'A photo is required first' : undefined}
        >
          {busy ? (
            <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" />
          ) : enRoute ? (
            'Photo taken — mark delivered'
          ) : (
            'Photo taken — on the way to the customer'
          )}
        </button>
      </div>

      {/* Give up the delivery — only before pickup. The order is instantly
          re-offered to the next-nearest rider. */}
      {!enRoute && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(delivery)}
          className="w-full mt-2 text-xs font-bold text-brand-grey hover:text-red-600 py-1.5 cursor-pointer"
        >
          Can't take this order? Cancel &amp; pass it on
        </button>
      )}
    </Card>
  );
}

export default function DriverDispatch({ online, foodEnabled = true, driverId, coords, onRideAccepted, onActiveDeliveryChange }) {
  const [offers, setOffers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [pool, setPool] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const loadOffers = useCallback(async () => {
    try {
      setOffers((await api.driverOffers()).offers || []);
    } catch { /* polled */ }
  }, []);

  const loadDeliveries = useCallback(async () => {
    try {
      setDeliveries((await api.driverDeliveries()).active || []);
    } catch { /* polled */ }
  }, []);

  const loadPool = useCallback(async () => {
    const c = coordsRef.current;
    try {
      setPool((await api.driverOpenDeliveries(c?.lat, c?.lng)).deliveries || []);
    } catch { /* polled */ }
  }, []);

  // Instant pings on this driver's private channel; polling as fallback.
  useBroadcast(
    `driver-${driverId}`,
    {
      new_offer: () => { notifyAlert('New delivery offer — 30 seconds to respond', { icon: 'info' }); loadOffers(); },
      offer_expired: () => loadOffers(),
    },
    realtimeEnabled && online && !!driverId
  );

  // Active deliveries load regardless of the online toggle: a rider must be able
  // to see and finish a delivery — and keep the customer's live map fed with GPS
  // (see onActiveDeliveryChange below) — even after going "offline" for new offers.
  useEffect(() => {
    loadDeliveries();
    const d = setInterval(loadDeliveries, 15000);
    return () => clearInterval(d);
  }, [loadDeliveries]);

  // Offers are relevant while online (they can be food OR ride offers, so this
  // is NOT gated on foodEnabled — a Pick & Drop-only driver still gets ride offers).
  useEffect(() => {
    if (!online) { setOffers([]); return undefined; }
    loadOffers();
    const a = setInterval(loadOffers, OFFERS_POLL_MS);
    return () => clearInterval(a);
  }, [online, loadOffers]);

  // The open food pool only matters to a driver who works Food delivery.
  useEffect(() => {
    if (!online || !foodEnabled) { setPool([]); return undefined; }
    loadPool();
    const b = setInterval(loadPool, POOL_POLL_MS);
    return () => clearInterval(b);
  }, [online, foodEnabled, loadPool]);

  // Tell the parent (DriverPage) so it keeps GPS pinging while a delivery is
  // active, even when the rider isn't "online" — that's what feeds the pin.
  //
  // Reports the current leg's destination rather than a bare boolean, so the
  // parent's map can frame and follow the rider against where they are
  // actually heading. Same rule the delivery card uses: the merchant until
  // pickup, the customer after it. Null when there is no active delivery.
  const activeDelivery = deliveries[0] || null;
  const deliveryTarget = !activeDelivery
    ? null
    : activeDelivery.orderStatus === 'out_for_delivery'
      ? { lat: activeDelivery.dropoffLat, lng: activeDelivery.dropoffLng }
      : { lat: activeDelivery.merchant?.lat, lng: activeDelivery.merchant?.lng };
  const targetSig = deliveryTarget ? `${deliveryTarget.lat},${deliveryTarget.lng}` : '';
  useEffect(() => {
    onActiveDeliveryChange?.(deliveryTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSig, onActiveDeliveryChange]);

  async function acceptOffer(offer) {
    setBusyId(offer.id);
    setError(null);
    try {
      const res = await api.driverOfferAccept(offer.id);
      setOffers((list) => list.filter((o) => o.id !== offer.id));
      if (res.kind === 'food' || res.kind === 'shop') await loadDeliveries();
      else onRideAccepted?.();
    } catch (err) {
      setError(err.message);
      loadOffers();
    } finally {
      setBusyId(null);
    }
  }

  async function declineOffer(offer) {
    setBusyId(offer.id);
    try {
      await api.driverOfferDecline(offer.id);
      setOffers((list) => list.filter((o) => o.id !== offer.id));
    } catch { /* it likely expired */ } finally {
      setBusyId(null);
      loadOffers();
    }
  }

  async function claimFromPool(delivery) {
    setBusyId(delivery.orderCode);
    setError(null);
    try {
      await api.driverClaimDelivery(delivery.orderCode);
      await Promise.all([loadDeliveries(), loadPool()]);
    } catch (err) {
      setError(err.message);
      loadPool();
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(delivery, status, photoFile) {
    setBusyId(delivery.orderCode);
    setError(null);
    try {
      // 1. Upload the mandatory proof photo straight to private Storage.
      const kind = status === 'picked_up' ? 'pickup' : 'delivery';
      const signed = await api.driverDeliveryPhotoUrl(delivery.orderCode, {
        kind,
        file_name: photoFile.name,
        mime_type: photoFile.type || 'image/jpeg',
      });
      await uploadProofFile(signed.bucket, signed.path, signed.token, photoFile);
      // 2. Advance the status carrying the photo path (server rejects without it)
      // and the current GPS fix (server rejects if too far from the target).
      await api.driverDeliveryStatus(delivery.orderCode, status, signed.path, coordsRef.current);
      await loadDeliveries();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelDelivery(delivery) {
    if (!window.confirm('Cancel this delivery? It will be offered to the next-nearest rider.')) return;
    setBusyId(delivery.orderCode);
    setError(null);
    try {
      await api.driverCancelDelivery(delivery.orderCode, undefined);
      await loadDeliveries();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const hasContent = offers.length > 0 || deliveries.length > 0 || (online && pool.length > 0);
  if (!hasContent && !error) return null;

  return (
    <div className="mb-4">
      {error && (
        <div className="mb-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Exclusive 30s offers */}
      {offers.map((offer) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          busy={busyId === offer.id}
          onAccept={acceptOffer}
          onDecline={declineOffer}
        />
      ))}

      {deliveries.length > 0 && (
        <>
          <p className="font-black text-brand-black text-sm mb-2 flex items-center gap-1.5">
            <Bike className="w-4 h-4 text-brand-orange" /> My deliveries
          </p>
          {deliveries.map((d) => (
            <DeliveryCard key={d.orderCode} delivery={d} busy={busyId === d.orderCode} onStatus={updateStatus} onCancel={cancelDelivery} />
          ))}
        </>
      )}

      {/* Open pool (cascade exhausted — anyone can take it) */}
      {online && pool.length > 0 && (
        <>
          <p className="font-black text-brand-black text-sm mb-2 mt-4 flex items-center gap-1.5">
            <Bike className="w-4 h-4 text-brand-orange" /> Open deliveries
          </p>
          {pool.map((d) => (
            <Card key={d.orderCode} className="p-4 mb-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-brand-dark truncate">{d.merchant?.name || (d.kind === 'shop' ? 'Store' : 'Restaurant')}</p>
                <p className="text-xs text-brand-grey truncate">
                  To: {formatAddressDetail({ street: d.dropoffStreet, building: d.dropoffBuilding, address: d.dropoffAddress })}
                  {d.distanceKm != null && ` · ${d.distanceKm} km from you`}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === d.orderCode}
                onClick={() => claimFromPool(d)}
                className={btnPrimary + ' !py-2 !px-4 !text-xs shrink-0'}
              >
                {busyId === d.orderCode ? <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" /> : 'Take it'}
              </button>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
