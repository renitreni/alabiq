// Country code selector (flag + code + chevron) + phone number field, matching
// the "Create Account" mockup. Kept separate from AuthInput since the left side
// isn't just an icon — it's an interactive dropdown trigger.
import { useRef, useState, useEffect } from 'react';

import { PhoneIcon, ChevronDownIcon } from './icons';

const COUNTRY_CODES = [
  { code: '+966', flag: '🇸🇦', label: 'Saudi Arabia' },
  { code: '+971', flag: '🇦🇪', label: 'UAE' },
  { code: '+20', flag: '🇪🇬', label: 'Egypt' },
  { code: '+1', flag: '🇺🇸', label: 'United States' },
];

export default function PhoneInput({ value, onChange, countryCode, onCountryChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selected = COUNTRY_CODES.find((c) => c.code === countryCode) ?? COUNTRY_CODES[0];

    useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="auth-phone-field" ref={wrapperRef}>
      <button
        type="button"
        className="auth-phone-code"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="auth-phone-flag">{selected.flag}</span>
        <span>{selected.code}</span>
        <ChevronDownIcon className="auth-phone-caret" />
      </button>

      {open && (
        <ul className="auth-phone-dropdown">
          {COUNTRY_CODES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => {
                  onCountryChange(c.code);
                  setOpen(false);
                }}
              >
                <span className="auth-phone-flag">{c.flag}</span> {c.code} · {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="auth-phone-divider" />
      <PhoneIcon className="auth-phone-icon" />
      <input
        type="tel"
        placeholder="Optional"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="auth-phone-input"
      />
    </div>
  );
}