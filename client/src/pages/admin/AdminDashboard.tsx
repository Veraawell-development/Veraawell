import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

interface AdminUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

export default function AdminDashboard() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check admin auth status
    fetch(`${API_BASE_URL}/admin/auth/status`, {
      credentials: 'include'
    })
      .then(res => {
        if (!res.ok) throw new Error('Not authenticated');
        return res.json();
      })
      .then(data => {
        setAdmin(data.admin);
      })
      .catch(() => {
        navigate('/admin/login');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/admin/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      navigate('/admin/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-green-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400">Welcome back, {admin?.firstName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
          >
            Logout
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
            <div className="space-y-2">
              <p>Role: <span className="text-green-500">{admin?.role}</span></p>
              <p>Email: {admin?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 