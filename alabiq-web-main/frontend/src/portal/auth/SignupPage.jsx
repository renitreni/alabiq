// ---------------------------------------------------------------------
// Create an account as a User (passenger) or Driver. Restaurant owners
// cannot self-register — they contact Alabiq and admins provision
// their account after partnership approval.
// ---------------------------------------------------------------------
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { daysInMonth, buildDateOfBirth, buildFullPhone, isValidLocalPhone } from './authHelpers';
import {
  UserPlus,
  User,
  Car,
  Store,
  MailCheck,
  ArrowLeft,
  ArrowRight,
  Mail,
  IdCard,
  Check,
  ChevronDown,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { roleHome } from '../lib/constants';
import { Field, btnPrimary, btnGhost, Spinner } from '../components/ui';
import PasswordFields from '../components/PasswordFields';
import { isPasswordValid, getPasswordValidationError } from '../lib/passwordValidation';
import { getEmailError, getNameError, MAX_NAME_LENGTH } from '../lib/fieldValidation';
import { COMPANY } from '../../config/company';

import { Capacitor } from '@capacitor/core';
import MobileSignUpScreen from './mobile/screens/SignUpScreen';
import MobileConfirmationSentScreen from './mobile/screens/ConfirmationSentScreen';

const STEPS = ['Account type', 'Personal info', 'Create login'];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const PHONE_REGIONS = [
  { value: '+966', label: '+966 SA' },
  { value: '+971', label: '+971 AE' },
  { value: '+965', label: '+965 KW' },
  { value: '+973', label: '+973 BH' },
  { value: '+974', label: '+974 QA' },
  { value: '+968', label: '+968 OM' },
  { value: '+63', label: '+63 PH' },
  { value: '+91', label: '+91 IN' },
  { value: '+92', label: '+92 PK' },
  { value: '+20', label: '+20 EG' },
  { value: '+1', label: '+1 US' },
];

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'van', label: 'Van' },
  { value: 'motorcycle', label: 'Motorcycle' },
];

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const inputClass =
  'w-full bg-white border border-brand-border rounded-xl px-4 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition-all';

const inputWithIconClass =
  'w-full bg-white border border-brand-border rounded-xl pl-11 pr-4 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition-all';

// Names may only contain letters (incl. accented), spaces, hyphens and apostrophes
// (e.g. "Al-Rashid", "O'Brien") — digits and other symbols are stripped as the user types.
const sanitizeName = (v) => v.replace(/[^\p{L}\s'-]/gu, '').slice(0, MAX_NAME_LENGTH);

const selectTriggerClass =
  'w-full bg-white border rounded-xl text-sm transition-all cursor-pointer ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15';

function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select',
  hasError = false,
  allowEmpty = true,
  compact = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label || placeholder;
  const borderClass = hasError ? 'border-red-300 ring-2 ring-red-100' : 'border-brand-border';

  return (
    <div ref={ref} className={`relative ${open ? 'z-50' : 'z-0'} ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${selectTriggerClass} flex items-center justify-between gap-2 ${borderClass} ${
          compact ? 'px-3 py-3' : 'px-4 py-3'
        } ${open ? 'border-brand-orange ring-2 ring-brand-orange/15' : ''}`}
      >
        <span
          className={`truncate text-left ${allowEmpty && !value ? 'text-brand-grey' : 'text-brand-dark font-medium'}`}
        >
          {display}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-brand-grey shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-brand-orange' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute top-[calc(100%+6px)] ${compact ? 'left-0 min-w-[148px]' : 'left-0 right-0 min-w-full'}`}
          >
            <ul
              role="listbox"
              className="bg-white border border-brand-border rounded-xl shadow-xl shadow-brand-orange/10 py-1.5 max-h-52 overflow-y-auto overscroll-contain"
            >
              {options.map((opt) => {
                const active = value === opt.value;
                return (
                  <li key={opt.value} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-brand-warm text-brand-orange font-bold'
                          : 'text-brand-dark hover:bg-brand-surface hover:text-brand-orange'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {active && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PhoneNumberField({ region, onRegionChange, local, onLocalChange, hasError, placeholder = '5XXXXXXXX' }) {
  return (
    <div className="flex gap-2">
      <CustomDropdown
        value={region}
        onChange={onRegionChange}
        options={PHONE_REGIONS}
        allowEmpty={false}
        compact
        hasError={hasError}
        className="shrink-0 w-[108px] sm:w-[120px]"
      />
      <input
        type="tel"
        inputMode="numeric"
        className={`${inputClass} flex-1 min-w-0 ${hasError ? 'border-red-300 ring-2 ring-red-100' : ''}`}
        value={local}
        onChange={(e) => onLocalChange(e.target.value.replace(/\D/g, ''))}
        placeholder={placeholder}
        autoComplete="tel-national"
      />
    </div>
  );
}

function DateOfBirthPicker({ day, month, year, onDayChange, onMonthChange, onYearChange, hasError }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 83 }, (_, i) => {
    const y = currentYear - 18 - i;
    return { value: String(y), label: String(y) };
  });
  const maxDay = daysInMonth(month, year);
  const days = Array.from({ length: maxDay }, (_, i) => {
    const d = String(i + 1);
    return { value: d, label: d.padStart(2, '0') };
  });

  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded-xl p-2 border overflow-visible ${
        hasError ? 'border-red-300 bg-red-50/40' : 'border-brand-border bg-brand-surface/50'
      }`}
    >
      <CustomDropdown
        value={month}
        onChange={onMonthChange}
        placeholder="Month"
        options={MONTHS}
        hasError={hasError && !month}
      />
      <CustomDropdown
        value={day}
        onChange={onDayChange}
        placeholder="Day"
        options={days}
        hasError={hasError && !day}
      />
      <CustomDropdown
        value={year}
        onChange={onYearChange}
        placeholder="Year"
        options={years}
        hasError={hasError && !year}
      />
    </div>
  );
}

function ContinueHint({ complete }) {
  if (complete) return null;
  return (
    <p className="text-xs text-brand-grey text-center mt-2 font-medium">
      Please fill in all required fields to continue.
    </p>
  );
}

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                done
                  ? 'bg-brand-orange text-white'
                  : active
                    ? 'bg-brand-orange text-white ring-4 ring-brand-orange/20'
                    : 'bg-brand-surface text-brand-grey border border-brand-border'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : n}
            </div>
            <span
              className={`text-xs font-bold truncate hidden sm:block ${
                active ? 'text-brand-black' : 'text-brand-grey'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 min-w-2 ${done ? 'bg-brand-orange' : 'bg-brand-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function RoleCard({ active, onClick, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
        active
          ? 'border-brand-orange bg-brand-warm shadow-md shadow-brand-orange/10'
          : 'border-brand-border bg-white hover:border-brand-orange/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${
            active ? 'bg-brand-orange text-white' : 'bg-brand-surface text-brand-grey'
          }`}
        >
          <Icon className="w-5 h-5" />
        </span>
        <div>
          <p className="font-black text-brand-black">{title}</p>
          <p className="text-sm text-brand-grey mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}

// Restaurant partnerships are admin-provisioned — this card routes owners to contact us.
function PartnerCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border-2 border-brand-border bg-white hover:border-brand-orange/50 hover:bg-brand-warm/40 transition-all cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0 bg-brand-surface text-brand-grey group-hover:bg-brand-orange group-hover:text-white transition-colors">
          <Store className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-brand-black">Restaurant partner</p>
          <p className="text-sm text-brand-grey mt-0.5 leading-relaxed">
            List your restaurant on Alabiq. Contact us — we&apos;ll create your account after approval.
          </p>
          <p className="text-xs font-bold text-brand-orange mt-2 flex items-center gap-1">
            Contact Alabiq <ArrowRight className="w-3.5 h-3.5" />
          </p>
        </div>
      </div>
    </button>
  );
}

function PartnerContactPanel() {
  const whatsappMsg = encodeURIComponent(
    'Hi Alabiq, I would like to partner my restaurant on your food delivery platform.'
  );
  const whatsappHref = `${COMPANY.whatsappUrl}?text=${whatsappMsg}`;

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="rounded-2xl border border-brand-orange/25 bg-gradient-to-br from-brand-warm to-white p-5">
        <div className="w-12 h-12 rounded-xl bg-brand-orange/15 text-brand-orange flex items-center justify-center mb-3">
          <Store className="w-6 h-6" />
        </div>
        <h3 className="font-black text-brand-black text-lg">Partner with Alabiq</h3>
        <p className="text-sm text-brand-grey mt-2 leading-relaxed">
          Restaurant owner accounts are created by our team after partnership approval. Reach out and
          we&apos;ll guide you through onboarding, set up your account, and link it to your restaurant.
        </p>
        <ol className="mt-4 space-y-2 text-sm text-brand-dark">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
            Contact Alabiq using one of the options below
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
            Our team reviews your restaurant and completes the partnership
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">3</span>
            We create your owner account — then you sign in and manage your menu
          </li>
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-5 rounded-xl text-sm transition-all cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" /> WhatsApp — {COMPANY.whatsappDisplay}
        </a>
        <a
          href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Restaurant partnership inquiry')}`}
          className={btnGhost + ' !py-3'}
        >
          <Mail className="w-4 h-4" /> Email — {COMPANY.email}
        </a>
        <a href={`tel:${COMPANY.phoneTel}`} className={btnGhost + ' !py-3'}>
          <Phone className="w-4 h-4" /> Call — {COMPANY.phoneDisplay}
        </a>
      </div>

      <p className="text-xs text-brand-grey text-center leading-relaxed">
        Support hours: {COMPANY.hours}
      </p>
    </motion.div>
  );
}

export default function SignupPage() {
  const { signUp, session, role: authRole } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  // Already signed in? Send them to their home/dashboard instead of the form.
  useEffect(() => {
    if (session && authRole) navigate(roleHome(authRole, next), { replace: true });
  }, [session, authRole, next, navigate]);

  const [step, setStep] = useState(1);
  const [role, setRole] = useState('passenger');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileRegion, setMobileRegion] = useState('+966');
  const [mobileLocal, setMobileLocal] = useState('');
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(true);
  const [whatsappRegion, setWhatsappRegion] = useState('+966');
  const [whatsappLocal, setWhatsappLocal] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [partnerPanel, setPartnerPanel] = useState(false);
  const [error, setError] = useState(null);
  const [showStepErrors, setShowStepErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const mobile = buildFullPhone(mobileRegion, mobileLocal);
  const effectiveWhatsapp = whatsappSameAsMobile
    ? mobile
    : buildFullPhone(whatsappRegion, whatsappLocal);
  const dateOfBirth = buildDateOfBirth(birthDay, birthMonth, birthYear);

  const step2Complete =
    !getNameError(firstName, 'First name') &&
    !getNameError(lastName, 'Last name') &&
    isValidLocalPhone(mobileLocal) &&
    (whatsappSameAsMobile || isValidLocalPhone(whatsappLocal)) &&
    !!birthDay &&
    !!birthMonth &&
    !!birthYear &&
    !!gender;

  const step3Complete =
    !getEmailError(email) &&
    isPasswordValid(password) &&
    password === confirmPassword &&
    acceptedTerms &&
    (role !== 'driver' ||
      (!!nationalId.trim() && !!vehicleType && !!vehiclePlate.trim()));

  function validateStep(n) {
    if (n === 1) return null;

    if (n === 2) {
      const firstNameError = getNameError(firstName, 'First name');
      if (firstNameError) return firstNameError;
      const lastNameError = getNameError(lastName, 'Last name');
      if (lastNameError) return lastNameError;
      if (!isValidLocalPhone(mobileLocal)) return 'Please enter a valid mobile number.';
      if (!whatsappSameAsMobile && !isValidLocalPhone(whatsappLocal)) {
        return 'Please enter a valid WhatsApp number.';
      }
      if (!dateOfBirth) return 'Please enter your date of birth.';
      if (!gender) return 'Please select your gender.';
      return null;
    }

    if (n === 3) {
      const emailError = getEmailError(email);
      if (emailError) return emailError;
      const passwordError = getPasswordValidationError(password);
      if (passwordError) return passwordError;
      if (password !== confirmPassword) return 'Passwords do not match.';
      if (role === 'driver') {
        if (!nationalId.trim()) return 'Please enter your National ID / Iqama number.';
        if (!vehicleType) return 'Please select your vehicle type.';
        if (!vehiclePlate.trim()) return 'Please enter your vehicle plate number.';
      }
      if (!acceptedTerms) return 'Please accept the Terms of Service and Privacy Policy.';
      return null;
    }

    return null;
  }

  function goNext() {
    setError(null);
    const err = validateStep(step);
    if (err) {
      setShowStepErrors(true);
      return setError(err);
    }
    setShowStepErrors(false);
    setStep((s) => Math.min(s + 1, 3));
  }

  function goBack() {
    setError(null);
    setShowStepErrors(false);
    if (step === 1 && partnerPanel) {
      setPartnerPanel(false);
      return;
    }
    if (step > 1) setStep((s) => s - 1);
    else navigate('/');
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const err = validateStep(3);
    if (err) {
      setShowStepErrors(true);
      return setError(err);
    }
    setShowStepErrors(false);

    setBusy(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { needsConfirmation } = await signUp(email.trim(), password, {
        role,
        full_name: fullName,
        mobile_number: mobile,
        whatsapp_number: effectiveWhatsapp,
        date_of_birth: dateOfBirth,
        gender,
        ...(role === 'driver'
          ? {
              national_id: nationalId.trim(),
              vehicle_type: vehicleType,
              vehicle_plate: vehiclePlate.trim(),
            }
          : {}),
      });
      if (needsConfirmation) {
        setConfirmSent(true);
      } else {
        // Land each new account on its portal (passenger -> /book, driver -> /driver).
        navigate(roleHome(role, next), { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  
  if (Capacitor.isNativePlatform()) {
    if (confirmSent) {
      return (
        <MobileConfirmationSentScreen
          email={email}
          onGoToLogin={() => navigate(`/login?next=${encodeURIComponent(next)}`)}
        />
      );
    }

    return (
      <MobileSignUpScreen
        step={step}
        values={{
          role, firstName, lastName, mobileRegion, mobileLocal,
          whatsappSameAsMobile, whatsappRegion, whatsappLocal,
          birthDay, birthMonth, birthYear, gender,
          email, password, confirmPassword,
          nationalId, vehicleType, vehiclePlate,
          acceptedTerms, partnerPanel,
        }}
        handlers={{
          setRole, setFirstName, setLastName, setMobileRegion, setMobileLocal,
          setWhatsappSameAsMobile, setWhatsappRegion, setWhatsappLocal,
          setBirthDay, setBirthMonth, setBirthYear, setGender,
          setEmail, setPassword, setConfirmPassword,
          setNationalId, setVehicleType, setVehiclePlate,
          setAcceptedTerms, setPartnerPanel,
          goNext, goBack, submit,
        }}
        meta={{ error, busy, showStepErrors, step2Complete, step3Complete }}
        onGoToLogin={() => navigate(`/login?next=${encodeURIComponent(next)}`)}
      />
    );
  }
  
  if (confirmSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-light px-5">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -right-20 w-[280px] h-[280px] rounded-full bg-brand-orange/10 blur-[80px]" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/8 p-8 text-center"
        >
          <MailCheck className="w-12 h-12 text-brand-orange mx-auto mb-4" />
          <h2 className="text-xl font-black text-brand-black">Almost there</h2>
          <p className="text-sm text-brand-grey mt-2 mb-6 leading-relaxed">
            We sent a confirmation link to <span className="font-bold text-brand-dark">{email}</span>.
            Confirm it, then sign in to start using Alabiq.
          </p>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className={btnPrimary + ' w-full'}>
            Go to sign in
          </Link>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex bg-brand-light">
      <div className="hidden lg:flex lg:w-[44%] xl:w-[42%] relative overflow-hidden bg-brand-warm">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-brand-orange/15 blur-[100px]" />
          <div className="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full bg-brand-red/10 blur-[90px]" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <Link to="/" className="flex items-center gap-3 w-fit">
            <img src="/mappia-new-logo.png" alt="Alabiq" className="w-12 h-12 object-contain" />
            <span className="text-xl font-black tracking-tight text-brand-black">
              Smart <span className="text-brand-orange">Mappia</span>
            </span>
          </Link>

          <div>
            <h1 className="text-4xl xl:text-5xl font-black tracking-tight text-brand-black leading-[1.1]">
              Join{' '}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-brand-orange to-brand-red">
                Alabiq
              </span>
            </h1>
            <p className="text-brand-grey text-base leading-relaxed mt-4 max-w-md">
              {partnerPanel
                ? 'Restaurant partnerships are by invitation. Contact our team and we will create your owner account after approval.'
                : role === 'driver'
                  ? 'Register as a driver, submit your details, and get approved to start accepting trips.'
                  : 'Create your user account to book rides, order food, and track deliveries in one app.'}
            </p>

            <ul className="mt-8 space-y-3 text-sm font-semibold text-brand-dark">
              {partnerPanel ? (
                <>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    No self-registration — contact us to get started
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    Partnership review by our team
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    We create your owner account for you
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    Secure account with email verification
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    Personal details for booking &amp; support
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange" />
                    {role === 'driver'
                      ? 'Driver verification before going live'
                      : 'One account for rides & deliveries'}
                  </li>
                </>
              )}
            </ul>
          </div>

          <p className="text-xs text-brand-grey font-medium">
            {partnerPanel ? 'Restaurant partnership' : `Step ${step} of ${STEPS.length} — ${STEPS[step - 1]}`}
          </p>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col min-h-screen">
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 text-sm font-bold text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            {step > 1 ? 'Previous step' : partnerPanel ? 'Back to account types' : 'Back to home'}
          </button>

          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <img src="/mappia-new-logo.png" alt="Alabiq" className="w-9 h-9 object-contain" />
            <span className="font-black tracking-tight text-brand-black text-sm">
              Smart <span className="text-brand-orange">Mappia</span>
            </span>
          </Link>
        </div>

        <div className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-5 py-6 sm:px-8 sm:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[480px]"
          >
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-black text-brand-black tracking-tight">
                {partnerPanel ? 'Restaurant partnership' : 'Create account'}
              </h2>
              <p className="text-brand-grey text-sm mt-1 lg:hidden">
                {partnerPanel
                  ? 'Contact Alabiq — no signup required'
                  : `Step ${step} of ${STEPS.length} — ${STEPS[step - 1]}`}
              </p>
            </div>

            <div className="bg-white border border-brand-border rounded-2xl shadow-xl shadow-brand-orange/8 p-6 sm:p-8 overflow-visible">
              {!partnerPanel && <StepIndicator step={step} />}

              {error && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                  {error}
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key={partnerPanel ? 'partner' : 'step1'}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3"
                  >
                    {partnerPanel ? (
                      <PartnerContactPanel />
                    ) : (
                      <>
                        <p className="text-sm text-brand-grey mb-4">
                          How will you use Alabiq? Choose the account type that fits you.
                        </p>
                        <RoleCard
                          active={role === 'passenger'}
                          onClick={() => setRole('passenger')}
                          icon={User}
                          title="User"
                          description="Book airport transfers, order food, and track your deliveries."
                        />
                        <RoleCard
                          active={role === 'driver'}
                          onClick={() => setRole('driver')}
                          icon={Car}
                          title="Driver"
                          description="Accept ride requests after admin approval. Vehicle details required."
                        />
                        <PartnerCard onClick={() => setPartnerPanel(true)} />
                        <button type="button" onClick={goNext} className={btnPrimary + ' w-full mt-4'}>
                          Continue <ArrowRight className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.form
                    key="step2"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!step2Complete) {
                        setShowStepErrors(true);
                        setError(validateStep(2) || 'Please fill in all required fields to continue.');
                        return;
                      }
                      goNext();
                    }}
                    className="space-y-4"
                  >
                    <p className="text-xs font-bold text-brand-orange uppercase tracking-wider">Personal details</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="First name *">
                        <input
                          className={`${inputClass} ${showStepErrors && getNameError(firstName, 'First name') ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          value={firstName}
                          onChange={(e) => setFirstName(sanitizeName(e.target.value))}
                          placeholder="Ahmed"
                          autoComplete="given-name"
                          maxLength={MAX_NAME_LENGTH}
                        />
                      </Field>
                      <Field label="Last name *">
                        <input
                          className={`${inputClass} ${showStepErrors && getNameError(lastName, 'Last name') ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          value={lastName}
                          onChange={(e) => setLastName(sanitizeName(e.target.value))}
                          placeholder="Al-Rashid"
                          autoComplete="family-name"
                          maxLength={MAX_NAME_LENGTH}
                        />
                      </Field>
                    </div>

                    <Field label="Mobile number *">
                      <PhoneNumberField
                        region={mobileRegion}
                        onRegionChange={setMobileRegion}
                        local={mobileLocal}
                        onLocalChange={setMobileLocal}
                        hasError={showStepErrors && !isValidLocalPhone(mobileLocal)}
                      />
                    </Field>

                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={whatsappSameAsMobile}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setWhatsappSameAsMobile(checked);
                          if (!checked) {
                            setWhatsappRegion(mobileRegion);
                            setWhatsappLocal(mobileLocal);
                          }
                        }}
                        className="w-4 h-4 rounded border-brand-border text-brand-orange focus:ring-brand-orange/30"
                      />
                      <span className="text-sm text-brand-dark font-medium">WhatsApp is the same as mobile number</span>
                    </label>

                    {!whatsappSameAsMobile && (
                      <Field label="WhatsApp number *">
                        <PhoneNumberField
                          region={whatsappRegion}
                          onRegionChange={setWhatsappRegion}
                          local={whatsappLocal}
                          onLocalChange={setWhatsappLocal}
                          hasError={showStepErrors && !isValidLocalPhone(whatsappLocal)}
                        />
                      </Field>
                    )}

                    <Field label="Date of birth *">
                      <DateOfBirthPicker
                        day={birthDay}
                        month={birthMonth}
                        year={birthYear}
                        onDayChange={setBirthDay}
                        onMonthChange={(month) => {
                          setBirthMonth(month);
                          if (birthDay && birthYear) {
                            const max = daysInMonth(month, birthYear);
                            if (Number(birthDay) > max) setBirthDay('');
                          }
                        }}
                        onYearChange={(year) => {
                          setBirthYear(year);
                          if (birthDay && birthMonth) {
                            const max = daysInMonth(birthMonth, year);
                            if (Number(birthDay) > max) setBirthDay('');
                          }
                        }}
                        hasError={showStepErrors && (!birthDay || !birthMonth || !birthYear)}
                      />
                    </Field>

                    <Field label="Gender *">
                      <CustomDropdown
                        value={gender}
                        onChange={setGender}
                        placeholder="Select gender"
                        options={GENDERS}
                        hasError={showStepErrors && !gender}
                      />
                      {showStepErrors && !gender && (
                        <p className="text-xs text-red-600 mt-1.5 font-medium">Please select your gender.</p>
                      )}
                    </Field>

                    <button type="submit" disabled={!step2Complete} className={btnPrimary + ' w-full mt-2'}>
                      Continue <ArrowRight className="w-4 h-4" />
                    </button>
                    <ContinueHint complete={step2Complete} />
                  </motion.form>
                )}

                {step === 3 && (
                  <motion.form
                    key="step3"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.2 }}
                    onSubmit={submit}
                    className="space-y-4"
                  >
                    <p className="text-xs font-bold text-brand-orange uppercase tracking-wider">Account credentials</p>

                    <Field label="Email address *">
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey pointer-events-none" />
                        <input
                          type="email"
                          className={`${inputWithIconClass} ${showStepErrors && getEmailError(email) ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="email"
                          autoComplete="email"
                        />
                      </div>
                    </Field>

                    <PasswordFields
                      password={password}
                      confirmPassword={confirmPassword}
                      onPasswordChange={setPassword}
                      onConfirmPasswordChange={setConfirmPassword}
                      showErrors={showStepErrors}
                    />

                    {role === 'driver' && (
                      <>
                        <p className="text-xs font-bold text-brand-orange uppercase tracking-wider pt-2">
                          Driver information
                        </p>

                        <Field label="National ID / Iqama *">
                          <div className="relative">
                            <IdCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey pointer-events-none" />
                            <input
                              className={`${inputWithIconClass} ${showStepErrors && !nationalId.trim() ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                              value={nationalId}
                              onChange={(e) => setNationalId(e.target.value)}
                              placeholder="10-digit ID number"
                            />
                          </div>
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field label="Vehicle type *">
                            <CustomDropdown
                              value={vehicleType}
                              onChange={setVehicleType}
                              placeholder="Select type"
                              options={VEHICLE_TYPES}
                              hasError={showStepErrors && !vehicleType}
                            />
                          </Field>
                          <Field label="Vehicle plate *">
                            <input
                              className={`${inputClass} ${showStepErrors && !vehiclePlate.trim() ? 'border-red-300 ring-2 ring-red-100' : ''}`}
                              value={vehiclePlate}
                              onChange={(e) => setVehiclePlate(e.target.value)}
                              placeholder="ABC 1234"
                            />
                          </Field>
                        </div>

                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
                          Driver accounts require admin approval before you can accept rides. Make sure your details
                          are accurate — our team will review your application.
                        </p>
                      </>
                    )}

                    <label
                      className={`flex items-start gap-2.5 cursor-pointer select-none pt-1 rounded-xl p-2 -mx-2 ${
                        showStepErrors && !acceptedTerms ? 'bg-red-50/60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded border-brand-border text-brand-orange focus:ring-brand-orange/30"
                      />
                      <span className="text-sm text-brand-grey leading-relaxed">
                        I agree to Alabiq&apos;s{' '}
                        <a href="/#faq" className="text-brand-orange font-bold hover:underline">
                          Terms of Service
                        </a>{' '}
                        and{' '}
                        <a href="/#faq" className="text-brand-orange font-bold hover:underline">
                          Privacy Policy
                        </a>
                        .
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={busy || !step3Complete}
                      className={btnPrimary + ' w-full mt-2'}
                    >
                      {busy ? (
                        <Spinner className="!border-white/40 !border-t-white" />
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Create account
                        </>
                      )}
                    </button>
                    <ContinueHint complete={step3Complete} />
                  </motion.form>
                )}
              </AnimatePresence>

              <p className="text-sm text-brand-grey text-center mt-6">
                Already have an account?{' '}
                <Link
                  to={`/login?next=${encodeURIComponent(next)}`}
                  className="text-brand-orange font-bold hover:underline underline-offset-2"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
