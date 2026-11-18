// ---------------------------------------------------------------------
// Inline-editable contact number, used on the ride + food tracking pages.
// The number stays editable while the trip/order is in progress so the
// driver/admin always see the current one (the backend broadcasts the
// change to their views).
// ---------------------------------------------------------------------
import { useState } from 'react';
import { Phone, Pencil, Check, X } from 'lucide-react';
import { notifySuccess } from '../lib/notify';
import { Card, Spinner, inputClass } from './ui';

export default function EditableContact({ value, onSave, editable = true, label = 'Contact number' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = draft.trim();
    if (!next || next === (value || '')) { setEditing(false); return; }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
      notifySuccess('Contact updated', 'Your driver and our team can now reach you on the new number.');
    } catch {
      /* api.js already showed the error popup */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center shrink-0">
          <Phone className="w-4 h-4" />
        </div>
        {editing ? (
          <>
            <input
              type="tel"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              className={inputClass + ' !py-2 flex-1'}
              placeholder="05XXXXXXXX"
              maxLength={40}
              autoFocus
            />
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="p-2 rounded-lg bg-brand-orange text-white cursor-pointer disabled:opacity-50 shrink-0"
              title="Save"
            >
              {busy ? <Spinner className="!w-4 !h-4 !border-white/40 !border-t-white" /> : <Check className="w-4 h-4" />}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setEditing(false); setDraft(value || ''); }}
              className="p-2 rounded-lg border border-brand-border text-brand-grey cursor-pointer shrink-0"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-brand-grey uppercase tracking-wider">{label}</p>
              <p className="font-bold text-brand-dark truncate">{value || 'Not set'}</p>
            </div>
            {editable && (
              <button
                type="button"
                onClick={() => { setDraft(value || ''); setEditing(true); }}
                className="p-2 rounded-lg text-brand-grey hover:text-brand-dark hover:bg-brand-surface cursor-pointer shrink-0"
                title="Edit contact number"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
