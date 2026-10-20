import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataSocket } from '../hooks/useDataSocket';
import { useAuth } from '../context/AuthContext';

/**
 * Keeps every screen current when something changes elsewhere — mounted
 * once, for the whole app (server/services/liveUpdates.js sends the events).
 *
 * Before it, each dashboard listened for a few events while it was on
 * screen: an outcome decided by the end-of-session sweep refreshed no
 * dashboard (an instant session kept its Join button), a new report or task
 * appeared only after a reload, the unread badge went stale on any other
 * page, and after the connection dropped nothing caught up for up to five
 * minutes (the cache's lifetime) — a doctor's Online switch could say Online
 * after the server had switched them off.
 *
 * It refreshes data (TanStack Query invalidation); toasts and navigation
 * stay with the screens that own them.
 */
const LiveUpdates: React.FC = () => {
  const { socket } = useDataSocket();
  const { isLoggedIn } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket || !isLoggedIn) return;
    const refresh = (...keys: string[][]) => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    const sessionsChanged = () => refresh(['patient'], ['doctor'], ['session-call'], ['doctors']);

    let firstConnect = socket.connected;
    const onConnect = () => {
      // Back after a drop: anything could have happened meanwhile.
      if (firstConnect) refresh(['patient'], ['doctor'], ['chat'], ['session'], ['doctors'], ['session-call']);
      firstConnect = true;
    };
    const onChat = () => refresh(['chat', 'unreadCount'], ['chat', 'conversations']);
    const onChatMessage = (data: { conversationId?: string }) => {
      onChat();
      if (data?.conversationId) refresh(['chat', 'thread', data.conversationId]);
    };
    const onClinical = () => refresh(['patient', 'reports'], ['patient', 'tasks'], ['doctor', 'tasks'], ['doctor', 'reports']);
    const onPayout = () => refresh(['doctor']);
    const onDirectory = () => refresh(['doctors']);
    const onArticles = () => refresh(['articles']);

    const handlers: [string, (...args: never[]) => void][] = [
      ['connect', onConnect],
      ['session:booked', sessionsChanged],
      ['session:cancelled', sessionsChanged],
      ['session:status-update', sessionsChanged],
      ['session:ended', sessionsChanged],
      ['session:attendance', () => refresh(['session-call'])],
      ['session:timing', () => refresh(['session-call'])],
      ['chat:new-message', onChatMessage],
      ['chat:read', onChat],
      ['clinical:updated', onClinical],
      ['payout:updated', onPayout],
      ['doctor:availability', onDirectory],
      ['doctor:status-change', onDirectory],
      ['article:new', onArticles],
      ['article:deleted', onArticles],
    ];
    for (const [event, fn] of handlers) socket.on(event, fn as never);
    return () => { for (const [event, fn] of handlers) socket.off(event, fn as never); };
  }, [socket, isLoggedIn, qc]);

  return null;
};

export default LiveUpdates;
