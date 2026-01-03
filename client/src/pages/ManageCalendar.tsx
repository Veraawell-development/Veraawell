import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaChevronLeft,
  FaCalendarAlt,
  FaClock,
  FaSave,
  FaCheck,
  FaInfoCircle
} from 'react-icons/fa';
import { Toaster, toast } from 'react-hot-toast';

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

  // State for "Same Slots" mode
  const [activeDates, setActiveDates] = useState<string[]>([]); // Dates user wants to be active
  const [defaultSlots, setDefaultSlots] = useState<string[]>([]); // Slots applied to all active dates

  // State for "Different Slots" mode
  const [customAvailability, setCustomAvailability] = useState<DayAvailability[]>([]);

  // UI State
  const [currentViewDate, setCurrentViewDate] = useState<string>(''); // Currently selected date in UI
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(false);

  // Constants
  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  const TIME_SLOTS = [
    '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM',
    '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM'
  ];

  // Generate next 14 days
  const getNextDays = (count: number) => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < count; i++) {
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

  const nextDays = getNextDays(14);

  // Initialize view date
  useEffect(() => {
    if (nextDays.length > 0 && !currentViewDate) {
      setCurrentViewDate(nextDays[0].dateStr);
    }
  }, []);

  useEffect(() => {
    fetchAvailability();
    fetchUpcomingSessions();
  }, []);

  const fetchAvailability = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/availability/doctor/current`, {
        headers,
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setAvailabilityType(data.availabilityType || 'same_slots');
        setDefaultSlots(data.defaultSlots || []);
        setActiveDates(data.activeDates || []);
        setCustomAvailability(data.customAvailability || []);
      }
    } catch (error) {
      console.error('Error fetching availability:', error);
      toast.error('Failed to load availability');
    }
  };

  const fetchUpcomingSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/availability/upcoming-sessions`, {
        headers,
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

  // --- Handlers ---

  const handleDateClick = (dateStr: string) => {
    setCurrentViewDate(dateStr);

    // In "Same Slots" mode, clicking a date toggles it as active/inactive
    if (availabilityType === 'same_slots') {
      setActiveDates(prev =>
        prev.includes(dateStr)
          ? prev.filter(d => d !== dateStr)
          : [...prev, dateStr]
      );
    }
  };

  const toggleSlot = (slot: string) => {
    if (availabilityType === 'same_slots') {
      // Toggle in defaultSlots
      setDefaultSlots(prev =>
        prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
      );
    } else {
      // Toggle in customAvailability for currentViewDate
      setCustomAvailability(prev => {
        const existingDayIndex = prev.findIndex(d => d.date === currentViewDate);
        const newAvailability = [...prev];

        if (existingDayIndex >= 0) {
          // Update existing day
          const day = { ...newAvailability[existingDayIndex] };
          const slotIndex = day.slots.findIndex(s => s.time === slot);

          if (slotIndex >= 0) {
            // Remove slot
            day.slots = day.slots.filter(s => s.time !== slot);
          } else {
            // Add slot
            day.slots = [...day.slots, { time: slot, isBooked: false }];
          }
          newAvailability[existingDayIndex] = day;
        } else {
          // Create new day entry
          newAvailability.push({
            date: currentViewDate,
            slots: [{ time: slot, isBooked: false }]
          });
        }
        return newAvailability;
      });
    }
  };

  const isSlotSelected = (slot: string) => {
    if (availabilityType === 'same_slots') {
      return defaultSlots.includes(slot);
    } else {
      const day = customAvailability.find(d => d.date === currentViewDate);
      return day?.slots.some(s => s.time === slot) || false;
    }
  };

  const isDateActive = (dateStr: string) => {
    if (availabilityType === 'same_slots') {
      return activeDates.includes(dateStr);
    } else {
      // In different_slots, a date is "active" if it has any slots
      const day = customAvailability.find(d => d.date === dateStr);
      return day && day.slots.length > 0 ? true : false;
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      const payload = {
        availabilityType,
        defaultSlots: availabilityType === 'same_slots' ? defaultSlots : [],
        activeDates: availabilityType === 'same_slots' ? activeDates : [],
        customAvailability: availabilityType === 'different_slots' ? customAvailability : []
      };

      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/availability/save`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success('Availability saved successfully!');
      } else {
        toast.error('Failed to save availability');
      }
    } catch (error) {
      console.error('Error saving availability:', error);
      toast.error('Error saving availability');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/doctor-dashboard')}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-600"
            >
              <FaChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <FaCalendarAlt className="text-teal-600" />
              Manage Availability
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:inline">
              Set your weekly schedule
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Strategy Switcher */}
        <div className="bg-white rounded-2xl shadow-sm p-1 mb-8 max-w-lg mx-auto flex">
          <button
            onClick={() => setAvailabilityType('same_slots')}
            className={`flex-1 py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 ${availabilityType === 'same_slots'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
          >
            Same slots every day
          </button>
          <button
            onClick={() => setAvailabilityType('different_slots')}
            className={`flex-1 py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 ${availabilityType === 'different_slots'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50'
              }`}
          >
            Different slots per day
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Calendar & Slots */}
          <div className="lg:col-span-2 space-y-6">

            {/* Context Message */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
              <FaInfoCircle className="text-blue-500 mt-1 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                {availabilityType === 'same_slots'
                  ? "Select the days you are available, then choose the time slots that apply to ALL those days."
                  : "Select a specific date below, then customize your hours for that day."}
              </p>
            </div>

            {/* Date Strip */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                <span>Select Date(s)</span>
                {availabilityType === 'different_slots' && (
                  <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Editing: {new Date(currentViewDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </span>
                )}
              </h2>

              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                {nextDays.map(({ dateStr, dayName, dayNum }) => {
                  const isActive = isDateActive(dateStr);
                  const isViewing = currentViewDate === dateStr;

                  // Style logic depends on mode
                  let buttonStyle = "bg-white border text-gray-600 hover:border-teal-300";
                  if (availabilityType === 'same_slots') {
                    if (isActive) buttonStyle = "bg-teal-600 text-white border-teal-600 shadow-md";
                  } else {
                    if (isViewing) buttonStyle = "ring-2 ring-teal-500 border-teal-500 bg-teal-50 text-teal-800";
                    if (isActive && !isViewing) buttonStyle = "bg-teal-100 text-teal-800 border-teal-200"; // Has slots separate from view
                  }

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateClick(dateStr)}
                      className={`flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${buttonStyle}`}
                    >
                      <span className="text-xs font-bold uppercase mb-1">{dayName}</span>
                      <span className="text-xl font-bold">{dayNum}</span>
                      {isActive && availabilityType === 'different_slots' && (
                        <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-1"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slots Grid */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800">Available Hours</h2>
                {availabilityType === 'different_slots' && (
                  <span className="text-sm text-gray-500">
                    for {new Date(currentViewDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {TIME_SLOTS.map((slot) => {
                  const selected = isSlotSelected(slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => toggleSlot(slot)}
                      className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${selected
                          ? 'bg-teal-600 text-white shadow-md transform scale-105'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                      {selected && <FaCheck className="text-xs" />}
                      {slot}
                    </button>
                  );
                })}
              </div>

              {/* Hint */}
              <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                <p className="text-sm text-gray-500">
                  Tap slots to add/remove them from your schedule.
                </p>
              </div>
            </div>

            {/* Save Action */}
            <div className="flex justify-end pt-4 pb-12">
              <button
                onClick={handleSave}
                disabled={loading}
                className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold text-white shadow-lg transition-all transform hover:-translate-y-1 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'
                  }`}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <FaSave />
                )}
                Save Availability
              </button>
            </div>

          </div>

          {/* Right Column: Upcoming Sessions */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                <FaClock className="text-teal-600" />
                Upcoming Sessions
              </h2>

              <div className="space-y-4">
                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map((session) => (
                    <div
                      key={session._id}
                      className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-gray-800">
                          {session.patientId.firstName} {session.patientId.lastName}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${session.status === 'confirmed' || session.status === 'scheduled'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-200 text-gray-600'
                          }`}>
                          {session.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <FaCalendarAlt className="text-gray-400 text-xs" />
                        {new Date(session.sessionDate).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FaClock className="text-gray-400 text-xs" />
                        {session.sessionTime}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>No upcoming sessions</p>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 text-center">
                <button
                  onClick={() => navigate('/doctor-dashboard')}
                  className="text-sm text-teal-600 font-semibold hover:text-teal-700"
                >
                  View Full Dashboard
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default ManageCalendar;
