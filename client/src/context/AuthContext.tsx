import React, { createContext, useState, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { API_BASE_URL } from '../config/api';

interface User {
  userId: string;
  username: string;
  role: string;
  firstName: string;
  lastName: string;
  profileCompleted?: boolean;
  emergencyContact?: {
    name: string | null;
    phone: string | null;
  };
}

interface AuthContextType {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  checkAuth: () => Promise<void>;
  logout: () => void;
  setAuthToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null); // Removed localStorage - using cookies only
  const [loading, setLoading] = useState<boolean>(false);

  const setAuthToken = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);

    try {
      // Check if cookies are enabled/blocked (especially for Safari ITP)
      const areCookiesEnabled = navigator.cookieEnabled;
      if (!areCookiesEnabled) {
        console.warn('[Auth] Cookies appear to be disabled in this browser.');
      }

      const storedToken = localStorage.getItem('token');

      // Use cookies and fallback to Authorization header
      const res = await fetch(`${API_BASE_URL}/protected`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();

        // Fetch profile status (only if authenticated)
        const profileRes = await fetch(`${API_BASE_URL}/profile/status`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
          },
        }).catch(() => null); // Catch network errors for profile fetch too

        let profileCompleted = false;
        if (profileRes && profileRes.ok) {
          const profileData = await profileRes.json();
          profileCompleted = profileData.profileCompleted;
        }

        setIsLoggedIn(true);
        setUser({
          ...data.user,
          profileCompleted
        });

        // Store token in state only for WebSocket auth (temporary)
        if (data.token) {
          setToken(data.token);
          localStorage.setItem('token', data.token); // Update localStorage if backend returns a new one
        } else if (storedToken) {
          setToken(storedToken);
        }
      } else {
        // User not authenticated (only clear if explicitly 401/403)
        if (res.status === 401 || res.status === 403) {
          setIsLoggedIn(false);
          setUser(null);
          setToken(null);
          localStorage.removeItem('token'); // Clear if auth explicitly fails
        } else {
          console.warn('[Auth] Server returned non-401 error:', res.status);
          // Keep the token, the server might just be waking up or having an issue
          // Don't log them out automatically
        }
      }
    } catch (error) {
      // Network error or server down (Render free tier sleeps)
      console.error('[Auth] Network error during checkAuth:', error);
      // DO NOT clear localStorage or state here, they might still be valid when server wakes up
      // Optionally could set a "server unreachable" state
      throw error; 
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, token, loading, checkAuth, logout, setAuthToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
