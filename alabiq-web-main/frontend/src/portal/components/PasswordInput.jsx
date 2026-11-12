import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

export const passwordInputClass =
  'w-full bg-white border border-brand-border rounded-xl pl-11 pr-11 py-3 text-brand-dark text-sm ' +
  'focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/15 transition-all';

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  hasError = false,
  required = false,
  className = '',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-grey pointer-events-none" />
      <input
        type={visible ? 'text' : 'password'}
        className={`${passwordInputClass} ${hasError ? 'border-red-300 ring-2 ring-red-100' : ''} ${className}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={hasError ? 'true' : undefined}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-grey hover:text-brand-orange transition-colors cursor-pointer"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
