import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
}

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

export default function AuthPage({ mode, onSuccess }: AuthPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registerMode, setRegisterMode] = useState(mode === 'signup');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerMsg, setRegisterMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNo, setPhoneNo] = useState('');
  const [isProfessional, setIsProfessional] = useState(false);
  const navigate = useNavigate();
  const { setAuthToken } = useAuth();

  useEffect(() => {
    if (mode === 'signup') setRegisterMode(true);
    if (mode === 'login') setRegisterMode(false);
  }, [mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          username, 
          password,
          role: isProfessional ? 'doctor' : 'patient'
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setError('');
        // Store the token for WebSocket authentication
        if (data.token) {
          setAuthToken(data.token);
        }
        if (onSuccess) onSuccess();
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  // Auto-login if cookie exists (handled in App.tsx now)
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterMsg('');
    setError('');
    
    console.log('Form values:', { firstName, email, phoneNo, registerPassword, registerConfirm });
    
    if (!firstName.trim()) {
      setRegisterMsg('Name is required');
      return;
    }
    if (!email.trim()) {
      setRegisterMsg('Email is required');
      return;
    }
    if (!phoneNo.trim()) {
      setRegisterMsg('Phone number is required');
      return;
    }
    if (!registerPassword.trim()) {
      setRegisterMsg('Password is required');
      return;
    }
    if (!registerConfirm.trim()) {
      setRegisterMsg('Please confirm your password');
      return;
    }
    if (registerPassword !== registerConfirm) {
      setRegisterMsg('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          lastName: '',
          email,
          username: email,
          password: registerPassword,
          phoneNo,
          role: isProfessional ? 'doctor' : 'patient'
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisterMsg('Registration successful! Please sign in.');
        setFirstName('');
        setEmail('');
        setPhoneNo('');
        setRegisterPassword('');
        setRegisterConfirm('');
        setLoading(false);
        setTimeout(() => {
          setRegisterMode(false);
          setRegisterMsg('');
        }, 2000);
      } else {
        setRegisterMsg(data.message || 'Registration failed');
        setLoading(false);
      }
    } catch (err) {
      setRegisterMsg('Network error');
      setLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    console.log('Redirecting to Google OAuth:', `${API_BASE_URL}/auth/google`);
    window.location.href = `${API_BASE_URL}/auth/google?role=${isProfessional ? 'doctor' : 'patient'}`;
  };

  return (
    <div className="h-screen bg-white flex items-center justify-center px-4 overflow-hidden font-sans">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors font-sans"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm">Back to Home</span>
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img className="w-auto h-20" src="logo.png" alt="Veraawell Logo" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-center mb-8 text-teal-600 font-serif">
          Welcome To Veraawell
        </h1>

        {/* Toggle Buttons */}
        <div className="flex gap-2 mb-6 justify-center">
          <button
            onClick={() => setRegisterMode(false)}
            className={`px-6 py-2.5 text-sm font-medium transition-colors rounded-full ${
              !registerMode 
                ? 'bg-teal-600 text-white' 
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setRegisterMode(true)}
            className={`px-6 py-2.5 text-sm font-medium transition-colors rounded-full ${
              registerMode 
                ? 'bg-teal-600 text-white' 
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Professional Toggle */}
        <div className="flex items-center justify-center mb-8">
          <button
            onClick={() => setIsProfessional(!isProfessional)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isProfessional 
                ? 'bg-teal-600 text-white' 
                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          >
            {isProfessional && (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            As a Professional
          </button>
        </div>

        {/* Form */}
        {registerMode ? (
          <form onSubmit={handleRegister} className="space-y-4 font-sans">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Enter your email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-md sm:text-sm text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Phone no.</label>
              <input
                type="tel"
                value={phoneNo}
                onChange={(e) => setPhoneNo(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Enter your Password</label>
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Re-Enter your Password</label>
              <input
                type="password"
                value={registerConfirm}
                onChange={(e) => setRegisterConfirm(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div className="flex justify-center mt-6">
              <button
                type="submit"
                className="bg-teal-600 text-white py-2.5 px-8 rounded-full font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 text-sm font-sans"
                disabled={loading}
              >
                Sign Up
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4 font-sans">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Enter your email/ phone no.</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2 font-sans">Enter your Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-400 rounded-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm font-sans"
                disabled={loading}
              />
            </div>
            <div className="text-left">
              <button
                type="button"
                className="text-sm text-gray-900 hover:text-gray-700 font-sans underline"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot Password
              </button>
            </div>
            <div className="flex justify-center mt-6">
              <button
                type="submit"
                className="bg-teal-600 text-white py-2.5 px-8 rounded-full font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 text-sm font-sans"
                disabled={loading}
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* Or divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-gray-400"></div>
          <span className="px-4 text-sm text-gray-600 font-sans">or</span>
          <div className="flex-1 border-t border-gray-400"></div>
        </div>

        {/* Google Sign In */}
        <div className="flex justify-center hover:scale-105 transition-transform">
          <button
            onClick={handleGoogleAuth}
            className="flex items-center justify-center gap-3 py-2.5 px-6 border border-gray-400 rounded-full hover:bg-gray-50 transition-colors text-sm font-sans"
          >
            <FcGoogle className="text-lg" />
            <span className="text-gray-900 font-medium">Continue with Google</span>
          </button>
        </div>

        {/* Error Messages */}
        {error && (
          <div className="mt-3 text-center text-red-500 text-sm">{error}</div>
        )}
        {registerMsg && (
          <div className={`mt-3 text-center text-sm ${registerMsg.includes('successful') ? 'text-green-500' : 'text-red-500'}`}>
            {registerMsg}
          </div>
        )}

        {/* Admin Portal Link */}
        <div className="mt-6 pt-4 border-t border-gray-300 text-center">
          <button
            onClick={() => navigate('/admin-login')}
            className="text-xs text-gray-500 hover:text-gray-700 underline font-sans"
          >
            Admin Portal
          </button>
        </div>
      </div>
    </div>
  );
} 