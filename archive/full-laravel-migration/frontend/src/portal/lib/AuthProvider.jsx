// ---------------------------------------------------------------------
// Auth context backed by the Alabiq API. Supabase credentials never
// enter the browser or native webview.
//
// On any sign-in we call POST /api/auth/sync once, which upserts the
// profiles row (role + details) and applies the automatic-admin rule. The
// returned profile (role + driverApproved) is what the UI gates on.
// ---------------------------------------------------------------------
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { getSessionToken, onSessionChange, setSessionToken } from './sessionStore';
import { ensureLocationPermission } from './geo';
import { setDiagnosticsAudience } from './notify';
import { unregisterCurrentWebPush } from './pushNotifications';

const AuthCtx = createContext(null);
const PENDING_KEY = 'sm_pending_profile';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);
  const syncedFor = useRef(null);
  const navigate = useNavigate();

  // Set by signIn() and consumed by the sync effect below, so a login is
  // recorded once per real credential sign-in. It cannot live in the sync
  // effect alone: syncedFor resets on every mount, so that effect also
  // fires on a page refresh and on a restored session, and counting those
  // would make the login log meaningless.
  const pendingLoginRecord = useRef(false);

  async function loadProfile() {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      const pending = raw ? JSON.parse(raw) : {};
      const p = await api.authSync(pending);
      localStorage.removeItem(PENDING_KEY);
      setProfile(p);
      return p;
    } catch (err) {
      setProfile(null);
      setProfileError(err.message || 'Could not load your profile.');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      if (!getSessionToken()) {
        if (mounted) { setSession(null); setLoading(false); }
        return;
      }
      try {
        const data = await api.authSession();
        if (mounted) setSession({ user: data.user });
      } catch {
        setSessionToken(null);
        if (mounted) setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    restore();
    const unsubscribe = onSessionChange(restore);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Sync the profile once per signed-in user.
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid && syncedFor.current !== uid) {
      syncedFor.current = uid;
      loadProfile().then((p) => {
        // Proactively ask for location once, right after sign-in — only for the
        // roles that actually use it (passengers + drivers), never admin/merchant.
        const role = p?.role;
        // Only admins may see diagnostic detail in error popups (notify.js).
        setDiagnosticsAudience(role);
        // After the profile exists, never before: the backend row keys off
        // it. Best-effort — a failure here must not disturb the sign-in.
        if (pendingLoginRecord.current) {
          pendingLoginRecord.current = false;
          api.recordLogin().catch(() => {});
        }
        if (role && role !== 'admin' && role !== 'merchant') ensureLocationPermission();
      });
    } else if (!uid) {
      syncedFor.current = null;
      setProfile(null);
      setDiagnosticsAudience(null); // signed out: back to the safe default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const value = {
    configured: true,
    session,
    user: session?.user || null,
    profile,
    profileLoading,
    profileError,
    role: profile?.role || null,
    // 0043. Absent before the migration is applied, which reads as false —
    // the correct default, and the server enforces it either way.
    isSuperAdmin: !!profile?.isSuperAdmin,
    driverApproved: !!profile?.driverApproved,
    loading,

    async signUp(email, password, details) {
      // Create the account server-side (email pre-confirmed) so there's no
      // confirmation email, then sign in immediately.
      await api.authSignup({ email, password, ...(details || {}) });
      localStorage.setItem(PENDING_KEY, JSON.stringify(details || {}));
      try {
        const data = await api.authLogin({ email, password });
        setSessionToken(data.token);
        setSession({ user: data.user });
      } catch (error) {
        localStorage.removeItem(PENDING_KEY);
        throw error;
      }
      return { needsConfirmation: false };
    },

    async signIn(email, password) {
      const data = await api.authLogin({ email, password });
      // Only past the throws: a failed attempt is not a sign-in, and
      // recording one would put a login in the log that never happened.
      pendingLoginRecord.current = true;
      setSessionToken(data.token);
      setSession({ user: data.user });
    },

    async signOut() {
      await unregisterCurrentWebPush();
      await api.authLogout().catch(() => {});
      setSessionToken(null);
      setSession(null);
      setProfile(null);
      syncedFor.current = null;
      pendingLoginRecord.current = false;
      // Leave any role-protected page so a stale URL can't become ?next=/admin
      // and bounce the next account into the wrong area.
      navigate('/', { replace: true });
    },

    refreshProfile: loadProfile,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
