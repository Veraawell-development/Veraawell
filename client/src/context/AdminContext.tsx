import React, { createContext, useContext, useState, useEffect } from 'react';

interface Admin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'super_admin';
}

interface AdminContextType {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  const checkAuth = async () => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('adminToken');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      
      // Add Authorization header if token exists
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/admin/auth/status`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setAdmin({
          id: data.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role
        });
      } else {
        setAdmin(null);
        localStorage.removeItem('adminToken'); // Clear invalid token
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAdmin(null);
      localStorage.removeItem('adminToken');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    
    // Store token in localStorage for Authorization header
    if (data.token) {
      localStorage.setItem('adminToken', data.token);
      console.log('[ADMIN] Token stored in localStorage');
    }
    
    setAdmin({
      id: data.admin.id,
      email: data.admin.email,
      firstName: data.admin.firstName,
      lastName: data.admin.lastName,
      role: data.admin.role
    });
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      await fetch(`${API_BASE_URL}/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('adminToken'); // Clear token
      setAdmin(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AdminContext.Provider value={{ admin, loading, login, logout, checkAuth }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
