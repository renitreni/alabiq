// ---------------------------------------------------------------------
// The alert-sound control, in every portal header.
//
// Two jobs, and only the second one used to exist:
//
//   1. BLOCKED state. Browsers start an AudioContext suspended and refuse
//      to run it until the user interacts — the worst kind of bug, because
//      nothing on screen says the feature is off. The amber chip appears
//      only while sound is genuinely blocked and plays once on click so the
//      user hears proof rather than trusting a label.
//
//   2. MUTE AND LEVEL. This became non-optional once new-order alerts
//      started repeating until acknowledged: an alert you cannot turn down
//      is an alert people will fix by muting the whole device.
//
// The global unlock listener that used to live here moved to
// installAlertUnlock() in alertSound.js, called once from main.jsx. Mounting
// this component is no longer what makes sound work anywhere — it only
// reflects and controls.
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import {
  isAlertBlocked,
  unlockAlerts,
  playAlert,
  getSoundPrefs,
  setSoundPrefs,
  subscribeSoundPrefs,
} from '../lib/alertSound';

export default function SoundToggle() {
  const [blocked, setBlocked] = useState(false);
  const [prefs, setPrefs] = useState(getSoundPrefs);
  const [open, setOpen] = useState(false);
  const popover = useRef(null);

  useEffect(() => {
    const sync = () => setBlocked(isAlertBlocked());
    sync();
    // Poll slowly: the context can be re-suspended after a tab is
    // backgrounded for a long time, and nothing else would notice.
    const t = setInterval(sync, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => subscribeSoundPrefs(setPrefs), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (popover.current && !popover.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (blocked) {
    return (
      <button
        type="button"
        onClick={() => {
          unlockAlerts().then(() => {
            playAlert('order');
            setBlocked(isAlertBlocked());
          });
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 transition-colors cursor-pointer"
        aria-label="Enable sound. Your browser is blocking it until you interact with the page."
        title="Your browser is blocking sound until you interact with the page"
      >
        <VolumeX className="w-3.5 h-3.5" /> Enable sound
      </button>
    );
  }

  const Icon = prefs.muted ? VolumeX : prefs.volume <= 0.4 ? Volume1 : Volume2;

  return (
    <div className="relative" ref={popover}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Sound settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={prefs.muted ? 'Sound is off' : 'Sound settings'}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border transition-colors cursor-pointer ${
          prefs.muted
            ? 'bg-amber-50 border-amber-300 text-amber-700'
            : 'bg-white border-brand-border text-brand-grey hover:text-brand-dark'
        }`}
      >
        <Icon className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 p-4 rounded-xl bg-white border border-brand-border shadow-xl z-50 space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm font-bold text-brand-dark cursor-pointer">
            Mute alerts
            <input
              type="checkbox"
              checked={prefs.muted}
              onChange={(e) => setSoundPrefs({ muted: e.target.checked })}
              className="w-4 h-4 accent-brand-orange cursor-pointer"
            />
          </label>

          <div className="space-y-1">
            <p className="text-xs font-bold text-brand-grey uppercase tracking-wide">Volume</p>
            {/* Floor is above zero on purpose: a slider dragged to nothing
                would silently disable a business-critical alert with no
                indicator. Muting is the explicit switch above. */}
            <input
              type="range"
              aria-label="Alert volume"
              aria-valuetext={`${Math.round(prefs.volume * 100)} percent`}
              min="0.15"
              max="1"
              step="0.05"
              value={prefs.volume}
              disabled={prefs.muted}
              onChange={(e) => setSoundPrefs({ volume: Number(e.target.value) })}
              className="w-full accent-brand-orange cursor-pointer disabled:opacity-40"
            />
          </div>

          <button
            type="button"
            onClick={() => playAlert('order')}
            disabled={prefs.muted}
            className="w-full py-2 rounded-xl border border-brand-border text-xs font-bold text-brand-dark hover:bg-brand-surface transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Test sound
          </button>

          {prefs.muted && (
            <p className="text-[11px] text-amber-700 font-bold">
              New orders will not ring while muted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
