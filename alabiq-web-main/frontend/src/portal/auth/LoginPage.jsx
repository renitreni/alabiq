// ---------------------------------------------------------------------
// Sign in (shared by passengers, drivers and admins — role comes from the
// profile, not the login form).
// ---------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogIn, Mail, ArrowLeft, MapPin, Package, Utensils } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { roleHome } from '../lib/constants';
import { Field, btnPrimary, Spinner } from '../components/ui';

import { Capacitor } from '@capacitor/core';
import MobileLoginScreen from './mobile/screens/LoginScreen';
import PasswordInput from '../components/PasswordInput';
import { getAuthErrorMessage } from './mobile/authErrorMessages';
import { getEmailError, getRequiredError, isClean } from '../lib/fieldValidation';

const features = [
  { icon: Utensils, text: 'Order food from 500+ restaurants' },
  { icon: Package, text: 'Send packages with live tracking' },
  { icon: MapPin, text: 'Book rides & airport transfers' },
];

const inputWithIconClass =
  'w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition-all';

export default function LoginPage() {
  const { signIn, session, role, profileError, profileLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // mobile-only error state, kept separate from the web `error` banner above
  const [showPassword, setShowPassword] = useState(false);
  const [mobileFieldErrors, setMobileFieldErrors] = useState({});
  const [mobileBannerError, setMobileBannerError] = useState(null);

  // Already signed in? Don't show the form — send them to their home/dashboard.
  // (Also handles the post-login redirect once the profile/role loads.)
  useEffect(() => {
    if (session && role) navigate(roleHome(role, next), { replace: true });
  }, [session, role, next, navigate]);

  // API login succeeded but /api/auth/sync failed (often a missing DB migration).
  useEffect(() => {
    if (session && !profileLoading && profileError) {
      setError(profileError);
      setBusy(false);
    }
  }, [session, profileLoading, profileError]);

  async function submit(e) {
  e.preventDefault();
  setError(null);
  setFieldErrors({});
  setMobileFieldErrors({});
  setMobileBannerError(null);

  // Validate before the request, not after: an empty password or a malformed
  // address never needed a round trip to be known wrong, and going through
  // signIn() for it burns an authentication rate-limit slot per keystroke-fix.
  const invalid = {
    email: getEmailError(email),
    password: getRequiredError(password, 'Password'),
  };
  if (!isClean(invalid)) {
    if (Capacitor.isNativePlatform()) setMobileFieldErrors(invalid);
    else setFieldErrors(invalid);
    return;
  }

  setBusy(true);
  try {
    await signIn(email.trim(), password);
    // The effect above redirects once the role is known.
  } catch (err) {
    if (Capacitor.isNativePlatform()) {
      const { field, text } = getAuthErrorMessage(err);
      if (field === 'banner') {
        setMobileBannerError(text);
      } else {
        setMobileFieldErrors({ [field]: text });
      }
    } else {
      setError(err.message);
    }
    setBusy(false);
  }
}

if (Capacitor.isNativePlatform()) {
  return (
    <MobileLoginScreen
        email={email} setEmail={setEmail}
        password={password} setPassword={setPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        fieldErrors={mobileFieldErrors}
        bannerError={mobileBannerError}
        busy={busy}
        onSubmit={submit}
        onGoToSignUp={() => navigate(`/signup?next=${encodeURIComponent(next)}`)}
        onForgotPassword={() => navigate('/forgot-password')}
    />
  );
}
  
  return (
    <div className="min-h-screen flex bg-brand-light">
      <div className="hidden lg:flex lg:w-[44%] xl:w-[42%] relative overflow-hidden bg-brand-warm">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-brand-orange/15 blur-[100px]" />
          <div className="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full bg-brand-red/10 blur-[90px]" />
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <Link to="/" className="flex items-center gap-3 w-fit group">
            <motion.img
              whileHover={{ scale: 1.08, rotate: -4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 14 }}
              src="/mappia-new-logo.png"
              alt="Alabiq"
              className="w-12 h-12 object-contain"
            />
            <span className="text-xl font-black tracking-tight text-brand-black">
              Smart <span className="text-brand-orange">Mappia</span>
            </span>
          </Link>

          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center gap-2 bg-white/80 border border-brand-orange/20 px-4 py-2 rounded-full text-brand-orange text-xs font-bold tracking-widest uppercase mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange" />
                </span>
                All-in-one platform
              </div>

              <h1 className="text-4xl xl:text-5xl font-black tracking-tight text-brand-black leading-[1.1]">
                Welcome back to{' '}
                <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                  Alabiq
                </span>
              </h1>
              <p className="text-brand-grey text-base leading-relaxed mt-4 max-w-md">
                Sign in to book rides, track deliveries, and manage your account — all in one place.
              </p>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
              className="space-y-4"
            >
              {features.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-brand-dark">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-brand-border shadow-sm shadow-brand-orange/5">
                    <Icon className="w-5 h-5 text-brand-orange" strokeWidth={2.25} />
                  </span>
                  <span className="text-sm font-semibold">{text}</span>
                </li>
              ))}
            </motion.ul>
          </div>

          <p className="text-xs text-brand-grey font-medium">
            © {new Date().getFullYear()} Alabiq. Fast delivery, easy booking.
          </p>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col min-h-screen">
        <div className="absolute inset-0 pointer-events-none lg:hidden" aria-hidden="true">
          <div className="absolute -top-20 -right-20 w-[280px] h-[280px] rounded-full bg-brand-orange/10 blur-[80px]" />
          <div className="absolute bottom-0 -left-16 w-[240px] h-[240px] rounded-full bg-brand-red/5 blur-[70px]" />
        </div>

        <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </button>

          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <img src="/mappia-new-logo.png" alt="Alabiq" className="w-9 h-9 object-contain" />
            <span className="font-black tracking-tight text-brand-black text-sm">
              Smart <span className="text-brand-orange">Mappia</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center px-5 py-8 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-8 text-center lg:text-left">
              <h2 className="text-2xl sm:text-3xl font-black text-brand-black tracking-tight">Sign in</h2>
              <p className="text-brand-grey text-sm mt-2">
                Enter your credentials to access your account
              </p>
            </div>

            <div className="bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/8 p-6 sm:p-8">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              <form onSubmit={submit} noValidate className="space-y-5">
                <Field label="Email Address" error={fieldErrors.email}>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey pointer-events-none" />
                    <input
                      type="email"
                      className={inputWithIconClass}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email"
                      autoComplete="email"
                      aria-invalid={fieldErrors.email ? 'true' : undefined}
                    />
                  </div>
                </Field>

                <Field label="Password" error={fieldErrors.password}>
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    hasError={!!fieldErrors.password}
                  />
                </Field>

                <div className="flex justify-end -mt-2">
                  <Link
                    to="/forgot-password"
                    className="text-sm font-bold text-brand-orange hover:text-brand-red transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className={btnPrimary + ' w-full mt-2 hover:scale-[1.01] active:scale-[0.99]'}
                >
                  {busy ? (
                    <Spinner className="!border-white/40 !border-t-white" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Sign in
                    </>
                  )}
                </button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-brand-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white px-3 text-brand-grey font-bold">or</span>
                </div>
              </div>

              <p className="text-sm text-brand-grey text-center">
                Don't have an account?{' '}
                <Link
                  to={`/signup?next=${encodeURIComponent(next)}`}
                  className="text-brand-orange font-bold hover:underline underline-offset-2"
                >
                  Sign Up
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
