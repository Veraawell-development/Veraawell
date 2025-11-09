import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminProvider } from './context/AdminContext';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LoadingScreen from './components/LoadingScreen';
import { wakeUpBackend } from './utils/backendWakeup';
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
import OldAdminDashboard from './pages/admin/AdminDashboard';
import AdminForgotPassword from './pages/admin/AdminForgotPassword';
import AdminResetPassword from './pages/admin/AdminResetPassword';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminSignupPage from './pages/AdminSignupPage';
import AdminDashboard from './pages/AdminDashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import PartnerPage from './pages/PartnerPage';
import ResourcesPage from './pages/ResourcesPage';
import BookSessionPage from './pages/BookSessionPage';
import ReportsPage from './pages/ReportsPage';
import MentalHealthTestPage from './pages/MentalHealthTestPage';
import VideoCallRoom from './pages/VideoCallRoom';
import CallHistoryPage from './pages/CallHistoryPage';
import PendingTasksPage from './pages/PendingTasksPage';
import MyJournalPage from './pages/MyJournalPage';
import ReportsRecommendationPage from './pages/ReportsRecommendationPage';
import PatientDetailsPage from './pages/PatientDetailsPage';
import DoctorReportsPage from './pages/DoctorReportsPage';
import DoctorReportsDetailPage from './pages/DoctorReportsDetailPage';
import DoctorTasksPage from './pages/DoctorTasksPage';
import DoctorTasksDetailPage from './pages/DoctorTasksDetailPage';
import DoctorSessionNotesPage from './pages/DoctorSessionNotesPage';
import DoctorSessionNotesDetailPage from './pages/DoctorSessionNotesDetailPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import ManageCalendar from './pages/ManageCalendar';
import MessagesPage from './pages/MessagesPage';


function AppRoutes() {
  const { isLoggedIn, user, checkAuth } = useAuth();
  const [isAppReady, setIsAppReady] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Initialize app on first load only
  useEffect(() => {
    const hasLoadedBefore = sessionStorage.getItem('appInitialized');
    
    // If already loaded in this session, skip loader
    if (hasLoadedBefore) {
      setIsAppReady(true);
      // Check auth silently in background (don't block UI)
      checkAuth().catch((error) => {
        console.log('[App] Auth check failed on reload:', error?.message || 'Unknown error');
      });
      return;
    }

    const initializeApp = async () => {
      try {
        // Wake up backend (don't wait for it)
        wakeUpBackend().catch(() => {
          console.log('Backend wakeup failed, continuing anyway');
        });
        
        // Wait for DOM to be fully ready
        const waitForLoad = () => {
          return new Promise<void>((resolve) => {
            if (document.readyState === 'complete') {
              resolve();
            } else {
              window.addEventListener('load', () => resolve());
            }
          });
        };
        
        await waitForLoad();
        
        // Try to check auth silently (don't fail if not logged in)
        checkAuth().catch((error) => {
          console.log('[App] Auth check failed on first load:', error?.message || 'User not logged in');
        });
        
        // Mark as initialized
        sessionStorage.setItem('appInitialized', 'true');
        setIsAppReady(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Continue anyway
        sessionStorage.setItem('appInitialized', 'true');
        setIsAppReady(true);
      }
    };
    
    initializeApp();
  }, [checkAuth]);

  useEffect(() => {
    // If the user lands on the site with auth success params from Google OAuth,
    // we trigger a re-check of authentication status.
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.has('auth') && urlParams.get('auth') === 'success') {
      console.log('[OAuth] Auth success detected, processing authentication...');
      
      // Get token and role from URL
      const tokenFromUrl = urlParams.get('token');
      const roleFromUrl = urlParams.get('role');
      
      if (tokenFromUrl) {
        console.log('[OAuth] Token found in URL, storing in localStorage');
        localStorage.setItem('token', tokenFromUrl);
        
        // Also set in cookie for consistency
        document.cookie = `token=${tokenFromUrl}; path=/; max-age=${30 * 24 * 60 * 60}; ${
          window.location.protocol === 'https:' ? 'secure; samesite=none' : 'samesite=lax'
        }`;
      }
      
      // Retry auth check with exponential backoff
      const retryAuthCheck = async (attempt = 1, maxAttempts = 3) => {
        try {
          console.log(`[OAuth] Auth check attempt ${attempt}/${maxAttempts}`);
          await checkAuth();
          console.log('[OAuth] Auth check completed successfully');
          
          // Redirect to appropriate dashboard based on role
          if (roleFromUrl === 'patient') {
            console.log('[OAuth] Redirecting to patient dashboard');
            navigate('/patient-dashboard', { replace: true });
          } else if (roleFromUrl === 'doctor') {
            console.log('[OAuth] Redirecting to doctor dashboard');
            navigate('/doctor-dashboard', { replace: true });
          } else {
            // Fallback: clean URL and let the redirect effect handle it
            navigate('/', { replace: true });
          }
        } catch (error) {
          console.error(`[OAuth] Auth check attempt ${attempt} failed:`, error);
          
          if (attempt < maxAttempts) {
            // Wait before retrying (exponential backoff: 500ms, 1000ms, 2000ms)
            const delay = 500 * Math.pow(2, attempt - 1);
            console.log(`[OAuth] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryAuthCheck(attempt + 1, maxAttempts);
          } else {
            console.error('[OAuth] All auth check attempts failed');
            // Clean the URL even if all attempts fail
            navigate('/', { replace: true });
          }
        }
      };
      
      retryAuthCheck();
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

  // Show loading screen only on first load
  if (!isAppReady) {
    return <LoadingScreen />;
  }

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
        <Route path="/doctor/:doctorId" element={<DoctorProfilePage />} />
        <Route path="/choose-professional" element={<ChooseProfessionalPage />} />
        <Route path="/patient-dashboard" element={<PatientDashboard />} />
        <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
        <Route path="/manage-calendar" element={<ManageCalendar />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<OldAdminDashboard />} />
        <Route path="/admin/forgot-password" element={<AdminForgotPassword />} />
        <Route path="/admin/reset-password/:token" element={<AdminResetPassword />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/super-admin-dashboard" element={<SuperAdminDashboard />} />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/book-session/:doctorId" element={<BookSessionPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/mental-health-test" element={<MentalHealthTestPage />} />
        <Route path="/video-call/:sessionId" element={<VideoCallRoom />} />
        <Route path="/call-history" element={<CallHistoryPage />} />
        <Route path="/pending-tasks" element={<PendingTasksPage />} />
        <Route path="/my-journal" element={<MyJournalPage />} />
        <Route path="/reports-recommendation" element={<ReportsRecommendationPage />} />
        <Route path="/patient-details" element={<PatientDetailsPage />} />
        <Route path="/doctor-reports" element={<DoctorReportsPage />} />
        <Route path="/doctor-reports/:patientId" element={<DoctorReportsDetailPage />} />
        <Route path="/doctor-tasks" element={<DoctorTasksPage />} />
        <Route path="/doctor-tasks/:patientId" element={<DoctorTasksDetailPage />} />
        <Route path="/doctor-session-notes" element={<DoctorSessionNotesPage />} />
        <Route path="/doctor-session-notes/:patientId" element={<DoctorSessionNotesDetailPage />} />
        <Route path="/profile-setup" element={<ProfileSetupPage />} />
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
                     location.pathname === '/doctor-dashboard' || location.pathname === '/call-history' ||
                     location.pathname === '/pending-tasks' || location.pathname === '/my-journal' ||
                     location.pathname === '/reports-recommendation' || location.pathname === '/patient-details' ||
                     location.pathname === '/doctor-reports' || location.pathname.startsWith('/doctor-reports/') ||
                     location.pathname === '/doctor-tasks' || location.pathname.startsWith('/doctor-tasks/') ||
                     location.pathname === '/doctor-session-notes' || location.pathname.startsWith('/doctor-session-notes/') ||
                     location.pathname === '/messages' || location.pathname === '/admin-login' || 
                     location.pathname === '/admin-signup' || location.pathname === '/admin-dashboard' ||
                     location.pathname === '/super-admin-dashboard';
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
        <AdminProvider>
          <AppWithFooter />
        </AdminProvider>
      </AuthProvider>
    </Router>
  );
}
