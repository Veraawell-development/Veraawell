import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaLock } from 'react-icons/fa';

const API_BASE_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:5001/api'
  : 'https://veraawell-backend.onrender.com/api';

export default function AdminForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage(data.message);
        // Clear form
        setEmail('');
      } else {
        setError(data.message || 'Failed to process request');
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
          <h1 className="text-2xl font-bold text-white">Reset Admin Password</h1>
          <p className="text-gray-400 mt-2">Enter your admin email to receive reset instructions</p>
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
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg">
              {error}
            </div>
          )}

          {message && (
            <div className="text-green-500 text-sm text-center bg-green-500/10 py-2 rounded-lg">
              {message}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition duration-200 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Send Reset Instructions'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/admin/login')}
            className="text-sm text-gray-400 hover:text-white transition duration-200"
          >
            ← Back to Admin Login
          </button>
        </div>
      </div>
    </div>
  );
} 