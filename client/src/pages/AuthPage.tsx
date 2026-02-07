import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FcGoogle } from 'react-icons/fc';
import { FaUserMd, FaUser } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import OTPVerificationModal from '../components/OTPVerificationModal';
import toast from 'react-hot-toast';

interface AuthPageProps {
  mode?: 'login' | 'signup';
  onSuccess?: () => void;
}

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
  const location = useLocation();
  const { setAuthToken } = useAuth();

  // OTP verification states
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');

  // Get redirect information from location state
  const redirectMessage = location.state?.message;
  const redirectFrom = location.state?.from;
  const redirectServiceType = location.state?.serviceType;
  const redirectBookingType = location.state?.bookingType;

  useEffect(() => {
    if (mode === 'signup') setRegisterMode(true);
    if (mode === 'login') setRegisterMode(false);

    // Show redirect message if present
    if (redirectMessage) {
      setError(redirectMessage);
    }
  }, [mode, redirectMessage]);

  // When doctor is selected, force login mode
  useEffect(() => {
    if (isProfessional && registerMode) {
      setRegisterMode(false);
    }
  }, [isProfessional]);

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
        if (data.token) {
          setAuthToken(data.token);
        }

        if (onSuccess) onSuccess();

        if (redirectFrom) {
          navigate(redirectFrom, {
            state: {
              serviceType: redirectServiceType,
              bookingType: redirectBookingType
            }
          });
        }
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterMsg('');
    setError('');

    // Validation
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

    // STEP 1: Send OTP to email
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase(),
          userType: 'patient'
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('OTP sent to your email!');
        setOtpEmail(email);
        setShowOTPModal(true);
        setLoading(false);
      } else {
        setRegisterMsg(data.message || 'Failed to send OTP');
        setLoading(false);
      }
    } catch (err) {
      setRegisterMsg('Network error. Please try again.');
      setLoading(false);
    }
  };

  // STEP 2: Handle OTP verification success
  const handleOTPVerified = async () => {
    setShowOTPModal(false);
    setLoading(true);

    // STEP 3: Register user after OTP verification
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
          role: 'patient'
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Account created successfully!');

        // Auto-login the user after registration
        if (data.token) {
          setAuthToken(data.token);
        }

        // Clear form
        setFirstName('');
        setEmail('');
        setPhoneNo('');
        setRegisterPassword('');
        setRegisterConfirm('');
        setLoading(false);

        // Redirect to patient dashboard
        navigate('/patient-dashboard');
      } else {
        setRegisterMsg(data.message || 'Registration failed');
        setLoading(false);
      }
    } catch (err) {
      setRegisterMsg('Network error. Please try again.');
      setLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    window.location.href = `${API_BASE_URL}/auth/google?role=${isProfessional ? 'doctor' : 'patient'}`;
  };

  // Determine if signup should be available (only for patients)
  const canSignUp = !isProfessional;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      {/* Back Button */}
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 sm:gap-2 text-slate-600 hover:text-slate-900 transition-colors text-xs sm:text-sm font-medium z-10"
      >
        <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">Back to Home</span>
        <span className="sm:hidden">Back</span>
      </button>

      <div className="w-full max-w-md mx-auto">
        {/* Card */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200/60 p-6 sm:p-8 md:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-4 sm:mb-6">
            <img className="w-auto h-10 sm:h-12 md:h-14" src="logo.png" alt="Veraawell Logo" />
          </div>

          {/* Title */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-slate-900 mb-1 sm:mb-1.5">
              Welcome to Veraawell
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              {registerMode ? 'Create your account' : 'Sign in to continue'}
            </p>
          </div>

          {/* Toggle Buttons - Hidden when doctor is selected */}
          {canSignUp && (
            <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 bg-slate-100 p-1 rounded-lg sm:rounded-xl">
              <button
                onClick={() => {
                  setRegisterMode(false);
                  setIsProfessional(false);
                }}
                className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all rounded-lg ${!registerMode
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setRegisterMode(true);
                  setIsProfessional(false);
                }}
                className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all rounded-lg ${registerMode
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Role Selection Cards */}
          <div className="mb-4 sm:mb-6">
            <p className="text-xs font-medium text-slate-500 mb-2 sm:mb-3 text-center uppercase tracking-wide">
              I am a
            </p>
            <div className={`grid ${registerMode ? 'grid-cols-1' : 'grid-cols-2'} gap-2 sm:gap-3`}>
              {/* Patient Card */}
              <button
                onClick={() => {
                  setIsProfessional(false);
                  if (!canSignUp && registerMode) {
                    setRegisterMode(false);
                  }
                }}
                className={`relative p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all duration-200 ${!isProfessional
                  ? 'border-teal-500 bg-teal-50/50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <div className="flex flex-col items-center gap-2 sm:gap-2.5">
                  <div
                    className={`p-2 sm:p-2.5 rounded-full transition-colors ${!isProfessional ? 'bg-teal-100' : 'bg-slate-100'
                      }`}
                  >
                    <FaUser
                      className={`text-lg sm:text-xl ${!isProfessional ? 'text-teal-600' : 'text-slate-400'
                        }`}
                    />
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-medium ${!isProfessional ? 'text-teal-700' : 'text-slate-600'
                      }`}
                  >
                    Patient
                  </span>
                </div>
                {!isProfessional && (
                  <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                    <svg
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-teal-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </button>

              {/* Doctor Card - Only show in login mode */}
              {!registerMode && (
                <button
                  onClick={() => setIsProfessional(true)}
                  className={`relative p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all duration-200 ${isProfessional
                    ? 'border-slate-700 bg-slate-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex flex-col items-center gap-2 sm:gap-2.5">
                    <div
                      className={`p-2 sm:p-2.5 rounded-full transition-colors ${isProfessional ? 'bg-slate-200' : 'bg-slate-100'
                        }`}
                    >
                      <FaUserMd
                        className={`text-lg sm:text-xl ${isProfessional ? 'text-slate-700' : 'text-slate-400'
                          }`}
                      />
                    </div>
                    <span
                      className={`text-xs sm:text-sm font-medium ${isProfessional ? 'text-slate-800' : 'text-slate-600'
                        }`}
                    >
                      Doctor
                    </span>
                  </div>
                  {isProfessional && (
                    <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                      <svg
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              )}
            </div>

            {/* Doctor Registration Message */}
            {registerMode && (
              <p className="text-xs text-slate-500 mt-3 sm:mt-4 text-center px-2">
                Are you a doctor?{' '}
                <a
                  href="/career"
                  className="text-slate-700 hover:text-slate-900 font-medium underline underline-offset-2"
                >
                  Join us here
                </a>
              </p>
            )}
          </div>

          {/* Form */}
          {registerMode ? (
            <form onSubmit={handleRegister} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNo}
                  onChange={(e) => setPhoneNo(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={registerConfirm}
                  onChange={(e) => setRegisterConfirm(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 sm:py-3 rounded-lg font-medium text-white bg-slate-900 hover:bg-slate-800 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Sign Up as Patient'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Email or Phone
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your email or phone number"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 sm:mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm transition-all bg-white"
                  disabled={loading}
                />
              </div>
              <div className="text-right">
                <button
                  type="button"
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium transition-colors"
                  onClick={() => navigate('/forgot-password')}
                >
                  Forgot Password?
                </button>
              </div>
              <button
                type="submit"
                className={`w-full py-2.5 sm:py-3 rounded-lg font-medium text-white transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm ${isProfessional
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-teal-600 hover:bg-teal-700'
                  }`}
                disabled={loading}
              >
                {loading ? 'Signing In...' : `Sign In as ${isProfessional ? 'Doctor' : 'Patient'}`}
              </button>
            </form>
          )}

          {/* Or divider */}
          <div className="flex items-center my-4 sm:my-6">
            <div className="flex-1 border-t border-slate-200"></div>
            <span className="px-2 sm:px-3 text-xs text-slate-400 font-medium">OR</span>
            <div className="flex-1 border-t border-slate-200"></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleAuth}
            className="w-full flex items-center justify-center gap-2 sm:gap-3 py-2 sm:py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-all font-medium text-slate-700 text-xs sm:text-sm"
          >
            <FcGoogle className="text-base sm:text-lg" />
            <span>Continue with Google</span>
          </button>

          {/* Error Messages */}
          {error && (
            <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg text-center text-red-700 text-xs font-medium">
              {error}
            </div>
          )}
          {registerMsg && (
            <div
              className={`mt-3 sm:mt-4 p-2.5 sm:p-3 border rounded-lg text-center text-xs font-medium ${registerMsg.includes('successful')
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
                }`}
            >
              {registerMsg}
            </div>
          )}

          {/* Admin Portal Link */}
          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-200 text-center">
            <button
              onClick={() => navigate('/admin-login')}
              className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
            >
              Admin Portal →
            </button>
          </div>
        </div>

        {/* OTP Verification Modal */}
        <OTPVerificationModal
          isOpen={showOTPModal}
          email={otpEmail}
          userType="patient"
          onVerified={handleOTPVerified}
          onClose={() => {
            setShowOTPModal(false);
            setLoading(false);
          }}
        />
      </div>
    </div>
  );
}
