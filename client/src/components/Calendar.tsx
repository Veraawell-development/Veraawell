import React, { useState, useEffect } from 'react';

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
}

const Calendar: React.FC<CalendarProps> = ({ userRole, onSessionClick }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  // Removed loading state for faster calendar load

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  useEffect(() => {
    fetchCalendarSessions();
  }, [currentDate]);

  const fetchCalendarSessions = async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      
      const response = await fetch(`${API_BASE_URL}/sessions/calendar/${year}/${month}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const sessionsData = await response.json();
        setSessions(sessionsData);
      }
    } catch (error) {
      console.error('Error fetching calendar sessions:', error);
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

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

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
    const now = new Date();
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);
    
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff <= 15 && minutesDiff >= -60 && session.status === 'scheduled';
  };

  return (
    <div className="p-6 text-white flex flex-col h-full" style={{ backgroundColor: '#ABA5D1' }}>
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <button 
          onClick={() => navigateMonth('prev')}
          className="p-1 hover:bg-white/10 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="text-center">
          <h4 className="text-2xl font-bold font-serif">{monthNames[currentDate.getMonth()]}</h4>
          <p className="text-lg font-serif">{currentDate.getFullYear()}</p>
        </div>
        
        <button 
          onClick={() => navigateMonth('next')}
          className="p-1 hover:bg-white/10 rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-serif mb-3">
        {dayNames.map(day => (
          <div key={day} className="font-semibold p-1">{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-serif flex-1">
        {/* Empty cells for days before the first day of the month */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} className="p-1"></div>
        ))}
        
        {/* Days of the month */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const daysSessions = getSessionsForDate(day);
          const isToday = isCurrentMonth && day === today.getDate();
          
          return (
            <div 
              key={day} 
              className={`p-1 relative ${isToday ? 'bg-white/20 rounded' : ''}`}
            >
              <div className="mb-1">{day}</div>
              {daysSessions.map((session, idx) => {
                const canJoin = canJoinSession(session);
                let sessionColor = 'bg-red-500'; // Default for upcoming
                
                if (session.status === 'completed') {
                  sessionColor = 'bg-green-500';
                } else if (session.status === 'cancelled') {
                  sessionColor = 'bg-gray-500';
                } else if (canJoin) {
                  sessionColor = 'bg-yellow-500';
                }
                
                const displayName = userRole === 'patient' 
                  ? (session.doctorId ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}` : 'Doctor')
                  : (session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient');
                
                return (
                  <div
                    key={`${session._id}-${idx}`}
                    className={`w-2 h-2 ${sessionColor} rounded-full mx-auto mb-1 cursor-pointer hover:scale-110 transition-transform`}
                    onClick={() => onSessionClick && onSessionClick(session)}
                    title={`${session.sessionTime} - ${displayName} (${session.status})`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-between items-center mt-3 text-xs font-serif">
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-red-500 mr-1 rounded-full"></div>
            <span>Upcoming</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-yellow-500 mr-1 rounded-full"></div>
            <span>Can Join</span>
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 mr-1 rounded-full"></div>
            <span>Completed</span>
          </div>
        </div>
      </div>

      {/* Removed loading overlay for faster calendar interaction */}
    </div>
  );
};

export default Calendar;
