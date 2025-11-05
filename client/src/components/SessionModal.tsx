import React, { useState } from 'react';
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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  if (!isOpen || !session) return null;

  const canJoinSession = () => {
    // Only show join button if session is scheduled
    if (session.status !== 'scheduled') {
      return false;
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
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/sessions/join/${session._id}`, {
        credentials: 'include'
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
      
      const response = await fetch(`${API_BASE_URL}/sessions/cancel/${session._id}`, {
        method: 'PUT',
        credentials: 'include'
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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full relative"
        style={{ backgroundColor: '#E8E3F0' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Top Right */}
        <button
          onClick={onClose}
          className="absolute top-8 right-8 text-gray-400 hover:text-gray-600 text-3xl transition-colors z-10"
          style={{ lineHeight: 1 }}
        >
          ✕
        </button>

        <div className="p-12 space-y-8">
          {/* Header */}
          <div className="text-center">
            <div 
              className="inline-block px-16 py-4 rounded-full text-2xl font-bold"
              style={{ 
                backgroundColor: '#A89FD1',
                color: '#FFFFFF',
                fontFamily: 'Bree Serif, serif',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }}
            >
              Session Details
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-2xl text-center">
              {error}
            </div>
          )}

          {/* Doctor/Patient Info Card */}
          <div 
            className="rounded-3xl p-8"
            style={{ backgroundColor: '#C8BFE3' }}
          >
            <div className="flex items-center space-x-8">
              {/* Profile Image */}
              <div 
                className="rounded-3xl overflow-hidden flex-shrink-0"
                style={{ width: '160px', height: '160px', backgroundColor: '#4A5568' }}
              >
                <img 
                  src={userRole === 'patient' ? '/doctor-01.svg' : '/doctor-02.svg'}
                  alt="Profile" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 24 24' fill='%23FFFFFF'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
                  }}
                />
              </div>
              
              {/* Doctor/Patient Details */}
              <div className="flex-1 space-y-3">
                <h3 
                  className="text-4xl font-bold"
                  style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}
                >
                  {userRole === 'patient' 
                    ? (session.doctorId ? `${session.doctorId.firstName} ${session.doctorId.lastName}` : 'Doctor')
                    : (session.patientId ? `${session.patientId.firstName} ${session.patientId.lastName}` : 'Patient')
                  }
                </h3>
                <div className="space-y-2 text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}>
                  <p><span className="font-bold">Experience:</span> 6+ years</p>
                  <p><span className="font-bold">Qualification:</span> M. Phil, M. Sc</p>
                  <p><span className="font-bold">Specialization:</span> {session.sessionType === 'immediate' ? 'General Consultation' : 'Depressive Disorders, Dysphoric Disorder'}</p>
                  <p><span className="font-bold">Languages:</span> Hindi, English</p>
                </div>
              </div>
            </div>
          </div>

          {/* Session Info Card */}
          <div 
            className="rounded-3xl p-8"
            style={{ backgroundColor: '#C8BFE3' }}
          >
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-lg font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}>Date: {new Date(session.sessionDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')}</p>
              </div>
              <div>
                <p className="text-lg font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}>Time: {session.sessionTime}</p>
              </div>
              <div>
                <p className="text-lg font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif', color: '#000' }}>Mode: Video Call</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-8 pt-4">
            {canCancelSession() && (
              <button
                onClick={handleCancelClick}
                disabled={loading}
                className="px-16 py-4 rounded-full text-xl font-bold transition-all disabled:opacity-50"
                style={{ 
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontFamily: 'Bree Serif, serif',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              >
                Cancel Session
              </button>
            )}

            {canJoinSession() && (
              <button
                onClick={handleJoinSession}
                disabled={loading}
                className="px-16 py-4 rounded-full text-xl font-bold transition-all disabled:opacity-50"
                style={{ 
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  fontFamily: 'Bree Serif, serif',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                }}
              >
                {loading ? 'Joining...' : 'Join Session'}
              </button>
            )}

            {!canJoinSession() && !canCancelSession() && session.status === 'scheduled' && (
              <div className="text-center py-4 px-8 rounded-2xl" style={{ backgroundColor: '#FEF3C7', fontFamily: 'Bree Serif, serif' }}>
                <p className="text-lg font-semibold" style={{ color: '#92400E' }}>
                  ⏰ Session will be available to join 15 minutes before start time
                </p>
                <p className="text-sm mt-2" style={{ color: '#78350F' }}>
                  {userRole === 'patient' ? 'You can cancel this session up to 24 hours before the scheduled time' : 'Please be ready to join at the scheduled time'}
                </p>
              </div>
            )}
            
            {session.status === 'completed' && (
              <div className="text-center py-4 px-8 rounded-2xl" style={{ backgroundColor: '#D1FAE5', fontFamily: 'Bree Serif, serif' }}>
                <p className="text-lg font-semibold" style={{ color: '#065F46' }}>
                  ✓ Session Completed
                </p>
              </div>
            )}
            
            {session.status === 'cancelled' && (
              <div className="text-center py-4 px-8 rounded-2xl" style={{ backgroundColor: '#FEE2E2', fontFamily: 'Bree Serif, serif' }}>
                <p className="text-lg font-semibold" style={{ color: '#991B1B' }}>
                  ✕ Session Cancelled
                </p>
              </div>
            )}
            
            {session.status === 'no-show' && (
              <div className="text-center py-4 px-8 rounded-2xl" style={{ backgroundColor: '#FEF3C7', fontFamily: 'Bree Serif, serif' }}>
                <p className="text-lg font-semibold" style={{ color: '#92400E' }}>
                  ⚠ No Show
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionModal;
