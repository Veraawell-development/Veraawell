import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface TimeSlot {
  time: string;
  isBooked: boolean;
  sessionId?: string;
}

interface DayAvailability {
  date: string;
  slots: TimeSlot[];
}

interface UpcomingSession {
  _id: string;
  patientId: {
    firstName: string;
    lastName: string;
  };
  sessionDate: string;
  sessionTime: string;
  status: string;
  sessionType: string;
}

const ManageCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [availabilityType, setAvailabilityType] = useState<'same_slots' | 'different_slots'>('same_slots');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [customAvailability, setCustomAvailability] = useState<DayAvailability[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  // Predefined time slots
  const timeSlots = [
    '09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM',
    '09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'
  ];

  // Generate next 7 days for date selection
  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = date.getDate();
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      days.push({ dateStr, dayName, dayNum, monthName });
    }
    return days;
  };

  const next7Days = getNext7Days();

  useEffect(() => {
    fetchAvailability();
    fetchUpcomingSessions();
  }, []);

  const fetchAvailability = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/availability/doctor/current`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailabilityType(data.availabilityType || 'same_slots');
        setSelectedSlots(data.defaultSlots || []);
        setSelectedDates(data.activeDates || []);
        setCustomAvailability(data.customAvailability || []);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
    }
  };

  const fetchUpcomingSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/availability/upcoming-sessions`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const sessions = await response.json();
        setUpcomingSessions(sessions);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const toggleDate = (dateStr: string) => {
    setSelectedDates(prev => 
      prev.includes(dateStr) 
        ? prev.filter(d => d !== dateStr)
        : [...prev, dateStr]
    );
  };

  const toggleSlot = (slot: string) => {
    setSelectedSlots(prev => 
      prev.includes(slot) 
        ? prev.filter(s => s !== slot)
        : [...prev, slot]
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setSaveMessage('');

      const payload = {
        availabilityType,
        defaultSlots: availabilityType === 'same_slots' ? selectedSlots : [],
        activeDates: availabilityType === 'same_slots' ? selectedDates : [],
        customAvailability: availabilityType === 'different_slots' ? customAvailability : []
      };

      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/availability/save`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSaveMessage('Availability saved successfully!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        setSaveMessage('Failed to save availability');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      setSaveMessage('Error saving availability');
    } finally {
      setLoading(false);
    }
  };

  // Removed unused function - status colors handled inline in JSX
  // const getSessionStatusColor = (status: string) => {
  //   switch (status) {
  //     case 'scheduled':
  //       return 'text-blue-600';
  //     case 'completed':
  //       return 'text-green-600';
  //     case 'cancelled':
  //       return 'text-red-600';
  //     default:
  //       return 'text-gray-600';
  //   }
  // };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#ABA5D1' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button
            onClick={() => navigate('/doctor-dashboard')}
            className="absolute left-6 text-white hover:text-gray-200"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>
            Calender
          </h1>
        </div>
      </div>

      <div className="px-4 py-8 max-w-6xl mx-auto">
        {/* Title */}
        <h2 className="text-3xl font-bold text-center mb-8" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
          Schedule Slots As Per Your Availability
        </h2>

        {/* Main Card */}
        <div className="rounded-3xl shadow-lg p-10 mb-8" style={{ backgroundColor: '#E8E5F0' }}>
          {/* Select Date Section */}
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-6 text-center" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
              Select Date
            </h3>
            <div className="grid grid-cols-8 gap-3 px-4">
              {next7Days.map(({ dateStr, dayName, dayNum, monthName }) => (
                <button
                  key={dateStr}
                  onClick={() => toggleDate(dateStr)}
                  className={`py-3 px-2 rounded-xl text-center transition-all shadow-sm ${
                    selectedDates.includes(dateStr)
                      ? 'text-black'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                  style={{ 
                    fontFamily: 'Bree Serif, serif',
                    backgroundColor: selectedDates.includes(dateStr) ? '#00D084' : '#FFFFFF'
                  }}
                >
                  <div className="text-xs font-semibold">{dayNum} {monthName}</div>
                  <div className="text-sm font-bold uppercase">{dayName}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Availability Type Selection */}
          <div className="flex justify-center gap-16 mb-10">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={availabilityType === 'same_slots'}
                onChange={() => setAvailabilityType('same_slots')}
                className="mr-3 w-4 h-4"
              />
              <span className="text-lg font-semibold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>Same slots for each day</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={availabilityType === 'different_slots'}
                onChange={() => setAvailabilityType('different_slots')}
                className="mr-3 w-4 h-4"
              />
              <span className="text-lg font-semibold" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>Different slots for each day</span>
            </label>
          </div>

          {/* Select Slot Section */}
          <div className="mb-10">
            <h3 className="text-2xl font-bold mb-6 text-center" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
              Select Slot
            </h3>
            <div className="grid grid-cols-7 gap-3 px-4">
              {timeSlots.map((slot, idx) => (
                <button
                  key={`${slot}-${idx}`}
                  onClick={() => toggleSlot(slot)}
                  className={`py-3 px-3 rounded-xl text-center transition-all shadow-sm font-bold ${
                    selectedSlots.includes(slot)
                      ? 'text-black'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                  style={{ 
                    fontFamily: 'Bree Serif, serif',
                    backgroundColor: selectedSlots.includes(slot) ? '#00D084' : '#FFFFFF',
                    fontSize: '14px'
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-center">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-16 py-3 rounded-full text-xl font-bold transition-all disabled:opacity-50 shadow-md hover:shadow-lg"
              style={{ 
                backgroundColor: '#FFFFFF',
                color: '#000000',
                fontFamily: 'Bree Serif, serif',
                border: '2px solid #E0E0E0'
              }}
            >
              {loading ? 'Saving...' : 'Save Details'}
            </button>
          </div>

          {saveMessage && (
            <div className={`text-center py-2 mt-4 ${saveMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
              {saveMessage}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="mt-8">
          <h2 className="text-3xl font-bold text-center mb-8" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
            Upcoming Sessions
          </h2>
          <div className="space-y-4 max-w-4xl mx-auto">
            {upcomingSessions.length === 0 ? (
              <p className="text-center text-gray-500 text-lg" style={{ fontFamily: 'Bree Serif, serif' }}>
                No upcoming sessions
              </p>
            ) : (
              upcomingSessions.map((session) => {
                const statusColor = session.status === 'cancelled' ? '#EF4444' : session.sessionType === 'video' ? '#10B981' : '#EF4444';
                return (
                  <div
                    key={session._id}
                    className="rounded-2xl p-6 shadow-sm"
                    style={{ backgroundColor: '#E8E5F0', fontFamily: 'Bree Serif, serif' }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <p className="font-bold text-lg" style={{ color: '#000000' }}>
                          <span className="font-normal">Name :</span> {session.patientId.firstName} {session.patientId.lastName}
                        </p>
                        <p className="text-base" style={{ color: '#000000' }}>
                          <span className="font-normal">Date:</span> {new Date(session.sessionDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-base" style={{ color: statusColor, fontWeight: 'bold' }}>
                          <span className="font-normal" style={{ color: '#000000' }}>Mode:</span> {session.status === 'cancelled' ? 'Cancelled & Refunded' : session.sessionType === 'video' ? 'Video Calling' : 'Voice Calling'}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-base" style={{ color: '#000000' }}>
                          <span className="font-normal">Duration:</span> <span className="font-bold">40 minutes</span>
                        </p>
                        <p className="text-base" style={{ color: '#000000' }}>
                          <span className="font-normal">Time:</span> <span className="font-bold">{session.sessionTime}</span>
                        </p>
                        {session.status === 'scheduled' && (
                          <button className="mt-2 px-6 py-2 bg-white text-black rounded-full text-sm font-bold shadow-sm hover:shadow-md transition-all" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Create Room
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageCalendar;
