// ---------------------------------------------------------------------
// Shared payment panel — STC Pay manual proof + card (Tap).
//
// Used by all THREE services: food and shop checkout/tracking, and rides
// via PayPage. Adding the `ride` entry to the map below is what let the
// platform drop its second, separate ride payment UI.
//
// Card entry itself happens on Tap's hosted page, never here. That is
// deliberate: the moment this component reads a card number into React
// state, the page is in PCI scope. We only ever hold our own uuid for a
// saved card.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../lib/api';
import { uploadProofFile } from '../lib/gatewayClient';
import { validateUploadFile, UPLOAD_ACCEPT, UPLOAD_FORMATS_HINT } from '../lib/uploadFiles';
import { fmtSAR } from '../lib/constants';
import CardPaySection from '../components/CardPaySection';
import { Card, Field, fileInputClass, btnGhost, Spinner } from '../components/ui';

// Which api methods to drive. The STC Pay proof flow is byte-for-byte the
// same in all three verticals — only the endpoints differ — so the panel is
// parameterised rather than copied.
const API_BY_VERTICAL = {
  food: {
    paymentInfo: (code) => api.foodPaymentInfo(code),
    signedUrl: (code, body) => api.foodPaySignedUrl(code, body),
    recordPayment: (code, body) => api.foodRecordPayment(code, body),
    cardCharge: (code, body, key) => api.foodCardCharge(code, body, key),
  },
  shop: {
    paymentInfo: (code) => api.shopPaymentInfo(code),
    signedUrl: (code, body) => api.shopPaySignedUrl(code, body),
    recordPayment: (code, body) => api.shopRecordPayment(code, body),
    cardCharge: (code, body, key) => api.shopCardCharge(code, body, key),
  },
  ride: {
    paymentInfo: (code) => api.paymentInstructions(code),
    signedUrl: (code, body) => api.proofSignedUrl(code, body),
    recordPayment: (code, body) => api.recordProof(code, body),
    cardCharge: (code, body, key) => api.bookingCardCharge(code, body, key),
  },
};

export default function PaymentPanel({ code, onPaid, vertical = 'food' }) {
  const calls = API_BY_VERTICAL[vertical] || API_BY_VERTICAL.food;
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    calls.paymentInfo(code).then(setInfo).catch((e) => setLoadErr(e.message));
  }, [code, calls]);

  // STC Pay manual transfer is a super-admin switch (0044). Absent means
  // on, so an older backend that does not send the field still shows it.
  const stcOn = info?.stcPayAvailable !== false;

  // The payment step shows ONE method: the one chosen at checkout. Stacking
  // the card form on top of the transfer details asked the customer to
  // decide a second time, having already decided.
  //
  // Orders placed before card was a picker option carry 'stcpay', so they
  // still land on the transfer details - which is what they were promised.
  const chosenCard = info?.paymentMethod === 'tap';

  async function submitProof() {
    if (!file) return setError('Please choose a screenshot of your STC Pay transfer.');
    const check = validateUploadFile(file);
    if (!check.ok) return setError(check.error);

    setError(null);
    setBusy(true);
    try {
      const signed = await calls.signedUrl(code, { file_name: file.name, mime_type: check.mimeType });
      await uploadProofFile(signed.bucket, signed.path, signed.token, file);
      const result = await calls.recordPayment(code, {
        path: signed.path,
        file_name: file.name,
        mime_type: check.mimeType,
        size_bytes: file.size,
      });
      onPaid?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loadErr) {
    return (
      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
        {loadErr}
      </div>
    );
  }
  if (!info) {
    return <div className="flex justify-center py-10"><Spinner className="!w-7 !h-7" /></div>;
  }

  return (
    <Card className="p-5 sm:p-6">
      <p className="font-black text-brand-black mb-1">Pay for your order</p>
      <p className="text-sm text-brand-grey mb-4">
        Order <span className="font-mono font-bold text-brand-dark">{info.orderCode || code}</span>
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}
      {info.paymentStatus === 'failed' && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          Your previous payment was not verified. Please try again or contact support.
        </div>
      )}

      {chosenCard && (
        <div className="mb-4">
          <CardPaySection
            code={code}
            amount={info.amount}
            available={info.cardAvailable}
            charge={calls.cardCharge}
            onPaid={onPaid}
            onError={setError}
          />
        </div>
      )}

      {!chosenCard && stcOn && (
        <>
      <div className="bg-brand-warm border border-brand-border rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-brand-grey">Send via STC Pay to</span><span className="font-bold">{info.stcPay?.number || 'Number pending'}</span></div>
        <div className="flex justify-between"><span className="text-brand-grey">Recipient</span><span className="font-bold">{info.stcPay?.recipientName}</span></div>
        <div className="flex justify-between pt-2 border-t border-brand-border">
          <span className="text-brand-grey font-bold">Total to pay</span>
          <span className="font-black text-brand-orange">{fmtSAR(info.amount)}</span>
        </div>
        <div className="flex justify-between"><span className="text-brand-grey">Reference (note)</span><span className="font-mono font-bold">{info.reference}</span></div>
      </div>

      <ol className="list-decimal list-inside text-sm text-brand-dark mt-4 space-y-1">
        {(info.instructions || []).map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      <div className="mt-5">
        <Field label="Upload your STC Pay screenshot">
          <input
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className={fileInputClass}
          />
        </Field>
        <p className="text-xs text-brand-grey mt-1.5">{UPLOAD_FORMATS_HINT}</p>
        <button onClick={submitProof} disabled={busy} className={btnGhost + ' w-full mt-4'}>
          {busy ? <Spinner /> : <><Upload className="w-4 h-4" /> Submit proof</>}
        </button>
        {info.testMode && (
          <p className="text-xs text-amber-600 mt-2 text-center font-medium">
            Test mode is ON — your payment will auto-verify instantly.
          </p>
        )}
      </div>
        </>
      )}

      {!chosenCard && !stcOn && (
        <p className="text-sm text-brand-grey bg-brand-warm border border-brand-border rounded-xl px-4 py-3">
          Online payment is unavailable right now. Your order is held — pay cash on delivery, or contact support.
        </p>
      )}
    </Card>
  );
}
