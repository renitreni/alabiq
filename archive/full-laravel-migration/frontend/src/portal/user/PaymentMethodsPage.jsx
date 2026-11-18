// ---------------------------------------------------------------------
// Payment methods: /payment-methods
//
// List, set default, remove. There is deliberately no "add a card" here —
// Tap only mints a saved card as a side effect of a real charge, so a card
// is added by ticking "save this card" while paying for something.
//
// A sibling page rather than a section inside ProfilePage: this needs its
// own loading, empty and delete-confirm states, and coupling a payments
// screen to the page people open to change their phone number helps nobody.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Trash2, Star, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { savedCardLabel } from '../lib/constants';
import { PortalShell, Card, Badge, btnGhost, Spinner } from '../components/ui';

export default function PaymentMethodsPage() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  useEffect(() => {
    api
      .paymentMethods()
      .then(({ methods: list }) => setMethods(list || []))
      .catch((err) => {
        // 503 means the gateway is not configured yet — a normal state
        // before go-live, not something to alarm the customer about.
        if (err.status === 503) setMethods([]);
        else setError(err.message);
      });
  }, []);

  async function remove(id) {
    setBusyId(id);
    setError(null);
    try {
      await api.deletePaymentMethod(id);
      setMethods((prev) => prev.filter((m) => m.id !== id));
      setConfirmId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function makeDefault(id) {
    setBusyId(id);
    setError(null);
    try {
      const { methods: list } = await api.setDefaultPaymentMethod(id);
      setMethods(list || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalShell
      title="Payment methods"
      subtitle="Your saved cards"
      onBack={() => navigate('/profile')}
    >
      <div className="max-w-xl mx-auto space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {methods === null && (
          <div className="flex justify-center py-20"><Spinner className="!w-8 !h-8" /></div>
        )}

        {methods !== null && methods.length === 0 && (
          <Card className="p-8 text-center">
            <CreditCard className="w-10 h-10 mx-auto text-brand-grey/40 mb-3" />
            <p className="font-black text-brand-black mb-1">No saved cards yet</p>
            <p className="text-sm text-brand-grey">
              Next time you pay by card, tick "Save this card for faster checkout" and it will
              appear here.
            </p>
          </Card>
        )}

        {methods !== null && methods.length > 0 && (
          <>
            {methods.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand-warm text-brand-orange flex items-center justify-center shrink-0">
                    <CreditCard size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-dark truncate">{savedCardLabel(m)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.is_default && <Badge tone="green">Default</Badge>}
                      {m.expired && <Badge tone="red">Expired</Badge>}
                      {!m.expired && m.expiringSoon && <Badge tone="amber">Expires soon</Badge>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  {!m.is_default && !m.expired && (
                    <button
                      onClick={() => makeDefault(m.id)}
                      disabled={busyId === m.id}
                      className={btnGhost + ' flex-1 !py-2 text-sm'}
                    >
                      <Star className="w-4 h-4" /> Make default
                    </button>
                  )}
                  {confirmId === m.id ? (
                    <>
                      <button
                        onClick={() => remove(m.id)}
                        disabled={busyId === m.id}
                        className="flex-1 py-2 px-4 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2"
                      >
                        {busyId === m.id ? <Spinner className="!border-white/40 !border-t-white" /> : 'Yes, remove'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className={btnGhost + ' !py-2 text-sm'}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmId(m.id)}
                      disabled={busyId === m.id}
                      className={btnGhost + ' flex-1 !py-2 text-sm !text-red-600'}
                    >
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  )}
                </div>
              </Card>
            ))}

            <div className="flex items-start gap-2.5 px-1 text-xs text-brand-grey leading-relaxed">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
              <p>
                Alabiq never stores your card number or security code. We keep only a secure
                reference from our payment provider, plus the brand and last four digits so you can
                recognise the card.
              </p>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}
