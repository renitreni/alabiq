// ---------------------------------------------------------------------
// Store owner — live orders queue.
//
// A store's authority STOPS at "ready". out_for_delivery and delivered are
// the rider's to set, backed by photo proof and a geofence, so there is no
// button for them here and the API refuses them anyway.
//
// Accepting is credit-gated: the platform markup is charged to the store's
// credit line, and a 403 with failure_reason 'credit_exhausted' is a normal
// outcome, not an error — it gets its own message rather than a red toast.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Check, X, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { acknowledgeUrgentAlert } from '../lib/alertSound';
import { fmtSAR, shopStatusMeta, shopPaymentMeta, TONE_CLASSES, SHOP_PAYMENT_METHODS } from '../lib/constants';
import { formatAddressDetail } from '../lib/address';
import { notifySuccess, promptCancelReason } from '../lib/notify';
import { Card, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';

const FILTERS = [
  { id: 'action', label: 'Needs action' },
  { id: 'live', label: 'Live' },
  { id: 'all', label: 'All' },
];

const NEEDS_ACTION = ['pending'];
const LIVE = ['pending', 'accepted', 'packing', 'ready', 'out_for_delivery'];

// Statuses the store may still withdraw from. Mirrors MERCHANT_CANCELLABLE
// in backend/controllers/merchantShopOrdersController.js — the server is the
// enforcement, this only decides whether to draw the button rather than let
// the store discover a 409.
const MERCHANT_CANCELLABLE = ['accepted', 'packing', 'ready'];

function Pill({ tone, children }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

function OrderCard({ order, onAccept, onReject, onAdvance, onCancel, busy }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const status = shopStatusMeta(order.status);
  const payment = shopPaymentMeta(order.paymentStatus);

  const nextStep =
    order.status === 'accepted' ? 'packing' : order.status === 'packing' ? 'ready' : null;
  const nextLabel = nextStep === 'packing' ? 'Start packing' : 'Mark ready';

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-brand-grey">{order.orderCode}</p>
          <p className="font-black text-brand-black mt-0.5">{fmtSAR(order.total)}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Pill tone={status.tone}>{status.label}</Pill>
            <Pill tone={payment.tone}>{payment.label}</Pill>
            {order.paymentMethod === 'cash' && <Pill tone="blue">Cash on delivery</Pill>}
            {order.rider?.assigned && <Pill tone="green">Rider assigned</Pill>}
          </div>
        </div>
        <div className="text-right text-xs text-brand-grey shrink-0">
          {new Date(order.createdAt).toLocaleString()}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-brand-border space-y-1 text-sm">
        {(order.items || []).map((it) => (
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

      <div className="mt-3 pt-3 border-t border-brand-border text-xs text-brand-grey space-y-0.5">
        <p>
          Deliver to:{' '}
          {formatAddressDetail({
            street: order.deliveryStreet,
            building: order.deliveryBuilding,
            address: order.deliveryAddress,
          })}
        </p>
        {order.customer && (
          <p>
            {order.customer.name || 'Customer'}
            {order.customer.mobile && ` · ${order.customer.mobile}`}
          </p>
        )}
        <p>Paid with {SHOP_PAYMENT_METHODS[order.paymentMethod] || order.paymentMethod}</p>
      </div>

      {order.status === 'rejected' && order.rejectReason && (
        <p className="mt-3 text-xs font-medium text-red-700">Rejected: {order.rejectReason}</p>
      )}

      {order.status === 'pending' && (
        <div className="mt-4">
          {rejecting ? (
            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you rejecting this order?"
                className={inputClass}
              />
              <div className="flex gap-2">
                <button onClick={() => setRejecting(false)} className={btnGhost + ' flex-1'}>
                  Cancel
                </button>
                <button
                  onClick={() => onReject(order, reason)}
                  disabled={busy}
                  className={btnPrimary + ' flex-1 !bg-red-600'}
                >
                  Confirm reject
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setRejecting(true)} disabled={busy} className={btnGhost + ' flex-1'}>
                <X className="w-4 h-4" /> Reject
              </button>
              <button onClick={() => onAccept(order)} disabled={busy} className={btnPrimary + ' flex-1'}>
                {busy ? <Spinner className="!border-white/40 !border-t-white" /> : <Check className="w-4 h-4" />}
                Accept
              </button>
            </div>
          )}
        </div>
      )}

      {nextStep && (
        <button
          onClick={() => onAdvance(order, nextStep)}
          disabled={busy}
          className={btnPrimary + ' w-full mt-4'}
        >
          {busy ? <Spinner className="!border-white/40 !border-t-white" /> : <Clock className="w-4 h-4" />}
          {nextLabel}
        </button>
      )}

      {/* Withdraw an order already accepted — the shelf-is-empty case.
          Stops at 'ready': once a rider is carrying the goods it is
          support's call, the same boundary the status ladder stops at. */}
      {MERCHANT_CANCELLABLE.includes(order.status) && (
        <button
          onClick={() => onCancel(order)}
          disabled={busy}
          className={btnGhost + ' w-full mt-2 !text-red-600 !border-red-200'}
        >
          <X className="w-4 h-4" /> Cancel order
        </button>
      )}

      {order.status === 'ready' && (
        <p className="mt-4 text-xs text-brand-grey text-center font-medium">
          Waiting for a rider to collect. They confirm pickup with a photo.
        </p>
      )}
    </Card>
  );
}

export default function ShopMerchantOrders({ onChanged, ping }) {
  const [orders, setOrders] = useState(null);
  const [credit, setCredit] = useState(null);
  const [filter, setFilter] = useState('action');
  const [busyCode, setBusyCode] = useState(null);
  const [error, setError] = useState(null);
  const [creditBlock, setCreditBlock] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.merchantShopOrders();
      setOrders(data.orders || []);
      setCredit(data.credit || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(id);
  }, [load, ping]);

  // Silence the repeating alert for anything no longer waiting on the store.
  useEffect(() => {
    if (!orders) return;
    orders
      .filter((o) => o.status !== 'pending')
      .forEach((o) => acknowledgeUrgentAlert(o.orderCode));
  }, [orders]);

  const visible = useMemo(() => {
    const list = orders || [];
    if (filter === 'action') return list.filter((o) => NEEDS_ACTION.includes(o.status));
    if (filter === 'live') return list.filter((o) => LIVE.includes(o.status));
    return list;
  }, [orders, filter]);

  async function accept(order) {
    setBusyCode(order.orderCode);
    setCreditBlock(null);
    // Acting on the order IS the acknowledgement.
    acknowledgeUrgentAlert(order.orderCode);
    try {
      await api.merchantShopAcceptOrder(order.orderCode);
      notifySuccess(`Order ${order.orderCode} accepted`);
      await load();
      onChanged?.();
    } catch (err) {
      // A credit-exhausted 403 is an expected business outcome, not a fault.
      if (err.status === 403) setCreditBlock(err.message);
      else setError(err.message);
    } finally {
      setBusyCode(null);
    }
  }

  async function reject(order, reason) {
    setBusyCode(order.orderCode);
    acknowledgeUrgentAlert(order.orderCode);
    try {
      await api.merchantShopRejectOrder(order.orderCode, reason || null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode(null);
    }
  }

  async function advance(order, status) {
    setBusyCode(order.orderCode);
    try {
      await api.merchantShopOrderStatus(order.orderCode, status);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode(null);
    }
  }

  async function cancel(order) {
    const reason = await promptCancelReason({
      orderCode: order.orderCode,
      refundWarning: order.paymentStatus === 'paid',
    });
    if (!reason) return;
    setBusyCode(order.orderCode);
    try {
      const res = await api.merchantShopCancelOrder(order.orderCode, reason);
      notifySuccess(
        `Order ${order.orderCode} cancelled`,
        // The store's markup goes back on cancel, and the customer's money is
        // the platform's to return — say both, so neither is a surprise later.
        res?.refundDue
          ? 'The customer has been told. The platform will refund their payment.'
          : 'The customer has been told.'
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyCode(null);
    }
  }

  if (!orders && !error) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="!w-8 !h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {creditBlock && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{creditBlock}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition-colors ${
                filter === f.id
                  ? 'bg-brand-orange text-white border-brand-orange'
                  : 'bg-white text-brand-grey border-brand-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={load} className={btnGhost + ' !py-1.5 !px-3 text-sm'}>
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {credit && (credit.warning || credit.exhausted) && (
        <div
          className={`p-3 rounded-xl text-sm font-medium border ${
            credit.exhausted ? TONE_CLASSES.red : TONE_CLASSES.amber
          }`}
        >
          Credit used {fmtSAR(credit.creditUsed)} of {fmtSAR(credit.creditLimit)}.
          {credit.exhausted
            ? ' New orders cannot be accepted until the balance is settled.'
            : ' Orders stop once the limit is reached.'}
        </div>
      )}

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="w-8 h-8 text-brand-grey/40 mx-auto mb-3" />
          <p className="font-bold text-brand-black">
            {filter === 'action' ? 'Nothing needs your attention' : 'No orders here'}
          </p>
          <p className="text-sm text-brand-grey mt-1">
            New orders appear the moment a customer checks out.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((o) => (
            <OrderCard
              key={o.orderCode}
              order={o}
              onAccept={accept}
              onCancel={cancel}
              onReject={reject}
              onAdvance={advance}
              busy={busyCode === o.orderCode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
