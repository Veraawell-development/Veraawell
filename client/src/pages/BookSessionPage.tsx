import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EmergencyContactModal from '../components/EmergencyContactModal';
import { API_CONFIG } from '../config/api';
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
  const [sessionType, setSessionType] = useState('regular');
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

      const price = sessionType === 'discovery' ? 0 : doctor!.pricing.min;

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
          price
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
        navigate('/patient-dashboard');
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/choose-professional')}
            className="flex items-center text-teal-600 hover:text-teal-700 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Doctors
          </button>
          <h1 className="text-3xl font-bold text-gray-800 font-serif">Book Session</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Doctor Info */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-start space-x-4 mb-6">
              <img
                src={doctor.profileImage}
                alt={`${doctor.userId.firstName} ${doctor.userId.lastName}`}
                className="w-20 h-20 rounded-full object-cover"
              />
              <div>
                <h2 className="text-2xl font-bold text-gray-800 font-serif">
                  Dr. {doctor.userId.firstName} {doctor.userId.lastName}
                </h2>
                <p className="text-gray-600 mb-2">{doctor.specialization.join(', ')}</p>
                <p className="text-gray-600 mb-2">{doctor.experience} years experience</p>
                <p className="text-gray-600">{doctor.qualification.join(', ')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Languages</h3>
                <p className="text-gray-600">{doctor.languages.join(', ')}</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Treats For</h3>
                <p className="text-gray-600">{doctor.treatsFor.join(', ')}</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Pricing</h3>
                <p className="text-gray-600">₹{doctor.pricing.min} - ₹{doctor.pricing.max} per session</p>
              </div>

              {doctor.bio && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-2">About</h3>
                  <p className="text-gray-600">{doctor.bio}</p>
                </div>
              )}
            </div>
          </div>

          {/* Booking Form */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-800 font-serif mb-6">Schedule Your Session</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="space-y-6">
              {/* Session Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Type
                </label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="discovery">Discovery Session (Free)</option>
                  <option value="regular">Regular Session (₹{doctor.pricing.min})</option>
                </select>
              </div>

              {/* Session Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Mode
                </label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setMode('video')}
                    className={`flex-1 py-3 px-4 rounded-md border flex items-center justify-center gap-2 transition-all ${mode === 'video'
                      ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Video Call
                  </button>
                  <button
                    onClick={() => setMode('voice')}
                    className={`flex-1 py-3 px-4 rounded-md border flex items-center justify-center gap-2 transition-all ${mode === 'voice'
                      ? 'border-teal-600 bg-teal-50 text-teal-700 font-medium'
                      : 'border-gray-300 hover:bg-gray-50 text-gray-600'
                      }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Voice Call
                  </button>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={getMinDate()}
                  max={getMaxDate()}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Time Selection */}
              {selectedDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Time
                  </label>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedTime(slot)}
                          className={`p-2 text-sm border rounded-md transition-colors ${selectedTime === slot
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No available slots for this date</p>
                  )}
                </div>
              )}

              {/* Mock Payment Info */}
              {selectedTime && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <h4 className="font-semibold text-gray-800 mb-2">Session Summary</h4>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><span className="font-medium">Doctor:</span> Dr. {doctor.userId.firstName} {doctor.userId.lastName}</p>
                    <p><span className="font-medium">Date:</span> {new Date(selectedDate).toLocaleDateString()}</p>
                    <p><span className="font-medium">Time:</span> {selectedTime}</p>
                    <p><span className="font-medium">Type:</span> {sessionType === 'discovery' ? 'Discovery Session' : 'Regular Session'}</p>
                    <p><span className="font-medium">Mode:</span> {mode === 'video' ? 'Video Call' : 'Voice Call'}</p>
                    <p><span className="font-medium">Price:</span> {sessionType === 'discovery' ? 'Free' : `₹${doctor.pricing.min}`}</p>
                  </div>
                </div>
              )}

              {/* Book Button */}
              <button
                onClick={handleBookSession}
                disabled={!selectedDate || !selectedTime || bookingLoading}
                className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${!selectedDate || !selectedTime || bookingLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
              >
                {bookingLoading ? 'Booking...' : 'Book Session'}
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
