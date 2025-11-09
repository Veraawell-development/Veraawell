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
  profileCompleted?: boolean;
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
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState<boolean>(false);

  const setAuthToken = useCallback((newToken: string) => {
    console.log('[AUTH] Setting token:', newToken ? 'Token received' : 'No token');
    setToken(newToken);
    localStorage.setItem('token', newToken);
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    console.log('[AUTH] Checking authentication status...');
    
    try {
      const res = await fetch(`${API_BASE_URL}/protected`, {
        credentials: 'include',
      });
      
      console.log('[AUTH] Protected endpoint response:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[AUTH] User authenticated:', data.user?.username);
        
        // Fetch profile status (only if authenticated)
        const profileRes = await fetch(`${API_BASE_URL}/profile/status`, {
          credentials: 'include',
        });
        
        let profileCompleted = false;
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          profileCompleted = profileData.profileCompleted;
        }
        
        setIsLoggedIn(true);
        setUser({
          ...data.user,
          profileCompleted
        });
        
        // Store the token from the response if available
        if (data.token) {
          setToken(data.token);
          localStorage.setItem('token', data.token);
        }
      } else {
        // User not authenticated - this is normal, not an error
        console.log('[AUTH] User not authenticated (status:', res.status + ')');
        setIsLoggedIn(false);
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
      }
    } catch (error) {
      // Network error or server down
      console.error('[AUTH] Error checking auth:', error);
      setIsLoggedIn(false);
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      throw error; // Re-throw so OAuth handler can catch it
    } finally {
      setLoading(false);
    }
  }, [token]);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    localStorage.removeItem('token'); // Changed from 'authToken' to 'token'
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
