import React, { createContext, useState, useContext, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { getAuthToken, setAuthTokenInMemory } from '../utils/authToken';
import { invalidateCsrfToken } from '../utils/csrfToken';
import { fetchWithRetry } from '../utils/backendWakeup';

interface User {
  userId: string;
  username: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  profileCompleted?: boolean;
  emergencyContact?: {
    name: string | null;
    phone: string | null;
    relationship: string | null;
  };
}

interface CheckAuthOptions {
  /**
   * Bypass the cached ['session'] entry and ask the server again — for after
   * something the session payload carries (the emergency contact, profile
   * status) has changed. Without it a check inside the 5-minute staleTime
   * returns the cached user unchanged.
   */
  force?: boolean;
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  /**
   * True when the last auth check could not reach the server at all (network
   * error / 5xx after retries) — as opposed to the server saying "not logged
   * in". ProtectedRoute uses it to offer a retry instead of bouncing a
   * possibly-logged-in user to the login page.
   */
  serverUnreachable: boolean;
  checkAuth: (options?: CheckAuthOptions) => Promise<void>;
  logout: () => Promise<void>;
  setAuthToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Attempts for /protected while the API is unreachable. The API runs on a
 * host that sleeps when idle; the first request after that gets a network
 * error or a 502/503 for up to a minute while it boots. With 6 attempts and
 * a 1s initial delay the backoff (1, 2, 4, 8, 16s) covers ~31s of waiting on
 * top of each attempt's own time.
 */
const AUTH_CHECK_ATTEMPTS = 6;
const AUTH_CHECK_INITIAL_DELAY_MS = 1000;

class AuthCheckError extends Error {
  status?: number;
  /** The server said this session is not valid — clear it. */
  loggedOut: boolean;

  constructor(message: string, loggedOut: boolean, status?: number) {
    super(message);
    this.loggedOut = loggedOut;
    this.status = status;
  }
}

async function readCategory(res: Response): Promise<string | undefined> {
  try {
    const data = await res.clone().json();
    return typeof data?.category === 'string' ? data.category : undefined;
  } catch {
    return undefined;
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  // The session is authenticated primarily via the httpOnly cookie the
  // backend sets on login — this token is only an in-memory fallback (see
  // utils/authToken.ts for why it's not persisted to localStorage).
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [serverUnreachable, setServerUnreachable] = useState<boolean>(false);

  // Read inside checkAuth without making it depend on (and be recreated by)
  // isLoggedIn — several effects list checkAuth as a dependency.
  const isLoggedInRef = useRef(false);

  const queryClient = useQueryClient();

  const setAuthToken = useCallback((newToken: string) => {
    setToken(newToken);
    setAuthTokenInMemory(newToken);
  }, []);

  const clearLocalSession = useCallback(() => {
    isLoggedInRef.current = false;
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    setAuthTokenInMemory(null);
  }, []);

  const checkAuth = useCallback(async (options?: CheckAuthOptions) => {
    // Only show the blocking loading state while auth is genuinely unknown.
    // A re-check for an already-logged-in user (after saving the emergency
    // contact, say) must not flip `loading`: ProtectedRoute renders a
    // LoadingScreen in its place, which would unmount the page — including a
    // live video call — and DataSocketProvider would tear down the socket.
    const blocking = !isLoggedInRef.current;
    if (blocking) setLoading(true);

    try {
      // Check if cookies are enabled/blocked (especially for Safari ITP)
      const areCookiesEnabled = navigator.cookieEnabled;
      if (!areCookiesEnabled) {
        console.warn('[Auth] Cookies appear to be disabled in this browser.');
      }

      const storedToken = getAuthToken();

      if (options?.force) {
        await queryClient.invalidateQueries({ queryKey: ['session'], refetchType: 'none' });
      }

      // Use queryClient.fetchQuery to deduplicate concurrent requests and cache the session
      const sessionData = await queryClient.fetchQuery({
        queryKey: ['session'],
        queryFn: async () => {
          let res: Response;
          try {
            // Retries network errors and 5xx with exponential backoff; any
            // 4xx comes straight back. See AUTH_CHECK_ATTEMPTS.
            res = await fetchWithRetry(`${API_BASE_URL}/protected`, {
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
              },
            }, AUTH_CHECK_ATTEMPTS, AUTH_CHECK_INITIAL_DELAY_MS);
          } catch (err) {
            throw new AuthCheckError(`Auth check could not reach the server: ${(err as Error)?.message}`, false);
          }

          if (!res.ok) {
            // Only a definite "this session is not valid" logs the user out:
            // a 401, or a 403 the server tags as an authentication failure.
            // A 5xx that outlived the retries, or an authorization 403, is
            // not proof the user is logged out.
            const loggedOut = res.status === 401
              || (res.status === 403 && (await readCategory(res)) === 'authentication');
            throw new AuthCheckError(`Auth check failed: ${res.status}`, loggedOut, res.status);
          }

          const data = await res.json();

          // Fetch profile status (only if authenticated)
          let profileCompleted = false;
          try {
            const profileRes = await fetch(`${API_BASE_URL}/profile/status`, {
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
              },
            });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              profileCompleted = profileData.profileCompleted;
            }
          } catch (err) {
            console.warn('[Auth] Failed to fetch profile status', err);
          }

          return { ...data, profileCompleted };
        },
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
        // The queryFn does its own backoff for the cases worth retrying; the
        // app-wide `retry: 1` default would also re-send a definite 401.
        retry: false,
      });

      isLoggedInRef.current = true;
      setIsLoggedIn(true);
      setServerUnreachable(false);
      setUser({
        ...sessionData.user,
        profileCompleted: sessionData.profileCompleted
      });

      // Keep the in-memory token in sync — used as a fallback for Socket.IO
      // handshakes and the rare cookie-blocked (Safari ITP) case.
      if (sessionData.token) {
        setToken(sessionData.token);
        setAuthTokenInMemory(sessionData.token);
      } else if (storedToken) {
        setToken(storedToken);
      }
    } catch (error: unknown) {
      if (error instanceof AuthCheckError && error.loggedOut) {
        setServerUnreachable(false);
        clearLocalSession();
      } else {
        const unreachable = !(error instanceof AuthCheckError) || error.status === undefined || error.status >= 500;
        setServerUnreachable(unreachable);
        console.warn('[Auth] Auth check did not complete:', error);
        // DO NOT clear the in-memory token or state here — they might still
        // be valid once the server is reachable again.
      }
    } finally {
      if (blocking) setLoading(false);
    }
  }, [queryClient, clearLocalSession]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      // Still log out locally: a failed request must not leave the previous
      // user's data on screen. The httpOnly cookie expires on its own.
      console.warn('[Auth] Logout request failed; clearing the local session anyway', err);
    } finally {
      clearLocalSession();
      setServerUnreachable(false);
      invalidateCsrfToken();
      // Not just ['session']: plenty of cached queries are keyed without a
      // user id (unread count, pending feedback, mood, emergency contact,
      // previous doctors…) and would otherwise be shown to the next account
      // that logs in in this tab.
      queryClient.clear();
    }
  }, [queryClient, clearLocalSession]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, token, loading, serverUnreachable, checkAuth, logout, setAuthToken }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
