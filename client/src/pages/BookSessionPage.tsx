import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EmergencyContactModal from '../components/EmergencyContactModal';
import { API_CONFIG } from '../config/api';
import BackToDashboard from '../components/BackToDashboard';
import logger from '../utils/logger';
import { useToast } from '../hooks/useToast';
import type { Doctor } from '../types';

const BookSessionPage: React.FC = () => {
  const { doctorId } = useParams<{ doctorId: string }>();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const sessionType = 'regular';
  const [mode, setMode] = useState<'video' | 'voice'>('video');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [hasEmergencyContact, setHasEmergencyContact] = useState(false);
  const { showSuccess, showError: showErrorToast } = useToast();

  useEffect(() => {
    if (doctorId) {
      fetchDoctorDetails();
      checkEmergencyContact();
    }
  }, [doctorId]);

  useEffect(() => {
    if (selectedDate && doctorId) {
      fetchAvailableSlots();
    }
  }, [selectedDate, doctorId]);

  const checkEmergencyContact = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/patients/emergency-contact`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setHasEmergencyContact(!!(data.emergencyContact?.name && data.emergencyContact?.phone));
      }
    } catch (error) {
      logger.error('Error checking emergency contact:', error);
    }
  };

  const fetchDoctorDetails = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/doctors`);
      if (!response.ok) {
        throw new Error('Failed to fetch doctor details');
      }
      const doctors = await response.json();
      const foundDoctor = doctors.find((d: Doctor) => d.userId._id === doctorId);
      if (foundDoctor) {
        setDoctor(foundDoctor);
      } else {
        setError('Doctor not found');
        showErrorToast('Doctor not found');
      }
    } catch (error) {
      logger.error('Error fetching doctor details:', error);
      setError('Failed to load doctor details');
      showErrorToast('Failed to load doctor details');
    }
  };

  const fetchAvailableSlots = async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/doctors/${doctorId}/slots/${selectedDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch available slots');
      }
      const data = await response.json();
      setAvailableSlots(data.availableSlots);
    } catch (error) {
      logger.error('Error fetching available slots:', error);
      setAvailableSlots([]);
    }
  };

  const [duration, setDuration] = useState(20); // Default to 20 mins

  const getPriceForDuration = (dur: number) => {
    if (!doctor) return 0;

    // Map duration to specific price field
    switch (dur) {
      case 20: return (doctor.pricing.session20 !== undefined && doctor.pricing.session20 !== null) ? doctor.pricing.session20 : doctor.pricing.min;
      case 40: return (doctor.pricing.session40 !== undefined && doctor.pricing.session40 !== null) ? doctor.pricing.session40 : (doctor.pricing.session20 || doctor.pricing.min);
      case 55: return (doctor.pricing.session55 !== undefined && doctor.pricing.session55 !== null) ? doctor.pricing.session55 : doctor.pricing.max;
      default: return doctor.pricing.min;
    }
  };

  const handleBookSession = async () => {
    if (!selectedDate || !selectedTime || !doctor) {
      setError('Please select date and time');
      return;
    }

    // Check if emergency contact is set, if not show modal
    if (!hasEmergencyContact) {
      setShowEmergencyModal(true);
      return;
    }

    // Proceed with booking
    await proceedWithBooking();
  };

  const handleEmergencyContactSubmit = async (contactName: string, contactPhone: string, contactRelationship: string) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/patients/emergency-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contactName, contactPhone, contactRelationship })
      });

      if (response.ok) {
        setHasEmergencyContact(true);
        setShowEmergencyModal(false);
        // Now proceed with booking
        await proceedWithBooking();
      }
    } catch (error) {
      logger.error('Error saving emergency contact:', error);
      setError('Failed to save emergency contact');
      showErrorToast('Failed to save emergency contact');
    }
  };

  const proceedWithBooking = async () => {
    try {
      setBookingLoading(true);
      setError(null);

      const price = getPriceForDuration(duration);

      const response = await fetch(`${API_CONFIG.BASE_URL}/sessions/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          doctorId: doctor!.userId._id,
          sessionDate: selectedDate,
          sessionTime: selectedTime,
          sessionType,
          mode,
          price,
          duration: duration
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to book session');
      }

      const data = await response.json();
      logger.info('Booking successful:', data);

      showSuccess('Session booked successfully! Redirecting to your dashboard...');

      setTimeout(() => {
        navigate('/patient-dashboard', {
          state: { refreshSessions: true }
        });
      }, 1500);
    } catch (error: any) {
      logger.error('Error booking session:', error);
      setError(error.message || 'Failed to book session');
    } finally {
      setBookingLoading(false);
    }
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30); // 30 days from now
    return maxDate.toISOString().split('T')[0];
  };

  // Remove loading screen for faster page load

  if (error && !doctor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          >
            Back to Doctors
          </button>
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Doctor not found</p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="mt-4 px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
          >
            Back to Doctors
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] py-12 px-4 selection:bg-teal-100">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-10 pl-1">
          <button
            onClick={() => navigate('/choose-professional')}
            className="group flex items-center text-teal-600 hover:text-teal-700 text-sm font-semibold mb-4 transition-colors"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Doctors
          </button>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight" style={{ fontFamily: 'Bree Serif, serif' }}>Book Session</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Doctor Info */}
          <div className="bg-white rounded-[1.25rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 p-8 lg:col-span-5 relative overflow-hidden">
            {/* Soft background shape */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

            <div className="flex items-start gap-5 mb-8 relative z-10">
              <img
                src={doctor.profileImage}
                alt={`${doctor.userId.firstName} ${doctor.userId.lastName}`}
                className="w-20 h-20 rounded-full object-cover shadow-sm ring-2 ring-white"
              />
              <div className="pt-1 flex-1">
                <h2 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Bree Serif, serif' }}>
                  Dr. {doctor.userId.firstName} {doctor.userId.lastName}
                </h2>
                <p className="text-sm text-gray-500 mb-1.5 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.specialization.join(', ')}</p>
                <p className="text-sm text-gray-500 mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.experience} years experience</p>
                <p className="text-sm text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.qualification.join(', ')}</p>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>Languages</h3>
                <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.languages.join(', ')}</p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>Treats For</h3>
                <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.treatsFor.join(', ')}</p>
              </div>

              <div className="bg-gray-50/50 -mx-4 px-4 py-3 rounded-xl">
                <h3 className="text-sm font-bold text-gray-900 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Pricing</h3>
                <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>₹{doctor.pricing.min} - ₹{doctor.pricing.max} <span className="text-gray-400">per session</span></p>
              </div>

              {doctor.bio && (
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1.5" style={{ fontFamily: 'Inter, sans-serif' }}>About</h3>
                  <p className="text-sm text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>{doctor.bio}</p>
                </div>
              )}
            </div>
          </div>

          {/* Booking Form */}
          <div className="bg-white rounded-[1.25rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-gray-100 p-8 lg:col-span-7">
            <h3 className="text-2xl font-bold text-gray-900 mb-8" style={{ fontFamily: 'Bree Serif, serif' }}>Schedule Your Session</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="space-y-6">


              {/* Session Duration */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Session Duration
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[20, 40, 55].map((dur) => {
                    const price = getPriceForDuration(dur);
                    const isSelected = duration === dur;
                    return (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setDuration(dur)}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-200 ${isSelected
                          ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-500/30'
                          : 'border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-300 hover:bg-white'
                          }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <span className={`text-sm font-bold ${isSelected ? 'text-teal-800' : 'text-gray-700'}`}>
                          {dur} min
                        </span>
                        <span className={`text-xs mt-1.5 font-medium ${isSelected ? 'text-teal-600' : 'text-gray-400'}`}>
                          {price > 0 ? `₹${price}` : 'Free'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Session Mode */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Session Mode
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode('video')}
                    className={`flex-1 py-3.5 px-4 rounded-xl border flex items-center justify-center gap-2.5 transition-all text-sm font-semibold ${mode === 'video'
                      ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-500/30'
                      : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    <svg className={`w-5 h-5 ${mode === 'video' ? 'text-teal-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Video Call
                  </button>
                  <button
                    onClick={() => setMode('voice')}
                    className={`flex-1 py-3.5 px-4 rounded-xl border flex items-center justify-center gap-2.5 transition-all text-sm font-semibold ${mode === 'voice'
                      ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-sm ring-1 ring-teal-500/30'
                      : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    <svg className={`w-5 h-5 ${mode === 'voice' ? 'text-teal-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Voice Call
                  </button>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Select Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime(''); // Reset time when date changes
                    }}
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full p-4 pl-4 pr-10 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-semibold text-gray-800 transition-all outline-none"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                </div>
              </div>

              {/* Time Selection */}
              {selectedDate && (
                <div className="animate-fade-in-up transition-all duration-300">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                    Select Time
                  </label>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2.5 px-2 text-sm font-bold rounded-xl border transition-all ${selectedTime === slot
                            ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/20'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-teal-400 hover:bg-teal-50/20'
                            }`}
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-orange-50/50 text-orange-700 text-sm p-4 rounded-xl border border-orange-100 text-center font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      No available slots for this date
                    </div>
                  )}
                </div>
              )}

              {/* Mock Payment Info */}
              {selectedTime && (
                <div className="bg-gradient-to-br from-teal-50/80 to-[#f0f9fa] p-5 rounded-xl border border-teal-100/50 animate-fade-in-up mt-2">
                  <h4 className="font-bold text-gray-900 mb-4 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Session Summary</h4>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                    <div>
                      <span className="text-gray-400 text-xs block mb-1 font-bold uppercase tracking-wider">Date</span>
                      <span className="font-semibold text-gray-900">{new Date(selectedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block mb-1 font-bold uppercase tracking-wider">Time</span>
                      <span className="font-semibold text-gray-900">{selectedTime}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block mb-1 font-bold uppercase tracking-wider">Duration</span>
                      <span className="font-semibold text-gray-900">{duration} min</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-xs block mb-1 font-bold uppercase tracking-wider">Price</span>
                      <span className="font-bold text-teal-700 text-base">₹{getPriceForDuration(duration)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Book Button */}
              <button
                onClick={handleBookSession}
                disabled={!selectedDate || !selectedTime || bookingLoading}
                className={`w-full py-4 px-6 rounded-xl font-bold text-[15px] transition-all duration-300 mt-4 outline-none ${!selectedDate || !selectedTime || bookingLoading
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-teal-600 text-white hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-600/20 active:scale-[0.98]'
                  }`}
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {bookingLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Booking...
                  </span>
                ) : 'Confirm & Book Session'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact Modal */}
      <EmergencyContactModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onSubmit={handleEmergencyContactSubmit}
      />
    </div>
  );
};

export default BookSessionPage;
