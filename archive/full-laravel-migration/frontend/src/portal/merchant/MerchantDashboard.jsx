import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Edit3,
  Plus,
  Store,
  Trash2,
  ShoppingBag,
  UtensilsCrossed,
  LayoutList,
  TrendingUp,
  Clock,
  CheckCircle2,
  Wallet,
  MapPin,
  ImageIcon,
  BarChart3,
  X,
  UploadCloud,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBroadcast } from '../lib/useBroadcast';
import { realtimeEnabled } from '../lib/gatewayClient';
import { startUrgentAlert, acknowledgeUrgentAlert, playAlert } from '../lib/alertSound';
import { foodStatusMeta, fmtSAR } from '../lib/constants';
import { confirmAction, notifySuccess } from '../lib/notify';
import { uploadProofFile } from '../lib/gatewayClient';
import {
  LOGO_ACCEPT,
  LOGO_FORMATS_HINT,
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_FORMATS_HINT,
  validateLogoFile,
  validateMenuImageFile,
} from '../lib/uploadFiles';
import { Badge, Field, Spinner, btnGhost, btnPrimary, inputClass } from '../components/ui';
import StoreHoursEditor from '../components/StoreHoursEditor';
import LocationPicker from '../components/LocationPicker';
import MerchantLayout from './MerchantLayout';
import NewOrderAlertBar from '../components/NewOrderAlertBar';
import MerchantOrders from './MerchantOrders';

const FOOD_MARGIN_MEAL = 5;
const FOOD_MARGIN_DRINK = 3;

const emptyBusiness = {
  name: '',
  cuisine_type: '',
  description: '',
  logo_url: '',
  address: '',
  street: '',
  building_number: '',
  lat: '',
  lng: '',
};

const emptyCategory = { name: '', sort_order: 0, is_active: true };
const emptyItem = {
  category_id: '',
  name: '',
  description: '',
  price: '',
  item_type: 'meal_package',
  image_url: '',
  is_available: true,
};

function Panel({ className = '', children }) {
  return (
    <div
      className={`bg-white rounded-[1.25rem] border border-black/[0.04] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_40px_-20px_rgba(15,23,42,0.12)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div>
        <h2 className="text-lg font-black text-brand-black">{title}</h2>
        {subtitle && <p className="text-sm text-brand-grey mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 min-h-[220px]">
      <div className="w-14 h-14 rounded-2xl bg-brand-surface text-brand-grey flex items-center justify-center mb-4">
        <Icon className="w-7 h-7" />
      </div>
      <p className="font-bold text-brand-dark">{title}</p>
      <p className="text-sm text-brand-grey mt-1 max-w-sm">{message}</p>
    </div>
  );
}

function IconAction({ label, onClick, danger = false, children }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border transition-colors cursor-pointer ${
        danger
          ? 'border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200'
          : 'border-brand-border text-brand-grey hover:text-brand-orange hover:border-brand-orange/30 hover:bg-brand-orange/5'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone = 'orange' }) {
  const tones = {
    orange: 'from-brand-orange/15 to-brand-orange/5 text-brand-orange',
    blue: 'from-blue-500/15 to-blue-500/5 text-blue-600',
    green: 'from-emerald-500/15 to-emerald-500/5 text-emerald-600',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-600',
  };
  return (
    <Panel className="p-5 h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-black text-brand-black tracking-tight">{value}</div>
          <div className="text-sm font-bold text-brand-dark mt-1">{label}</div>
          {hint && <div className="text-xs text-brand-grey mt-1">{hint}</div>}
        </div>
        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Panel>
  );
}

function toBusinessForm(merchant) {
  return {
    name: merchant?.name || '',
    cuisine_type: merchant?.cuisineType || '',
    description: merchant?.description || '',
    logo_url: merchant?.logoUrl || '',
    address: merchant?.address || '',
    street: merchant?.street || '',
    building_number: merchant?.buildingNumber || '',
    lat: merchant?.lat ?? '',
    lng: merchant?.lng ?? '',
  };
}

function businessPayload(form) {
  return {
    name: form.name.trim(),
    cuisine_type: form.cuisine_type.trim() || null,
    description: form.description.trim() || null,
    logo_url: form.logo_url.trim() || null,
    address: form.address.trim() || null,
    street: form.street.trim() || null,
    building_number: form.building_number.trim() || null,
    lat: form.lat === '' ? null : Number(form.lat),
    lng: form.lng === '' ? null : Number(form.lng),
  };
}

function itemPayload(form) {
  return {
    category_id: form.category_id || null,
    name: form.name.trim(),
    description: form.description.trim() || null,
    price: Number(form.price),
    item_type: form.item_type,
    image_url: form.image_url.trim() || null,
    is_available: !!form.is_available,
  };
}

function OverviewTab({ merchant, analytics, categories, items }) {
  const summary = analytics?.summary;
  const breakdown = analytics?.statusBreakdown || [];
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));
  const creditUsed = summary?.creditUsed ?? merchant?.creditUsed ?? 0;
  const creditLimit = summary?.creditLimit ?? merchant?.creditLimit ?? 300;
  const creditPct = Math.min(100, (creditUsed / creditLimit) * 100);

  return (
    <div className="space-y-6">
      {merchant && (
        <Panel className="p-5 md:p-6 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-brand-orange/[0.04] via-transparent to-transparent pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-brand-orange/10 text-brand-orange flex items-center justify-center shrink-0 overflow-hidden">
                {merchant.logoUrl ? (
                  <img src={merchant.logoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Store className="w-8 h-8" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-brand-black truncate">{merchant.name}</h2>
                <p className="text-sm text-brand-grey">{merchant.cuisineType || 'Cuisine not set'}</p>
                {merchant.address && (
                  <p className="text-xs text-brand-grey mt-1 flex items-center gap-1 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {merchant.address}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Badge tone={merchant.isActive ? 'green' : 'amber'}>
                {merchant.isActive ? 'Listed' : 'Pending admin listing'}
              </Badge>
              <Badge tone={merchant.status === 'active' ? 'green' : 'red'}>{merchant.status}</Badge>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={ShoppingBag} label="Total orders" value={summary?.totalOrders ?? 0} hint="All time" tone="blue" />
        <StatCard icon={Clock} label="Active orders" value={summary?.activeOrders ?? 0} hint="In progress now" tone="amber" />
        <StatCard icon={CheckCircle2} label="Delivered" value={summary?.deliveredOrders ?? 0} hint={`${summary?.todayOrders ?? 0} today`} tone="green" />
        <StatCard icon={TrendingUp} label="Delivered volume" value={fmtSAR(summary?.orderVolume ?? 0)} hint="Completed order total" tone="orange" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel className="p-5 md:p-6 min-h-[320px] flex flex-col">
          <SectionHeader
            title="Order status breakdown"
            subtitle="How your orders are distributed across stages"
          />
          {breakdown.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No orders yet"
              message="Once customers start ordering, you will see live status counts here."
            />
          ) : (
            <div className="space-y-4 flex-1">
              {breakdown.map(({ status, count }) => {
                const meta = foodStatusMeta(status);
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-bold text-brand-dark">{meta.label}</span>
                      <span className="text-brand-grey font-semibold tabular-nums">{count}</span>
                    </div>
                    <div className="h-3 rounded-full bg-brand-surface overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-red transition-all"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel className="p-5 md:p-6 min-h-[320px]">
          <SectionHeader title="Restaurant snapshot" subtitle="Menu inventory and platform credit" />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-4 rounded-2xl bg-brand-surface border border-black/[0.03]">
              <div className="flex items-center gap-2 text-brand-orange mb-2">
                <UtensilsCrossed className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Items</span>
              </div>
              <div className="text-2xl font-black text-brand-black tabular-nums">{items.length}</div>
            </div>
            <div className="p-4 rounded-2xl bg-brand-surface border border-black/[0.03]">
              <div className="flex items-center gap-2 text-brand-orange mb-2">
                <LayoutList className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Categories</span>
              </div>
              <div className="text-2xl font-black text-brand-black tabular-nums">{categories.length}</div>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-brand-surface border border-black/[0.03]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 text-brand-orange">
                <Wallet className="w-4 h-4" />
                <span className="text-sm font-bold text-brand-dark">Platform credit</span>
              </div>
              <span className="text-sm font-black text-brand-black tabular-nums">
                {fmtSAR(creditUsed)} / {fmtSAR(creditLimit)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-white overflow-hidden border border-black/[0.04]">
              <div className="h-full rounded-full bg-brand-orange transition-all" style={{ width: `${creditPct}%` }} />
            </div>
            <p className="text-xs text-brand-grey mt-2">
              {fmtSAR(summary?.creditRemaining ?? Math.max(0, creditLimit - creditUsed))} remaining before limit
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MenuTab({
  items,
  categories,
  activeCategories,
  itemForm,
  setItemForm,
  editingItemId,
  setEditingItemId,
  showForm,
  setShowForm,
  saving,
  saveItem,
  editItem,
  removeItem,
}) {
  const itemImageInputRef = useRef(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(null);

  function openNew() {
    setEditingItemId(null);
    setItemForm(emptyItem);
    setImageError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setEditingItemId(null);
    setItemForm(emptyItem);
    setImageError(null);
    setShowForm(false);
  }

  async function handleItemImageFile(file) {
    if (!file) return;
    setImageError(null);

    const check = validateMenuImageFile(file);
    if (!check.ok) {
      setImageError(check.error);
      return;
    }

    setUploadingImage(true);
    try {
      const signed = await api.merchantMenuItemImageSignedUrl({
        file_name: file.name,
        mime_type: check.mimeType,
      });
      if (file.size > signed.maxBytes) {
        throw new Error('Image must be 2 MB or smaller.');
      }
      await uploadProofFile(signed.bucket, signed.path, signed.token, file);
      const data = await api.merchantMenuItemImageConfirm({
        path: signed.path,
        size_bytes: file.size,
      });
      setItemForm((f) => ({ ...f, image_url: data.imageUrl }));
    } catch (err) {
      setImageError(err.message);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleRemoveItemImage() {
    setImageError(null);
    setItemForm((f) => ({ ...f, image_url: '' }));
  }

  return (
    <div className="space-y-5">
      <Panel className="p-5 md:p-6">
        <SectionHeader
          title={`Menu items (${items.length})`}
          subtitle="Manage what customers can order from your restaurant"
          action={
            !showForm && (
              <button type="button" onClick={openNew} className={btnPrimary + ' !py-2.5 !px-4'}>
                <Plus className="w-4 h-4" /> Add item
              </button>
            )
          }
        />

        {showForm && (
          <div className="mb-6 p-4 md:p-5 rounded-2xl bg-brand-surface border border-brand-border/80">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-black text-brand-black">{editingItemId ? 'Edit menu item' : 'New menu item'}</h3>
              <button type="button" onClick={cancelForm} className={btnGhost + ' !py-2 !px-3'} aria-label="Close form">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                const ok = await saveItem(e);
                if (ok) setShowForm(false);
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <Field label="Item name *">
                <input className={inputClass} value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} required />
              </Field>
              <Field label="Category">
                <select className={inputClass} value={itemForm.category_id} onChange={(e) => setItemForm((f) => ({ ...f, category_id: e.target.value }))}>
                  <option value="">No category</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Price (SAR) *">
                <input type="number" step="0.01" min="0.01" className={inputClass} value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} required />
              </Field>
              <Field label="Item type *">
                <select className={inputClass} value={itemForm.item_type} onChange={(e) => setItemForm((f) => ({ ...f, item_type: e.target.value }))}>
                  <option value="meal_package">Meal / package (+SAR {FOOD_MARGIN_MEAL} margin)</option>
                  <option value="drink_dessert_addon">Drink / add-on (+SAR {FOOD_MARGIN_DRINK} margin)</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Item image">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl border border-brand-border bg-brand-surface flex items-center justify-center overflow-hidden shrink-0">
                      {itemForm.image_url ? (
                        <img src={itemForm.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-brand-orange/50" />
                      )}
                    </div>
                    <div className="space-y-2 min-w-0">
                      <input
                        ref={itemImageInputRef}
                        type="file"
                        accept={MENU_IMAGE_ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleItemImageFile(file);
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => itemImageInputRef.current?.click()}
                          disabled={uploadingImage || saving}
                          className={`${btnPrimary} !py-2 !px-4 text-sm inline-flex items-center gap-2`}
                        >
                          {uploadingImage ? (
                            <Spinner className="!border-white/40 !border-t-white" />
                          ) : (
                            <>
                              <UploadCloud className="w-4 h-4" />
                              {itemForm.image_url ? 'Replace image' : 'Upload image'}
                            </>
                          )}
                        </button>
                        {itemForm.image_url && (
                          <button
                            type="button"
                            onClick={handleRemoveItemImage}
                            disabled={uploadingImage || saving}
                            className={btnGhost}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-brand-grey">{MENU_IMAGE_FORMATS_HINT}</p>
                      {imageError && <p className="text-xs font-bold text-red-600">{imageError}</p>}
                    </div>
                  </div>
                </Field>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm font-bold text-brand-dark pb-3">
                  <input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm((f) => ({ ...f, is_available: e.target.checked }))} />
                  Available to customers
                </label>
              </div>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea className={`${inputClass} min-h-20 resize-y`} value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} />
                </Field>
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button type="submit" disabled={saving || !itemForm.name.trim() || !itemForm.price} className={btnPrimary}>
                  {editingItemId ? 'Save changes' : 'Add item'}
                </button>
                <button type="button" className={btnGhost} onClick={cancelForm}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="No menu items yet" message="Add your first dish so customers can start ordering." />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-brand-border text-[11px] font-bold uppercase tracking-wider text-brand-grey">
                  <th className="py-3 pr-4">Item</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Price</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const category = categories.find((c) => c.id === item.category_id);
                  return (
                    <tr key={item.id} className="border-b border-brand-border/70 last:border-0 hover:bg-brand-surface/60">
                      <td className="py-4 pr-4">
                        <div className="font-bold text-brand-black">{item.name}</div>
                        {item.description && <div className="text-xs text-brand-grey mt-0.5 line-clamp-1">{item.description}</div>}
                      </td>
                      <td className="py-4 pr-4 text-sm text-brand-grey">{category?.name || '—'}</td>
                      <td className="py-4 pr-4 text-sm font-bold text-brand-dark tabular-nums">{fmtSAR(item.price)}</td>
                      <td className="py-4 pr-4">
                        <Badge tone={item.is_available ? 'green' : 'grey'}>{item.is_available ? 'Available' : 'Hidden'}</Badge>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          <IconAction label="Edit" onClick={() => { setImageError(null); editItem(item); setShowForm(true); }}>
                            <Edit3 className="w-4 h-4" />
                          </IconAction>
                          <IconAction label="Delete" danger onClick={() => removeItem(item.id)}>
                            <Trash2 className="w-4 h-4" />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CategoriesTab({
  categories,
  categoryForm,
  setCategoryForm,
  editingCategoryId,
  setEditingCategoryId,
  saving,
  saveCategory,
  editCategory,
  removeCategory,
}) {
  return (
    <div className="space-y-5">
      <Panel className="p-5 md:p-6">
        <SectionHeader
          title={editingCategoryId ? 'Edit category' : 'Add category'}
          subtitle="Group menu items into sections like Meals, Drinks, or Combos"
        />
        <form onSubmit={saveCategory} className="grid grid-cols-1 md:grid-cols-[1.4fr_0.6fr_auto_auto] gap-3 items-end">
          <Field label="Category name *">
            <input className={inputClass} value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Meals" />
          </Field>
          <Field label="Sort order">
            <input type="number" className={inputClass} value={categoryForm.sort_order} onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-bold text-brand-dark h-[46px] px-1">
            <input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !categoryForm.name.trim()} className={btnPrimary + ' !whitespace-nowrap'}>
              {editingCategoryId ? 'Save' : 'Add'}
            </button>
            {editingCategoryId && (
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setEditingCategoryId(null);
                  setCategoryForm(emptyCategory);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </Panel>

      <Panel className="p-5 md:p-6">
        <SectionHeader title={`All categories (${categories.length})`} subtitle="Drag order is controlled by sort order" />
        {categories.length === 0 ? (
          <EmptyState icon={LayoutList} title="No categories yet" message="Create your first category to organize the menu." />
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[520px] text-left">
              <thead>
                <tr className="border-b border-brand-border text-[11px] font-bold uppercase tracking-wider text-brand-grey">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Sort</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-brand-border/70 last:border-0 hover:bg-brand-surface/60">
                    <td className="py-4 pr-4 font-bold text-brand-black">{category.name}</td>
                    <td className="py-4 pr-4 text-sm text-brand-grey tabular-nums">{category.sort_order}</td>
                    <td className="py-4 pr-4">
                      <Badge tone={category.is_active ? 'green' : 'grey'}>{category.is_active ? 'Active' : 'Hidden'}</Badge>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center justify-end gap-2">
                        <IconAction label="Edit" onClick={() => editCategory(category)}>
                          <Edit3 className="w-4 h-4" />
                        </IconAction>
                        <IconAction label="Delete" danger onClick={() => removeCategory(category.id)}>
                          <Trash2 className="w-4 h-4" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function BusinessTab({ merchant, businessForm, setBusinessForm, setMerchant, saving, saveBusiness }) {
  const logoInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState(null);

  async function handleLogoFile(file) {
    if (!file) return;
    setLogoError(null);

    const check = validateLogoFile(file);
    if (!check.ok) {
      setLogoError(check.error);
      return;
    }

    setUploadingLogo(true);
    try {
      const signed = await api.merchantLogoSignedUrl({
        file_name: file.name,
        mime_type: check.mimeType,
      });
      if (file.size > signed.maxBytes) {
        throw new Error('Logo must be 2 MB or smaller.');
      }
      await uploadProofFile(signed.bucket, signed.path, signed.token, file);
      const data = await api.merchantLogoConfirm({
        path: signed.path,
        size_bytes: file.size,
      });
      setMerchant(data.merchant);
      setBusinessForm(toBusinessForm(data.merchant));
      notifySuccess('Logo updated');
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    const confirmed = await confirmAction({
      title: 'Remove logo?',
      text: 'Your business will show a placeholder until you upload a new logo.',
      confirmText: 'Remove logo',
      danger: true,
    });
    if (!confirmed) return;

    setUploadingLogo(true);
    setLogoError(null);
    try {
      const data = await api.merchantUpdateProfile(
        businessPayload({ ...businessForm, logo_url: '' })
      );
      setMerchant(data.merchant);
      setBusinessForm(toBusinessForm(data.merchant));
      notifySuccess('Logo removed');
    } catch (err) {
      setLogoError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-5 items-start">
      <Panel className="p-5 md:p-6">
        <SectionHeader title="Business information" subtitle="Details shown to customers and used for delivery" />
        <form onSubmit={saveBusiness} className="space-y-6">
          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-grey">Basics</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="Business name *">
                  <input className={inputClass} value={businessForm.name} onChange={(e) => setBusinessForm((f) => ({ ...f, name: e.target.value }))} required />
                </Field>
              </div>
              <Field label="Cuisine type">
                <input className={inputClass} value={businessForm.cuisine_type} onChange={(e) => setBusinessForm((f) => ({ ...f, cuisine_type: e.target.value }))} placeholder="Filipino BBQ" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Business logo">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl border border-brand-border bg-brand-surface flex items-center justify-center overflow-hidden shrink-0">
                      {businessForm.logo_url ? (
                        <img src={businessForm.logo_url} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <Store className="w-8 h-8 text-brand-orange/50" />
                      )}
                    </div>
                    <div className="space-y-2 min-w-0">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept={LOGO_ACCEPT}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          handleLogoFile(file);
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={uploadingLogo || saving}
                          className={`${btnPrimary} !py-2 !px-4 text-sm inline-flex items-center gap-2`}
                        >
                          {uploadingLogo ? (
                            <Spinner className="!border-white/40 !border-t-white" />
                          ) : (
                            <>
                              <UploadCloud className="w-4 h-4" />
                              {businessForm.logo_url ? 'Replace logo' : 'Upload logo'}
                            </>
                          )}
                        </button>
                        {businessForm.logo_url && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={uploadingLogo || saving}
                            className={btnGhost}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-brand-grey">{LOGO_FORMATS_HINT}</p>
                      {logoError && <p className="text-xs font-bold text-red-600">{logoError}</p>}
                    </div>
                  </div>
                </Field>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-grey">Location</p>
            <LocationPicker
              label="Restaurant location (pickup point for drivers)"
              placeholder="Search your street, district, or business name"
              address={businessForm.address}
              coords={
                businessForm.lat !== '' && businessForm.lat != null &&
                businessForm.lng !== '' && businessForm.lng != null
                  ? { lat: Number(businessForm.lat), lng: Number(businessForm.lng) }
                  : null
              }
              street={businessForm.street}
              buildingNumber={businessForm.building_number}
              onChange={({ address: nextAddress, coords: nextCoords, street: nextStreet, buildingNumber: nextBuilding }) =>
                setBusinessForm((f) => ({
                  ...f,
                  address: nextAddress,
                  street: nextStreet || '',
                  building_number: nextBuilding || '',
                  lat: nextCoords?.lat ?? '',
                  lng: nextCoords?.lng ?? '',
                }))
              }
            />
            <p className="text-xs text-brand-grey">
              The pin sets your 15 km delivery radius and where drivers go to pick up. Required to stay listed.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-grey">About</p>
            <Field label="Description">
              <textarea className={`${inputClass} min-h-28 resize-y`} value={businessForm.description} onChange={(e) => setBusinessForm((f) => ({ ...f, description: e.target.value }))} />
            </Field>
          </div>

          <button type="submit" disabled={saving || !businessForm.name.trim()} className={btnPrimary}>
            Save business info
          </button>
        </form>
      </Panel>

      <Panel className="p-5 md:p-6 xl:sticky xl:top-[96px]">
        <SectionHeader title="Live preview" subtitle="How your listing appears internally" />
        <div className="rounded-2xl border border-brand-border overflow-hidden">
          <div className="h-28 bg-gradient-to-br from-brand-orange/20 via-brand-orange/5 to-brand-surface flex items-center justify-center">
            {businessForm.logo_url ? (
              <img src={businessForm.logo_url} alt="" className="w-16 h-16 object-contain" />
            ) : (
              <ImageIcon className="w-10 h-10 text-brand-orange/60" />
            )}
          </div>
          <div className="p-4 space-y-3">
            <div>
              <div className="font-black text-brand-black text-lg">{businessForm.name || 'Business name'}</div>
              <div className="text-sm text-brand-grey">{businessForm.cuisine_type || 'Cuisine type'}</div>
            </div>
            {businessForm.address && (
              <p className="text-xs text-brand-grey flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {businessForm.address}
              </p>
            )}
            {businessForm.description && (
              <p className="text-sm text-brand-dark leading-relaxed line-clamp-4">{businessForm.description}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone={merchant?.isActive ? 'green' : 'amber'}>
                {merchant?.isActive ? 'Listed' : 'Pending listing'}
              </Badge>
              <Badge tone={merchant?.status === 'active' ? 'green' : 'red'}>{merchant?.status || 'active'}</Badge>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default function MerchantDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merchant, setMerchant] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [businessForm, setBusinessForm] = useState(emptyBusiness);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [error, setError] = useState(null);
  // Bumped on every order event so the Orders tab refetches. The SUBSCRIPTION
  // has to live here rather than in MerchantOrders: that component is mounted
  // only while the Orders tab is open, and this dashboard opens on Overview,
  // so a restaurant sitting on the default screen heard nothing at all.
  const [orderPing, setOrderPing] = useState(0);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

  // `silent` skips the full-page spinner. Callers that pass an event object
  // (onSaved={load} and friends) destructure to the default, which is the
  // loud behaviour they already had.
  async function load({ silent = false } = {}) {
    setError(null);
    if (!silent) setLoading(true);
    try {
      const [menuData, analyticsData] = await Promise.all([api.merchantMenu(), api.merchantAnalytics()]);
      setMerchant(menuData.merchant);
      setCategories(menuData.categories || []);
      setItems(menuData.items || []);
      setBusinessForm(toBusinessForm(menuData.merchant));
      setAnalytics(analyticsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(id);
  }, []);

  const connected = useBroadcast(
    `merchant-${merchant?.id}`,
    {
      // Sound FIRST, then refresh: the alert is the point of this handler on a
      // busy counter and must not wait on a network round trip. This one keeps
      // ringing until somebody acknowledges it — a single burst was missable
      // and the server-side chase is ten minutes behind.
      new_order: (payload) => {
        startUrgentAlert(payload?.orderCode);
        setOrderPing((n) => n + 1);
      },
      // The "you still have not started this" chase. One burst is right here:
      // the order is already accepted, so nobody is waiting on a first tap.
      preparing_overdue: () => {
        playAlert('order');
        setOrderPing((n) => n + 1);
      },
      // Acknowledge HERE, not only in the orders tab. The tab is mounted just
      // when it is open and the dashboard opens on Overview, so an admin
      // accepting on the merchant's behalf left the chime repeating for two
      // minutes over work already done. Every order_update emit carries
      // orderCode, and any order_update means it is no longer waiting on us.
      order_update: (payload) => {
        acknowledgeUrgentAlert(payload?.orderCode);
        setOrderPing((n) => n + 1);
      },
      payment_update: () => setOrderPing((n) => n + 1),
      // Admin suspended/reactivated the restaurant, or moved its credit limit
      // (adminFoodController emits this on all three). Nothing listened for it
      // before and useBroadcast silently drops events with no handler, so a
      // suspended merchant kept taking orders they could no longer fulfil
      // until someone happened to reload. Refetch the merchant record itself,
      // not just the order list.
      // Silent: the loud path swaps the whole page for a spinner, which
      // unmounts NewOrderAlertBar mid-alarm -- the Silence and View orders
      // buttons vanish while the chime keeps going.
      merchant_update: () => load({ silent: true }),
    },
    realtimeEnabled && !!merchant?.id
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


  async function saveBusiness(e) {
    e.preventDefault();
    if (
      businessForm.lat === '' || businessForm.lat == null ||
      businessForm.lng === '' || businessForm.lng == null
    ) {
      setError('Pin your restaurant location on the map (search or use current location) so drivers know where to pick up.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await api.merchantUpdateProfile(businessPayload(businessForm));
      setMerchant(data.merchant);
      setBusinessForm(toBusinessForm(data.merchant));
      setAnalytics(await api.merchantAnalytics());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        sort_order: Number(categoryForm.sort_order || 0),
        is_active: !!categoryForm.is_active,
      };
      if (editingCategoryId) await api.merchantUpdateCategory(editingCategoryId, payload);
      else await api.merchantAddCategory(payload);
      setCategoryForm(emptyCategory);
      setEditingCategoryId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingItemId) await api.merchantUpdateItem(editingItemId, itemPayload(itemForm));
      else await api.merchantAddItem(itemPayload(itemForm));
      setItemForm(emptyItem);
      setEditingItemId(null);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id) {
    const confirmed = await confirmAction({
      title: 'Delete category?',
      text: 'Items in it will stay on the menu without a category.',
      confirmText: 'Delete category',
      danger: true,
    });
    if (!confirmed) return;
    await api.merchantDeleteCategory(id);
    await load();
    notifySuccess('Category deleted');
  }

  async function removeItem(id) {
    const confirmed = await confirmAction({
      title: 'Delete menu item?',
      text: 'This item will be removed from your menu permanently.',
      confirmText: 'Delete item',
      danger: true,
    });
    if (!confirmed) return;
    await api.merchantDeleteItem(id);
    await load();
    notifySuccess('Menu item deleted');
  }

  function editCategory(category) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name || '',
      sort_order: category.sort_order ?? 0,
      is_active: category.is_active !== false,
    });
  }

  function editItem(item) {
    setEditingItemId(item.id);
    setItemForm({
      category_id: item.category_id || '',
      name: item.name || '',
      description: item.description || '',
      price: item.price ?? '',
      item_type: item.item_type || 'meal_package',
      image_url: item.image_url || '',
      is_available: item.is_available !== false,
    });
  }

  return (
    <MerchantLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="!w-8 !h-8" />
        </div>
      ) : (
        <div className="space-y-5 w-full">
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
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
              {error}
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewTab merchant={merchant} analytics={analytics} categories={categories} items={items} />
          )}

          {activeTab === 'orders' && <MerchantOrders merchant={merchant} ping={orderPing} />}

          {activeTab === 'business' && (
            <div className="space-y-4">
              <BusinessTab
                merchant={merchant}
                businessForm={businessForm}
                setBusinessForm={setBusinessForm}
                setMerchant={setMerchant}
                saving={saving}
                saveBusiness={saveBusiness}
              />
              {/* Separate from the profile form on purpose: these write
                  through their own endpoints, not the profile PATCH whose
                  whitelist stops a merchant listing itself. */}
              <StoreHoursEditor
                load={() => api.merchantHours()}
                save={(hours) => api.merchantSetHours(hours)}
                setAccepting={(accepting) => api.merchantSetAccepting(accepting)}
              />
            </div>
          )}

          {activeTab === 'categories' && (
            <CategoriesTab
              categories={categories}
              categoryForm={categoryForm}
              setCategoryForm={setCategoryForm}
              editingCategoryId={editingCategoryId}
              setEditingCategoryId={setEditingCategoryId}
              saving={saving}
              saveCategory={saveCategory}
              editCategory={editCategory}
              removeCategory={removeCategory}
            />
          )}

          {activeTab === 'menu' && (
            <MenuTab
              items={items}
              categories={categories}
              activeCategories={activeCategories}
              itemForm={itemForm}
              setItemForm={setItemForm}
              editingItemId={editingItemId}
              setEditingItemId={setEditingItemId}
              showForm={showItemForm}
              setShowForm={setShowItemForm}
              saving={saving}
              saveItem={saveItem}
              editItem={editItem}
              removeItem={removeItem}
            />
          )}
        </div>
      )}
    </MerchantLayout>
  );
}
