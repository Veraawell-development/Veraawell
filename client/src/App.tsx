import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

function AppRoutes() {
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [userRole, setUserRole] = useState<'patient' | 'doctor' | ''>('');
  const [loading, setLoading] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Only trust backend for authentication state on every route change
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/protected`, { credentials: 'include' })
      .then(res => {
        setIsBackendConnected(true);
        if (!res.ok) {
          setAuthSuccess(false);
          setAuthUser('');
          setUserRole('');
        } else {
          res.json().then(data => {
            if (data.user && data.user.username) {
              setAuthSuccess(true);
              setAuthUser(data.user.username);
              setUserRole(data.user.role || '');
            } else {
              setAuthSuccess(false);
              setAuthUser('');
              setUserRole('');
            }
          });
        }
      })
      .catch(() => {
        setAuthSuccess(false);
        setAuthUser('');
        setUserRole('');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location]);

  // Check if redirected from Google OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authSuccess = urlParams.get('auth');
    const username = urlParams.get('username');
    const role = urlParams.get('role');
    const isGoogle = urlParams.get('isGoogle');
    
    if (authSuccess === 'success' && username) {
      console.log('Auth success detected');
      console.log('Username from URL:', username);
      console.log('Role from URL:', role);
      console.log('Is Google auth:', isGoogle);
      
      // Clear the URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Set auth state immediately
        setAuthSuccess(true);
        setAuthUser(username);
      setUserRole(role as 'patient' | 'doctor' | '');
      
      // Set state for LandingPage component
      const state = {
        success: true,
        username,
        role,
        isGoogle: isGoogle === 'true'
      };
      
      // Update history state
      window.history.replaceState(state, document.title, window.location.pathname);
      
      // Force a re-render of LandingPage
      navigate('/', { state, replace: true });
    }
  }, [navigate]);

  // Show success message if redirected from login/signup
  let showSuccess = authSuccess;
  let showUser = authUser;
  let showRole = userRole;
  if (location.state && (location.state as any).success && (location.state as any).username) {
    showSuccess = true;
    showUser = (location.state as any).username;
    showRole = (location.state as any).role || '';
    // Clear state after showing once
    window.history.replaceState({}, document.title);
  }

  const handleAuthSuccess = (username: string, role: string) => {
    setAuthSuccess(true);
    setAuthUser(username);
    setUserRole(role as 'patient' | 'doctor' | '');
  };

  const handleLogout = async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setAuthSuccess(false);
    setAuthUser('');
    setUserRole('');
    navigate('/');
  };

  if (loading) return null; // or a spinner

  return (
    <main className="flex-1 flex flex-col bg-black">
      <Navbar isBackendConnected={isBackendConnected} isLoggedIn={authSuccess} onLogout={handleLogout} />
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={() => (window.location.href = '/login')}
              onSignup={() => (window.location.href = '/signup')}
              username={showSuccess ? showUser : undefined}
              userRole={showSuccess ? showRole : undefined}
              onLogout={showSuccess ? handleLogout : undefined}
            />
          }
        />
        <Route path="/login" element={<AuthPage mode="login" onSuccess={handleAuthSuccess} />} />
        <Route path="/signup" element={<AuthPage mode="signup" onSuccess={handleAuthSuccess} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </main>
  );
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-black">
      
        <AppRoutes />
        <Footer />
      </div>
    </Router>
  );
}
