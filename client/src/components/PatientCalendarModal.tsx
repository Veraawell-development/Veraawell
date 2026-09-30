import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { parseTime } from '../utils/dateUtils';

interface PatientCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Session {
    _id: string;
    patientId: string;
    // Nullable on purpose: mongoose populate() yields null when the doctor
    // document is gone, which is exactly what accumulates in PAST sessions
    // (the account cascade delete is a non-transactional Promise.all). This
    // was typed non-nullable, so the compiler could not see the crash below.
    doctorId: {
        _id: string;
        firstName: string;
        lastName: string;
        profileImage?: string;
    } | null;
    sessionDate: string;
    sessionTime: string;
    duration: number;
    sessionType: string;
    status: 'payment_pending' | 'scheduled' | 'completed' | 'cancelled' | 'no-show' | 'active' | 'ended';
    callMode?: string;
    meetingLink?: string;
    notes?: string;
    paymentStatus?: string;
}

// Design tokens — matches the patient dashboard's cream/teal design language.
const T = {
    bg: '#f6f3ec',
    border: 'rgba(27,43,46,.08)',
    text: '#16262a',
    text2: '#6b7573',
    muted: '#8a938f',
    teal: '#1f7a8c',
    tealHover: '#155e6c',
    tealBg: 'rgba(31,122,140,.1)',
    green: '#2fae7a',
    greenBg: '#eef6f0',
    amber: '#c99a5b',
    amberBg: '#faf3e6',
    red: '#c25b4a',
    redBg: '#fbeeeb',
};
const FONT_SERIF = "'Newsreader', Georgia, serif";
const FONT_SANS = "'Public Sans', 'Inter', sans-serif";

/**
 * A session's doctor may be null — see the Session interface above.
 * Calendar.tsx:243 and session.controller.js:568 already guard this; these
 * give the modal the same treatment in one place rather than four.
 */
type SessionDoctor = { firstName?: string; lastName?: string; profileImage?: string } | null | undefined;

const doctorLabel = (d: SessionDoctor) =>
    d?.firstName ? `Dr. ${d.firstName} ${d.lastName || ''}`.trim() : 'Doctor';

const doctorInitials = (d: SessionDoctor) =>
    `${d?.firstName?.[0] || ''}${d?.lastName?.[0] || ''}`.toUpperCase() || 'D';

const PatientCalendarModal: React.FC<PatientCalendarModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'all' | 'video' | 'in-person'>('all');
    const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
    const [loading, setLoading] = useState(false);
    const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);
    const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

    const handleCancelSession = async (sessionId: string) => {
        setCancelLoadingId(sessionId);
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/${sessionId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            const data = await response.json();
            if (response.ok && data.success) {
                // Update local state to reflect cancellation
                setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, status: 'cancelled' } : s));
                toast.success('Session cancelled successfully');
            } else {
                toast.error(data.message || 'Failed to cancel session');
            }
        } catch (error) {
            console.error('Error cancelling session:', error);
            toast.error('An error occurred while cancelling the session.');
        } finally {
            setCancelLoadingId(null);
            setConfirmCancelId(null);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen]);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-sessions?t=${Date.now()}`, {
                credentials: 'include'
            });
            if (response.ok) {
                const data = await response.json();
                console.log('Fetched sessions:', data); // Debug log
                setSessions(data);
            } else {
                console.error('Failed to fetch sessions:', response.status);
            }
        } catch (error) {
            console.error('Error fetching sessions:', error);
        } finally {
            setLoading(false);
        }
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        return { daysInMonth, startingDayOfWeek };
    };

    const getSessionsForDate = (date: Date) => {
        return sessions.filter(session => {
            const sessionDate = new Date(session.sessionDate);
            return sessionDate.toDateString() === date.toDateString();
        });
    };

    const isSessionJoinable = (session: Session) => {
        // If status is cancelled or explicitly completed/no-show, not joinable
        if (session.status === 'cancelled' || session.status === 'completed' || session.status === 'no-show') return false;

        const now = new Date();
        const sessionDateTime = new Date(session.sessionDate);
        if (session.sessionTime) {
          const [hours, minutes] = parseTime(session.sessionTime);
          sessionDateTime.setHours(hours, minutes, 0, 0);
        }

        const durationInMs = (session.duration || 60) * 60 * 1000;
        const timeDiff = sessionDateTime.getTime() - now.getTime();
        const isWithinJoinWindow = timeDiff <= (15 * 60 * 1000) && timeDiff >= -durationInMs;

        return isWithinJoinWindow && (session.status === 'scheduled' || session.status === 'active');
    };

    const getSessionDotColor = (session: Session) => {
        if (session.status === 'active' || isSessionJoinable(session)) return T.amber;
        if (session.status === 'completed') return T.green;
        if (session.status === 'cancelled' || session.status === 'no-show') return T.muted;
        return T.red; // upcoming
    };

    const canReschedule = (session: Session) => {
        const sessionDate = new Date(session.sessionDate);
        const now = new Date();
        const hoursDiff = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursDiff > 24 && session.status === 'scheduled';
    };

    const canCancel = (session: Session) => {
        return session.status === 'scheduled' && session.sessionType !== 'immediate';
    };

    const filteredSessions = sessions.filter(session => {
        // 1. Filter by view (upcoming vs past) - STATUS-BASED
        if (view === 'upcoming') {
            // Upcoming = scheduled or no-show sessions
            if (session.status !== 'scheduled' && session.status !== 'no-show') {
                return false;
            }
        } else if (view === 'past') {
            // Past = completed or cancelled sessions
            if (session.status !== 'completed' && session.status !== 'cancelled') {
                return false;
            }
        }

        // 2. Filter by session mode (All/Video/In-person)
        if (filter !== 'all') {
            const sessionMode = session.callMode || 'Video Calling';
            if (filter === 'video' && !sessionMode.toLowerCase().includes('video')) {
                return false;
            }
            if (filter === 'in-person' && !sessionMode.toLowerCase().includes('voice')) {
                return false;
            }
        }

        // 3. Filter by selected date (if any)
        if (selectedDate) {
            const sessionDate = new Date(session.sessionDate);
            const selected = new Date(selectedDate);

            // Compare dates only (ignore time)
            if (sessionDate.toDateString() !== selected.toDateString()) {
                return false;
            }
        }

        return true;
    }).sort((a, b) => {
        const getDateWithTime = (sessionStr: string, timeStr: string) => {
            const d = new Date(sessionStr);
            const [hours, minutes] = parseTime(timeStr);
            if (!isNaN(hours) && !isNaN(minutes)) {
                d.setHours(hours, minutes, 0, 0);
            }
            return d.getTime();
        };
        const timeA = getDateWithTime(a.sessionDate, a.sessionTime);
        const timeB = getDateWithTime(b.sessionDate, b.sessionTime);

        // Always show the latest session on top as requested
        return timeB - timeA;
    });

    const renderCalendar = () => {
        const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
        const days = [];
        const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Previous month navigation
        const prevMonth = () => {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
        };

        const nextMonth = () => {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
        };

        // Empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="h-10"></div>);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const daySessions = getSessionsForDate(date);
            const isToday = date.toDateString() === new Date().toDateString();
            const isSelected = selectedDate?.toDateString() === date.toDateString();

            days.push(
                <div
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className="h-10 flex flex-col items-center justify-center cursor-pointer rounded-xl transition-all"
                    style={{
                        background: isSelected ? T.teal : isToday ? T.tealBg : 'transparent',
                        color: isSelected ? '#fff' : T.text,
                        fontWeight: isSelected || isToday ? 700 : 500,
                        border: isToday && !isSelected ? `1px solid ${T.teal}` : '1px solid transparent',
                    }}
                >
                    <span className="text-sm">{day}</span>
                    {daySessions.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                            {daySessions.slice(0, 3).map((session, idx) => (
                                <div
                                    key={idx}
                                    className="w-1 h-1 rounded-full"
                                    style={{ backgroundColor: isSelected ? '#fff' : getSessionDotColor(session) }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 20, padding: 16, boxShadow: '0 1px 3px rgba(27,43,46,.04)' }}>
                {/* Month Header */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-1.5 rounded-full transition-all duration-200 ease-out hover:scale-110 active:scale-95" style={{ background: T.tealBg }}>
                        <svg className="w-5 h-5" fill="none" stroke={T.teal} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h3 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, color: T.text }}>
                        {monthName}
                    </h3>
                    <button onClick={nextMonth} className="p-1.5 rounded-full transition-all duration-200 ease-out hover:scale-110 active:scale-95" style={{ background: T.tealBg }}>
                        <svg className="w-5 h-5" fill="none" stroke={T.teal} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-center text-xs font-semibold uppercase tracking-wider" style={{ color: T.muted, fontFamily: FONT_SANS }}>
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1" style={{ fontFamily: FONT_SANS }}>
                    {days}
                </div>

                {/* Legend */}
                <div className="mt-4 pt-4 space-y-2" style={{ borderTop: `1px solid ${T.border}` }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ fontFamily: FONT_SANS, color: T.text2 }}>
                        Legend
                    </p>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1.5" style={{ fontFamily: FONT_SANS, color: T.text }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: T.red }}></div>
                        <span>Upcoming</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1.5" style={{ fontFamily: FONT_SANS, color: T.text }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: T.amber }}></div>
                        <span>Ready</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1.5" style={{ fontFamily: FONT_SANS, color: T.text }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: T.green }}></div>
                        <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold" style={{ fontFamily: FONT_SANS, color: T.text }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: T.muted }}></div>
                        <span>Cancelled</span>
                    </div>
                </div>
            </div>
        );
    };

    const getStatusBadge = (status: Session['status'], session: Session) => {
        const badgeBase: React.CSSProperties = { fontFamily: FONT_SANS, fontWeight: 700, fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100 };

        if (isSessionJoinable(session)) {
            return <span style={{ ...badgeBase, background: T.amberBg, color: T.amber }}>Ready</span>;
        }
        const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
            scheduled: { label: 'Upcoming', bg: T.redBg, color: T.red },
            completed: { label: 'Completed', bg: T.greenBg, color: T.green },
            cancelled: { label: 'Cancelled', bg: '#f0efe9', color: T.muted },
            'no-show': { label: 'No Show', bg: '#f0efe9', color: T.text2 },
            active: { label: 'Active', bg: T.tealBg, color: T.teal },
            ended: { label: 'Ended', bg: T.tealBg, color: T.teal },
            payment_pending: { label: 'Payment Pending', bg: T.amberBg, color: T.amber },
        };

        const config = statusConfig[status] || statusConfig.scheduled;

        if (status === 'cancelled' && session.paymentStatus === 'refund_failed') {
            return <span style={{ ...badgeBase, background: T.redBg, color: T.red }}>Refund Failed</span>;
        }
        if (status === 'cancelled' && session.paymentStatus === 'refunded') {
            return <span style={{ ...badgeBase, background: T.greenBg, color: T.green }}>Refunded</span>;
        }

        return (
            <span style={{ ...badgeBase, background: config.bg, color: config.color }}>
                {config.label}
            </span>
        );
    };

    const renderSessionCard = (session: Session) => {
        const sessionDate = new Date(session.sessionDate);
        const formattedDate = sessionDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const formattedTime = session.sessionTime; // Already formatted as string

        return (
            <div
                key={session._id}
                className="transition-all duration-300 ease-out"
                style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 20, padding: 20, boxShadow: '0 1px 3px rgba(27,43,46,.04)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(27,43,46,.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(27,43,46,.04)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            >
                {/* Doctor Info */}
                <div className="flex items-start gap-3 mb-3">
                    {session.doctorId?.profileImage ? (
                        <img
                            src={session.doctorId.profileImage}
                            alt={doctorLabel(session.doctorId)}
                            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                            style={{ border: `2px solid ${T.border}` }}
                            onError={(e) => {
                                // Fallback to initials if image fails to load
                                (e.target as HTMLElement).style.display = 'none';
                                (e.target as HTMLElement).nextElementSibling?.classList.remove('hidden');
                                (e.target as HTMLElement).nextElementSibling?.classList.add('flex');
                            }}
                        />
                    ) : null}
                    <div
                        className={`w-12 h-12 rounded-full items-center justify-center font-bold text-lg flex-shrink-0 ${session.doctorId?.profileImage ? 'hidden' : 'flex'}`}
                        style={{ background: T.teal, color: '#fff', fontFamily: FONT_SERIF }}
                    >
                        {doctorInitials(session.doctorId)}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 17, color: T.text }}>
                                {doctorLabel(session.doctorId)}
                            </h4>
                            {getStatusBadge(session.status, session)}
                        </div>
                        <p className="text-sm" style={{ fontFamily: FONT_SANS, fontWeight: 500, color: T.text2 }}>
                            {formattedDate} at {formattedTime}
                        </p>
                    </div>
                    <span
                        className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full flex-shrink-0"
                        style={{ fontFamily: FONT_SANS, background: T.bg, color: T.text2, border: `1px solid ${T.border}` }}
                    >
                        {session.sessionType || 'Session'}
                    </span>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 text-sm mb-4" style={{ fontFamily: FONT_SANS, fontWeight: 500, color: T.text2 }}>
                    <svg className="w-4 h-4" fill="none" stroke={T.teal} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{session.duration} minutes</span>
                </div>

                {/* Actions */}
                {session.status === 'scheduled' && (
                    <div className="flex justify-end gap-3">
                        {isSessionJoinable(session) && (
                            <button
                                onClick={() => {
                                    if (session.meetingLink) {
                                        window.open(`/video-call/${session._id}`, '_blank');
                                    } else {
                                        window.location.href = `/messages`;
                                    }
                                }}
                                className="px-4 py-1.5 rounded-full font-bold transition-all text-xs flex items-center justify-center gap-1.5"
                                style={{ fontFamily: FONT_SANS, background: T.amberBg, color: T.amber, border: `1px solid ${T.amber}33` }}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Join
                            </button>
                        )}
                        {canReschedule(session) && !isSessionJoinable(session) && (
                            <button
                                onClick={() => {/* TODO: Implement reschedule */ }}
                                className="px-4 py-2 rounded-full font-bold transition-all text-xs"
                                style={{ fontFamily: FONT_SANS, background: '#fff', color: T.teal, border: `1px solid ${T.teal}` }}
                            >
                                Reschedule
                            </button>
                        )}
                        {canCancel(session) && user?.role === 'patient' && (
                            <>
                                {confirmCancelId === session._id ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: FONT_SANS, color: T.text2 }}>Are you sure?</span>
                                        <button
                                            onClick={() => handleCancelSession(session._id)}
                                            disabled={cancelLoadingId === session._id}
                                            className="px-3 py-1 rounded-full font-bold transition-all text-xs"
                                            style={{ fontFamily: FONT_SANS, background: T.redBg, color: T.red, border: `1px solid ${T.red}33` }}
                                        >
                                            {cancelLoadingId === session._id ? 'Cancelling...' : 'Yes, Cancel'}
                                        </button>
                                        <button
                                            onClick={() => setConfirmCancelId(null)}
                                            disabled={cancelLoadingId === session._id}
                                            className="px-3 py-1 rounded-full font-bold transition-all text-xs"
                                            style={{ fontFamily: FONT_SANS, background: T.bg, color: T.text2, border: `1px solid ${T.border}` }}
                                        >
                                            No
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmCancelId(session._id)}
                                        className="px-4 py-1.5 rounded-full font-bold transition-all text-xs"
                                        style={{ fontFamily: FONT_SANS, background: T.bg, color: T.text2, border: `1px solid ${T.border}` }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                )}
                {/* Actions for Past Sessions */}
                {(session.status === 'completed' || session.status === 'cancelled') && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => {/* TODO: View session details */ }}
                            className="flex-1 px-4 py-2.5 rounded-full font-bold transition-all text-sm"
                            style={{ fontFamily: FONT_SANS, background: '#fff', color: T.teal, border: `1px solid ${T.teal}` }}
                        >
                            View Details
                        </button>
                        {session.status === 'completed' && (
                            <button
                                onClick={() => {/* TODO: Open rating modal */ }}
                                className="flex-1 px-4 py-2.5 rounded-full font-bold transition-all text-sm"
                                style={{ fontFamily: FONT_SANS, background: T.teal, color: '#fff' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.tealHover; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.teal; }}
                            >
                                Rate Session
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-opacity duration-300 ease-out animate-fadeIn" style={{ background: 'rgba(22,38,42,.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .animate-scaleIn {
                    animation: scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
            <div
                className="rounded-[32px] max-w-6xl w-full h-[95vh] lg:h-[85vh] overflow-hidden flex flex-col animate-scaleIn transition-all duration-300 ease-in-out"
                style={{ background: T.bg, boxShadow: '0 20px 60px rgba(27,43,46,.25)', border: `1px solid ${T.border}` }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 sm:px-8 shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <div>
                        <div className="flex items-center gap-1.5 mb-1" style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: 10, letterSpacing: '.12em', color: T.teal, textTransform: 'uppercase' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
                            Schedule
                        </div>
                        <h2 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 24, color: T.text }}>
                            Manage My Sessions
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full transition-all duration-300 ease-out hover:scale-105 active:scale-95"
                        style={{ background: '#fff', border: `1px solid ${T.border}` }}
                    >
                        <svg className="w-5 h-5" fill="none" stroke={T.text} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {/* Left: Calendar */}
                    <div className="w-full lg:w-80 flex-shrink-0">
                        {renderCalendar()}
                    </div>

                    {/* Right: Sessions List */}
                    <div className="flex-1">
                        {/* Filters */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {(['all', 'video', 'in-person'] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className="px-6 py-2.5 rounded-full font-bold text-sm transition-all"
                                    style={
                                        filter === f
                                            ? { fontFamily: FONT_SANS, background: T.teal, color: '#fff' }
                                            : { fontFamily: FONT_SANS, background: '#fff', color: T.text2, border: `1px solid ${T.border}` }
                                    }
                                >
                                    {f === 'all' ? 'All' : f === 'video' ? 'Video' : 'In-person'}
                                </button>
                            ))}
                        </div>

                        {/* View Toggle */}
                        <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-3xl w-fit" style={{ background: '#efece2' }}>
                            <button
                                onClick={() => setView('upcoming')}
                                className="px-6 py-2 rounded-full font-bold text-sm transition-all"
                                style={
                                    view === 'upcoming'
                                        ? { fontFamily: FONT_SANS, background: '#fff', color: T.text, boxShadow: '0 1px 3px rgba(27,43,46,.08)' }
                                        : { fontFamily: FONT_SANS, background: 'transparent', color: T.text2 }
                                }
                            >
                                Upcoming Sessions
                            </button>
                            <button
                                onClick={() => setView('past')}
                                className="px-6 py-2 rounded-full font-bold text-sm transition-all"
                                style={
                                    view === 'past'
                                        ? { fontFamily: FONT_SANS, background: '#fff', color: T.text, boxShadow: '0 1px 3px rgba(27,43,46,.08)' }
                                        : { fontFamily: FONT_SANS, background: 'transparent', color: T.text2 }
                                }
                            >
                                Past Sessions
                            </button>
                        </div>
                        {/* Sessions List */}
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="inline-block w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: T.teal, borderTopColor: 'transparent' }}></div>
                                </div>
                            ) : filteredSessions.length > 0 ? (
                                filteredSessions.map(renderSessionCard)
                            ) : (
                                <div className="text-center py-16 rounded-[24px]" style={{ background: '#fff', border: `1px solid ${T.border}` }}>
                                    <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke={T.muted} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="font-bold text-lg mb-2" style={{ fontFamily: FONT_SERIF, fontWeight: 500, color: T.text }}>
                                        {view === 'upcoming'
                                            ? 'No upcoming sessions scheduled'
                                            : 'No past sessions found'}
                                    </p>
                                    <p className="text-sm" style={{ fontFamily: FONT_SANS, color: T.text2 }}>
                                        {view === 'upcoming'
                                            ? 'Book a new session to get started'
                                            : selectedDate
                                                ? 'Try selecting a different date or clear the selection'
                                                : 'Your completed sessions will appear here'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex justify-end gap-4 p-6 sm:px-8 shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
                    <button
                        onClick={() => {
                            onClose();
                            navigate('/choose-professional');
                        }}
                        className="px-10 py-3.5 rounded-full font-bold hover:-translate-y-0.5 active:scale-95 transition-all duration-300 ease-out text-sm uppercase tracking-wider"
                        style={{ fontFamily: FONT_SANS, background: T.teal, color: '#fff' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.tealHover; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = T.teal; }}
                    >
                        Book New Session
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PatientCalendarModal;
