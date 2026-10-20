import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import VideoCallRoom from './VideoCallRoom';
import VideoCallRoomLegacy from './VideoCallRoomLegacy';

/**
 * /video-call/:sessionId. Picks the call engine the server runs
 * (`callEngine` on the session: CALL_ENGINE=v2 by default, v1 to roll back),
 * and remounts on a new session id so nothing of the previous call — socket,
 * camera, peer connection — carries over when the route is reused.
 */
const CallRoomSwitch: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const { user } = useAuth();
  // The call page reads the same query (cached), so this costs no extra request.
  const { data, isLoading } = useQuery({
    queryKey: ['session-call', sessionId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch session data');
      return res.json();
    },
    enabled: !!sessionId && !!user,
  });

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center" role="status" aria-label="Loading your session">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }
  if (data?.callEngine === 'v1') return <VideoCallRoomLegacy />;
  return <VideoCallRoom />;
};

const VideoCallRoute: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <CallRoomSwitch key={sessionId} sessionId={sessionId || ''} />;
};

export default VideoCallRoute;
