import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import SessionModal from '../components/SessionModal';
import RatingModal from '../components/RatingModal';
import WelcomeModal from '../components/WelcomeModal';
import MoodCheckInModal from '../components/MoodCheckInModal';
import BookingPreferenceModal from '../components/BookingPreferenceModal';
import EmergencyHotlineModal from '../components/EmergencyHotlineModal';
import PatientCalendarModal from '../components/PatientCalendarModal';
import { useAuth } from '../context/AuthContext';
import { API_CONFIG } from '../config/api';
import { formatDate, getGreeting, getDaysUntil, parseTime } from '../utils/dateUtils';
import logger from '../utils/logger';
import type { Session, Report, Task, JournalEntry } from '../types';
import { useDataSocket } from '../hooks/useDataSocket';
import toast from 'react-hot-toast';
import { MENTAL_HEALTH_TESTS } from '../data/mentalHealthTests';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface UpcomingSession extends Session {
  callMode?: string;
}

// ── Design tokens (from the new patient dashboard design spec) ──────────────
const T = {
  bg: '#f6f3ec',
  border: 'rgba(27,43,46,.08)',
  text: '#16262a',
  text2: '#6b7573',
  muted: '#8a938f',
  teal: '#1f7a8c',
  tealHover: '#155e6c',
  green: '#2fae7a',
  greenBg: '#eef6f0',
  terracotta: '#c99a5b',
};
const FONT_SERIF = "'Newsreader', Georgia, serif";
const FONT_SANS = "'Public Sans', 'Inter', sans-serif";

// Frosted-glass card treatment: a white glass base with a soft teal glow
// anchored in the top-left corner. Previously this had no white base at all
// — just a ~2-7% opacity teal wash — so the blurred page background (a warm
// beige, T.bg) showed straight through and the card read as uniformly beige
// instead of white-with-a-corner-accent.
const cardStyle: React.CSSProperties = {
  background: 'radial-gradient(120% 120% at 0% 0%, rgba(31,122,140,.16), rgba(31,122,140,0) 55%), rgba(255,255,255,.82)',
  backdropFilter: 'blur(20px) saturate(110%)',
  WebkitBackdropFilter: 'blur(20px) saturate(110%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 12px 36px rgba(27,43,46,.08), inset 0 1px 0 rgba(255,255,255,.6)',
  borderRadius: 20,
};

// Lighter glass variant for nested sub-cards (mental-health test tiles), matching the doctor dashboard's metric tiles.
const subCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.5)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,.7)',
  borderRadius: 14,
};

// Mood scale: keep the app-wide backend mapping (1-5, established in
// MoodCheckInModal / MoodHistoryCard) but use the new design's dot colors.
const MOOD_DOTS: { value: 1 | 2 | 3 | 4 | 5; label: string; color: string }[] = [
  { value: 1, label: 'Struggling', color: '#b7a99a' },
  { value: 2, label: 'Low', color: '#a9bdb8' },
  { value: 3, label: 'Okay', color: '#8fb0ad' },
  { value: 4, label: 'Good', color: '#2b8a7a' },
  { value: 5, label: 'Great', color: '#1f7a8c' },
];

const getInitials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';

const getReportSnippet = (report: Report) => {
  let text = report.content || '';
  try {
    const parsed = JSON.parse(report.content);
    text = parsed.summary || parsed.recommendations || parsed.diagnosis || report.content;
  } catch {
    // plain-text report content — use as-is
  }
  return text.length > 90 ? text.slice(0, 87) + '...' : text;
};

const getSeverityLabel = (score: number, maxScore: number) => {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 75) return 'Severe';
  if (percentage >= 50) return 'Moderate';
  if (percentage >= 25) return 'Mild';
  return 'Minimal';
};

const getSessionDateTime = (session: { sessionDate: string; sessionTime: string }) => {
  const d = new Date(session.sessionDate);
  const [h, m] = parseTime(session.sessionTime);
  d.setHours(h, m, 0, 0);
  return d;
};

const relativeDayLabel = (dateStr: string) => {
  const daysUntil = getDaysUntil(dateStr);
  if (daysUntil <= 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
};

const formatSessionChip = (session: UpcomingSession) => {
  const dt = getSessionDateTime(session);
  const dayOfWeek = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const dayMonth = dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayOfWeek}, ${dayMonth} · ${time} — ${relativeDayLabel(session.sessionDate)}`;
};

const formatMoreSessionWhen = (session: UpcomingSession) => {
  const dt = getSessionDateTime(session);
  const dayOfWeek = dt.toLocaleDateString('en-US', { weekday: 'short' });
  const dayMonth = dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayOfWeek}, ${dayMonth} · ${time}`;
};

const PatientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);

  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isHotlineModalOpen, setIsHotlineModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [sessionToRate, setSessionToRate] = useState<Session | null>(null);
  const [showMoodModal, setShowMoodModal] = useState(false);
  const [moodSubmitting, setMoodSubmitting] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  const { socket } = useDataSocket();
  const queryClient = useQueryClient();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  // Show welcome modal only once
  useEffect(() => {
    if (user && user.profileCompleted === false) {
      const hasSeenWelcome = localStorage.getItem(`welcomeModal_${user.userId}`);
      if (!hasSeenWelcome) {
        setShowWelcomeModal(true);
      }
    }
  }, [user]);

  const { data: recentReports = [] } = useQuery<Report[]>({
    queryKey: ['patient', 'reports', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports/patient/${user?.userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      return (data.reports || []).slice(0, 4);
    },
    enabled: !!user?.userId,
  });

  const { data: pendingTasks = [] } = useQuery<Task[]>({
    queryKey: ['patient', 'tasks', user?.userId, 'pending'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/tasks/patient/${user?.userId}?status=pending`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch tasks');
      const data = await res.json();
      return data.tasks || [];
    },
    enabled: !!user?.userId,
  });

  const { data: recentJournal = [] } = useQuery<JournalEntry[]>({
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
              latestDate: assessment.completedAt,
            };
          }
        });
      }
      return scoresMap;
    },
    enabled: !!user?.userId,
  });

  // Defense in depth alongside the awaited /complete call in VideoCallRoom: if we
  // just arrived from a call (showRating flag) and haven't found a pending-feedback
  // session yet, retry briefly instead of accepting a single null as final. Bounded
  // to a handful of attempts so this can't turn into an indefinite polling loop for
  // a session that genuinely has no pending feedback (e.g. already reviewed elsewhere).
  const justFinishedCallRef = useRef(false);
  const pendingFeedbackRetriesRef = useRef(0);
  const MAX_PENDING_FEEDBACK_RETRIES = 5;

  const { data: pendingFeedbackSession } = useQuery({
    queryKey: ['patient', 'pendingFeedback'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/sessions/pending-feedback`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch pending feedback');
      const data = await res.json();
      return data.session || null;
    },
    enabled: !!user?.userId,
    refetchInterval: (query) => {
      if (justFinishedCallRef.current && !query.state.data && pendingFeedbackRetriesRef.current < MAX_PENDING_FEEDBACK_RETRIES) {
        pendingFeedbackRetriesRef.current += 1;
        return 2000;
      }
      return false;
    },
  });

  useEffect(() => {
    if (pendingFeedbackSession) {
      justFinishedCallRef.current = false;
      pendingFeedbackRetriesRef.current = 0;
    }
  }, [pendingFeedbackSession]);

  useEffect(() => {
    if (pendingFeedbackSession) {
      const dismissed = user?.userId
        && localStorage.getItem(`ratingPromptDismissed_${user.userId}_${pendingFeedbackSession._id}`) === 'true';
      if (!dismissed) {
        setSessionToRate(pendingFeedbackSession);
        setShowRatingModal(true);
      }
    }
  }, [pendingFeedbackSession, user?.userId]);

  // Daily mood check-in — server is source of truth for "already logged today"
  const { data: moodToday } = useQuery({
    queryKey: ['patient', 'moodToday'],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/mood/today`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch mood check-in status');
      return res.json();
    },
    enabled: !!user?.userId,
  });

  useEffect(() => {
    if (!moodToday || moodToday.hasLoggedToday) return;
    const todayIso = moodToday.date;
    const dismissedToday = !!todayIso && localStorage.getItem(`moodPromptDismissed_${user?.userId}`) === todayIso;
    if (!dismissedToday) setShowMoodModal(true);
  }, [moodToday, user?.userId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['patient', 'moodToday'] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [queryClient]);

  const handleMoodSubmit = async (mood: number) => {
    const res = await fetch(`${API_CONFIG.BASE_URL}/session-tools/mood`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mood }),
    });
    if (!res.ok) {
      toast.error('Could not save your mood, please try again');
      throw new Error('Failed to save mood');
    }
    queryClient.invalidateQueries({ queryKey: ['patient', 'moodToday'] });
    queryClient.invalidateQueries({ queryKey: ['patient', 'moodHistory'] });
    toast.success('Thanks for checking in today');
  };

  const handleMoodDotClick = async (moodValue: number) => {
    if (moodSubmitting) return;
    setMoodSubmitting(true);
    try {
      await handleMoodSubmit(moodValue);
    } catch {
      // toast already shown in handleMoodSubmit
    } finally {
      setMoodSubmitting(false);
    }
  };

  const handleMoodModalClose = () => {
    setShowMoodModal(false);
    if (user?.userId && moodToday?.date) {
      localStorage.setItem(`moodPromptDismissed_${user.userId}`, moodToday.date);
    }
  };

  // Sessions for the mini month calendar
  const { data: monthSessions = [] } = useQuery<Session[]>({
    queryKey: ['patient', 'calendarSessions', year, month],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/sessions/calendar/${year}/${month}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch calendar sessions');
      return res.json();
    },
    enabled: !!user?.userId,
  });

  // All upcoming sessions, soonest first
  const { data: upcomingSessionsList = [] } = useQuery<UpcomingSession[]>({
    queryKey: ['patient', 'upcomingSessions', user?.userId],
    queryFn: async () => {
      const res = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-sessions`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data: UpcomingSession[] = await res.json();
      const now = Date.now();
      return data
        .filter((s) => s.status === 'scheduled' || s.status === 'active')
        .filter((s) => getSessionDateTime(s).getTime() + (s.duration || 60) * 60000 >= now)
        .sort((a, b) => getSessionDateTime(a).getTime() - getSessionDateTime(b).getTime());
    },
    enabled: !!user?.userId,
  });

  const nextSession = upcomingSessionsList[0];
  const moreSessions = upcomingSessionsList.slice(1, 3);

  //  REAL-TIME: Listen for session events
  useEffect(() => {
    if (!socket) return;

    const invalidateSessionData = () => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'calendarSessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient', 'upcomingSessions'] });
    };

    socket.on('session:booked', () => {
      toast.success('New session booked!');
      invalidateSessionData();
    });

    socket.on('session:cancelled', () => {
      toast('A session was cancelled');
      invalidateSessionData();
    });

    socket.on('session:status-update', () => {
      invalidateSessionData();
    });

    socket.on('chat:new-message', ({ senderName }) => {
      toast(`New message from ${senderName}`);
      queryClient.invalidateQueries({ queryKey: ['chat', 'unreadCount'] });
    });

    return () => {
      socket.off('session:booked');
      socket.off('session:cancelled');
      socket.off('session:status-update');
      socket.off('chat:new-message');
    };
  }, [socket, queryClient]);

  //  FALLBACK REFRESH: Detect navigation state and refresh dashboard
  useEffect(() => {
    const state = location.state as { refreshSessions?: boolean; showRating?: boolean; sessionId?: string };

    if (state?.refreshSessions) {
      toast.success('Session booked! Refreshing dashboard...');
      queryClient.invalidateQueries({ queryKey: ['patient', 'calendarSessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient', 'upcomingSessions'] });
    }

    if (state?.showRating) {
      justFinishedCallRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['patient', 'pendingFeedback'] });
    }

    if (state?.refreshSessions || state?.showRating) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname, queryClient]);

  const handleRatingSubmit = async () => {
    queryClient.invalidateQueries({ queryKey: ['patient', 'pendingFeedback'] });
    toast.success('Thank you for your feedback!');
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      logger.error('Logout error:', error);
      window.location.href = '/';
    }
  };

  const handleSessionClick = (session: Session) => {
    setSelectedSession(session);
    setIsSessionModalOpen(true);
  };

  // Build the mini month calendar grid — memoized since this only actually
  // needs to change when monthSessions/year/month/selectedDay change, not on
  // every render of the dashboard.
  const sessionsByDay = useMemo(() => {
    const map = new Map<number, Session[]>();
    monthSessions.forEach((s) => {
      const d = new Date(s.sessionDate);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(s);
      }
    });
    return map;
  }, [monthSessions, year, month]);

  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const cells: Array<{ day: number | null; hasSession: boolean; isSelected: boolean }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, hasSession: false, isSelected: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, hasSession: sessionsByDay.has(d), isSelected: d === selectedDay });
    }
    return cells;
  }, [sessionsByDay, year, month, selectedDay]);

  const handleDayClick = (day: number) => {
    setSelectedDay(day);
    const daySessions = sessionsByDay.get(day);
    if (daySessions && daySessions.length > 0) {
      handleSessionClick(daySessions[0]);
    }
  };

  // Mental health screening tests to show (defaults + any taken tests, taken/recent first)
  const defaultTestIds = ['depression', 'anxiety', 'adhd', 'disability'];
  const allTestIds = Array.from(new Set([...defaultTestIds, ...Object.keys(latestScores)]));
  const sortedTestIds = allTestIds.sort((a, b) => {
    const scoreA = latestScores[a];
    const scoreB = latestScores[b];
    if (scoreA && !scoreB) return -1;
    if (!scoreA && scoreB) return 1;
    if (scoreA && scoreB) return new Date(scoreB.latestDate).getTime() - new Date(scoreA.latestDate).getTime();
    const indexA = defaultTestIds.indexOf(a);
    const indexB = defaultTestIds.indexOf(b);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return 0;
  });
  const testsToRender = sortedTestIds.slice(0, 4);

  // Welcome, rating, and mood check-in are mutually exclusive full-screen modals.
  const activeDashboardModal: 'welcome' | 'rating' | 'mood' | null = showWelcomeModal
    ? 'welcome'
    : showRatingModal
      ? 'rating'
      : showMoodModal
        ? 'mood'
        : null;

  const nextSessionRelative = nextSession ? relativeDayLabel(nextSession.sessionDate) : null;

  return (
    <div
      className="w-full min-h-screen relative pt-16 md:pt-20 flex flex-col overflow-x-hidden"
      style={{ background: T.bg, fontFamily: FONT_SANS, color: T.text }}
    >
      {/* Decorative background blobs (purely visual, matches design) */}
      <div className="absolute pointer-events-none" style={{ top: -160, left: '10%', width: 520, height: 420, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, rgba(31,122,140,.16), rgba(31,122,140,0) 70%)' }} />
      <div className="absolute pointer-events-none" style={{ top: -120, right: '6%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle at 60% 40%, rgba(232,161,132,.18), rgba(232,161,132,0) 70%)' }} />
      <div className="absolute pointer-events-none hidden lg:block" style={{ top: 80, left: -100, width: 300, height: 300, borderRadius: '50%', background: T.terracotta, opacity: 0.08 }} />

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={activeDashboardModal === 'welcome'}
        onClose={() => {
          setShowWelcomeModal(false);
          if (user) localStorage.setItem(`welcomeModal_${user.userId}`, 'true');
        }}
      />

      {/* Sidebar Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-screen w-[260px] shadow-[4px_0_24px_rgba(0,0,0,0.02)] transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 bg-white border-r border-gray-100 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-5 pt-8 font-sans">
          <div className="flex justify-end mb-4 md:hidden">
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Main</h3>
              <div className="space-y-1">
                <div className="flex items-center space-x-3 cursor-pointer bg-gray-100/70 px-4 py-2.5 rounded-xl transition-colors group">
                  <svg className="w-5 h-5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold text-gray-900">Overview</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/messages'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Messages</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/pending-tasks'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Tasks</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Clinical</h3>
              <div className="space-y-1">
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/call-history'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Calls</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/mental-health'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Screening</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/my-tests'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Test Results</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/my-journal'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Journal</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/my-therapists'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Therapists</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Account</h3>
              <div className="space-y-1">
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/patient-profile-setup'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Profile</span>
                </div>
                <div className="flex items-center space-x-3 cursor-pointer text-gray-600 hover:bg-gray-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={() => { navigate('/settings'); setSidebarOpen(false); }}>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[13.5px] font-semibold">Settings</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-6 border-t border-gray-100">
              <div className="flex items-center space-x-3 cursor-pointer text-gray-500 hover:text-red-600 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-colors group" onClick={handleLogout}>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-[13.5px] font-semibold">Sign Out</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Header ── */}
      <header
        className="flex-none relative z-30 px-4 sm:px-6 lg:px-11 py-3"
      >
      <div className="max-w-[1600px] mx-auto w-full flex items-start sm:items-center gap-4 sm:gap-6 flex-wrap lg:flex-nowrap">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="flex-none flex items-center justify-center"
          style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(27,43,46,.12)', background: '#fff', cursor: 'pointer' }}
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="2" rx="1" fill="#1b2b2e" />
            <rect y="6" width="18" height="2" rx="1" fill="#1b2b2e" />
            <rect y="12" width="18" height="2" rx="1" fill="#1b2b2e" />
          </svg>
        </button>

        <div className="flex-none flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: T.teal, color: '#fff', fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 600 }}>
          {(user?.firstName || user?.username || 'U').charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.12em', color: T.teal, textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
            Your Dashboard
          </div>
          <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, lineHeight: 1.15, color: T.text }}>
            {getGreeting()}, <em style={{ fontStyle: 'italic', color: T.teal }}>{user?.firstName || user?.username || 'there'}</em>.
          </div>
          <div className="flex items-center gap-3.5 mt-2 flex-wrap">
            <span style={{ fontSize: 13, color: T.text2 }}>How are you feeling today?</span>
            <div className="flex gap-2.5">
              {MOOD_DOTS.map((m) => {
                const isSelected = !!moodToday?.hasLoggedToday && moodToday?.entry?.mood === m.value;
                return (
                  <button
                    key={m.value}
                    title={m.label}
                    disabled={moodSubmitting}
                    onClick={() => handleMoodDotClick(m.value)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? m.color : 'transparent'}`,
                      background: m.color,
                      cursor: moodSubmitting ? 'default' : 'pointer',
                      padding: 0,
                      opacity: moodSubmitting ? 0.6 : 1,
                    }}
                  />
                );
              })}
            </div>
            <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: '.08em', color: T.green, textTransform: 'uppercase', background: 'rgba(47,174,122,.12)', padding: '5px 10px', borderRadius: 100 }}>
              {moodToday?.hasLoggedToday && moodToday?.entry ? moodToday.entry.label : 'Not logged'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5 flex-none w-full sm:w-auto sm:ml-auto mt-1 sm:mt-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={() => setIsHotlineModalOpen(true)}
              aria-label="Emergency helplines"
              className="flex items-center justify-center"
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(27,43,46,.15)', background: '#fff', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1b2b2e" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>
            <button
              onClick={() => navigate('/messages')}
              aria-label="Messages"
              className="flex items-center justify-center relative"
              style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(27,43,46,.15)', background: '#fff', cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1b2b2e" strokeWidth="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -2, background: '#e05d4c', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: '50%', minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsBookingModalOpen(true)}
              style={{ background: T.teal, color: '#fff', border: 'none', borderRadius: 100, padding: '12px 22px', fontWeight: 600, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.tealHover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.teal; }}
            >
              Book Session
            </button>
          </div>
          {nextSession && nextSessionRelative && (
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: T.text2 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
              Next session <strong style={{ color: T.text, marginLeft: 2 }}>{nextSessionRelative}</strong>
            </div>
          )}
        </div>
      </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 lg:min-h-0 relative z-10 px-4 sm:px-6 lg:px-11 py-3 pb-8 lg:pb-3 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 lg:gap-5 max-w-[1600px] mx-auto w-full">
        {/* Left column */}
        <div className="h-auto lg:h-full flex flex-col gap-3.5 min-w-0 lg:min-h-0">
          {/* Reports & Recommendation */}
          <div style={{ ...cardStyle, padding: '16px 20px 12px', position: 'relative', overflow: 'hidden', flex: '0 1 auto', maxHeight: '40%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="flex-none flex items-baseline justify-between mb-2">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.teal, textTransform: 'uppercase', marginBottom: 5 }}>— Care Notes</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text, whiteSpace: 'nowrap' }}>
                  Reports & <em style={{ fontStyle: 'italic', color: T.teal }}>Recommendation</em>
                </div>
              </div>
            </div>
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
              {recentReports.length === 0 ? (
                <div className="text-center py-6" style={{ fontSize: 12.5, color: T.muted }}>No reports yet</div>
              ) : (
                recentReports.map((r) => {
                  const known = !!r.doctorId?.firstName;
                  return (
                    <div key={r._id} className="flex items-start gap-3" style={{ padding: '9px 4px', borderBottom: '1px solid rgba(31,122,140,.12)' }}>
                      <div className="flex-none flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: '50%', background: known ? T.teal : T.muted, color: '#fff', fontWeight: 600, fontSize: 11, marginTop: 1 }}>
                        {known ? getInitials(r.doctorId.firstName, r.doctorId.lastName) : '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {known ? `Dr. ${r.doctorId.firstName} ${r.doctorId.lastName}` : 'Dr. Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>{formatDate(r.createdAt)}</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.35, color: T.text2 }}>{getReportSnippet(r)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex-none mt-2 text-center">
              <button
                onClick={() => navigate('/reports-recommendation')}
                style={{ fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', border: '1px solid rgba(31,122,140,.3)', color: T.teal, borderRadius: 100, padding: '7px 16px', background: 'transparent', cursor: 'pointer' }}
              >
                View All →
              </button>
            </div>
          </div>

          {/* Calendar */}
          <div style={{ ...cardStyle, padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-start justify-between mb-3.5">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 6 }}>— Schedule</div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 22, lineHeight: 1.1, color: T.text }}>
                  {today.toLocaleDateString('en-US', { month: 'long' })}{' '}
                  <span style={{ fontSize: 14, color: T.muted, fontFamily: FONT_SANS }}>{year}</span>
                </div>
              </div>
              <button
                onClick={() => setIsCalendarModalOpen(true)}
                className="flex items-center gap-1.5"
                style={{ border: '1px solid rgba(27,43,46,.15)', background: '#fff', borderRadius: 100, padding: '9px 16px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1b2b2e" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"></rect>
                  <path d="M16 2v4M8 2v4M3 10h18"></path>
                </svg>
                Manage
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1 flex-none">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
                <div key={w} className="text-center" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.06em', color: T.muted, padding: '5px 0', textTransform: 'uppercase' }}>{w}</div>
              ))}
            </div>
            <div className="flex-1 flex flex-col justify-center min-h-0">
              <div className="grid grid-cols-7 gap-x-0.5 gap-y-2.5">
                {calendarCells.map((c, i) => (
                  <button
                    key={i}
                    disabled={!c.day}
                    onClick={() => c.day && handleDayClick(c.day)}
                    className="flex items-center justify-center"
                    style={{ border: 'none', background: 'none', cursor: c.day ? 'pointer' : 'default', padding: 0 }}
                  >
                    {c.day && (
                      <span
                        className="flex items-center justify-center relative"
                        style={{ width: 30, height: 30, borderRadius: '50%', fontSize: 13, color: c.isSelected ? '#fff' : T.text, background: c.isSelected ? T.teal : 'transparent' }}
                      >
                        {c.day}
                        {c.hasSession && !c.isSelected && (
                          <span style={{ position: 'absolute', bottom: -1, width: 4, height: 4, borderRadius: '50%', background: T.teal }} />
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="h-auto lg:h-full flex flex-col gap-3.5 min-w-0 lg:min-h-0">
          {/* Mental Health Screening */}
          <div style={{ ...cardStyle, padding: '16px 20px', position: 'relative', overflow: 'hidden', flex: 'none' }}>
            <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.teal, textTransform: 'uppercase', marginBottom: 4 }}>— Self-Assessment</div>
            <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 16, lineHeight: 1.2, color: T.text, marginBottom: 10 }}>Mental Health Screening</div>
            <div className="grid grid-cols-2 gap-2">
              {testsToRender.map((testId) => {
                const testDef = MENTAL_HEALTH_TESTS[testId];
                let testName = testDef ? testDef.name : testId;
                let maxScore = testDef ? testDef.scoring.maxScore : 100;
                if (testId === 'disability') { testName = 'DLA-20'; maxScore = 80; }

                const scoreData = latestScores[testId];
                const hasScore = !!scoreData;
                const score = hasScore ? scoreData.latestScore : 0;
                const pct = hasScore ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
                const severity = hasScore ? getSeverityLabel(score, maxScore) : '—';
                const takenLabel = hasScore
                  ? new Date(scoreData.latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'Not yet';

                return (
                  <div key={testId} style={{ ...subCardStyle, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div className="flex items-center gap-2.5">
                      <div className="flex-none flex items-center justify-center" style={{ width: 36, height: 36, borderRadius: '50%', background: `conic-gradient(${T.teal} ${pct}%, #eee7d8 0)`, padding: 3 }}>
                        <div className="flex items-center justify-center" style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 12, color: T.teal }}>
                          {hasScore ? score : '–'}
                        </div>
                      </div>
                      <div className="min-w-0 flex items-center" style={{ fontWeight: 600, fontSize: 11, color: T.text, minHeight: 28 }}>{testName}</div>
                    </div>
                    <div className="flex items-center justify-between" style={{ paddingTop: 8, borderTop: '1px solid rgba(27,43,46,.07)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 8.5, letterSpacing: '.06em', color: T.muted, textTransform: 'uppercase', marginBottom: 2 }}>Severity</div>
                        <div style={{ fontWeight: 600, fontSize: 11, color: T.teal }}>{severity}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 8.5, letterSpacing: '.06em', color: T.muted, textTransform: 'uppercase', marginBottom: 2 }}>Taken</div>
                        <div style={{ fontWeight: 600, fontSize: 11, color: T.text }}>{takenLabel}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/mental-health/${testId}`)}
                      style={{ textAlign: 'center', fontWeight: 600, fontSize: 10.5, letterSpacing: '.03em', textTransform: 'uppercase', color: T.teal, border: '1px solid rgba(31,122,140,.35)', borderRadius: 100, padding: 6, background: 'transparent', cursor: 'pointer' }}
                    >
                      {hasScore ? 'Retest →' : 'Take Test →'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* My Journal */}
          <div style={{ ...cardStyle, padding: '14px 20px', flex: '0 1 auto', maxHeight: '26%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="flex-none" style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 16, lineHeight: 1.2, color: T.text, marginBottom: 6 }}>My Journal</div>
            <div className="flex-none flex justify-between" style={{ padding: '0 4px 6px', fontWeight: 600, fontSize: 9.5, letterSpacing: '.06em', color: T.muted, textTransform: 'uppercase', borderBottom: `1px solid ${T.border}` }}>
              <span>Date</span>
              <span>Subject</span>
            </div>
            <div className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto">
              {recentJournal.length === 0 ? (
                <div className="text-center py-4" style={{ fontSize: 12.5, color: T.muted }}>No journal entries yet</div>
              ) : (
                recentJournal.map((j) => (
                  <div key={j._id} className="flex items-center justify-between" style={{ padding: '7px 4px', borderBottom: '1px solid rgba(27,43,46,.06)' }}>
                    <span style={{ fontSize: 12.5, color: T.text, whiteSpace: 'nowrap' }}>{formatDate(j.createdAt)}</span>
                    <span style={{ fontSize: 12.5, color: T.text2, marginLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Session */}
          <div style={{ ...cardStyle, padding: '18px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="flex items-baseline justify-between mb-0.5">
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase' }}>— Up Next</div>
                <div
                  className="flex items-center gap-1.5 flex-none"
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    color: pendingTasks.length === 0 ? T.green : T.terracotta,
                    background: pendingTasks.length === 0 ? T.greenBg : 'rgba(201,154,91,.14)',
                    borderRadius: 100,
                    padding: '4px 9px',
                  }}
                >
                  {pendingTasks.length === 0 ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5"></path></svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.terracotta} strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                  )}
                  {pendingTasks.length === 0 ? 'No pending tasks' : `${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}`}
                </div>
              </div>
              <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text }}>Upcoming Session</div>
            </div>

            {nextSession ? (
              <>
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => handleSessionClick(nextSession)}>
                  {nextSession.doctorId.profileImage ? (
                    <img src={nextSession.doctorId.profileImage} alt="" className="flex-none rounded-full object-cover" style={{ width: 42, height: 42 }} />
                  ) : (
                    <div className="flex-none flex items-center justify-center" style={{ width: 42, height: 42, borderRadius: '50%', background: T.teal, color: '#fff', fontWeight: 600, fontSize: 14 }}>
                      {getInitials(nextSession.doctorId.firstName, nextSession.doctorId.lastName)}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: T.text }}>Dr. {nextSession.doctorId.firstName} {nextSession.doctorId.lastName}</div>
                    <div style={{ fontSize: 12.5, color: T.text2, whiteSpace: 'nowrap' }}>{nextSession.callMode || 'Video Calling'} · {nextSession.duration || 60} min</div>
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: T.text, background: T.bg, borderRadius: 10, padding: '10px 14px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
                  {formatSessionChip(nextSession)}
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => handleSessionClick(nextSession)}
                    style={{ flex: 1, background: T.teal, color: '#fff', border: 'none', borderRadius: 100, padding: 10, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    Join Session
                  </button>
                  <button
                    onClick={() => handleSessionClick(nextSession)}
                    style={{ flex: 1, background: '#fff', color: T.text, border: '1px solid rgba(27,43,46,.15)', borderRadius: 100, padding: 10, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    Reschedule
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <p style={{ fontSize: 13, color: T.muted }}>No upcoming sessions scheduled.</p>
                <button
                  onClick={() => setIsBookingModalOpen(true)}
                  style={{ background: T.teal, color: '#fff', border: 'none', borderRadius: 100, padding: '10px 20px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                >
                  Book a Session
                </button>
              </div>
            )}

            {moreSessions.length > 0 && (
              <div className="flex flex-col" style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, flex: 1, minHeight: 0 }}>
                <div className="flex-none" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Also Scheduled</div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                {moreSessions.map((ms) => (
                  <div
                    key={ms._id}
                    className="flex items-center justify-between cursor-pointer"
                    style={{ padding: '9px 0', borderBottom: '1px solid rgba(27,43,46,.06)' }}
                    onClick={() => handleSessionClick(ms)}
                  >
                    <div style={{ fontSize: 12.5, color: T.text, whiteSpace: 'nowrap' }}>{ms.callMode || 'Video Calling'}</div>
                    <div style={{ fontSize: 12.5, color: T.text2, whiteSpace: 'nowrap' }}>{formatMoreSessionWhen(ms)}</div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

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
          isOpen={activeDashboardModal === 'rating'}
          sessionId={sessionToRate._id}
          doctorName={sessionToRate.doctorId?.lastName ? `Dr. ${sessionToRate.doctorId.firstName || ''} ${sessionToRate.doctorId.lastName}` : 'your therapist'}
          onClose={() => {
            setShowRatingModal(false);
            if (user?.userId && sessionToRate?._id) {
              // Persist the skip so a dismissed prompt doesn't pop back up on the
              // next tab-focus/remount-triggered refetch (mirrors the mood
              // check-in modal's dismiss-persistence pattern above).
              localStorage.setItem(`ratingPromptDismissed_${user.userId}_${sessionToRate._id}`, 'true');
            }
            setSessionToRate(null);
          }}
          onSubmit={handleRatingSubmit}
        />
      )}

      {/* Daily Mood Check-In */}
      <MoodCheckInModal
        isOpen={activeDashboardModal === 'mood'}
        firstName={user?.firstName}
        onClose={handleMoodModalClose}
        onSubmit={handleMoodSubmit}
      />
    </div>
  );
};

export default PatientDashboard;
