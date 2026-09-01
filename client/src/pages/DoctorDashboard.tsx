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
import PostSessionReportModal from '../components/PostSessionReportModal';
import DoctorSidebar from '../components/DoctorSidebar';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/authToken';
import { getGreeting, getGreetingPunctuation } from '../utils/dateUtils';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

// ── Design tokens (identical to the patient dashboard's design system) ──────
const T = {
  bg: '#f6f3ec',
  border: 'rgba(27,43,46,.08)',
  text: '#16262a',
  text2: '#6b7573',
  muted: '#8a938f',
  teal: '#1f7a8c',
  tealHover: '#155e6c',
  green: '#2fae7a',
  greenDeep: '#2b8a7a',
  greenBg: '#eef6f0',
  gold: '#c99a5b',
  goldDeep: '#a97c3f',
  goldBg: '#f7f1e8',
  cancelled: '#c3c8c5',
};
const FONT_SERIF = "'Newsreader', Georgia, serif";
const FONT_SANS = "'Public Sans', 'Inter', sans-serif";

// Frosted-glass card treatment, per the Doctor Dashboard design spec.
// Frosted-glass card treatment: a white glass base with a soft teal glow
// anchored in the top-left corner — matches the fix applied to the patient
// dashboard's identical cardStyle (previously had no white base at all, just
// a ~2-7% opacity teal wash, so the blurred beige page background showed
// straight through and the card read as uniformly beige).
const cardStyle: React.CSSProperties = {
  background: 'radial-gradient(120% 120% at 0% 0%, rgba(31,122,140,.16), rgba(31,122,140,0) 55%), rgba(255,255,255,.82)',
  backdropFilter: 'blur(20px) saturate(110%)',
  WebkitBackdropFilter: 'blur(20px) saturate(110%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 12px 36px rgba(27,43,46,.08), inset 0 1px 0 rgba(255,255,255,.6)',
  borderRadius: 20,
};

// Lighter glass variant for nested metric tiles.
const subCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,.5)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,.7)',
  borderRadius: 14,
};

const getDrInitials = (firstName?: string, lastName?: string) =>
  `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'D';

const getNoteSnippet = (content?: string) => {
  const text = content || '';
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
};

let sharedAudioCtx: any = null;

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioContext();
    }
    
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    
    // Play a sequence of beeps for a "ring" effect
    const playBeep = (startTime: number, freq: number) => {
      const osc = sharedAudioCtx.createOscillator();
      const gainNode = sharedAudioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
      
      osc.connect(gainNode);
      gainNode.connect(sharedAudioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    };

    const now = sharedAudioCtx.currentTime;
    playBeep(now, 880); // A5
    playBeep(now + 0.15, 880); // A5
    playBeep(now + 0.4, 1046.50); // C6
    
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
  const [delayedSessions, setDelayedSessions] = useState<(Session & { delayedUntil: Date })[]>([]);
  const [showPostSessionReport, setShowPostSessionReport] = useState(false);
  const [pendingReportData, setPendingReportData] = useState<any>(null);

  //  REAL-TIME: Connect to data socket
  const { socket } = useDataSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const fetchDelayed = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/sessions/delayed`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.sessions && data.sessions.length > 0) {
            setDelayedSessions(data.sessions.map((s: any) => ({
              ...s,
              delayedUntil: new Date(s.delayedUntil)
            })));
          }
        }
      } catch (err) {
        console.error('Failed to fetch delayed sessions', err);
      }
    };
    if (user?.role === 'doctor') {
      fetchDelayed();
    }
  }, [user]);

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
      return data.tasks || [];
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
        revenue: data.totalDoctorEarnings || 0,
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
        // Handled by GlobalIncomingCallListener
      } else {
        toast.success('New session booked!');
      }

      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'stats', user?.userId] });
    });

    socket.on('session:cancelled', ({ sessionId }) => {
      console.log('[REAL-TIME] Session cancelled:', sessionId);
      toast('A session was cancelled');
      setCalendarRefreshTrigger(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['doctor', 'stats', user?.userId] });
    });

    socket.on('session:status-update', ({ sessionId, acceptanceStatus }) => {
      console.log('[REAL-TIME] Session status updated:', { sessionId, acceptanceStatus });
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

  // Timer for delayed sessions
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    if (delayedSessions.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);
      delayedSessions.forEach(session => {
        const diff = session.delayedUntil.getTime() - now;
        
        // Reminder logic based on diff
        // 3 mins: 180000 ms, 1 min: 60000 ms, 30 sec: 30000 ms
        if (diff > 179000 && diff <= 180000) playNotificationSound();
        else if (diff > 59000 && diff <= 60000) playNotificationSound();
        else if (diff > 29000 && diff <= 30000) playNotificationSound();
        else if (diff <= 0) {
          const elapsedSecs = Math.floor(-diff / 1000);
          if (elapsedSecs % 5 === 0) playNotificationSound(); // continuous ringing every 5s
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [delayedSessions]);

  const openTasksCount = assignedTasks.filter((t: any) => t.status !== 'completed').length;
  const visibleTasks = assignedTasks.slice(0, 4);
  const visibleNotes = recentNotes.slice(0, 4);
  const visibleReports = recentReports.slice(0, 3);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
  const yearLabel = new Date().getFullYear();

  return (
    <div
      className="min-h-screen pt-16 md:pt-[80px] box-border relative overflow-x-hidden flex flex-col"
      style={{ background: T.bg, fontFamily: FONT_SANS, color: T.text }}
    >
      {/* Decorative background blobs — these give the frosted cards their color, per the design spec */}
      <div className="absolute pointer-events-none" style={{ top: -160, left: '10%', width: 520, height: 420, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, rgba(31,122,140,.16), rgba(31,122,140,0) 70%)' }} />
      <div className="absolute pointer-events-none" style={{ top: -120, right: '6%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle at 60% 40%, rgba(232,161,132,.18), rgba(232,161,132,0) 70%)' }} />
      <div className="absolute pointer-events-none hidden lg:block" style={{ bottom: -140, right: -80, width: 340, height: 340, borderRadius: '48% 52% 55% 45%', background: T.teal, opacity: 0.14 }} />
      <div className="absolute pointer-events-none hidden lg:block" style={{ top: 200, left: -100, width: 300, height: 300, borderRadius: '50%', background: T.gold, opacity: 0.08 }} />
      {/* Delayed Sessions Banner */}
      {delayedSessions.length > 0 && (
        <div className="fixed top-24 right-6 z-50 flex flex-col gap-3 w-80">
          {delayedSessions.map(session => {
            const diff = Math.max(0, session.delayedUntil.getTime() - currentTime);
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            const isDue = diff === 0;

            return (
              <div key={session._id} className={`p-5 rounded-2xl shadow-2xl backdrop-blur-xl border ${isDue ? 'bg-red-500/10 border-red-500/30 animate-[pulse_1s_ease-in-out_infinite]' : 'bg-white/80 border-white/40'} transition-all duration-300 relative overflow-hidden group hover:scale-[1.02]`}>
                {isDue && <div className="absolute inset-0 bg-red-500/5 z-0" />}
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isDue ? 'bg-red-500 animate-ping' : 'bg-amber-500'}`} />
                      <h4 className={`text-sm font-bold ${isDue ? 'text-red-700' : 'text-slate-700'}`}>Patient Waiting</h4>
                    </div>
                    <div className={`px-2 py-1 rounded-md bg-white shadow-sm border ${isDue ? 'border-red-200 text-red-600' : 'border-amber-100 text-amber-600'}`}>
                      <span className="text-sm font-mono font-bold tracking-widest">
                        {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-4">
                    {(session.patientId as any)?.profileImage ? (
                      <img src={(session.patientId as any).profileImage} alt="Patient" className="w-10 h-10 rounded-full border border-slate-200 object-cover shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-bold border border-slate-300 shadow-sm">
                        {session.patientId?.firstName?.charAt(0) || 'P'}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-800">{session.patientId?.firstName} {session.patientId?.lastName}</p>
                      <p className="text-xs text-slate-500 font-medium">Immediate Session</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const token = getAuthToken();
                        await fetch(`${API_BASE_URL}/sessions/${session._id}/missed`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
                        setDelayedSessions(prev => prev.filter(s => s._id !== session._id));
                      }}
                      className="w-1/3 py-2.5 rounded-xl text-sm font-bold text-slate-500 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 transition-all flex items-center justify-center"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        navigate(`/video-call/${session._id}`);
                        setDelayedSessions(prev => prev.filter(s => s._id !== session._id));
                      }}
                      className={`w-2/3 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all ${isDue ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/20' : 'bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 shadow-teal-500/20'} flex items-center justify-center gap-1`}
                    >
                      <span>Join Now</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      {/* Header */}
      <header className="flex-none relative z-30 px-4 sm:px-6 lg:px-11 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
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
            {getDrInitials(user?.firstName, user?.lastName)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1" style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.12em', color: T.teal, textTransform: 'uppercase' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
              Practitioner Dashboard
            </div>
            <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, lineHeight: 1.15, color: T.text }}>
              {getGreeting()}, <em style={{ fontStyle: 'italic', color: T.teal }}>Dr. {user?.firstName || user?.username || 'Doctor'}</em>{getGreetingPunctuation()}
            </div>
            <div className="flex items-center gap-3.5 mt-2 flex-wrap">
              <span style={{ fontSize: 13, color: T.text2 }}>Availability</span>
              <div className="flex gap-2">
                <button
                  onClick={isActive ? undefined : toggleOnlineStatus}
                  disabled={isStatusLoading}
                  style={{
                    border: `1px solid ${isActive ? 'rgba(47,174,122,.45)' : 'rgba(27,43,46,.15)'}`,
                    background: isActive ? T.greenBg : '#fff',
                    color: isActive ? T.greenDeep : T.muted,
                    borderRadius: 100, padding: '6px 14px',
                    fontWeight: 600, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase',
                    cursor: isStatusLoading ? 'default' : 'pointer', opacity: isStatusLoading ? 0.6 : 1,
                  }}
                >
                  Online
                </button>
                <button
                  onClick={!isActive ? undefined : toggleOnlineStatus}
                  disabled={isStatusLoading}
                  style={{
                    border: `1px solid ${!isActive ? 'rgba(31,122,140,.4)' : 'rgba(27,43,46,.15)'}`,
                    background: !isActive ? '#eef4f4' : '#fff',
                    color: !isActive ? T.teal : T.muted,
                    borderRadius: 100, padding: '6px 14px',
                    fontWeight: 600, fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase',
                    cursor: isStatusLoading ? 'default' : 'pointer', opacity: isStatusLoading ? 0.6 : 1,
                  }}
                >
                  Offline
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1.5 flex-none w-full sm:w-auto sm:ml-auto mt-1 sm:mt-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
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
                onClick={() => navigate('/doctor-settings')}
                className="flex items-center gap-1.5"
                style={{ border: '1px solid rgba(27,43,46,.15)', background: '#fff', color: T.text, borderRadius: 100, padding: '11px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"></path>
                </svg>
                Pricing & Payouts
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="flex-1 relative z-10 px-4 sm:px-6 lg:px-11 py-3 pb-8 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 lg:gap-5 max-w-[1600px] mx-auto w-full">
        {/* Left column */}
        <div className="h-auto lg:h-full flex flex-col gap-3.5 min-w-0 lg:min-h-0">

          {/* Session Notes */}
          <div style={{ ...cardStyle, padding: '16px 20px 12px', position: 'relative', overflow: 'hidden' }}>
            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.teal, textTransform: 'uppercase', marginBottom: 5 }}>— Clinical Record</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text, whiteSpace: 'nowrap' }}>
                  Session <em style={{ fontStyle: 'italic', color: T.teal }}>Notes</em>
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              {visibleNotes.length === 0 ? (
                <div className="text-center py-6" style={{ fontSize: 12.5, color: T.muted }}>No session notes yet</div>
              ) : (
                visibleNotes.map((note: any) => (
                  <div key={note._id} className="flex items-start gap-3" style={{ padding: '10px 4px', borderBottom: '1px solid rgba(31,122,140,.12)' }}>
                    <div className="flex-none flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: '50%', background: T.teal, color: '#fff', fontWeight: 600, fontSize: 11, marginTop: 1 }}>
                      {getDrInitials(note.patientId?.firstName, note.patientId?.lastName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: T.text, whiteSpace: 'nowrap' }}>
                        {note.patientId?.firstName} {note.patientId?.lastName}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>{formatDate(note.createdAt)}</div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.35, color: T.text2 }}>{getNoteSnippet(note.content)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 text-center">
              <button
                onClick={() => navigate('/doctor-session-notes')}
                style={{ fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', border: '1px solid rgba(31,122,140,.3)', color: T.teal, borderRadius: 100, padding: '7px 16px', background: 'transparent', cursor: 'pointer' }}
              >
                View All Notes →
              </button>
            </div>
          </div>

          {/* Calendar */}
          <div style={{ ...cardStyle, padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 6 }}>— Schedule</div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 22, lineHeight: 1.1, color: T.text }}>
                  {monthLabel} <span style={{ fontSize: 14, color: T.muted, fontFamily: FONT_SANS }}>{yearLabel}</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/manage-calendar')}
                className="flex items-center gap-1.5"
                style={{ border: '1px solid rgba(27,43,46,.15)', background: '#fff', borderRadius: 100, padding: '9px 16px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1b2b2e" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>
                </svg>
                Manage
              </button>
            </div>
            <div className="flex-1 min-h-0">
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

        {/* Right column */}
        <div className="h-auto lg:h-full flex flex-col gap-3.5 min-w-0 lg:min-h-0">

          {/* Key Metrics */}
          <div style={{ ...cardStyle, padding: '16px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.teal, textTransform: 'uppercase', marginBottom: 4 }}>— This Month</div>
            <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 16, lineHeight: 1.2, color: T.text, marginBottom: 10 }}>Key Metrics</div>
            <div className="grid grid-cols-2 gap-2">
              <div style={{ ...subCardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 9.5, letterSpacing: '.08em', color: T.muted, textTransform: 'uppercase' }}>Total Revenue</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color: T.text }}>₹{stats.revenue.toLocaleString()}</div>
              </div>
              <div style={{ ...subCardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 9.5, letterSpacing: '.08em', color: T.muted, textTransform: 'uppercase' }}>Total Sessions</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color: T.text }}>{stats.sessions}</div>
              </div>
              <div style={{ ...subCardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 9.5, letterSpacing: '.08em', color: T.muted, textTransform: 'uppercase' }}>Total Hours</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color: T.text }}>{stats.hours}</div>
              </div>
              <div style={{ ...subCardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 9.5, letterSpacing: '.08em', color: T.muted, textTransform: 'uppercase' }}>Self-Assessment</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 18, color: T.text }}>DLA-20</div>
              </div>
            </div>
          </div>

          {/* Tasks & Reports */}
          <div style={{ ...cardStyle, padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="flex items-baseline justify-between">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 4 }}>— Follow-Ups</div>
                <div style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, lineHeight: 1.2, color: T.text }}>Tasks & Reports</div>
              </div>
              {openTasksCount > 0 && (
                <div style={{ fontWeight: 600, fontSize: 10, color: T.gold, background: T.goldBg, borderRadius: 100, padding: '4px 9px', flex: 'none', whiteSpace: 'nowrap' }}>
                  {openTasksCount} open
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3.5">
              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Recent Tasks</div>
                {visibleTasks.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: T.muted, fontStyle: 'italic' }}>No tasks assigned</div>
                ) : (
                  visibleTasks.map((task: any) => (
                    <div key={task._id} className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderBottom: '1px solid rgba(27,43,46,.06)' }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex-none" style={{ width: 7, height: 7, borderRadius: '50%', background: T.gold }} />
                        <span className="truncate" style={{ fontSize: 12.5, color: T.text }}>{task.title}</span>
                      </div>
                      <span style={{ fontSize: 12.5, color: T.text2, whiteSpace: 'nowrap' }}>{task.patientId?.firstName}</span>
                    </div>
                  ))
                )}
              </div>

              <div>
                <div style={{ fontWeight: 600, fontSize: 10, letterSpacing: '.1em', color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Recent Reports</div>
                {visibleReports.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: T.muted, fontStyle: 'italic' }}>No reports created</div>
                ) : (
                  visibleReports.map((report: any) => (
                    <div key={report._id} className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderBottom: '1px solid rgba(27,43,46,.06)' }}>
                      <div className="min-w-0">
                        <div style={{ fontWeight: 600, fontSize: 12.5, color: T.text, whiteSpace: 'nowrap' }}>{report.title}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{formatDate(report.createdAt)}</div>
                      </div>
                      <span style={{ fontSize: 12.5, color: T.text2, whiteSpace: 'nowrap' }}>{report.patientId?.firstName}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-2.5" style={{ flex: 'none' }}>
              <button
                onClick={() => navigate('/doctor-tasks')}
                style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', border: '1px solid rgba(31,122,140,.3)', color: T.teal, borderRadius: 100, padding: 9, background: 'transparent', cursor: 'pointer' }}
              >
                All Tasks
              </button>
              <button
                onClick={() => navigate('/doctor-reports')}
                style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', border: '1px solid rgba(31,122,140,.3)', color: T.teal, borderRadius: 100, padding: 9, background: 'transparent', cursor: 'pointer' }}
              >
                All Reports
              </button>
            </div>
          </div>
        </div>
      </main>

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
            setShowPostSessionReport(false);
            setPendingReportData(null);
            toast('Report not submitted. You can write it later from the Reports section.', { icon: '' });
          }}
        />
      )}
    </div>
  );
};

export default DoctorDashboard;
