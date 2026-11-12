// ---------------------------------------------------------------------
// Admin portal — Food Delivery tab (V2 using DataTable).
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store,
  ClipboardList,
  Wallet,
  Check,
  X,
  Bike,
  Pencil,
  Plus,
  Trash2,
  ShieldX,
  ShieldCheck,
  Eye,
  EyeOff,
  UtensilsCrossed,
  ChevronRight,
  Image as ImageIcon,
  UserPlus,
  UserCheck,
  Coins,
  Download,
  Clock,
  Search,
  Inbox,
  Sparkles,
  Banknote,
  Receipt,
  Undo2,
  AlertTriangle,
  CreditCard,
  User,
  Menu,
  Settings,
  DollarSign,
  RefreshCw,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { MAX_NAME_LENGTH } from '../lib/fieldValidation';
import { toCsv, downloadCsv } from '../lib/csv';
import { formatAddressDetail } from '../lib/address';
import { fmtSAR, foodStatusMeta, foodPaymentMeta } from '../lib/constants';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { Card, Badge, Field, Spinner, btnPrimary, btnGhost, inputClass } from '../components/ui';
import SharedImageUploadField from '../components/ImageUploadField';
import StoreHoursEditor from '../components/StoreHoursEditor';
import PasswordInput from '../components/PasswordInput';
import DatePicker from '../../components/DatePicker';
import MerchantForm from './MerchantForm';
import { DataTable, createColumn } from '../components/DataTable';

// Owner passwords are chosen by the admin and handed over in person — keep this
// in step with MIN_PASSWORD_LENGTH in backend/lib/validate.js.
const MIN_OWNER_PASSWORD = 8;

// Restaurant logo / menu photo upload. The shared field does the work; food
// only supplies its own signed-URL endpoint.
function ImageUploadField({ merchantId, kind, value, onChange }) {
  return (
    <SharedImageUploadField
      kind={kind}
      value={value}
      onChange={onChange}
      ready={!!merchantId}
      notReadyHint={`Save the restaurant first, then edit it to upload ${
        kind === 'logo' ? 'a logo' : 'a photo'
      }.`}
      getSignedUrl={(body) => api.adminFoodMerchantImageSignedUrl(merchantId, body)}
    />
  );
}

// Item category. The platform markup now comes from the net price (below),
// not from this bucket — item_type only falls back to a flat margin (SAR 5 /
// SAR 3) for items left WITHOUT a net price.
const ITEM_TYPES = [
  { value: 'meal_package', label: 'Meal / package' },
  { value: 'drink_dessert_addon', label: 'Drink / dessert / add-on' },
];

const NEXT_STATUS = {
  accepted: { status: 'preparing', label: 'Start preparing' },
  preparing: { status: 'ready', label: 'Mark ready' },
  ready: { status: 'out_for_delivery', label: 'Out for delivery' },
  out_for_delivery: { status: 'delivered', label: 'Mark delivered' },
};

function Stat({ label, value, accent = false, icon: Icon, hint, onClick }) {
  const inner = (
    <>
      {Icon && (
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
          accent ? 'bg-brand-orange/12 text-brand-orange' : 'bg-brand-muted text-brand-dark'
        }`}>
          <Icon className="w-4 h-4" />
        </span>
      )}
      <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
      <p className={`text-lg sm:text-xl font-black tabular-nums mt-1 break-words ${accent ? 'text-brand-orange' : 'text-brand-black'}`}>
        {value}
      </p>
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

// --- Menu item form ---------------------------------------------------------
const EMPTY_ITEM = { name: '', description: '', price: '', net_price: '', item_type: 'meal_package', category_id: '', image_url: '', size_options: null };

// Drink sizes appear for drink/dessert add-ons and drink-like categories
// (tea, coffee, milkshakes, PAMATAY UHAW, etc.).
function isDrinkCategory(category) {
  return /drink|tea|coffee|milk|shake|smoothie|uhaw|juice|beverage/i.test(category?.name || '');
}

function canHaveSizes(itemType, category) {
  return itemType === 'drink_dessert_addon' || isDrinkCategory(category);
}

const DEFAULT_SIZE_ROWS = [
  { id: 'medium', label: 'Medium', price: '', enabled: true },
  { id: 'large', label: 'Large', price: '', enabled: true },
];

// Live markup preview for the item form: list price - net price.
function markupHint(price, netPrice) {
  if (netPrice === '' || netPrice == null) {
    return { text: 'No net price — a flat SAR 5 / SAR 3 margin applies.', tone: 'muted' };
  }
  const p = Number(price);
  const n = Number(netPrice);
  if (Number.isNaN(p) || Number.isNaN(n)) return { text: '—', tone: 'muted' };
  const diff = p - n;
  return { text: `Platform markup: ${fmtSAR(diff)}`, tone: diff >= 0 ? 'success' : 'destructive' };
}

// --- Credit badge -----------------------------------------------------------
function CreditBadge({ used, limit }) {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const tone = pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'success';
  return (
    <Badge variant={tone} className="gap-1">
      {fmtSAR(used)} / {fmtSAR(limit)} ({pct}%)
    </Badge>
  );
}

// --- Status badge -----------------------------------------------------------
function StatusBadge({ status }) {
  const meta = foodStatusMeta[status] || { label: status, tone: 'muted', icon: Inbox };
  return (
    <Badge variant={meta.tone} className="gap-1">
      {meta.icon && <meta.icon className="w-3 h-3" />}
      {meta.label}
    </Badge>
  );
}

// --- Payment badge ----------------------------------------------------------
function PaymentBadge({ status }) {
  const meta = foodPaymentMeta[status] || { label: status, tone: 'muted', icon: CreditCard };
  return (
    <Badge variant={meta.tone} className="gap-1">
      {meta.icon && <meta.icon className="w-3 h-3" />}
      {meta.label}
    </Badge>
  );
}

function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-5 py-10 sm:py-16">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-warm text-brand-orange flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
      </div>
      <p className="font-black text-brand-black">{title}</p>
      <p className="text-sm text-brand-grey mt-1.5 max-w-xs leading-relaxed">{desc}</p>
    </div>
  );
}

// --- Settlement (date-range report) ----------------------------------------
function SettlementTab({ onRefresh }) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.adminFoodSettlement(from, to);
      setReport(data);
    } catch {
      notifyError('Failed to load settlement report');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (!report) return <Spinner className="mx-auto my-8" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass + ' w-40' } />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass + ' w-40' } />
          </label>
          <button onClick={load} disabled={loading} className={btnPrimary}><RefreshCw className="w-4 h-4" /> Load</button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-surface/50">
                {['Code', 'Date', 'Restaurant', 'Status', 'Payment', 'Subtotal', 'Delivery', 'Driver Fee', 'Platform', 'VAT', 'Total', 'Method'].map((h) => (
                  <th key={h} className="p-3 text-left font-semibold text-brand-grey">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.orders.map((o) => (
                <tr key={o.order_code} className="border-b border-brand-border/50 hover:bg-brand-surface/30">
                  <td className="p-3 font-mono">{o.order_code}</td>
                  <td className="p-3">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="p-3">{o.merchants?.name || '—'}</td>
                  <td className="p-3"><StatusBadge status={o.status} /></td>
                  <td className="p-3"><PaymentBadge status={o.payment_status} /></td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.subtotal)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.delivery_fee)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.driver_fee)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.platform_margin_total)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.vat_amount)}</td>
                  <td className="p-3 tabular-nums font-bold">{fmtSAR(o.total)}</td>
                  <td className="p-3">{o.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Online Owed to Store', value: fmtSAR(report.totals.onlineOwedToStore) },
          { label: 'Online Markup Kept', value: fmtSAR(report.totals.onlineMarkupKept) },
          { label: 'Cash Collected by Rider', value: fmtSAR(report.totals.cashCollectedByRider) },
          { label: 'Cash Store Payout', value: fmtSAR(report.totals.cashStorePayout) },
        ].map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} icon={DollarSign} />
        ))}
      </div>
    </div>
  );
}

// --- Main FoodAdmin Component -----------------------------------------------
export default function FoodAdmin() {
  const [activeTab, setActiveTab] = useState('restaurants');
  const [tick, setTick] = useState(0);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [merchantForm, setMerchantForm] = useState({});
  const [merchantFormErrors, setMerchantFormErrors] = useState({});
  const [merchantFormBusy, setMerchantFormBusy] = useState(false);
  const [merchantLogoFile, setMerchantLogoFile] = useState(null);
  const [merchantMenuPhotoFile, setMerchantMenuPhotoFile] = useState(null);
  const [viewingMenu, setViewingMenu] = useState(null);
  const [viewingMenuItems, setViewingMenuItems] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemFormErrors, setItemFormErrors] = useState({});
  const [itemFormBusy, setItemFormBusy] = useState(false);
  const [itemImageFile, setItemImageFile] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [ownerFor, setOwnerFor] = useState(null);
  const [ownerForm, setOwnerForm] = useState({ email: '', password: '', full_name: '', phone: '' });
  const [ownerPassword, setOwnerPassword] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [stcPayLightbox, setStcPayLightbox] = useState(null);

  // --- Restaurants DataTable ---
  const restaurantColumns = useMemo(() => [
    createColumn({ key: 'name', header: 'Name', cell: (r) => <strong>{r.name}</strong> }),
    createColumn({ key: 'cuisine_type', header: 'Cuisine', cell: (r) => r.cuisine_type || '—' }),
    createColumn({ key: 'status', header: 'Status', cell: (r) => (
      <Badge variant={r.status === 'suspended' ? 'destructive' : r.is_active ? 'success' : 'secondary'}>
        {r.status || (r.is_active ? 'Active' : 'Inactive')}
      </Badge>
    )}),
    createColumn({ key: 'credit', header: 'Credit', cell: (r) => (
      <CreditBadge used={Number(r.credit_used || 0)} limit={Number(r.credit_limit || 0)} />
    )}),
    createColumn({ key: 'orders_today', header: 'Orders Today', cell: (r) => r.orders_today || 0 }),
    createColumn({ key: 'owner', header: 'Owner', cell: (r) => r.owner ? (
      <div>
        <p className="font-medium">{r.owner.full_name || r.owner.email}</p>
        <p className="text-xs text-brand-grey">{r.owner.email}</p>
      </div>
    ) : (
      <span className="text-brand-grey">—</span>
    )}),
    createColumn({ key: 'actions', header: 'Actions', cell: (r) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditingMerchant(r); setMerchantForm({ name: r.name, cuisine_type: r.cuisine_type || '', description: r.description || '', address: r.address || '', street: r.street || '', building_number: r.building_number || '', lat: r.lat, lng: r.lng, is_active: r.is_active, is_featured: r.is_featured, badge: r.badge || '', credit_limit: r.credit_limit }); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={async () => { if (await confirmAction({ title: r.status === 'suspended' ? 'Reactivate Restaurant' : 'Suspend Restaurant', text: r.status === 'suspended' ? `Reactivate ${r.name}?` : `Suspend ${r.name}? They cannot accept new orders.`, confirmText: r.status === 'suspended' ? 'Reactivate' : 'Suspend', variant: r.status === 'suspended' ? 'default' : 'destructive' })) { setBusyId(r.id); try { await (r.status === 'suspended' ? api.adminFoodReactivateMerchant(r.id) : api.adminFoodSuspendMerchant(r.id, { reason: 'Suspended by admin' })); notifySuccess(r.status === 'suspended' ? 'Restaurant reactivated' : 'Restaurant suspended'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === r.id} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title={r.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
          {r.status === 'suspended' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldX className="w-3.5 h-3.5" />}
        </button>
        <button onClick={async () => { setViewingMenu(r); const menu = await api.adminFoodMerchantMenu(r.id); setViewingMenuItems(menu); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Menu"><Menu className="w-3.5 h-3.5" /></button>
        <button onClick={() => { setOwnerFor(r); setOwnerForm({ email: r.owner?.email || '', full_name: r.owner?.full_name || '', phone: r.owner?.mobile_number || '' }); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Owner"><User className="w-3.5 h-3.5" /></button>
        <button onClick={async () => { if (await confirmAction({ title: 'Replenish Credit', text: `Add credit to ${r.name}?`, confirmText: 'Replenish' })) { setBusyId(r.id); try { await api.adminFoodReplenishCredit(r.id, { amount: 300 }); notifySuccess('Credit replenished'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Credit"><Coins className="w-3.5 h-3.5" /></button>
      </div>
    )}),
  ], []);

  const fetchRestaurants = useCallback(async (params) => {
    const res = await api.adminFoodMerchants(params);
    return {
      data: (res.merchants || res.data || []).map(m => ({
        ...m,
        orders_today: m.today_orders || 0,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  // --- Orders DataTable ---
  const orderColumns = useMemo(() => [
    createColumn({ key: 'orderCode', header: 'Code', cell: (o) => <code className="font-mono text-xs">{o.order_code}</code> }),
    createColumn({ key: 'merchant', header: 'Restaurant', cell: (o) => o.merchant?.name || '—' }),
    createColumn({ key: 'customer', header: 'Customer', cell: (o) => o.customer?.name || '—' }),
    createColumn({ key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> }),
    createColumn({ key: 'paymentStatus', header: 'Payment', cell: (o) => <PaymentBadge status={o.payment_status} /> }),
    createColumn({ key: 'total', header: 'Total', cell: (o) => <span className="tabular-nums font-medium">{fmtSAR(o.total)}</span> }),
    createColumn({ key: 'driver', header: 'Driver', cell: (o) => o.driver?.name || '—' }),
    createColumn({ key: 'createdAt', header: 'Created', cell: (o) => new Date(o.created_at).toLocaleString() }),
  ], []);

  const orderFilterFields = useMemo(() => [
    { key: 'status', label: 'Status', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'pending', label: 'Pending' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'preparing', label: 'Preparing' },
      { value: 'ready', label: 'Ready' },
      { value: 'out_for_delivery', label: 'Out for delivery' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'rejected', label: 'Rejected' },
    ]},
    { key: 'payment_status', label: 'Payment', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'awaiting', label: 'Awaiting' },
      { value: 'paid', label: 'Paid' },
      { value: 'failed', label: 'Failed' },
      { value: 'refunded', label: 'Refunded' },
    ]},
  ], []);

  const fetchOrders = useCallback(async (params) => {
    const res = await api.adminFoodOrders(params);
    return {
      data: (res.orders || res.data || []).map(o => ({
        ...o,
        orderCode: o.order_code,
        merchant: o.merchants ? { name: o.merchants.name } : null,
        customer: o.customer ? { name: o.customer.name } : null,
        driver: o.driver ? { name: o.driver.name } : null,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  // --- Refunds DataTable ---
  const refundColumns = useMemo(() => [
    createColumn({ key: 'orderCode', header: 'Code', cell: (r) => <code className="font-mono text-xs">{r.orderCode}</code> }),
    createColumn({ key: 'merchant', header: 'Restaurant', cell: (r) => r.merchant || '—' }),
    createColumn({ key: 'customer', header: 'Customer', cell: (r) => r.customer || '—' }),
    createColumn({ key: 'total', header: 'Amount', cell: (r) => <span className="tabular-nums font-medium text-red-600">{fmtSAR(r.total)}</span> }),
    createColumn({ key: 'reason', header: 'Reason', cell: (r) => r.reason || '—' }),
    createColumn({ key: 'cancelledBy', header: 'Cancelled By', cell: (r) => r.cancelledBy || '—' }),
    createColumn({ key: 'cancelledAt', header: 'Date', cell: (r) => r.cancelledAt ? new Date(r.cancelledAt).toLocaleString() : '—' }),
    createColumn({ key: 'actions', header: 'Action', cell: (r) => (
      <button onClick={async () => { if (await confirmAction({ title: 'Process Refund', text: `Refund ${fmtSAR(r.total)} for order ${r.orderCode}?`, confirmText: 'Refund', variant: 'destructive' })) { setBusyId(r.orderCode); try { await api.adminFoodRefund(r.orderCode); notifySuccess('Refund processed'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === r.orderCode} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs text-red-600 hover:bg-red-50'} title="Process Refund">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
    )}),
  ], []);

  const fetchRefunds = useCallback(async (params) => {
    const res = await api.adminFoodRefunds(params);
    return {
      data: (res.data || res.refunds || []).map(r => ({
        ...r,
        orderCode: r.orderCode || r.order_code,
        merchant: r.merchant,
        customer: r.customer,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  // --- Render Functions ---
  const renderRestaurantExpanded = (row) => (
    <div className="p-4 border-t border-brand-border bg-brand-surface/30">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-brand-grey uppercase tracking-wider">Credit Limit</p>
          <p className="font-bold">{fmtSAR(row.credit_limit)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-grey uppercase tracking-wider">Credit Used</p>
          <p className="font-bold text-red-600">{fmtSAR(row.credit_used)}</p>
        </div>
        <div>
          <p className="text-xs text-brand-grey uppercase tracking-wider">Status</p>
          <p className="font-bold">{row.status || (row.is_active ? 'Active' : 'Inactive')}</p>
        </div>
        <div>
          <p className="text-xs text-brand-grey uppercase tracking-wider">Owner</p>
          <p className="font-bold">{row.owner?.full_name || row.owner?.email || '—'}</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-brand-border">
        <p className="text-xs text-brand-grey uppercase tracking-wider mb-2">Address</p>
        <p className="text-sm">{formatAddressDetail(row.address, row.street, row.building_number, null, null, null)}</p>
      </div>
    </div>
  );

  const renderOrderExpanded = (row) => (
    <div className="p-4 border-t border-brand-border bg-brand-surface/30 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Order Code</p><p className="font-mono font-bold">{row.order_code}</p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Status</p><p><StatusBadge status={row.status} /></p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Payment</p><p><PaymentBadge status={row.payment_status} /></p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Total</p><p className="font-bold">{fmtSAR(row.total)}</p></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Customer</p><p>{row.customer?.name || '—'}</p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Phone</p><p>{row.customer?.phone || '—'}</p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Restaurant</p><p>{row.merchant?.name || '—'}</p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Driver</p><p>{row.driver?.name || 'Unassigned'}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* STC Pay screenshot */}
        {row.payment_status === 'awaiting' && row.payment_method === 'stc_pay' && (
          <button onClick={() => setStcPayLightbox(row)} className={btnGhost + ' !text-xs'}><FileText className="w-3.5 h-3.5 mr-1" /> View STC Pay Screenshot</button>
        )}
        {/* Accept */}
        {row.status === 'pending' && row.merchant?.credit_remaining >= 300 && (
          <button onClick={async () => { if (await confirmAction({ title: 'Accept Order', text: 'Accept this order on behalf of the restaurant?', confirmText: 'Accept' })) { setBusyId(row.order_code); try { await api.adminFoodAcceptOrder(row.order_code); notifySuccess('Order accepted'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><Check className="w-3.5 h-3.5 mr-1" /> Accept</button>
        )}
        {/* Reject */}
        {row.status === 'pending' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Reject Order', text: 'Reject this order? The customer will be notified.', confirmText: 'Reject', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminFoodRejectOrder(row.order_code, { reason: 'Rejected by admin' }); notifySuccess('Order rejected'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><X className="w-3.5 h-3.5 mr-1" /> Reject</button>
        )}
        {/* Verify Payment */}
        {row.payment_status === 'awaiting' && row.payment_method !== 'cash' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Verify Payment', text: 'Mark payment as verified?', confirmText: 'Verify' })) { setBusyId(row.order_code); try { await api.adminFoodVerifyPayment(row.order_code); notifySuccess('Payment verified'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verify</button>
        )}
        {/* Reject Payment */}
        {row.payment_status === 'awaiting' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Reject Payment', text: 'Reject this payment proof?', confirmText: 'Reject', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminFoodRejectPayment(row.order_code, { reason: 'Rejected by admin' }); notifySuccess('Payment rejected'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><ShieldX className="w-3.5 h-3.5 mr-1" /> Reject Payment</button>
        )}
        {/* Assign Driver */}
        {['accepted', 'preparing', 'ready'].includes(row.status) && !row.driver && (
          <button onClick={() => setViewingOrder(row)} className={btnGhost + ' !text-xs'}><Bike className="w-3.5 h-3.5 mr-1" /> Assign Driver</button>
        )}
        {/* Advance Status */}
        {NEXT_STATUS[row.status] && (
          <button onClick={async () => { setBusyId(row.order_code); try { await api.adminFoodOrderStatus(row.order_code, NEXT_STATUS[row.status].status); notifySuccess(`Order status updated to ${NEXT_STATUS[row.status].label}`); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><ChevronRight className="w-3.5 h-3.5 mr-1" /> {NEXT_STATUS[row.status].label}</button>
        )}
        {/* Cancel */}
        {['pending', 'accepted', 'preparing', 'ready'].includes(row.status) && (
          <button onClick={async () => { if (await confirmAction({ title: 'Cancel Order', text: 'Cancel this order? This will refund the customer if paid.', confirmText: 'Cancel', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminFoodCancelOrder(row.order_code, { reason: 'Cancelled by admin' }); notifySuccess('Order cancelled'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><Trash2 className="w-3.5 h-3.5 mr-1" /> Cancel</button>
        )}
        {/* Refund */}
        {row.status === 'delivered' && row.payment_status === 'paid' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Refund Order', text: `Refund ${fmtSAR(row.total)} to the customer?`, confirmText: 'Refund', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminFoodRefund(row.order_code); notifySuccess('Refund processed'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><Undo2 className="w-3.5 h-3.5 mr-1" /> Refund</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-tick={tick}>
        <Stat label="Restaurants" value={0} icon={Store} />
        <Stat label="Live Orders" value={0} accent icon={ClipboardList} />
        <Stat label="Payments to Verify" value={0} icon={ShieldCheck} />
        <Stat label="Refunds Owed" value={0} accent icon={Undo2} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 no-scrollbar">
        {[
          { id: 'restaurants', label: 'Restaurants', icon: Store },
          { id: 'orders', label: 'Orders', icon: ClipboardList },
          { id: 'refunds', label: 'Refunds', icon: Undo2 },
          { id: 'settlement', label: 'Settlement', icon: Receipt },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`snap-start shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer ${activeTab === t.id ? 'bg-brand-black text-white border-brand-black' : 'bg-white text-brand-grey border-brand-border'}`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'restaurants' && (
        <DataTable
          columns={restaurantColumns}
          fetchFn={fetchRestaurants}
          rowKey="id"
          serverSide={true}
          initialPage={1}
          initialLimit={25}
          initialSortBy="created_at"
          initialSortOrder="desc"
          initialFilters={{}}
          showExport={true}
          exportFilename="restaurants"
          maxHeight="70vh"
          emptyMessage="No restaurants found"
          emptyIcon={Store}
          expandable={true}
          renderExpanded={renderRestaurantExpanded}
        />
      )}

      {activeTab === 'orders' && (
        <DataTable
          columns={orderColumns}
          fetchFn={fetchOrders}
          rowKey="order_code"
          serverSide={true}
          initialPage={1}
          initialLimit={25}
          initialSortBy="created_at"
          initialSortOrder="desc"
          initialFilters={{ status: '', payment_status: '' }}
          showExport={true}
          exportFilename="food-orders"
          filterFields={orderFilterFields}
          maxHeight="70vh"
          emptyMessage="No orders found"
          emptyIcon={Inbox}
          expandable={true}
          renderExpanded={renderOrderExpanded}
        />
      )}

      {activeTab === 'refunds' && (
        <DataTable
          columns={refundColumns}
          fetchFn={fetchRefunds}
          rowKey="orderCode"
          serverSide={true}
          initialPage={1}
          initialLimit={25}
          initialSortBy="cancelled_at"
          initialSortOrder="desc"
          initialFilters={{}}
          showExport={true}
          exportFilename="food-refunds"
          maxHeight="70vh"
          emptyMessage="No refunds pending"
          emptyIcon={Undo2}
        />
      )}

      {activeTab === 'settlement' && (
        <SettlementTab onRefresh={() => setTick(t => t + 1)} />
      )}

      {/* Merchant Edit Modal */}
      {editingMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95">
            <div className="sticky top-0 bg-white border-b border-brand-border p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Restaurant</h2>
              <button onClick={() => setEditingMerchant(null)} className="p-2 rounded-lg hover:bg-brand-surface"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); setMerchantFormBusy(true); try { await api.adminFoodUpdateMerchant(editingMerchant.id, merchantForm); notifySuccess('Restaurant updated'); setEditingMerchant(null); setTick(t => t + 1); } catch { notifyError('Failed to update restaurant'); } finally { setMerchantFormBusy(false); } }} className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name"><input value={merchantForm.name} onChange={(e) => setMerchantForm(f => ({ ...f, name: e.target.value }))} className={inputClass} required maxLength={MAX_NAME_LENGTH} /></Field>
                <Field label="Cuisine Type"><input value={merchantForm.cuisine_type} onChange={(e) => setMerchantForm(f => ({ ...f, cuisine_type: e.target.value }))} className={inputClass} /></Field>
                <Field label="Description" colSpan={2}><textarea value={merchantForm.description} onChange={(e) => setMerchantForm(f => ({ ...f, description: e.target.value }))} className={inputClass} rows={3} /></Field>
                <Field label="Address" colSpan={2}><input value={merchantForm.address} onChange={(e) => setMerchantForm(f => ({ ...f, address: e.target.value }))} className={inputClass} /></Field>
                <Field label="Street"><input value={merchantForm.street} onChange={(e) => setMerchantForm(f => ({ ...f, street: e.target.value }))} className={inputClass} /></Field>
                <Field label="Building #"><input value={merchantForm.building_number} onChange={(e) => setMerchantForm(f => ({ ...f, building_number: e.target.value }))} className={inputClass} /></Field>
                <Field label="Latitude"><input type="number" step="any" value={merchantForm.lat} onChange={(e) => setMerchantForm(f => ({ ...f, lat: e.target.value }))} className={inputClass} /></Field>
                <Field label="Longitude"><input type="number" step="any" value={merchantForm.lng} onChange={(e) => setMerchantForm(f => ({ ...f, lng: e.target.value }))} className={inputClass} /></Field>
                <Field label="Credit Limit"><input type="number" value={merchantForm.credit_limit} onChange={(e) => setMerchantForm(f => ({ ...f, credit_limit: Number(e.target.value) }))} className={inputClass} /></Field>
                <Field label="Active"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={merchantForm.is_active} onChange={(e) => setMerchantForm(f => ({ ...f, is_active: e.target.checked }))} /> Yes</label></Field>
                <Field label="Featured"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={merchantForm.is_featured} onChange={(e) => setMerchantForm(f => ({ ...f, is_featured: e.target.checked }))} /> Yes</label></Field>
                <Field label="Badge"><input value={merchantForm.badge} onChange={(e) => setMerchantForm(f => ({ ...f, badge: e.target.value }))} className={inputClass} placeholder="e.g. Popular, New" /></Field>
              </div>
              <div className="pt-4 border-t border-brand-border flex justify-end gap-2">
                <button type="button" onClick={() => setEditingMerchant(null)} className={btnGhost}>Cancel</button>
                <button type="submit" disabled={merchantFormBusy} className={btnPrimary}><Spinner className="w-4 h-4" /> Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Menu View Modal */}
      {viewingMenu && viewingMenuItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95">
            <div className="sticky top-0 bg-white border-b border-brand-border p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-semibold">Menu for {viewingMenu.name}</h2>
              <button onClick={() => { setViewingMenu(null); setViewingMenuItems(null); }} className="p-2 rounded-lg hover:bg-brand-surface"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              {(viewingMenuItems.categories || []).map((cat) => (
                <div key={cat.id} className="border border-brand-border rounded-xl overflow-hidden">
                  <div className="p-3 bg-brand-surface/50 font-semibold flex items-center justify-between">{cat.name} <span className="text-sm font-normal text-brand-grey">{cat.items?.length || 0} items</span></div>
                  <div className="divide-y divide-brand-border">
                    {(cat.items || []).map((item) => (
                      <div key={item.id} className="p-3 flex items-center gap-3 hover:bg-brand-surface/30">
                        <div className="flex-1 min-w-0"><p className="font-medium truncate">{item.name}</p><p className="text-xs text-brand-grey">{fmtSAR(item.price)} {item.net_price ? `(${fmtSAR(item.net_price)} net)` : '(no net price)'}</p></div>
                        <Badge variant={item.is_available ? 'success' : 'secondary'}>{item.is_available ? 'Available' : 'Hidden'}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STC Pay Lightbox */}
      {stcPayLightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setStcPayLightbox(null)}>
          <img src={stcPayLightbox.stc_pay_screenshot_url} alt="STC Pay screenshot" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Owner Password Modal */}
      {ownerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-amber-600" /></div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Owner Account for {ownerFor.name}</h3>
                <p className="text-sm text-gray-500 mt-1">Create or reset the owner's password. Give it to them in person.</p>
              </div>
            </div>
            {!ownerFor.ownerId ? (
              <form onSubmit={async (e) => { e.preventDefault(); if (ownerForm.password.length < MIN_OWNER_PASSWORD) return notifyError(`Password must be at least ${MIN_OWNER_PASSWORD} characters.`); setBusyId(ownerFor.id); try { await api.adminFoodSetMerchantOwner(ownerFor.id, ownerForm); notifySuccess('Owner account created and linked'); setOwnerFor(null); setOwnerForm({ email: '', password: '', full_name: '', phone: '' }); setTick(t => t + 1); } catch {} finally { setBusyId(null); }}} className="space-y-3">
                <PasswordInput required value={ownerForm.password} onChange={(e) => setOwnerForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" placeholder={`Password (min ${MIN_OWNER_PASSWORD} chars)`} />
                <div className="flex gap-2"><button type="submit" disabled={busyId === ownerFor.id} className={btnPrimary + ' flex-1'}>Create & Link Account</button><button type="button" onClick={() => setOwnerFor(null)} className={btnGhost + ' flex-1'}>Cancel</button></div>
              </form>
            ) : (
              <form onSubmit={async (e) => { e.preventDefault(); if (ownerPassword.length < MIN_OWNER_PASSWORD) return notifyError(`Password must be at least ${MIN_OWNER_PASSWORD} characters.`); setBusyId(ownerFor.id); try { await api.adminFoodSetOwnerPassword(ownerFor.id, { password: ownerPassword }); notifySuccess('Owner password updated'); setOwnerFor(null); setOwnerPassword(''); setTick(t => t + 1); } catch {} finally { setBusyId(null); }}} className="space-y-3">
                <PasswordInput required value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} autoComplete="new-password" placeholder={`New password (min ${MIN_OWNER_PASSWORD} chars)`} />
                <div className="flex gap-2"><button type="submit" disabled={busyId === ownerFor.id} className={btnPrimary + ' flex-1'}>Set New Password</button><button type="button" onClick={() => setOwnerFor(null)} className={btnGhost + ' flex-1'}>Close</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
