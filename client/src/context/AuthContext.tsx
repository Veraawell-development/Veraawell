import React, { createContext, useState, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  const [loading, setLoading] = useState<boolean>(true);

  const queryClient = useQueryClient();

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

      // Use queryClient.fetchQuery to deduplicate concurrent requests and cache the session
      const sessionData = await queryClient.fetchQuery({
        queryKey: ['session'],
        queryFn: async () => {
          const res = await fetch(`${API_BASE_URL}/protected`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}),
            },
          });

          if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
              const error = new Error('Unauthorized');
              (error as any).status = res.status;
              throw error;
            }
            throw new Error(`Server returned non-401 error: ${res.status}`);
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
      });

      setIsLoggedIn(true);
      setUser({
        ...sessionData.user,
        profileCompleted: sessionData.profileCompleted
      });

      // Store token in state only for WebSocket auth (temporary)
      if (sessionData.token) {
        setToken(sessionData.token);
        localStorage.setItem('token', sessionData.token); // Update localStorage if backend returns a new one
      } else if (storedToken) {
        setToken(storedToken);
      }
    } catch (error: any) {
      // User not authenticated (only clear if explicitly 401/403)
      if (error.status === 401 || error.status === 403) {
        setIsLoggedIn(false);
        setUser(null);
        setToken(null);
        localStorage.removeItem('token'); // Clear if auth explicitly fails
      } else {
        console.warn('[Auth] Server returned non-401 error or network error:', error);
        // DO NOT clear localStorage or state here, they might still be valid when server wakes up
      }
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    queryClient.removeQueries({ queryKey: ['session'] });
  }, [queryClient]);

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
