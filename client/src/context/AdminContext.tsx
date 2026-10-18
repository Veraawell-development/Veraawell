import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';
import { SESSION_ENDED_MESSAGE, adminFetch, endsAdminSession, setAdminSessionEndedHandler } from '../utils/adminApi';
import { clearLegacyAdminToken, getAdminToken, setAdminToken } from '../utils/adminToken';

interface Admin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'super_admin';
}

interface LoginResult {
  requiresPasswordChange: boolean;
}

interface AdminContextType {
  admin: Admin | null;
  /** A status check is in flight. */
  loading: boolean;
  /** At least one status check has finished (or a login/logout settled it). */
  checked: boolean;
  /** The last status check couldn't tell either way (offline, 5xx, 429). */
  unreachable: boolean;
  /** Signed in with a password that must be changed before anything else. */
  passwordChangeRequired: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

/**
 * Survives a reload within the tab, so refreshing the page is not a way
 * around a forced password change. The server is the real gate; this only
 * keeps the screen honest about it.
 */
const MUST_CHANGE_KEY = 'veraawell:adminMustChangePassword';
const readMustChange = (): string | null => {
  try { return window.sessionStorage.getItem(MUST_CHANGE_KEY); } catch { return null; }
};
const writeMustChange = (adminId: string | null): void => {
  try {
    if (adminId) window.sessionStorage.setItem(MUST_CHANGE_KEY, adminId);
    else window.sessionStorage.removeItem(MUST_CHANGE_KEY);
  } catch { /* storage blocked */ }
};

const toAdmin = (raw: Record<string, unknown>): Admin => ({
  id: String(raw.id ?? raw._id ?? ''),
  email: String(raw.email ?? ''),
  firstName: String(raw.firstName ?? ''),
  lastName: String(raw.lastName ?? ''),
  role: raw.role === 'super_admin' ? 'super_admin' : 'admin',
});

const bearer = (): HeadersInit => {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const isAdminPath = (pathname: string) =>
  pathname.startsWith('/admin') || pathname.startsWith('/super-admin-dashboard');

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(() => isAdminPath(window.location.pathname));
  const [checked, setChecked] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);

  const adminRef = useRef<Admin | null>(null);
  adminRef.current = admin;
  const inflight = useRef<Promise<void> | null>(null);

  /** Everything one admin's session leaves behind, gone before the next one. */
  const clearSession = useCallback(() => {
    setAdminToken(null);
    writeMustChange(null);
    setPasswordChangeRequired(false);
    setAdmin(null);
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const checkAuth = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    setLoading(true);
    const run = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/admin/auth/status`, {
          credentials: 'include',
          headers: bearer(),
        });
        const data = await response.json().catch(() => null);
        if (response.ok && data) {
          const next = toAdmin((data.admin || data) as Record<string, unknown>);
          setAdmin(next);
          setPasswordChangeRequired(readMustChange() === next.id);
          setUnreachable(false);
        } else if (endsAdminSession(response.status, data?.category)) {
          clearSession();
          setUnreachable(false);
        } else {
          // 5xx, 429 or anything else that isn't an answer about the session:
          // keep whoever is signed in, and let the screen offer a retry
          // rather than throwing the admin out.
          setUnreachable(true);
        }
      } catch {
        setUnreachable(true);
      } finally {
        setLoading(false);
        setChecked(true);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const data = await adminFetch<{ token?: string; admin: Record<string, unknown>; requiresPasswordChange?: boolean }>(
      '/admin/auth/login',
      { method: 'POST', body: { email, password }, sessionAware: false }
    );
    // Nothing cached under the previous admin (a super admin's revenue, say)
    // may render for this one.
    queryClient.removeQueries({ queryKey: ['admin'] });
    setAdminToken(data.token || null);
    const next = toAdmin(data.admin || {});
    const mustChange = data.requiresPasswordChange === true;
    writeMustChange(mustChange ? next.id : null);
    setPasswordChangeRequired(mustChange);
    setAdmin(next);
    setUnreachable(false);
    setChecked(true);
    return { requiresPasswordChange: mustChange };
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      // Clears the httpOnly cookie, which only the server can do.
      await fetch(`${API_BASE_URL}/admin/auth/logout`, { method: 'POST', credentials: 'include', headers: bearer() });
    } catch {
      /* offline: the local session still ends */
    } finally {
      clearSession();
      setChecked(true);
    }
  }, [clearSession]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const data = await adminFetch<{ token?: string }>('/admin/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      // A 401 here is "current password is incorrect", not a lapsed session.
      sessionAware: false,
    });
    // The change retires every token issued before it; the server hands back
    // (and sets as the cookie) a fresh one.
    if (data.token) setAdminToken(data.token);
    writeMustChange(null);
    setPasswordChangeRequired(false);
  }, []);

  // Any admin request answered with "session over" lands here, once.
  useEffect(() => setAdminSessionEndedHandler(() => {
    if (!adminRef.current) return;
    toast.error(SESSION_ENDED_MESSAGE, { id: 'admin-session-ended' });
    void fetch(`${API_BASE_URL}/admin/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    clearSession();
    // AdminProtectedRoute sees no admin and redirects to /admin-login.
  }), [clearSession]);

  useEffect(() => {
    clearLegacyAdminToken();
    // The admin realm is only checked where it matters; AdminProtectedRoute
    // checks on demand when the SPA navigates into the console from elsewhere.
    if (isAdminPath(window.location.pathname)) void checkAuth();
  }, [checkAuth]);

  return (
    <AdminContext.Provider value={{
      admin, loading, checked, unreachable, passwordChangeRequired,
      login, logout, checkAuth, changePassword,
    }}>
      {children}
    </AdminContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
