import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Calendar from '../components/Calendar';
import WelcomeModal from '../components/WelcomeModal';
import ConnectionStatus from '../components/ConnectionStatus';
import { useAuth } from '../context/AuthContext';
import SessionModal from '../components/SessionModal';
import type { Session } from '../types';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import InstantRequestModal from '../components/InstantRequestModal';
import PostSessionReportModal from '../components/PostSessionReportModal';
import DoctorSidebar from '../components/DoctorSidebar';
import { API_BASE_URL } from '../config/api';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.log('Audio synthesis failed', e);
  }
};

const DoctorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);
  const [incomingRequest, setIncomingRequest] = useState<Session | null>(null);
  const [showPostSessionReport, setShowPostSessionReport] = useState(false);
  const [pendingReportData, setPendingReportData] = useState<any>(null);

  //  REAL-TIME: Connect to data socket
  const { socket } = useDataSocket();
  const queryClient = useQueryClient();

  const { data: recentNotes = [] } = useQuery({
    queryKey: ['doctor', 'notes', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/session-tools/notes/doctor/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      return (data.notes || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: assignedTasks = [] } = useQuery({
    queryKey: ['doctor', 'tasks', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/session-tools/tasks/doctor/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      return (data.tasks || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: recentReports = [] } = useQuery({
    queryKey: ['doctor', 'reports', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/session-tools/reports/doctor/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      return (data.reports || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: stats = { revenue: 0, sessions: 0, hours: 0 } } = useQuery({
    queryKey: ['doctor', 'stats', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/sessions/stats`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      return {
        revenue: data.totalRevenue || 0,
        sessions: data.totalSessions || 0,
        hours: data.totalHours || 0
      };
    },
    enabled: !!user?.userId,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['chat', 'unreadCount'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/chat/unread-count`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const data = await res.json();
      return data.unreadCount || 0;
    },
    enabled: !!user?.userId,
    refetchInterval: 10000,
  });

  const { data: isActive = false } = useQuery({
    queryKey: ['doctor', 'status', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/doctor-status/status`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      return data.isOnline || false;
    },
    enabled: !!user?.userId,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/doctor-status/toggle-online`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to toggle status');
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['doctor', 'status', user?.userId] });
      const previousStatus = queryClient.getQueryData(['doctor', 'status', user?.userId]);
      queryClient.setQueryData(['doctor', 'status', user?.userId], (old: any) => !old);
      return { previousStatus };
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['doctor', 'status', user?.userId], context?.previousStatus);
      toast.error('Failed to change status');
    },
    onSuccess: (data) => {
      toast.success(`You are now ${data.isOnline ? 'Online' : 'Offline'}`);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'status', user?.userId] });
    }
  });

  const isStatusLoading = toggleStatusMutation.isPending;

  useEffect(() => {
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

  //  REAL-TIME: Listen for session events
  useEffect(() => {
    if (!socket) return;

    socket.on('session:booked', ({ session }) => {
      console.log('[REAL-TIME] New session booked:', session);

      //  NEW: If it's an immediate session, show the request modal
      if (session.sessionType === 'immediate') {
        setIncomingRequest(session);
      } else {
        toast.success('New session booked!');
      }

      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'stats', user?.userId] });
    });

    socket.on('session:cancelled', ({ sessionId }) => {
      console.log('[REAL-TIME] Session cancelled:', sessionId);
      toast('A session was cancelled', { icon: 'ℹ️' });
      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'stats', user?.userId] });
    });

    socket.on('session:status-change', ({ sessionId, status }) => {
      console.log('[REAL-TIME] Session status changed:', { sessionId, status });
      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'stats', user?.userId] });
    });

    socket.on('doctor:approval-status', ({ status, reason }) => {
      console.log('[REAL-TIME] Approval status changed:', status);
      if (status === 'approved') {
        toast.success('Your account has been approved!');
      } else if (status === 'rejected') {
        toast.error(`Account rejected: ${reason || 'No reason provided'}`);
      }
      queryClient.invalidateQueries({ queryKey: ['session'] });
    });

    //  NEW: Listen for real-time online status changes
    socket.on('doctor:status-change', (data: any) => {
      if (data.doctorId === user?.userId) {
        console.log('[REAL-TIME] Online status changed:', data.isOnline);
        queryClient.setQueryData(['doctor', 'status', user?.userId], data.isOnline);
      }
    });

    socket.on('chat:new-message', ({ message, senderName }) => {
      console.log('[REAL-TIME] New chat message received:', message);
      // Play notification sound
      playNotificationSound();
      
      // Show toast notification
      toast(`New message from ${senderName}`);
      queryClient.invalidateQueries({ queryKey: ['chat', 'unreadCount'] });
    });

    return () => {
      socket.off('session:booked');
      socket.off('session:cancelled');
      socket.off('session:status-change');
      socket.off('doctor:approval-status');
      socket.off('doctor:status-change');
      socket.off('chat:new-message');
    };
  }, [socket, user, queryClient]);

  //  FALLBACK REFRESH & MANDATORY REPORT: Detect navigation state
  useEffect(() => {
    const state = location.state as { refreshSessions?: boolean; pendingReport?: any };

    if (state?.pendingReport) {
      console.log('[DOCTOR-DASHBOARD]  Found pending report:', state.pendingReport);
      setPendingReportData(state.pendingReport);
      setShowPostSessionReport(true);

      // Clear state to prevent modal popping up again on refresh
      navigate(location.pathname, { replace: true, state: { ...state, pendingReport: undefined } });
    } else if (state?.refreshSessions) {
      console.log('[DOCTOR-DASHBOARD]  Refreshing after booking');
      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor'] });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, queryClient]);

  const toggleOnlineStatus = () => {
    toggleStatusMutation.mutate();
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

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsSessionModalOpen(true);
  };

  //  NEW: Handle Instant Request Actions
  const handleAcceptRequest = async (sessionId: string) => {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    console.log('[DoctorDashboard] Accepting request for session:', sessionId);

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/accept`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      if (response.ok) {
        setIncomingRequest(null);
        navigate(`/video-call/${sessionId}`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DoctorDashboard] Accept failed:', response.status, errorData);
        toast.error(`Failed to accept: ${errorData.message || response.statusText || response.status}`);
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      toast.error('Failed to accept request');
    }
  };

  const handleDelayRequest = async (sessionId: string, minutes: number, note: string) => {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    console.log('[DoctorDashboard] Delaying request for session:', sessionId);

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/delay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ delayMinutes: minutes, doctorNote: note }),
        credentials: 'include'
      });
      if (response.ok) {
        setIncomingRequest(null);
        toast.success(`Patient notified of ${minutes}m delay`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DoctorDashboard] Delay failed:', response.status, errorData);
        toast.error(`Failed to delay: ${errorData.message || response.statusText || response.status}`);
      }
    } catch (error) {
      console.error('Error delaying request:', error);
      toast.error('Failed to delay request');
    }
  };

  return (
    <div className="h-screen pt-16 md:pt-[80px] overflow-hidden bg-[#F0F2F5] box-border">
      {/* Connection Status Indicator */}
      <ConnectionStatus />

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
      <DoctorSidebar 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
      />

      {/* Top Navigation Bar */}
      <nav className="bg-transparent border-none relative z-30 pt-2">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 transition-all duration-300">
            {/* Left side - Hamburger Menu */}
            <div className="flex justify-start w-1/3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2.5 hover:bg-black/5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 z-10 relative"
                type="button"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>

            {/* Center - Greeting */}
            <div className="text-center w-1/3 flex justify-center">
              <h1 className="text-lg md:text-xl font-medium text-gray-800 tracking-wide transition-all duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                {(() => {
                  const hour = new Date().getHours();
                  if (hour >= 5 && hour < 12) return 'Good morning';
                  if (hour >= 12 && hour < 17) return 'Good afternoon';
                  if (hour >= 17 && hour < 20) return 'Good evening';
                  if (hour >= 20 && hour < 24) return 'Good night';
                  return 'Night owl';
                })()}, Dr. {user?.firstName || user?.username || 'Doctor'}
              </h1>
            </div>

            {/* Right side - Chat and Active Toggle */}
            <div className="flex items-center justify-end space-x-2 md:space-x-4 w-1/3">
              {/* Chat Icon with Notification Badge */}
              <button
                onClick={() => navigate('/messages')}
                className="relative p-2.5 hover:bg-black/5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <svg className="w-5 h-5 text-gray-600 hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Online Status Toggle Button */}
              <button
                onClick={toggleOnlineStatus}
                disabled={isStatusLoading}
                className={`flex items-center gap-2 px-6 py-2.5 md:px-7 md:py-2.5 text-white rounded-full font-bold tracking-wide transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 text-sm ${isStatusLoading ? 'cursor-not-allowed opacity-70' : ''}`}
                style={{ backgroundColor: isActive ? '#10B981' : '#6B7280', fontFamily: 'Inter, sans-serif' }}
              >
                <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-gray-300'}`}></div>
                {isStatusLoading ? 'Switching...' : (isActive ? 'Online' : 'Offline')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="h-[calc(100%-4rem)] overflow-y-auto px-4 py-4">
        {/* 2x2 Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-4 h-[auto] lg:h-full min-h-0 pb-10 lg:pb-0">

          {/* Session Notes Card */}
          <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#38ABAE] to-[#2A8285] shadow-[0_8px_30px_rgb(56,171,174,0.3)] border border-white/10 overflow-hidden min-h-[350px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(56,171,174,0.5)] transition-all duration-300">
            <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Session Notes</h3>
            </div>
            <div className="p-5 sm:p-6 space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-0 flex flex-col">
              {recentNotes.length > 0 ? (
                recentNotes.map((note: any) => (
                  <div key={note._id} className="mb-3 cursor-pointer hover:shadow-lg bg-white/10 hover:bg-white/20 border border-white/10 p-4 sm:p-5 rounded-2xl transition-all shadow-sm backdrop-blur-md">
                    <p className="text-sm text-white font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {formatDate(note.createdAt)} <span className="text-white/60 mx-1">•</span> {note.patientId.firstName} {note.patientId.lastName}
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-80">
                  <p className="text-white font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>No session notes yet</p>
                  <p className="text-white/70 text-sm mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>Add notes during video sessions</p>
                </div>
              )}
            </div>
            <div className="px-6 pb-6 pt-2 flex justify-center shrink-0">
              <button
                onClick={() => navigate('/doctor-session-notes')}
                className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                View All Notes
              </button>
            </div>
          </div>

          {/* Key Metrics Card */}
          <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#6DBEDF] to-[#4B9DBE] shadow-[0_8px_30px_rgb(109,190,223,0.3)] border border-white/10 overflow-hidden min-h-[350px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(109,190,223,0.5)] transition-all duration-300">
            <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Key Metrics</h3>
            </div>
            <div className="p-5 sm:p-6 grid grid-cols-2 gap-4 flex-1 overflow-y-auto min-h-0 items-stretch">
              {/* Metric 1 */}
              <div className="bg-white/10 border border-white/10 p-4 sm:p-5 rounded-2xl flex flex-col justify-center items-center text-center backdrop-blur-md">
                <p className="text-white/80 text-sm font-bold mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Total Revenue</p>
                <p className="text-white text-2xl font-bold">{stats.revenue.toLocaleString()}</p>
              </div>
              {/* Metric 2 */}
              <div className="bg-white/10 border border-white/10 p-4 sm:p-5 rounded-2xl flex flex-col justify-center items-center text-center backdrop-blur-md">
                <p className="text-white/80 text-sm font-bold mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Total Sessions</p>
                <p className="text-white text-2xl font-bold">{stats.sessions}</p>
              </div>
              {/* Metric 3 */}
              <div className="bg-white/10 border border-white/10 p-4 sm:p-5 rounded-2xl flex flex-col justify-center items-center text-center backdrop-blur-md">
                <p className="text-white/80 text-sm font-bold mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Total Hours</p>
                <p className="text-white text-2xl font-bold">{stats.hours}</p>
              </div>
              {/* Metric 4 */}
              <div className="bg-white/10 border border-white/10 p-4 sm:p-5 rounded-2xl flex flex-col justify-center items-center text-center backdrop-blur-md hover:bg-white/20 transition-colors cursor-pointer">
                <p className="text-white/80 text-sm font-bold mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>DLA- 20</p>
                <p className="text-white text-lg font-bold">Take Test</p>
              </div>
            </div>
          </div>

          {/* Calendar Card (Now bottom left) */}
          <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#ABA5D1] to-[#867EB5] shadow-[0_8px_30px_rgb(171,165,209,0.3)] border border-white/10 overflow-hidden min-h-[450px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(171,165,209,0.5)] transition-all duration-300">
            <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Calendar</h3>
              <button
                onClick={() => navigate('/manage-calendar')}
                className="bg-white text-[#867EB5] px-4 py-1.5 text-xs font-bold hover:bg-gray-50 transition-all rounded-full shadow-lg flex items-center gap-2"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Manage
              </button>
            </div>
            <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col text-white">
              <style>{`
                /* Override Calendar styles for this specific container to make text white */
                .calendar-container {
                  color: white;
                }
                .calendar-container h3, 
                .calendar-container h4, 
                .calendar-container p, 
                .calendar-container span, 
                .calendar-container div {
                  color: white;
                  border-color: rgba(255, 255, 255, 0.2);
                }
                .calendar-container .bg-teal-50 {
                  background-color: white !important;
                }
                .calendar-container .bg-teal-50 span {
                  color: #867EB5 !important;
                }
                .calendar-container .hover\\:bg-gray-50:hover {
                  background-color: rgba(255, 255, 255, 0.2) !important;
                }
                /* Fix for tooltip and other explicit white backgrounds */
                .calendar-container .bg-white {
                   background-color: rgba(255, 255, 255, 0.95) !important;
                }
                .calendar-container .bg-white span,
                .calendar-container .bg-white div,
                .calendar-container .bg-white h3,
                .calendar-container .bg-white h4,
                .calendar-container .bg-white p {
                   color: #333 !important;
                }
                /* Specifically preserve the dot colors by NOT using * selector */
              `}</style>
              <div className="calendar-container h-full w-full">
                <Calendar
                  userRole="doctor"
                  onSessionClick={handleSessionClick}
                  refreshTrigger={calendarRefreshTrigger}
                  hideTitle={true}
                  hideManageButton={true}
                />
              </div>
            </div>
          </div>

          {/* Tasks & Reports Card (Now bottom right) */}
          <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#78BE9F] to-[#579F80] shadow-[0_8px_30px_rgb(120,190,159,0.3)] border border-white/10 overflow-hidden min-h-[350px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(120,190,159,0.5)] transition-all duration-300">
            <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Tasks & Reports</h3>
            </div>
            <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar min-h-0 flex flex-col">
              <div>
                <h4 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2">Recent Tasks</h4>
                {assignedTasks.length > 0 ? (
                  assignedTasks.slice(0, 2).map((task: any) => (
                    <div key={task._id} className="mb-2 bg-white/10 border border-white/10 p-3 rounded-xl backdrop-blur-md flex justify-between items-center text-sm text-white">
                      <span className="font-medium truncate mr-2">{task.title}</span>
                      <span className="text-white/70 whitespace-nowrap">{task.patientId.firstName}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-white/60 text-sm italic">No tasks assigned</p>
                )}
              </div>
              <div>
                <h4 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-2 mt-2">Recent Reports</h4>
                {recentReports.length > 0 ? (
                  recentReports.slice(0, 2).map((report: any) => (
                    <div key={report._id} className="mb-2 bg-white/10 border border-white/10 p-3 rounded-xl backdrop-blur-md flex justify-between items-center text-sm text-white">
                      <span className="font-medium truncate mr-2">{report.title}</span>
                      <span className="text-white/70 whitespace-nowrap">{report.patientId.firstName}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-white/60 text-sm italic">No reports created</p>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 pt-2 flex justify-center gap-4 shrink-0">
              <button
                onClick={() => navigate('/doctor-tasks')}
                className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                All Tasks
              </button>
              <button
                onClick={() => navigate('/doctor-reports')}
                className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                All Reports
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Instant Session Request Modal */}
      {incomingRequest && (
        <InstantRequestModal
          session={incomingRequest}
          isOpen={!!incomingRequest}
          onAccept={handleAcceptRequest}
          onDelay={handleDelayRequest}
          onClose={() => setIncomingRequest(null)}
        />
      )}

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

      {/* Mandatory Post-Session Clinical Report */}
      {pendingReportData && (
        <PostSessionReportModal
          isOpen={showPostSessionReport}
          sessionId={pendingReportData.sessionId}
          patientId={pendingReportData.patientId}
          patientName={pendingReportData.patientName}
          doctorName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
          sessionDuration={pendingReportData.sessionDuration}
          onSubmit={() => {
            setShowPostSessionReport(false);
            setPendingReportData(null);
            queryClient.invalidateQueries({ queryKey: ['doctor'] }); // Refresh to show new report in list
            toast.success('Report submitted successfully!');
          }}
          onCancel={() => {
            // Even if cancelled, we might want to keep it available or warn
            setShowPostSessionReport(false);
            toast('Report draft saved. Please complete it from the Reports section.', { icon: '' });
          }}
        />
      )}
    </div>
  );
};

export default DoctorDashboard;
