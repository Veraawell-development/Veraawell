import React, { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { fetchWithRetry } from '../utils/backendWakeup';
import ChatThread from '../chat/ChatThread';

/**
 * The chat inside a call: the same conversation as the Messages page, and
 * the same thread component (src/chat/ChatThread.tsx).
 *
 * It stays mounted while the panel is closed, so new messages still arrive
 * (and light the unread dot through `onNewMessage`); they are marked read
 * only while the panel is open (`visible`). It used to mark everything read
 * the moment the call page opened, and lose the text of a message that
 * failed to send.
 */

/** Attempts for opening the conversation (Safari drops requests mid-call as "Load failed"). */
const OPEN_ATTEMPTS = 4;

interface SessionChatProps {
  targetUserId: string;
  targetUserName: string;
  /** Is the chat panel open right now? */
  visible?: boolean;
  onNewMessage?: () => void;
}

const SessionChat: React.FC<SessionChatProps> = ({ targetUserId, targetUserName, visible = true, onNewMessage }) => {
  const [conv, setConv] = useState<{ id: string; canMessage: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onNewRef = useRef(onNewMessage);
  onNewRef.current = onNewMessage;

  useEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/chat/conversation`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otherUserId: targetUserId }),
        }, OPEN_ATTEMPTS);
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? 'Chat opens once a session is booked and paid.' : "Couldn't open the chat.");
          return;
        }
        setConv({ id: String(body.conversationId), canMessage: body.canMessage !== false });
      } catch {
        if (!cancelled) setError("Couldn't open the chat. Check your connection.");
      }
    })();
    return () => { cancelled = true; };
  }, [targetUserId, attempt]);

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
        <p className="text-white/70 text-sm">{error}</p>
        {!/booked and paid/.test(error) && (
          <button type="button" onClick={() => setAttempt((a) => a + 1)} className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/10">
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!conv) {
    return (
      <div className="h-full flex items-center justify-center" role="status" aria-label="Opening the chat">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  return (
    <ChatThread
      conversationId={conv.id}
      otherName={targetUserName}
      canMessage={conv.canMessage}
      closedReason={conv.canMessage ? null : 'closed'}
      visible={visible}
      theme="dark"
      onIncoming={() => onNewRef.current?.()}
    />
  );
};

export default SessionChat;
