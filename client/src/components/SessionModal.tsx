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

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001/api' 
    : 'https://veraawell-backend.onrender.com/api';

  if (!isOpen || !session) return null;

  const canJoinSession = () => {
    const now = new Date();
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);
    
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return minutesDiff <= 15 && minutesDiff >= -60 && session.status === 'scheduled';
  };

  const canCancelSession = () => {
    const sessionDateTime = new Date(session.sessionDate);
    const [hours, minutes] = session.sessionTime.split(':').map(Number);
    sessionDateTime.setHours(hours, minutes, 0, 0);
    
    const now = new Date();
    const timeDiff = sessionDateTime.getTime() - now.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    return hoursDiff >= 24 && session.status === 'scheduled';
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

  const handleCancelSession = async () => {
    if (!window.confirm('Are you sure you want to cancel this session? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
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


  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.15)' }}
      onClick={onClose}
    >
      <div 
        className="bg-white bg-opacity-95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-2xl w-full p-8 space-y-6 border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white text-xl font-semibold py-3 px-8 rounded-2xl inline-block shadow-lg">
            Session Details
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Doctor/Patient Info Card */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-3xl p-6 shadow-md">
          <div className="flex items-center space-x-6">
            {/* Profile Image */}
            <div className="w-28 h-28 bg-white rounded-2xl overflow-hidden flex-shrink-0 shadow-lg border-2 border-purple-200">
              <img 
                src={userRole === 'patient' ? '/doctor-01.svg' : '/doctor-02.svg'}
                alt="Profile" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 24 24' fill='%239333ea'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
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
              <div className="space-y-1 text-sm text-gray-700">
                <p><span className="font-semibold">Experience:</span> 6+ years</p>
                <p><span className="font-semibold">Qualification:</span> M. Phil, M. Sc</p>
                <p><span className="font-semibold">Specialization:</span> {session.sessionType === 'immediate' ? 'General Consultation' : 'Depressive Disorders'}</p>
                <p><span className="font-semibold">Languages:</span> Hindi, English</p>
              </div>
            </div>
          </div>
        </div>

        {/* Session Info Card */}
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-3xl p-5 shadow-md">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-gray-600 text-xs font-medium mb-1">Date</p>
              <p className="text-gray-800 font-semibold text-base">{new Date(session.sessionDate).toLocaleDateString('en-GB')}</p>
            </div>
            <div>
              <p className="text-gray-600 text-xs font-medium mb-1">Time</p>
              <p className="text-gray-800 font-semibold text-base">{session.sessionTime}</p>
            </div>
            <div>
              <p className="text-gray-600 text-xs font-medium mb-1">Mode</p>
              <p className="text-gray-800 font-semibold text-base">Video Call</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-6 pt-2">
          {canCancelSession() && (
            <button
              onClick={handleCancelSession}
              disabled={loading}
              className="bg-red-500 hover:bg-red-600 text-white text-base font-semibold py-3 px-10 rounded-full shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Cancelling...' : 'Cancel Session'}
            </button>
          )}

          {canJoinSession() && (
            <button
              onClick={handleJoinSession}
              disabled={loading}
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-base font-semibold py-3 px-10 rounded-full shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join Session'}
            </button>
          )}

          {!canJoinSession() && !canCancelSession() && session.status === 'scheduled' && (
            <div className="text-center text-gray-600 py-3 text-sm">
              Session will be available to join 15 minutes before start time
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="text-center pt-2">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionModal;
