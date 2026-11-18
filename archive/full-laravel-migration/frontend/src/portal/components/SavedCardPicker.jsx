// ---------------------------------------------------------------------
// Saved card picker — shown above the payment options once the customer
// has at least one card on file. Shared by all three services.
//
// The value passed around is our own uuid (method.id). The gateway's card
// and customer references never reach the browser at all, so there is
// nothing here that could be replayed against Tap.
// ---------------------------------------------------------------------
import { CreditCard, Plus } from 'lucide-react';
import { savedCardLabel } from '../lib/constants';

// Sentinel for "none of the saved ones" so the caller can switch to the
// new-card flow without a second piece of state.
export const NEW_CARD = '__new__';

export default function SavedCardPicker({ methods, value, onChange, disabled = false }) {
  if (!methods || !methods.length) return null;

  return (
    <div className="space-y-2 mb-4">
      <p className="text-sm font-bold text-brand-black">Pay with a saved card</p>

      {methods.map((m) => {
        // An expired card is shown rather than hidden, so the customer can
        // see why their usual card is gone and go remove it.
        const unusable = m.expired;
        const selected = value === m.id;
        return (
          <label
            key={m.id}
            className={
              'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ' +
              (unusable
                ? 'border-brand-border bg-brand-warm/40 opacity-60 cursor-not-allowed'
                : selected
                  ? 'border-brand-orange bg-brand-orange/5'
                  : 'border-brand-border hover:border-brand-orange/50')
            }
          >
            <input
              type="radio"
              name="saved-card"
              className="accent-brand-orange"
              checked={selected}
              disabled={disabled || unusable}
              onChange={() => onChange(m.id)}
            />
            <CreditCard className="w-4 h-4 text-brand-grey shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-brand-dark truncate">
                {savedCardLabel(m)}
              </span>
              {unusable && <span className="block text-xs text-red-600 font-medium">Expired — remove it and pay with a new card</span>}
              {!unusable && m.expiringSoon && (
                <span className="block text-xs text-amber-600 font-medium">Expires soon</span>
              )}
            </span>
            {m.is_default && !unusable && (
              <span className="text-[11px] font-bold text-brand-grey uppercase tracking-wide shrink-0">
                Default
              </span>
            )}
          </label>
        );
      })}

      <label
        className={
          'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ' +
          (value === NEW_CARD
            ? 'border-brand-orange bg-brand-orange/5'
            : 'border-brand-border hover:border-brand-orange/50')
        }
      >
        <input
          type="radio"
          name="saved-card"
          className="accent-brand-orange"
          checked={value === NEW_CARD}
          disabled={disabled}
          onChange={() => onChange(NEW_CARD)}
        />
        <Plus className="w-4 h-4 text-brand-grey shrink-0" />
        <span className="text-sm font-bold text-brand-dark">Use a different card</span>
      </label>
    </div>
  );
}
