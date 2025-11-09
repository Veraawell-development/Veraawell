import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from '../components/Calendar';
import WelcomeModal from '../components/WelcomeModal';
import { useAuth } from '../context/AuthContext';
import SessionModal from '../components/SessionModal';

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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchUserProfile();
    fetchDashboardData();
    fetchUnreadCount();
    
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
        console.log('[DOCTOR DASHBOARD] User profile:', userData);
        setUserName(userData.firstName || userData.username || 'Doctor');
      } else {
        console.error('[DOCTOR DASHBOARD] Profile fetch failed:', response.status);
      }
    } catch (error) {
      console.error('[DOCTOR DASHBOARD] Error fetching user profile:', error);
    }
  };

  const fetchDashboardData = async () => {
    if (!user) return;

    const API_BASE_URL = window.location.hostname === 'localhost' 
      ? 'http://localhost:5001/api' 
      : 'https://veraawell-backend.onrender.com/api';

    try {
      console.log('📊 Fetching doctor dashboard data...');

      // Fetch session notes created by this doctor
      const notesResponse = await fetch(`${API_BASE_URL}/session-tools/notes/doctor/${user.userId}`, {
        credentials: 'include'
      });
      if (notesResponse.ok) {
        const notes = await notesResponse.json();
        console.log('📝 Notes fetched:', notes.length);
        setRecentNotes(notes.slice(0, 5)); // Show latest 5
      }

      // Fetch tasks assigned by this doctor
      const tasksResponse = await fetch(`${API_BASE_URL}/session-tools/tasks/doctor/${user.userId}`, {
        credentials: 'include'
      });
      if (tasksResponse.ok) {
        const tasks = await tasksResponse.json();
        console.log('✅ Tasks fetched:', tasks.length);
        setAssignedTasks(tasks.slice(0, 5)); // Show latest 5
      }

      // Fetch reports created by this doctor
      const reportsResponse = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user.userId}`, {
        credentials: 'include'
      });
      if (reportsResponse.ok) {
        const reports = await reportsResponse.json();
        console.log('📄 Reports fetched:', reports.length);
        setRecentReports(reports.slice(0, 5)); // Show latest 5
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
      const response = await fetch(`${API_BASE_URL}/chat/unread-count`, {
        credentials: 'include'
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
      const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:5001/api' 
        : 'https://veraawell-backend.onrender.com/api';
        
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
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
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

      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm">
        <div className="px-6">
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
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              
              {/* Active/OFF Toggle Button */}
              <button
                onClick={() => setIsActive(!isActive)}
                className="px-6 py-2 rounded-full font-serif font-semibold text-white transition-colors"
                style={{ backgroundColor: isActive ? '#10B981' : '#EF4444' }}
              >
                {isActive ? 'Active' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="p-6">
        {/* 2x2 Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Session Notes Card */}
          <div className="rounded-lg text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#5DBEBD' }}>
            <h3 className="text-xl font-bold text-center py-4" style={{ backgroundColor: '#5DBEBD', fontFamily: 'Bree Serif, serif' }}>Session Notes</h3>
            <div className="px-6 pb-4 space-y-3 flex-1">
              {recentNotes.length > 0 ? (
                recentNotes.map((note: any) => (
                  <div key={note._id} className="border-b border-white/30 py-3">
                    <p className="text-base" style={{ fontFamily: 'Bree Serif, serif' }}>
                      {formatDate(note.createdAt)} - {note.patientId.firstName} {note.patientId.lastName}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-white opacity-70" style={{ fontFamily: 'Bree Serif, serif' }}>No session notes yet</p>
                  <p className="text-white opacity-50 text-sm mt-2" style={{ fontFamily: 'Bree Serif, serif' }}>Add notes during video sessions</p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex justify-center">
              <button 
                onClick={() => navigate('/doctor-session-notes')} 
                className="bg-white px-8 py-2 font-medium hover:opacity-90 transition-opacity rounded-full"
                style={{ color: '#5DBEBD', fontFamily: 'Bree Serif, serif' }}
              >
                View All
              </button>
            </div>
          </div>

          {/* Key Metrics Card */}
          <div className="rounded-lg text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#ABA5D1' }}>
            <h3 className="text-xl font-bold text-center py-4" style={{ backgroundColor: '#ABA5D1', fontFamily: 'Bree Serif, serif' }}>Key Metrics</h3>
            <div className="px-6 pb-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>Total Revenue</p>
                  <p className="text-xl font-bold" style={{ color: '#ABA5D1', fontFamily: 'Bree Serif, serif' }}>5,00,000</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>Total Sessions</p>
                  <p className="text-xl font-bold" style={{ color: '#ABA5D1', fontFamily: 'Bree Serif, serif' }}>170</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center">
                  <p className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>Total Hrs Of Therapy</p>
                  <p className="text-xl font-bold" style={{ color: '#ABA5D1', fontFamily: 'Bree Serif, serif' }}>150</p>
                </div>
                <div className="bg-white rounded-lg p-4 text-center flex flex-col justify-center">
                  <p className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>DLA- 20</p>
                  <button 
                    className="text-xs font-medium px-3 py-1 rounded-full mt-1 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#ABA5D1', color: 'white', fontFamily: 'Bree Serif, serif' }}
                  >
                    Take Test
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Calendar Card */}
          <div className="flex flex-col">
            <Calendar 
              userRole="doctor" 
              onSessionClick={handleSessionClick}
            />
          </div>

          {/* Tasks Assigned + Reports Card */}
          <div className="flex flex-col gap-6">
            {/* Tasks Assigned Section */}
            <div className="rounded-lg text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#6DBEDF' }}>
              <h3 className="text-xl font-bold text-center py-4" style={{ backgroundColor: '#6DBEDF', fontFamily: 'Bree Serif, serif' }}>Tasks Assigned</h3>
              <div className="px-6 pb-4">
                <div className="grid grid-cols-3 gap-4 text-sm font-bold mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Tasks</span>
                </div>
                {assignedTasks.length > 0 ? (
                  assignedTasks.map((task: any) => (
                    <div key={task._id} className="grid grid-cols-3 gap-4 text-sm items-center py-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                      <span>{task.patientId.firstName} {task.patientId.lastName}</span>
                      <span>{formatDate(task.dueDate)}</span>
                      <span>{task.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-white opacity-70 text-sm" style={{ fontFamily: 'Bree Serif, serif' }}>No tasks assigned yet</p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 flex justify-end">
                <button 
                  onClick={() => navigate('/doctor-tasks')} 
                  className="text-sm underline hover:no-underline"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                >
                  View All
                </button>
              </div>
            </div>

            {/* Reports Section */}
            <div className="rounded-lg text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#78BE9F' }}>
              <h3 className="text-xl font-bold text-center py-4" style={{ backgroundColor: '#78BE9F', fontFamily: 'Bree Serif, serif' }}>Reports</h3>
              <div className="px-6 pb-4">
                <div className="grid grid-cols-3 gap-4 text-sm font-bold mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                  <span>Name</span>
                  <span>Last Date</span>
                  <span>Reports</span>
                </div>
                {recentReports.length > 0 ? (
                  recentReports.map((report: any) => (
                    <div key={report._id} className="grid grid-cols-3 gap-4 text-sm items-center py-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                      <span>{report.patientId.firstName} {report.patientId.lastName}</span>
                      <span>{formatDate(report.createdAt)}</span>
                      <span>{report.title}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4">
                    <p className="text-white opacity-70 text-sm" style={{ fontFamily: 'Bree Serif, serif' }}>No reports created yet</p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 flex justify-center">
                <button 
                  onClick={() => navigate('/doctor-reports')}
                  className="bg-white px-8 py-2 font-medium hover:opacity-90 transition-opacity rounded-full"
                  style={{ color: '#78BE9F', fontFamily: 'Bree Serif, serif' }}
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
