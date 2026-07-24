import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDataSocket } from '../hooks/useDataSocket';
import InstantRequestModal from './InstantRequestModal';
import { useNavigate } from 'react-router-dom';

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

  const handleAcceptRequest = (sessionId: string) => {
    if (!socket) return;
    socket.emit('session:accept', { sessionId });
    setIncomingRequest(null);
    navigate(`/video-call/${sessionId}`);
  };

  const handleDelayRequest = (sessionId: string, minutes: number) => {
    if (!socket) return;
    socket.emit('session:delay', { sessionId, delayMinutes: minutes });
    setIncomingRequest(null);
  };

  const handleMissedRequest = (sessionId: string) => {
    setIncomingRequest(null);
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
