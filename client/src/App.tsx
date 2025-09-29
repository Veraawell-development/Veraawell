import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import CareerPage from './pages/CareerPage';
import AboutPage from './pages/AboutPage';
import ServicesPage from './pages/ServicesPage';
import DoctorProfilePage from './pages/DoctorProfilePage';
import ChooseProfessionalPage from './pages/ChooseProfessionalPage';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminForgotPassword from './pages/admin/AdminForgotPassword';
import AdminResetPassword from './pages/admin/AdminResetPassword';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

function AppRoutes() {
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [userRole, setUserRole] = useState<'patient' | 'doctor' | ''>('');
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  // Only trust backend for authentication state on every route change
  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/protected`, { credentials: 'include' })
      .then(res => {
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
      
      // Redirect based on role
      if (role === 'patient') {
        navigate('/patient-dashboard', { state, replace: true });
      } else if (role === 'doctor') {
        // TODO: Create doctor dashboard and redirect there
        navigate('/doctor-dashboard', { state, replace: true });
      } else {
        navigate('/', { state, replace: true });
      }
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
    
    // Redirect based on role
    if (role === 'patient') {
      navigate('/patient-dashboard');
    } else if (role === 'doctor') {
      // TODO: Create doctor dashboard and redirect there
      navigate('/doctor-dashboard');
    } else {
      navigate('/');
    }
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

  // Check if current route is auth-related
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || 
                     location.pathname === '/forgot-password' || location.pathname === '/reset-password' ||
                     location.pathname.startsWith('/admin');

  return (
    <main className="flex-1 flex flex-col bg-black">
      {!isAuthRoute && <Navbar isLoggedIn={authSuccess} onLogout={handleLogout} />}
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              username={showSuccess ? showUser : undefined}
              userRole={showSuccess ? showRole : undefined}
              onLogout={showSuccess ? handleLogout : undefined}
            />
          }
        />
        <Route path="/login" element={<AuthPage mode="login" onSuccess={handleAuthSuccess} />} />
        <Route path="/signup" element={<AuthPage mode="signup" onSuccess={handleAuthSuccess} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/careers" element={<CareerPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/doctor-profile" element={<DoctorProfilePage />} />
        <Route path="/choose-professional" element={<ChooseProfessionalPage />} />
        <Route path="/patient-dashboard" element={<PatientDashboard />} />
        <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
        <Route path="/admin/reset-password/:token" element={<AdminResetPassword />} />
      </Routes>
    </main>
  );
}

function AppWithFooter() {
  const location = useLocation();
  
  // Check if current route is auth-related or dashboard-related
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || 
                     location.pathname === '/forgot-password' || location.pathname === '/reset-password' ||
                     location.pathname.startsWith('/admin') || location.pathname === '/patient-dashboard' ||
                     location.pathname === '/doctor-dashboard';

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <AppRoutes />
      {!isAuthRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppWithFooter />
    </Router>
  );
}
