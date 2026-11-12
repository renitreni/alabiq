// ---------------------------------------------------------------------
// Request a password reset link: /forgot-password
//
// FOR SELF-REGISTERED CUSTOMERS. Merchant and admin passwords are issued by
// an admin in the Admin tab and this page is not their recovery path — but
// nothing blocks them from using it either, since holding the mailbox is
// proof enough. See docs/engineering/13-authentication-and-security.md.
//
// Sends via Supabase -> Resend SMTP. `redirectTo` MUST be listed under
// Authentication -> URL Configuration -> Redirect URLs in the Supabase
// dashboard; an unlisted value does not error, it silently falls back to
// Site URL and drops the user on the homepage holding a recovery token.
//
// Platform split mirrors LoginPage: the native app gets the mobile screen,
// the web gets the branded form below.
// ---------------------------------------------------------------------
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { api } from '../lib/api';
import { Field, btnPrimary, Spinner } from '../components/ui';
import MobileForgotPasswordScreen from './mobile/screens/ForgotPasswordScreen';

const inputWithIconClass =
  'w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition-all';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function submit(address) {
    const target = String(address || '').trim();
    if (!target) {
      setError('Enter the email address you signed up with.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(target);
      // Deliberately NOT branching on the result.
      //
      // Reporting "no account with that email" would turn this form into an
      // account-enumeration oracle: anyone could test addresses against our
      // user list at their leisure. The confirmation below is identical
      // whether or not the address exists, which is why it says "if an
      // account exists" rather than "we sent it".
      setSent(true);
    } catch {
      // Same reasoning — a thrown error here is almost always rate limiting or
      // a transport problem, neither of which the customer can act on beyond
      // trying again, and distinguishing them leaks the same information.
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (Capacitor.isNativePlatform()) {
    if (sent) {
      return (
        <MobileSentConfirmation email={email} onGoToLogin={() => navigate('/login')} />
      );
    }
    return (
      <MobileForgotPasswordScreen
        onBack={() => navigate('/login')}
        onSubmit={(value) => { setEmail(value); submit(value); }}
      />
    );
  }

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
          {sent ? (
            <>
              <div className="w-12 h-12 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-black text-brand-black tracking-tight">Check your email</h1>
              <p className="text-sm text-brand-grey mt-2">
                If an account exists for <span className="font-bold text-brand-dark">{email}</span>,
                we have sent a link to reset your password. It expires in one hour.
              </p>
              <p className="text-xs text-brand-grey mt-4">
                Open the link in any modern browser. The link is single-use and expires in one hour.
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className={btnPrimary + ' w-full mt-6'}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-black text-brand-black tracking-tight">Forgot password?</h1>
              <p className="text-sm text-brand-grey mt-2 mb-6">
                Enter your email and we will send you a link to choose a new one.
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); submit(email); }}>
                <Field label="Email address">
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email"
                      className={inputWithIconClass}
                    />
                  </div>
                </Field>

                <button type="submit" disabled={busy} className={btnPrimary + ' w-full mt-2'}>
                  {busy ? <Spinner className="!w-4 !h-4" /> : <>Send reset link <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Native confirmation. Reuses the mobile shell rather than the signup-specific
// ConfirmationSentScreen, whose copy is about confirming a new account.
function MobileSentConfirmation({ email, onGoToLogin }) {
  return (
    <div className="auth-mobile-layout">
      <div className="auth-mobile-content">
        <div className="auth-card">
          <div className="auth-icon-header"><Mail className="w-7 h-7" /></div>
          <h1 className="auth-title auth-title-center">Check your email</h1>
          <p className="auth-subtitle auth-subtitle-center">
            If an account exists for <strong>{email}</strong>, we have sent a link to reset your
            password. The link is single-use and expires in one hour.
          </p>
          <button type="button" className="auth-button" onClick={onGoToLogin}>
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
