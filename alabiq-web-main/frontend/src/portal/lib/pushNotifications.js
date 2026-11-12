import { api } from './api';

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function webPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker() {
  if (!webPushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
}

export async function currentPushToken() {
  if (!webPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? JSON.stringify(subscription.toJSON()) : null;
}

export async function syncWebPush({ requestPermission = false } = {}) {
  if (!webPushSupported()) return { state: 'unsupported' };

  const config = await api.notificationPushConfig();
  if (!config?.enabled || !config.publicKey) return { state: 'unconfigured' };

  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return { state: permission };

  const registration = await registerServiceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  const token = JSON.stringify(subscription.toJSON());
  await api.registerPushToken({
    token,
    platform: 'web',
    app_version: import.meta.env.VITE_APP_VERSION || null,
  });
  window.dispatchEvent(new Event('alabiq:push-enabled'));
  return { state: 'enabled', token };
}

export async function unregisterCurrentWebPush() {
  try {
    const token = await currentPushToken();
    if (token) await api.unregisterPushToken(token);
  } catch {
    // Signing out must continue even when the push endpoint is unavailable.
  }
}
