import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = searchParams.get('token');
  const [isGoogleUser, setIsGoogleUser] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (res.ok) {
        setMessage('Password reset successful! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        let errorMsg = 'Password reset failed';
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorMsg;
          if (errorMsg.toLowerCase().includes('google')) {
            setIsGoogleUser(true);
          }
        } catch {}
        setError(errorMsg);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  if (!token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center bg-black p-2 sm:p-4">
        <div className="w-full max-w-md bg-gray-900 rounded-3xl shadow-xl p-4 sm:p-8 border border-gray-800">
          <h2 className="text-xl font-bold text-center mb-6 text-white">Invalid Reset Link</h2>
          <p className="text-gray-300 text-center mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-black p-2 sm:p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-3xl shadow-xl p-4 sm:p-8 border border-gray-800">
        <h2 className="text-xl font-bold text-center mb-6 text-white">Reset Your Password</h2>
        
        {message && (
          <div className="text-center text-green-400 mb-4">{message}</div>
        )}
        
        {error && (
          <div className="text-center text-red-400 mb-4">{error}</div>
        )}
        {isGoogleUser ? (
          <div className="text-center text-yellow-400 mb-4">You signed up with Google. Please use Google Sign-In to log in. Password reset is not available for Google accounts.</div>
        ) : (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New Password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              disabled={loading}
              autoFocus
            />
            <button 
              type="button" 
              tabIndex={-1} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" 
              onClick={() => setShowPassword(v => !v)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              disabled={loading}
            />
            <button 
              type="button" 
              tabIndex={-1} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" 
              onClick={() => setShowConfirmPassword(v => !v)}
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <button 
            type="submit" 
            className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition disabled:opacity-50 text-base font-semibold" 
            disabled={loading}
          >
            {loading ? 'Resetting Password...' : 'Reset Password'}
          </button>
        </form>
        )}
        <button 
          type="button" 
          className="w-full text-green-400 py-2 rounded-3xl hover:bg-gray-800 transition mt-4 text-sm font-semibold" 
          onClick={() => navigate('/login')}
          disabled={loading}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
} 