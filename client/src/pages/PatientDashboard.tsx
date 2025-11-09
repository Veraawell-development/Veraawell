import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from '../components/Calendar';
import SessionModal from '../components/SessionModal';
import WelcomeModal from '../components/WelcomeModal';
import { useAuth } from '../context/AuthContext';

interface Session {
  _id: string;
  sessionDate: string;
  sessionTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  patientId: {
    firstName: string;
    lastName: string;
  };
  doctorId: {
    firstName: string;
    lastName: string;
  };
  meetingLink?: string;
  sessionType: string;
  price: number;
}

const PatientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [userName, setUserName] = useState<string>('User');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [recentJournal, setRecentJournal] = useState<any[]>([]);
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchUserProfile();
    fetchDashboardData();
    fetchUnreadCount();
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
        console.log('[PATIENT DASHBOARD] User profile:', userData);
        setUserName(userData.firstName || userData.username || 'User');
      } else {
        console.error('[PATIENT DASHBOARD] Profile fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[PATIENT DASHBOARD] Error fetching user profile:', error);
    }
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    // Get token for all requests
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      // Fetch recent reports
      const reportsRes = await fetch(`${API_BASE_URL}/session-tools/reports/patient/${user.userId}`, {
        credentials: 'include',
        headers
      });
      if (reportsRes.ok) {
        const reports = await reportsRes.json();
        setRecentReports(reports.slice(0, 2));
      }

      // Fetch pending tasks
      const tasksRes = await fetch(`${API_BASE_URL}/session-tools/tasks/patient/${user.userId}?status=pending`, {
        credentials: 'include',
        headers
      });
      if (tasksRes.ok) {
        const tasks = await tasksRes.json();
        setPendingTasks(tasks.slice(0, 1));
      }

      // Fetch journal entries
      const journalRes = await fetch(`${API_BASE_URL}/session-tools/journal/patient/${user.userId}`, {
        credentials: 'include',
        headers
      });
      if (journalRes.ok) {
        const journals = await journalRes.json();
        setRecentJournal(journals.slice(0, 1));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchUnreadCount = async () => {
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
      console.error('Error fetching unread count:', error);
      setUnreadCount(0);
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
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsSessionModalOpen(true);
  };

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
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

      {/* Sidebar */}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          {/* Main Menu Items */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors">
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
              onClick={() => navigate('/pending-tasks')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-base font-medium">Pending Tasks</span>
            </div>
            
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => navigate('/my-journal')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-base font-medium">My Journal</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-base font-medium">My Payments</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-base font-medium">My Profile</span>
            </div>
            
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">Edit Dashboard</span>
            </div>
          </div>

          {/* Sub Menu Items */}
          <div className="space-y-2 mb-6 ml-6">
            <div className="cursor-pointer hover:bg-white/10 p-2">
              <span className="text-sm">MH Screening (-)</span>
            </div>
            <div className="cursor-pointer hover:bg-white/10 p-2">
              <span className="text-sm">My Journal (-)</span>
            </div>
            <div className="cursor-pointer hover:bg-white/10 p-2">
              <span className="text-sm">My Tasks</span>
            </div>
            <div className="cursor-pointer hover:bg-white/10 p-2">
              <span className="text-sm">Mood Tracker(+)</span>
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

      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left side - Hamburger Menu */}
            <div className="flex items-center">
              <button 
                onClick={() => {
                  console.log('Hamburger clicked, current state:', sidebarOpen);
                  setSidebarOpen(true);
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors z-10 relative"
                type="button"
              >
                <svg className="w-8 h-8 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Center - Greeting */}
            <div className="flex-1 text-center">
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                Hi {userName}
              </h1>
            </div>

            {/* Right side - Chat, Book Session and Balance */}
            <div className="flex items-center space-x-3">
              {/* Chat Icon with Badge */}
              <button
                onClick={() => navigate('/messages')}
                className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {/* Notification Badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              
              <button 
                onClick={() => navigate('/booking-preference')}
                className="px-6 py-2.5 text-white rounded-full font-medium transition-colors hover:opacity-90 text-base"
                style={{ backgroundColor: '#38ABAE', fontFamily: 'Inter, sans-serif' }}
              >
                Book Session
              </button>
              <div className="px-5 py-2.5 border-2 border-gray-900 rounded-full">
                <span className="text-gray-900 font-medium text-base" style={{ fontFamily: 'Inter, sans-serif' }}>Bal: Rs. 500</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="h-[calc(100vh-4rem)] overflow-hidden px-4 py-4">
        {/* 2x2 Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          
          {/* Reports & Recommendation Card */}
          <div className="p-6 text-white flex flex-col rounded-lg border border-gray-300" style={{ backgroundColor: '#38ABAE' }}>
            <div className="border-b-2 border-white pb-3 mb-6">
              <h3 className="text-2xl font-bold text-center" style={{ fontFamily: 'Bree Serif, serif' }}>Reports & Recommendation</h3>
            </div>
            <div className="space-y-4 flex-1">
              {recentReports.length > 0 ? (
                recentReports.map((report) => (
                  <div key={report._id} className="border-b border-white pb-4">
                    <p className="text-base text-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {formatDate(report.createdAt)} - Dr. {report.doctorId.firstName} {report.doctorId.lastName}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-white opacity-70" style={{ fontFamily: 'Inter, sans-serif' }}>No reports yet</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-center">
              <button 
                onClick={() => navigate('/reports-recommendation')} 
                className="bg-white px-10 py-2.5 text-base font-semibold hover:bg-gray-100 transition-colors rounded-full" 
                style={{ color: '#38ABAE', fontFamily: 'Inter, sans-serif' }}
              >
                View All
              </button>
            </div>
          </div>

          {/* Mental Health Screening Card */}
          <div className="p-6 text-white flex flex-col rounded-lg border border-gray-300" style={{ backgroundColor: '#ABA5D1' }}>
            <div className="border-b-2 border-white pb-3 mb-6">
              <h3 className="text-2xl font-bold text-center" style={{ fontFamily: 'Bree Serif, serif' }}>Mental Health Screening</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
              <div className="bg-white p-4 text-center flex flex-col justify-center rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>Depression Score</p>
                <button 
                  onClick={() => navigate('/mental-health-test')} 
                  className="text-base font-semibold hover:underline"
                  style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
                >
                  Take Test
                </button>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>Anxiety Score</p>
                <button 
                  onClick={() => navigate('/mental-health-test')} 
                  className="text-base font-semibold hover:underline"
                  style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
                >
                  Take Test
                </button>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>Addiction Rate</p>
                <button 
                  onClick={() => navigate('/mental-health-test')} 
                  className="text-base font-semibold hover:underline"
                  style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
                >
                  Take Test
                </button>
              </div>
              <div className="bg-white p-4 text-center flex flex-col justify-center rounded-lg border border-gray-200">
                <p className="text-gray-600 text-sm mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>DLA- 20</p>
                <button 
                  onClick={() => navigate('/mental-health-test')} 
                  className="text-base font-semibold hover:underline"
                  style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
                >
                  Take Test
                </button>
              </div>
            </div>
          </div>

          {/* Calendar Card */}
          <div className="flex flex-col">
            <Calendar 
              userRole="patient" 
              onSessionClick={handleSessionClick}
              refreshTrigger={calendarRefreshTrigger}
            />
          </div>

          {/* My Journal + Pending Tasks Card */}
          <div className="flex flex-col space-y-3">
            {/* My Journal Section */}
            <div className="p-6 text-white flex-1 flex flex-col rounded-lg border border-gray-300" style={{ backgroundColor: '#6DBEDF' }}>
              <div className="border-b-2 border-white pb-3 mb-4">
                <h3 className="text-2xl font-bold text-center" style={{ fontFamily: 'Bree Serif, serif' }}>My Journal</h3>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-4 text-base mb-3 font-bold border-b border-white pb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <span className="text-center">Date</span>
                  <span className="text-center">Subject</span>
                </div>
                {recentJournal.length > 0 ? (
                  recentJournal.map((entry) => (
                    <div key={entry._id} className="grid grid-cols-2 gap-4 text-sm text-center mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <span>{formatDate(entry.createdAt)}</span>
                      <span>{entry.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-white opacity-70 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>No journal entries yet</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-center">
                <button 
                  onClick={() => navigate('/my-journal')}
                  className="bg-white px-10 py-2.5 text-base font-semibold hover:bg-gray-100 transition-colors rounded-full" 
                  style={{ color: '#6DBEDF', fontFamily: 'Inter, sans-serif' }}
                >
                  View All
                </button>
              </div>
            </div>

            {/* Pending Tasks Section */}
            <div className="p-6 text-white flex-1 flex flex-col rounded-lg border border-gray-300" style={{ backgroundColor: '#78BE9F' }}>
              <div className="border-b-2 border-white pb-3 mb-4">
                <h3 className="text-2xl font-bold text-center" style={{ fontFamily: 'Bree Serif, serif' }}>Pending Tasks</h3>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-3 gap-4 text-base mb-3 font-bold border-b border-white pb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <span className="text-center">Date</span>
                  <span className="text-center">Dr. Name</span>
                  <span className="text-center">Tasks</span>
                </div>
                {pendingTasks.length > 0 ? (
                  pendingTasks.map((task) => (
                    <div key={task._id} className="grid grid-cols-3 gap-4 text-sm text-center mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <span>{formatDate(task.dueDate)}</span>
                      <span>Dr. {task.doctorId.firstName} {task.doctorId.lastName}</span>
                      <span>{task.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-white opacity-70 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>No pending tasks</p>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-center">
                <button 
                  onClick={() => navigate('/pending-tasks')}
                  className="bg-white px-10 py-2.5 text-base font-semibold hover:bg-gray-100 transition-colors rounded-full" 
                  style={{ color: '#78BE9F', fontFamily: 'Inter, sans-serif' }}
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
        userRole="patient"
        isOpen={isSessionModalOpen}
        onClose={() => {
          setIsSessionModalOpen(false);
          setSelectedSession(null);
        }}
      />
    </div>
  );
};

export default PatientDashboard;
