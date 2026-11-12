// ---------------------------------------------------------------------
// Admin Drivers — approve signups, review documents, collect cash commission
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Bike,
} from 'lucide-react';
import { api } from '../lib/api';
import { Card, Badge, Spinner, btnPrimary } from '../components/ui';
import { DataTable, createColumn } from '../components/DataTable';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';

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
  pending: { title: 'No one waiting', desc: 'New driver signups show up here until you verify their documents and approve them.', icon: Sparkles },
  all: { title: 'No drivers yet', desc: 'When someone signs up as a driver, they will appear in this list.', icon: Inbox },
  approved: { title: 'No approved drivers', desc: 'Drivers you approve can go online and take pick & drop rides.', icon: UserCheck },
};

function money(n) {
  const v = Number(n) || 0;
  return `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function initials(name, email) {
  const source = String(name || email || '?').trim();
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]).join('').toUpperCase() || '?';
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
      {Icon && (
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${accent && accents[accent] || 'bg-brand-muted text-brand-dark'}`}>
          <Icon className="w-4 h-4" />
        </span>
      )}
      <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
      <p className="text-lg sm:text-xl font-black text-brand-black tabular-nums mt-1 break-words">{value}</p>
      {hint && <p className="text-[11px] text-brand-grey mt-1">{hint}</p>}
    </>
  );
  const cls = 'p-4 min-w-0 text-left w-full h-full';
  if (onClick) {
    return (
      <Card className="overflow-hidden min-w-0">
        <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:bg-brand-muted/40`}>
          {inner}
        </button>
      </Card>
    );
  }
  return <Card className={cls}>{inner}</Card>;
}

function Pill({ tone, children }) {
  const TONE_CLASSES = {
    green: 'bg-green-100 text-green-800 border-green-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    grey: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[tone] || TONE_CLASSES.grey}`}>
      {children}
    </span>
  );
}

function DriverDocsPanel({ driverId, onReviewed }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.adminDriverDocuments(driverId)
      .then(res => { if (!cancelled) { setDocs(res.documents || []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId]);

  const handleReview = async (docId, status) => {
    const reason = status === 'rejected' ? prompt('Rejection reason:') : null;
    if (status === 'rejected' && !reason) return;
    
    try {
      await api.adminReviewDoc(driverId, docId, { status, rejection_reason: reason });
      notifySuccess(`Document ${status}`);
      onReviewed();
    } catch {
      notifyError('Failed to review document');
    }
  };

  if (loading) return <div className="p-4 text-center"><Spinner className="mx-auto" /></div>;
  if (!docs.length) return <div className="p-4 text-center text-brand-grey">No documents uploaded yet.</div>;

  return (
    <div className="space-y-2 mt-4 p-4 bg-brand-muted rounded-xl">
      <p className="font-bold text-brand-black mb-2">Documents</p>
      {docs.map((doc) => {
        const Icon = DOC_ICONS[doc.doc_type];
        return (
          <div key={doc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-brand-grey" />
            <div>
              <p className="font-medium">{DOC_LABELS[doc.doc_type] || doc.doc_type}</p>
              <p className="text-xs text-brand-grey">{doc.file_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={docStatus(doc.status).tone}>{docStatus(doc.status).label}</Pill>
            {doc.downloadUrl && (
              <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-orange hover:underline">View</a>
            )}
            {doc.status !== 'verified' && (
              <button onClick={() => handleReview(doc.id, 'verified')} className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200">Verify</button>
            )}
            {doc.status !== 'rejected' && (
              <button onClick={() => handleReview(doc.id, 'rejected')} className="px-3 py-1 text-xs font-bold bg-red-100 text-red-700 rounded hover:bg-red-200">Reject</button>
            )}
          </div>
        </div>
      )
    })}
    </div>
  );
}

export default function DriversViewV2() {
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const columns = useMemo(() => [
    createColumn('id', { header: 'ID', width: '80px', sticky: 'left', className: 'font-mono text-xs' }),
    createColumn('full_name', { header: 'Name', width: '200px', render: (v, row) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-orange/20 flex items-center justify-center font-bold text-sm">{initials(row.full_name, row.email)}</div>
        <div className="min-w-0">
          <p className="font-bold text-brand-black truncate">{row.full_name || 'Unnamed driver'}</p>
          <p className="text-xs text-brand-grey truncate">{row.email}</p>
        </div>
      </div>
    )}),
    createColumn('phone', { header: 'Phone', type: 'phone', width: '140px' }),
    createColumn('vehicle_type', { header: 'Vehicle', width: '140px', render: (v, row) => v ? `${v} ${row.vehicle_plate || ''}`.trim() : '—' }),
    createColumn('status', {
      header: 'Status',
      type: 'badge',
      width: '130px',
      badgeMap: {
        approved: 'success',
        pending: 'warning',
      },
    }),
    createColumn('verification_status', {
      header: 'Verification',
      type: 'badge',
      width: '130px',
      badgeMap: {
        approved: 'success',
        submitted: 'warning',
        pending: 'warning',
        rejected: 'danger',
        expired: 'danger',
        none: 'neutral',
      },
    }),
    createColumn('cash_owed', { header: 'Cash Owed', type: 'currency', width: '130px', render: (value) => money(value) }),
    createColumn('created_at', { header: 'Joined', type: 'date', format: 'relative', width: '130px' }),
    createColumn('actions', {
      header: 'Actions',
      type: 'actions',
      width: '160px',
      sticky: 'right',
      actions: [
        {
          label: 'View Documents',
          icon: FileText,
          onClick: (row) => setExpandedId(expandedId === row.id ? null : row.id),
        },
      ],
    }),
  ], []);

  const filterFields = useMemo(() => [
    { key: 'driver_approved', label: 'Approved', filterType: 'boolean' },
    { key: 'driver_verification_status', label: 'Verification', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'approved', label: 'Approved' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'pending', label: 'Pending' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'expired', label: 'Expired' },
      { value: 'none', label: 'None' },
    ]},
  ], []);

  const fetchDrivers = useCallback(async (params) => {
    const queryParams = { ...params };
    if (filter === 'pending') {
      queryParams.filters = { ...queryParams.filters, driver_approved: false };
    } else if (filter === 'approved') {
      queryParams.filters = { ...queryParams.filters, driver_approved: true };
    }
    
    const res = await api.adminDrivers(queryParams);
    return {
      data: res.data || [],
      pagination: res.pagination,
      sort: res.sort,
      filters: res.filters,
    };
  }, [filter]);

  const handleApproval = async (driverId, approved) => {
    setBusyId(driverId);
    try {
      await api.adminApproveDriver(driverId, approved);
      notifySuccess(approved ? 'Driver approved' : 'Driver approval revoked');
    } catch {
      notifyError('Failed to update approval');
    } finally {
      setBusyId(null);
    }
  };

  const handleRowClick = (row) => {
    // Toggle expanded row for documents
    setExpandedId(expandedId === row.id ? null : row.id);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={UserPlus} label="Waiting" value={0} hint="Need review" accent="amber" />
        <StatCard icon={UserCheck} label="Approved" value={0} hint="Can take rides" accent="green" />
        <StatCard icon={Wallet} label="Cash Owed" value={money(0)} hint="To collect" accent="orange" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 no-scrollbar">
        {FILTERS.map((filterTab) => (
          <button
            key={filterTab.id}
            type="button"
            onClick={() => setFilter(filterTab.id)}
            className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${filter === filterTab.id ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-grey border-brand-border'}`}
          >
            <filterTab.icon className="w-4 h-4" />
            <span className="sm:hidden">{filterTab.short || filterTab.label}</span>
            <span className="hidden sm:inline">{filterTab.label}</span>
          </button>
        ))}
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        fetchFn={fetchDrivers}
        rowKey="id"
        serverSide={true}
        initialPage={1}
        initialLimit={25}
        initialSortBy="created_at"
        initialSortOrder="desc"
        initialFilters={{}}
        showExport={true}
        exportFilename="drivers"
        filterFields={filterFields}
        maxHeight="70vh"
        emptyMessage={EMPTY[filter].title}
        emptyIcon={EMPTY[filter].icon}
        expandable={true}
        expandedRows={expandedId ? new Set([expandedId]) : new Set()}
        onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
        renderExpanded={(row) => <DriverDocsPanel driverId={row.id} onReviewed={() => {}} />}
      />
    </div>
  );
}
