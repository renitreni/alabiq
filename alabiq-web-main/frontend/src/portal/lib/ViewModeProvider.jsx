// ---------------------------------------------------------------------
// Admin "preview as" view mode (frontend-only).
//
// Lets a signed-in ADMIN render the user (/book) or driver (/driver) portal
// WITHOUT changing their API session — they stay authenticated as
// admin the whole time. The chosen preview role is kept in React state +
// sessionStorage so a page refresh keeps the preview. This is NOT a backend
// session concept; backend access still rides on the admin's real JWT.
// ---------------------------------------------------------------------
import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';

const ViewModeCtx = createContext(null);
const PREVIEW_KEY = 'sm_admin_preview';
const VALID = ['passenger', 'driver'];

function readStored() {
  try {
    const v = sessionStorage.getItem(PREVIEW_KEY);
    return VALID.includes(v) ? v : null;
  } catch {
    return null;
  }
}

export function ViewModeProvider({ children }) {
  const { session, role } = useAuth();
  const [previewRole, setPreviewRoleState] = useState(readStored);

  function setPreviewRole(next) {
    const value = VALID.includes(next) ? next : null;
    setPreviewRoleState(value);
    try {
      if (value) sessionStorage.setItem(PREVIEW_KEY, value);
      else sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* sessionStorage unavailable — keep in-memory only */
    }
  }

  // Preview is an admin-only affordance: drop it if the user signs out or the
  // resolved role is anything other than admin.
  useEffect(() => {
    if (previewRole && (!session || role !== 'admin')) {
      setPreviewRole(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role]);

  const value = {
    // Only honor the preview when the real role is admin.
    previewRole: role === 'admin' ? previewRole : null,
    setPreviewRole,
  };

  return <ViewModeCtx.Provider value={value}>{children}</ViewModeCtx.Provider>;
}

export function useViewMode() {
  const ctx = useContext(ViewModeCtx);
  if (!ctx) throw new Error('useViewMode must be used within <ViewModeProvider>');
  return ctx;
}
