import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../context/AdminContext';
import { FiMenu, FiLogOut, FiUsers, FiUserCheck, FiClock, FiTrendingUp, FiDollarSign, FiFileText, FiActivity } from 'react-icons/fi';

interface PendingDoctor {
  _id: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  profile: any;
}

interface Statistics {
  doctors: { pending: number; approved: number; rejected: number; total: number };
  patients: { total: number };
}

interface Analytics {
  sessions: {
    total: number;
    completed: number;
    cancelled: number;
    upcoming: number;
    last30Days: number;
    last7Days: number;
  };
  revenue: {
    total: number;
    last30Days: number;
    averagePerSession: string;
  };
  content: {
    reports: number;
    tasks: number;
    completedTasks: number;
  };
  growth: {
    newPatients30Days: number;
    newDoctors30Days: number;
  };
  topDoctors: Array<{ name: string; sessionCount: number }>;
}

const AdminDashboard: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingDoctors, setPendingDoctors] = useState<PendingDoctor[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'approvals' | 'analytics'>('approvals');
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
    if (admin.role === 'super_admin') {
      navigate('/super-admin-dashboard');
      return;
    }
    fetchData();
  }, [admin]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [statsRes, analyticsRes, doctorsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/approvals/statistics`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/admin/approvals/analytics`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/admin/approvals/doctors/pending`, { credentials: 'include' })
      ]);

      if (statsRes.ok) setStatistics(await statsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (doctorsRes.ok) setPendingDoctors(await doctorsRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (doctorId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/doctors/${doctorId}/approve`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        alert('Doctor approved successfully!');
        fetchData();
      } else {
        const error = await response.json();
        alert(error.message || 'Approval failed');
      }
    } catch (error) {
      console.error('Error approving:', error);
      alert('Approval failed');
    }
  };

  const handleReject = async (doctorId: string) => {
    const reason = prompt('Enter rejection reason (optional):');
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/approvals/doctors/${doctorId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason || 'No reason provided' })
      });

      if (response.ok) {
        alert('Doctor rejected');
        fetchData();
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
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="mb-8">
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>Admin</h2>
            <p className="text-sm opacity-90" style={{ fontFamily: 'Inter, sans-serif' }}>{admin?.firstName} {admin?.lastName}</p>
          </div>
          
          <div className="space-y-3 flex-1">
            <div 
              onClick={() => setActiveTab('approvals')}
              className={`flex items-center space-x-3 cursor-pointer p-2 rounded-lg transition-colors ${
                activeTab === 'approvals' ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <FiUserCheck className="w-5 h-5" />
              <span style={{ fontFamily: 'Inter, sans-serif' }}>Approvals</span>
            </div>
            <div 
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center space-x-3 cursor-pointer p-2 rounded-lg transition-colors ${
                activeTab === 'analytics' ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              <FiActivity className="w-5 h-5" />
              <span style={{ fontFamily: 'Inter, sans-serif' }}>Analytics</span>
            </div>
          </div>

          <button onClick={handleLogout} className="flex items-center space-x-3 hover:bg-white/10 p-2 rounded-lg transition-colors w-full">
            <FiLogOut className="w-5 h-5" />
            <span style={{ fontFamily: 'Inter, sans-serif' }}>Logout</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <div style={{ backgroundColor: '#7DA9A8' }}>
        <div className="px-6 py-4 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="text-white hover:text-gray-200">
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>
            Admin Dashboard
          </h1>
          <div className="w-8" />
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <>
            {/* Statistics Cards */}
            {statistics && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                      <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Approved Doctors</p>
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

            {/* Pending Doctors */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              <div className="px-6 py-4 border-b" style={{ backgroundColor: '#E8E5F0' }}>
                <h2 className="text-xl font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Pending Doctor Approvals ({pendingDoctors.length})
                </h2>
              </div>

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
                    {pendingDoctors.map((doctor) => (
                      <div key={doctor._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>
                              Dr. {doctor.firstName} {doctor.lastName}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                              Applied: {formatDate(doctor.createdAt)}
                            </p>
                            {doctor.profile && (
                              <p className="text-xs text-gray-600 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Specialization: {doctor.profile.specialization || 'Not specified'}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleApprove(doctor._id)}
                              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                              style={{ fontFamily: 'Bree Serif, serif' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(doctor._id)}
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
            </div>
          </>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <>
            {/* Analytics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Total Sessions</p>
                    <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#7DA9A8' }}>
                      {analytics.sessions.total}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {analytics.sessions.last7Days} this week
                    </p>
                  </div>
                  <FiActivity className="w-12 h-12 text-teal-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Total Revenue</p>
                    <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#10B981' }}>
                      ₹{analytics.revenue.total.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      ₹{analytics.revenue.last30Days.toLocaleString()} last 30 days
                    </p>
                  </div>
                  <FiDollarSign className="w-12 h-12 text-green-500" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Reports Created</p>
                    <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#ABA5D1' }}>
                      {analytics.content.reports}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {analytics.content.tasks} tasks assigned
                    </p>
                  </div>
                  <FiFileText className="w-12 h-12 text-purple-400" />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>User Growth</p>
                    <p className="text-3xl font-bold mt-2" style={{ fontFamily: 'Bree Serif, serif', color: '#E07A5F' }}>
                      +{analytics.growth.newPatients30Days}
                    </p>
                    <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      New patients (30 days)
                    </p>
                  </div>
                  <FiTrendingUp className="w-12 h-12 text-orange-400" />
                </div>
              </div>
            </div>

            {/* Session Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>Session Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Completed</span>
                    <span className="font-bold text-green-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {analytics.sessions.completed}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Upcoming</span>
                    <span className="font-bold text-blue-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {analytics.sessions.upcoming}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Cancelled</span>
                    <span className="font-bold text-red-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {analytics.sessions.cancelled}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Avg. Revenue/Session</span>
                    <span className="font-bold text-teal-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                      ₹{analytics.revenue.averagePerSession}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>Top Performing Doctors</h3>
                <div className="space-y-3">
                  {analytics.topDoctors.length === 0 ? (
                    <p className="text-gray-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>No data available</p>
                  ) : (
                    analytics.topDoctors.map((doctor, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {index + 1}. {doctor.name}
                        </span>
                        <span className="font-bold text-teal-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                          {doctor.sessionCount} sessions
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
