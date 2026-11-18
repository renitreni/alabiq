// ---------------------------------------------------------------------
// "You just came back from the payment page."
//
// Tap appends tap_id to the URL it redirects to, and every tracking page
// used to throw it away — they polled our own order row instead, which only
// the webhook could change. So when a webhook was dropped (blocked at the
// edge, or never sent at all because post.url was misconfigured) the
// customer sat on a page that polled forever showing an unpaid order they
// had in fact paid for.
//
// This hands the id back to the server, which asks Tap directly. One hook
// for all three tracking pages rather than a copy each: the difference
// between the verticals is which reload function to call afterwards, and
// that is the argument.
//
// Runs at most once per charge id. The server call is idempotent anyway
// (the webhook arriving first makes it a no-op), but re-firing it on every
// render would be a request per poll.
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from './api';

export default function useReturnedCharge(onSettled) {
  const [params, setParams] = useSearchParams();
  const [verifying, setVerifying] = useState(false);
  const done = useRef(null);

  const chargeId = params.get('tap_id');

  useEffect(() => {
    if (!chargeId || done.current === chargeId) return;
    done.current = chargeId;

    let cancelled = false;
    setVerifying(true);

    api
      .verifyCharge(chargeId)
      .catch(() => null) // a failure here is recoverable: the sweeper still has it
      .then((result) => {
        if (cancelled) return;
        setVerifying(false);
        // Drop tap_id from the address bar either way, so a refresh or a
        // shared link does not re-run this, and the URL stops carrying a
        // gateway reference.
        const next = new URLSearchParams(params);
        next.delete('tap_id');
        setParams(next, { replace: true });
        if (result && result.paid && onSettled) onSettled();
      });

    return () => {
      cancelled = true;
    };
    // params/setParams/onSettled are deliberately out: this must fire on the
    // charge id alone, and onSettled is a fresh closure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeId]);

  return { verifying };
}
