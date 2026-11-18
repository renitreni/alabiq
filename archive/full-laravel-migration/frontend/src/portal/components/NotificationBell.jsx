// ---------------------------------------------------------------------
// The in-app notification bell shown in the portal header.
//   - unread badge (driven by a "last seen" timestamp)
//   - dropdown inbox of the latest alerts, live-updating via Realtime
//   - each item deep-links to the relevant tracking / history screen
// ---------------------------------------------------------------------
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Wifi } from 'lucide-react';
import { useNotifications } from '../lib/useNotifications';
import { notificationMeta, relativeTime } from '../lib/notifications';
import { TONE_CLASSES } from '../lib/constants';

function NotificationRow({ item, isUnread, onClick }) {
  const meta = notificationMeta(item.type, item.code);
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-brand-surface transition-colors cursor-pointer ${
        isUnread ? 'bg-brand-orange/5' : ''
      }`}
    >
      <span
        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${
          TONE_CLASSES[meta.tone] || TONE_CLASSES.grey
        }`}
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold text-brand-dark truncate">{meta.title}</span>
          {isUnread && <span className="w-2 h-2 rounded-full bg-brand-orange shrink-0" />}
        </span>
        {meta.body && <span className="block text-xs text-brand-grey leading-snug mt-0.5">{meta.body}</span>}
        <span className="block text-[11px] text-brand-grey/80 mt-1">
          {relativeTime(item.created_at || item.sent_at)}
        </span>
      </span>
    </button>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { items, unreadCount, connected, markAllRead, seenAt } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markAllRead();
  }

  function openItem(item) {
    setOpen(false);
    const meta = notificationMeta(item.type, item.code);
    navigate(meta.href);
  }

  const isUnread = (item) => {
    if (item.read_at !== undefined) return !item.read_at;
    const at = item.created_at || item.sent_at;
    if (!seenAt) return true;
    return at && new Date(at) > new Date(seenAt);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        title="Notifications"
        aria-label="Notifications"
        className="relative p-2 rounded-lg hover:bg-brand-surface cursor-pointer text-brand-grey"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-orange text-white text-[10px] font-black flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,22rem)] bg-white rounded-2xl shadow-xl border border-brand-border overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <span className="font-black text-brand-black">Notifications</span>
              {connected && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-wider">
                  <Wifi className="w-3 h-3" /> Live
                </span>
              )}
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-bold text-brand-orange flex items-center gap-1 cursor-pointer hover:opacity-80"
              >
                <Check className="w-3.5 h-3.5" /> Mark read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto divide-y divide-brand-border">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 text-brand-grey/30 mx-auto mb-2" />
                <p className="text-sm font-bold text-brand-dark">You're all caught up</p>
                <p className="text-xs text-brand-grey mt-0.5">Updates about your trips and orders show up here.</p>
              </div>
            ) : (
              items.slice(0, 12).map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  isUnread={isUnread(item)}
                  onClick={() => openItem(item)}
                />
              ))
            )}
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
              className="w-full text-center py-3 text-sm font-bold text-brand-orange hover:bg-brand-surface border-t border-brand-border cursor-pointer"
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
