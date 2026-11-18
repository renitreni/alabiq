// ---------------------------------------------------------------------
// Public delivery tracking (guest access with token).
// Accepts trackingId in URL path and token in query string.
// Shows delivery status, rider location (if active), and timeline.
// Falls back to polling if SSE unavailable.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle, MapPin, Flag, Navigation, Clock, RefreshCw, Bike, Check, X, AlertCircle, Timer } from 'lucide-react';
import { api } from '../lib/api';
import { formatAddressDetail } from '../lib/address';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { statusMeta } from '../lib/constants';
import { Card, Badge, Spinner, btnPrimary } from '../components/ui';
import { fmtSAR } from '../lib/constants';

const POLL_INTERVAL_MS = 8000;
const TERMINAL_STATUSES = ['delivered', 'cancelled'];

export default function PublicDeliveryTrackPage() {
  const { trackingId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [data, setData] = useState(null);
  const [live, setLive] = useState({ riderLocation: null, etaMinutes: null });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const doneRef = useRef(false);
  const pollRef = useRef(null);

  const refetch = useCallback(async () => {
    if (!token) return;
    try {
      const d = await api.publicDeliveryTracking(trackingId, token);
      setData(d);
      doneRef.current = TERMINAL_STATUSES.includes(d?.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [trackingId, token]);

  useEffect(() => {
    if (!token) {
      setError('Tracking token is required. Please check your tracking link.');
      setLoading(false);
      return;
    }
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!token || doneRef.current || !realtimeEnabled) return;

    let cancelled = false;
    const eventSource = new EventSource(
      `${api.base}/api/public/deliveries/${trackingId}/stream?token=${encodeURIComponent(token)}`,
      { withCredentials: false }
    );

    eventSource.onopen = () => {
      if (!cancelled) setConnected(true);
    };

    eventSource.onmessage = (event) => {
      if (cancelled) return;
      try {
        const update = JSON.parse(event.data);
        if (update.riderLocation) {
          setLive((prev) => ({ ...prev, riderLocation: update.riderLocation }));
        }
        if (update.etaMinutes != null) {
          setLive((prev) => ({ ...prev, etaMinutes: update.etaMinutes }));
        }
        if (update.status) {
          setData((prev) => prev ? { ...prev, status: update.status, terminal: TERMINAL_STATUSES.includes(update.status) } : prev);
          if (TERMINAL_STATUSES.includes(update.status)) {
            doneRef.current = true;
            eventSource.close();
          }
        }
      } catch (_) {
      }
    };

    eventSource.onerror = () => {
      if (!cancelled) setConnected(false);
    };

    return () => {
      cancelled = true;
      eventSource.close();
    };
  }, [trackingId, token]);

  useEffect(() => {
    if (doneRef.current) return;

    const poll = async () => {
      if (doneRef.current) return;
      await refetch();
    };

    pollRef.current = setTimeout(() => {
      poll();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refetch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface">
        <Spinner className="w-10 h-10 border-brand-orange" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-brand-black mb-2">Unable to Load Tracking</h1>
          <p className="text-brand-grey mb-4">{error}</p>
          <p className="text-xs text-brand-grey">Please check your tracking link and try again.</p>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-surface p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-black text-brand-black mb-2">Delivery Not Found</h1>
          <p className="text-brand-grey">The tracking link may be invalid or expired.</p>
        </Card>
      </div>
    );
  }

  const status = statusMeta[data.status] || { label: data.status, tone: 'grey' };
  const isTerminal = data.terminal || TERMINAL_STATUSES.includes(data.status);

  return (
    <div className="min-h-screen bg-brand-surface pb-16">
      <div className="sticky top-0 z-10 bg-white border-b border-brand-border shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-brand-grey uppercase tracking-wider">Delivery Tracking</p>
              <p className="font-mono font-bold text-brand-black">{data.order_code}</p>
            </div>
            <Badge tone={status.tone} className="!px-2.5 !py-1 !text-xs">{status.label}</Badge>
          </div>
          {isTerminal && (
            <p className="text-xs text-brand-grey mt-1">
              This delivery has been {data.status === 'delivered' ? 'completed' : 'cancelled'}.
            </p>
          )}
          {connected && (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live
            </p>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Bike className="w-6 h-6 text-brand-orange shrink-0" />
            <div>
              <p className="text-xs font-bold text-brand-grey uppercase">Restaurant</p>
              <p className="font-bold text-brand-black">{data.merchant?.name}</p>
            </div>
          </div>
          {data.merchant?.address && (
            <p className="text-xs text-brand-grey ml-9">{data.merchant.address}</p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <Flag className="w-6 h-6 text-brand-black shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-brand-grey uppercase">Delivery To</p>
              <p className="text-sm font-medium text-brand-dark">
                {data.dropoff?.address || 'Address not available'}
              </p>
            </div>
          </div>
        </Card>

        {data.rider && !isTerminal && (
          <Card className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Bike className="w-6 h-6 text-brand-orange shrink-0" />
              <div>
                <p className="text-xs font-bold text-brand-grey uppercase">Your Rider</p>
                <p className="font-bold text-brand-black">{data.rider.name}</p>
              </div>
            </div>
            {(data.rider.vehicle_type || data.rider.vehicle_plate) && (
              <p className="text-xs text-brand-grey ml-9 flex items-center gap-2">
                {data.rider.vehicle_type && <span>{data.rider.vehicle_type}</span>}
                {data.rider.vehicle_plate && <span className="font-mono">{data.rider.vehicle_plate}</span>}
              </p>
            )}
            {data.rider_location && (
              <div className="mt-3 p-3 bg-brand-surface/50 rounded-xl text-xs">
                <p className="font-bold text-brand-black mb-1">Live Location</p>
                <p className="text-brand-grey">
                  Lat: {data.rider_location.lat?.toFixed(6)}, Lng: {data.rider_location.lng?.toFixed(6)}
                </p>
                {data.etaMinutes != null && (
                  <p className="text-brand-orange font-medium mt-1">
                    ETA: {data.etaMinutes} min
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-center gap-2 font-black text-brand-black mb-4">
            <Navigation className="w-4 h-4 text-brand-orange" />
            Timeline
          </div>
          <ol className="space-y-3">
            <li className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-3 h-3 rounded-full ${data.status !== 'searching' && data.status !== 'assigned' ? 'bg-brand-orange' : 'bg-brand-border'}`} />
                <span className="w-px flex-1 bg-brand-border mt-1" />
              </div>
              <div className="pb-1 -mt-1">
                <div className="text-sm font-bold text-brand-dark">Order Placed</div>
                <div className="text-xs text-brand-grey">{new Date(data.timestamps.created_at).toLocaleString()}</div>
              </div>
            </li>
            {data.timestamps.assigned_at && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-3 h-3 rounded-full ${['picked_up', 'delivered'].includes(data.status) ? 'bg-brand-orange' : data.status === 'assigned' ? 'bg-brand-orange' : 'bg-brand-border'}`} />
                  <span className="w-px flex-1 bg-brand-border mt-1" />
                </div>
                <div className="pb-1 -mt-1">
                  <div className="text-sm font-bold text-brand-dark">Rider Assigned</div>
                  <div className="text-xs text-brand-grey">{new Date(data.timestamps.assigned_at).toLocaleString()}</div>
                </div>
              </li>
            )}
            {data.timestamps.picked_up_at && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`w-3 h-3 rounded-full ${data.status === 'delivered' ? 'bg-brand-orange' : 'bg-brand-border'}`} />
                  <span className="w-px flex-1 bg-brand-border mt-1" />
                </div>
                <div className="pb-1 -mt-1">
                  <div className="text-sm font-bold text-brand-dark">Picked Up</div>
                  <div className="text-xs text-brand-grey">{new Date(data.timestamps.picked_up_at).toLocaleString()}</div>
                </div>
              </li>
            )}
            {data.timestamps.delivered_at && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full bg-brand-orange" />
                </div>
                <div className="pb-1 -mt-1">
                  <div className="text-sm font-bold text-brand-dark">Delivered</div>
                  <div className="text-xs text-brand-grey">{new Date(data.timestamps.delivered_at).toLocaleString()}</div>
                </div>
              </li>
            )}
            {data.timestamps.cancelled_at && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                </div>
                <div className="pb-1 -mt-1">
                  <div className="text-sm font-bold text-red-600">Cancelled</div>
                  <div className="text-xs text-brand-grey">{new Date(data.timestamps.cancelled_at).toLocaleString()}</div>
                </div>
              </li>
            )}
          </ol>
        </Card>

        {isTerminal && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold text-amber-800">
                  {data.status === 'delivered' ? 'Delivery Completed' : 'Delivery Cancelled'}
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  This tracking page will no longer receive live updates.
                </p>
              </div>
            </div>
          </Card>
        )}

        <button onClick={refetch} disabled={loading} className={btnPrimary + ' w-full !py-3 !text-sm'}>
          {loading ? <Spinner className="!w-5 !h-5 !border-white/40 !border-t-white mx-auto" /> : 'Refresh Status'}
        </button>
      </div>
    </div>
  );
}
