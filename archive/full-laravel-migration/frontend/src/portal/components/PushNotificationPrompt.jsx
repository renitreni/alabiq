import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { useAuth } from '../lib/AuthProvider';
import { syncWebPush, webPushSupported } from '../lib/pushNotifications';
import { playAlert } from '../lib/alertSound';

export default function PushNotificationPrompt() {
  const { user } = useAuth();
  const [state, setState] = useState('hidden');
  const [busy, setBusy] = useState(false);
  const storageKey = user?.id ? `sm_push_prompt_dismissed:${user.id}` : null;

  useEffect(() => {
    if (!user || !webPushSupported()) return;
    if (localStorage.getItem(storageKey) === 'true' && Notification.permission === 'default') {
      return;
    }

    let active = true;
    syncWebPush()
      .then((result) => {
        if (!active) return;
        setState(result.state === 'default' ? 'prompt' : 'hidden');
      })
      .catch(() => {
        if (active) setState('hidden');
      });
    return () => {
      active = false;
    };
  }, [user, storageKey]);

  async function enable() {
    setBusy(true);
    try {
      const result = await syncWebPush({ requestPermission: true });
      if (result.state === 'enabled') {
        playAlert('chime');
        setState('hidden');
      } else if (result.state === 'denied') {
        setState('denied');
      }
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (storageKey) localStorage.setItem(storageKey, 'true');
    setState('hidden');
  }

  if (!user || state === 'hidden') return null;

  return (
    <aside className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:w-96 z-[100] rounded-2xl border border-brand-orange/25 bg-white p-4 shadow-2xl shadow-black/15">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification prompt"
        className="absolute right-3 top-3 p-1 text-brand-grey hover:text-brand-dark cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
          <BellRing className="w-5 h-5" />
        </span>
        <div>
          <p className="font-black text-brand-black">Get phone notifications</p>
          <p className="mt-1 text-sm leading-relaxed text-brand-grey">
            Receive ride and order updates even when Alabiq is in the background.
          </p>
        </div>
      </div>
      {state === 'denied' && (
        <p className="mt-3 text-xs font-medium text-red-600">
          Notifications are blocked. Enable them in your browser or phone site settings.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-3 text-xs font-medium text-red-600">
          Notifications could not be enabled. Please try again.
        </p>
      )}
      {state !== 'denied' && (
        <button
          type="button"
          disabled={busy}
          onClick={enable}
          className="mt-3 w-full rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-black text-white hover:bg-brand-orange/90 disabled:opacity-50 cursor-pointer"
        >
          {busy ? 'Enabling…' : 'Enable notifications'}
        </button>
      )}
    </aside>
  );
}
