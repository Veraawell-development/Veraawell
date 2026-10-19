import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { resolveSessionStart, sessionLocalDateKey, formatSessionDay, formatSessionClock } from '../utils/dateUtils';
import { calculateRefundPreview } from '../utils/refundPolicy';
import SessionModal from './SessionModal';
import { canJoinNow, isBooked, outcomeLabel, type SessionLike } from '../utils/sessionRules';

interface PatientCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Session extends SessionLike {
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
    /** Authoritative start instant; sessionDate/sessionTime are legacy display fields. */
    startsAt?: string;
    sessionDate: string;
    sessionTime: string;
    duration: number;
    price?: number;
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

/** 'YYYY-MM-DD' for a calendar cell, in the same form as sessionLocalDateKey. */
const cellKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const PatientCalendarModal: React.FC<PatientCalendarModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'all' | 'video' | 'voice'>('all');
    const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
    const [loading, setLoading] = useState(false);
    // The session opened from "View Details" / "Rate Session" — both used to
    // be TODOs that did nothing when pressed.
    const [detail, setDetail] = useState<{ session: Session; rate: boolean } | null>(null);
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
                // The server's own record — with the outcome and refund — so
                // the label matches the toast. Patching just the status read
                // "Cancelled — no refund" right after "₹X will be refunded".
                fetchSessions();
                // The server's figure, not the preview's: it is what was actually refunded.
                toast.success(data.refundAmount > 0
                    ? `Session cancelled. ₹${data.refundAmount} will be refunded.`
                    : 'Session cancelled successfully');
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
                // Booked sessions only: a checkout that was closed or never
                // paid isn't a session (it showed as "Cancelled — no refund").
                setSessions((data as Session[]).filter(isBooked));
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

    // Sessions belong to their IST calendar day. Reading the UTC-midnight
    // sessionDate in the viewer's zone put them on the previous day for
    // anyone west of UTC.
    const getSessionsForDate = (date: Date) => {
        const key = cellKey(date);
        return sessions.filter(session => sessionLocalDateKey(session) === key);
    };

    // The server's window: 15 minutes before the start until the session
    // really ends (utils/sessionRules.ts).
    const isSessionJoinable = (session: Session) => canJoinNow(session);

    const getSessionDotColor = (session: Session) => {
        if (session.status === 'active' || isSessionJoinable(session)) return T.amber;
        if (session.status === 'completed') return T.green;
        if (session.status === 'cancelled' || session.status === 'no-show') return T.muted;
        return T.red; // upcoming
    };

    const canCancel = (session: Session) => {
        return session.status === 'scheduled' && session.sessionType !== 'immediate';
    };

    const filteredSessions = sessions.filter(session => {
        // 1. Filter by view (upcoming vs past) - STATUS-BASED
        if (view === 'upcoming') {
            // Upcoming = scheduled, or under way right now ('active' — e.g. a
            // paid instant session — used to be in neither list).
            if (session.status !== 'scheduled' && session.status !== 'active') {
                return false;
            }
        } else if (view === 'past') {
            // Past = finished one way or another. 'no-show' is an outcome, not
            // something upcoming.
            if (session.status !== 'completed' && session.status !== 'cancelled' && session.status !== 'no-show') {
                return false;
            }
        }

        // 2. Filter by session mode (All/Video/Voice). It was labelled
        //    "In-person" — there are no in-person sessions; it showed voice calls.
        if (filter !== 'all') {
            const sessionMode = session.callMode || 'Video Calling';
            if (filter === 'video' && !sessionMode.toLowerCase().includes('video')) {
                return false;
            }
            if (filter === 'voice' && !sessionMode.toLowerCase().includes('voice')) {
                return false;
            }
        }

        // 3. Filter by selected date (if any)
        if (selectedDate) {
            if (sessionLocalDateKey(session) !== cellKey(selectedDate)) {
                return false;
            }
        }

        return true;
    }).sort((a, b) => {
        const timeA = resolveSessionStart(a).getTime() || 0;
        const timeB = resolveSessionStart(b).getTime() || 0;

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

        // What became of a finished session, in words (refunded or not, and why).
        const outcome = outcomeLabel(session, 'patient');
        if (outcome) {
            const palette = outcome.tone === 'good' ? { background: T.greenBg, color: T.green }
                : outcome.tone === 'bad' ? { background: T.redBg, color: T.red }
                : outcome.tone === 'warn' ? { background: T.amberBg, color: T.amber }
                : { background: '#f0efe9', color: T.text2 };
            return <span style={{ ...badgeBase, ...palette }}>{outcome.label}</span>;
        }

        return (
            <span style={{ ...badgeBase, background: config.bg, color: config.color }}>
                {config.label}
            </span>
        );
    };

    const renderSessionCard = (session: Session) => {
        const sessionStart = resolveSessionStart(session);
        const formattedDate = formatSessionDay(sessionStart, { month: 'short', day: 'numeric', year: 'numeric' }, 'en-US');
        // sessionTime is the IST wall clock already; startsAt is shown in IST to match.
        const formattedTime = session.startsAt ? formatSessionClock(sessionStart, 'en-US') : session.sessionTime;
        const refund = calculateRefundPreview(session.price ?? 0, sessionStart);

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
                {(session.status === 'scheduled' || session.status === 'active') && (
                    <div className="flex flex-wrap justify-end gap-3">
                        {isSessionJoinable(session) && (
                            <button
                                onClick={() => {
                                    // Same tab: a new tab starts without the in-memory
                                    // session token, which is the only credential when
                                    // the browser withholds the cookie. (Without a
                                    // meetingLink this used to send the patient to
                                    // /messages instead of the call.)
                                    onClose();
                                    navigate(`/video-call/${session._id}`);
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
                        {/* "Reschedule" was a button with no handler; hidden until rescheduling exists. */}
                        {canCancel(session) && user?.role === 'patient' && (
                            <>
                                {confirmCancelId === session._id ? (
                                    // Same refund preview SessionModal shows before a
                                    // cancel — the patient sees what they get back
                                    // before committing, not after.
                                    <div className="w-full" role="group" aria-label="Confirm cancellation">
                                        <div className="rounded-xl border p-3 mb-3" style={{ borderColor: refund.color + '40', background: refund.color + '0d' }}>
                                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ fontFamily: FONT_SANS, color: refund.color }}>Refund Policy</p>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-xs" style={{ fontFamily: FONT_SANS, color: T.text2 }}>{refund.label}</span>
                                                <span className="text-base font-bold" style={{ fontFamily: FONT_SANS, color: refund.color }}>₹{refund.amount}</span>
                                            </div>
                                            {refund.amount > 0 && (
                                                <p className="text-[11px] mt-1" style={{ fontFamily: FONT_SANS, color: T.muted }}>Refund will appear in your original payment method within 5–7 business days.</p>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setConfirmCancelId(null)}
                                                disabled={cancelLoadingId === session._id}
                                                className="px-3 py-1.5 rounded-full font-bold transition-all text-xs"
                                                style={{ fontFamily: FONT_SANS, background: T.bg, color: T.text2, border: `1px solid ${T.border}` }}
                                            >
                                                Keep Session
                                            </button>
                                            <button
                                                onClick={() => handleCancelSession(session._id)}
                                                disabled={cancelLoadingId === session._id}
                                                className="px-3 py-1.5 rounded-full font-bold transition-all text-xs"
                                                style={{ fontFamily: FONT_SANS, background: T.redBg, color: T.red, border: `1px solid ${T.red}33` }}
                                            >
                                                {cancelLoadingId === session._id ? 'Cancelling...' : 'Yes, Cancel'}
                                            </button>
                                        </div>
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
                {(session.status === 'completed' || session.status === 'cancelled' || session.status === 'no-show') && (
                    <div className="flex gap-3">
                        <button
                            onClick={() => setDetail({ session, rate: false })}
                            className="flex-1 px-4 py-2.5 rounded-full font-bold transition-all text-sm"
                            style={{ fontFamily: FONT_SANS, background: '#fff', color: T.teal, border: `1px solid ${T.teal}` }}
                        >
                            View Details
                        </button>
                        {session.status === 'completed' && (
                            <button
                                onClick={() => setDetail({ session, rate: true })}
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
                            {(['all', 'video', 'voice'] as const).map((f) => (
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
                                    {f === 'all' ? 'All' : f === 'video' ? 'Video' : 'Voice'}
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
            <SessionModal
                session={detail ? (detail.session as unknown as React.ComponentProps<typeof SessionModal>['session']) : null}
                userRole="patient"
                isOpen={!!detail}
                startWithRating={!!detail?.rate}
                onClose={() => { setDetail(null); void fetchSessions(); }}
            />
        </div>
    );
};

export default PatientCalendarModal;
