import { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import PartnerPage from './pages/PartnerPage';
import ResourcesPage from './pages/ResourcesPage';
import BookingPreferencePage from './pages/BookingPreferencePage';
import BookSessionPage from './pages/BookSessionPage';
import ReportsPage from './pages/ReportsPage';
import MentalHealthTestPage from './pages/MentalHealthTestPage';
import VideoCallRoom from './pages/VideoCallRoom';


function AppRoutes() {
  const { isLoggedIn, user, checkAuth } = useAuth();

  // Remove loading screen for faster app initialization
  const location = useLocation();
  const navigate = useNavigate();

  // Check auth on initial mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // If the user lands on the site with auth success params from Google OAuth,
    // we trigger a re-check of authentication status.
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.has('auth') && urlParams.get('auth') === 'success') {
      checkAuth().then(() => {
        // Clean the URL after checking auth
        navigate(location.pathname, { replace: true });
      });
    }
  }, [location, checkAuth, navigate]);

  // Redirect authenticated users from landing page and auth pages to their dashboards
  useEffect(() => {
    if (isLoggedIn && user) {
      const { role } = user;
      const isLandingPage = location.pathname === '/';
      const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';
      
      if (isLandingPage || isAuthPage) {
        if (role === 'patient') {
          navigate('/patient-dashboard', { replace: true });
        } else if (role === 'doctor') {
          navigate('/doctor-dashboard', { replace: true });
        } else if (['admin', 'super_admin'].includes(role)) {
          navigate('/admin/dashboard', { replace: true });
        }
      }
    }
  }, [isLoggedIn, user, location.pathname, navigate]);

  const handleAuthSuccess = async () => {
    await checkAuth();
  };

  // Check if current route is auth-related or video call
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || 
                     location.pathname === '/forgot-password' || location.pathname === '/reset-password' ||
                     location.pathname.startsWith('/admin');
  const isVideoCallRoute = location.pathname.startsWith('/video-call');

  return (
    <main className="flex-1 flex flex-col bg-black">
      {!isAuthRoute && !isVideoCallRoute && <Navbar />}
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
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
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/booking-preference" element={<BookingPreferencePage />} />
        <Route path="/book-session/:doctorId" element={<BookSessionPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/mental-health-test" element={<MentalHealthTestPage />} />
        <Route path="/video-call/:sessionId" element={<VideoCallRoom />} />
      </Routes>
    </main>
  );
}

function AppWithFooter() {
  const location = useLocation();
  
  // Check if current route is auth-related, dashboard-related, or video call
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' || 
                     location.pathname === '/forgot-password' || location.pathname === '/reset-password' ||
                     location.pathname.startsWith('/admin') || location.pathname === '/patient-dashboard' ||
                     location.pathname === '/doctor-dashboard';
  const isVideoCallRoute = location.pathname.startsWith('/video-call');

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <AppRoutes />
      {!isAuthRoute && !isVideoCallRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppWithFooter />
      </AuthProvider>
    </Router>
  );
}
