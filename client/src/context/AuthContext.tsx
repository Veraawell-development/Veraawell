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
  const [token, setToken] = useState<string | null>(null); // Removed localStorage - using cookies only
  const [loading, setLoading] = useState<boolean>(false);

  const setAuthToken = useCallback((newToken: string) => {
    // Token is now only stored in HTTP-only cookies by backend
    // We keep it in state for WebSocket auth only (temporary)
    setToken(newToken);
    // NO localStorage storage - security risk
  }, []);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    
    try {
      // Use cookies only - no localStorage or Authorization header needed
      // Backend will read token from HTTP-only cookie
      const res = await fetch(`${API_BASE_URL}/protected`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Fetch profile status (only if authenticated)
        const profileRes = await fetch(`${API_BASE_URL}/profile/status`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
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
        
        // Store token in state only for WebSocket auth (temporary)
        // Token is already in HTTP-only cookie set by backend
        if (data.token) {
          setToken(data.token);
        }
      } else {
        // User not authenticated
        setIsLoggedIn(false);
        setUser(null);
        setToken(null);
      }
    } catch (error) {
      // Network error or server down
      setIsLoggedIn(false);
      setUser(null);
      setToken(null);
      throw error; // Re-throw so OAuth handler can catch it
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setIsLoggedIn(false);
    setUser(null);
    setToken(null);
    // No localStorage to clear - using cookies only
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
