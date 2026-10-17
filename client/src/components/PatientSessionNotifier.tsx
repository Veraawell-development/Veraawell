import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useDataSocket } from '../hooks/useDataSocket';

/**
 * Tells a patient, wherever they are in the app, what happened to their
 * instant-session request.
 *
 * When a doctor chose "join in 5 minutes", the server emitted
 * `session:status-update` on the shared /data socket — and the only listeners
 * were inside the call room's waiting lounge and a dashboard handler that
 * silently refetched. A patient who had stepped away from the lounge got no
 * word and had no way back in. Mounted once at the app root (like
 * GlobalIncomingCallListener for doctors), with a Join action on the toast.
 *
 * Toasts carry an id per session, so the same event arriving on both the
 * /data socket and the call socket shows once.
 */

interface StatusUpdate {
  sessionId?: string;
  acceptanceStatus?: 'accepted' | 'delayed' | 'pending';
  delayMinutes?: number;
  delayedUntil?: string;
  doctorNote?: string;
  message?: string;
  status?: string;
}

interface Cancelled {
  sessionId?: string;
  cancelledBy?: string;
  refundAmount?: number;
  message?: string;
}

const PatientSessionNotifier: React.FC = () => {
  const { user, isLoggedIn } = useAuth();
  const { socket } = useDataSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isPatient = isLoggedIn && user?.role === 'patient';
  const currentPath = location.pathname;

  useEffect(() => {
    if (!socket || !isPatient) return;

    const refreshSessions = () => {
      queryClient.invalidateQueries({ queryKey: ['patient', 'upcomingSessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient', 'calendarSessions'] });
    };

    const withJoin = (sessionId: string, text: string) => {
      // Already in that call room: the lounge shows the status itself.
      const inRoom = currentPath === `/video-call/${sessionId}`;
      return (t: { id: string }) => (
        <span className="flex items-center gap-3">
          <span>{text}</span>
          {!inRoom && (
            <button
              type="button"
              onClick={() => { toast.dismiss(t.id); navigate(`/video-call/${sessionId}`); }}
              className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: '#ffffff', color: '#0f172a' }}
            >
              Join session
            </button>
          )}
        </span>
      );
    };

    const onStatusUpdate = (data: StatusUpdate) => {
      refreshSessions();
      const sessionId = data?.sessionId;
      if (!sessionId) return;
      const id = `session-status-${sessionId}`;

      if (data.acceptanceStatus === 'delayed') {
        const base = data.message || `Your doctor will join in ${data.delayMinutes || 5} minutes.`;
        const text = data.doctorNote ? `${base} “${data.doctorNote}”` : base;
        toast(withJoin(sessionId, text), { id, duration: 12000, icon: '⏳' });
      } else if (data.acceptanceStatus === 'accepted') {
        toast.success(withJoin(sessionId, data.message || 'Your doctor accepted and is joining now.'), { id, duration: 12000 });
      }
    };

    const onCancelled = (data: Cancelled) => {
      refreshSessions();
      const sessionId = data?.sessionId;
      // A cancellation this patient made is already confirmed by the screen
      // they made it on.
      if (!sessionId || (data.cancelledBy && data.cancelledBy === user?.userId)) return;
      const refund = data.refundAmount ? ` ₹${data.refundAmount} will be refunded.` : '';
      toast.error(data.message || `Your session was cancelled.${refund}`, { id: `session-cancelled-${sessionId}`, duration: 10000 });
    };

    socket.on('session:status-update', onStatusUpdate);
    socket.on('session:cancelled', onCancelled);
    return () => {
      socket.off('session:status-update', onStatusUpdate);
      socket.off('session:cancelled', onCancelled);
    };
  }, [socket, isPatient, user?.userId, currentPath, navigate, queryClient]);

  return null;
};

export default PatientSessionNotifier;
