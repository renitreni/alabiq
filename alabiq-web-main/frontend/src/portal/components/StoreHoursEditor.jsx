// ---------------------------------------------------------------------
// Opening hours + "closed now" editor (migration 0038).
//
// Used by the admin Food and Shop tabs and by both merchant portals, which
// differ only in the three api calls handed in. Submits the WHOLE week —
// the backend replaces the schedule rather than patching windows, so a day
// the user cleared actually clears.
//
// An empty schedule means always open. That is the backward-compatible
// default every existing merchant is already in, so it is stated plainly
// rather than left for someone to discover.
// ---------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Clock } from 'lucide-react';
import { Card, Spinner, btnPrimary, btnGhost, inputClass } from './ui';
import { notifySuccess, notifyError } from '../lib/notify';
import { DAYS, hhmm } from '../lib/storeHours';

export default function StoreHoursEditor({ load, save, setAccepting, disabled = false }) {
  const [windows, setWindows] = useState(null);
  const [accepting, setAcceptingState] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await load();
      setWindows((res.hours || []).map((h) => ({ ...h, opens_at: hhmm(h.opens_at), closes_at: hhmm(h.closes_at) })));
      setAcceptingState(res.acceptingOrders !== false);
    } catch (err) {
      notifyError(err.message);
      setWindows([]);
    }
  }, [load]);

  useEffect(() => { refresh(); }, [refresh]);

  function addWindow(weekday) {
    setWindows((w) => [...w, { weekday, opens_at: '09:00', closes_at: '22:00' }]);
  }

  function updateWindow(index, patch) {
    setWindows((w) => w.map((win, i) => (i === index ? { ...win, ...patch } : win)));
  }

  function removeWindow(index) {
    setWindows((w) => w.filter((_, i) => i !== index));
  }

  async function onSave() {
    setBusy(true);
    try {
      await save(windows);
      notifySuccess('Opening hours saved');
      await refresh();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleAccepting() {
    const next = !accepting;
    setBusy(true);
    try {
      await setAccepting(next);
      setAcceptingState(next);
      notifySuccess(next ? 'Now accepting orders' : 'Closed — not accepting orders');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (windows === null) {
    return <div className="flex justify-center py-8"><Spinner className="!w-6 !h-6" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${accepting ? '' : 'border-red-300 bg-red-50'}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-bold text-brand-dark text-sm">
              {accepting ? 'Accepting orders' : 'Closed right now'}
            </p>
            <p className="text-xs text-brand-grey mt-0.5">
              {accepting
                ? 'Customers can order during the opening hours below.'
                : 'Customers can see this listing but cannot order, whatever the hours say.'}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || disabled}
            onClick={onToggleAccepting}
            className={accepting ? btnGhost : btnPrimary}
          >
            {busy ? <Spinner className="!w-4 !h-4" /> : accepting ? 'Close now' : 'Reopen'}
          </button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-brand-grey" />
          <p className="font-bold text-brand-dark text-sm">Opening hours</p>
        </div>

        {windows.length === 0 && (
          <p className="text-xs text-brand-grey mb-3">
            No hours set — this listing is treated as open 24/7. Add a window to any day to
            start closing outside those times.
          </p>
        )}

        <div className="space-y-3">
          {DAYS.map((day) => {
            const rows = windows
              .map((w, i) => ({ ...w, index: i }))
              .filter((w) => Number(w.weekday) === day.id);
            return (
              <div key={day.id} className="flex items-start gap-3 flex-wrap">
                <p className="w-24 shrink-0 text-sm font-bold text-brand-dark pt-2">{day.label}</p>
                <div className="flex-1 min-w-0 space-y-2">
                  {rows.length === 0 && (
                    <p className="text-xs text-brand-grey pt-2">
                      {windows.length === 0 ? 'Open' : 'Closed all day'}
                    </p>
                  )}
                  {rows.map((row) => (
                    <div key={row.index} className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={row.opens_at}
                        onChange={(e) => updateWindow(row.index, { opens_at: e.target.value })}
                        className={inputClass + ' !w-32'}
                      />
                      <span className="text-brand-grey text-sm">to</span>
                      <input
                        type="time"
                        value={row.closes_at}
                        onChange={(e) => updateWindow(row.index, { closes_at: e.target.value })}
                        className={inputClass + ' !w-32'}
                      />
                      {row.closes_at < row.opens_at && (
                        <span className="text-[11px] text-brand-grey">closes next day</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeWindow(row.index)}
                        className="text-brand-grey hover:text-red-600 cursor-pointer"
                        aria-label={`Remove ${day.label} window`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addWindow(day.id)}
                    className="text-xs font-bold text-brand-orange hover:underline cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add hours
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          disabled={busy || disabled}
          onClick={onSave}
          className={btnPrimary + ' w-full mt-4'}
        >
          {busy ? <Spinner className="!border-white/40 !border-t-white" /> : 'Save opening hours'}
        </button>
      </Card>
    </div>
  );
}
