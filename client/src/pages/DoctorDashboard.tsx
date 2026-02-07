import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from '../components/Calendar';
import WelcomeModal from '../components/WelcomeModal';
import { useAuth } from '../context/AuthContext';
import SessionModal from '../components/SessionModal';
import type { Session } from '../types';

const DoctorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<any[]>([]);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [userName, setUserName] = useState<string>('Doctor');
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);
  const [stats, setStats] = useState({
    revenue: 0,
    sessions: 0,
    hours: 0
  });

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchUserProfile();
    fetchDashboardData();
    fetchUnreadCount();
    fetchOnlineStatus();
    // Refresh calendar when returning to dashboard
    setCalendarRefreshTrigger(prev => prev + 1);

    // Show welcome modal only once - check localStorage
    if (user) {
      const hasSeenWelcome = localStorage.getItem(`welcomeModal_${user.userId}`);
      if (!hasSeenWelcome && user.profileCompleted === false) {
        setShowWelcomeModal(true);
      }
    }
  }, [user]);

  const fetchUserProfile = async () => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const userData = await response.json();
        setUserName(userData.firstName || userData.username || 'Doctor');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    const API_BASE_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:5001/api'
      : 'https://veraawell-backend.onrender.com/api';

    // Get token for all requests
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      // Fetch session notes created by this doctor
      const notesResponse = await fetch(`${API_BASE_URL}/session-tools/notes/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });
      if (notesResponse.ok) {
        const notes = await notesResponse.json();
        setRecentNotes(notes.slice(0, 5));
      }

      // Fetch tasks assigned by this doctor
      const tasksResponse = await fetch(`${API_BASE_URL}/session-tools/tasks/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });
      if (tasksResponse.ok) {
        const tasks = await tasksResponse.json();
        setAssignedTasks(tasks.slice(0, 5));
      }

      // Fetch reports created by this doctor
      const reportsResponse = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user.userId}`, {
        credentials: 'include',
        headers
      });
      if (reportsResponse.ok) {
        const reports = await reportsResponse.json();
        setRecentReports(reports.slice(0, 5));
      }

      // Fetch stats
      const statsResponse = await fetch(`${API_BASE_URL}/sessions/stats`, {
        credentials: 'include',
        headers
      });

      if (statsResponse.ok) {
        const data = await statsResponse.json();
        setStats({
          revenue: data.totalRevenue || 0,
          sessions: data.totalSessions || 0,
          hours: data.totalHours || 0
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchUnreadCount = async () => {
    const API_BASE_URL = window.location.hostname === 'localhost'
      ? 'http://localhost:5001/api'
      : 'https://veraawell-backend.onrender.com/api';

    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/chat/unread-count`, {
        credentials: 'include',
        headers
      });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      setUnreadCount(0);
    }
  };

  const fetchOnlineStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/doctor-status/status`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setIsActive(data.isOnline || false);
      }
    } catch (error) {
      console.error('Error fetching online status:', error);
    }
  };

  const toggleOnlineStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/doctor-status/toggle-online`, {
        method: 'POST',
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setIsActive(data.isOnline);
      }
    } catch (error) {
      console.error('Error toggling online status:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();

    const suffix = (day: number) => {
      if (day > 3 && day < 21) return 'th';
      switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };

    return `${day}${suffix(day)} ${month}, ${year}`;
  };

  const handleLogout = async () => {
    try {
      const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001/api'
        : 'https://veraawell-backend.onrender.com/api';

      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      window.location.href = '/';
    } catch (error) {
      window.location.href = '/';
    }
  };

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsSessionModalOpen(true);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => {
          setShowWelcomeModal(false);
          // Mark that user has seen the welcome modal
          if (user) {
            localStorage.setItem(`welcomeModal_${user.userId}`, 'true');
          }
        }}
      />

      {/* Sidebar Overlay - Transparent */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Updated Color to match new theme */}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`} style={{ backgroundColor: '#4DBAB2' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          {/* Main Menu Items */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">My Dashboard</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => navigate('/profile-setup')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-base font-medium">My Profile</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => navigate('/call-history')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-base font-medium">My Calls</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/patient-details'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-base font-medium">My Patients</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/doctor-session-notes'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-base font-medium">Session Notes</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/doctor-tasks'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-base font-medium">Tasks Assigned</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/doctor-reports'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-base font-medium">Reports</span>
            </div>
          </div>

          {/* Bottom Menu Items */}
          <div className="mt-auto space-y-3">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-base font-medium">Settings</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2"
              onClick={handleLogout}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-base font-medium">Sign Out</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Navigation Bar - Keeping it clean & white */}
      <nav className="bg-white shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
        <div className="px-6">
          <div className="flex justify-between items-center h-16">
            {/* Left side - Hamburger Menu */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-teal-50 rounded-md transition-colors z-10 relative text-gray-600"
                type="button"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Center - Greeting */}
            <div className="flex-1 text-center">
              <h1 className="text-3xl font-bold font-serif" style={{ color: '#2D3748' }}>
                Hi {userName}
              </h1>
            </div>

            {/* Right side - Chat and Active Toggle */}
            <div className="flex items-center space-x-4">
              {/* Chat Icon with Notification Badge */}
              <button
                onClick={() => navigate('/messages')}
                className="relative hover:opacity-80 transition-opacity"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                {unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-xs text-white font-bold">{unreadCount}</span>
                  </div>
                )}
              </button>

              {/* Online Status Toggle Button */}
              <button
                onClick={toggleOnlineStatus}
                className="flex items-center gap-2 px-6 py-2 rounded-full font-serif font-semibold text-white transition-all duration-300 hover:opacity-90"
                style={{ backgroundColor: isActive ? '#10B981' : '#6B7280' }}
              >
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-gray-300'}`}></div>
                {isActive ? 'Online' : 'Offline'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="p-6">
        {/* 2x2 Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Session Notes Card - Teal Theme */}
          <div className="rounded-xl text-white flex flex-col overflow-hidden shadow-lg" style={{ backgroundColor: '#4DBAB2' }}>
            <h3 className="text-xl font-bold text-center py-4 bg-[#3AA79F]" style={{ fontFamily: 'Bree Serif, serif' }}>Session Notes</h3>
            <div className="px-6 pb-4 space-y-3 flex-1 pt-4">
              {recentNotes.length > 0 ? (
                recentNotes.map((note: any) => (
                  <div key={note._id} className="border-b border-white/30 py-3 last:border-0">
                    <p className="text-base font-medium" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {formatDate(note.createdAt)} - {note.patientId.firstName} {note.patientId.lastName}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-white opacity-80" style={{ fontFamily: 'Bree Serif, serif' }}>No session notes yet</p>
                  <p className="text-white opacity-60 text-sm mt-2" style={{ fontFamily: 'Bree Serif, serif' }}>Add notes during video sessions</p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-center">
              <button
                onClick={() => navigate('/doctor-session-notes')}
                className="bg-white px-8 py-2 font-bold hover:opacity-90 transition-opacity rounded-full text-[#4DBAB2] shadow-sm"
                style={{ fontFamily: 'Bree Serif, serif' }}
              >
                View All
              </button>
            </div>
          </div>

          {/* Key Metrics Card - Updated to Teal Theme with Pills */}
          <div className="rounded-xl text-white flex flex-col overflow-hidden shadow-lg" style={{ backgroundColor: '#4DBAB2' }}>
            <h3 className="text-xl font-bold text-center py-4 bg-[#3AA79F]" style={{ fontFamily: 'Bree Serif, serif' }}>Key Metrics</h3>
            <div className="px-6 pb-6 pt-6 flex flex-col justify-center h-full">
              <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                {/* Metric 1 */}
                <div className="flex flex-col items-start space-y-2">
                  <p className="text-lg font-bold pl-1" style={{ fontFamily: 'Bree Serif, serif' }}>Total Revenue:</p>
                  <div className="bg-white rounded-full px-6 py-3 w-full text-center shadow-md">
                    <p className="text-[#38ABAE] text-xl font-bold">{stats.revenue.toLocaleString()}</p>
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="flex flex-col items-start space-y-2">
                  <p className="text-lg font-bold pl-1" style={{ fontFamily: 'Bree Serif, serif' }}>Total Sessions:</p>
                  <div className="bg-white rounded-full px-6 py-3 w-full text-center shadow-md">
                    <p className="text-[#38ABAE] text-xl font-bold">{stats.sessions}</p>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="flex flex-col items-start space-y-2">
                  <p className="text-lg font-bold pl-1" style={{ fontFamily: 'Bree Serif, serif' }}>Total Hours:</p>
                  <div className="bg-white rounded-full px-6 py-3 w-full text-center shadow-md">
                    <p className="text-[#38ABAE] text-xl font-bold">{stats.hours}</p>
                  </div>
                </div>

                {/* Metric 4 (Action) */}
                <div className="flex flex-col items-start space-y-2">
                  <p className="text-lg font-bold pl-1" style={{ fontFamily: 'Bree Serif, serif' }}>DLA- 20:</p>
                  <div className="bg-white rounded-full px-6 py-3 w-full text-center shadow-md cursor-pointer hover:bg-gray-50 transition-colors">
                    <button
                      className="text-[#38ABAE] text-lg font-bold w-full"
                    >
                      Take Test
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Card - Updated Wrapper */}
          <div className="flex flex-col rounded-xl overflow-hidden shadow-lg border border-teal-100">
            <Calendar
              userRole="doctor"
              onSessionClick={handleSessionClick}
              refreshTrigger={calendarRefreshTrigger}
            />
          </div>

          {/* Tasks & Reports - Unified Teal Theme */}
          <div className="flex flex-col gap-6">

            {/* Tasks Assigned Section */}
            <div className="rounded-xl text-white flex flex-col overflow-hidden shadow-lg" style={{ backgroundColor: '#4DBAB2' }}>
              <h3 className="text-xl font-bold text-center py-4 bg-[#3AA79F]" style={{ fontFamily: 'Bree Serif, serif' }}>Tasks Assigned</h3>
              <div className="px-6 pb-4 pt-4">
                <div className="grid grid-cols-3 gap-2 text-sm font-bold mb-3 border-b border-white/20 pb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Tasks</span>
                </div>
                <div className="space-y-3">
                  {assignedTasks.length > 0 ? (
                    assignedTasks.map((task: any) => (
                      <div key={task._id} className="grid grid-cols-3 gap-2 text-sm items-center font-medium" style={{ fontFamily: 'Bree Serif, serif' }}>
                        <span className="truncate">{task.patientId.firstName} {task.patientId.lastName}</span>
                        <span>{formatDate(task.dueDate)}</span>
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-white opacity-80 text-sm" style={{ fontFamily: 'Bree Serif, serif' }}>No tasks assigned yet</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex justify-end">
                <button
                  onClick={() => navigate('/doctor-tasks')}
                  className="text-sm font-bold underline hover:no-underline"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                >
                  View All
                </button>
              </div>
            </div>

            {/* Reports Section */}
            <div className="rounded-xl text-white flex flex-col overflow-hidden shadow-lg" style={{ backgroundColor: '#4DBAB2' }}>
              <h3 className="text-xl font-bold text-center py-4 bg-[#3AA79F]" style={{ fontFamily: 'Bree Serif, serif' }}>Reports</h3>
              <div className="px-6 pb-4 pt-4">
                <div className="grid grid-cols-3 gap-2 text-sm font-bold mb-3 border-b border-white/20 pb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Reports</span>
                </div>
                <div className="space-y-3">
                  {recentReports.length > 0 ? (
                    recentReports.map((report: any) => (
                      <div key={report._id} className="grid grid-cols-3 gap-2 text-sm items-center font-medium" style={{ fontFamily: 'Bree Serif, serif' }}>
                        <span className="truncate">{report.patientId.firstName} {report.patientId.lastName}</span>
                        <span>{formatDate(report.createdAt)}</span>
                        <span className="truncate">{report.title}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-white opacity-80 text-sm" style={{ fontFamily: 'Bree Serif, serif' }}>No reports created yet</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex justify-center">
                <button
                  onClick={() => navigate('/doctor-reports')}
                  className="bg-white px-8 py-2 font-bold hover:opacity-90 transition-opacity rounded-full text-[#4DBAB2] shadow-sm"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                >
                  View All
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Session Modal */}
      <SessionModal
        session={selectedSession}
        userRole="doctor"
        isOpen={isSessionModalOpen}
        onClose={() => {
          setIsSessionModalOpen(false);
          setSelectedSession(null);
        }}
      />
    </div>
  );
};

export default DoctorDashboard;
