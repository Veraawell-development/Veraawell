import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Session {
  _id: string;
  sessionDate: string;
  sessionTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  patientId: {
    firstName: string;
    lastName: string;
  };
  doctorId: {
    firstName: string;
    lastName: string;
  };
  meetingLink?: string;
  sessionType: string;
  price: number;
}

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
  // Removed loading state for faster calendar load

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchCalendarSessions();
  }, [currentDate, refreshTrigger]); // Re-fetch when refreshTrigger changes

  const fetchCalendarSessions = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[CALENDAR] Authorization header added');
      }
      
      console.log('[CALENDAR] Fetching sessions for:', `${year}-${month}`);
      const response = await fetch(`${API_BASE_URL}/sessions/calendar/${year}/${month}`, {
        credentials: 'include',
        headers
      });
      
      console.log('[CALENDAR] Response status:', response.status);
      if (response.ok) {
        const sessionsData = await response.json();
        console.log('[CALENDAR] Sessions loaded:', sessionsData.length);
        setSessions(sessionsData);
      } else {
        console.error('[CALENDAR] Failed to fetch sessions:', response.status);
      }
    } catch (error) {
      console.error('[CALENDAR] Error fetching calendar sessions:', error);
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

  // Removed unused function - month navigation not currently used in UI
  // const navigateMonth = (direction: 'prev' | 'next') => {
  //   const newDate = new Date(currentDate);
  //   if (direction === 'prev') {
  //     newDate.setMonth(newDate.getMonth() - 1);
  //   } else {
  //     newDate.setMonth(newDate.getMonth() + 1);
  //   }
  //   setCurrentDate(newDate);
  // };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const today = new Date();
  const isCurrentMonth = currentDate.getMonth() === today.getMonth() && 
                         currentDate.getFullYear() === today.getFullYear();

  const canJoinSession = (session: Session) => {
    // Immediate sessions can be joined right away (for testing)
    if (session.sessionType === 'immediate' && session.status === 'scheduled') {
      return true;
    }
    
    const now = new Date();
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);
    
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff <= 15 && minutesDiff >= -60 && session.status === 'scheduled';
  };

  return (
    <div className="p-6 text-white flex flex-col h-full rounded-lg border border-gray-300" style={{ backgroundColor: '#ABA5D1' }}>
      {/* Calendar Title */}
      <div className="border-b-2 border-white pb-3 mb-4">
        <h3 className="text-2xl font-bold text-center" style={{ fontFamily: 'Bree Serif, serif' }}>Calendar</h3>
      </div>

      {/* Month and Year Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xl font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>{monthNames[currentDate.getMonth()]}</h4>
        <p className="text-xl font-bold" style={{ fontFamily: 'Inter, sans-serif' }}>{currentDate.getFullYear()}</p>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-sm mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
        {dayNames.map(day => (
          <div key={day} className="font-bold p-1">{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-base flex-1" style={{ fontFamily: 'Inter, sans-serif' }}>
        {/* Empty cells for days before the first day of the month */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="p-1"></div>
        ))}
        
        {/* Days of the month */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const daysSessions = getSessionsForDate(day);
          const isToday = isCurrentMonth && day === today.getDate();
          
          // Determine the primary session status for the day
          let dayBackgroundColor = '';
          let hasSessions = daysSessions.length > 0;
          let hasMultipleSessions = daysSessions.length > 1;
          
          if (hasSessions) {
            // Priority: joinable > upcoming > completed > cancelled
            const joinableSession = daysSessions.find(s => canJoinSession(s));
            const upcomingSession = daysSessions.find(s => s.status === 'scheduled');
            const completedSession = daysSessions.find(s => s.status === 'completed');
            
            if (joinableSession) {
              dayBackgroundColor = 'bg-yellow-400'; // Ready to join - yellow
            } else if (upcomingSession) {
              dayBackgroundColor = 'bg-red-500'; // Upcoming - red
            } else if (completedSession) {
              dayBackgroundColor = 'bg-green-500'; // Completed - green
            } else {
              dayBackgroundColor = 'bg-gray-400'; // Cancelled - gray
            }
          }
          
          return (
            <div 
              key={day} 
              className={`p-2 relative font-semibold rounded-lg transition-all ${
                hasSessions 
                  ? `${dayBackgroundColor} cursor-pointer hover:opacity-80 hover:scale-105 ${
                      hasMultipleSessions ? 'ring-2 ring-white ring-offset-2 ring-offset-[#ABA5D1]' : ''
                    }`
                  : isToday 
                    ? 'ring-2 ring-white' 
                    : ''
              }`}
              onClick={() => {
                if (daysSessions.length === 1 && onSessionClick) {
                  onSessionClick(daysSessions[0]);
                } else if (daysSessions.length > 1 && onSessionClick) {
                  // Show session selector for multiple sessions
                  setSelectedDateSessions(daysSessions);
                  setShowSessionSelector(true);
                }
              }}
              onMouseEnter={() => hasSessions && setHoveredDate(day)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <div className="text-center">{day}</div>
              {hasMultipleSessions && (
                <div className="absolute top-0 right-0 bg-white text-[#ABA5D1] text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: '10px' }}>
                  {daysSessions.length}
                </div>
              )}
              
              {/* Hover Tooltip for Multiple Sessions */}
              {hoveredDate === day && hasMultipleSessions && (
                <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 bg-white rounded-lg shadow-2xl p-3 border-2 border-[#ABA5D1]">
                  <div className="text-xs font-bold mb-2 text-center" style={{ color: '#ABA5D1', fontFamily: 'Bree Serif, serif' }}>
                    {daysSessions.length} Sessions on this day
                  </div>
                  <div className="space-y-2">
                    {daysSessions.map((session) => (
                      <div key={session._id} className="text-xs p-2 rounded" style={{ backgroundColor: '#F3F4F6', fontFamily: 'Inter, sans-serif' }}>
                        <div className="font-semibold" style={{ color: '#000' }}>
                          {session.sessionTime} - {session.status}
                        </div>
                        <div className="text-gray-600">
                          {userRole === 'patient' 
                            ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`
                            : `${session.patientId.firstName} ${session.patientId.lastName}`
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-center mt-2 text-gray-500">
                    Click to select a session
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 text-xs" style={{ fontFamily: 'Inter, sans-serif' }}>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-500 mr-2 rounded"></div>
            <span>Upcoming</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-400 mr-2 rounded"></div>
            <span>Ready to Join</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 mr-2 rounded"></div>
            <span>Completed</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-400 mr-2 rounded"></div>
            <span>Cancelled</span>
          </div>
        </div>
      </div>

      {/* Session Selector Modal - Modern Design */}
      {showSessionSelector && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowSessionSelector(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden"
            style={{ animation: 'slideUp 0.3s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-6 py-5 border-b border-gray-100">
              <button
                onClick={() => setShowSessionSelector(false)}
                className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h3 className="text-xl font-bold text-center pr-8" style={{ fontFamily: 'Bree Serif, serif', color: '#1F2937' }}>
                Choose Your Session
              </h3>
              <p className="text-sm text-center mt-1" style={{ fontFamily: 'Inter, sans-serif', color: '#6B7280' }}>
                {selectedDateSessions.length} session{selectedDateSessions.length > 1 ? 's' : ''} available
              </p>
            </div>
            
            {/* Sessions List */}
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedDateSessions.map((session) => {
                const isJoinable = canJoinSession(session);
                const statusColors = {
                  scheduled: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
                  completed: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
                  cancelled: { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
                  'no-show': { bg: '#F9FAFB', text: '#374151', border: '#E5E7EB' }
                };
                const colors = statusColors[session.status] || statusColors['no-show'];
                
                return (
                  <div
                    key={session._id}
                    onClick={() => {
                      setShowSessionSelector(false);
                      if (onSessionClick) {
                        onSessionClick(session);
                      }
                    }}
                    className="group relative bg-white border-2 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
                    style={{ 
                      borderColor: isJoinable ? '#F59E0B' : '#E5E7EB',
                      backgroundColor: isJoinable ? '#FFFBEB' : '#FFFFFF'
                    }}
                  >
                    {/* Ready to Join Badge */}
                    {isJoinable && (
                      <div className="absolute -top-2 -right-2 px-3 py-1 rounded-full text-xs font-bold shadow-md animate-pulse" style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}>
                        ⚡ JOIN NOW
                      </div>
                    )}
                    
                    <div className="flex items-start gap-4">
                      {/* Time Circle */}
                      <div className="flex-shrink-0 w-16 h-16 rounded-2xl flex flex-col items-center justify-center" style={{ backgroundColor: isJoinable ? '#FEF3C7' : '#F3F4F6' }}>
                        <div className="text-xs font-medium" style={{ color: '#6B7280', fontFamily: 'Inter, sans-serif' }}>
                          {session.sessionTime.split(':')[0]}
                        </div>
                        <div className="text-lg font-bold" style={{ color: '#1F2937', fontFamily: 'Bree Serif, serif' }}>
                          {session.sessionTime.split(':')[1]}
                        </div>
                      </div>
                      
                      {/* Session Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-base truncate" style={{ fontFamily: 'Bree Serif, serif', color: '#1F2937' }}>
                            {userRole === 'patient' 
                              ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}`
                              : `${session.patientId.firstName} ${session.patientId.lastName}`
                            }
                          </h4>
                        </div>
                        
                        {/* Status Badge */}
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-2" style={{ backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.text }}></div>
                          {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs" style={{ fontFamily: 'Inter, sans-serif', color: '#6B7280' }}>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {session.sessionType}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ₹{session.price}
                          </span>
                        </div>
                      </div>
                      
                      {/* Arrow Icon */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-1" style={{ backgroundColor: '#F3F4F6' }}>
                        <svg className="w-4 h-4" style={{ color: '#6B7280' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Manage Calendar Button - Only for doctors */}
      {userRole === 'doctor' && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => navigate('/manage-calendar')}
            className="px-6 py-2 rounded-full text-sm font-bold transition-all hover:opacity-90"
            style={{ 
              backgroundColor: '#7DA9A8',
              color: 'white',
              fontFamily: 'Bree Serif, serif'
            }}
          >
            Manage Calendar
          </button>
        </div>
      )}

      {/* Removed loading overlay for faster calendar interaction */}
    </div>
  );
};

export default Calendar;
