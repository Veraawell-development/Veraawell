import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { FaUserMd, FaUser } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
}

import { API_BASE_URL } from '../config/api';

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
          
          // CRITICAL: Also store in cookie for backend API calls
          const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
          const secure = window.location.protocol === 'https:';
          const sameSite = secure ? 'none' : 'lax';
          document.cookie = `token=${data.token}; path=/; max-age=${maxAge}; ${secure ? 'secure; ' : ''}samesite=${sameSite}`;
          console.log('[LOGIN] Token stored in localStorage AND cookie');
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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-purple-50 flex items-center justify-center px-4 py-8 font-sans">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 flex items-center gap-2 text-gray-600 hover:text-teal-600 transition-colors font-medium"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm">Back to Home</span>
      </button>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <img className="w-auto h-16" src="logo.png" alt="Veraawell Logo" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Welcome to Veraawell
        </h1>
        <p className="text-center text-gray-600 mb-6 text-sm">
          {registerMode ? 'Create your account' : 'Sign in to continue'}
        </p>

        {/* Toggle Buttons */}
        <div className="flex gap-3 mb-6 bg-gray-100 p-1.5 rounded-xl">
          <button
            onClick={() => setRegisterMode(false)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all rounded-lg ${
              !registerMode 
                ? 'bg-white text-teal-600 shadow-md' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setRegisterMode(true)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all rounded-lg ${
              registerMode 
                ? 'bg-white text-teal-600 shadow-md' 
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Role Selection Cards */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3 text-center">
            I am a:
          </p>
          <div className={`grid ${registerMode ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
            {/* Patient Card */}
            <button
              onClick={() => setIsProfessional(false)}
              className={`relative p-4 rounded-xl border-2 transition-all ${
                !isProfessional
                  ? 'border-teal-500 bg-teal-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className={`p-3 rounded-full ${
                  !isProfessional ? 'bg-teal-100' : 'bg-gray-100'
                }`}>
                  <FaUser className={`text-2xl ${
                    !isProfessional ? 'text-teal-600' : 'text-gray-400'
                  }`} />
                </div>
                <span className={`text-sm font-semibold ${
                  !isProfessional ? 'text-teal-700' : 'text-gray-600'
                }`}>
                  Patient
                </span>
              </div>
              {!isProfessional && (
                <div className="absolute top-2 right-2">
                  <svg className="w-5 h-5 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>

            {/* Doctor Card - Only show in login mode */}
            {!registerMode && (
              <button
                onClick={() => setIsProfessional(true)}
                className={`relative p-4 rounded-xl border-2 transition-all ${
                  isProfessional
                    ? 'border-purple-500 bg-purple-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`p-3 rounded-full ${
                    isProfessional ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    <FaUserMd className={`text-2xl ${
                      isProfessional ? 'text-purple-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <span className={`text-sm font-semibold ${
                    isProfessional ? 'text-purple-700' : 'text-gray-600'
                  }`}>
                    Doctor
                  </span>
                </div>
                {isProfessional && (
                  <div className="absolute top-2 right-2">
                    <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            )}
          </div>
          
          {/* Doctor Registration Message */}
          {registerMode && (
            <p className="text-sm text-gray-600 mt-3 text-center">
              Are you a doctor? <a href="/career" className="text-teal-600 hover:text-teal-700 font-semibold">Join us here</a>
            </p>
          )}
        </div>

        {/* Form */}
        {registerMode ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phoneNo}
                onChange={(e) => setPhoneNo(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={registerConfirm}
                onChange={(e) => setRegisterConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className={`w-full py-3 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                isProfessional
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800'
                  : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800'
              }`}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : `Sign Up as ${isProfessional ? 'Doctor' : 'Patient'}`}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email or Phone</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your email or phone number"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all"
                disabled={loading}
              />
            </div>
            <div className="text-right">
              <button
                type="button"
                className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                onClick={() => navigate('/forgot-password')}
              >
                Forgot Password?
              </button>
            </div>
            <button
              type="submit"
              className={`w-full py-3 rounded-lg font-semibold text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                isProfessional
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800'
                  : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800'
              }`}
              disabled={loading}
            >
              {loading ? 'Signing In...' : `Sign In as ${isProfessional ? 'Doctor' : 'Patient'}`}
            </button>
          </form>
        )}

        {/* Or divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="px-4 text-xs text-gray-500 font-medium uppercase">Or</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleAuth}
          className="w-full flex items-center justify-center gap-3 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-medium text-gray-700"
        >
          <FcGoogle className="text-xl" />
          <span>Continue with Google</span>
        </button>

        {/* Error Messages */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-center text-red-600 text-sm font-medium">
            {error}
          </div>
        )}
        {registerMsg && (
          <div className={`mt-4 p-3 border rounded-lg text-center text-sm font-medium ${
            registerMsg.includes('successful') 
              ? 'bg-green-50 border-green-200 text-green-600' 
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {registerMsg}
          </div>
        )}

        {/* Admin Portal Link */}
        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
          <button
            onClick={() => navigate('/admin-login')}
            className="text-xs text-gray-500 hover:text-teal-600 font-medium transition-colors"
          >
            Admin Portal →
          </button>
        </div>
      </div>
    </div>
  );
} 