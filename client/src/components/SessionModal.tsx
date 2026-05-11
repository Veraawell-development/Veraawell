import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import EmergencyContactModal from './EmergencyContactModal';
import RatingModal from './RatingModal';
import SessionReportsModal from './SessionReportsModal';

interface Session {
  _id: string;
  sessionDate: string;
  sessionTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show' | 'ended';
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
  callMode?: string;
  price: number;
}

interface SessionModalProps {
  session: Session | null;
  userRole: 'patient' | 'doctor';
  isOpen: boolean;
  onClose: () => void;
}

const SessionModal: React.FC<SessionModalProps> = ({ session, userRole, isOpen, onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [hasEmergencyContact, setHasEmergencyContact] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [hasRating, setHasRating] = useState(false);
  const [patientEmergencyContact, setPatientEmergencyContact] = useState<any>(null);
  const [doctorProfile, setDoctorProfile] = useState<any>(null);

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  const sessionDateTime = (() => {
    if (!session) return new Date();
    const d = new Date(session.sessionDate);
    if (session.sessionType !== 'immediate' && session.sessionTime) {
      const [h, m] = session.sessionTime.split(':').map(Number);
      d.setUTCHours(h, m, 0, 0);
    }
    return d;
  })();

  useEffect(() => {
    if (isOpen && userRole === 'patient' && session) {
      checkEmergencyContact();
      checkRatingStatus();
      fetchDoctorProfile();
    }
    if (isOpen && userRole === 'doctor' && session) {
      fetchPatientEmergencyContact();
    }
  }, [isOpen, userRole, session]);

  const checkEmergencyContact = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/patients/emergency-contact`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setHasEmergencyContact(!!(data.emergencyContact?.name && data.emergencyContact?.phone));
      }
    } catch (error) {
      console.error('Error checking emergency contact:', error);
    }
  };

  const checkRatingStatus = async () => {
    if (!session) return;

    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/sessions/${session._id}`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setHasRating(!!(data.rating && data.rating.score));
      }
    } catch (error) {
      console.error('Error checking rating status:', error);
    }
  };

  const fetchPatientEmergencyContact = async () => {
    if (!session || !session.patientId) return;

    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const patientId = typeof session.patientId === 'object' ? (session.patientId as any)._id : session.patientId;
      const response = await fetch(`${API_BASE_URL}/sessions/patients/${patientId}/emergency-contact`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setPatientEmergencyContact(data.emergencyContact);
      }
    } catch (error) {
      console.error('Error fetching patient emergency contact:', error);
    }
  };

  const fetchDoctorProfile = async () => {
    if (!session || !session.doctorId) return;
    try {
      const doctorId = typeof session.doctorId === 'object' ? (session.doctorId as any)._id : session.doctorId;
      const response = await fetch(`${API_BASE_URL}/sessions/doctors/${doctorId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setDoctorProfile(data);
      }
    } catch (error) {
      console.error('Error fetching doctor profile:', error);
    }
  };

  const handleRatingSubmit = async (ratingData: { score: number; review: string }) => {
    if (!session) return;

    try {
      console.log('[RATING] Submitting rating:', { sessionId: session._id, score: ratingData.score });

      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/ratings/${session._id}/rate`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(ratingData)
      });

      console.log('[RATING] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[RATING] Success:', data);
        setHasRating(true);
        setShowRatingModal(false);
        alert('Thank you for your rating!');
      } else {
        const data = await response.json();
        console.error('[RATING] Error response:', data);
        alert(data.message || 'Failed to submit rating');
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating');
    }
  };

  if (!isOpen || !session) return null;

  const canJoinSession = () => {
    // Only show join button if session is scheduled
    if (session.status !== 'scheduled') {
      return false;
    }

    // Immediate sessions can be joined right away (for testing)
    if (session.sessionType === 'immediate') {
      return true;
    }

    const now = new Date();
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const minutesDiff = timeDiff / (1000 * 60);

    // Can join if:
    // - Within 15 minutes before session start
    // - Up to 60 minutes after session start (for late joiners)
    return minutesDiff <= 15 && minutesDiff >= -60;
  };

  const canCancelSession = () => {
    // Only patients can cancel sessions
    if (userRole !== 'patient') {
      return false;
    }

    // Only scheduled sessions can be cancelled
    if (session.status !== 'scheduled') {
      return false;
    }

    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    const now = new Date();
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    // Can cancel if session is at least 24 hours away
    return hoursDiff >= 24;
  };

  const handleJoinSession = async () => {
    // Check if patient has emergency contact before joining
    if (userRole === 'patient' && !hasEmergencyContact) {
      setShowEmergencyModal(true);
      return;
    }

    await proceedWithJoin();
  };

  const handleEmergencyContactSubmit = async (contactName: string, contactPhone: string, contactRelationship: string) => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/patients/emergency-contact`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ contactName, contactPhone, contactRelationship })
      });

      if (response.ok) {
        setHasEmergencyContact(true);
        setShowEmergencyModal(false);
        // Now proceed with joining
        await proceedWithJoin();
      }
    } catch (error) {
      console.error('Error saving emergency contact:', error);
      setError('Failed to save emergency contact');
    }
  };

  const proceedWithJoin = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[SESSION MODAL] Authorization header added for join');
      }

      const response = await fetch(`${API_BASE_URL}/sessions/join/${session._id}`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to join session');
      }

      const data = await response.json();

      // Navigate to video call room using session ID
      if (data.meetingLink) {
        // Extract session ID from meeting link (format: /video-call/SESSION_ID)
        const sessionId = data.meetingLink.split('/').pop();
        navigate(`/video-call/${sessionId}`);
      } else {
        alert('Meeting link not available yet. Please try again closer to the session time.');
      }
    } catch (error: any) {
      console.error('Error joining session:', error);
      setError(error.message || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  const handleCancelSession = async () => {
    try {
      setLoading(true);
      setError(null);
      setShowCancelConfirm(false);

      // Get token from localStorage
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[SESSION MODAL] Authorization header added for cancel');
      }

      const response = await fetch(`${API_BASE_URL}/sessions/cancel/${session._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to cancel session');
      }

      alert('Session cancelled successfully. You will receive a refund if applicable.');
      onClose();
      // Refresh the page to update the calendar
      window.location.reload();
    } catch (error: any) {
      console.error('Error cancelling session:', error);
      setError(error.message || 'Failed to cancel session');
    } finally {
      setLoading(false);
    }
  };


  // Cancel Confirmation Modal
  if (showCancelConfirm) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50 px-4"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
        onClick={() => setShowCancelConfirm(false)}
      >
        <div
          className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-12"
          style={{ backgroundColor: '#E8E3F0' }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-2xl font-bold text-center mb-12" style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}>
            Are you sure that you want to cancel the session?
          </h2>
          <div className="flex justify-center space-x-8">
            <button
              onClick={handleCancelSession}
              disabled={loading}
              className="px-16 py-4 rounded-full text-xl font-bold transition-all disabled:opacity-50"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#000',
                fontFamily: 'Bree Serif, serif',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              YES
            </button>
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="px-16 py-4 rounded-full text-xl font-bold transition-all"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#000',
                fontFamily: 'Bree Serif, serif',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              NO
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full relative overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Top Right */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 text-2xl transition-colors z-10"
          style={{ lineHeight: 1 }}
        >
          ✕
        </button>

        <div className="p-10 space-y-8">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800">
              Session Details
            </h2>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-center text-sm">
              {error}
            </div>
          )}

          {/* Doctor/Patient Info Card */}
          <div
            className="rounded-xl p-6 border border-gray-100"
            style={{ backgroundColor: '#F9FAFB' }}
          >
            <div className="flex items-center space-x-6">
              {/* Profile Image */}
              <div
                className="rounded-xl overflow-hidden flex-shrink-0 border border-gray-100"
                style={{ width: '120px', height: '120px' }}
              >
                <img
                  src={doctorProfile?.profileImage || (userRole === 'patient' ? '/male.jpg' : '/female.jpg')}
                  alt="Profile"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='%23A0AEC0'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                  }}
                />
              </div>

              {/* Doctor/Patient Details */}
              <div className="flex-1 space-y-2">
                <h3 className="text-2xl font-bold text-gray-800">
                  {userRole === 'patient'
                    ? (session.doctorId ? `Dr. ${session.doctorId.firstName} ${session.doctorId.lastName}` : 'Doctor')
                    : (session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient')
                  }
                </h3>
                {userRole === 'patient' && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-600">
                    <p><span className="font-semibold text-gray-700">Experience:</span> {doctorProfile?.experience || '6+'} years</p>
                    <p><span className="font-semibold text-gray-700">Qualification:</span> {Array.isArray(doctorProfile?.qualification) ? doctorProfile.qualification.join(', ') : doctorProfile?.qualification || 'M. Phil, M. Sc'}</p>
                    <p className="col-span-2"><span className="font-semibold text-gray-700">Specialization:</span> {Array.isArray(doctorProfile?.specialization) ? doctorProfile.specialization.join(', ') : doctorProfile?.specialization || 'General Consultation'}</p>
                    <p className="col-span-2"><span className="font-semibold text-gray-700">Languages:</span> {Array.isArray(doctorProfile?.languages) ? doctorProfile.languages.join(', ') : doctorProfile?.languages || 'Hindi, English'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Session Info Card */}
          <div
            className="rounded-xl p-6 border border-gray-100"
            style={{ backgroundColor: '#F9FAFB' }}
          >
            <div className="grid grid-cols-3 gap-6 text-center text-sm text-gray-600">
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Date</p>
                <p>{sessionDateTime.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')}</p>
              </div>
              <div className="space-y-1 border-x border-gray-200">
                <p className="font-semibold text-gray-700">Time</p>
                <p>{sessionDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Mode</p>
                <p>{session.callMode || 'Video Call'}</p>
              </div>
            </div>
          </div>

          {/* Emergency Contact Card (Doctor Only) */}
          {userRole === 'doctor' && patientEmergencyContact && (
            <div className="rounded-xl p-5 bg-red-50 border border-red-100">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-800 mb-2">Emergency Contact</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs text-red-700">
                    <p><span className="font-semibold">Name:</span> {patientEmergencyContact.name}</p>
                    <p className="col-span-2"><span className="font-semibold">Phone:</span> <a href={`tel:${patientEmergencyContact.phone}`} className="font-bold hover:underline">{patientEmergencyContact.phone}</a></p>
                  </div>
                  <button
                    onClick={() => window.location.href = `tel:${patientEmergencyContact.phone}`}
                    className="mt-3 px-4 py-2 rounded-lg font-semibold text-white text-xs transition-all hover:bg-red-600"
                    style={{ backgroundColor: '#EF4444' }}
                  >
                    Call Emergency Contact
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-6 pt-2">
            {canCancelSession() && (
              <button
                onClick={handleCancelClick}
                disabled={loading}
                className="px-8 py-3 rounded-full text-base font-semibold transition-all disabled:opacity-50 hover:bg-red-600 text-white"
                style={{ backgroundColor: '#EF4444' }}
              >
                Cancel Session
              </button>
            )}

            {canJoinSession() && (
              <button
                onClick={handleJoinSession}
                disabled={loading}
                className="px-8 py-3 rounded-full text-base font-semibold transition-all disabled:opacity-50 hover:opacity-90 text-white"
                style={{ backgroundColor: '#10B981' }}
              >
                {loading ? 'Joining...' : 'Join Session'}
              </button>
            )}

            {!canJoinSession() && !canCancelSession() && session.status === 'scheduled' && (
              <div className="text-center py-3 px-6 rounded-xl bg-amber-50 border border-amber-100 w-full">
                <p className="text-sm font-semibold text-amber-800">
                  ⏰ Session will be available to join 15 minutes before start time
                </p>
                <p className="text-xs mt-1 text-amber-700">
                  {userRole === 'patient' ? 'You can cancel this session up to 24 hours before the scheduled time' : 'Please be ready to join at the scheduled time'}
                </p>
              </div>
            )}

            {(session.status === 'completed' || session.status === 'ended') && (
              <div className="space-y-3 w-full">
                <div className="text-center py-3 px-6 rounded-xl bg-green-50 border border-green-100">
                  <p className="text-sm font-semibold text-green-800">✓ Session Completed</p>
                </div>

                <div className="flex gap-4 justify-center">

                  {userRole === 'patient' && !hasRating && (
                    <button
                      onClick={() => setShowRatingModal(true)}
                      className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90 text-white"
                      style={{ backgroundColor: '#10B981' }}
                    >
                      Rate Session
                    </button>
                  )}
                </div>
                
                {userRole === 'patient' && hasRating && (
                  <div className="text-center py-2 px-4 rounded-lg bg-sky-50 text-sky-700 text-xs font-medium">
                    You have already rated this session
                  </div>
                )}
              </div>
            )}

            {session.status === 'cancelled' && (
              <div className="text-center py-3 px-6 rounded-xl bg-red-50 border border-red-100 w-full">
                <p className="text-sm font-semibold text-red-800">✕ Session Cancelled</p>
              </div>
            )}

            {session.status === 'no-show' && (
              <div className="text-center py-3 px-6 rounded-xl bg-amber-50 border border-amber-100 w-full">
                <p className="text-sm font-semibold text-amber-800">No Show</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emergency Contact Modal */}
      <EmergencyContactModal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onSubmit={handleEmergencyContactSubmit}
      />

      {/* Rating Modal */}
      <RatingModal
        isOpen={showRatingModal}
        sessionId={session._id}
        doctorName={`${session.doctorId.firstName} ${session.doctorId.lastName}`}
        onClose={() => setShowRatingModal(false)}
        onSubmit={handleRatingSubmit}
      />

      {/* Reports Modal */}
      <SessionReportsModal
        isOpen={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        sessionId={session._id}
      />
    </div>
  );
};

export default SessionModal;
