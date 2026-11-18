// ---------------------------------------------------------------------
// Transaction Records hub: /transactions  (spec section 6)
// A complete, unified history of every Food Delivery order and Pick & Drop
// trip, with a 24/7-security assurance banner and one-tap PDF receipts for
// any completed transaction.
// ---------------------------------------------------------------------
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  UtensilsCrossed,
  Plane,
  Download,
  ArrowRight,
  ReceiptText,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthProvider';
import {
  fmtSAR,
  foodStatusMeta,
  foodPaymentMeta,
  statusMeta,
  ridePaymentMeta,
} from '../lib/constants';
import { PortalShell, Card, Badge, Spinner, btnPrimary, btnGhost } from '../components/ui';
import { downloadFoodInvoice, downloadRideInvoice } from '../lib/invoice';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food Delivery' },
  { id: 'ride', label: 'Pick & Drop' },
];

export default function TransactionsPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const customerName = profile?.fullName || user?.email || 'Alabiq customer';

  const [orders, setOrders] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(null); // code currently generating a PDF

  async function load() {
    setError(null);
    const [ordersRes, bookingsRes] = await Promise.allSettled([api.foodOrders(), api.myBookings()]);
    setOrders(ordersRes.status === 'fulfilled' ? ordersRes.value?.orders || [] : []);
    setBookings(bookingsRes.status === 'fulfilled' ? bookingsRes.value?.bookings || [] : []);
    if (ordersRes.status === 'rejected' && bookingsRes.status === 'rejected') {
      setError('We could not load your transactions. Please try again.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const foodRows = (orders || []).map((o) => {
      const s = foodStatusMeta(o.status);
      const p = foodPaymentMeta(o.payment_status);
      return {
        key: `food-${o.order_code}`,
        service: 'food',
        title: o.merchants?.name || 'Food order',
        code: o.order_code,
        date: o.delivered_at || o.created_at,
        amount: o.total,
        currency: 'SAR',
        statusLabel: s.label,
        statusTone: s.tone,
        payLabel: p.label,
        payTone: p.tone,
        completed: o.status === 'delivered',
        trackTo: `/food/track/${o.order_code}`,
        raw: o,
      };
    });
    const rideRows = (bookings || []).map((b) => {
      const s = statusMeta(b.booking_status);
      const p = ridePaymentMeta(b.payment_status, b.payment_method);
      return {
        key: `ride-${b.booking_code}`,
        service: 'ride',
        title: b.trip_type === 'airport_to_house' ? 'Airport → Home transfer' : 'Home → Airport transfer',
        code: b.booking_code,
        date: b.pickup_datetime || b.created_at,
        // What the passenger actually paid (fare + VAT); pre-0025 bookings
        // have no total_amount and fall back to the bare fare.
        amount: b.total_amount ?? b.fare_amount,
        currency: b.currency || 'SAR',
        statusLabel: s.label,
        statusTone: s.tone,
        payLabel: p.label,
        payTone: p.tone,
        completed: b.booking_status === 'completed',
        trackTo: `/track/${b.booking_code}`,
        raw: b,
      };
    });
    const all = [...foodRows, ...rideRows].sort(
      (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
    );
    return tab === 'all' ? all : all.filter((r) => r.service === tab);
  }, [orders, bookings, tab]);

  const loaded = orders != null && bookings != null;

  async function onDownload(row) {
    setBusy(row.code);
    try {
      if (row.service === 'ride') {
        downloadRideInvoice({ booking: row.raw, customerName });
      } else {
        // The list row lacks line items — fetch the full order for the receipt.
        const full = await api.foodOrder(row.code);
        downloadFoodInvoice({
          order: full.order,
          items: full.items,
          merchant: full.merchant,
          customerName,
          driverName: full.rider?.name,
        });
      }
    } catch {
      /* api layer surfaces the error toast */
    } finally {
      setBusy(null);
    }
  }

  return (
    <PortalShell
      title="Transaction records"
      subtitle="Your orders, trips & receipts"
      onBack={() => navigate('/home')}
      right={
        <button
          onClick={load}
          className="p-2 rounded-lg hover:bg-brand-surface cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-brand-grey" />
        </button>
      }
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="p-4 flex items-start gap-3 bg-gradient-to-br from-green-50 to-white border-green-200">
          <div className="w-10 h-10 rounded-xl bg-green-100 text-green-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-black text-brand-black text-sm">Payments secured &amp; monitored 24/7</p>
            <p className="text-xs text-brand-grey mt-0.5">
              Every transaction is encrypted, continuously monitored for fraud, and permanently
              recorded. Download a PDF receipt for any completed order or trip.
            </p>
          </div>
        </Card>

        <div className="flex gap-1 p-1 bg-brand-surface rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                tab === t.id ? 'bg-white text-brand-black shadow-sm' : 'text-brand-grey hover:text-brand-dark'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <Card className="p-6 text-center">
            <p className="text-brand-dark font-bold mb-1">Could not load your transactions</p>
            <p className="text-sm text-brand-grey mb-4">{error}</p>
            <button type="button" onClick={load} className={btnPrimary}>
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </Card>
        )}

        {!loaded && !error && (
          <div className="flex justify-center py-20">
            <Spinner className="!w-8 !h-8" />
          </div>
        )}

        {loaded && rows.length === 0 && !error && (
          <Card className="p-10 text-center">
            <ReceiptText className="w-10 h-10 text-brand-grey/40 mx-auto mb-3" />
            <p className="font-bold text-brand-dark">No transactions yet</p>
            <p className="text-sm text-brand-grey mt-1">
              Your food orders and airport trips will appear here.
            </p>
          </Card>
        )}

        {rows.map((row) => {
          const Icon = row.service === 'food' ? UtensilsCrossed : Plane;
          return (
            <Card key={row.key} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-orange/15 to-brand-red/10 text-brand-orange flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-brand-black truncate">{row.title}</p>
                  <p className="text-xs text-brand-grey font-mono">{row.code}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-brand-orange tabular-nums">
                    {fmtSAR(row.amount)}
                  </p>
                  <p className="text-[11px] text-brand-grey">
                    {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                <Badge tone={row.payTone}>{row.payLabel}</Badge>
                <div className="ml-auto flex gap-2">
                  {row.completed && (
                    <button
                      type="button"
                      onClick={() => onDownload(row)}
                      disabled={busy === row.code}
                      className={btnGhost + ' !py-2 !px-3.5 !text-xs'}
                    >
                      {busy === row.code ? (
                        <Spinner className="!w-4 !h-4" />
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" /> Receipt
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(row.trackTo)}
                    className={btnPrimary + ' !py-2 !px-3.5 !text-xs'}
                  >
                    {row.completed ? 'View' : 'Track'} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </PortalShell>
  );
}
