import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Calendar from '../components/Calendar';
import SessionModal from '../components/SessionModal';
import RatingModal from '../components/RatingModal';
import WelcomeModal from '../components/WelcomeModal';
import BookingPreferenceModal from '../components/BookingPreferenceModal';
import EmergencyHotlineModal from '../components/EmergencyHotlineModal';
import PatientCalendarModal from '../components/PatientCalendarModal';
import ConnectionStatus from '../components/ConnectionStatus';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import type { Session, Report, Task, JournalEntry } from '../types';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const PatientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);

  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState<Session | null>(null);

  //  REAL-TIME: Connect to data socket
  const { socket } = useDataSocket();
  const queryClient = useQueryClient();

  // Show welcome modal only once
  useEffect(() => {
    if (user && user.profileCompleted === false) {
      const hasSeenWelcome = localStorage.getItem(`welcomeModal_${user.userId}`);
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true);
      }
    }
  }, [user]);

  // Replace manual fetching with React Query
  const { data: recentReports = [] } = useQuery({
    queryKey: ['patient', 'reports', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      return (data.reports || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: pendingTasks = [] } = useQuery({
    queryKey: ['patient', 'tasks', user?.userId, 'pending'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user?.userId}?status=pending`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      return (data.tasks || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: recentJournal = [] } = useQuery({
    queryKey: ['patient', 'journal', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/patient/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch journal');
      const data = await res.json();
      return (data.journals || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['chat', 'unreadCount'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/chat/unread-count`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch unread count');
      const data = await res.json();
      return data.unreadCount || 0;
    },
    enabled: !!user?.userId,
    refetchInterval: 10000,
  });

  const { data: latestScores = {} } = useQuery({
    queryKey: ['patient', 'assessments', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/assessments`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch assessments');
      const data = await res.json();
      const scoresMap: Record<string, any> = {};
      if (data.success && Array.isArray(data.assessments)) {
        data.assessments.forEach((assessment: any) => {
          if (!scoresMap[assessment.testType]) {
            scoresMap[assessment.testType] = {
              _id: assessment.testType,
              latestScore: assessment.scores?.total || 0,
              latestSeverity: assessment.scores?.severity || 'minimal',
              latestDate: assessment.completedAt
            };
          }
        });
      }
      return scoresMap;
    },
    enabled: !!user?.userId,
  });

  const { data: pendingFeedbackSession } = useQuery({
    queryKey: ['patient', 'pendingFeedback'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/sessions/pending-feedback`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch pending feedback');
      const data = await res.json();
      return data.session || null;
    },
    enabled: !!user?.userId,
  });

  useEffect(() => {
    if (pendingFeedbackSession) {
      setSessionToRate(pendingFeedbackSession);
      setShowRatingModal(true);
    }
  }, [pendingFeedbackSession]);

  //  REAL-TIME: Listen for session events
  useEffect(() => {
    if (!socket) return;

    socket.on('session:booked', ({ session }) => {
      toast.success('New session booked!');
      setCalendarRefreshTrigger(prev => prev + 1);
    });

    socket.on('session:cancelled', ({ sessionId, cancelledBy }) => {
      toast('A session was cancelled');
      setCalendarRefreshTrigger(prev => prev + 1);
    });

    socket.on('session:status-change', ({ sessionId, status }) => {
      setCalendarRefreshTrigger(prev => prev + 1);
    });

    socket.on('chat:new-message', ({ message, senderName }) => {
      toast(`New message from ${senderName}`);
      queryClient.invalidateQueries({ queryKey: ['chat', 'unreadCount'] });
    });

    return () => {
      socket.off('session:booked');
      socket.off('session:cancelled');
      socket.off('session:status-change');
      socket.off('chat:new-message');
    };
  }, [socket, queryClient]);

  //  FALLBACK REFRESH: Detect navigation state and refresh dashboard
  useEffect(() => {
    const state = location.state as { refreshSessions?: boolean; showRating?: boolean; sessionId?: string };

    if (state?.refreshSessions) {
      toast.success('Session booked! Refreshing dashboard...');
      setCalendarRefreshTrigger(prev => prev + 1);
    }

    if (state?.showRating) {
      queryClient.invalidateQueries({ queryKey: ['patient', 'pendingFeedback'] });
    }

    // Clear state to prevent repeat triggers on refresh
    if (state?.refreshSessions || state?.showRating) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, queryClient]);

  const handleRatingSubmit = async (ratingData: { score: number; review: string }) => {
    console.log('[PATIENT-DASHBOARD] Rating submitted:', ratingData);
    setCalendarRefreshTrigger(prev => prev + 1);
    queryClient.invalidateQueries({ queryKey: ['patient', 'pendingFeedback'] });
    toast.success('Thank you for your feedback!');
  };

  // Removed individual fetch functions - now using parallel loading in useEffect

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      logger.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  const getSeverityColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 75) return '#EF4444'; // Red - Severe
    if (percentage >= 50) return '#F59E0B'; // Orange - Moderate
    if (percentage >= 25) return '#FCD34D'; // Yellow - Mild
    return '#10B981'; // Green - Minimal
  };

  const getSeverityLabel = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 75) return 'Severe';
    if (percentage >= 50) return 'Moderate';
    if (percentage >= 25) return 'Mild';
    return 'Minimal';
  };

  const renderTestCard = (testId: string, testName: string, maxScore: number) => {
    const scoreData = latestScores[testId];
    const hasScore = scoreData && scoreData.latestScore !== undefined;
    const score = hasScore ? scoreData.latestScore : 0;
    const percentage = (score / maxScore) * 100;
    const severityColor = getSeverityColor(score, maxScore);
    const severityLabel = getSeverityLabel(score, maxScore);

    // Format date
    const lastTaken = hasScore && scoreData.latestDate
      ? new Date(scoreData.latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    return (
      <div key={testId} className="bg-white/10 p-4 rounded-2xl border border-white/10 flex flex-col h-full hover:bg-white/20 hover:shadow-lg transition-all shadow-sm backdrop-blur-md">
        <p className="text-white text-sm font-bold mb-3 drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          {testName}
        </p>

        {hasScore ? (
          <>
            {/* Score Display */}
            <div className="mb-3">
              <div className="flex items-baseline justify-center gap-1 mb-1">
                <span className="text-3xl font-bold text-white drop-shadow-sm">
                  {score}
                </span>
                <span className="text-white/70 text-sm">/{maxScore}</span>
              </div>
              <p className="text-xs text-center font-bold" style={{ color: severityColor === '#EF4444' ? '#FFD1D1' : severityColor === '#F59E0B' ? '#FFE4A0' : severityColor === '#FCD34D' ? '#FEF08A' : '#A7F3D0', fontFamily: 'Inter, sans-serif', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                {severityLabel}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="w-full bg-black/10 rounded-full h-2 overflow-hidden shadow-inner">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(percentage, 100)}%`,
                    backgroundColor: severityColor === '#EF4444' ? '#FF8A8A' : severityColor === '#F59E0B' ? '#FFD166' : severityColor === '#FCD34D' ? '#FDE047' : '#6EE7B7'
                  }}
                />
              </div>
            </div>

            {/* Last Taken Date */}
            {lastTaken && (
              <p className="text-xs text-white/80 text-center mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Taken on {lastTaken}
              </p>
            )}

            {/* Retest Button */}
            <button
              onClick={() => navigate(`/mental-health/${testId}`)}
              className="text-sm font-bold text-white/90 hover:text-white hover:underline mt-auto text-center w-full"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Retest
            </button>
          </>
        ) : (
          <>
            {/* No Score - Take Test */}
            <div className="flex-1 flex items-center justify-center py-4">
              <p className="text-white/60 text-xs mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Not taken yet
              </p>
            </div>
            <button
              onClick={() => navigate(`/mental-health/${testId}`)}
              className="text-base font-bold text-white hover:underline text-center w-full"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Take Test
            </button>
          </>
        )}
      </div>
    );
  };

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsSessionModalOpen(true);
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
      />   {/* Sidebar Overlay - Transparent */}
      {
        sidebarOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )
      }

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-screen w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 bg-white border-r border-gray-100 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        <div className="h-full flex flex-col p-5 pt-8 font-sans">
          {/* Sidebar Mobile Close Button */}
          <div className="flex justify-end mb-4 md:hidden">
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Main Menu Items */}
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            
            {/* MAIN SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Main</h3>
              <div className="space-y-1">
                {/* Active Item - Dashboard */}
                <div className="flex items-center space-x-3 cursor-pointer bg-gray-100/70 px-4 py-2.5 rounded-xl transition-colors group">
                  <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold text-gray-900">Overview</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/messages'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Messages</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/pending-tasks'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Tasks</span>
                </div>
              </div>
            </div>

            {/* CLINICAL SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical</h3>
              <div className="space-y-1">
                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Calls</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/my-tests'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Tests</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/my-journal'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Journal</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/my-therapists'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Therapists</span>
                </div>
              </div>
            </div>

            {/* ACCOUNT SECTION */}
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Account</h3>
              <div className="space-y-1">
                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/patient-profile-setup'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Profile</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/payments'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Billing</span>
                </div>

                <div
                  className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group"
                  onClick={() => { navigate('/settings'); setSidebarOpen(false); }}
                >
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Settings</span>
                </div>
              </div>
            </div>
            
            {/* LOGOUT */}
            <div className="pt-4 mt-6 border-t border-gray-100">
              <div
                className="flex items-center space-x-3 cursor-pointer text-gray-500 hover:text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors group"
                onClick={handleLogout}
              >
                <svg className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-[13.5px] font-semibold">Sign Out</span>
              </div>
            </div>

          </div>
        </div>
      </div>

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
                })()}, {user?.firstName || user?.username || 'User'}
              </h1>
            </div>

            {/* Right side - Chat, Book Session and Balance */}
            <div className="flex items-center justify-end space-x-2 md:space-x-4 w-1/3">
              {/* Emergency Hotline Button */}
              <button
                onClick={() => setIsHotlineModalOpen(true)}
                className="relative p-2.5 hover:bg-black/5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 group"
                title="Emergency Helplines"
              >
                <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75v-4.5m0 4.5h4.5m-4.5 0l6-6m-3 18c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a17.14 17.14 0 006.571 6.571l.97-1.293c.271-.363.734-.527 1.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
                </svg>
              </button>

              {/* Chat Icon with Badge */}
              <button
                onClick={() => navigate('/messages')}
                className="relative p-2.5 hover:bg-black/5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <svg className="w-5 h-5 text-gray-600 hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                {/* Notification Badge */}
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                    {unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setIsBookingModalOpen(true)}
                className="px-6 py-2.5 md:px-7 md:py-2.5 text-white rounded-full font-bold tracking-wide transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 text-sm"
                style={{ backgroundColor: '#38ABAE', fontFamily: 'Inter, sans-serif' }}
              >
                Book Session
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="h-[calc(100%-4rem)] overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 font-serif">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          /* 2x2 Grid Layout */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-10">

            {/* Reports & Recommendation Card */}
            <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#38ABAE] to-[#2A8285] shadow-[0_8px_30px_rgb(56,171,174,0.3)] border border-white/10 overflow-hidden min-h-[350px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(56,171,174,0.5)] transition-all duration-300">
              <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
                <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Reports & Recommendation</h3>
              </div>
              <div className="p-5 sm:p-6 space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-0 flex flex-col">
                {recentReports.length > 0 ? (
                  recentReports.map((report: Report) => {
                    let parsedContent: any = {};
                    try {
                      parsedContent = JSON.parse(report.content);
                    } catch (e) {
                      parsedContent = { summary: report.content };
                    }
                    const isExpanded = expandedReportId === report._id;
                    const snippet = parsedContent.summary || parsedContent.recommendations || parsedContent.diagnosis || '';
                    const displaySnippet = snippet.length > 80 ? snippet.substring(0, 77) + '...' : snippet;

                    return (
                      <div 
                        key={report._id} 
                        className="mb-3 cursor-pointer hover:shadow-lg bg-white/10 hover:bg-white/20 border border-white/10 p-4 sm:p-5 rounded-2xl transition-all shadow-sm backdrop-blur-md"
                        onClick={() => setExpandedReportId(isExpanded ? null : report._id)}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-white font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {formatDate(report.createdAt)} <span className="text-white/60 mx-1">•</span> Dr. {report.doctorId?.firstName || 'Unknown'} {report.doctorId?.lastName || ''}
                          </p>
                          <svg 
                            className={`w-4 h-4 text-white/70 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        
                        {!isExpanded && displaySnippet && (
                          <p className="text-xs text-white/80 mt-1.5 font-medium truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {displaySnippet}
                          </p>
                        )}

                        {isExpanded && (
                          <div className="mt-4 bg-white/20 rounded-2xl p-5 text-white space-y-4 text-sm animate-fadeIn shadow-sm border border-white/20">
                            {parsedContent.diagnosis && (
                              <div>
                                <span className="font-bold text-white/90 uppercase text-[9px] tracking-wider block font-sans">Diagnosis</span>
                                <p className="text-white font-medium drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{parsedContent.diagnosis}</p>
                              </div>
                            )}
                            {parsedContent.summary && (
                              <div>
                                <span className="font-bold text-white/90 uppercase text-[9px] tracking-wider block font-sans">Summary</span>
                                <p className="text-white leading-relaxed whitespace-pre-wrap drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{parsedContent.summary}</p>
                              </div>
                            )}
                            {parsedContent.recommendations && (
                              <div>
                                <span className="font-bold text-white/90 uppercase text-[9px] tracking-wider block font-sans">Recommendations</span>
                                <p className="text-white leading-relaxed whitespace-pre-wrap drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{parsedContent.recommendations}</p>
                              </div>
                            )}
                            {parsedContent.observations && parsedContent.observations.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {parsedContent.observations.map((obs: string) => (
                                  <span key={obs} className="px-1.5 py-0.5 bg-white text-[#38ABAE] text-[9px] font-bold rounded-md font-sans">
                                    {obs}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8">
                    <p className="text-white/80 text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>No reports yet</p>
                  </div>
                )}
              </div>
              <div className="px-6 pb-6 pt-2 flex justify-center shrink-0">
                <button
                  onClick={() => navigate('/reports-recommendation')}
                  className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  View All
                </button>
              </div>
            </div>

            {/* Mental Health Screening Card */}
            <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#ABA5D1] to-[#867EB5] shadow-[0_8px_30px_rgb(171,165,209,0.3)] border border-white/10 overflow-hidden min-h-[400px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(171,165,209,0.5)] transition-all duration-300">
              <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
                <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Mental Health Screening</h3>
              </div>
              <div className="p-5 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 overflow-y-auto min-h-0 items-stretch">
                {(() => {
                  const defaultTests = ['depression', 'anxiety', 'adhd', 'disability'];
                  
                  // Get all unique test IDs (defaults + taken)
                  const allTestIds = Array.from(new Set([...defaultTests, ...Object.keys(latestScores)]));
                  
                  // Sort them: prefer ones with scores, and then by latest date
                  const sortedTestIds = allTestIds.sort((a, b) => {
                    const scoreA = latestScores[a];
                    const scoreB = latestScores[b];
                    
                    // 1. Prefer ones with scores
                    if (scoreA && !scoreB) return -1;
                    if (!scoreA && scoreB) return 1;
                    
                    // 2. If both have scores, prefer the latest one
                    if (scoreA && scoreB) {
                      const dateA = new Date(scoreA.latestDate).getTime();
                      const dateB = new Date(scoreB.latestDate).getTime();
                      return dateB - dateA; // Descending order (latest first)
                    }
                    
                    // 3. If neither has scores, keep default order
                    const indexA = defaultTests.indexOf(a);
                    const indexB = defaultTests.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    
                    return 0;
                  });
                  
                  // Keep top 4 only
                  const testsToRender = sortedTestIds.slice(0, 4);

                  return testsToRender.map((testId) => {
                    const testDef = MENTAL_HEALTH_TESTS[testId];
                    let testName = testDef ? `${testDef.name} Score` : `${testId} Score`;
                    let maxScore = testDef ? testDef.scoring.maxScore : 100;
                    
                    // Fallback for hardcoded defaults if not in MENTAL_HEALTH_TESTS
                    if (testId === 'disability') {
                        testName = 'DLA-20';
                        maxScore = 80;
                    } else if (testId === 'depression' && !testDef) {
                        testName = 'Depression Score';
                        maxScore = 27;
                    } else if (testId === 'anxiety' && !testDef) {
                        testName = 'Anxiety Score';
                        maxScore = 21;
                    } else if (testId === 'adhd' && !testDef) {
                        testName = 'ADHD Score';
                        maxScore = 72;
                    }

                    return renderTestCard(testId, testName, maxScore);
                  });
                })()}
              </div>

              {/* Minimal View All Option */}
              <div className="px-6 pb-6 pt-2 flex justify-center shrink-0">
                <button
                  onClick={() => navigate('/mental-health')}
                  className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm flex items-center gap-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  View All Tests
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Calendar Card */}
            <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#ABA5D1] to-[#867EB5] shadow-[0_8px_30px_rgb(171,165,209,0.3)] border border-white/10 overflow-hidden min-h-[450px] lg:min-h-0 hover:shadow-[0_8px_30px_rgb(171,165,209,0.5)] transition-all duration-300">
              <div className="px-6 py-4 shrink-0 flex items-center justify-between border-b border-white/10">
                <h3 className="text-lg font-bold text-white font-sans tracking-wide drop-shadow-sm">Calendar</h3>
                <button
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="px-4 py-1.5 bg-white text-[#867EB5] hover:bg-gray-50 rounded-full font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
                    userRole="patient"
                    onSessionClick={handleSessionClick}
                    refreshTrigger={calendarRefreshTrigger}
                    hideTitle={true}
                  />
                </div>
              </div>
            </div>

            {/* My Journal + Pending Tasks Card */}
            <div className="flex flex-col space-y-4 h-full min-h-[500px]">
              {/* My Journal Section */}
              <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#6DBEDF] to-[#4B9DBE] shadow-[0_8px_30px_rgb(109,190,223,0.3)] border border-white/10 overflow-hidden flex-1 min-h-0 hover:shadow-[0_8px_30px_rgb(109,190,223,0.5)] transition-all duration-300">
                <div className="px-5 py-3 shrink-0 flex items-center justify-between border-b border-white/10">
                  <h3 className="text-base font-bold text-white font-sans tracking-wide drop-shadow-sm">My Journal</h3>
                </div>
                <div className="p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                  <div className="grid grid-cols-2 gap-2 text-[10px] mb-3 font-bold text-white/70 uppercase tracking-widest pb-2 border-b border-white/10" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <span>Date</span>
                    <span>Subject</span>
                  </div>
                  {recentJournal.length > 0 ? (
                    recentJournal.map((entry: JournalEntry) => (
                      <div key={entry._id} className="grid grid-cols-2 gap-2 text-sm text-white font-medium mb-3 bg-white/10 hover:bg-white/20 border border-white/10 hover:shadow-lg p-4 rounded-2xl transition-all cursor-pointer backdrop-blur-md" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <span className="text-white drop-shadow-sm">{formatDate(entry.createdAt)}</span>
                        <span className="truncate drop-shadow-sm">{entry.title}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-white/80 text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>No journal entries yet</p>
                    </div>
                  )}
                </div>
                <div className="px-5 pb-5 pt-1 flex justify-center shrink-0">
                  <button
                    onClick={() => navigate('/my-journal')}
                    className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    View All
                  </button>
                </div>
              </div>

              {/* Pending Tasks Section */}
              <div className="flex flex-col rounded-[24px] bg-gradient-to-br from-[#78BE9F] to-[#579F80] shadow-[0_8px_30px_rgb(120,190,159,0.3)] border border-white/10 overflow-hidden flex-1 min-h-0 hover:shadow-[0_8px_30px_rgb(120,190,159,0.5)] transition-all duration-300">
                <div className="px-5 py-3 shrink-0 flex items-center justify-between border-b border-white/10">
                  <h3 className="text-base font-bold text-white font-sans tracking-wide drop-shadow-sm">Pending Tasks</h3>
                </div>
                <div className="p-4 sm:p-5 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                  <div className="grid grid-cols-3 gap-2 text-[10px] mb-3 font-bold text-white/70 uppercase tracking-widest pb-2 border-b border-white/10" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <span>Date</span>
                    <span>Dr. Name</span>
                    <span>Tasks</span>
                  </div>
                  {pendingTasks.length > 0 ? (
                    pendingTasks.map((task: Task) => (
                      <div key={task._id} className="grid grid-cols-3 gap-2 text-sm text-white font-medium mb-3 bg-white/10 hover:bg-white/20 border border-white/10 hover:shadow-lg p-4 rounded-2xl transition-all cursor-pointer backdrop-blur-md" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <span className="text-white drop-shadow-sm truncate">{formatDate(task.dueDate)}</span>
                        <span className="truncate drop-shadow-sm">Dr. {task.doctorId?.firstName || 'Unknown'} {task.doctorId?.lastName || ''}</span>
                        <span className="truncate drop-shadow-sm">{task.title}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-white/80 text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>No pending tasks</p>
                    </div>
                  )}
                </div>
                <div className="px-5 pb-5 pt-1 flex justify-center shrink-0">
                  <button
                    onClick={() => navigate('/pending-tasks')}
                    className="px-5 py-1.5 text-xs font-bold bg-white/20 hover:bg-white/30 text-white transition-all rounded-full border border-white/20 backdrop-blur-sm uppercase tracking-wider shadow-sm"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    View All
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
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

      {/* Booking Preference Modal */}
      <BookingPreferenceModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        serviceType="General"
      />

      {/* Emergency Hotline Modal */}
      <EmergencyHotlineModal
        isOpen={isHotlineModalOpen}
        onClose={() => setIsHotlineModalOpen(false)}
      />

      {/* Patient Calendar Modal */}
      <PatientCalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
      />

      {/* Auto Rating Modal */}
      {sessionToRate && (
        <RatingModal
          isOpen={showRatingModal}
          sessionId={sessionToRate._id}
          doctorName={sessionToRate.doctorId?.lastName ? `Dr. ${sessionToRate.doctorId.firstName || ''} ${sessionToRate.doctorId.lastName}` : 'your therapist'}
          onClose={() => {
            setShowRatingModal(false);
            setSessionToRate(null);
          }}
          onSubmit={handleRatingSubmit}
        />
      )}
    </div>
  );
};

export default PatientDashboard;
