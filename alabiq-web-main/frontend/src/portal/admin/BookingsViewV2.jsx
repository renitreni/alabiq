// ---------------------------------------------------------------------
// Admin Bookings — payment review inbox with DataTable
// ---------------------------------------------------------------------
import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  Check,
  X,
  ExternalLink,
  Search,
  Bike,
  ArrowLeft,
  FileCheck,
  ClipboardList,
  CircleCheck,
  Hourglass,
  Inbox,
  MapPin,
  Flag,
  Wallet,
  Phone,
  CalendarClock,
  User,
  Image as ImageIcon,
  Banknote,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { statusMeta, ridePaymentMeta } from '../lib/constants';
import { formatAddressDetail } from '../lib/address';
import { Card, Badge, Spinner } from '../components/ui';
import { DataTable, createColumn } from '../components/DataTable';
import { notifySuccess, notifyError } from '../lib/notify';
import { toCsv, downloadCsv } from '../lib/csv';

const FILTERS = [
  { id: 'review', label: 'Needs review', short: 'Review', hint: 'Receipts waiting on you', icon: FileCheck },
  { id: 'all', label: 'All', short: 'All', hint: 'Every ride request', icon: ClipboardList },
  { id: 'verified', label: 'Paid', short: 'Paid', hint: 'Payment already verified', icon: CircleCheck },
  { id: 'pending', label: 'Unpaid', short: 'Unpaid', hint: 'Passenger has not paid', icon: Hourglass },
];

const EMPTY = {
  review: { title: 'Nothing to review', desc: 'When a passenger uploads a payment receipt, it lands here for you to verify or reject.', icon: FileCheck },
  all: { title: 'No bookings yet', desc: 'Ride requests will show up here as soon as passengers start booking.', icon: Inbox },
  verified: { title: 'No paid bookings', desc: 'Bookings you verify will appear in this list.', icon: CircleCheck },
  pending: { title: 'No unpaid bookings', desc: 'Passengers who have not sent payment yet will appear here.', icon: Hourglass },
};

const RIDE_STATUS_LABEL = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  arrived: 'Arrived at pickup',
  started: 'Trip started',
  completed: 'Completed',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function money(n) {
  const v = Number(n) || 0;
  return `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join('').toUpperCase() || '?';
}

function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-10 sm:px-6 sm:py-16">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
      </div>
      <p className="font-black text-brand-black">{title}</p>
      <p className="text-sm text-brand-grey mt-1.5 max-w-xs leading-relaxed">{desc}</p>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent }) {
  const accents = {
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-brand-orange/12 text-brand-orange',
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

function ProofThumb({ proof }) {
  if (!proof.downloadUrl) return null;
  const isImage = (proof.file_mime_type || '').startsWith('image');
  return (
    <a
      href={proof.downloadUrl}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 p-2 rounded-lg border border-brand-border hover:bg-brand-muted transition-colors"
    >
      {isImage ? (
        <img src={proof.downloadUrl} alt="Proof" className="w-16 h-16 rounded object-cover" />
      ) : (
        <ExternalLink className="w-5 h-5 text-brand-grey" />
      )}
      <span className="text-xs truncate max-w-[120px]">{proof.file_name}</span>
    </a>
  );
}

function DetailPanel({ detail, onClose, onVerify, onReject, busy }) {
  if (!detail) return null;

  return (
    <Card className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold">Booking {detail.booking.booking_code}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-brand-muted"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[70vh]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-brand-grey">Booking Code</p><p className="font-mono font-bold">{detail.booking.booking_code}</p></div>
            <div><p className="text-xs text-brand-grey">Type</p><p className="capitalize">{detail.booking.trip_type}</p></div>
            <div><p className="text-xs text-brand-grey">Passenger</p><p className="font-bold">{detail.booking.passenger_name}</p></div>
            <div><p className="text-xs text-brand-grey">Phone</p><p>{detail.booking.passenger_whatsapp}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-brand-grey">Pickup</p><p>{detail.booking.pickup_address}</p></div>
            <div className="sm:col-span-2"><p className="text-xs text-brand-grey">Dropoff</p><p>{detail.booking.dropoff_address}</p></div>
            <div><p className="text-xs text-brand-grey">Scheduled</p><p>{new Date(detail.booking.pickup_datetime).toLocaleString()}</p></div>
            <div><p className="text-xs text-brand-grey">Fare</p><p className="font-bold text-brand-orange">{money(detail.booking.fare_amount)}</p></div>
            <div><p className="text-xs text-brand-grey">Payment Method</p><p className="capitalize">{detail.booking.payment_method}</p></div>
            <div><p className="text-xs text-brand-grey">Payment Status</p><Badge tone={ridePaymentMeta[detail.booking.payment_status]?.tone || 'grey'}>{ridePaymentMeta[detail.booking.payment_status]?.label || detail.booking.payment_status}</Badge></div>
            <div><p className="text-xs text-brand-grey">Booking Status</p><Badge tone={statusMeta[detail.booking.booking_status]?.tone || 'grey'}>{statusMeta[detail.booking.booking_status]?.label || detail.booking.booking_status}</Badge></div>
          </div>
          
          <div className="mt-4 p-3 rounded-xl bg-brand-muted">
            <p className="font-bold mb-2">Driver Assignment</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-orange/20 flex items-center justify-center">{initials(detail.booking.driver_name)}</div>
              <div>
                <p className="font-bold">{detail.booking.driver_name || 'Unassigned'}</p>
                <p className="text-xs text-brand-grey">{detail.booking.driver_phone}</p>
              </div>
            </div>
          </div>

          {detail.proofs?.length > 0 && (
            <div className="mt-4">
              <p className="font-bold mb-2">Payment Proofs</p>
              <div className="space-y-2">
                {detail.proofs.map((proof) => (
                  <ProofThumb key={proof.id} proof={proof} />
                ))}
              </div>
            </div>
          )}

          {detail.booking.payment_method === 'cash' ? (
            <div className="mt-4 p-4 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-sm font-bold flex items-center gap-2">
              <Banknote className="w-4 h-4" /> Cash booking — driver collects fare at pickup.
            </div>
          ) : detail.booking.payment_status !== 'verified' ? (
            <div className="flex gap-3 mt-4">
              <button onClick={() => onVerify(detail.booking.booking_code)} disabled={busy} className="flex-1 px-4 py-2 bg-brand-orange text-white rounded-lg font-bold disabled:opacity-50">
                {busy ? 'Verifying...' : 'Verify Payment'}
              </button>
              <button onClick={() => onReject(detail.booking.booking_code)} disabled={busy} className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg font-bold hover:bg-red-50 disabled:opacity-50">
                Reject
              </button>
            </div>
          ) : (
            <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
              <CircleCheck className="w-4 h-4" /> Payment verified — confirmed and open to drivers.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function FilterTabs({ active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 flex-1 no-scrollbar">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onChange(filter.id)}
          className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${active === filter.id ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-grey border-brand-border'}`}
        >
          <filter.icon className="w-4 h-4" />
          <span className="sm:hidden">{filter.short}</span>
          <span className="hidden sm:inline">{filter.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function BookingsViewV2() {
  const [filter, setFilter] = useState('review');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ review: 0, verified: 0, pending: 0, all: 0 });

  // Real-time updates
  useBroadcast('admin', () => setStats(s => ({ ...s, review: s.review + 1 })), realtimeEnabled);

  // Load stats
  useEffect(() => {
    api.adminStats().then(res => setStats({
      review: res.totals.needsReview,
      verified: res.totals.bookings - res.totals.needsReview - res.totals.awaitingPayment,
      pending: res.totals.awaitingPayment,
      all: res.totals.bookings,
    })).catch(() => {});
  }, []);

  // Build columns
  const columns = useMemo(() => [
    createColumn('booking_code', { header: 'Code', width: '130px', sticky: 'left', className: 'font-mono' }),
    createColumn('passenger_name', { header: 'Passenger', width: '180px' }),
    createColumn('trip_type', { header: 'Type', width: '120px', render: v => <span className="capitalize">{v}</span> }),
    createColumn('pickup_datetime', { header: 'Scheduled', type: 'datetime', width: '160px' }),
    createColumn('fare_amount', { header: 'Fare', type: 'currency', width: '120px' }),
    createColumn('payment_method', { header: 'Pay Method', width: '120px', render: v => <span className="capitalize">{v}</span> }),
    createColumn('payment_status', {
      header: 'Payment',
      type: 'badge',
      width: '130px',
      badgeMap: {
        awaiting_proof: 'warning',
        proof_uploaded: 'warning',
        verified: 'success',
        rejected: 'danger',
        pending: 'warning',
        failed: 'danger',
        refunded: 'neutral',
      },
    }),
    createColumn('booking_status', {
      header: 'Booking',
      type: 'badge',
      width: '130px',
      badgeMap: {
        assigned: 'info',
        driver_assigned: 'info',
        driver_on_the_way: 'warning',
        arrived: 'warning',
        in_progress: 'warning',
        completed: 'success',
        cancelled: 'danger',
      },
    }),
    createColumn('driver_ride_status', { header: 'Driver Status', width: '140px', render: v => v ? RIDE_STATUS_LABEL[v] || v : '—' }),
    createColumn('created_at', { header: 'Created', type: 'date', format: 'relative', width: '130px' }),
    createColumn('actions', {
      header: 'Actions',
      type: 'actions',
      width: '100px',
      sticky: 'right',
      actions: [], // Actions handled by row click
    }),
  ], []);

  const filterFields = useMemo(() => [
    { key: 'booking_status', label: 'Booking Status', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'assigned', label: 'Assigned' },
      { value: 'driver_assigned', label: 'Driver Assigned' },
      { value: 'driver_on_the_way', label: 'On the Way' },
      { value: 'arrived', label: 'Arrived' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ]},
    { key: 'payment_status', label: 'Payment Status', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'awaiting_proof', label: 'Awaiting Proof' },
      { value: 'proof_uploaded', label: 'Proof Uploaded' },
      { value: 'verified', label: 'Verified' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'pending', label: 'Pending' },
      { value: 'failed', label: 'Failed' },
      { value: 'refunded', label: 'Refunded' },
    ]},
  ], []);

  // Fetch function
  const fetchBookings = useCallback(async (params) => {
    const queryParams = { ...params };
    // Apply filter tab as status filter
    if (filter === 'review') {
      queryParams.filters = { ...queryParams.filters, payment_status: 'proof_uploaded' };
    } else if (filter === 'verified') {
      queryParams.filters = { ...queryParams.filters, payment_status: 'verified' };
    } else if (filter === 'pending') {
      queryParams.filters = { ...queryParams.filters, payment_status: 'awaiting_proof' };
    }
    
    const res = await api.adminList(queryParams);
    return {
      data: res.data || [],
      pagination: res.pagination,
      sort: res.sort,
      filters: res.filters,
    };
  }, [filter]);

  // Handle row click to open detail
  const handleRowClick = async (row) => {
    setBusy(true);
    try {
      const res = await api.adminDetail(row.booking_code);
      setDetail(res.booking);
    } catch {
      notifyError('Failed to load booking details');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (code) => {
    setBusy(true);
    try {
      await api.adminVerify(code);
      notifySuccess('Payment verified');
      setDetail(null);
    } catch {
      notifyError('Failed to verify payment');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (code) => {
    setBusy(true);
    try {
      await api.adminReject(code, { reason: 'Rejected by admin' });
      notifySuccess('Payment rejected');
      setDetail(null);
    } catch {
      notifyError('Failed to reject payment');
    } finally {
      setBusy(false);
    }
  };

  // Compute counts for filter tabs
  const counts = useMemo(() => {
    // These would ideally come from the API response
    return { review: stats.review, verified: stats.verified, pending: stats.pending, all: stats.all };
  }, [stats]);

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={FileCheck} label="Needs Review" value={counts.review} hint="Receipts waiting" accent="amber" />
        <StatCard icon={ClipboardList} label="All Bookings" value={counts.all} hint="Total requests" accent="orange" />
        <StatCard icon={CircleCheck} label="Paid" value={counts.verified} hint="Verified payments" accent="green" />
        <StatCard icon={Hourglass} label="Unpaid" value={counts.pending} hint="Awaiting payment" accent="amber" />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-3">
        <FilterTabs active={filter} onChange={setFilter} />
        <div className="relative w-full xl:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey" />
          {/* Search is handled by DataTable header */}
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        fetchFn={fetchBookings}
        rowKey="booking_code"
        serverSide={true}
        initialPage={1}
        initialLimit={25}
        initialSortBy="created_at"
        initialSortOrder="desc"
        initialFilters={{}}
        showExport={true}
        exportFilename="bookings"
        filterFields={filterFields}
        maxHeight="70vh"
        emptyMessage={EMPTY[filter].title}
        emptyIcon={EMPTY[filter].icon}
        onRowClick={handleRowClick}
      />

      {/* Detail Panel */}
      {detail && (
        <DetailPanel
          detail={detail}
          onClose={() => setDetail(null)}
          onVerify={handleVerify}
          onReject={handleReject}
          busy={busy}
        />
      )}
    </div>
  );
}
