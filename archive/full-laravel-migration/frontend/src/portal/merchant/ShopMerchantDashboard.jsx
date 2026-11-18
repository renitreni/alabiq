// ---------------------------------------------------------------------
// Store owner dashboard (Ecommerce). Sibling of MerchantDashboard, which
// serves restaurants — they share MerchantLayout and nothing else, because
// a store manages products, options and STOCK rather than a menu.
//
// NOTE ON MONEY: there is no net_price field anywhere in this file. The
// markup is set by an admin; a store sees its list prices, its orders, and
// its credit meter. The API refuses the field too, so this is enforcement
// in two places rather than a UI convention.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBroadcast } from '../lib/useBroadcast';
import { fmtSAR, TONE_CLASSES } from '../lib/constants';
import { notifyError, notifySuccess, confirmAction } from '../lib/notify';
import { startUrgentAlert, acknowledgeUrgentAlert } from '../lib/alertSound';
import { Card, Field, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';
import ImageUploadField from '../components/ImageUploadField';
import StoreHoursEditor from '../components/StoreHoursEditor';
import MerchantLayout from './MerchantLayout';
import NewOrderAlertBar from '../components/NewOrderAlertBar';
import ShopMerchantOrders from './ShopMerchantOrders';
import LocationPicker from '../components/LocationPicker';

const emptyProduct = {
  name: '',
  description: '',
  brand: '',
  unit: '',
  category_id: '',
  price: '',
  stock_quantity: 0,
  low_stock_threshold: 5,
  track_stock: true,
  is_available: true,
  image_url: '',
};

function Panel({ title, subtitle, right, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-black text-brand-black">{title}</p>
          {subtitle && <p className="text-sm text-brand-grey mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  );
}

function StatCard({ label, value, hint, tone }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-brand-grey font-medium">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone === 'red' ? 'text-red-600' : 'text-brand-black'}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-brand-grey mt-1">{hint}</p>}
    </Card>
  );
}

// Stock band for the OWNER's view. Unlike the customer API this shows the
// real number — a store is entitled to its own inventory; the 0029 grants
// exist to stop competitors reading it, not the store itself.
function stockBand(qty, threshold, trackStock) {
  if (!trackStock) return { label: 'Not tracked', tone: 'grey' };
  if (qty <= 0) return { label: 'Out of stock', tone: 'red' };
  if (qty <= threshold) return { label: 'Low', tone: 'amber' };
  return { label: 'In stock', tone: 'green' };
}

// --- Overview ---------------------------------------------------------
function OverviewTab({ store, analytics }) {
  if (!analytics) return <Spinner />;
  const credit = analytics.credit || {};
  const creditPct = credit.limit ? Math.min(100, (credit.used / credit.limit) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total orders" value={analytics.totalOrders} />
        <StatCard label="Delivered" value={analytics.deliveredCount} />
        <StatCard label="Delivered volume" value={fmtSAR(analytics.deliveredVolume)} hint="Customer spend" />
        <StatCard
          label="Low stock"
          value={analytics.lowStockCount}
          tone={analytics.lowStockCount > 0 ? 'red' : undefined}
          hint={`At or below ${analytics.lowStockCount === 1 ? 'its' : 'their'} threshold`}
        />
      </div>

      <Panel title="Platform credit" subtitle="Your markup accrues here as orders are accepted.">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xl font-black text-brand-black">{fmtSAR(credit.used)}</span>
          <span className="text-sm text-brand-grey">of {fmtSAR(credit.limit)}</span>
        </div>
        <div className="h-2 rounded-full bg-brand-surface overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              credit.suspended || creditPct >= 100
                ? 'bg-red-500'
                : creditPct >= 80
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${creditPct}%` }}
          />
        </div>
        {credit.suspended && (
          <p className="mt-3 text-sm font-bold text-red-700 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Your store is suspended — settle the balance to accept orders again.
          </p>
        )}
        {!credit.suspended && creditPct >= 80 && (
          <p className="mt-3 text-sm font-medium text-amber-700">
            You are past {fmtSAR(credit.alertAt)}. New orders stop at {fmtSAR(credit.limit)}.
          </p>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Products" value={analytics.productCount} />
        <StatCard label="Categories" value={analytics.categoryCount} />
      </div>

      {!store.isActive && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium">
          Your store is not listed yet. An admin lists it once your catalogue is checked.
        </div>
      )}
    </div>
  );
}

// --- Products ---------------------------------------------------------
function ProductsTab({ products, categories, onSaved, onDeleted }) {
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  function startEdit(p) {
    setForm({
      name: p.name || '',
      description: p.description || '',
      brand: p.brand || '',
      unit: p.unit || '',
      category_id: p.category_id || '',
      price: p.price ?? '',
      stock_quantity: p.stock_quantity ?? 0,
      low_stock_threshold: p.low_stock_threshold ?? 5,
      track_stock: p.track_stock !== false,
      is_available: p.is_available !== false,
      image_url: p.image_url || '',
    });
    setEditingId(p.id);
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        price: Number(form.price),
        stock_quantity: Number(form.stock_quantity),
        low_stock_threshold: Number(form.low_stock_threshold),
        category_id: form.category_id || null,
        description: form.description || null,
        brand: form.brand || null,
        unit: form.unit || null,
        image_url: form.image_url || null,
      };
      if (editingId) await api.merchantShopUpdateProduct(editingId, body);
      else await api.merchantShopAddProduct(body);
      notifySuccess(editingId ? 'Product updated' : 'Product added');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyProduct);
      onSaved();
    } catch {
      /* api.js surfaced it */
    } finally {
      setBusy(false);
    }
  }

  async function remove(p) {
    if (!(await confirmAction(`Delete "${p.name}"?`, 'Past orders keep their own record.'))) return;
    try {
      await api.merchantShopDeleteProduct(p.id);
      onDeleted();
    } catch {
      /* surfaced */
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Products"
        subtitle={`${products.length} product${products.length === 1 ? '' : 's'}`}
        right={
          <button
            onClick={() => {
              setForm(emptyProduct);
              setEditingId(null);
              setShowForm((v) => !v);
            }}
            className={btnPrimary + ' !py-2 !px-3 text-sm'}
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Close' : 'Add product'}
          </button>
        }
      >
        {showForm && (
          <form onSubmit={save} className="mb-5 p-4 rounded-xl bg-brand-warm border border-brand-border space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand">
                <input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Unit (e.g. 1 kg, 500 ml)">
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Price (SAR)">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Stock quantity">
                <input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Low-stock warning at">
                <input
                  type="number"
                  min="0"
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Product photo">
                <ImageUploadField
                  kind="item"
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url || '' })}
                  getSignedUrl={(body) => api.merchantShopImageSignedUrl(body)}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </Field>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={(e) => setForm({ ...form, is_available: e.target.checked })}
                />
                Available to customers
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.track_stock}
                  onChange={(e) => setForm({ ...form, track_stock: e.target.checked })}
                />
                Track stock
              </label>
            </div>
            <button disabled={busy} className={btnPrimary + ' w-full'}>
              {busy ? <Spinner className="!border-white/40 !border-t-white" /> : 'Save product'}
            </button>
          </form>
        )}

        {products.length === 0 ? (
          <p className="text-sm text-brand-grey text-center py-8">
            No products yet. Add your first one above.
          </p>
        ) : (
          <div className="space-y-2">
            {products.map((p) => {
              const band = stockBand(p.stock_quantity, p.low_stock_threshold, p.track_stock);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-brand-border"
                >
                  <div className="w-12 h-12 shrink-0 rounded-lg bg-brand-surface overflow-hidden flex items-center justify-center">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-brand-grey/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-black truncate">{p.name}</p>
                    <p className="text-xs text-brand-grey">
                      {[p.brand, p.unit].filter(Boolean).join(' · ') || 'No brand'}
                      {(p.product_variants || []).length > 0 &&
                        ` · ${p.product_variants.length} option${p.product_variants.length === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-brand-black">{fmtSAR(p.price)}</p>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[band.tone]}`}
                    >
                      {band.label}
                      {p.track_stock && ` · ${p.stock_quantity}`}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => startEdit(p)} className="p-2 text-brand-grey hover:text-brand-orange">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(p)} className="p-2 text-brand-grey hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// --- Categories -------------------------------------------------------
function CategoriesTab({ categories, onChanged }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.merchantShopAddCategory({ name: name.trim(), sort_order: categories.length });
      setName('');
      onChanged();
    } catch {
      /* surfaced */
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!(await confirmAction(`Delete "${c.name}"?`, 'Products in it become uncategorised.'))) return;
    try {
      await api.merchantShopDeleteCategory(c.id);
      onChanged();
    } catch {
      /* surfaced */
    }
  }

  async function toggle(c) {
    try {
      await api.merchantShopUpdateCategory(c.id, { is_active: !c.is_active });
      onChanged();
    } catch {
      /* surfaced */
    }
  }

  return (
    <Panel title="Categories" subtitle="Sections customers browse in your store.">
      <form onSubmit={add} className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          className={inputClass + ' flex-1'}
        />
        <button disabled={busy} className={btnPrimary}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>

      {categories.length === 0 ? (
        <p className="text-sm text-brand-grey text-center py-6">No categories yet.</p>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-brand-border">
              <span className="flex-1 font-bold text-brand-black">{c.name}</span>
              <button
                onClick={() => toggle(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  c.is_active ? TONE_CLASSES.green : TONE_CLASSES.grey
                }`}
              >
                {c.is_active ? 'Active' : 'Hidden'}
              </button>
              <button onClick={() => remove(c)} className="p-2 text-brand-grey hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// --- Inventory --------------------------------------------------------
function InventoryTab({ products, onChanged }) {
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);

  const tracked = useMemo(
    () =>
      products
        .filter((p) => p.track_stock)
        .sort((a, b) => a.stock_quantity - b.stock_quantity),
    [products]
  );

  async function save(p) {
    const next = Number(drafts[p.id]);
    if (!Number.isFinite(next) || next < 0) return;
    setBusyId(p.id);
    try {
      await api.merchantShopSetStock(p.id, { stock_quantity: next });
      setDrafts((d) => ({ ...d, [p.id]: undefined }));
      onChanged();
    } catch {
      /* surfaced */
    } finally {
      setBusyId(null);
    }
  }

  async function saveVariant(p, v) {
    const key = `${p.id}:${v.id}`;
    const next = Number(drafts[key]);
    if (!Number.isFinite(next) || next < 0) return;
    setBusyId(key);
    try {
      await api.merchantShopSetStock(p.id, { variant_id: v.id, stock_quantity: next });
      setDrafts((d) => ({ ...d, [key]: undefined }));
      onChanged();
    } catch {
      /* surfaced */
    } finally {
      setBusyId(null);
    }
  }

  const lowCount = tracked.filter((p) => p.stock_quantity <= p.low_stock_threshold).length;

  return (
    <Panel
      title="Inventory"
      subtitle={
        lowCount > 0
          ? `${lowCount} product${lowCount === 1 ? '' : 's'} at or below the low-stock line — worst first.`
          : 'Everything is above its low-stock line.'
      }
    >
      {tracked.length === 0 ? (
        <p className="text-sm text-brand-grey text-center py-8">
          No products are set to track stock.
        </p>
      ) : (
        <div className="space-y-2">
          {tracked.map((p) => {
            const band = stockBand(p.stock_quantity, p.low_stock_threshold, true);
            const variants = p.product_variants || [];
            return (
              <div key={p.id} className="p-3 rounded-xl border border-brand-border">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-black truncate">{p.name}</p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[band.tone]}`}
                    >
                      {band.label} · {p.stock_quantity} left
                    </span>
                  </div>
                  {variants.length === 0 && (
                    <div className="flex gap-2 shrink-0">
                      <input
                        type="number"
                        min="0"
                        value={drafts[p.id] ?? p.stock_quantity}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        className={inputClass + ' !w-24 !py-1.5'}
                      />
                      <button
                        onClick={() => save(p)}
                        disabled={busyId === p.id}
                        className={btnGhost + ' !py-1.5 !px-3'}
                      >
                        {busyId === p.id ? <Spinner className="!w-4 !h-4" /> : <Check className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                {variants.length > 0 && (
                  <div className="mt-3 pl-3 border-l-2 border-brand-border space-y-2">
                    {variants.map((v) => {
                      const key = `${p.id}:${v.id}`;
                      const vb = stockBand(v.stock_quantity, p.low_stock_threshold, true);
                      return (
                        <div key={v.id} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-brand-dark truncate">
                              {v.label}
                              {v.sku && <span className="text-xs font-mono text-brand-grey ml-2">{v.sku}</span>}
                            </p>
                            <span
                              className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${TONE_CLASSES[vb.tone]}`}
                            >
                              {v.stock_quantity} left
                            </span>
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={drafts[key] ?? v.stock_quantity}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            className={inputClass + ' !w-24 !py-1.5'}
                          />
                          <button
                            onClick={() => saveVariant(p, v)}
                            disabled={busyId === key}
                            className={btnGhost + ' !py-1.5 !px-3'}
                          >
                            {busyId === key ? <Spinner className="!w-4 !h-4" /> : <Check className="w-4 h-4" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// --- Business ---------------------------------------------------------
function BusinessTab({ store, onSaved }) {
  const [form, setForm] = useState({
    name: store.name || '',
    cuisine_type: store.category || '',
    description: store.description || '',
    logo_url: store.logoUrl || '',
    address: store.address || '',
    street: store.street || '',
    building_number: store.buildingNumber || '',
    lat: store.lat,
    lng: store.lng,
  });
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (form.lat == null || form.lng == null) {
      notifyError('Drop a pin on your store location so riders know where to collect.');
      return;
    }
    setBusy(true);
    try {
      // Blank optional text goes as null, never '' — every other write path
      // does the same, and mixing the two makes later filters/exports wrong.
      await api.merchantShopUpdateProfile({
        ...form,
        street: form.street.trim() || null,
        building_number: form.building_number.trim() || null,
      });
      notifySuccess('Store profile saved');
      onSaved();
    } catch {
      /* surfaced */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Business profile" subtitle="What customers see, and where riders collect.">
      <form onSubmit={save} className="space-y-3">
        <Field label="Store name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Category (e.g. Groceries, Household)">
          <input
            value={form.cuisine_type}
            onChange={(e) => setForm({ ...form, cuisine_type: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className={inputClass}
          />
        </Field>
        <Field label="Logo">
          <ImageUploadField
            kind="logo"
            value={form.logo_url}
            onChange={(url) => setForm({ ...form, logo_url: url || '' })}
            getSignedUrl={(body) => api.merchantShopImageSignedUrl(body)}
          />
        </Field>
        <LocationPicker
          label="Store location"
          placeholder="Search for your store address"
          address={form.address}
          coords={form.lat != null ? { lat: form.lat, lng: form.lng } : null}
          street={form.street}
          buildingNumber={form.building_number}
          onChange={({ address, coords, street, buildingNumber }) =>
            setForm((f) => ({
              ...f,
              address: address || '',
              street: street || '',
              building_number: buildingNumber || '',
              lat: coords ? coords.lat : null,
              lng: coords ? coords.lng : null,
            }))
          }
        />
        <button disabled={busy} className={btnPrimary + ' w-full'}>
          {busy ? <Spinner className="!border-white/40 !border-t-white" /> : 'Save profile'}
        </button>
      </form>
    </Panel>
  );
}

// --- Shell ------------------------------------------------------------
export default function ShopMerchantDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [store, setStore] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cat, an] = await Promise.all([
        api.merchantShopCatalogue(),
        api.merchantShopAnalytics(),
      ]);
      setStore(cat.store);
      setCategories(cat.categories || []);
      setProducts(cat.products || []);
      setAnalytics(an);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // Same per-merchant realtime topic the restaurant dashboard uses — the
  // backend publishes to merchant-<id> for both verticals.
  // The parent's load() refetches catalogue + analytics, NOT the order list —
  // so an open Orders tab used to hear the chime and still show nothing new
  // until a manual reload. orderPing is what refreshes the tab itself.
  const [orderPing, setOrderPing] = useState(0);
  const connected = useBroadcast(
    store ? `merchant-${store.id}` : null,
    {
      // Sound FIRST, then refresh — see MerchantDashboard for the reasoning.
      // Keeps ringing until somebody acknowledges it.
      new_order: (payload) => {
        startUrgentAlert(payload?.orderCode);
        setOrderPing((n) => n + 1);
        load();
      },
      // Acknowledge HERE, not only in the orders tab. The tab is mounted just
      // when it is open and the dashboard opens on Overview, so an admin
      // accepting on the merchant's behalf left the chime repeating for two
      // minutes over work already done. Every order_update emit carries
      // orderCode, and any order_update means it is no longer waiting on us.
      order_update: (payload) => {
        acknowledgeUrgentAlert(payload?.orderCode);
        setOrderPing((n) => n + 1);
        load();
      },
      payment_update: () => { setOrderPing((n) => n + 1); load(); },
    },
    !!store
  );

  // Realtime is an ACCELERATOR here, not the transport. useBroadcast returns
  // `connected` precisely so callers can fall back, and the customer tracking
  // pages already do -- but these dashboards discarded it, so a merchant whose
  // socket dropped (tablet asleep, Wi-Fi roam, captive portal, Realtime
  // degraded) stopped receiving orders with a screen that still looked
  // perfectly healthy. Silence is indistinguishable from "no orders", and the
  // alarm only rings on events that arrive.
  useEffect(() => {
    if (connected) return undefined;
    const t = setInterval(() => setOrderPing((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, [connected]);


  if (loading) {
    return (
      <MerchantLayout activeTab={activeTab} onTabChange={setActiveTab} vertical="shop">
        <div className="flex justify-center py-20">
          <Spinner className="!w-8 !h-8" />
        </div>
      </MerchantLayout>
    );
  }

  // Only a MISSING STORE is fatal. Every broadcast calls load(), so making
  // `error` fatal too meant one flaky catalogue or analytics fetch during a
  // new order tore down the order list AND the alert bar -- leaving the
  // chime repeating every six seconds with no Silence button and no order
  // code on screen. A refetch hiccup is a banner, not a dead end.
  if (!store) {
    return (
      <MerchantLayout activeTab={activeTab} onTabChange={setActiveTab} vertical="shop">
        <Card className="p-8 text-center">
          <p className="font-bold text-brand-black">{error || 'No store is linked to this account'}</p>
          <button onClick={load} className={btnPrimary + ' mt-4 inline-flex'}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </Card>
      </MerchantLayout>
    );
  }

  return (
    <MerchantLayout activeTab={activeTab} onTabChange={setActiveTab} vertical="shop">
      <NewOrderAlertBar onOpenOrders={() => setActiveTab('orders')} />
      {!connected && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold"
        >
          Live updates are offline. Checking for new orders every 15 seconds.
        </div>
      )}
      {error && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold">
          Could not refresh: {error}
          <button onClick={load} className="ml-auto px-3 py-1.5 rounded-lg bg-amber-900 text-white text-xs font-bold cursor-pointer hover:bg-amber-800 transition-colors">
            Retry
          </button>
        </div>
      )}
      {activeTab === 'overview' && <OverviewTab store={store} analytics={analytics} />}
      {activeTab === 'orders' && <ShopMerchantOrders store={store} onChanged={load} ping={orderPing} />}
      {activeTab === 'products' && (
        <ProductsTab products={products} categories={categories} onSaved={load} onDeleted={load} />
      )}
      {activeTab === 'categories' && <CategoriesTab categories={categories} onChanged={load} />}
      {activeTab === 'inventory' && <InventoryTab products={products} onChanged={load} />}
      {activeTab === 'business' && (
        <div className="space-y-4">
          <BusinessTab store={store} onSaved={load} />
          {/* Separate from the profile form on purpose: these write through
              their own endpoints, not the profile PATCH whose whitelist stops
              a store listing itself or clearing its own credit. */}
          <StoreHoursEditor
            load={() => api.merchantShopHours()}
            save={(hours) => api.merchantShopSetHours(hours)}
            setAccepting={(accepting) => api.merchantShopSetAccepting(accepting)}
          />
        </div>
      )}
    </MerchantLayout>
  );
}
