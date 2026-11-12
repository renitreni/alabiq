// ---------------------------------------------------------------------
// Driver star rating (1-5) — shared by Food Delivery (delivered orders),
// Ecommerce (delivered shop orders) and Pick & Drop (completed trips).
// `kind` is 'food' | 'shop' | 'ride'. One rating per job, enforced
// server-side; an "already rated" response flips into the thanks state.
// ---------------------------------------------------------------------
import { useState } from 'react';
import { Star } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Spinner, btnPrimary, inputClass } from './ui';

export default function RateDriver({ kind, code, driverName, existing = null }) {
  const [stars, setStars] = useState(existing ? existing.stars : 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(!!existing);
  const [error, setError] = useState(null);

  async function submit() {
    if (!stars) return setError('Please tap a star rating first.');
    setError(null);
    setBusy(true);
    try {
      const body = { stars, ...(comment.trim() ? { comment: comment.trim() } : {}) };
      if (kind === 'food') await api.rateFoodDriver(code, body);
      else if (kind === 'shop') await api.rateShopDriver(code, body);
      else await api.rateRideDriver(code, body);
      setDone(true);
    } catch (err) {
      if (err.status === 409 && /already rated/i.test(err.message)) setDone(true);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="p-5 text-center">
        <div className="flex justify-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-6 h-6 ${n <= (stars || 5) ? 'text-amber-400 fill-amber-400' : 'text-brand-border'}`}
            />
          ))}
        </div>
        <p className="font-bold text-brand-dark text-sm">Thanks for rating your driver</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <p className="font-black text-brand-black mb-1">
        How was {driverName ? driverName.split(' ')[0] : 'your driver'}?
      </p>
      <p className="text-xs text-brand-grey mb-3">
        {kind === 'food' ? 'Rate your delivery rider.' : 'Rate your trip driver.'}
      </p>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="flex justify-center gap-2 mb-4" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            className="cursor-pointer p-1"
            title={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Star
              className={`w-9 h-9 transition-colors ${
                n <= (hover || stars) ? 'text-amber-400 fill-amber-400' : 'text-brand-border'
              }`}
            />
          </button>
        ))}
      </div>

      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)"
        maxLength={500}
        className={inputClass + ' mb-3'}
      />
      <button type="button" onClick={submit} disabled={busy} className={btnPrimary + ' w-full'}>
        {busy ? <Spinner className="!border-white/40 !border-t-white" /> : 'Submit rating'}
      </button>
    </Card>
  );
}
