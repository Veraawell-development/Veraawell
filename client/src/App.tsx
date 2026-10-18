import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataSocketProvider } from './context/DataSocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import { AdminProvider, useAdmin } from './context/AdminContext';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LoadingScreen from './components/LoadingScreen';
import { wakeUpBackend } from './utils/backendWakeup';
import { consumeOAuthRedirect, getRedirectFromSearch, loginPathFor } from './utils/safeRedirect';
import GlobalIncomingCallListener from './components/GlobalIncomingCallListener';
import PatientSessionNotifier from './components/PatientSessionNotifier';
// The two entry points stay in the main bundle so the first paint of / and
// /login doesn't wait on a second request. Every other page is its own chunk,
// fetched on first navigation (the bundle used to be a single ~2 MB file).
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';

/**
 * React.lazy, plus one automatic reload when a chunk fails to load.
 *
 * Chunk file names are content-hashed, so after a deploy a tab that is still
 * running the previous build asks for chunks that no longer exist (and the
 * SPA rewrite answers with index.html, which fails as a module). Reloading
 * picks up the new build; the sessionStorage flag stops a genuinely broken
 * chunk from reloading forever — the second failure reaches ErrorBoundary.
 */
const CHUNK_RELOAD_KEY = 'veraawell:chunkReload';
function lazyPage<T extends React.ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* storage blocked */ }
      return mod;
    } catch (err) {
      let alreadyReloaded = true;
      try {
        alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
      } catch { /* storage blocked: don't risk a reload loop */ }
      if (!alreadyReloaded) {
        window.location.reload();
        return new Promise<{ default: T }>(() => { /* the reload replaces the page */ });
      }
      throw err;
    }
  });
}
const CareerPage = lazyPage(() => import('./pages/CareerPage'));
const AboutPage = lazyPage(() => import('./pages/AboutPage'));
const ServicesPage = lazyPage(() => import('./pages/ServicesPage'));
const DoctorProfilePage = lazyPage(() => import('./pages/DoctorProfilePage'));
const ChooseProfessionalPage = lazyPage(() => import('./pages/ChooseProfessionalPage'));
const PatientDashboard = lazyPage(() => import('./pages/PatientDashboard'));
const DoctorDashboard = lazyPage(() => import('./pages/DoctorDashboard'));
const ForgotPasswordPage = lazyPage(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazyPage(() => import('./pages/ResetPasswordPage'));
const AdminLoginPage = lazyPage(() => import('./pages/AdminLoginPage'));
const AdminSignupPage = lazyPage(() => import('./pages/AdminSignupPage'));
const AdminForgotPasswordPage = lazyPage(() => import('./pages/AdminForgotPasswordPage'));
const AdminResetPasswordPage = lazyPage(() => import('./pages/AdminResetPasswordPage'));
const SuperAdminDashboard = lazyPage(() => import('./pages/SuperAdminDashboard'));
// Only reached by an admin whose password must change first; not a page, so plain lazy.
const ChangePasswordModal = lazy(() => import('./components/admin/ChangePasswordModal'));
const PartnerPage = lazyPage(() => import('./pages/PartnerPage'));
const ResourcesPage = lazyPage(() => import('./pages/ResourcesPage'));
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'));
const MentalHealthTestPage = lazyPage(() => import('./pages/MentalHealthTestPage'));
const MentalHealthDashboard = lazyPage(() => import('./pages/MentalHealthDashboard'));
const TestResultsPage = lazyPage(() => import('./pages/TestResultsPage'));
const VideoCallRoom = lazyPage(() => import('./pages/VideoCallRoom'));
const CallHistoryPage = lazyPage(() => import('./pages/CallHistoryPage'));
const PendingTasksPage = lazyPage(() => import('./pages/PendingTasksPage'));
const MyJournalPage = lazyPage(() => import('./pages/MyJournalPage'));
const ReportsRecommendationPage = lazyPage(() => import('./pages/ReportsRecommendationPage'));
const PatientDetailsPage = lazyPage(() => import('./pages/PatientDetailsPage'));
const DoctorReportsPage = lazyPage(() => import('./pages/DoctorReportsPage'));
const DoctorReportsDetailPage = lazyPage(() => import('./pages/DoctorReportsDetailPage'));
const DoctorTasksPage = lazyPage(() => import('./pages/DoctorTasksPage'));
const DoctorTasksDetailPage = lazyPage(() => import('./pages/DoctorTasksDetailPage'));
const DoctorSessionNotesPage = lazyPage(() => import('./pages/DoctorSessionNotesPage'));
const DoctorSessionNotesDetailPage = lazyPage(() => import('./pages/DoctorSessionNotesDetailPage'));
const ProfileSetupPage = lazyPage(() => import('./pages/ProfileSetupPage'));
const PatientProfileSetupPage = lazyPage(() => import('./pages/PatientProfileSetupPage'));
const ManageCalendar = lazyPage(() => import('./pages/ManageCalendar'));
const MessagesPage = lazyPage(() => import('./pages/MessagesPage'));
const MyTestsPage = lazyPage(() => import('./pages/MyTestsPage'));
const MyTherapistPage = lazyPage(() => import('./pages/MyTherapistPage'));
const FAQPage = lazyPage(() => import('./pages/FAQPage'));
const ContactPage = lazyPage(() => import('./pages/ContactPage'));
const PrivacyPage = lazyPage(() => import('./pages/PrivacyPage'));
const TermsPage = lazyPage(() => import('./pages/TermsPage'));
const RefundPolicyPage = lazyPage(() => import('./pages/RefundPolicyPage'));
const ArticlesPage = lazyPage(() => import('./pages/ArticlesPage'));
const ArticleDetailPage = lazyPage(() => import('./pages/ArticleDetailPage'));
const AdminArticleEditorPage = lazyPage(() => import('./pages/AdminArticleEditorPage'));
const VideosPage = lazyPage(() => import('./pages/VideosPage'));
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage'));
const DoctorSettingsPage = lazyPage(() => import('./pages/DoctorSettingsPage'));
const PatientSettingsPage = lazyPage(() => import('./pages/PatientSettingsPage'));

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/** Shown instead of a login redirect when the auth check never reached the server. */
const ServerUnreachable: React.FC<{ onRetry: () => void; title?: string; body?: string; retryLabel?: string }> = ({
  onRetry,
  title = "We can't reach Veraawell right now",
  body = 'Our servers may be starting up, or your connection dropped. Try again in a moment.',
  retryLabel = 'Try again',
}) => (
  <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg)' }}>
    <div className="max-w-sm text-center space-y-4">
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{title}</h1>
      <p className="text-sm" style={{ color: 'var(--text-2)' }}>{body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'var(--teal)' }}
      >
        {retryLabel}
      </button>
    </div>
  </div>
);

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isLoggedIn, user, loading, serverUnreachable, checkAuth } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isLoggedIn) {
    // Couldn't tell either way (API asleep / offline): don't throw a
    // possibly-logged-in user out to the login page.
    if (serverUnreachable) {
      return <ServerUnreachable onRetry={() => { void checkAuth(); }} />;
    }
    // Keep the destination so a deep link (a call, a report) survives login.
    return <Navigate to={loginPathFor(location.pathname, location.search)} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

/** The old booking page; booking now happens on the doctor's profile. */
const BookSessionRedirect: React.FC = () => {
  const { doctorId } = useParams();
  return <Navigate to={doctorId ? `/doctor/${encodeURIComponent(doctorId)}` : '/choose-professional'} replace />;
};

const dashboardFor = (role?: string): string => {
  if (role === 'patient') return '/patient-dashboard';
  if (role === 'doctor') return '/doctor-dashboard';
  if (role && ['admin', 'super_admin'].includes(role)) return '/super-admin-dashboard';
  return '/';
};

/**
 * The admin console's gate.
 *
 * Only a definite answer from the server (no session) sends the admin to the
 * login page; when the status check couldn't reach the server, the admin is
 * offered a retry instead of being signed out. A pending forced password
 * change is shown before anything else renders.
 */
const AdminProtectedRoute: React.FC<{ children: React.ReactNode; superAdminOnly?: boolean }> = ({ children, superAdminOnly = false }) => {
  const { admin, loading, checked, unreachable, passwordChangeRequired, checkAuth } = useAdmin();
  const location = useLocation();

  // Arriving from a non-admin page inside the SPA: AdminProvider only checks
  // on a page load that starts in the console.
  useEffect(() => {
    if (!checked && !loading) void checkAuth();
  }, [checked, loading, checkAuth]);

  if (loading || !checked) {
    return <LoadingScreen />;
  }

  if (!admin) {
    if (unreachable) {
      return (
        <ServerUnreachable
          title="Can't reach the server"
          body="We couldn't confirm your admin session. You haven't been signed out — try again in a moment."
          retryLabel="Retry"
          onRetry={() => { void checkAuth(); }}
        />
      );
    }
    return <Navigate to="/admin-login" state={{ from: location }} replace />;
  }

  if (passwordChangeRequired) {
    return (
      <div className="min-h-screen bg-[#fcfbfa]">
        <ChangePasswordModal open forced onClose={() => {}} />
      </div>
    );
  }

  if (superAdminOnly && admin.role !== 'super_admin') {
    return <Navigate to="/super-admin-dashboard" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { isLoggedIn, user, checkAuth } = useAuth();

  const location = useLocation();
  const navigate = useNavigate();

  // Initialize app on first load
  useEffect(() => {
    const hasLoadedBefore = sessionStorage.getItem('appInitialized');
    
    if (!hasLoadedBefore) {
      sessionStorage.setItem('appInitialized', 'true');
      // Wake up backend (don't wait for it)
      wakeUpBackend().catch(() => {
        console.log('Backend wakeup failed, continuing anyway');
      });

      // Preload heavy/frequently-used images to prevent flicker
      const imagesToPreload = [
        '/aboutpage.png',
        '/about-01.svg',
        '/about-02.svg',
        '/about-03.svg',
        '/about-04.svg',
        '/carrer-page.png',
        '/carrer-01.svg',
        '/carrer-02.svg'
      ];
      imagesToPreload.forEach((src) => {
        const img = new window.Image();
        img.src = src;
      });
    }

    // Returning from Google sign-in: the OAuth effect below runs the check
    // and needs its answer, so it is the one that starts it.
    if (new URLSearchParams(window.location.search).get('auth') === 'success') return;

    // Check auth silently in background (don't block UI)
    checkAuth().catch((error) => {
      console.log('[App] Auth check failed:', error?.message || 'Unknown error');
    });
  }, [checkAuth]);

  // StrictMode runs effects twice; the parked redirect must be consumed once.
  const handledOAuthReturn = useRef<string | null>(null);

  useEffect(() => {
    // If the user lands on the site with auth success params from Google OAuth,
    // we trigger a re-check of authentication status.
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.has('auth') && urlParams.get('auth') === 'success') {
      if (handledOAuthReturn.current === location.key) return;
      handledOAuthReturn.current = location.key;

      const roleFromUrl = urlParams.get('role');

      // Clean URL immediately (remove auth params)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);

      // The session is the cookie the API set on its way back from Google
      // (the token no longer rides in the URL). checkAuth retries a
      // cold-starting API itself and never throws.
      void checkAuth().then((signedIn) => {
        if (!signedIn) {
          // Google said yes but this browser holds no session — cookies
          // blocked, or the API unreachable. Say so, rather than dropping
          // the person on a dashboard that bounces them to the login form.
          consumeOAuthRedirect();
          navigate('/login?error=google-session', { replace: true });
          return;
        }
        // A deep link the user was sent to /login from, parked by AuthPage
        // before leaving for Google.
        const target = consumeOAuthRedirect() ?? dashboardFor(roleFromUrl ?? undefined);
        navigate(target, { replace: true });
      });
    }
  }, [location, checkAuth, navigate]);

  // Redirect authenticated users from landing page and auth pages to their dashboards
  useEffect(() => {
    if (isLoggedIn && user) {
      const { role } = user;
      const isAuthPage = location.pathname === '/login' || location.pathname === '/signup';

      if (isAuthPage) {
        const target = getRedirectFromSearch(location.search) ?? dashboardFor(role);
        if (target !== '/') navigate(target, { replace: true });
      }
    }
  }, [isLoggedIn, user, location.pathname, location.search, navigate]);

  const handleAuthSuccess = async () => {
    await checkAuth();
  };

  // Check if current route is auth-related or video call
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/signup' ||
    location.pathname === '/forgot-password' || location.pathname === '/reset-password' ||
    location.pathname.startsWith('/admin') || location.pathname.startsWith('/super-admin-dashboard') ||
    location.pathname === '/admin-login' || location.pathname === '/admin-signup';
  const isVideoCallRoute = location.pathname.startsWith('/video-call');



  return (
    <main className="flex-1 flex flex-col">
      {!isAuthRoute && !isVideoCallRoute && <Navbar />}
      <Suspense fallback={<LoadingScreen />}>
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
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/doctor/:doctorId" element={<DoctorProfilePage />} />
        <Route path="/choose-professional" element={<ChooseProfessionalPage />} />
        <Route path="/patient-dashboard" element={<ProtectedRoute allowedRoles={['patient']}><PatientDashboard /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['patient']}><PatientSettingsPage /></ProtectedRoute>} />
        <Route path="/doctor-dashboard" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>} />
        <Route path="/doctor-settings" element={<ProtectedRoute allowedRoles={['doctor']}><DoctorSettingsPage /></ProtectedRoute>} />

        <Route path="/manage-calendar" element={<ProtectedRoute allowedRoles={['doctor']}><ManageCalendar /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* /admin/login used to be a second, dead admin login page (its own raw
            fetch, never wired to AdminContext, and it navigated to
            /admin/dashboard which doesn't exist) — redirect any stale
            bookmarks/links to the real one. */}
        <Route path="/admin/login" element={<Navigate to="/admin-login" replace />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />
        <Route path="/admin/reset-password/:token" element={<AdminResetPasswordPage />} />
        <Route path="/super-admin-dashboard" element={<AdminProtectedRoute><SuperAdminDashboard /></AdminProtectedRoute>} />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/resources/articles" element={<ArticlesPage />} />
        <Route path="/resources/articles/:slug" element={<ArticleDetailPage />} />
        <Route path="/resources/videos" element={<VideosPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/book-session/:doctorId" element={<BookSessionRedirect />} />
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
        <Route path="/super-admin-dashboard/articles/new" element={<AdminProtectedRoute superAdminOnly><AdminArticleEditorPage /></AdminProtectedRoute>} />
        <Route path="/super-admin-dashboard/articles/edit/:id" element={<AdminProtectedRoute superAdminOnly><AdminArticleEditorPage /></AdminProtectedRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
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
    location.pathname === '/super-admin-dashboard' || location.pathname.startsWith('/mental-health') ||
    location.pathname.startsWith('/my-tests') || location.pathname === '/my-therapists' ||
    location.pathname.startsWith('/test-results') || location.pathname === '/patient-profile-setup' ||
    location.pathname === '/profile-setup' || location.pathname === '/choose-professional' ||
    location.pathname === '/manage-calendar' || location.pathname === '/doctor-settings';
  const isVideoCallRoute = location.pathname.startsWith('/video-call');
  const isDoctorProfileRoute = location.pathname.startsWith('/doctor/');

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppRoutes />
      {!isAuthRoute && !isVideoCallRoute && !isDoctorProfileRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <Router>
      <AuthProvider>
        <DataSocketProvider>
        <AdminProvider>
          <GlobalIncomingCallListener />
          <PatientSessionNotifier />
          <Toaster
            position="top-right"
            reverseOrder={false}
            gutter={8}
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgba(24, 24, 27, 0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                color: '#ffffff',
                padding: '12px 20px',
                borderRadius: '16px',
                boxShadow: '0 10px 40px -10px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '14px',
                fontWeight: '500',
                maxWidth: '400px',
                letterSpacing: '0.01em',
              },
              success: {
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#ffffff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#ffffff',
                },
              },
            }}
          />
          <AppWithFooter />
        </AdminProvider>
        </DataSocketProvider>
      </AuthProvider>
    </Router>
    </ErrorBoundary>
  );
}
