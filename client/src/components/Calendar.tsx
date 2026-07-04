import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import logger from '../utils/logger';
import type { Session } from '../types';

interface CalendarProps {
  userRole: 'patient' | 'doctor';
  onSessionClick?: (session: Session) => void;
  refreshTrigger?: number;
  hideTitle?: boolean;
  hideManageButton?: boolean;
}

const Calendar: React.FC<CalendarProps> = ({ userRole, onSessionClick, refreshTrigger, hideTitle, hideManageButton }) => {
  const navigate = useNavigate();
  const [currentDate, _setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hoveredDate, setHoveredDate] = useState<number | null>(null);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [selectedDateSessions, setSelectedDateSessions] = useState<Session[]>([]);

  useEffect(() => {
    fetchCalendarSessions();
  }, [currentDate, refreshTrigger]);

  const fetchCalendarSessions = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/calendar/${year}/${month}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const sessionsData = await response.json();
        setSessions(sessionsData);
      } else {
        logger.error('Failed to fetch sessions:', response.status);
      }
    } catch (error) {
      logger.error('Error fetching calendar sessions:', error);
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getSessionsForDate = (day: number) => {
    return sessions.filter(session => {
      const sessionLocalDate = new Date(session.sessionDate);
      return sessionLocalDate.getFullYear() === currentDate.getFullYear() &&
             sessionLocalDate.getMonth() === currentDate.getMonth() &&
             sessionLocalDate.getDate() === day;
    });
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper to check if a session is currently joinable (15 mins before to duration end)
  const isSessionJoinable = (session: Session) => {
    if (session.sessionType === 'immediate' && session.status === 'scheduled') return true;

    // If status is cancelled or explicitly completed/no-show, not joinable
    if (session.status === 'cancelled' || session.status === 'completed' || session.status === 'no-show') return false;

    const now = new Date();
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    const durationInMs = (session.duration || 60) * 60 * 1000;
    const timeDiff = sessionDateTime.getTime() - now.getTime(); // Positive if future, negative if past

    // Joinable window: 15 mins before start (15 * 60 * 1000) until the END of the session
    // timeDiff is (Start - Now). 
    // If Now is 15 mins before Start: Start - Now = 15 mins. timeDiff <= 15mins.
    // If Now is at End (Start + Duration): Start - (Start + Duration) = -Duration.
    const isWithinJoinWindow = timeDiff <= (15 * 60 * 1000) && timeDiff >= -durationInMs;

    return isWithinJoinWindow && session.status === 'scheduled';
  };

  // Helper to determine the visual status of a session
  const getSessionVisualStatus = (session: Session) => {
    if (session.status === 'cancelled') return 'cancelled';
    if (session.status === 'completed') return 'completed';
    if (session.status === 'no-show') return 'cancelled';

    // Calculate end time
    // Calculate end time
    // Logic removed as it relies on strict backend status

    // If time has passed, treat as completed (even if status update hasn't persisted yet)
    // removed local override to respect strict participation rules from backend
    // if (now > endTime) {
    //   return 'completed';
    // }

    // Check if Joinable (highest priority for active sessions)
    if (isSessionJoinable(session)) return 'joinable';

    return 'upcoming';
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear();

  return (
    <div className="flex flex-col h-full bg-transparent min-h-0">
      {/* Calendar Title (Optional) */}
      {!hideTitle && (
        <div className="border-b border-gray-100 pb-2 mb-3">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>Calendar</h3>
        </div>
      )}

      {/* Month and Year Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h4 className="text-lg font-bold text-gray-800" style={{ fontFamily: 'Inter, sans-serif' }}>{monthNames[currentDate.getMonth()]}</h4>
        <p className="text-sm font-bold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Inter, sans-serif' }}>{currentDate.getFullYear()}</p>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] mb-1 font-bold text-gray-400 uppercase tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>
        {dayNames.map(day => (
          <div key={day}>{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs sm:text-sm flex-1 min-h-0" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Empty cells */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="p-1"></div>
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const daySessions = getSessionsForDate(day);
          const isToday = isCurrentMonth && day === today.getDate();
          const hasSessions = daySessions.length > 0;

          let statusColor = '';
          if (hasSessions) {
            if (daySessions.some(s => getSessionVisualStatus(s) === 'joinable')) {
              statusColor = 'bg-amber-400';
            } else if (daySessions.some(s => getSessionVisualStatus(s) === 'upcoming')) {
              statusColor = 'bg-red-500';
            } else if (daySessions.some(s => getSessionVisualStatus(s) === 'completed')) {
              statusColor = 'bg-green-500';
            } else {
              statusColor = 'bg-gray-400';
            }
          }

          return (
            <div key={day} className="flex justify-center items-center py-1">
              <div
                className={`relative flex items-center justify-center rounded-full font-medium cursor-pointer transition-all w-8 h-8 sm:w-10 sm:h-10 ${
                  isToday 
                    ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200 font-bold' 
                    : 'hover:bg-gray-50 text-gray-700'
                } ${hasSessions ? 'font-bold' : ''}`}
                onMouseEnter={() => setHoveredDate(day)}
                onMouseLeave={() => setHoveredDate(null)}
                onClick={() => {
                  if (hasSessions) {
                    setSelectedDateSessions(daySessions);
                    setShowSessionSelector(true);
                  }
                }}
              >
                <span>{day}</span>
                {hasSessions && (
                  <div className={`absolute bottom-0 sm:bottom-1 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${statusColor}`}></div>
                )}

                {/* Tooltip */}
                {hoveredDate === day && hasSessions && (
                  <div className="absolute z-50 bottom-full mb-3 w-64 bg-white/95 backdrop-blur-xl text-gray-800 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-4 text-left transform -translate-x-1/2 left-1/2 border border-white/50 cursor-default" onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-widest border-b border-gray-100 pb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {daySessions.length} Session{daySessions.length > 1 ? 's' : ''}
                    </div>
                    <div className="flex flex-col gap-3">
                      {daySessions.map(s => (
                        <div key={s._id} className="flex items-center justify-between">
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-900 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {s.sessionTime} • {userRole === 'patient' 
                                ? (s.doctorId?.firstName ? `Dr. ${s.doctorId.firstName}` : 'Doctor')
                                : (s.patientId?.firstName ? s.patientId.firstName : 'Patient')}
                            </span>
                            <span className="text-[10px] text-gray-500 capitalize">{s.sessionType}</span>
                          </div>
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            getSessionVisualStatus(s) === 'completed' ? 'bg-green-100 text-green-700' :
                            getSessionVisualStatus(s) === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                            getSessionVisualStatus(s) === 'joinable' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-50 text-blue-600'
                          }`}>
                            {getSessionVisualStatus(s) === 'joinable' ? 'Ready' : getSessionVisualStatus(s)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-center gap-3 text-[9px] font-bold text-gray-500 uppercase tracking-wider shrink-0" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span>Upcoming</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400"></div>
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          <span>Cancelled</span>
        </div>
      </div>

      {/* Session Selector Modal */}
      {showSessionSelector && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity"
          onClick={() => setShowSessionSelector(false)}
        >
          <div
            className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh] transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
              <div>
                <h3 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Select Session
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {selectedDateSessions.length} session{selectedDateSessions.length > 1 ? 's' : ''} available
                </p>
              </div>
              <button
                onClick={() => setShowSessionSelector(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              <div className="space-y-3">
                {selectedDateSessions.map((session) => {
                  const status = getSessionVisualStatus(session);
                  const isJoinable = status === 'joinable';

                  return (
                    <div
                      key={session._id}
                      onClick={() => {
                        if (!isJoinable) {
                          setShowSessionSelector(false);
                          if (onSessionClick) onSessionClick(session);
                        }
                      }}
                      className={`group flex items-center gap-4 p-4 rounded-xl border transition-all ${isJoinable
                          ? 'border-amber-200 bg-amber-50/30'
                          : 'border-gray-100 hover:border-gray-200 cursor-pointer'
                        }`}
                    >
                      <div className={`w-12 h-12 flex flex-col items-center justify-center rounded-lg border ${isJoinable ? 'bg-amber-100/50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-600'} shrink-0`}>
                        <span className="text-[10px] font-medium tracking-wide">{session.sessionTime.split(':')[0]}</span>
                        <span className="text-sm font-bold">{session.sessionTime.split(':')[1]}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                          {userRole === 'patient'
                            ? (session.doctorId?.firstName ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}` : 'Doctor')
                            : (session.patientId?.firstName ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient')
                          }
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500 capitalize">{session.sessionType}</span>
                          <span className="text-gray-300">•</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${status === 'completed' ? 'text-green-600' :
                              status === 'upcoming' ? 'text-red-500' :
                                status === 'joinable' ? 'text-amber-600' :
                                  'text-gray-500'
                              }`}>
                            {status === 'joinable' ? 'Ready' : status}
                          </span>
                        </div>
                      </div>

                      {isJoinable ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowSessionSelector(false);
                            if (session.meetingLink) {
                              window.open(`/video-call/${session._id}`, '_blank');
                            } else {
                              window.location.href = `/messages`;
                            }
                          }}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Join
                        </button>
                      ) : (
                        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hideManageButton && userRole === 'doctor' && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate('/manage-calendar')}
            className="bg-white/20 hover:bg-white/30 text-white border border-white/50 px-6 py-2 rounded-full text-sm font-bold transition-all backdrop-blur-sm"
          >
            Manage Schedule
          </button>
        </div>
      )}
    </div>
  );
};

export default Calendar;
