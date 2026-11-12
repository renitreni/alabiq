// ---------------------------------------------------------------------
// Admin — platform settings (0043).
//
// Readable by any admin, writable only by a super admin (the backend
// enforces both; the tab itself is hidden for a plain admin).
//
// Two settings:
//   * the maximum distance, which replaced DELIVERY_MAX_RADIUS_KM - that
//     lived only in the .env on the server, applied to food and shop but not
//     to rides, and could not be seen from anywhere in the portal.
//   * whether STC Pay manual transfer is offered at checkout (0044).
//
// They save independently. The backend PATCH treats an absent field as
// "unchanged", so turning STC Pay off cannot disturb the distance limit.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Ruler, Save, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { notifySuccess } from '../lib/notify';
import { Card, Field, Spinner, inputClass, btnPrimary } from '../components/ui';

export default function SettingsView() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // noLimit is separate state rather than "km is empty" because null is a
  // real, deliberate value here — an empty box has to mean something else,
  // otherwise clearing the field to retype it would read as removing the cap.
  const [noLimit, setNoLimit] = useState(true);
  const [km, setKm] = useState('');
  const [stcPay, setStcPay] = useState(true);
  const [stcBusy, setStcBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.adminSettings();
        const value = res.max_distance_km;
        setNoLimit(value == null);
        setKm(value == null ? '' : String(value));
        setStcPay(res.stcpay_enabled !== false);
      } catch {
        /* surfaced by the api client */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.adminUpdateSettings({
        max_distance_km: noLimit ? null : Number(km),
      });
      const value = res.max_distance_km;
      setNoLimit(value == null);
      setKm(value == null ? '' : String(value));
      notifySuccess(value == null ? 'Distance limit removed.' : `Distance limit set to ${value} km.`);
    } catch {
      /* surfaced */
    } finally {
      setBusy(false);
    }
  }

  // Sends only this field, so the distance limit is untouched either way.
  async function saveStcPay(next) {
    setStcBusy(true);
    try {
      const res = await api.adminUpdateSettings({ stcpay_enabled: next });
      setStcPay(res.stcpay_enabled !== false);
      notifySuccess(
        res.stcpay_enabled !== false
          ? 'STC Pay is now shown at checkout.'
          : 'STC Pay is now hidden at checkout.'
      );
    } catch {
      /* surfaced by the api client; state is left as it was */
    } finally {
      setStcBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <Spinner />
      </Card>
    );
  }

  const invalid = !noLimit && !(Number(km) > 0);

  return (
    <div className="space-y-4">
    <Card className="p-4 max-w-xl">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-start gap-3">
          <Ruler className="w-5 h-5 text-brand-orange mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">Maximum distance</h3>
            <p className="text-sm text-gray-500 mt-1">
              How far the platform will serve, measured in a straight line. This applies to
              Pick &amp; Drop rides <strong>and</strong> to food and shop deliveries — there is one
              answer for the whole platform. Anything further is refused at checkout.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={noLimit}
            onChange={(e) => setNoLimit(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">No limit</span>
            <span className="block text-gray-500">
              Accept any distance. A long airport transfer is a legitimate booking, so this is how
              the platform ships.
            </span>
          </span>
        </label>

        {!noLimit && (
          <Field label="Limit (km)">
            <input
              type="number"
              min="0.1"
              step="0.1"
              className={inputClass}
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="e.g. 50"
            />
          </Field>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className={btnPrimary} disabled={busy || invalid}>
            <Save className="w-4 h-4" />
            {busy ? 'Saving...' : 'Save'}
          </button>
          <span className="text-sm text-gray-500">
            {noLimit ? 'Currently: no limit' : `Currently: ${km || '--'} km`}
          </span>
        </div>

        <p className="text-xs text-gray-400">
          Takes effect within a minute — the backend caches this value briefly rather than reading
          it on every order.
        </p>
      </form>
    </Card>

    <Card className="p-4 max-w-xl">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-brand-orange mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold">STC Pay (manual transfer)</h3>
            <p className="text-sm text-gray-500 mt-1">
              The pay-by-transfer-and-upload-a-screenshot option, across Pick &amp; Drop, food and
              shop. It exists because card payment did not. Hiding it here removes it from
              checkout without a deploy; card and cash are unaffected.
            </p>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={stcPay}
            disabled={stcBusy}
            onChange={(e) => saveStcPay(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">Show STC Pay at checkout</span>
            <span className="block text-gray-500">
              Turn this off only once card payments are settling reliably. With it off and card
              unavailable, customers are left with cash only.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3">
          {stcBusy && <Spinner />}
          <span className="text-sm text-gray-500">
            Currently: {stcPay ? 'shown at checkout' : 'hidden'}
          </span>
        </div>

        <p className="text-xs text-gray-400">
          Saves as soon as you tick it, and takes effect within a minute. Customers already on the
          payment screen keep what they loaded until they refresh.
        </p>
      </div>
    </Card>
    </div>
  );
}
