import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';

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
    notes?: string;
}

const PatientCalendarModal: React.FC<PatientCalendarModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [filter, setFilter] = useState<'all' | 'video' | 'in-person'>('all');
    const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen]);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/my-sessions`, {
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

    const getSessionDotColor = (session: Session) => {
        if (session.status === 'completed') return '#3B82F6'; // Blue
        if (session.status === 'cancelled') return '#EF4444'; // Red
        if (session.status === 'no-show') return '#9CA3AF'; // Gray
        return '#10B981'; // Green - scheduled/upcoming
    };

    const canReschedule = (session: Session) => {
        const sessionDate = new Date(session.sessionDate);
        const now = new Date();
        const hoursDiff = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursDiff > 24 && session.status === 'scheduled';
    };

    const canCancel = (session: Session) => {
        const sessionDate = new Date(session.sessionDate);
        const now = new Date();
        const hoursDiff = (sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursDiff > 24 && session.status === 'scheduled';
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
                    className={`h-10 flex flex-col items-center justify-center cursor-pointer rounded-lg transition-all ${isToday ? 'bg-teal-100 font-bold' : ''
                        } ${isSelected ? 'bg-teal-600 text-white' : 'hover:bg-gray-100'}`}
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
            <div className="bg-white rounded-xl p-4 border border-gray-200">
                {/* Month Header */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {monthName}
                    </h3>
                    <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Day Labels */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-center text-xs font-semibold text-gray-500">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                    {days}
                </div>

                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                    <p className="text-xs font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Legend:
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <span>Upcoming</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <span>Cancelled</span>
                    </div>
                </div>
            </div>
        );
    };

    const getStatusBadge = (status: Session['status']) => {
        const statusConfig = {
            scheduled: { label: 'Scheduled', bg: 'bg-green-100', text: 'text-green-700' },
            completed: { label: 'Completed', bg: 'bg-blue-100', text: 'text-blue-700' },
            cancelled: { label: 'Cancelled', bg: 'bg-red-100', text: 'text-red-700' },
            'no-show': { label: 'No Show', bg: 'bg-gray-100', text: 'text-gray-700' }
        };

        const config = statusConfig[status] || statusConfig.scheduled;

        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`} style={{ fontFamily: 'Inter, sans-serif' }}>
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
            <div key={session._id} className="bg-white rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all">
                {/* Doctor Info */}
                <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold flex-shrink-0">
                        {session.doctorId.firstName[0]}{session.doctorId.lastName[0]}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Dr. {session.doctorId.firstName} {session.doctorId.lastName}
                            </h4>
                            {getStatusBadge(session.status)}
                        </div>
                        <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {formattedDate} at {formattedTime}
                        </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {session.sessionType || 'Session'}
                    </span>
                </div>

                {/* Duration */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{session.duration} minutes</span>
                </div>

                {/* Actions */}
                {session.status === 'scheduled' && (
                    <div className="flex gap-2">
                        {canReschedule(session) && (
                            <button
                                onClick={() => {/* TODO: Implement reschedule */ }}
                                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-sm"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Reschedule
                            </button>
                        )}
                        {canCancel(session) && (
                            <button
                                onClick={() => {/* TODO: Implement cancel */ }}
                                className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg font-semibold hover:bg-red-100 transition-colors text-sm"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                )}
                {/* Actions for Past Sessions */}
                {(session.status === 'completed' || session.status === 'cancelled') && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => {/* TODO: View session details */ }}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-sm"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                            View Details
                        </button>
                        {session.status === 'completed' && (
                            <button
                                onClick={() => {/* TODO: Open rating modal */ }}
                                className="flex-1 px-4 py-2 bg-teal-50 text-teal-600 rounded-lg font-semibold hover:bg-teal-100 transition-colors text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Manage My Sessions
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex gap-6 p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {/* Left: Calendar */}
                    <div className="w-80 flex-shrink-0">
                        {renderCalendar()}
                    </div>

                    {/* Right: Sessions List */}
                    <div className="flex-1">
                        {/* Filters */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === 'all'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: filter === 'all' ? '#0093AE' : undefined,
                                    fontFamily: 'Inter, sans-serif'
                                }}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilter('video')}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === 'video'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: filter === 'video' ? '#0093AE' : undefined,
                                    fontFamily: 'Inter, sans-serif'
                                }}
                            >
                                Video
                            </button>
                            <button
                                onClick={() => setFilter('in-person')}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${filter === 'in-person'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: filter === 'in-person' ? '#0093AE' : undefined,
                                    fontFamily: 'Inter, sans-serif'
                                }}
                            >
                                In-person
                            </button>
                        </div>

                        {/* View Toggle */}
                        <div className="flex gap-2 mb-6">
                            <button
                                onClick={() => setView('upcoming')}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${view === 'upcoming'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: view === 'upcoming' ? '#ABA5D1' : undefined,
                                    fontFamily: 'Inter, sans-serif'
                                }}
                            >
                                Upcoming Sessions
                            </button>
                            <button
                                onClick={() => setView('past')}
                                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${view === 'past'
                                    ? 'text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{
                                    backgroundColor: view === 'past' ? '#ABA5D1' : undefined,
                                    fontFamily: 'Inter, sans-serif'
                                }}
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
                                <div className="text-center py-12">
                                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-gray-500 text-lg mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {view === 'upcoming'
                                            ? 'No upcoming sessions scheduled'
                                            : 'No past sessions found'}
                                    </p>
                                    <p className="text-gray-400 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
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
                <div className="flex gap-4 p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={() => {
                            onClose();
                            navigate('/choose-professional');
                        }}
                        className="px-6 py-3 text-white rounded-lg font-semibold hover:shadow-lg transition-colors"
                        style={{ backgroundColor: '#0093AE', fontFamily: 'Inter, sans-serif' }}
                    >
                        Book New Session
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PatientCalendarModal;
