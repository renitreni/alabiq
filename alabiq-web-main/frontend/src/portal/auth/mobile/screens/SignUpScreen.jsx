import AuthMobileLayout from '../AuthMobileLayout';
import AuthInput from '../AuthInput';
import AuthButton from '../AuthButton';
import PhoneInput from '../PhoneInput';
import { UserIcon, MailIcon, LockIcon, EyeIcon, EyeOffIcon } from '../icons';
import { daysInMonth } from '../../authHelpers';
import { getEmailError, getNameError, MAX_NAME_LENGTH } from '../../../lib/fieldValidation';
import { COMPANY } from '../../../../config/company';
import { useState } from 'react';

const STEPS = ['Account type', 'Personal info', 'Create login'];
const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];
const VEHICLE_TYPES = ['sedan', 'suv', 'van', 'motorcycle'];

function StepIndicator({ step }) {
  return (
    <div className="auth-stepper">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={label} className="auth-stepper__item">
            <div className={`auth-stepper__circle ${done ? 'is-done' : active ? 'is-active' : ''}`}>
              {done ? '✓' : n}
            </div>
            <span className="auth-stepper__label">{label}</span>
            {i < STEPS.length - 1 && <div className="auth-stepper__line" />}
          </div>
        );
      })}
    </div>
  );
}

export default function MobileSignUpScreen({ step, values, handlers, meta, onGoToLogin }) {
  const {
    role, firstName, lastName, mobileRegion, mobileLocal,
    whatsappSameAsMobile, whatsappRegion, whatsappLocal,
    birthDay, birthMonth, birthYear, gender,
    email, password, confirmPassword,
    nationalId, vehicleType, vehiclePlate,
    acceptedTerms, partnerPanel,
  } = values;

  const {
    setRole, setFirstName, setLastName, setMobileRegion, setMobileLocal,
    setWhatsappSameAsMobile, setWhatsappRegion, setWhatsappLocal,
    setBirthDay, setBirthMonth, setBirthYear, setGender,
    setEmail, setPassword, setConfirmPassword,
    setNationalId, setVehicleType, setVehiclePlate,
    setAcceptedTerms, goNext, goBack, submit,
  } = handlers;

  const { error, busy, showStepErrors, step2Complete, step3Complete } = meta;

  // NEW
const [showPassword, setShowPassword] = useState(false);
const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 83 }, (_, i) => currentYear - 18 - i);
  const maxDay = daysInMonth(birthMonth, birthYear);
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

if (partnerPanel) {
  const whatsappMsg = encodeURIComponent(
    'Hi Alabiq, I would like to partner my restaurant on your food delivery platform.'
  );
  const whatsappHref = `${COMPANY.whatsappUrl}?text=${whatsappMsg}`;

  return (
    <AuthMobileLayout onBack={goBack}>
      <h1 className="auth-title">Restaurant partnership</h1>
      <p className="auth-subtitle">Contact Alabiq — no signup required</p>
      <div className="auth-partner-card">
        <div className="auth-partner-card__icon">🏬</div>
        <h2 className="auth-partner-card__title">Partner with Alabiq</h2>
        <p className="auth-partner-card__desc">
          Restaurant owner accounts are created by our team after partnership approval. Reach out and
          we'll guide you through onboarding, set up your account, and link it to your restaurant.
        </p>
        <ol className="auth-partner-card__steps">
          <li><span className="auth-partner-card__num">1</span>Contact Alabiq using one of the options below</li>
          <li><span className="auth-partner-card__num">2</span>Our team reviews your restaurant and completes the partnership</li>
          <li><span className="auth-partner-card__num">3</span>We create your owner account — then you sign in and manage your menu</li>
        </ol>
      </div>


<a href={whatsappHref} target="_blank" rel="noreferrer" className="auth-contact-row auth-contact-row--whatsapp">
  <span className="auth-contact-row__icon">💬</span>
  <span className="auth-contact-row__text">
    <span className="auth-contact-row__label">WhatsApp</span>
    <span className="auth-contact-row__value">{COMPANY.whatsappDisplay}</span>
  </span>
</a>

<a href={`mailto:${COMPANY.email}?subject=${encodeURIComponent('Restaurant partnership inquiry')}`} className="auth-contact-row">
  <span className="auth-contact-row__icon">✉️</span>
  <span className="auth-contact-row__text">
    <span className="auth-contact-row__label">Email</span>
    <span className="auth-contact-row__value">{COMPANY.email}</span>
  </span>
</a>

<a href={`tel:${COMPANY.phoneTel}`} className="auth-contact-row">
  <span className="auth-contact-row__icon">📞</span>
  <span className="auth-contact-row__text">
    <span className="auth-contact-row__label">Call</span>
    <span className="auth-contact-row__value">{COMPANY.phoneDisplay}</span>
  </span>
</a>

      <p className="auth-partner-hours">Support hours: {COMPANY.hours}</p>

      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="auth-switch__link" onClick={onGoToLogin}>Sign in</button>
      </p>
    </AuthMobileLayout>
  );
}

  return (
    <AuthMobileLayout onBack={goBack}>
      <h1 className="auth-title">Create Account</h1>
            <p className="auth-subtitle">Join us to get started</p>
      <StepIndicator step={step} />

      {error && <div className="auth-field__error" style={{ marginBottom: 16 }}>{error}</div>}

      {step === 1 && (
        <>
          <p className="auth-subtitle">How will you use Alabiq? Choose the account type that fits you.</p>
          <button
            type="button"
            className={`auth-role-card ${role === 'passenger' ? 'is-active' : ''}`}
            onClick={() => setRole('passenger')}
          >
            <span className="auth-role-card__icon"><UserIcon /></span>
            <span>
              <strong>User</strong>
              <p>Book airport transfers, order food, and track your deliveries.</p>
            </span>
          </button>
          <button
            type="button"
            className={`auth-role-card ${role === 'driver' ? 'is-active' : ''}`}
            onClick={() => setRole('driver')}
          >
            <span className="auth-role-card__icon">🚗</span>
            <span>
              <strong>Driver</strong>
              <p>Accept ride requests after admin approval. Vehicle details required.</p>
            </span>
          </button>
          <button type="button" className="auth-role-card" onClick={() => handlers.setPartnerPanel(true)}>
            <span className="auth-role-card__icon">🏬</span>
            <span>
              <strong>Restaurant partner</strong>
              <p>List your restaurant on Alabiq. Contact us — we'll create your account after approval.</p>
            </span>
          </button>
          <AuthButton type="button" icon={null} onClick={goNext}>Continue</AuthButton>
        </>
      )}

      {step === 2 && (
        <form onSubmit={(e) => { e.preventDefault(); goNext(); }} noValidate>
<div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
  <AuthInput id="firstName" label="First name *" value={firstName} onChange={setFirstName} placeholder="Ahmed" maxLength={MAX_NAME_LENGTH} error={showStepErrors ? getNameError(firstName, 'First name') : null} />
  <AuthInput id="lastName" label="Last name *" value={lastName} onChange={setLastName} placeholder="Al-Rashid" maxLength={MAX_NAME_LENGTH} error={showStepErrors ? getNameError(lastName, 'Last name') : null} />
</div>

          <PhoneInput countryCode={mobileRegion} onCountryChange={setMobileRegion} value={mobileLocal} onChange={setMobileLocal} />

          <label className="auth-checkbox-row">
            <input
              type="checkbox"
              checked={whatsappSameAsMobile}
              onChange={(e) => setWhatsappSameAsMobile(e.target.checked)}
            />
            WhatsApp is the same as mobile number
          </label>

          {!whatsappSameAsMobile && (
            <PhoneInput countryCode={whatsappRegion} onCountryChange={setWhatsappRegion} value={whatsappLocal} onChange={setWhatsappLocal} />
          )}

          <div className="auth-field">
            <label className="auth-field__label">Date of birth *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} className="auth-select">
                <option value="">Month</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i + 1).padStart(2, '0')}>{i + 1}</option>
                ))}
              </select>
              <select value={birthDay} onChange={(e) => setBirthDay(e.target.value)} className="auth-select">
                <option value="">Day</option>
                {days.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="auth-select">
                <option value="">Year</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-field__label">Gender *</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} className="auth-select">
              <option value="">Select gender</option>
              {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>

          <AuthButton type="submit" icon={null} disabled={!step2Complete}>Continue</AuthButton>
          {!step2Complete && <p className="auth-step-hint">Please fill in all required fields to continue.</p>}
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submit} noValidate>
          <AuthInput id="email" label="Email address *" icon={<MailIcon />} type="email" value={email} onChange={setEmail} error={showStepErrors ? getEmailError(email) : null} />
<AuthInput
  id="password"
  label="Password *"
  icon={<LockIcon />}
  type={showPassword ? 'text' : 'password'}
  value={password}
  onChange={setPassword}
  rightAction={{
    icon: showPassword ? <EyeOffIcon /> : <EyeIcon />,
    label: showPassword ? 'Hide password' : 'Show password',
    onClick: () => setShowPassword((v) => !v),
  }}
/>
<AuthInput
  id="confirmPassword"
  label="Confirm password *"
  icon={<LockIcon />}
  type={showConfirmPassword ? 'text' : 'password'}
  value={confirmPassword}
  onChange={setConfirmPassword}
  rightAction={{
    icon: showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />,
    label: showConfirmPassword ? 'Hide password' : 'Show password',
    onClick: () => setShowConfirmPassword((v) => !v),
  }}
/>

          {role === 'driver' && (
            <>
              <AuthInput id="nationalId" label="National ID / Iqama *" value={nationalId} onChange={setNationalId} placeholder="10-digit ID number" />
              <div className="auth-field">
                <label className="auth-field__label">Vehicle type *</label>
                <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="auth-select">
                  <option value="">Select type</option>
                  {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <AuthInput id="vehiclePlate" label="Vehicle plate *" value={vehiclePlate} onChange={setVehiclePlate} placeholder="ABC 1234" />
            </>
          )}

          <label className="auth-checkbox-row">
            <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />
            I agree to the Terms of Service and Privacy Policy.
          </label>

          <AuthButton type="submit" icon={null} disabled={busy || !step3Complete}>
            {busy ? 'Creating account…' : 'Create account'}
          </AuthButton>
          {!step3Complete && !busy && <p className="auth-step-hint">Please fill in all required fields to continue.</p>}
        </form>
      )}

      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="auth-switch__link" onClick={onGoToLogin}>Sign in</button>
      </p>
    </AuthMobileLayout>
  );
}