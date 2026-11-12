// ---------------------------------------------------------------------
// The admin create/edit form for a merchant, shared by both verticals.
//
// It lived only in FoodAdmin. ShopAdmin had its own five-field version with
// a plain text address box: no street, no building number, and no map pin at
// all — which is why every store carried a red "No map pin" badge and why the
// rider's pickup navigation and the customer's tracking map had nothing to
// draw for the shop vertical. The store owner's own portal has always had the
// picker (ShopMerchantDashboard); only the admin path was missing it.
//
// One component rather than a copy, because the missing fields were not a
// decision anyone made — they are what a second hand-written form drifts into.
//
// The LOGO is a render prop: food, shop-admin and the owner portal each have
// their own signed-URL endpoint behind an identical upload flow, so the field
// is injected rather than branched on here.
// ---------------------------------------------------------------------
import { useState } from 'react';
import LocationPicker from '../components/LocationPicker';
import { BADGE_LABELS } from '../lib/constants';
import { Field, Spinner, inputClass, btnPrimary, btnGhost } from '../components/ui';

// Not exported: a second export from a component file breaks fast refresh,
// and callers do not need it — pass no `initial` at all for a new merchant.
const EMPTY_MERCHANT = {
  name: '',
  cuisine_type: '',
  description: '',
  address: '',
  street: '',
  building_number: '',
  logo_url: '',
  lat: '',
  lng: '',
  is_active: false,
  is_featured: false,
  badge: '',
};

// Keyed off the shared label map so the dropdown cannot drift from the DB
// CHECK (merchants_badge_chk, 0015) or the route whitelist.
const BADGE_OPTIONS = [
  { value: '', label: 'No badge' },
  ...Object.entries(BADGE_LABELS).map(([value, label]) => ({ value, label })),
];

export default function MerchantForm({
  initial,
  onSave,
  onCancel,
  busy,
  // 'Restaurant' | 'Store' — only wording differs, never behaviour.
  noun = 'Restaurant',
  categoryLabel = 'Cuisine type',
  categoryPlaceholder = 'e.g. Lebanese',
  // (value, onChange) => node
  renderLogo,
}) {
  const [form, setForm] = useState({ ...EMPTY_MERCHANT, ...initial });
  const [locErr, setLocErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const lower = noun.toLowerCase();
  const hasPin = form.lat !== '' && form.lat != null && form.lng !== '' && form.lng != null;

  function submit(e) {
    e.preventDefault();
    if (!hasPin) {
      setLocErr(
        `Pin the ${lower} location on the map (search or use current location) so riders know where to collect.`
      );
      return;
    }
    setLocErr(null);
    onSave({
      name: form.name.trim(),
      cuisine_type: (form.cuisine_type || '').trim() || null,
      description: (form.description || '').trim() || null,
      address: (form.address || '').trim() || null,
      street: (form.street || '').trim() || null,
      building_number: (form.building_number || '').trim() || null,
      logo_url: (form.logo_url || '').trim() || null,
      lat: Number(form.lat),
      lng: Number(form.lng),
      is_active: !!form.is_active,
      is_featured: !!form.is_featured,
      badge: form.badge || null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={`${noun} name`}>
        <input
          value={form.name}
          onChange={set('name')}
          className={inputClass}
          required
          placeholder={noun === 'Store' ? 'e.g. Uncle John’s' : 'e.g. Shawarma House'}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={categoryLabel}>
          <input
            value={form.cuisine_type || ''}
            onChange={set('cuisine_type')}
            className={inputClass}
            placeholder={categoryPlaceholder}
          />
        </Field>
        <Field label="Logo / photo">
          {renderLogo
            ? renderLogo(form.logo_url || '', (url) =>
                setForm((f) => ({ ...f, logo_url: url || '' }))
              )
            : null}
        </Field>
      </div>

      <div>
        <LocationPicker
          label={`${noun} location (pickup point for riders)`}
          placeholder={`Search the ${lower}'s street, district, or name`}
          address={form.address || ''}
          coords={hasPin ? { lat: Number(form.lat), lng: Number(form.lng) } : null}
          street={form.street || ''}
          buildingNumber={form.building_number || ''}
          onChange={({
            address: nextAddress,
            coords: nextCoords,
            street: nextStreet,
            buildingNumber: nextBuilding,
          }) => {
            setForm((f) => ({
              ...f,
              address: nextAddress,
              street: nextStreet || '',
              building_number: nextBuilding || '',
              lat: nextCoords?.lat ?? '',
              lng: nextCoords?.lng ?? '',
            }));
            if (nextCoords?.lat) setLocErr(null);
          }}
        />
        <p className="mt-1 text-xs text-brand-grey">
          The pin sets the delivery radius and the rider&apos;s pickup navigation. Required.
        </p>
        {locErr && <p className="mt-1 text-xs font-bold text-red-600">{locErr}</p>}
      </div>

      <Field label="Description">
        <input
          value={form.description || ''}
          onChange={set('description')}
          className={inputClass}
          placeholder="Shown to customers"
        />
      </Field>

      <Field label="Homepage badge (optional)">
        <select value={form.badge || ''} onChange={set('badge')} className={inputClass}>
          {BADGE_OPTIONS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm font-bold text-brand-dark cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.is_active}
          onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          className="w-4 h-4 accent-[#FF7E21]"
        />
        Listed (visible to customers) — keep off until the catalogue is imported
      </label>
      <label className="flex items-center gap-2 text-sm font-bold text-brand-dark cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.is_featured}
          onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
          className="w-4 h-4 accent-[#FF7E21]"
        />
        Feature on the homepage — needs a logo, a map pin, and Listed on
      </label>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={busy} className={btnPrimary + ' flex-1'}>
          {busy ? <Spinner className="!border-white/40 !border-t-white" /> : `Save ${lower}`}
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
