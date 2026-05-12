import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
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
import AdminLoginPage from './pages/AdminLoginPage';
import AdminSignupPage from './pages/AdminSignupPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import PartnerPage from './pages/PartnerPage';
import ResourcesPage from './pages/ResourcesPage';
import BookSessionPage from './pages/BookSessionPage';
import ReportsPage from './pages/ReportsPage';
import MentalHealthTestPage from './pages/MentalHealthTestPage';
import MentalHealthDashboard from './pages/MentalHealthDashboard';
import TestResultsPage from './pages/TestResultsPage';
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
import PatientProfileSetupPage from './pages/PatientProfileSetupPage';
import ManageCalendar from './pages/ManageCalendar';
import MessagesPage from './pages/MessagesPage';
import MyTestsPage from './pages/MyTestsPage';
import MyTherapistPage from './pages/MyTherapistPage';
import FAQPage from './pages/FAQPage';
import ArticlesPage from './pages/ArticlesPage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import AdminArticleEditorPage from './pages/AdminArticleEditorPage';
import VideosPage from './pages/VideosPage';
import NotFoundPage from './pages/NotFoundPage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isLoggedIn, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AdminProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, loading } = useAdmin();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!admin) {
    return <Navigate to="/admin-login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { isLoggedIn, user, checkAuth, setAuthToken } = useAuth();
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

        // Professional Approach: Wait for DOM to be interactive, not for all heavy images to load
        const waitForDOM = () => {
          return new Promise<void>((resolve) => {
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
              resolve();
            } else {
              window.addEventListener('DOMContentLoaded', () => resolve());
            }
          });
        };

        await waitForDOM();

        // Reduced fallback timeout from 5s to 1.5s for instant feel
        const initializationTimeout = setTimeout(() => {
          if (!isAppReady) {
            console.warn('[App] Initialization taking too long, forcing ready state');
            setIsAppReady(true);
            sessionStorage.setItem('appInitialized', 'true');
          }
        }, 1500); // 1.5 second timeout

        // Try to check auth silently (don't fail if not logged in)
        await checkAuth().catch((error) => {
          console.log('[App] Auth check failed on first load:', error?.message || 'User not logged in');
        });

        clearTimeout(initializationTimeout);
        // Mark as initialized
        sessionStorage.setItem('appInitialized', 'true');
        setIsAppReady(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Continue anyway to show the UI
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
      const roleFromUrl = urlParams.get('role');
      const tokenFromUrl = urlParams.get('token');

      // If token is in URL (fallback for blocked cookies), save it
      if (tokenFromUrl) {
        localStorage.setItem('token', tokenFromUrl);
        setAuthToken(tokenFromUrl);
      }

      // Clean URL immediately (remove auth params)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      // Retry auth check with exponential backoff
      const retryAuthCheck = async (attempt = 1, maxAttempts = 3) => {
        try {
          await checkAuth();

          // Redirect to appropriate dashboard based on role
          if (roleFromUrl === 'patient') {
            navigate('/patient-dashboard', { replace: true });
          } else if (roleFromUrl === 'doctor') {
            navigate('/doctor-dashboard', { replace: true });
          } else {
            // Fallback: let the redirect effect handle it
            navigate('/', { replace: true });
          }
        } catch (error) {
          if (attempt < maxAttempts) {
            // Wait before retrying (exponential backoff: 500ms, 1000ms, 2000ms)
            const delay = 500 * Math.pow(2, attempt - 1);
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
      const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

      if (isAuthPage) {
        if (role === 'patient') {
          navigate('/patient-dashboard', { replace: true });
        } else if (role === 'doctor') {
          navigate('/doctor-dashboard', { replace: true });
        } else if (['admin', 'super_admin'].includes(role)) {
          navigate('/super-admin-dashboard', { replace: true });
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
    location.pathname.startsWith('/admin') || location.pathname === '/super-admin-dashboard' ||
    location.pathname === '/admin-login' || location.pathname === '/admin-signup';
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
        <Route path="/doctor/:doctorId" element={<ProtectedRoute allowedRoles={['patient']}><DoctorProfilePage /></ProtectedRoute>} />
        <Route path="/choose-professional" element={<ProtectedRoute allowedRoles={['patient']}><ChooseProfessionalPage /></ProtectedRoute>} />
        <Route path="/patient-dashboard" element={<ProtectedRoute allowedRoles={['patient']}><PatientDashboard /></ProtectedRoute>} />
        <Route path="/doctor-dashboard" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>} />
        <Route path="/manage-calendar" element={<ProtectedRoute allowedRoles={['doctor']}><ManageCalendar /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/super-admin-dashboard" element={<AdminProtectedRoute><SuperAdminDashboard /></AdminProtectedRoute>} />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/resources/articles" element={<ArticlesPage />} />
        <Route path="/resources/articles/:slug" element={<ArticleDetailPage />} />
        <Route path="/resources/videos" element={<VideosPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/book-session/:doctorId" element={<ProtectedRoute allowedRoles={['patient']}><BookSessionPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute allowedRoles={['patient']}><ReportsPage /></ProtectedRoute>} />
        <Route path="/mental-health" element={<ProtectedRoute allowedRoles={['patient']}><MentalHealthDashboard /></ProtectedRoute>} />
        <Route path="/mental-health/:testType" element={<ProtectedRoute allowedRoles={['patient']}><MentalHealthTestPage /></ProtectedRoute>} />
        <Route path="/test-results/:id" element={<ProtectedRoute allowedRoles={['patient']}><TestResultsPage /></ProtectedRoute>} />
        <Route path="/my-tests" element={<ProtectedRoute allowedRoles={['patient']}><MyTestsPage /></ProtectedRoute>} />
        <Route path="/my-therapists" element={<ProtectedRoute allowedRoles={['patient']}><MyTherapistPage /></ProtectedRoute>} />
        <Route path="/video-call/:sessionId" element={<ProtectedRoute><VideoCallRoom /></ProtectedRoute>} />
        <Route path="/call-history" element={<ProtectedRoute allowedRoles={['patient', 'doctor']}><CallHistoryPage /></ProtectedRoute>} />
        <Route path="/pending-tasks" element={<ProtectedRoute allowedRoles={['patient']}><PendingTasksPage /></ProtectedRoute>} />
        <Route path="/my-journal" element={<ProtectedRoute allowedRoles={['patient']}><MyJournalPage /></ProtectedRoute>} />
        <Route path="/reports-recommendation" element={<ProtectedRoute allowedRoles={['patient']}><ReportsRecommendationPage /></ProtectedRoute>} />
        <Route path="/patient-details" element={<ProtectedRoute allowedRoles={['doctor']}><PatientDetailsPage /></ProtectedRoute>} />
        <Route path="/doctor-reports" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorReportsPage /></ProtectedRoute>} />
        <Route path="/doctor-reports/:patientId" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorReportsDetailPage /></ProtectedRoute>} />
        <Route path="/doctor-tasks" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorTasksPage /></ProtectedRoute>} />
        <Route path="/doctor-tasks/:patientId" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorTasksDetailPage /></ProtectedRoute>} />
        <Route path="/doctor-session-notes" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorSessionNotesPage /></ProtectedRoute>} />
        <Route path="/doctor-session-notes/:patientId" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorSessionNotesDetailPage /></ProtectedRoute>} />
        <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetupPage /></ProtectedRoute>} />
        <Route path="/patient-profile-setup" element={<ProtectedRoute allowedRoles={['patient']}><PatientProfileSetupPage /></ProtectedRoute>} />

        {/* Admin Article Management Routes */}
        <Route path="/admin/articles" element={<Navigate to="/super-admin-dashboard" state={{ tab: 'articles' }} replace />} />
        <Route path="/super-admin-dashboard/articles/new" element={<AdminProtectedRoute><AdminArticleEditorPage /></AdminProtectedRoute>} />
        <Route path="/super-admin-dashboard/articles/edit/:id" element={<AdminProtectedRoute><AdminArticleEditorPage /></AdminProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
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
          <Toaster
            position="top-right"
            reverseOrder={false}
            gutter={8}
            containerClassName=""
            containerStyle={{}}
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1f2937',
                color: '#fff',
                padding: '16px 20px',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '14px',
                fontWeight: '500',
                maxWidth: '400px',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10b981',
                  secondary: '#fff',
                },
                style: {
                  background: '#065f46',
                  border: '1px solid #10b981',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
                style: {
                  background: '#7f1d1d',
                  border: '1px solid #ef4444',
                },
              },
              loading: {
                iconTheme: {
                  primary: '#3b82f6',
                  secondary: '#fff',
                },
                style: {
                  background: '#1e3a8a',
                  border: '1px solid #3b82f6',
                },
              },
            }}
          />
          <AppWithFooter />
        </AdminProvider>
      </AuthProvider>
    </Router>
  );
}
