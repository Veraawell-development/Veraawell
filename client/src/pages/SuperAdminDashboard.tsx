import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { FiMenu, FiLogOut, FiUsers, FiUserCheck, FiClock } from 'react-icons/fi';

interface PendingUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  approvalStatus: string;
}

interface Statistics {
  doctors: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  admins: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
  patients: {
    total: number;
  };
}

const SuperAdminDashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingAdmins, setPendingAdmins] = useState<PendingUser[]>([]);
  const [pendingDoctors, setPendingDoctors] = useState<PendingUser[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'admins' | 'doctors'>('admins');
  const navigate = useNavigate();
  const { admin, logout } = useAdmin();

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    if (!admin) {
      navigate('/admin-login');
      return;
    }
    if (admin.role !== 'super_admin') {
      navigate('/admin-dashboard');
      return;
    }
    fetchData();
  }, [admin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('[SUPER ADMIN] Starting to fetch data...');
      
      // Get token from localStorage
      const token = localStorage.getItem('adminToken');
      console.log('[SUPER ADMIN] Token from localStorage:', token ? 'Present' : 'Missing');
      
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Fetch statistics
      console.log('[SUPER ADMIN] Fetching statistics...');
      const statsRes = await fetch(`${API_BASE_URL}/admin/approvals/statistics`, {
        credentials: 'include',
        headers
      });
      console.log('[SUPER ADMIN] Statistics response status:', statsRes.status);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        console.log('[SUPER ADMIN] Statistics received:', stats);
        setStatistics(stats);
      } else {
        const error = await statsRes.text();
        console.error('[SUPER ADMIN] Statistics error:', statsRes.status, error);
        alert(`Failed to fetch statistics: ${statsRes.status} ${error}`);
      }

      // Fetch pending admins
      console.log('[SUPER ADMIN] Fetching pending admins...');
      const adminsRes = await fetch(`${API_BASE_URL}/admin/approvals/admins/pending`, {
        credentials: 'include',
        headers
      });
      console.log('[SUPER ADMIN] Admins response status:', adminsRes.status);
      if (adminsRes.ok) {
        const admins = await adminsRes.json();
        console.log('[SUPER ADMIN] Pending admins received:', admins.length, admins);
        setPendingAdmins(admins);
      } else {
        const error = await adminsRes.text();
        console.error('[SUPER ADMIN] Admins error:', adminsRes.status, error);
        alert(`Failed to fetch pending admins: ${adminsRes.status} ${error}`);
      }

      // Fetch pending doctors
      console.log('[SUPER ADMIN] Fetching pending doctors...');
      const doctorsRes = await fetch(`${API_BASE_URL}/admin/approvals/doctors/pending`, {
        credentials: 'include',
        headers
      });
      console.log('[SUPER ADMIN] Doctors response status:', doctorsRes.status);
      if (doctorsRes.ok) {
        const doctors = await doctorsRes.json();
        console.log('[SUPER ADMIN] Pending doctors received:', doctors.length, doctors);
        setPendingDoctors(doctors);
      } else {
        const error = await doctorsRes.text();
        console.error('[SUPER ADMIN] Doctors error:', doctorsRes.status, error);
        alert(`Failed to fetch pending doctors: ${doctorsRes.status} ${error}`);
      }
      
      console.log('[SUPER ADMIN] All data fetched successfully');
    } catch (error) {
      console.error('[SUPER ADMIN] Fatal error fetching data:', error);
      alert(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string, type: 'admin' | 'doctor') => {
    try {
      const token = localStorage.getItem('adminToken');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const endpoint = type === 'admin' 
        ? `/admin/approvals/admins/${userId}/approve`
        : `/admin/approvals/doctors/${userId}/approve`;

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers
      });

      if (response.ok) {
        alert(`${type === 'admin' ? 'Admin' : 'Doctor'} approved successfully!`);
        fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(error.message || 'Approval failed');
      }
    } catch (error) {
      console.error('Error approving:', error);
      alert('Approval failed');
    }
  };

  const handleReject = async (userId: string, type: 'admin' | 'doctor') => {
    const reason = prompt('Enter rejection reason (optional):');
    
    try {
      const token = localStorage.getItem('adminToken');
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const endpoint = type === 'admin' 
        ? `/admin/approvals/admins/${userId}/reject`
        : `/admin/approvals/doctors/${userId}/reject`;

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ reason: reason || 'No reason provided' })
      });

      if (response.ok) {
        alert(`${type === 'admin' ? 'Admin' : 'Doctor'} rejected`);
        fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(error.message || 'Rejection failed');
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Rejection failed');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/admin-login');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>Super Admin</h2>
            <p className="text-sm opacity-90" style={{ fontFamily: 'Inter, sans-serif' }}>{admin?.firstName} {admin?.lastName}</p>
          </div>
          
          <div className="space-y-3 flex-1">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors">
              <FiUsers className="w-5 h-5" />
              <span style={{ fontFamily: 'Inter, sans-serif' }}>Dashboard</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 hover:bg-white/10 p-2 rounded-lg transition-colors w-full"
          >
            <FiLogOut className="w-5 h-5" />
            <span style={{ fontFamily: 'Inter, sans-serif' }}>Logout</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-white hover:text-gray-200">
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>
            Super Admin Dashboard
          </h1>
          <div className="w-8" />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Pending Admins</p>
                  <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#E07A5F' }}>
                    {statistics.admins.pending}
                  </p>
                </div>
                <FiClock className="w-12 h-12 text-orange-400" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Pending Doctors</p>
                  <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#E07A5F' }}>
                    {statistics.doctors.pending}
                  </p>
                </div>
                <FiClock className="w-12 h-12 text-orange-400" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Total Doctors</p>
                  <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#7DA9A8' }}>
                    {statistics.doctors.approved}
                  </p>
                </div>
                <FiUserCheck className="w-12 h-12 text-teal-500" />
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Total Patients</p>
                  <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#7DA9A8' }}>
                    {statistics.patients.total}
                  </p>
                </div>
                <FiUsers className="w-12 h-12 text-teal-500" />
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('admins')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'admins' 
                  ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-700' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{ fontFamily: 'Bree Serif, serif' }}
            >
              Pending Admins ({pendingAdmins.length})
            </button>
            <button
              onClick={() => setActiveTab('doctors')}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                activeTab === 'doctors' 
                  ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-700' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              style={{ fontFamily: 'Bree Serif, serif' }}
            >
              Pending Doctors ({pendingDoctors.length})
            </button>
          </div>

          {/* Pending Admins Tab */}
          {activeTab === 'admins' && (
            <div className="p-6">
              {pendingAdmins.length === 0 ? (
                <div className="text-center py-12">
                  <FiUserCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                    No pending admin requests
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingAdmins.map((user) => (
                    <div key={user._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>
                            {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {user.email}
                          </p>
                          <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Applied: {formatDate(user.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(user._id, 'admin')}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(user._id, 'admin')}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pending Doctors Tab */}
          {activeTab === 'doctors' && (
            <div className="p-6">
              {pendingDoctors.length === 0 ? (
                <div className="text-center py-12">
                  <FiUserCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                    No pending doctor requests
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingDoctors.map((user) => (
                    <div key={user._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Dr. {user.firstName} {user.lastName}
                          </h3>
                          <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {user.email}
                          </p>
                          <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Applied: {formatDate(user.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleApprove(user._id, 'doctor')}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(user._id, 'doctor')}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            style={{ fontFamily: 'Bree Serif, serif' }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
