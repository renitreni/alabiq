// ---------------------------------------------------------------------
// Choose a new password from a reset link: /reset-password
//
// The API claims an app-owned, one-time reset token and returns a short-lived
// reset ticket. An ordinary signed-in session cannot authorize a password reset.
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { api } from '../lib/api';
import { getPasswordValidationError } from '../lib/passwordValidation';
import { btnPrimary, Spinner, Field } from '../components/ui';
import PasswordInput from '../components/PasswordInput';
import MobileNewPasswordScreen from './mobile/screens/NewPasswordScreen';

// Marks "this tab is mid-recovery", so a reload between arriving and
// submitting does not drop the user back to the invalid-link state. Cleared
// on success and on leaving. sessionStorage, not localStorage: it must not
// outlive the tab, or a later visit to /reset-password would inherit it.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recovery] = useState(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('token');
    return token ? { token } : null;
  });
  // 'verifying' -> 'ready' -> 'done', or 'invalid' at any point before 'done'.
  //
  // Both synchronously-knowable outcomes are resolved in the lazy initialiser
  // rather than in the effect: an unconfigured client, and a reload while the
  // form was already open. That leaves the effect handling only genuinely
  // asynchronous paths.
  const [phase, setPhase] = useState(recovery ? 'verifying' : 'invalid');
  const [error, setError] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!recovery) return undefined;
    let active = true;
    api.exchangePasswordReset(recovery.token)
      .then((data) => {
        if (!active) return;
        setTicket(data.ticket);
        setPhase('ready');
        window.history.replaceState({}, '', '/reset-password');
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setPhase('invalid');
      });
    return () => { active = false; };
  }, [recovery]);

  async function submit(password) {
    const validationError = getPasswordValidationError(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.completePasswordReset(ticket, password);
      setPhase('done');
    } catch (err) {
      setError(err.message || 'Could not update your password. Request a new link and try again.');
      setBusy(false);
      return;
    }

    setBusy(false);
  }

  // --- native -----------------------------------------------------------
  if (Capacitor.isNativePlatform()) {
    if (phase === 'ready') {
      return (
        <MobileNewPasswordScreen
          onBack={() => navigate('/login')}
          onSubmit={submit}
          serverError={error}
          busy={busy}
        />
      );
    }
    return (
      <div className="auth-mobile-layout">
        <div className="auth-mobile-content">
          <div className="auth-card">
            <Outcome phase={phase} error={error} onLogin={() => navigate('/login')} />
          </div>
        </div>
      </div>
    );
  }

  // --- web --------------------------------------------------------------
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-light px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to sign in
        </Link>

        <div className="bg-white border border-brand-border rounded-2xl p-7 shadow-sm">
          {phase === 'ready' ? (
            <WebForm onSubmit={submit} busy={busy} error={error} />
          ) : (
            <Outcome phase={phase} error={error} onLogin={() => navigate('/login')} />
          )}
        </div>
      </div>
    </div>
  );
}

function WebForm({ onSubmit, busy, error }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState(null);

  return (
    <>
      <h1 className="text-2xl font-black text-brand-black tracking-tight">Choose a new password</h1>
      <p className="text-sm text-brand-grey mt-2 mb-6">
        You will use this to sign in from now on.
      </p>

      {(localError || error) && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {localError || error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (password !== confirm) {
            setLocalError('Passwords do not match.');
            return;
          }
          setLocalError(null);
          onSubmit(password);
        }}
      >
        <Field label="New password">
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="Re-enter it"
          />
        </Field>
        <button type="submit" disabled={busy} className={btnPrimary + ' w-full mt-2'}>
          {busy ? <Spinner className="!w-4 !h-4" /> : 'Update password'}
        </button>
      </form>
    </>
  );
}

// Everything that is not the form: verifying, invalid link, and success.
function Outcome({ phase, error, onLogin }) {
  if (phase === 'verifying') {
    return (
      <div className="py-6 text-center">
        <Spinner className="!w-7 !h-7 mx-auto" />
        <p className="text-sm text-brand-grey mt-4">Checking your reset link…</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-brand-black tracking-tight">Password updated</h1>
        <p className="text-sm text-brand-grey mt-2 mb-6">
          Sign in with your new password.
        </p>
        <button type="button" onClick={onLogin} className={btnPrimary + ' w-full'}>
          Go to sign in
        </button>
      </div>
    );
  }

  // invalid
  return (
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h1 className="text-2xl font-black text-brand-black tracking-tight">This link cannot be used</h1>
      <p className="text-sm text-brand-grey mt-2">
        {error || 'It may have expired, been used already, or been opened in a different browser from the one that requested it.'}
      </p>
      <p className="text-xs text-brand-grey mt-3 mb-6">
        Reset links last one hour and must be opened in the browser that requested them.
      </p>
      <Link to="/forgot-password" className={btnPrimary + ' w-full'}>
        Request a new link
      </Link>
      <button
        type="button"
        onClick={onLogin}
        className="w-full mt-3 text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
      >
        Back to sign in
      </button>
    </div>
  );
}
