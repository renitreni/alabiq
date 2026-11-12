const KEY = 'sm_api_session';

export function getSessionToken() {
  return localStorage.getItem(KEY);
}

export function setSessionToken(token) {
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('sm-session-change'));
}

export function onSessionChange(handler) {
  const local = () => handler();
  const storage = (event) => { if (event.key === KEY) handler(); };
  window.addEventListener('sm-session-change', local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('sm-session-change', local);
    window.removeEventListener('storage', storage);
  };
}
