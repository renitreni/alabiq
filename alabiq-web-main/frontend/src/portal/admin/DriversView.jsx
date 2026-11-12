// ---------------------------------------------------------------------
// Admin Drivers — approve signups, review documents, and collect cash
// commission. Built for phone, tablet, and desktop.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  X,
  ExternalLink,
  FileText,
  ShieldCheck,
  ShieldX,
  UserPlus,
  UserCheck,
  Users,
  Search,
  Phone,
  Car,
  Wallet,
  Inbox,
  Sparkles,
  Camera,
  Shield,
  IdCard,
  BadgeCheck,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, Spinner, btnPrimary } from '../components/ui';

const DOC_LABELS = {
  national_id: 'National ID / Iqama',
  license: 'Driving license',
  vehicle_registration: 'Vehicle registration (Istimara)',
  insurance: 'Vehicle insurance',
  tga_permit: 'TGA ride-hailing permit',
  profile_photo: 'Driver photo',
  vehicle_photo: 'Vehicle photo + plate',
};

const DOC_ICONS = {
  national_id: IdCard,
  license: IdCard,
  vehicle_registration: FileText,
  insurance: Shield,
  tga_permit: BadgeCheck,
  profile_photo: Camera,
  vehicle_photo: Car,
};

const FILTERS = [
  { id: 'pending', label: 'Waiting', hint: 'Cannot go online yet', icon: UserPlus },
  { id: 'all', label: 'All', hint: 'Every driver account', icon: Users },
  { id: 'approved', label: 'Approved', hint: 'Can take rides', icon: UserCheck },
];

const EMPTY = {
  pending: {
    title: 'No one waiting',
    desc: 'New driver signups show up here until you verify their documents and approve them.',
    icon: Sparkles,
  },
  all: {
    title: 'No drivers yet',
    desc: 'When someone signs up as a driver, they will appear in this list.',
    icon: Inbox,
  },
  approved: {
    title: 'No approved drivers',
    desc: 'Drivers you approve can go online and take pick & drop rides.',
    icon: UserCheck,
  },
};

function money(n) {
  const v = Number(n) || 0;
  return `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initials(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}

function docStatus(status) {
  if (status === 'verified') return { label: 'Verified', tone: 'green' };
  if (status === 'rejected') return { label: 'Rejected', tone: 'red' };
  return { label: 'Waiting', tone: 'amber' };
}

function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-5 py-10 sm:py-14">
      <div className="w-14 h-14 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <p className="font-black text-brand-black">{title}</p>
      <p className="text-sm text-brand-grey mt-1.5 max-w-xs leading-relaxed">{desc}</p>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent, onClick }) {
  const accents = {
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-brand-orange/12 text-brand-orange',
  };
  const inner = (
    <>
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[accent]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <p className="text-xs font-bold text-brand-grey mt-3">{label}</p>
      <p className="text-xl sm:text-2xl font-black text-brand-black tabular-nums mt-0.5 break-words">{value}</p>
      <p className="text-xs text-brand-grey mt-1">{hint}</p>
    </>
  );
  const cls = 'p-4 sm:p-5 text-left w-full h-full min-w-0';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:bg-brand-muted/40 rounded-2xl`}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function DriverDocsPanel({ driverId, onReviewed }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await api.adminDriverDocuments(driverId)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [driverId]);
  useEffect(() => { load(); }, [load]);

  async function review(docId, status) {
    let reason;
    if (status === 'rejected') {
      reason = window.prompt('Reason for rejecting this document:');
      if (reason === null) return;
      if (!reason.trim()) { setError('A rejection reason is required.'); return; }
    }
    setBusyId(docId);
    setError(null);
    try {
      await api.adminReviewDoc(driverId, docId, { status, rejection_reason: reason });
      await load();
      if (onReviewed) onReviewed();
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  }

  if (loading && !data) {
    return (
      <div className="px-4 py-6 flex justify-center bg-brand-muted/50">
        <Spinner />
      </div>
    );
  }

  const docs = (data && data.documents) || [];

  return (
    <div className="bg-brand-muted/50 px-3 sm:px-4 py-3 space-y-2 border-t border-brand-border">
      <p className="text-xs font-bold text-brand-grey uppercase tracking-wider px-1">Documents</p>
      {error && <div className="text-xs text-red-600 font-medium px-1">{error}</div>}
      {docs.length === 0 && (
        <p className="text-sm text-brand-grey px-1 py-2">This driver has not uploaded any documents yet.</p>
      )}
      {docs.map((d) => {
        const Icon = DOC_ICONS[d.doc_type] || FileText;
        const st = docStatus(d.status);
        return (
          <div key={d.id} className="bg-white rounded-2xl border border-brand-border p-3 min-w-0">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-warm text-brand-orange flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-brand-dark text-sm leading-snug">{DOC_LABELS[d.doc_type] || d.doc_type}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <Badge tone={st.tone} className="!px-2 !py-0.5 !text-[10px]">{st.label}</Badge>
                  {d.expiry_date && (
                    <span className="text-xs text-brand-grey">Expires {d.expiry_date}</span>
                  )}
                </div>
                {d.rejection_reason && (
                  <p className="text-xs text-red-600 mt-1">{d.rejection_reason}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1 text-xs font-bold text-brand-dark border border-brand-border rounded-lg py-2 hover:bg-brand-muted"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View
                </a>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => review(d.id, 'verified')}
                disabled={busyId === d.id || d.status === 'verified'}
                className="inline-flex items-center justify-center gap-1 text-xs font-bold text-green-700 border border-green-200 rounded-lg py-2 hover:bg-green-50 disabled:opacity-40 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Verify
              </button>
              <button
                type="button"
                onClick={() => review(d.id, 'rejected')}
                disabled={busyId === d.id || d.status === 'rejected'}
                className="inline-flex items-center justify-center gap-1 text-xs font-bold text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50 disabled:opacity-40 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        );
      })}
      {data && data.requiredTypes && (
        <p className="text-xs text-brand-grey px-1 pt-1 leading-relaxed">
          Required: {data.requiredTypes.map((t) => DOC_LABELS[t] || t).join(', ')}.
          The driver is approved automatically once every required document is verified.
        </p>
      )}
    </div>
  );
}

function DriverCashPanel() {
  const [drivers, setDrivers] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.adminDriverCash();
      setDrivers((res.drivers || []).filter((d) => d.cashOwed > 0));
      setTotalOwed(res.totalOwed || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function settle(d) {
    const raw = window.prompt(
      `Record cash settlement from ${d.fullName || 'this driver'}.\n` +
      `They owe SAR ${d.cashOwed.toFixed(2)}. Amount received (SAR)?`,
      d.cashOwed.toFixed(2)
    );
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid settlement amount.');
      return;
    }
    setBusyId(d.id);
    setError(null);
    try {
      await api.adminSettleDriverCash(d.id, { amount });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && drivers.length === 0 && totalOwed === 0) return null;
  if (!loading && drivers.length === 0) return null;

  return (
    <Card className="overflow-hidden min-w-0">
      <div className="p-4 sm:p-5 flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand-orange/12 text-brand-orange flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-brand-black">Cash to collect</p>
          <p className="text-xs text-brand-grey mt-0.5">
            Commission from cash rides that drivers are holding.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold text-brand-grey uppercase">Outstanding</p>
          <p className="font-black text-brand-orange tabular-nums text-sm sm:text-base">{money(totalOwed)}</p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">{error}</div>
      )}

      <div className="divide-y divide-brand-border border-t border-brand-border">
        {drivers.map((d) => {
          const pct = d.cashOwedLimit > 0 ? Math.min(100, Math.round((d.cashOwed / d.cashOwedLimit) * 100)) : 0;
          return (
            <div key={d.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-brand-dark text-sm truncate">{d.fullName || 'Driver'}</p>
                  {d.blocked && <Badge tone="red" className="!px-2 !py-0.5 !text-[10px]">Blocked</Badge>}
                  {d.warning && !d.blocked && (
                    <Badge tone="amber" className="!px-2 !py-0.5 !text-[10px]">
                      <AlertTriangle className="w-3 h-3" /> Near cap
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-brand-grey tabular-nums mt-1">
                  Owes {money(d.cashOwed)} of {money(d.cashOwedLimit)} cap
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-brand-surface overflow-hidden max-w-xs">
                  <div
                    className={`h-full rounded-full ${d.blocked ? 'bg-red-500' : 'bg-brand-orange'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === d.id}
                onClick={() => settle(d)}
                className={btnPrimary + ' !py-2 !px-3 !text-xs w-full sm:w-auto shrink-0'}
              >
                {busyId === d.id ? <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" /> : 'Record payment'}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function DriversView() {
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDrivers((await api.adminDrivers()).drivers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setApproval(id, approved) {
    setBusyId(id);
    setError(null);
    try {
      await api.adminApproveDriver(id, approved);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = drivers.filter((d) => !d.driver_approved).length;
  const approvedCount = drivers.length - pendingCount;

  const filtered = drivers.filter((d) => {
    if (filter === 'pending' && d.driver_approved) return false;
    if (filter === 'approved' && !d.driver_approved) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.full_name?.toLowerCase().includes(q) ||
      d.email?.toLowerCase().includes(q) ||
      d.mobile_number?.includes(q) ||
      d.whatsapp_number?.includes(q) ||
      d.vehicle_plate?.toLowerCase().includes(q)
    );
  });

  const emptyCopy = search.trim()
    ? { title: 'No matches', desc: `Nothing matches “${search.trim()}”. Try a name, phone, or plate.`, icon: Search }
    : EMPTY[filter];

  const counts = { pending: pendingCount, all: drivers.length, approved: approvedCount };

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="overflow-hidden">
          <StatCard
            icon={UserPlus}
            label="Waiting to drive"
            value={pendingCount}
            hint="New signups to review"
            accent="amber"
            onClick={() => setFilter('pending')}
          />
        </Card>
        <Card className="overflow-hidden">
          <StatCard
            icon={UserCheck}
            label="Approved"
            value={approvedCount}
            hint="Can take rides"
            accent="green"
            onClick={() => setFilter('approved')}
          />
        </Card>
        <Card className="overflow-hidden">
          <StatCard
            icon={Users}
            label="All drivers"
            value={drivers.length}
            hint="Every driver account"
            accent="orange"
            onClick={() => setFilter('all')}
          />
        </Card>
      </div>

      <DriverCashPanel />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 flex-1 no-scrollbar">
          {FILTERS.map((f) => {
            const Icon = f.icon;
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                onClick={() => { setFilter(f.id); setExpandedId(null); }}
                className={`snap-start shrink-0 inline-flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                  active
                    ? 'bg-brand-black text-white border-brand-black'
                    : 'bg-white text-brand-grey border-brand-border hover:text-brand-dark'
                }`}
              >
                <Icon className="w-4 h-4" />
                {f.label}
                <span className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${active ? 'bg-white/15' : 'bg-brand-surface'}`}>
                  {counts[f.id]}
                </span>
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
            placeholder="Name, phone, or plate…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-border bg-white text-sm focus:outline-none focus:border-brand-orange"
          />
        </div>
      </div>

      <Card className="overflow-hidden min-w-0">
        <div className="px-3 sm:px-4 py-3 border-b border-brand-border flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-black text-brand-black truncate">
              {FILTERS.find((f) => f.id === filter)?.label}
            </p>
            <p className="text-xs text-brand-grey truncate">
              {FILTERS.find((f) => f.id === filter)?.hint}
            </p>
          </div>
          {!loading && (
            <span className="text-xs font-bold text-brand-grey tabular-nums shrink-0">
              {filtered.length} {filtered.length === 1 ? 'driver' : 'drivers'}
            </span>
          )}
        </div>

        {loading && (
          <div className="p-10 flex flex-col items-center gap-2">
            <Spinner />
            <p className="text-xs font-medium text-brand-grey">Loading drivers…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={emptyCopy.icon}
            title={emptyCopy.title}
            desc={emptyCopy.desc}
            action={
              filter !== 'all' && !search.trim() ? (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className="mt-4 text-sm font-bold text-brand-orange cursor-pointer"
                >
                  View all drivers
                </button>
              ) : null
            }
          />
        )}

        {!loading && filtered.map((d) => {
          const open = expandedId === d.id;
          const phone = d.mobile_number || d.whatsapp_number;
          return (
            <div key={d.id} className="border-t border-brand-border first:border-t-0">
              <div className="p-3 sm:p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-2xl bg-linear-to-br from-brand-orange/20 to-brand-red/10 text-brand-orange flex items-center justify-center font-black shrink-0">
                    {initials(d.full_name, d.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-brand-black truncate">{d.full_name || 'Unnamed driver'}</p>
                      <Badge
                        tone={d.driver_approved ? 'green' : 'amber'}
                        className="!px-2 !py-0.5 !text-[10px] shrink-0"
                      >
                        {d.driver_approved ? 'Approved' : 'Waiting'}
                      </Badge>
                    </div>
                    {phone && (
                      <p className="text-xs text-brand-grey mt-1 inline-flex items-center gap-1.5 min-w-0">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{phone}</span>
                      </p>
                    )}
                    {(d.vehicle_type || d.vehicle_plate) && (
                      <p className="text-xs text-brand-grey mt-0.5 inline-flex items-center gap-1.5 min-w-0">
                        <Car className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{[d.vehicle_type, d.vehicle_plate].filter(Boolean).join(' · ')}</span>
                      </p>
                    )}
                    {d.email && (
                      <p className="text-xs text-brand-grey truncate mt-0.5">{d.email}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mt-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : d.id)}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-brand-dark border border-brand-border rounded-xl px-3 py-2 hover:bg-brand-muted cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    {open ? 'Hide docs' : 'Documents'}
                  </button>
                  {d.driver_approved ? (
                    <button
                      type="button"
                      onClick={() => setApproval(d.id, false)}
                      disabled={busyId === d.id}
                      className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-red-600 border border-red-200 rounded-xl px-3 py-2 hover:bg-red-50 cursor-pointer disabled:opacity-50"
                    >
                      {busyId === d.id ? <Spinner /> : <><ShieldX className="w-4 h-4" /> Revoke</>}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setApproval(d.id, true)}
                      disabled={busyId === d.id}
                      className={btnPrimary + ' !py-2 !px-3'}
                    >
                      {busyId === d.id ? (
                        <Spinner className="!border-white/40 !border-t-white" />
                      ) : (
                        <><ShieldCheck className="w-4 h-4" /> Approve</>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {open && <DriverDocsPanel driverId={d.id} onReviewed={load} />}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
