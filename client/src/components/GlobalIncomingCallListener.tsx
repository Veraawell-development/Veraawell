import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSocket } from '../hooks/useDataSocket';
import InstantRequestModal from './InstantRequestModal';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { getAuthToken } from '../utils/authToken';
import toast from 'react-hot-toast';

const GlobalIncomingCallListener: React.FC = () => {
  const { user, isLoggedIn } = useAuth();
  const { socket } = useDataSocket();
  const [incomingRequest, setIncomingRequest] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn || !socket || user?.role !== 'doctor') return;

    const handleSessionBooked = ({ session }: any) => {
      console.log('[GLOBAL] New session booked:', session);
      if (session.sessionType === 'immediate') {
        setIncomingRequest(session);
      }
    };

    socket.on('session:booked', handleSessionBooked);

    return () => {
      socket.off('session:booked', handleSessionBooked);
    };
  }, [isLoggedIn, socket, user]);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAuthToken()}`,
  });

  const handleAcceptRequest = async (sessionId: string) => {
    setIncomingRequest(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/accept`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to accept session');
      navigate(`/video-call/${sessionId}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not accept the session');
    }
  };

  const handleDelayRequest = async (sessionId: string, minutes: number, note: string) => {
    setIncomingRequest(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/delay`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ delayMinutes: minutes, doctorNote: note }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delay session');
      toast.success(`Patient notified — joining in ${minutes} minutes.`);
    } catch (err: any) {
      toast.error(err.message || 'Could not delay the session');
    }
  };

  const handleMissedRequest = async (sessionId: string) => {
    setIncomingRequest(null);
    try {
      await fetch(`${API_BASE_URL}/sessions/${sessionId}/missed`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
    } catch (err) {
      console.error('Failed to mark session as missed:', err);
    }
  };

  if (!incomingRequest) return null;

  return (
    <InstantRequestModal
      session={incomingRequest}
      isOpen={true}
      onAccept={handleAcceptRequest}
      onDelay={handleDelayRequest}
      onMissed={handleMissedRequest}
      onClose={() => setIncomingRequest(null)}
    />
  );
};

export default GlobalIncomingCallListener;
