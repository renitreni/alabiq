// ---------------------------------------------------------------------
// Whether the checkout screens may advertise card payment.
//
// One helper, three call sites (rides, food, shop). The answer is a
// deployment fact, not per-user state, so it is fetched once per page load
// and shared — a module-level promise, not a per-component request.
//
// /api/payments is replaced wholesale by a 503 stub when Tap is
// unconfigured, so ANY failure here means "no card". That is the whole
// point of the gate: there is no separate client flag to drift out of sync
// (the old VITE_TAP_ENABLED did exactly that).
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { api } from './api';

let probe = null;

function cardAvailable() {
  if (!probe) {
    probe = api
      .paymentConfig()
      .then((cfg) => !!(cfg && cfg.cardAvailable))
      .catch(() => {
        // Answer "no card" for this caller, but do NOT memoize the failure.
        // One dropped request on mobile data, or a 429 from the global
        // limiter that a chatty location picker exhausted, would otherwise
        // pin card as unavailable for the rest of the page load across all
        // three verticals -- reintroducing exactly the silent
        // method-picker/payment-panel mismatch this helper exists to close.
        probe = null;
        return false;
      });
  }
  return probe;
}

export default function useCardAvailable() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    cardAvailable().then((ok) => {
      if (alive) setAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  return available;
}
