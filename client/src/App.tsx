import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell.onrender.com/api';

function AppRoutes() {
  const [authSuccess, setAuthSuccess] = useState(false);
  const [authUser, setAuthUser] = useState('');
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
        } else {
          res.json().then(data => {
            if (data.user && data.user.username) {
              setAuthSuccess(true);
              setAuthUser(data.user.username);
            } else {
              setAuthSuccess(false);
              setAuthUser('');
            }
          });
        }
      })
      .catch(() => {
        setAuthSuccess(false);
        setAuthUser('');
        setIsBackendConnected(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location]);

  // Show success message if redirected from login/signup
  let showSuccess = authSuccess;
  let showUser = authUser;
  if (location.state && (location.state as any).success && (location.state as any).username) {
    showSuccess = true;
    showUser = (location.state as any).username;
    // Clear state after showing once
    window.history.replaceState({}, document.title);
  }

  const handleAuthSuccess = (username: string) => {
    setAuthSuccess(true);
    setAuthUser(username);
  };
  const handleLogout = async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setAuthSuccess(false);
    setAuthUser('');
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
              onLogout={showSuccess ? handleLogout : undefined}
            />
          }
        />
        <Route path="/login" element={<AuthPage mode="login" onSuccess={handleAuthSuccess} />} />
        <Route path="/signup" element={<AuthPage mode="signup" onSuccess={handleAuthSuccess} />} />
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
