import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001/api'
  : 'https://veraawell-backend.onrender.com/api';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (res.ok) {
        navigate('/admin/dashboard');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-3xl shadow-xl p-8 border border-gray-800">
        <div className="text-center mb-8">
          <div className="inline-block p-3 rounded-full bg-red-500/10 mb-4">
            <FaLock className="text-3xl text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
          <p className="text-gray-400 mt-2">Enter your credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="email"
              placeholder="Admin Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-red-500"
              required
              disabled={loading}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/admin/forgot-password')}
              className="text-red-400 text-xs hover:text-red-300 transition"
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition duration-200 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Login as Admin'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/login')}
            className="text-sm text-gray-400 hover:text-white transition duration-200"
          >
            ← Back to User Login
          </button>
        </div>
      </div>
    </div>
  );
} 