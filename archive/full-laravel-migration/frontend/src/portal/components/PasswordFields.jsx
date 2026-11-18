import { Check, X } from 'lucide-react';
import { Field } from './ui';
import PasswordInput from './PasswordInput';
import {
  MIN_PASSWORD_LENGTH,
  hasMinLength,
  hasNumberOrSpecial,
  isPasswordValid,
  getPasswordStrength,
  PASSWORD_STRENGTH_LABELS,
  PASSWORD_STRENGTH_COLORS,
  PASSWORD_STRENGTH_TEXT,
  passwordsMatch,
} from '../lib/passwordValidation';

function RequirementItem({ met, label }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs font-medium ${met ? 'text-green-600' : 'text-brand-grey'}`}>
      {met ? <Check className="w-3.5 h-3.5 shrink-0" /> : <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-brand-border" />}
      {label}
    </li>
  );
}

function PasswordStrengthIndicator({ strength }) {
  if (!strength) return null;

  const segments = ['weak', 'medium', 'strong'];
  const activeIndex = segments.indexOf(strength);

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        {segments.map((level, i) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= activeIndex ? PASSWORD_STRENGTH_COLORS[strength] : 'bg-brand-border'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-bold ${PASSWORD_STRENGTH_TEXT[strength]}`}>
        Password strength: {PASSWORD_STRENGTH_LABELS[strength]}
      </p>
    </div>
  );
}

function PasswordMatchIndicator({ password, confirmPassword }) {
  if (!confirmPassword) return null;

  const match = passwordsMatch(password, confirmPassword);

  return (
    <p
      className={`flex items-center gap-1.5 text-xs font-medium mt-1.5 ${
        match ? 'text-green-600' : 'text-red-600'
      }`}
    >
      {match ? (
        <>
          <Check className="w-3.5 h-3.5 shrink-0" />
          Passwords match
        </>
      ) : (
        <>
          <X className="w-3.5 h-3.5 shrink-0" />
          Passwords do not match
        </>
      )}
    </p>
  );
}

export default function PasswordFields({
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
  showErrors = false,
}) {
  const strength = getPasswordStrength(password);
  const passwordInvalid = password.length > 0 && !isPasswordValid(password);
  const passwordError = showErrors && !isPasswordValid(password);
  const confirmMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const confirmError = showErrors && (confirmMismatch || !confirmPassword);

  return (
    <>
      <Field label="Password *">
        <PasswordInput
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          hasError={passwordError || passwordInvalid}
        />
        <ul className="mt-2 space-y-1">
          <RequirementItem met={hasMinLength(password)} label={`Minimum ${MIN_PASSWORD_LENGTH} characters`} />
          <RequirementItem met={hasNumberOrSpecial(password)} label="At least 1 number or special character" />
        </ul>
        <PasswordStrengthIndicator strength={strength} />
      </Field>

      <Field label="Confirm password *">
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          placeholder="Re-enter your password"
          autoComplete="new-password"
          hasError={confirmError || confirmMismatch}
        />
        <PasswordMatchIndicator password={password} confirmPassword={confirmPassword} />
      </Field>
    </>
  );
}
