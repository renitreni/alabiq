import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ESSENTIAL_STORAGE,
  PREFERENCE_STORAGE,
  clearPreferenceStorage,
} from '../../portal/lib/deviceStorage';
import LegalLayout from './LegalLayout';

function StorageList({ items }) {
  return (
    <ul className="divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
      {items.map(({ key, label, purpose }) => (
        <li key={key} className="px-4 py-3">
          <p className="font-bold text-brand-black">{label}</p>
          <p>{purpose}</p>
        </li>
      ))}
    </ul>
  );
}

export default function CookiePreferencesPage() {
  const [cleared, setCleared] = useState(false);

  const clear = () => {
    try {
      clearPreferenceStorage();
    } catch {
      // storage blocked by the browser, so nothing was stored to clear
    }
    setCleared(true);
  };

  return (
    <LegalLayout title="Cookie Preferences">
      <div className="space-y-6 text-sm leading-relaxed text-brand-grey">
        <p>
          Alabiq does not use cookies to sign you in, and does not use advertising or
          analytics cookies. Instead, the website and app keep a small amount of data in your
          browser storage on this device. This page lists all of it.
        </p>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">Strictly necessary</h2>
          <p>These are needed for the service to work and cannot be switched off here.</p>
          <StorageList items={ESSENTIAL_STORAGE} />
        </section>

        <section className="space-y-2">
          <h2 className="font-black text-brand-black">Preferences</h2>
          <p>
            These remember choices you made. Clearing them does not sign you out; the app will
            simply ask again or start from its defaults.
          </p>
          <StorageList items={PREFERENCE_STORAGE} />
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={clear}
              className="rounded-full bg-brand-orange px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              Clear my preferences on this device
            </button>
            {cleared && <span role="status">Your preferences were cleared.</span>}
          </div>
        </section>

        <p>
          To remove everything, sign out and clear site data in your browser settings. For how we
          handle your personal data, see our{' '}
          <Link to="/privacy-policy" className="underline hover:text-brand-orange">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </LegalLayout>
  );
}
