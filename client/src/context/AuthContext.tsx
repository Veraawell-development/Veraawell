import React, { createContext, useState, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

interface User {
  userId: string;
  username: string;
  role: string;
  firstName: string;
  lastName: string;
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
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState<boolean>(false);

  const setAuthToken = useCallback((newToken: string) => {
    console.log('[AUTH] Setting token:', newToken ? 'Token received' : 'No token');
    setToken(newToken);
    localStorage.setItem('authToken', newToken);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/protected`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setIsLoggedIn(true);
        setUser(data.user);
        
        // Store the token from the response if available
        if (data.token) {
          console.log('[AUTH] Token received from server, storing in localStorage');
          setToken(data.token);
          localStorage.setItem('authToken', data.token);
        } else if (!token) {
          console.log('[AUTH] ⚠️ No token in response or localStorage');
        }
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setToken(null);
        localStorage.removeItem('authToken');
      }
    } catch (error) {
      setIsLoggedIn(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
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
