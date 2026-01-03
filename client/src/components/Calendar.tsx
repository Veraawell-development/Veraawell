import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG } from '../config/api';
import logger from '../utils/logger';
import type { Session } from '../types';

interface CalendarProps {
  userRole: 'patient' | 'doctor';
  onSessionClick?: (session: Session) => void;
  refreshTrigger?: number; // Add refresh trigger prop
}

const Calendar: React.FC<CalendarProps> = ({ userRole, onSessionClick, refreshTrigger }) => {
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
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return sessions.filter(session => session.sessionDate.startsWith(dateStr));
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
    <div className="p-6 text-white flex flex-col h-full rounded-2xl shadow-lg transition-shadow hover:shadow-xl" style={{ backgroundColor: '#ABA5D1' }}>
      {/* Calendar Title */}
      <div className="border-b border-white/30 pb-4 mb-6">
        <h3 className="text-3xl font-bold text-center tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>Calendar</h3>
      </div>

      {/* Month and Year Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <h4 className="text-2xl font-bold" style={{ fontFamily: 'Bree Serif, serif' }}>{monthNames[currentDate.getMonth()]}</h4>
        <p className="text-2xl font-bold opacity-80" style={{ fontFamily: 'Inter, sans-serif' }}>{currentDate.getFullYear()}</p>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-2 text-center text-sm mb-4 opacity-90" style={{ fontFamily: 'Inter, sans-serif' }}>
        {dayNames.map(day => (
          <div key={day} className="font-bold uppercase tracking-wider">{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 text-center text-base flex-1" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Empty cells */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="p-1"></div>
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const daysSessions = getSessionsForDate(day);
          const isToday = isCurrentMonth && day === today.getDate();

          let dayBackgroundColor = '';
          const hasSessions = daysSessions.length > 0;

          // Determine color based on highest priority session
          if (hasSessions) {
            // Check for any joinable first
            if (daysSessions.some(s => getSessionVisualStatus(s) === 'joinable')) {
              dayBackgroundColor = 'bg-[#FF9F1C] shadow-md'; // Yellow/Orange
            }
            // Then check for any upcoming (future scheduled)
            else if (daysSessions.some(s => getSessionVisualStatus(s) === 'upcoming')) {
              dayBackgroundColor = 'bg-[#EF4444] shadow-md'; // Red
            }
            // If strictly cancelled?
            else if (daysSessions.every(s => getSessionVisualStatus(s) === 'cancelled')) {
              dayBackgroundColor = 'bg-gray-400';
            }
            // Otherwise, if they are completed (or past), show green
            else {
              dayBackgroundColor = 'bg-[#78BE9F] shadow-md'; // Green
            }
          }

          return (
            <div
              key={day}
              className={`p-2 min-h-[60px] md:min-h-0 flex flex-col items-center justify-start relative font-semibold rounded-xl transition-all duration-200 ${hasSessions
                ? `${dayBackgroundColor} cursor-pointer hover:scale-105 hover:brightness-110`
                : isToday
                  ? 'bg-white/20 ring-2 ring-white'
                  : 'hover:bg-white/10'
                }`}
              onClick={() => {
                if (daysSessions.length === 1 && onSessionClick) {
                  onSessionClick(daysSessions[0]);
                } else if (daysSessions.length > 1 && onSessionClick) {
                  setSelectedDateSessions(daysSessions);
                  setShowSessionSelector(true);
                }
              }}
              onMouseEnter={() => hasSessions && setHoveredDate(day)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <span>{day}</span>

              {daysSessions.length > 1 && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white animate-pulse"></div>
              )}

              {/* Tooltip */}
              {hoveredDate === day && daysSessions.length > 0 && (
                <div className="absolute z-50 bottom-full mb-2 w-48 bg-white text-gray-800 rounded-lg shadow-xl p-2 text-left pointer-events-none transform -translate-x-1/2 left-1/2">
                  <div className="text-xs font-bold text-[#ABA5D1] mb-1" style={{ fontFamily: 'Bree Serif, serif' }}>
                    {daysSessions.length} Session{daysSessions.length > 1 ? 's' : ''}
                  </div>
                  {daysSessions.map(s => (
                    <div key={s._id} className="text-[10px] py-1 border-b border-gray-100 last:border-0 flex items-center justify-between">
                      <span className="font-bold">{s.sessionTime}</span>
                      <span className={`capitalize ${getSessionVisualStatus(s) === 'completed' ? 'text-green-600' :
                        getSessionVisualStatus(s) === 'upcoming' ? 'text-red-500' :
                          getSessionVisualStatus(s) === 'joinable' ? 'text-orange-500' : 'text-gray-500'
                        }`}>
                        {getSessionVisualStatus(s)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/20 text-xs font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="flex flex-wrap gap-4 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#EF4444] rounded-full"></div>
            <span>Upcoming</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#FF9F1C] rounded-full animate-pulse"></div>
            <span>Ready to Join</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#78BE9F] rounded-full"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span>Cancelled</span>
          </div>
        </div>
      </div>

      {/* Session Selector Modal */}
      {showSessionSelector && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[100] px-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowSessionSelector(false)}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl max-w-lg w-full overflow-hidden transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Select Session
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedDateSessions.length} sessions available on this date
                </p>
              </div>
              <button
                onClick={() => setShowSessionSelector(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedDateSessions.map((session) => {
                const status = getSessionVisualStatus(session);
                const isJoinable = status === 'joinable';

                return (
                  <div
                    key={session._id}
                    onClick={() => {
                      setShowSessionSelector(false);
                      if (onSessionClick) onSessionClick(session);
                    }}
                    className={`group relative border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md ${isJoinable
                      ? 'bg-amber-50 border-amber-200 hover:border-amber-300'
                      : 'bg-white border-gray-100 hover:border-teal-200'
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${isJoinable ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-600'
                        }`}>
                        <span className="text-xs font-medium">{session.sessionTime.split(':')[0]}</span>
                        <span className="text-lg font-bold">{session.sessionTime.split(':')[1]}</span>
                      </div>

                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                          {userRole === 'patient'
                            ? (session.doctorId?.firstName ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}` : 'Doctor')
                            : (session.patientId?.firstName ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient')
                          }
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${status === 'completed' ? 'bg-green-100 text-green-700' :
                            status === 'upcoming' ? 'bg-red-100 text-red-700' :
                              status === 'joinable' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                            {status}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">• {session.sessionType}</span>
                        </div>
                      </div>

                      <div className="text-gray-300 group-hover:text-teal-500 transition-colors">
                        ➜
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {userRole === 'doctor' && (
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
