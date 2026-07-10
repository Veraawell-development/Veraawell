import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

interface PatientCalendarModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Session {
    _id: string;
    patientId: string;
    doctorId: {
        _id: string;
        firstName: string;
        lastName: string;
        profileImage?: string;
    };
    sessionDate: string;
    sessionTime: string;
    duration: number;
    sessionType: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
    callMode?: string;
    meetingLink?: string;
    notes?: string;
}

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
        if (session.status === 'cancelled' || session.status === 'completed' || session.status === 'no-show') return false;

        const now = new Date();
        const sessionDateTime = new Date(session.sessionDate);
        const [hours, minutes] = session.sessionTime.split(':').map(Number);
        sessionDateTime.setHours(hours, minutes, 0, 0);

        const durationInMs = (session.duration || 60) * 60 * 1000;
        const timeDiff = sessionDateTime.getTime() - now.getTime();
        const isWithinJoinWindow = timeDiff <= (15 * 60 * 1000) && timeDiff >= -durationInMs;

        return isWithinJoinWindow && session.status === 'scheduled';
    };

    const getSessionDotColor = (session: Session) => {
        if (session.status === 'completed') return '#10B981'; // Green
        if (session.status === 'cancelled') return '#9CA3AF'; // Gray
        if (session.status === 'no-show') return '#9CA3AF'; // Gray
        if (isSessionJoinable(session)) return '#F59E0B'; // Yellow/Amber
        return '#EF4444'; // Red - upcoming
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
            const [hours, minutes] = timeStr.split(':').map(Number);
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
                    className={`h-10 flex flex-col items-center justify-center cursor-pointer rounded-xl transition-all ${isToday ? 'bg-white/20 font-bold border border-white/30 text-white' : ''
                        } ${isSelected ? 'bg-white text-[#867EB5] shadow-md font-bold' : 'hover:bg-white/10 text-white'}`}
                >
                    <span className="text-sm">{day}</span>
                    {daySessions.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                            {daySessions.slice(0, 3).map((session, idx) => (
                                <div
                                    key={idx}
                                    className="w-1 h-1 rounded-full"
                                    style={{ backgroundColor: getSessionDotColor(session) }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className="bg-white/10 rounded-[20px] p-4 border border-white/20 shadow-sm backdrop-blur-md text-white">
                {/* Month Header */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-1.5 hover:bg-white/20 rounded-full transition-all duration-300 ease-out hover:scale-110 active:scale-95">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h3 className="text-lg font-bold text-white drop-shadow-sm transition-all duration-300" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {monthName}
                    </h3>
                    <button onClick={nextMonth} className="p-1.5 hover:bg-white/20 rounded-full transition-all duration-300 ease-out hover:scale-110 active:scale-95">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-center text-xs font-bold text-white/70 uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                    {days}
                </div>

                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-white/20 space-y-2">
                    <p className="text-xs font-bold text-white/90 mb-2 uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Legend
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-white mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" style={{ backgroundColor: '#EF4444' }}></div>
                        <span className="drop-shadow-sm">Upcoming</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)]" style={{ backgroundColor: '#F59E0B' }}></div>
                        <span className="drop-shadow-sm">Ready</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white mb-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" style={{ backgroundColor: '#10B981' }}></div>
                        <span className="drop-shadow-sm">Completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(156,163,175,0.8)]" style={{ backgroundColor: '#9CA3AF' }}></div>
                        <span className="drop-shadow-sm">Cancelled</span>
                    </div>
                </div>
            </div>
        );
    };

    const getStatusBadge = (status: Session['status'], session: Session) => {
        if (isSessionJoinable(session)) {
            return <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold bg-[#F59E0B]/20 text-[#FCD34D] border border-white/10" style={{ fontFamily: 'Inter, sans-serif' }}>Ready</span>;
        }
        const statusConfig = {
            scheduled: { label: 'Upcoming', bg: 'bg-[#EF4444]/20', text: 'text-[#FCA5A5]' },
            completed: { label: 'Completed', bg: 'bg-[#10B981]/20', text: 'text-[#6EE7B7]' },
            cancelled: { label: 'Cancelled', bg: 'bg-[#9CA3AF]/20', text: 'text-[#E5E7EB]' },
            'no-show': { label: 'No Show', bg: 'bg-white/20', text: 'text-white' }
        };

        const config = statusConfig[status] || statusConfig.scheduled;

        return (
            <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold ${config.bg} ${config.text} border border-white/10`} style={{ fontFamily: 'Inter, sans-serif' }}>
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
            <div key={session._id} className="bg-white/10 rounded-[20px] p-5 border border-white/10 hover:shadow-2xl hover:bg-white/20 hover:-translate-y-1 transition-all duration-300 ease-out shadow-sm backdrop-blur-md">
                {/* Doctor Info */}
                <div className="flex items-start gap-3 mb-3">
                    {session.doctorId.profileImage ? (
                        <img 
                            src={session.doctorId.profileImage} 
                            alt={`Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`} 
                            className="w-12 h-12 rounded-full object-cover shadow-sm border-2 border-white flex-shrink-0"
                            onError={(e) => {
                                // Fallback to initials if image fails to load
                                (e.target as HTMLElement).style.display = 'none';
                                (e.target as HTMLElement).nextElementSibling?.classList.remove('hidden');
                                (e.target as HTMLElement).nextElementSibling?.classList.add('flex');
                            }}
                        />
                    ) : null}
                    <div className={`w-12 h-12 bg-white rounded-full items-center justify-center text-[#867EB5] font-bold text-lg flex-shrink-0 shadow-sm border-2 border-white/20 ${session.doctorId.profileImage ? 'hidden' : 'flex'}`}>
                        {session.doctorId.firstName[0]}{session.doctorId.lastName[0]}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-bold text-white drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Dr. {session.doctorId.firstName} {session.doctorId.lastName}
                            </h4>
                            {getStatusBadge(session.status, session)}
                        </div>
                        <p className="text-sm font-bold text-white/80 drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {formattedDate} at {formattedTime}
                        </p>
                    </div>
                    <span className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider font-bold bg-white text-[#867EB5] shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {session.sessionType || 'Session'}
                    </span>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 text-sm font-bold text-white/90 mb-4 drop-shadow-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{session.duration} minutes</span>
                </div>

                {/* Actions */}
                {session.status === 'scheduled' && (
                    <div className="flex justify-end gap-3 mt-[-10px]">
                        {isSessionJoinable(session) && (
                            <button
                                onClick={() => {
                                    if (session.meetingLink) {
                                        window.open(`/video-call/${session._id}`, '_blank');
                                    } else {
                                        window.location.href = `/messages`;
                                    }
                                }}
                                className="px-4 py-1.5 bg-[#F59E0B]/20 hover:bg-[#F59E0B]/40 text-[#FCD34D] border border-[#F59E0B]/30 rounded-full font-bold transition-all text-xs flex items-center justify-center gap-1.5"
                                style={{ fontFamily: 'Inter, sans-serif' }}
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
                                className="px-4 py-2 bg-white text-[#867EB5] rounded-full font-bold hover:shadow-lg transition-all text-xs shadow-sm"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Reschedule
                            </button>
                        )}
                        {canCancel(session) && user?.role === 'patient' && (
                            <>
                                {confirmCancelId === session._id ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider">Are you sure?</span>
                                        <button
                                            onClick={() => handleCancelSession(session._id)}
                                            disabled={cancelLoadingId === session._id}
                                            className="px-3 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/40 rounded-full font-bold transition-all text-xs border border-red-500/30"
                                        >
                                            {cancelLoadingId === session._id ? 'Cancelling...' : 'Yes, Cancel'}
                                        </button>
                                        <button
                                            onClick={() => setConfirmCancelId(null)}
                                            disabled={cancelLoadingId === session._id}
                                            className="px-3 py-1 bg-white/10 text-white hover:bg-white/20 rounded-full font-bold transition-all text-xs border border-white/20"
                                        >
                                            No
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setConfirmCancelId(session._id)}
                                        className="px-4 py-1.5 bg-white/10 text-white rounded-full font-bold hover:bg-white/20 border border-white/20 transition-all text-xs shadow-sm"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
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
                            className="flex-1 px-4 py-2.5 bg-white text-[#867EB5] rounded-full font-bold hover:shadow-lg transition-all text-sm shadow-sm"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            View Details
                        </button>
                        {session.status === 'completed' && (
                            <button
                                onClick={() => {/* TODO: Open rating modal */ }}
                                className="flex-1 px-4 py-2.5 bg-white text-[#38ABAE] rounded-full font-bold hover:shadow-lg transition-all text-sm shadow-sm"
                                style={{ fontFamily: 'Inter, sans-serif' }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-md transition-opacity duration-300 ease-out animate-fadeIn">
            <style>{`
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .animate-scaleIn {
                    animation: scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
            <div className="bg-gradient-to-br from-[#ABA5D1] to-[#867EB5] rounded-[32px] shadow-[0_20px_60px_rgba(134,126,181,0.5)] max-w-6xl w-full h-[95vh] lg:h-[85vh] overflow-hidden border border-white/20 flex flex-col animate-scaleIn transition-all duration-300 ease-in-out">
                {/* Header */}
                <div className="flex items-center justify-between p-6 sm:px-8 border-b border-white/10 shrink-0">
                    <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Manage My Sessions
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 bg-white/10 hover:bg-white/20 hover:scale-105 active:scale-95 text-white rounded-full transition-all duration-300 ease-out shadow-sm backdrop-blur-sm"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${filter === 'all'
                                    ? 'bg-white text-[#867EB5] shadow-md'
                                    : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilter('video')}
                                className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${filter === 'video'
                                    ? 'bg-white text-[#867EB5] shadow-md'
                                    : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Video
                            </button>
                            <button
                                onClick={() => setFilter('in-person')}
                                className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${filter === 'in-person'
                                    ? 'bg-white text-[#867EB5] shadow-md'
                                    : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                In-person
                            </button>
                        </div>

                        {/* View Toggle */}
                        <div className="flex flex-wrap gap-2 mb-6 p-1 bg-black/10 rounded-3xl w-fit">
                            <button
                                onClick={() => setView('upcoming')}
                                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${view === 'upcoming'
                                    ? 'bg-white text-[#867EB5] shadow-md'
                                    : 'text-white/80 hover:text-white'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Upcoming Sessions
                            </button>
                            <button
                                onClick={() => setView('past')}
                                className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${view === 'past'
                                    ? 'bg-white text-[#867EB5] shadow-md'
                                    : 'text-white/80 hover:text-white'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Past Sessions
                            </button>
                        </div>                        {/* Sessions List */}
                        <div className="space-y-4">
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="inline-block w-8 h-8 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ) : filteredSessions.length > 0 ? (
                                filteredSessions.map(renderSessionCard)
                            ) : (
                                <div className="text-center py-16 bg-white/5 rounded-[24px] border border-white/10">
                                    <svg className="w-16 h-16 mx-auto text-white/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-white font-bold text-lg mb-2 drop-shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {view === 'upcoming'
                                            ? 'No upcoming sessions scheduled'
                                            : 'No past sessions found'}
                                    </p>
                                    <p className="text-white/70 text-sm font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>
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
                <div className="flex justify-end gap-4 p-6 sm:px-8 border-t border-white/10 shrink-0">
                    <button
                        onClick={() => {
                            onClose();
                            navigate('/choose-professional');
                        }}
                        className="px-10 py-3.5 text-[#867EB5] bg-white rounded-full font-bold hover:shadow-[0_8px_30px_rgba(255,255,255,0.6)] hover:-translate-y-0.5 active:scale-95 transition-all duration-300 ease-out shadow-lg text-sm uppercase tracking-wider"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Book New Session
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PatientCalendarModal;
