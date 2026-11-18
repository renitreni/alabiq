// ---------------------------------------------------------------------
// Admin — the Ecommerce (shop) vertical (V2 using DataTable).
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store, Package, ClipboardList, Boxes, Receipt, Pencil, Trash2, Check, X,
  UserPlus, RefreshCw, ShieldX, ShieldCheck, Wallet, Banknote, Inbox,
  Sparkles, Undo2, AlertTriangle, CreditCard, User, DollarSign, FileText,
  Lock, Package as PackageIcon, RotateCcw, Coins, Clock, Bike,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatAddressDetail } from '../lib/address';
import { fmtSAR, shopStatusMeta, shopPaymentMeta, TONE_CLASSES } from '../lib/constants';
import { notifySuccess, notifyError, confirmAction } from '../lib/notify';
import { Card, Badge, Field, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';
import PasswordInput from '../components/PasswordInput';
import StoreHoursEditor from '../components/StoreHoursEditor';
import CustomDropdown from '../../components/CustomDropdown';
import MerchantForm from './MerchantForm';
import { DataTable, createColumn } from '../components/DataTable';

const MIN_OWNER_PASSWORD = 8;
const SECTIONS = [
  { id: 'stores', label: 'Stores', icon: Store },
  { id: 'catalogue', label: 'Catalogue', icon: Package },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'refunds', label: 'Refunds', icon: Undo2 },
  { id: 'settlement', label: 'Settlement', icon: Receipt },
];

function Stat({ label, value, tone, icon: Icon, hint, onClick }) {
  const accents = { red: 'bg-red-50 text-red-600', green: 'bg-emerald-50 text-emerald-600', orange: 'bg-brand-orange/12 text-brand-orange' };
  const inner = (
    <>
      {Icon && (
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${accents[tone] || 'bg-brand-muted text-brand-dark'}`}>
          <Icon className="w-4 h-4" />
        </span>
      )}
      <p className="text-[11px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
      <p className={`text-lg sm:text-xl font-black tabular-nums mt-1 break-words ${tone === 'red' ? 'text-red-600' : 'text-brand-black'}`}>
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

function StatusBadge({ status }) {
  const meta = shopStatusMeta[status] || { label: status, tone: 'muted' };
  return <Badge variant={meta.tone} className="gap-1">{meta.icon && <meta.icon className="w-3 h-3" />}{meta.label}</Badge>;
}

function PaymentBadge({ status }) {
  const meta = shopPaymentMeta[status] || { label: status, tone: 'muted' };
  return <Badge variant={meta.tone} className="gap-1">{meta.icon && <meta.icon className="w-3 h-3" />}{meta.label}</Badge>;
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
      const data = await api.adminShopSettlement(from, to);
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
                {['Code', 'Date', 'Store', 'Subtotal', 'Delivery', 'Driver Fee', 'Platform', 'VAT', 'Total', 'Method', 'Payment'].map((h) => (
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
                  <td className="p-3 tabular-nums">{fmtSAR(o.subtotal)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.delivery_fee)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.driver_fee)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.platform_margin_total)}</td>
                  <td className="p-3 tabular-nums">{fmtSAR(o.vat_amount)}</td>
                  <td className="p-3 tabular-nums font-bold">{fmtSAR(o.total)}</td>
                  <td className="p-3">{o.payment_method}</td>
                  <td className="p-3"><PaymentBadge status={o.payment_status} /></td>
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

export default function ShopAdmin() {
  const [activeTab, setActiveTab] = useState('stores');
  const [tick, setTick] = useState(0);
  const [editingStore, setEditingStore] = useState(null);
  const [storeForm, setStoreForm] = useState({});
  const [storeFormBusy, setStoreFormBusy] = useState(false);
  const [viewingCatalogue, setViewingCatalogue] = useState(null);
  const [catalogueStore, setCatalogueStore] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [ownerFor, setOwnerFor] = useState(null);
  const [ownerForm, setOwnerForm] = useState({ email: '', password: '', full_name: '', phone: '' });
  const [ownerPassword, setOwnerPassword] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [stcPayLightbox, setStcPayLightbox] = useState(null);

  const storeColumns = useMemo(() => [
    createColumn({ key: 'name', header: 'Name', cell: (s) => <strong>{s.name}</strong> }),
    createColumn({ key: 'cuisine_type', header: 'Category', cell: (s) => s.cuisine_type || '—' }),
    createColumn({ key: 'status', header: 'Status', cell: (s) => (
      <Badge variant={s.status === 'suspended' ? 'destructive' : s.is_active ? 'success' : 'secondary'}>
        {s.status || (s.is_active ? 'Active' : 'Inactive')}
      </Badge>
    )}),
    createColumn({ key: 'credit', header: 'Credit', cell: (s) => (
      <div className="flex items-center gap-1">
        <span className={`text-[11px] font-bold ${Number(s.credit_used) >= Number(s.credit_limit) ? 'text-red-600' : Number(s.credit_used) >= Number(s.credit_limit) * 0.8 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {fmtSAR(s.credit_used)} / {fmtSAR(s.credit_limit)}
        </span>
        {Number(s.credit_limit) > 0 && (
          <span className="text-[10px] text-brand-grey">
            {(Number(s.credit_used) / Number(s.credit_limit) * 100).toFixed(0)}%
          </span>
        )}
      </div>
    )}),
    createColumn({ key: 'products_count', header: 'Products', cell: (s) => s.products_count || 0 }),
    createColumn({ key: 'categories_count', header: 'Categories', cell: (s) => s.categories_count || 0 }),
    createColumn({ key: 'owner', header: 'Owner', cell: (s) => s.owner ? (
      <div>
        <p className="font-medium">{s.owner.full_name || s.owner.email}</p>
        <p className="text-xs text-brand-grey">{s.owner.email}</p>
      </div>
    ) : (
      <span className="text-brand-grey">—</span>
    )}),
    createColumn({ key: 'actions', header: 'Actions', cell: (s) => (
      <div className="flex gap-1">
        <button onClick={() => { setEditingStore(s); setStoreForm({ name: s.name, cuisine_type: s.cuisine_type || '', description: s.description || '', address: s.address || '', street: s.street || '', building_number: s.building_number || '', lat: s.lat, lng: s.lng, is_active: s.is_active, is_featured: s.is_featured, badge: s.badge || '', credit_limit: s.credit_limit }); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={async () => { if (await confirmAction({ title: s.status === 'suspended' ? 'Reactivate Store' : 'Suspend Store', text: s.status === 'suspended' ? `Reactivate ${s.name}?` : `Suspend ${s.name}? They cannot accept new orders.`, confirmText: s.status === 'suspended' ? 'Reactivate' : 'Suspend', variant: s.status === 'suspended' ? 'default' : 'destructive' })) { setBusyId(s.id); try { await (s.status === 'suspended' ? api.adminShopReactivate(s.id) : api.adminShopSuspend(s.id, { reason: 'Suspended by admin' })); notifySuccess(s.status === 'suspended' ? 'Store reactivated' : 'Store suspended'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === s.id} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title={s.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
          {s.status === 'suspended' ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldX className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setCatalogueStore(s); setViewingCatalogue(s); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Catalogue"><PackageIcon className="w-3.5 h-3.5" /></button>
        <button onClick={() => { setOwnerFor(s); setOwnerForm({ email: s.owner?.email || '', full_name: s.owner?.full_name || '', phone: s.owner?.mobile_number || '' }); }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Owner"><User className="w-3.5 h-3.5" /></button>
        <button onClick={async () => { if (await confirmAction({ title: 'Replenish Credit', text: `Add credit to ${s.name}?`, confirmText: 'Replenish' })) { setBusyId(s.id); try { await api.adminShopCredit(s.id, { amount: 300 }); notifySuccess('Credit replenished'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Credit"><Coins className="w-3.5 h-3.5" /></button>
        <button onClick={() => { }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Hours"><Clock className="w-3.5 h-3.5" /></button>
      </div>
    )}),
  ], []);

  const fetchStores = useCallback(async (params) => {
    const res = await api.adminShopStores(params);
    return {
      data: (res.stores || res.data || []).map(s => ({
        ...s,
        products_count: s.products_count || 0,
        categories_count: s.categories_count || 0,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  const catalogueColumns = useMemo(() => [
    createColumn({ key: 'name', header: 'Product', cell: (p) => <strong>{p.name}</strong> }),
    createColumn({ key: 'category', header: 'Category', cell: (p) => p.category?.name || '—' }),
    createColumn({ key: 'brand', header: 'Brand', cell: (p) => p.brand || '—' }),
    createColumn({ key: 'netPrice', header: 'Net Price', cell: (p) => (
      <input
        type="number"
        step="0.01"
        value={p.net_price || ''}
        onChange={(e) => { p.net_price = Number(e.target.value); }}
        onBlur={async () => { try { await api.adminShopUpdateProduct(p.id, { net_price: p.net_price }); notifySuccess('Net price updated'); } catch { notifyError('Failed to update net price'); } }}
        className={inputClass + ' w-24 text-right'}
        placeholder="—"
      />
    )}),
    createColumn({ key: 'price', header: 'List Price', cell: (p) => <span className="tabular-nums">{fmtSAR(p.price)}</span> }),
    createColumn({ key: 'markup', header: 'Markup', cell: (p) => {
      if (!p.net_price) return <span className="text-brand-grey">—</span>;
      const markup = Number(p.price) - Number(p.net_price);
      return <span className={`tabular-nums font-medium ${markup >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtSAR(markup)}</span>;
    }}),
    createColumn({ key: 'stock', header: 'Stock', cell: (p) => (
      <span className={`tabular-nums font-medium ${p.track_stock && p.stock_quantity <= p.low_stock_threshold ? 'text-red-600' : p.track_stock && p.stock_quantity === 0 ? 'text-red-600' : ''}`}>
        {p.track_stock ? `${p.stock_quantity}` : '∞'}
      </span>
    )}),
    createColumn({ key: 'lowStock', header: 'Low Threshold', cell: (p) => p.track_stock ? p.low_stock_threshold : '—' }),
    createColumn({ key: 'trackStock', header: 'Track', cell: (p) => (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={p.track_stock}
          onChange={(e) => { p.track_stock = e.target.checked; }}
          onBlur={async () => { try { await api.adminShopUpdateProduct(p.id, { track_stock: p.track_stock }); } catch { notifyError('Failed to update'); } }}
        />
      </label>
    )}),
    createColumn({ key: 'available', header: 'Available', cell: (p) => (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={p.is_available}
          onChange={(e) => { p.is_available = e.target.checked; }}
          onBlur={async () => { try { await api.adminShopUpdateProduct(p.id, { is_available: p.is_available }); } catch { notifyError('Failed to update'); } }}
        />
      </label>
    )}),
    createColumn({ key: 'actions', header: 'Actions', cell: (p) => (
      <div className="flex gap-1">
        <button onClick={() => { }} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs'} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={async () => { if (await confirmAction({ title: 'Delete Product', text: `Delete ${p.name}? This cannot be undone.`, confirmText: 'Delete', variant: 'destructive' })) { try { await api.adminShopDeleteProduct(p.id); notifySuccess('Product deleted'); setTick(t => t + 1); } catch {} }}} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs text-red-600 hover:bg-red-50'} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    )}),
  ], []);

  const catalogueFilterFields = useMemo(() => [
    { key: 'category_id', label: 'Category', filterType: 'select', options: [] },
    { key: 'is_available', label: 'Availability', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'true', label: 'Available' },
      { value: 'false', label: 'Hidden' },
    ]},
    { key: 'track_stock', label: 'Track Stock', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ]},
  ], []);

  const fetchCatalogue = useCallback(async (params) => {
    if (!catalogueStore) return { data: { categories: [], products: [] }, pagination: { total: 0, totalPages: 1, page: 1, limit: 50 } };
    const res = await api.adminShopCatalogue(catalogueStore.id, params);
    return {
      data: res.data.products || [],
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 50 },
    };
  }, [catalogueStore]);

  const orderColumns = useMemo(() => [
    createColumn({ key: 'orderCode', header: 'Code', cell: (o) => <code className="font-mono text-xs">{o.order_code}</code> }),
    createColumn({ key: 'merchant', header: 'Store', cell: (o) => o.merchant?.name || '—' }),
    createColumn({ key: 'customer', header: 'Customer', cell: (o) => o.customer?.name || '—' }),
    createColumn({ key: 'status', header: 'Status', cell: (o) => <StatusBadge status={o.status} /> }),
    createColumn({ key: 'paymentStatus', header: 'Payment', cell: (o) => <PaymentBadge status={o.payment_status} /> }),
    createColumn({ key: 'itemsCount', header: 'Items', cell: (o) => o.items?.length || 0 }),
    createColumn({ key: 'total', header: 'Total', cell: (o) => <span className="tabular-nums font-medium">{fmtSAR(o.total)}</span> }),
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
    const res = await api.adminShopOrders(params);
    return {
      data: (res.orders || res.data || []).map(o => ({
        ...o,
        orderCode: o.order_code,
        merchant: o.merchants ? { name: o.merchants.name } : null,
        customer: o.customer ? { name: o.customer.name } : null,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  const inventoryColumns = useMemo(() => [
    createColumn({ key: 'name', header: 'Product', cell: (p) => <strong>{p.name}</strong> }),
    createColumn({ key: 'merchantName', header: 'Store', cell: (p) => p.merchantName || '—' }),
    createColumn({ key: 'stockQuantity', header: 'Stock', cell: (p) => (
      <span className={`tabular-nums font-medium ${p.isLowStock ? 'text-red-600' : ''}`}>
        {p.stockQuantity}
      </span>
    )}),
    createColumn({ key: 'lowStockThreshold', header: 'Low Threshold', cell: (p) => p.lowStockThreshold }),
    createColumn({ key: 'trackStock', header: 'Track', cell: (p) => p.trackStock ? 'Yes' : 'No' }),
    createColumn({ key: 'isAvailable', header: 'Available', cell: (p) => p.isAvailable ? 'Yes' : 'No' }),
    createColumn({ key: 'price', header: 'Price', cell: (p) => <span className="tabular-nums">{fmtSAR(p.price)}</span> }),
    createColumn({ key: 'netPrice', header: 'Net Price', cell: (p) => p.netPrice ? fmtSAR(p.netPrice) : '—' }),
  ], []);

  const inventoryFilterFields = useMemo(() => [
    { key: 'merchantId', label: 'Store', filterType: 'select', options: [] },
    { key: 'lowStockOnly', label: 'Low Stock Only', filterType: 'select', options: [
      { value: '', label: 'All' },
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ]},
  ], []);

  const fetchInventory = useCallback(async (params) => {
    const res = await api.adminShopInventory(params);
    return {
      data: res.data || [],
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 50 },
    };
  }, []);

  const refundColumns = useMemo(() => [
    createColumn({ key: 'orderCode', header: 'Code', cell: (r) => <code className="font-mono text-xs">{r.orderCode}</code> }),
    createColumn({ key: 'store', header: 'Store', cell: (r) => r.store || '—' }),
    createColumn({ key: 'customer', header: 'Customer', cell: (r) => r.customer || '—' }),
    createColumn({ key: 'total', header: 'Amount', cell: (r) => <span className="tabular-nums font-medium text-red-600">{fmtSAR(r.total)}</span> }),
    createColumn({ key: 'reason', header: 'Reason', cell: (r) => r.reason || '—' }),
    createColumn({ key: 'cancelledBy', header: 'Cancelled By', cell: (r) => r.cancelledBy || '—' }),
    createColumn({ key: 'cancelledAt', header: 'Date', cell: (r) => r.cancelledAt ? new Date(r.cancelledAt).toLocaleString() : '—' }),
    createColumn({ key: 'actions', header: 'Action', cell: (r) => (
      <button onClick={async () => { if (await confirmAction({ title: 'Process Refund', text: `Refund ${fmtSAR(r.total)} for order ${r.orderCode}?`, confirmText: 'Refund', variant: 'destructive' })) { setBusyId(r.orderCode); try { await api.adminShopRefund(r.orderCode); notifySuccess('Refund processed'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === r.orderCode} className={btnGhost + ' !py-1.5 !px-2.5 !text-xs text-red-600 hover:bg-red-50'} title="Process Refund">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
    )}),
  ], []);

  const fetchRefunds = useCallback(async (params) => {
    const res = await api.adminShopRefunds(params);
    return {
      data: (res.data || res.refunds || []).map(r => ({
        ...r,
        orderCode: r.orderCode || r.order_code,
        store: r.store,
        customer: r.customer,
      })),
      pagination: res.pagination || { total: res.total || 0, totalPages: res.totalPages || 1, page: res.page || 1, limit: res.limit || 25 },
    };
  }, []);

  const renderStoreExpanded = (row) => (
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
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Store</p><p>{row.merchant?.name || '—'}</p></div>
        <div><p className="text-xs text-brand-grey uppercase tracking-wider">Driver</p><p>{row.driver?.name || 'Unassigned'}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {row.payment_status === 'awaiting' && row.payment_method === 'stc_pay' && (
          <button onClick={() => setStcPayLightbox(row)} className={btnGhost + ' !text-xs'}><FileText className="w-3.5 h-3.5 mr-1" /> View STC Pay Screenshot</button>
        )}
        {row.status === 'pending' && row.merchant?.credit_remaining >= 300 && (
          <button onClick={async () => { if (await confirmAction({ title: 'Accept Order', text: 'Accept this order on behalf of the store?', confirmText: 'Accept' })) { setBusyId(row.order_code); try { await api.adminShopAcceptOrder(row.order_code); notifySuccess('Order accepted'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><Check className="w-3.5 h-3.5 mr-1" /> Accept</button>
        )}
        {row.status === 'pending' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Reject Order', text: 'Reject this order? The customer will be notified.', confirmText: 'Reject', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminShopRejectOrder(row.order_code, { reason: 'Rejected by admin' }); notifySuccess('Order rejected'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><X className="w-3.5 h-3.5 mr-1" /> Reject</button>
        )}
        {row.payment_status === 'awaiting' && row.payment_method !== 'cash' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Verify Payment', text: 'Mark payment as verified?', confirmText: 'Verify' })) { setBusyId(row.order_code); try { await api.adminShopVerifyPayment(row.order_code); notifySuccess('Payment verified'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Verify</button>
        )}
        {row.payment_status === 'awaiting' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Reject Payment', text: 'Reject this payment proof?', confirmText: 'Reject', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminShopRejectPayment(row.order_code, { reason: 'Rejected by admin' }); notifySuccess('Payment rejected'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><ShieldX className="w-3.5 h-3.5 mr-1" /> Reject Payment</button>
        )}
        {['accepted', 'preparing', 'ready'].includes(row.status) && !row.driver && (
          <button onClick={() => setViewingOrder(row)} className={btnGhost + ' !text-xs'}><Bike className="w-3.5 h-3.5 mr-1" /> Assign Driver</button>
        )}
        {['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(row.status) && (
          <button onClick={async () => { const next = { accepted: 'preparing', preparing: 'ready', ready: 'out_for_delivery', out_for_delivery: 'delivered' }[row.status]; if (next) { setBusyId(row.order_code); try { await api.adminShopOrderStatus(row.order_code, next); notifySuccess(`Order status updated to ${next}`); setTick(t => t + 1); } catch {} finally { setBusyId(null); } } }} disabled={busyId === row.order_code} className={btnPrimary + ' !text-xs'}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Advance</button>
        )}
        {['pending', 'accepted', 'preparing', 'ready'].includes(row.status) && (
          <button onClick={async () => { if (await confirmAction({ title: 'Cancel Order', text: 'Cancel this order? This will refund the customer if paid.', confirmText: 'Cancel', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminShopCancelOrder(row.order_code, { reason: 'Cancelled by admin' }); notifySuccess('Order cancelled'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><Trash2 className="w-3.5 h-3.5 mr-1" /> Cancel</button>
        )}
        {row.status === 'delivered' && row.payment_status === 'paid' && (
          <button onClick={async () => { if (await confirmAction({ title: 'Refund Order', text: `Refund ${fmtSAR(row.total)} to the customer?`, confirmText: 'Refund', variant: 'destructive' })) { setBusyId(row.order_code); try { await api.adminShopRefund(row.order_code); notifySuccess('Refund processed'); setTick(t => t + 1); } catch {} finally { setBusyId(null); } }}} disabled={busyId === row.order_code} className={btnGhost + ' !text-xs text-red-600 hover:bg-red-50'}><Undo2 className="w-3.5 h-3.5 mr-1" /> Refund</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" data-tick={tick}>
        <Stat label="Stores" value={0} icon={Store} />
        <Stat label="Live Orders" value={0} tone="orange" accent icon={ClipboardList} />
        <Stat label="Payments to Verify" value={0} icon={ShieldCheck} />
        <Stat label="Refunds Owed" value={0} tone="red" icon={Undo2} />
        <Stat label="Out of Stock" value={0} tone="red" icon={AlertTriangle} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0 no-scrollbar">
        {SECTIONS.map((t) => (
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

      {activeTab === 'stores' && (
        <DataTable
          columns={storeColumns}
          fetchFn={fetchStores}
          rowKey="id"
          serverSide={true}
          initialPage={1}
          initialLimit={25}
          initialSortBy="created_at"
          initialSortOrder="desc"
          initialFilters={{}}
          showExport={true}
          exportFilename="stores"
          maxHeight="70vh"
          emptyMessage="No stores found"
          emptyIcon={Store}
          expandable={true}
          renderExpanded={renderStoreExpanded}
        />
      )}

      {activeTab === 'catalogue' && (
        <div className="space-y-3">
          {catalogueStore && (
            <div className="flex items-center gap-3 p-3 bg-brand-surface/50 rounded-xl">
              <PackageIcon className="w-5 h-5 text-brand-orange" />
              <div className="flex-1">
                <p className="font-semibold">{catalogueStore.name}</p>
                <p className="text-sm text-brand-grey">Managing products and net prices</p>
              </div>
              <button onClick={() => { setViewingCatalogue(null); setCatalogueStore(null); }} className={btnGhost + ' !text-xs'}><X className="w-3.5 h-3.5" /> Close</button>
            </div>
          )}
          {catalogueStore ? (
            <DataTable
              columns={catalogueColumns}
              fetchFn={fetchCatalogue}
              rowKey="id"
              serverSide={true}
              initialPage={1}
              initialLimit={50}
              initialSortBy="name"
              initialSortOrder="asc"
              initialFilters={{}}
              showExport={true}
              exportFilename="catalogue"
              filterFields={catalogueFilterFields}
              maxHeight="70vh"
              emptyMessage="No products found"
              emptyIcon={PackageIcon}
            />
          ) : (
            <EmptyState
              icon={PackageIcon}
              title="Select a store"
              desc="Click the catalogue button on a store row to manage its products and net prices."
            />
          )}
        </div>
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
          exportFilename="shop-orders"
          filterFields={orderFilterFields}
          maxHeight="70vh"
          emptyMessage="No orders found"
          emptyIcon={Inbox}
          expandable={true}
          renderExpanded={renderOrderExpanded}
        />
      )}

      {activeTab === 'inventory' && (
        <DataTable
          columns={inventoryColumns}
          fetchFn={fetchInventory}
          rowKey="id"
          serverSide={true}
          initialPage={1}
          initialLimit={50}
          initialSortBy="stock_quantity"
          initialSortOrder="asc"
          initialFilters={{}}
          showExport={true}
          exportFilename="inventory"
          filterFields={inventoryFilterFields}
          maxHeight="70vh"
          emptyMessage="No inventory items found"
          emptyIcon={Boxes}
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
          exportFilename="shop-refunds"
          maxHeight="70vh"
          emptyMessage="No refunds pending"
          emptyIcon={Undo2}
        />
      )}

      {activeTab === 'settlement' && (
        <SettlementTab onRefresh={() => setTick(t => t + 1)} />
      )}

      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-white rounded-2xl shadow-xl animate-in fade-in zoom-in-95">
            <div className="sticky top-0 bg-white border-b border-brand-border p-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Store</h2>
              <button onClick={() => setEditingStore(null)} className="p-2 rounded-lg hover:bg-brand-surface"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={async (e) => { e.preventDefault(); setStoreFormBusy(true); try { await api.adminShopUpdateStore(editingStore.id, storeForm); notifySuccess('Store updated'); setEditingStore(null); setTick(t => t + 1); } catch { notifyError('Failed to update store'); } finally { setStoreFormBusy(false); }}} className="p-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name"><input value={storeForm.name} onChange={(e) => setStoreForm(f => ({ ...f, name: e.target.value }))} className={inputClass} required /></Field>
                <Field label="Category"><input value={storeForm.cuisine_type} onChange={(e) => setStoreForm(f => ({ ...f, cuisine_type: e.target.value }))} className={inputClass} /></Field>
                <Field label="Description" colSpan={2}><textarea value={storeForm.description} onChange={(e) => setStoreForm(f => ({ ...f, description: e.target.value }))} className={inputClass} rows={3} /></Field>
                <Field label="Address" colSpan={2}><input value={storeForm.address} onChange={(e) => setStoreForm(f => ({ ...f, address: e.target.value }))} className={inputClass} /></Field>
                <Field label="Street"><input value={storeForm.street} onChange={(e) => setStoreForm(f => ({ ...f, street: e.target.value }))} className={inputClass} /></Field>
                <Field label="Building #"><input value={storeForm.building_number} onChange={(e) => setStoreForm(f => ({ ...f, building_number: e.target.value }))} className={inputClass} /></Field>
                <Field label="Latitude"><input type="number" step="any" value={storeForm.lat} onChange={(e) => setStoreForm(f => ({ ...f, lat: e.target.value }))} className={inputClass} /></Field>
                <Field label="Longitude"><input type="number" step="any" value={storeForm.lng} onChange={(e) => setStoreForm(f => ({ ...f, lng: e.target.value }))} className={inputClass} /></Field>
                <Field label="Credit Limit"><input type="number" value={storeForm.credit_limit} onChange={(e) => setStoreForm(f => ({ ...f, credit_limit: Number(e.target.value) }))} className={inputClass} /></Field>
                <Field label="Active"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={storeForm.is_active} onChange={(e) => setStoreForm(f => ({ ...f, is_active: e.target.checked }))} /> Yes</label></Field>
                <Field label="Featured"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={storeForm.is_featured} onChange={(e) => setStoreForm(f => ({ ...f, is_featured: e.target.checked }))} /> Yes</label></Field>
                <Field label="Badge"><input value={storeForm.badge} onChange={(e) => setStoreForm(f => ({ ...f, badge: e.target.value }))} className={inputClass} placeholder="e.g. Popular, New" /></Field>
              </div>
              <div className="pt-4 border-t border-brand-border flex justify-end gap-2">
                <button type="button" onClick={() => setEditingStore(null)} className={btnGhost}>Cancel</button>
                <button type="submit" disabled={storeFormBusy} className={btnPrimary}><Spinner className="w-4 h-4" /> Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stcPayLightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setStcPayLightbox(null)}>
          <img src={stcPayLightbox.stc_pay_screenshot_url} alt="STC Pay screenshot" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

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
              <form onSubmit={async (e) => { e.preventDefault(); if (ownerForm.password.length < MIN_OWNER_PASSWORD) return notifyError(`Password must be at least ${MIN_OWNER_PASSWORD} characters.`); setBusyId(ownerFor.id); try { await api.adminShopSetOwner(ownerFor.id, ownerForm); notifySuccess('Owner account created and linked'); setOwnerFor(null); setOwnerForm({ email: '', password: '', full_name: '', phone: '' }); setTick(t => t + 1); } catch {} finally { setBusyId(null); }}} className="space-y-3">
                <PasswordInput required value={ownerForm.password} onChange={(e) => setOwnerForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" placeholder={`Password (min ${MIN_OWNER_PASSWORD} chars)`} />
                <div className="flex gap-2"><button type="submit" disabled={busyId === ownerFor.id} className={btnPrimary + ' flex-1'}>Create & Link Account</button><button type="button" onClick={() => setOwnerFor(null)} className={btnGhost + ' flex-1'}>Cancel</button></div>
              </form>
            ) : (
              <form onSubmit={async (e) => { e.preventDefault(); if (ownerPassword.length < MIN_OWNER_PASSWORD) return notifyError(`Password must be at least ${MIN_OWNER_PASSWORD} characters.`); setBusyId(ownerFor.id); try { await api.adminShopSetOwnerPassword(ownerFor.id, { password: ownerPassword }); notifySuccess('Owner password updated'); setOwnerFor(null); setOwnerPassword(''); setTick(t => t + 1); } catch {} finally { setBusyId(null); }}} className="space-y-3">
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
