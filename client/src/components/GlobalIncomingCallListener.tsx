import { installAudioUnlock } from '../utils/attention';
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

  /**
   * Ask the server what is already waiting.
   *
   * The ring used to be a socket event and nothing else, so it only arrived
   * if this component happened to be connected at the exact millisecond the
   * patient's payment verified. Every other case — page not open yet, a
   * reload, a sleeping laptop, a dropped socket — lost the request silently,
   * and the patient sat in a call room nobody was coming to.
   *
   * Pulling on mount and on every reconnect turns that from a lost session
   * into a few seconds' delay.
   */
  const fetchPending = React.useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/instant-requests`, {
        headers: authHeaders(),
        credentials: 'include'
      });
      if (!res.ok) return;
      const data = await res.json();
      const waiting = (data.sessions || [])[0];
      // Only raise it if nothing is already on screen, so a backfill arriving
      // just behind a live socket event cannot replace the modal underneath
      // the doctor's cursor.
      if (waiting) setIncomingRequest((current: any) => current || waiting);
    } catch (err) {
      console.error('[GLOBAL] Could not fetch pending instant requests:', err);
    }
  }, []);

  // Unlock sound on the doctor's first interaction, so a later ring is heard.
  useEffect(() => { installAudioUnlock(); }, []);

  useEffect(() => {
    if (!isLoggedIn || user?.role !== 'doctor') return;
    fetchPending();
  }, [isLoggedIn, user, fetchPending]);

  useEffect(() => {
    if (!isLoggedIn || !socket || user?.role !== 'doctor') return;

    const handleSessionBooked = ({ session }: any) => {
      console.log('[GLOBAL] New session booked:', session);
      if (session.sessionType === 'immediate') {
        setIncomingRequest((current: any) => (
          // Same guard as above: the socket event and the backfill can both
          // describe the same request.
          current && current._id === session._id ? current : (current || session)
        ));
      }
    };

    // A reconnect means there was a window where events could not reach us.
    const handleReconnect = () => fetchPending();

    // The request ended without the doctor — the patient cancelled, or it
    // timed out and was refunded. The ring used to keep going, and Accept
    // then failed with an error.
    const handleCancelled = ({ sessionId }: { sessionId?: string }) => {
      setIncomingRequest((current: any) => {
        if (!current || String(current._id) !== String(sessionId)) return current;
        toast('That request ended before it was answered.', { icon: 'ℹ️', id: 'request-ended' });
        return null;
      });
    };

    socket.on('session:booked', handleSessionBooked);
    socket.on('session:cancelled', handleCancelled);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('session:booked', handleSessionBooked);
      socket.off('session:cancelled', handleCancelled);
      socket.off('connect', handleReconnect);
    };
  }, [isLoggedIn, socket, user, fetchPending]);

  // `Authorization` only when there is a token to send: the server prefers
  // the header over the cookie, so "Bearer null" (the in-memory token is
  // empty after a refresh) would turn a valid cookie session into a 401.
  function authHeaders(): Record<string, string> {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /** Body of a JSON error response, or {} when there isn't one. */
  const readJson = async (res: Response): Promise<{ success?: boolean; message?: string }> => {
    try { return await res.json(); } catch { return {}; }
  };

  const handleAcceptRequest = async (sessionId: string) => {
    setIncomingRequest(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/accept`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      const data = await readJson(res);
      // 409: the request is no longer waiting (expired, or the patient
      // cancelled). The server's message says which.
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to accept session');
      navigate(`/video-call/${sessionId}`);
    } catch (err: any) {
      toast.error(err.message || 'Could not accept the session');
      fetchPending();
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
      const data = await readJson(res);
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delay session');
      toast.success(`Patient notified — joining in ${minutes} minutes.`);
    } catch (err: any) {
      toast.error(err.message || 'Could not delay the session');
      fetchPending();
    }
  };

  // The countdown ran out. Expiry belongs to the server: its sweep cancels
  // and refunds at acceptanceDeadline. This used to POST /missed, which is
  // the patient's action — the server answered 403 and nobody read it. Just
  // take the modal down and ask what (if anything) is still waiting.
  const handleRequestExpired = () => {
    setIncomingRequest(null);
    fetchPending();
  };

  if (!incomingRequest) return null;

  return (
    <InstantRequestModal
      session={incomingRequest}
      isOpen={true}
      onAccept={handleAcceptRequest}
      onDelay={handleDelayRequest}
      onExpired={handleRequestExpired}
      onClose={() => setIncomingRequest(null)}
    />
  );
};

export default GlobalIncomingCallListener;
