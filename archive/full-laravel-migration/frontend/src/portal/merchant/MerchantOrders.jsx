// ---------------------------------------------------------------------
// Merchant portal — Orders tab: the restaurant's own live incoming-orders
// dashboard. Primary path for accept/reject/preparing/ready (the admin
// Food tab keeps the same actions as a fallback for restaurants not yet
// using their own device — see backend/lib/foodOrderActions.js).
//
// The order code doubles as the pickup-verification code: shown prominently
// here so staff can compare it against what a driver states before handing
// over the food (no app-side gate — a human check at the counter).
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { Check, X, ChevronRight, ClipboardList, Bike, Download } from 'lucide-react';
import { api } from '../lib/api';
import { fmtSAR, foodStatusMeta, foodPaymentMeta } from '../lib/constants';
import { downloadFoodInvoice } from '../lib/invoice';
import { promptCancelReason } from '../lib/notify';
import { acknowledgeUrgentAlert } from '../lib/alertSound';
import { Card, Badge, Spinner, btnPrimary, btnGhost } from '../components/ui';

// Statuses the restaurant may still withdraw from. Mirrors
// MERCHANT_CANCELLABLE in backend/controllers/merchantOrdersController.js —
// the server is the enforcement, this only decides whether to draw the
// button rather than let the merchant discover a 409.
const MERCHANT_CANCELLABLE = ['accepted', 'preparing', 'ready'];

// downloadFoodInvoice() expects the snake_case shape used elsewhere in this
// codebase for orders/bookings; the merchant list API returns camelCase —
// adapt at the point of use rather than changing either convention.
// Deliberately excludes platform_margin_total: a merchant's own invoice
// only ever shows subtotal/delivery-fee/total, never the platform's cut.
function toInvoiceOrder(o) {
  return {
    order_code: o.orderCode,
    delivered_at: o.deliveredAt,
    created_at: o.createdAt,
    subtotal: o.subtotal,
    delivery_fee: o.deliveryFee,
    total: o.total,
    payment_status: o.paymentStatus,
    payment_method: o.paymentMethod,
    delivery_address: o.deliveryAddress,
    delivery_street: o.deliveryStreet,
    delivery_building: o.deliveryBuilding,
  };
}

// Merchant authority stops at "ready" — out_for_delivery/delivered are
// driver-only (mandatory photo proof at pickup/dropoff).
const NEXT_STATUS = {
  accepted: { status: 'preparing', label: 'Start preparing' },
  preparing: { status: 'ready', label: 'Mark ready for pickup' },
};

export default function MerchantOrders({ merchant, ping }) {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState('action');
  const [busyCode, setBusyCode] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setOrders((await api.merchantOrders()).orders || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // `ping` is bumped by MerchantDashboard, which owns the broadcast
  // subscription. It has to live up there: this component is mounted only
  // while the Orders TAB is open, and the dashboard opens on Overview — so a
  // subscription here meant the merchant heard nothing on the screen they
  // actually sit on.
  useEffect(() => { load(); }, [load, ping]);

  // Stop the repeating new-order alert for anything no longer waiting on the
  // merchant, including orders an admin accepted on their behalf from the
  // Food tab. Without this the device keeps ringing for handled work.
  useEffect(() => {
    if (!orders) return;
    orders
      .filter((o) => o.status !== 'pending')
      .forEach((o) => acknowledgeUrgentAlert(o.orderCode));
  }, [orders]);

  async function run(code, fn) {
    setBusyCode(code);
    setError(null);
    // Acting on an order IS the acknowledgement — do not make a merchant who
    // just accepted it also dismiss a banner, and do not wait on the reload.
    acknowledgeUrgentAlert(code);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
      await load(); // e.g. a 403 credit block — refresh the true state
    } finally {
      setBusyCode(null);
    }
  }

  const LIVE = ['accepted', 'preparing', 'ready', 'out_for_delivery'];
  const filtered = (orders || []).filter((o) => {
    if (filter === 'action') return o.status === 'pending';
    if (filter === 'live') return LIVE.includes(o.status);
    return true;
  });

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {[
          { id: 'action', label: 'Needs action' },
          { id: 'live', label: 'Live' },
          { id: 'all', label: 'All' },
        ].map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
              filter === f.id ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-grey border-brand-border'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {orders === null && <div className="flex justify-center py-12"><Spinner className="!w-7 !h-7" /></div>}
      {orders !== null && filtered.length === 0 && (
        <Card className="p-8 text-center">
          <ClipboardList className="w-8 h-8 text-brand-grey/40 mx-auto mb-2" />
          <p className="text-sm text-brand-grey">
            {filter === 'action' ? 'Nothing needs your action right now.' : 'No orders here yet.'}
          </p>
        </Card>
      )}

      {filtered.map((o) => {
        const status = foodStatusMeta(o.status);
        const pay = foodPaymentMeta(o.paymentStatus);
        const next = NEXT_STATUS[o.status];
        const busy = busyCode === o.orderCode;
        return (
          <Card key={o.orderCode} className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                {/* Pickup-verification code: compare against what the driver states. */}
                <p className="font-mono font-bold text-brand-dark text-lg">{o.orderCode}</p>
                <p className="text-xs text-brand-grey truncate">
                  {o.customerName || 'Customer'} · {new Date(o.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge tone={status.tone}>{status.label}</Badge>
                <Badge tone={pay.tone}>{pay.label}</Badge>
                {o.paymentMethod === 'cash' && <Badge tone="grey">Cash</Badge>}
                <span className="font-black text-brand-orange tabular-nums ml-1">{fmtSAR(o.total)}</span>
              </div>
            </div>

            {(o.items || []).length > 0 && (
              <p className="text-xs text-brand-grey mt-2 truncate">
                {o.items.map((i) => `${i.quantity} × ${i.name_snapshot}`).join(', ')}
              </p>
            )}
            {o.riderName && (
              <p className="text-xs text-brand-grey mt-1 flex items-center gap-1">
                <Bike className="w-3 h-3 text-brand-orange" /> Rider on the way:{' '}
                <span className="font-bold text-brand-dark">{o.riderName}</span> — ask for pickup code{' '}
                <span className="font-mono font-bold text-brand-dark">{o.orderCode}</span> before handing over the order.
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {o.status === 'pending' && (
                <>
                  <button type="button" disabled={busy}
                    onClick={() => run(o.orderCode, () => api.merchantAcceptOrder(o.orderCode))}
                    className={btnPrimary + ' !py-2 !px-3.5 !text-xs'}>
                    <Check className="w-3.5 h-3.5" /> Accept order
                  </button>
                  <button type="button" disabled={busy}
                    onClick={() => {
                      const reason = window.prompt('Reason for rejecting this order? (optional)');
                      if (reason === null) return;
                      run(o.orderCode, () => api.merchantRejectOrder(o.orderCode, reason || undefined));
                    }}
                    className={btnGhost + ' !py-2 !px-3.5 !text-xs !text-red-600 !border-red-200'}>
                    <X className="w-3.5 h-3.5" /> Reject order
                  </button>
                </>
              )}
              {next && (
                <button type="button" disabled={busy}
                  onClick={() => run(o.orderCode, () => api.merchantOrderStatus(o.orderCode, next.status))}
                  className={btnGhost + ' !py-2 !px-3.5 !text-xs'}>
                  {next.label} <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              {/* Withdraw an order already accepted. Stops at 'ready' — once
                  a rider is carrying the food it is support's call, which is
                  the same boundary the status ladder stops at. */}
              {MERCHANT_CANCELLABLE.includes(o.status) && (
                <button type="button" disabled={busy}
                  onClick={async () => {
                    const reason = await promptCancelReason({
                      orderCode: o.orderCode,
                      refundWarning: o.paymentStatus === 'paid',
                    });
                    if (!reason) return;
                    run(o.orderCode, () => api.merchantCancelOrder(o.orderCode, reason));
                  }}
                  className={btnGhost + ' !py-2 !px-3.5 !text-xs !text-red-600 !border-red-200'}>
                  <X className="w-3.5 h-3.5" /> Cancel order
                </button>
              )}
              {o.status !== 'pending' && o.status !== 'rejected' && (
                <button type="button"
                  onClick={() => downloadFoodInvoice({
                    order: toInvoiceOrder(o),
                    items: o.items,
                    merchant,
                    customerName: o.customerName || 'Customer',
                  })}
                  className={btnGhost + ' !py-2 !px-3.5 !text-xs'}>
                  <Download className="w-3.5 h-3.5" /> Invoice
                </button>
              )}
              {busy && <Spinner className="!w-4 !h-4" />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
