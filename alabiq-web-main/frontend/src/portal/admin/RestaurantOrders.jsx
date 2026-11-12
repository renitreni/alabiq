// ---------------------------------------------------------------------
// Admin "Restaurant Orders" tab.
//
// A live, per-restaurant view of what is currently on the pass, built for
// one question: which kitchens have not started cooking yet? Orders still
// at 'pending'/'accepted' past the reminder window are pulled to the top
// and flagged, mirroring the chase that backend/lib/foodPreparingReminder.js
// is running server-side.
//
// Deliberately narrower than the Food tab: no merchant CRUD, no menus, no
// settlement. Orders only.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  AlertTriangle,
  ClipboardList,
  ChevronRight,
  RotateCcw,
  Store,
  UtensilsCrossed,
  Clock,
  ChefHat,
  Package,
  Bike,
  BadgeCheck,
  Sparkles,
  Phone,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { extractOrders } from '../lib/ordersResponse';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { fmtSAR, foodStatusMeta, foodPaymentMeta } from '../lib/constants';
import { announceNewOrder, playAlert } from '../lib/alertSound';
import { Card, Badge, Spinner, btnPrimary, btnGhost } from '../components/ui';

const DEFAULT_REMINDER_MINUTES = 10;

const ON_THE_PASS = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
const NOT_STARTED = ['pending', 'accepted'];

const STATUS_ICONS = {
  pending: Clock,
  accepted: BadgeCheck,
  preparing: ChefHat,
  ready: Package,
  out_for_delivery: Bike,
};

function blockedOnPayment(o) {
  return o.status === 'pending' && o.paymentStatus === 'awaiting' && o.paymentMethod !== 'cash';
}

function waitedMinutes(o, now) {
  return Math.max(0, Math.floor((now - new Date(o.createdAt).getTime()) / 60000));
}

function isOverdue(o, now, thresholdMinutes) {
  return (
    NOT_STARTED.includes(o.status) &&
    !blockedOnPayment(o) &&
    waitedMinutes(o, now) >= thresholdMinutes
  );
}

function humanWait(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

const NEXT_ACTION = {
  pending: { label: 'Accept for them', run: (code) => api.adminFoodAcceptOrder(code) },
  accepted: { label: 'Start preparing', run: (code) => api.adminFoodOrderStatus(code, 'preparing') },
};

function StatCard({ icon: Icon, label, value, hint, accent }) {
  const accents = {
    amber: 'bg-amber-50 text-amber-700',
    orange: 'bg-brand-orange/12 text-brand-orange',
    green: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <Card className="p-4 sm:p-5 min-w-0">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <p className="text-xs font-bold text-brand-grey mt-3">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-brand-black tabular-nums mt-0.5">{value}</p>
      <p className="text-xs text-brand-grey mt-1">{hint}</p>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center justify-center text-center px-5 py-12 sm:py-16">
        <div className="w-14 h-14 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
          <Icon className="w-6 h-6" />
        </div>
        <p className="font-black text-brand-black">{title}</p>
        <p className="text-sm text-brand-grey mt-1.5 max-w-sm leading-relaxed">{desc}</p>
      </div>
    </Card>
  );
}

export default function RestaurantOrders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [busyCode, setBusyCode] = useState(null);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [reminderMinutes, setReminderMinutes] = useState(DEFAULT_REMINDER_MINUTES);
  const seenOverdue = useRef(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api.adminFoodOrders();
      const ordersArray = extractOrders(res);
      setOrders(ordersArray.filter((o) => ON_THE_PASS.includes(o.status)));
      if (Number.isFinite(res.preparingReminderMinutes)) {
        setReminderMinutes(res.preparingReminderMinutes);
      }
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const connected = useBroadcast(
    'admin-food',
    {
      changed: () => load(),
      preparing_overdue: (payload) => {
        announceNewOrder(`${payload?.orderCode}#${payload?.attempt}`);
        load();
      },
    },
    realtimeEnabled
  );

  useEffect(() => {
    if (connected) return undefined;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [connected, load]);

  useEffect(() => {
    if (!orders) return;
    const fresh = orders.filter(
      (o) => isOverdue(o, now, reminderMinutes) && !seenOverdue.current.has(o.orderCode)
    );
    if (fresh.length === 0) return;
    fresh.forEach((o) => seenOverdue.current.add(o.orderCode));
    playAlert('order');
  }, [orders, now, reminderMinutes]);

  async function run(code, fn) {
    setBusyCode(code);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusyCode(null);
    }
  }

  const groups = useMemo(() => {
    const visible = (orders || []).filter((o) =>
      onlyWaiting ? isOverdue(o, now, reminderMinutes) : true
    );
    const byRestaurant = new Map();
    for (const o of visible) {
      const name = o.merchantName || 'Unknown restaurant';
      if (!byRestaurant.has(name)) byRestaurant.set(name, []);
      byRestaurant.get(name).push(o);
    }
    for (const list of byRestaurant.values()) {
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    return [...byRestaurant.entries()].sort((a, b) => {
      const aLate = a[1].filter((o) => isOverdue(o, now, reminderMinutes)).length;
      const bLate = b[1].filter((o) => isOverdue(o, now, reminderMinutes)).length;
      if (aLate !== bLate) return bLate - aLate;
      return b[1].length - a[1].length;
    });
  }, [orders, onlyWaiting, now, reminderMinutes]);

  const liveCount = (orders || []).length;
  const overdueCount = (orders || []).filter((o) => isOverdue(o, now, reminderMinutes)).length;
  const kitchenCount = new Set((orders || []).map((o) => o.merchantName || 'Unknown restaurant')).size;

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={UtensilsCrossed}
          label="Live orders"
          value={orders === null ? '—' : liveCount}
          hint="On the kitchen pass right now"
          accent="orange"
        />
        <StatCard
          icon={AlarmClock}
          label="Waiting too long"
          value={orders === null ? '—' : overdueCount}
          hint={`Not cooking after ${reminderMinutes} minutes`}
          accent="amber"
        />
        <StatCard
          icon={Store}
          label="Kitchens busy"
          value={orders === null ? '—' : kitchenCount}
          hint="Restaurants with live orders"
          accent="slate"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 flex-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setOnlyWaiting(false)}
            className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${
              !onlyWaiting
                ? 'bg-brand-black text-white border-brand-black'
                : 'bg-white text-brand-grey border-brand-border'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            All live
            {orders !== null && (
              <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${!onlyWaiting ? 'bg-white/15' : 'bg-brand-surface'}`}>
                {liveCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setOnlyWaiting(true)}
            className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${
              onlyWaiting
                ? 'bg-brand-black text-white border-brand-black'
                : 'bg-white text-brand-grey border-brand-border'
            }`}
          >
            <AlarmClock className="w-4 h-4" />
            Waiting
            {overdueCount > 0 && (
              <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-md bg-orange-500 text-white">
                {overdueCount}
              </span>
            )}
          </button>
        </div>
        <div className="shrink-0 self-start sm:self-auto rounded-xl bg-white border border-brand-border px-3 py-2">
        </div>
      </div>

      {overdueCount > 0 && (
        <Card className="p-4 border-orange-200 bg-orange-50 min-w-0">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
              <AlarmClock className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-brand-black text-sm">
                {overdueCount} order{overdueCount === 1 ? '' : 's'} waiting more than {reminderMinutes} minutes
              </p>
              <p className="text-xs text-brand-grey mt-0.5 leading-relaxed">
                The restaurant has already been reminded. Call them if the wait keeps climbing.
              </p>
            </div>
          </div>
        </Card>
      )}

      {orders === null && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Spinner className="!w-8 !h-8" />
          <p className="text-sm text-brand-grey">Loading kitchen orders…</p>
        </div>
      )}

      {error && (
        <Card className="p-4 border-red-200 bg-red-50 min-w-0">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-brand-black text-sm">Failed to load orders</p>
              <p className="text-xs text-brand-grey mt-0.5 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={load}
                disabled={orders === null} // allow retry even while loading
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer bg-brand-black text-white border-brand-black"
              >
                <RotateCcw className="w-4 h-4" /> Retry
              </button>
            </div>
          </div>
        </Card>
      )}

      {orders !== null && groups.length === 0 && !error && (
        <EmptyState
          icon={onlyWaiting ? Sparkles : ChefHat}
          title={onlyWaiting ? 'Every kitchen is on time' : 'No live restaurant orders'}
          desc={
            onlyWaiting
              ? `Nothing has sat at pending or accepted for more than ${reminderMinutes} minutes.`
              : 'When a customer places a food order, it will show up here grouped by restaurant.'
          }
        />
      )}

      {groups.map(([restaurant, list]) => {
        const late = list.filter((o) => isOverdue(o, now, reminderMinutes)).length;
        return (
          <Card key={restaurant} className="overflow-hidden min-w-0">
            <div className="px-3 sm:px-4 py-3 border-b border-brand-border flex items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-brand-orange/12 text-brand-orange flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-black text-brand-black truncate">{restaurant}</p>
                  <p className="text-xs text-brand-grey">
                    {list.length} live order{list.length === 1 ? '' : 's'}
                    {late > 0 ? ` · ${late} waiting too long` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {late > 0 && (
                  <Badge tone="amber" className="!px-2 !py-0.5 !text-[10px]">{late} waiting</Badge>
                )}
                <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px] hidden sm:inline-flex">{list.length} live</Badge>
              </div>
            </div>

            <div className="p-2 sm:p-3 space-y-2">
              {list.map((o) => {
                const status = foodStatusMeta(o.status);
                const pay = foodPaymentMeta(o.paymentStatus);
                const overdue = isOverdue(o, now, reminderMinutes);
                const mins = waitedMinutes(o, now);
                const action = NEXT_ACTION[o.status];
                const busy = busyCode === o.orderCode;
                const StatusIcon = STATUS_ICONS[o.status] || ClipboardList;
                return (
                  <div
                    key={o.orderCode}
                    className={`p-3 sm:p-4 rounded-2xl border min-w-0 ${
                      overdue ? 'border-orange-300 bg-orange-50' : 'border-brand-border bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        overdue ? 'bg-orange-100 text-orange-700' : 'bg-brand-muted text-brand-dark'
                      }`}>
                        <StatusIcon className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-brand-black truncate">{o.customerName || 'Customer'}</p>
                            <p className="font-mono text-xs font-bold text-brand-grey mt-0.5">{o.orderCode}</p>
                          </div>
                          <p className="font-black text-brand-orange tabular-nums text-sm shrink-0">{fmtSAR(o.total)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {overdue ? (
                            <Badge tone="amber" className="!px-2 !py-0.5 !text-[10px]">
                              <AlarmClock className="w-3 h-3" /> Waiting {humanWait(mins)}
                            </Badge>
                          ) : (
                            <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">
                              <Clock className="w-3 h-3" /> {humanWait(mins)}
                            </Badge>
                          )}
                          <Badge tone={status.tone} className="!px-2 !py-0.5 !text-[10px]">{status.label}</Badge>
                          <Badge tone={pay.tone} className="!px-2 !py-0.5 !text-[10px]">{pay.label}</Badge>
                          {o.paymentMethod === 'cash' && (
                            <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">
                              <Wallet className="w-3 h-3" /> Cash
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {(o.items || []).length > 0 && (
                      <p className="text-xs text-brand-grey mt-3 leading-relaxed line-clamp-3 sm:line-clamp-none">
                        <UtensilsCrossed className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-brand-orange" />
                        {o.items
                          .map((i) => `${i.quantity} × ${i.name_snapshot}${i.size_snapshot ? ` (${i.size_snapshot})` : ''}`)
                          .join(', ')}
                      </p>
                    )}

                    {blockedOnPayment(o) && (
                      <p className="text-xs text-brand-grey mt-2 flex items-start gap-1.5">
                        <Phone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Waiting on the customer’s payment — the kitchen is not being reminded for this one.
                      </p>
                    )}

                    {action && (
                      <div className="mt-3 flex sm:justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(o.orderCode, () => action.run(o.orderCode))}
                          className={`${overdue ? btnPrimary : btnGhost} w-full sm:w-auto !py-2.5 !px-4 !text-sm`}
                        >
                          {busy ? <Spinner className="!w-4 !h-4" /> : (
                            <>
                              {action.label}
                              <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
