import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
        // In development, show the reset URL for testing
        if (data.resetUrl) {
          setMessage(`${data.message} (For testing: ${data.resetUrl})`);
        }
      } else {
        let errorMsg = data.message || 'Failed to send reset email';
        // Special handling for Google login accounts
        if (errorMsg.toLowerCase().includes('google login')) {
          setError('This account uses Google login. Please use Google Sign-In.');
        } else {
          setError(errorMsg);
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-black p-2 sm:p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-3xl shadow-xl p-4 sm:p-8 border border-gray-800">
        <h2 className="text-xl font-bold text-center mb-6 text-white">Forgot Password</h2>
        
        <p className="text-gray-300 text-center mb-6">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {message && (
          <div className="text-center text-green-400 mb-4 p-3 bg-gray-800 rounded-lg">
            {message}
          </div>
        )}
        
        {error && (
          <div className="text-center text-red-400 mb-4">{error}</div>
        )}
        {error && error.toLowerCase().includes('no account found') && (
          <button
            type="button"
            className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition font-semibold mb-2"
            onClick={() => navigate('/signup')}
          >
            Create Account
          </button>
        )}

        <form onSubmit={handleForgotPassword} className="space-y-4">
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            disabled={loading}
            autoFocus
          />

          <button 
            type="submit" 
            className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition disabled:opacity-50 text-base font-semibold" 
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

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