import React from 'react';
import { useParams } from 'react-router-dom';
import VideoCallRoom from './VideoCallRoom';

/**
 * /video-call/:sessionId. Remounts the call page on a new session id, so
 * nothing of the previous call — socket, camera, peer connection — carries
 * over when the route is reused.
 */
const VideoCallRoute: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <VideoCallRoom key={sessionId} />;
};

export default VideoCallRoute;
