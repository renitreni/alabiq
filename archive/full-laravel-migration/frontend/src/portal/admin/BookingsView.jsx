// ---------------------------------------------------------------------
// Admin Bookings — payment review inbox with a proper empty state and
// a list/detail workspace when there are rides to handle.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
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
import { Card, Badge, Spinner, btnPrimary } from '../components/ui';

const FILTERS = [
  { id: 'review', label: 'Needs review', short: 'Review', hint: 'Receipts waiting on you', q: '?payment_status=proof_uploaded', icon: FileCheck },
  { id: 'all', label: 'All', short: 'All', hint: 'Every ride request', q: '', icon: ClipboardList },
  { id: 'verified', label: 'Paid', short: 'Paid', hint: 'Payment already verified', q: '?payment_status=verified', icon: CircleCheck },
  { id: 'pending', label: 'Unpaid', short: 'Unpaid', hint: 'Passenger has not paid', q: '?payment_status=awaiting_proof', icon: Hourglass },
];

const EMPTY = {
  review: {
    title: 'Nothing to review',
    desc: 'When a passenger uploads a payment receipt, it lands here for you to verify or reject.',
    icon: FileCheck,
  },
  all: {
    title: 'No bookings yet',
    desc: 'Ride requests will show up here as soon as passengers start booking.',
    icon: Inbox,
  },
  verified: {
    title: 'No paid bookings',
    desc: 'Bookings you verify will appear in this list.',
    icon: CircleCheck,
  },
  pending: {
    title: 'No unpaid bookings',
    desc: 'Passengers who have not sent payment yet will appear here.',
    icon: Hourglass,
  },
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
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-5 py-10 sm:px-6 sm:py-16">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
      </div>
      <p className="font-black text-brand-black text-base">{title}</p>
      <p className="text-sm text-brand-grey mt-1.5 max-w-xs leading-relaxed">{desc}</p>
      {action}
    </div>
  );
}

function InfoTile({ icon: Icon, label, children }) {
  return (
    <div className="p-3.5 rounded-2xl bg-brand-muted min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-brand-grey uppercase tracking-wider mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-sm font-semibold text-brand-dark leading-snug break-words">{children}</div>
    </div>
  );
}

export default function BookingsView() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [driverId, setDriverId] = useState('');

  useEffect(() => {
    api.adminDrivers()
      .then((r) => setDrivers((r.drivers || []).filter((d) => d.driver_approved)))
      .catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList((await api.adminList(filter.q)).bookings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (code) => {
    setSelected(code);
    setDetail(null);
    setAssigning(false);
    setDriverId('');
    try {
      setDetail(await api.adminDetail(code));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  async function assign(code) {
    if (!driverId) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminAssign(code, driverId);
      setAssigning(false);
      setDriverId('');
      await loadList();
      await loadDetail(code);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadList(); }, [loadList]);
  useBroadcast('admin-bookings', { changed: () => { loadList(); if (selected) loadDetail(selected); } }, realtimeEnabled);

  async function verify(code) {
    setBusy(true);
    setError(null);
    try {
      await api.adminVerify(code);
      await loadList();
      await loadDetail(code);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reject(code) {
    const reason = window.prompt('Reason for rejecting this payment?');
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminReject(code, reason);
      await loadList();
      await loadDetail(code);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = list.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.booking_code?.toLowerCase().includes(q) ||
      b.passenger_name?.toLowerCase().includes(q)
    );
  });

  const emptyCopy = search.trim()
    ? { title: 'No matches', desc: `Nothing matches “${search.trim()}”. Try a booking code or passenger name.`, icon: Search }
    : EMPTY[filter.id];

  function clearSelection() {
    setSelected(null);
    setDetail(null);
  }

  const isEmpty = !loading && filtered.length === 0;

  return (
    <div className="space-y-3 sm:space-y-4 min-w-0">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 flex-1 no-scrollbar">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => { setFilter(f); clearSelection(); }}
                className={`snap-start shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-3.5 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-brand-black text-white border-brand-black'
                    : 'bg-white text-brand-grey border-brand-border hover:text-brand-dark'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="sm:hidden">{f.short}</span>
                <span className="hidden sm:inline">{f.label}</span>
                {active && !loading && (
                  <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-md bg-white/15">
                    {filtered.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative w-full xl:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or passenger name…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-border bg-white text-sm focus:outline-none focus:border-brand-orange"
          />
        </div>
      </div>

      {isEmpty && !selected && (
        <Card className="overflow-hidden">
          <EmptyState
            icon={emptyCopy.icon}
            title={emptyCopy.title}
            desc={emptyCopy.desc}
            action={
              filter.id !== 'all' && !search.trim() ? (
                <button
                  type="button"
                  onClick={() => setFilter(FILTERS.find((f) => f.id === 'all'))}
                  className="mt-4 text-sm font-bold text-brand-orange cursor-pointer"
                >
                  View all bookings
                </button>
              ) : null
            }
          />
        </Card>
      )}

      {(!isEmpty || selected) && (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 sm:gap-4 items-stretch min-w-0">
        <Card className={`xl:col-span-2 overflow-hidden flex flex-col min-w-0 ${selected ? 'hidden xl:flex' : ''}`}>
          <div className="px-3 sm:px-4 py-3 border-b border-brand-border flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-black text-brand-black truncate">{filter.label}</p>
              <p className="text-xs text-brand-grey truncate">{filter.hint}</p>
            </div>
            {!loading && (
              <span className="text-xs font-bold text-brand-grey tabular-nums shrink-0">
                {filtered.length} {filtered.length === 1 ? 'booking' : 'bookings'}
              </span>
            )}
          </div>

          <div className="p-1.5 sm:p-2 xl:flex-1 xl:min-h-0 xl:max-h-[calc(100vh-16rem)] xl:overflow-y-auto">
            {loading && (
              <div className="p-10 flex flex-col items-center gap-2">
                <Spinner />
                <p className="text-xs font-medium text-brand-grey">Loading bookings…</p>
              </div>
            )}

            {!loading && filtered.map((b) => {
              const ride = statusMeta(b.booking_status);
              const pay = ridePaymentMeta(b.payment_status, b.payment_method);
              const isSelected = selected === b.booking_code;
              return (
                <button
                  key={b.booking_code}
                  type="button"
                  onClick={() => loadDetail(b.booking_code)}
                  className={`w-full text-left p-2.5 sm:p-3 rounded-2xl mb-1.5 transition-all cursor-pointer border min-w-0 ${
                    isSelected
                      ? 'bg-brand-warm border-brand-orange/35 shadow-sm'
                      : 'border-transparent hover:bg-brand-surface'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-linear-to-br from-brand-orange/20 to-brand-red/10 text-brand-orange flex items-center justify-center font-black text-xs sm:text-sm shrink-0">
                      {initials(b.passenger_name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-brand-black truncate">{b.passenger_name || 'Passenger'}</span>
                        <span className="text-[11px] font-semibold text-brand-grey shrink-0">{timeAgo(b.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-brand-grey">
                        <span className="font-mono font-bold text-brand-dark truncate">{b.booking_code}</span>
                        <span className="text-brand-border">·</span>
                        <span className="font-bold text-brand-black tabular-nums shrink-0">{money(b.fare_amount)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <Badge tone={pay.tone} className="!px-2 !py-0.5 !text-[10px]">{pay.label}</Badge>
                        <Badge tone={ride.tone} className="!px-2 !py-0.5 !text-[10px]">{ride.label}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className={`xl:col-span-3 min-h-0 min-w-0 xl:min-h-[32rem] ${!selected ? 'hidden xl:flex xl:flex-col' : 'flex flex-col'}`}>
          {selected && (
            <button
              type="button"
              onClick={clearSelection}
              className="xl:hidden sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-brand-border inline-flex items-center gap-2 text-sm font-bold text-brand-dark px-4 py-3 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to list
            </button>
          )}

          {!selected && (
            <EmptyState
              icon={filtered.length === 0 ? Inbox : ClipboardList}
              title={filtered.length === 0 ? 'No booking to open' : 'Select a booking'}
              desc={
                filtered.length === 0
                  ? 'This list is empty, so there is nothing to review on this side yet.'
                  : 'Pick a ride from the list to see the passenger, route, driver, and payment proof.'
              }
            />
          )}

          {selected && !detail && (
            <div className="flex flex-col items-center justify-center py-24 gap-2">
              <Spinner className="!w-7 !h-7" />
              <p className="text-sm text-brand-grey">Opening booking…</p>
            </div>
          )}

          {detail && (
            <div className="p-3 sm:p-5 md:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap pb-4 border-b border-brand-border">
                <div className="min-w-0 flex items-start gap-3">
                  <span className="w-12 h-12 rounded-2xl bg-linear-to-br from-brand-orange to-brand-red text-white flex items-center justify-center font-black shrink-0">
                    {initials(detail.booking.passenger_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-lg text-brand-black truncate">
                      {detail.booking.passenger_name || 'Passenger'}
                    </p>
                    <p className="font-mono text-xs font-bold text-brand-grey mt-0.5">{detail.booking.booking_code}</p>
                    {(detail.booking.passenger_mobile || detail.booking.passenger_whatsapp) && (
                      <p className="text-sm text-brand-grey mt-1 inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        {detail.booking.passenger_mobile || detail.booking.passenger_whatsapp}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <Badge tone={ridePaymentMeta(detail.booking.payment_status, detail.booking.payment_method).tone}>
                    {ridePaymentMeta(detail.booking.payment_status, detail.booking.payment_method).label}
                  </Badge>
                  <Badge tone={statusMeta(detail.booking.booking_status).tone}>
                    {statusMeta(detail.booking.booking_status).label}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-brand-border overflow-hidden">
                <div className="flex items-start gap-3 p-3.5 bg-brand-muted/60">
                  <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-grey">Pickup</p>
                    <p className="text-sm font-semibold text-brand-dark mt-0.5">
                      {formatAddressDetail({
                        street: detail.booking.pickup_street,
                        building: detail.booking.pickup_building,
                        address: detail.booking.pickup_address,
                      })}
                    </p>
                  </div>
                </div>
                <div className="h-px bg-brand-border relative">
                  <span className="absolute left-[1.85rem] -top-1 w-0.5 h-2 bg-brand-border" />
                </div>
                <div className="flex items-start gap-3 p-3.5">
                  <span className="w-8 h-8 rounded-lg bg-brand-orange/12 text-brand-orange flex items-center justify-center shrink-0">
                    <Flag className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-grey">Drop-off</p>
                    <p className="text-sm font-semibold text-brand-dark mt-0.5">
                      {formatAddressDetail({
                        street: detail.booking.dropoff_street,
                        building: detail.booking.dropoff_building,
                        address: detail.booking.dropoff_address,
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-4">
                <InfoTile icon={Banknote} label="Fare">{money(detail.booking.fare_amount)}</InfoTile>
                <InfoTile icon={CalendarClock} label="Pickup time">
                  {detail.booking.pickup_datetime
                    ? new Date(detail.booking.pickup_datetime).toLocaleString()
                    : '—'}
                </InfoTile>
                <InfoTile icon={Wallet} label="Payment method">
                  {detail.booking.payment_method === 'cash' ? 'Cash — driver collects' : 'Online / transfer'}
                </InfoTile>
                <InfoTile icon={ClipboardList} label="Booked">
                  {new Date(detail.booking.created_at).toLocaleString()}
                </InfoTile>
              </div>

              <div className="mt-4 p-4 rounded-2xl border border-brand-border">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                      {detail.driver ? <User className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-grey">Driver</p>
                      {detail.driver ? (
                        <>
                          <p className="font-bold text-brand-dark truncate">{detail.driver.full_name || 'Driver'}</p>
                          {(detail.driver.mobile_number || detail.driver.whatsapp_number) && (
                            <p className="text-xs text-brand-grey">{detail.driver.mobile_number || detail.driver.whatsapp_number}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-brand-grey">No driver assigned yet</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {detail.booking.driver_ride_status && (
                      <Badge tone={detail.booking.driver_ride_status === 'completed' ? 'green' : 'blue'}>
                        {RIDE_STATUS_LABEL[detail.booking.driver_ride_status] || detail.booking.driver_ride_status}
                      </Badge>
                    )}
                    {!['completed', 'cancelled'].includes(detail.booking.booking_status) && (
                      <button
                        type="button"
                        onClick={() => setAssigning((v) => !v)}
                        className="text-xs font-bold text-brand-dark border border-brand-border rounded-lg px-2.5 py-1.5 hover:bg-brand-muted cursor-pointer"
                      >
                        {detail.driver ? 'Reassign' : 'Assign driver'}
                      </button>
                    )}
                  </div>
                </div>
                {detail.driverAssignedAt && (
                  <p className="text-xs text-brand-grey mt-2">
                    Assigned {new Date(detail.driverAssignedAt).toLocaleString()}
                  </p>
                )}
                {assigning && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={driverId}
                      onChange={(e) => setDriverId(e.target.value)}
                      className="flex-1 min-w-0 w-full px-3 py-2 rounded-xl border border-brand-border text-sm focus:outline-none focus:border-brand-orange"
                    >
                      <option value="">Choose an approved driver</option>
                      {drivers
                        .filter((d) => d.id !== detail.booking.assigned_driver_id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>{d.full_name || d.email}</option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!driverId || busy}
                      onClick={() => assign(detail.booking.booking_code)}
                      className={btnPrimary + ' !py-2 !px-3.5 !text-xs'}
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssigning(false)}
                      className="text-xs font-bold text-brand-grey border border-brand-border rounded-lg px-2.5 py-1.5 hover:bg-brand-muted cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                  <div>
                    <p className="font-black text-brand-black text-sm">Payment proofs</p>
                    <p className="text-xs text-brand-grey">Receipts the passenger uploaded</p>
                  </div>
                </div>
                {(!detail.proofs || detail.proofs.length === 0) && (
                  <div className="p-5 rounded-2xl bg-brand-muted text-center">
                    <p className="text-sm font-bold text-brand-dark">No receipt yet</p>
                    <p className="text-xs text-brand-grey mt-1">
                      {detail.booking.payment_method === 'cash'
                        ? 'Cash bookings do not need an online receipt.'
                        : 'The passenger has not uploaded a payment screenshot.'}
                    </p>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-3">
                  {(detail.proofs || []).map((p) => (
                    <div key={p.id} className="border border-brand-border rounded-2xl overflow-hidden bg-white">
                      {p.downloadUrl && (p.file_mime_type || '').startsWith('image') ? (
                        <a href={p.downloadUrl} target="_blank" rel="noreferrer">
                          <img src={p.downloadUrl} alt="Payment proof" className="w-full h-40 object-cover" />
                        </a>
                      ) : (
                        <a
                          href={p.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-4 text-sm text-brand-orange font-bold"
                        >
                          <ExternalLink className="w-4 h-4" /> Open file
                        </a>
                      )}
                      <div className="px-3 py-2 text-xs flex items-center justify-between bg-brand-muted">
                        <Badge tone={p.status === 'verified' ? 'green' : p.status === 'rejected' ? 'red' : 'amber'}>
                          {p.status === 'verified' ? 'Verified' : p.status === 'rejected' ? 'Rejected' : 'Waiting'}
                        </Badge>
                        <span className="text-brand-grey">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {detail.booking.payment_method === 'cash' ? (
                <div className="mt-5 p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-800 text-sm font-bold flex items-start gap-2">
                  <Banknote className="w-4 h-4 mt-0.5 shrink-0" />
                  Cash booking — the driver collects the fare at pickup. Nothing to verify here.
                </div>
              ) : detail.booking.payment_status !== 'verified' ? (
                <div className="flex flex-col sm:flex-row gap-3 mt-5">
                  <button
                    type="button"
                    onClick={() => verify(detail.booking.booking_code)}
                    disabled={busy}
                    className={btnPrimary + ' flex-1'}
                  >
                    {busy ? (
                      <Spinner className="!border-white/40 !border-t-white" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" /> Verify payment
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(detail.booking.booking_code)}
                    disabled={busy}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-red-50 text-red-600 font-bold py-3 rounded-xl border border-red-200 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              ) : (
                <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-start gap-2">
                  <CircleCheck className="w-4 h-4 mt-0.5 shrink-0" />
                  Payment verified — this booking is confirmed and open to drivers.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
      )}
    </div>
  );
}
