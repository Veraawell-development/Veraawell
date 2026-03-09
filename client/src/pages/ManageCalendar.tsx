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
import BackToDashboard from '../components/BackToDashboard';

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
  const [isEditing, setIsEditing] = useState(false);

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
      // Use LOCAL date parts to avoid UTC timezone shift (e.g. IST +5:30 would push midnight to prev UTC day)
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

    // Only toggle the active dates if we are actively EDITING the default weekly schedule
    if (isEditing && availabilityType === 'same_slots') {
      setActiveDates(prev =>
        prev.includes(dateStr)
          ? prev.filter(d => d !== dateStr)
          : [...prev, dateStr]
      );
    }
  };

  // Helper function to check if a specific time slot on a given date has already passed
  const isSlotInPast = (dateStr: string, timeStr: string) => {
    const now = new Date();

    // Parse the dateStr directly into local year, month, date to avoid UTC shift
    const [year, month, day] = dateStr.split('-').map(Number);

    // Parse the 09:00 AM format
    const [timeVal, period] = timeStr.split(' ');
    let [hours, minutes] = timeVal.split(':').map(Number);

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    // Create Date entirely in local timezone (month is 0-indexed)
    const slotDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

    return slotDate < now;
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
    const dayOverride = customAvailability.find(d => d.date === currentViewDate);

    if (isEditing) {
      // In Edit Mode, show the slots corresponding to the active tab
      if (availabilityType === 'same_slots') {
        return defaultSlots.includes(slot);
      } else { // different_slots
        return dayOverride?.slots.some(s => s.time === slot) || false;
      }
    } else {
      // In View Mode, use the unified cascade logic
      if (dayOverride && dayOverride.slots.length > 0) {
        return dayOverride.slots.some(s => s.time === slot);
      }
      if (activeDates.includes(currentViewDate)) {
        return defaultSlots.includes(slot);
      }
      return false;
    }
  };

  const isDateActive = (dateStr: string) => {
    const hasOverride = customAvailability.some(d => d.date === dateStr && d.slots.length > 0);
    const hasDefault = activeDates.includes(dateStr);

    if (!isEditing) {
      // In view mode, a date is active if it has EITHER an override or is a default active day
      return hasOverride || hasDefault;
    }

    // In edit mode, it reflects the chosen tab
    if (availabilityType === 'same_slots') {
      return hasDefault;
    } else {
      return hasOverride;
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      const payload = {
        availabilityType,
        defaultSlots,
        activeDates,
        customAvailability
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
        setIsEditing(false); // Return to view mode on successful save
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

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    // Optionally trigger a refetch here to discard local unsaved changes
    fetchAvailability();
    setIsEditing(false);
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
        <div className="flex justify-between items-center mb-6">
          <BackToDashboard />
          {!isEditing && (
            <button
              onClick={handleEditClick}
              className="px-6 py-2.5 bg-teal-600 text-white rounded-full font-bold shadow-md hover:bg-teal-700 transition-colors flex items-center gap-2"
            >
              <FaSave className="w-4 h-4" /> Edit Availability
            </button>
          )}
        </div>

        {/* Strategy Switcher - Only visible during editing */}
        {isEditing && (
          <div className="bg-white rounded-2xl shadow-sm p-1 mb-8 max-w-lg mx-auto flex">
            <button
              onClick={() => setAvailabilityType('same_slots')}
              className={`flex-1 py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 ${availabilityType === 'same_slots'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
              Weekly Default Setup
            </button>
            <button
              onClick={() => setAvailabilityType('different_slots')}
              className={`flex-1 py-3 px-6 rounded-xl text-sm font-semibold transition-all duration-200 ${availabilityType === 'different_slots'
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-gray-500 hover:bg-gray-50'
                }`}
            >
              Specific Date Override
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Calendar & Slots */}
          <div className="lg:col-span-2 space-y-6">

            {/* Context Message - Only via Edit Mode */}
            {isEditing && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <FaInfoCircle className="text-blue-500 mt-1 flex-shrink-0" />
                <p className="text-sm text-blue-700">
                  {availabilityType === 'same_slots'
                    ? "Select the days you are returning to your default weekly availability, then choose the slots that apply."
                    : "Select a specific date below to override the default schedule with custom hours."}
                </p>
              </div>
            )}

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
                  const hasOverride = customAvailability.some(d => d.date === dateStr && d.slots.length > 0);

                  // Style logic depends on mode AND editing state
                  let buttonStyle = "bg-white border text-gray-600 hover:border-teal-300";

                  if (!isEditing) {
                    if (isViewing) buttonStyle = "ring-2 ring-teal-500 border-teal-500 bg-teal-50 text-teal-800";
                    else if (hasOverride) buttonStyle = "bg-purple-50 text-purple-800 border-purple-200"; // Override indicator in view mode
                    else if (isActive) buttonStyle = "bg-teal-50 text-teal-800 border-teal-200"; // Default active
                  } else {
                    if (availabilityType === 'same_slots') {
                      if (isActive) buttonStyle = "bg-teal-600 text-white border-teal-600 shadow-md";
                    } else {
                      if (isViewing) buttonStyle = "ring-2 ring-teal-500 border-teal-500 bg-teal-50 text-teal-800";
                      else if (hasOverride) buttonStyle = "bg-purple-100 text-purple-800 border-purple-200"; // Override visual
                      else if (isActive) buttonStyle = "bg-teal-100 text-teal-800 border-teal-200"; // Standard active
                    }
                  }

                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateClick(dateStr)}
                      className={`flex-shrink-0 w-16 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${buttonStyle}`}
                    >
                      <span className="text-xs font-bold uppercase mb-1">{dayName}</span>
                      <span className="text-xl font-bold">{dayNum}</span>
                      {hasOverride && (
                        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full mt-1"></div>
                      )}
                      {!hasOverride && isActive && isEditing && availabilityType === 'different_slots' && (
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
                  const inPast = isSlotInPast(currentViewDate, slot);

                  // Check if this specific slot is already booked by a patient
                  const bookedSession = upcomingSessions.find(s => {
                    const sessionDateStr = new Date(s.sessionDate).toISOString().split('T')[0];
                    return sessionDateStr === currentViewDate && s.sessionTime === slot;
                  });

                  const isButtonDisabled = !isEditing || inPast || !!bookedSession;

                  let buttonClass = '';
                  let statusLabel = null;

                  if (bookedSession) {
                    // Distinct "Booked" style
                    buttonClass = 'bg-teal-700 text-white shadow-inner cursor-not-allowed border-2 border-teal-800 flex-col py-2 px-1';
                    statusLabel = (
                      <span className="text-[10px] font-bold uppercase truncate w-full text-center px-1">
                        Booked: {bookedSession.patientId.firstName}
                      </span>
                    );
                  } else if (inPast) {
                    // Visually disabled / struck-through for past time
                    buttonClass = 'bg-gray-100 text-gray-400 opacity-40 line-through cursor-not-allowed';
                  } else if (selected) {
                    buttonClass = isEditing
                      ? 'bg-teal-600 text-white shadow-md transform scale-105'
                      : 'bg-teal-500 text-white opacity-90';
                  } else {
                    buttonClass = isEditing
                      ? 'bg-gray-50 text-gray-600 hover:bg-gray-100 cursor-pointer'
                      : 'bg-gray-50 text-gray-400 opacity-50 cursor-not-allowed';
                  }

                  return (
                    <button
                      key={slot}
                      onClick={() => isEditing && !inPast && !bookedSession && toggleSlot(slot)}
                      disabled={isButtonDisabled}
                      className={`min-h-[60px] rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1 ${buttonClass}`}
                      title={bookedSession ? `Booked with ${bookedSession.patientId.firstName} ${bookedSession.patientId.lastName}` : ''}
                    >
                      {selected && !inPast && !bookedSession && <FaCheck className="text-xs" />}
                      <span className={bookedSession ? 'text-[12px]' : ''}>{slot}</span>
                      {statusLabel}
                    </button>
                  );
                })}
              </div>

              {/* Hint */}
              {isEditing && (
                <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                  <p className="text-sm text-gray-500">
                    Tap slots to add/remove them from your schedule.
                  </p>
                </div>
              )}
            </div>

            {/* Save Action */}
            {isEditing && (
              <div className="flex justify-end pt-4 pb-12 gap-4">
                <button
                  onClick={handleCancelClick}
                  disabled={loading}
                  className="px-6 py-4 rounded-full font-bold text-gray-600 hover:bg-gray-100 transition-all font-sans"
                >
                  Cancel
                </button>
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
            )}

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
