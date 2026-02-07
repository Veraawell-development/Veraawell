import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Calendar from '../components/Calendar';
import SessionModal from '../components/SessionModal';
import RatingModal from '../components/RatingModal';
import WelcomeModal from '../components/WelcomeModal';
import BookingPreferenceModal from '../components/BookingPreferenceModal';
import EmergencyHotlineModal from '../components/EmergencyHotlineModal';
import PatientCalendarModal from '../components/PatientCalendarModal';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate } from '../utils/dateUtils';
import logger from '../utils/logger';
import type { Session, Report, Task, JournalEntry } from '../types';

const PatientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [userName, setUserName] = useState<string>('User');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [recentJournal, setRecentJournal] = useState<JournalEntry[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [latestScores, setLatestScores] = useState<Record<string, any>>({});
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState<Session | null>(null);

  useEffect(() => {
    if (!user) return;

    // Load all dashboard data in parallel
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        // Parallel API calls for better performance
        const [profileRes, reportsRes, tasksRes, journalRes, unreadRes, scoresRes] = await Promise.all([
          fetch(`${API_CONFIG.BASE_URL}/auth/profile`, { credentials: 'include' }),
          fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user.userId}`, { credentials: 'include' }),
          fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user.userId}?status=pending`, { credentials: 'include' }),
          fetch(`${API_CONFIG.BASE_URL}/session-tools/journal/patient/${user.userId}`, { credentials: 'include' }),
          fetch(`${API_CONFIG.BASE_URL}/chat/unread-count`, { credentials: 'include' }),
          fetch(`${API_CONFIG.BASE_URL}/assessments/stats/summary`, { credentials: 'include' })
        ]);

        if (profileRes.ok) {
          const userData = await profileRes.json();
          setUserName(userData.firstName || userData.username || 'User');
        }

        if (reportsRes.ok) {
          const reports = await reportsRes.json();
          setRecentReports(reports.slice(0, 2));
        }

        if (tasksRes.ok) {
          const tasks = await tasksRes.json();
          setPendingTasks(tasks.slice(0, 1));
        }

        if (journalRes.ok) {
          const journals = await journalRes.json();
          setRecentJournal(journals.slice(0, 1));
        }

        if (unreadRes.ok) {
          const data = await unreadRes.json();
          setUnreadCount(data.unreadCount || 0);
        }

        if (scoresRes.ok) {
          const stats = await scoresRes.json();
          const scoresMap: Record<string, any> = {};
          stats.forEach((stat: any) => {
            scoresMap[stat._id] = stat;
          });
          setLatestScores(scoresMap);
        }
      } catch (error) {
        logger.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
    setCalendarRefreshTrigger(prev => prev + 1);
    checkForUnratedSessions();

    // Show welcome modal only once
    const hasSeenWelcome = localStorage.getItem(`welcomeModal_${user.userId}`);
    if (!hasSeenWelcome && user.profileCompleted === false) {
      setShowWelcomeModal(true);
    }
  }, [user]);

  // Check for unrated completed sessions
  const checkForUnratedSessions = async () => {
    try {
      console.log('[AUTO-RATING] Checking for unrated sessions...');

      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/call-history`, {
        credentials: 'include'
      });

      console.log('[AUTO-RATING] Response status:', response.status);

      if (response.ok) {
        const sessions = await response.json();
        console.log('[AUTO-RATING] Total sessions:', sessions.length);
        console.log('[AUTO-RATING] Sessions:', sessions);

        // Find the most recent completed session without a rating
        const unratedSession = sessions.find((session: Session) => {
          console.log(`[AUTO-RATING] Session ${session._id}:`, {
            status: session.status,
            hasRating: !!session.rating,
            ratingScore: session.rating?.score,
            doctorName: `${session.doctorId?.firstName} ${session.doctorId?.lastName}`
          });

          // Check if session is completed (might be 'ended' or other status)
          const isCompleted = session.status === 'completed' || session.status === 'ended';
          const hasNoRating = !session.rating || !session.rating.score;

          return isCompleted && hasNoRating;
        });

        console.log('[AUTO-RATING] Unrated session found:', unratedSession);

        if (unratedSession) {
          // Check if we've already shown rating modal for this session
          const ratedSessions = JSON.parse(localStorage.getItem('ratedSessions') || '[]');
          console.log('[AUTO-RATING] Previously rated sessions:', ratedSessions);

          if (!ratedSessions.includes(unratedSession._id)) {
            console.log('[AUTO-RATING] Showing rating modal for session:', unratedSession._id);
            setSessionToRate(unratedSession);
            setShowRatingModal(true);
          } else {
            console.log('[AUTO-RATING] Session already rated/dismissed');
          }
        } else {
          console.log('[AUTO-RATING] No unrated sessions found');
        }
      }
    } catch (error) {
      console.error('[AUTO-RATING] Error checking for unrated sessions:', error);
      logger.error('Error checking for unrated sessions:', error);
    }
  };

  // Handle rating submission
  const handleRatingSubmit = async (ratingData: { score: number; review: string }) => {
    if (!sessionToRate) return;

    try {
      console.log('[RATING] Submitting rating from dashboard:', { sessionId: sessionToRate._id, score: ratingData.score });

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_CONFIG.BASE_URL}/ratings/${sessionToRate._id}/rate`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(ratingData)
      });

      console.log('[RATING] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[RATING] Success:', data);

        // Mark this session as rated
        const ratedSessions = JSON.parse(localStorage.getItem('ratedSessions') || '[]');
        ratedSessions.push(sessionToRate._id);
        localStorage.setItem('ratedSessions', JSON.stringify(ratedSessions));

        setShowRatingModal(false);
        setSessionToRate(null);
        alert('Thank you for your rating!');
      } else {
        const data = await response.json();
        console.error('[RATING] Error response:', data);
        alert(data.message || 'Failed to submit rating');
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating');
    }
  };

  // Removed individual fetch functions - now using parallel loading in useEffect

  const handleLogout = async () => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
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
      <div key={testId} className="bg-white p-4 rounded-lg border border-gray-200 flex flex-col">
        <p className="text-gray-700 text-sm font-semibold mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
          {testName}
        </p>

        {hasScore ? (
          <>
            {/* Score Display */}
            <div className="mb-3">
              <div className="flex items-baseline justify-center gap-1 mb-1">
                <span className="text-3xl font-bold" style={{ color: severityColor, fontFamily: 'Bree Serif, serif' }}>
                  {score}
                </span>
                <span className="text-gray-500 text-sm">/{maxScore}</span>
              </div>
              <p className="text-xs text-center font-medium" style={{ color: severityColor, fontFamily: 'Inter, sans-serif' }}>
                {severityLabel}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(percentage, 100)}%`,
                    backgroundColor: severityColor
                  }}
                />
              </div>
            </div>

            {/* Last Taken Date */}
            {lastTaken && (
              <p className="text-xs text-gray-500 text-center mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Taken on {lastTaken}
              </p>
            )}

            {/* Retest Button */}
            <button
              onClick={() => navigate(`/mental-health/${testId}`)}
              className="text-sm font-semibold hover:underline mt-auto"
              style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
            >
              Retest
            </button>
          </>
        ) : (
          <>
            {/* No Score - Take Test */}
            <div className="flex-1 flex items-center justify-center py-4">
              <p className="text-gray-400 text-xs mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                Not taken yet
              </p>
            </div>
            <button
              onClick={() => navigate(`/mental-health/${testId}`)}
              className="text-base font-semibold hover:underline"
              style={{ color: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
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
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white font-serif">
          {/* Main Menu Items */}
          <div className="space-y-3 flex-1">
            <div className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-base font-medium">My Dashboard</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/messages'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-base font-medium">My Messages</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/patient-profile-setup'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-base font-medium">My Profile</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-base font-medium">My Calls</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/pending-tasks'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span className="text-base font-medium">Pending Tasks</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/my-tests'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-base font-medium">My Tests</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/my-journal'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-base font-medium">My Journal</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/my-therapists'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-base font-medium">My Therapists</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/payments'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-base font-medium">My Payments</span>
            </div>
          </div>

          {/* Bottom Menu Items */}
          <div className="mt-auto space-y-3">
            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/settings'); setSidebarOpen(false); }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-base font-medium">Settings</span>
            </div>

            <div
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
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
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors z-10 relative"
                type="button"
                aria-label="Open menu"
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
              {/* Emergency Hotline Button */}
              <button
                onClick={() => setIsHotlineModalOpen(true)}
                className="relative p-2 hover:bg-red-50 rounded-full transition-colors group"
                title="Emergency Helplines"
              >
                <svg className="w-6 h-6 text-red-500 group-hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>

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
                onClick={() => setIsBookingModalOpen(true)}
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
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 font-serif">Loading dashboard...</p>
            </div>
          </div>
        ) : (
          /* 2x2 Grid Layout */
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
                {/* Depression Test Card */}
                {renderTestCard('depression', 'Depression Score', 27)}

                {/* Anxiety Test Card */}
                {renderTestCard('anxiety', 'Anxiety Score', 21)}

                {/* ADHD Test Card */}
                {renderTestCard('adhd', 'ADHD Score', 72)}

                {/* DLA-20 Test Card */}
                {renderTestCard('disability', 'DLA-20', 80)}
              </div>
            </div>

            {/* Calendar Card */}
            <div className="flex flex-col">
              {/* Manage Calendar Button */}
              <div className="mb-4">
                <button
                  onClick={() => setIsCalendarModalOpen(true)}
                  className="w-full px-6 py-3 text-white rounded-xl font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#ABA5D1', fontFamily: 'Inter, sans-serif' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Manage Calendar
                </button>
              </div>

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
      {sessionToRate && sessionToRate.doctorId && (
        <RatingModal
          isOpen={showRatingModal}
          sessionId={sessionToRate._id}
          doctorName={`Dr. ${sessionToRate.doctorId.firstName} ${sessionToRate.doctorId.lastName}`}
          onClose={() => {
            setShowRatingModal(false);
            // Mark as dismissed so it doesn't show again
            const ratedSessions = JSON.parse(localStorage.getItem('ratedSessions') || '[]');
            ratedSessions.push(sessionToRate._id);
            localStorage.setItem('ratedSessions', JSON.stringify(ratedSessions));
            setSessionToRate(null);
          }}
          onSubmit={handleRatingSubmit}
        />
      )}
    </div>
  );
};

export default PatientDashboard;
