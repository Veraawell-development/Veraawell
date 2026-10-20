import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../context/AuthContext';
import { useChatSocket } from './ChatSocketContext';
import { mergeMessages, newClientMsgId, type ChatMessage } from './chatUtils';

/**
 * One conversation's messages, for the Messages page and the in-call chat.
 *
 * What it guarantees (each of these used to fail):
 *  - a sent message is confirmed by the server, or shown as "Not sent —
 *    Retry" with the reason; it is never shown as sent when it wasn't. A
 *    retry carries the same clientMsgId, so it is stored once;
 *  - nothing is missed: after a reconnection it fetches what arrived since the
 *    newest message it has, and the thread is refetched whenever it is shown
 *    (it used to be cached for 5 minutes, hiding a message that came while the
 *    thread wasn't open — which was then marked read);
 *  - it is marked read only while it is actually on screen (`visible`);
 *  - older messages can be loaded (it used to stop at the last 50).
 */

interface ThreadData { messages: ChatMessage[]; hasMore: boolean }

const PAGE = 50;
const ACK_TIMEOUT_MS = 10_000;

async function fetchPage(conversationId: string, params: Record<string, string>): Promise<ThreadData> {
  const q = new URLSearchParams({ limit: String(PAGE), ...params });
  const res = await fetch(`${API_BASE_URL}/chat/messages/${conversationId}?${q}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || 'Could not load messages'), { status: res.status });
  }
  return { messages: await res.json(), hasMore: res.headers.get('X-Has-More') === '1' };
}

const isReal = (m: ChatMessage) => !m.status && !m._id.startsWith('local-');

export function useChatThread(conversationId: string | null | undefined, {
  visible = true,
  onIncoming,
}: { visible?: boolean; onIncoming?: (m: ChatMessage) => void } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { socket, connected, reconnects } = useChatSocket();
  const key = ['chat', 'thread', conversationId] as const;
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  const query = useQuery({
    queryKey: key,
    enabled: !!conversationId,
    // Always fresh when shown; merged with what's already here (older pages,
    // messages still on their way).
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<ThreadData> => {
      const page = await fetchPage(conversationId!, {});
      const prev = qc.getQueryData<ThreadData>(key);
      return {
        messages: mergeMessages(prev?.messages ?? [], page.messages),
        hasMore: prev && prev.messages.some(isReal) ? prev.hasMore : page.hasMore,
      };
    },
  });

  const update = useCallback((fn: (d: ThreadData) => ThreadData) => {
    qc.setQueryData<ThreadData>(key, (d) => fn(d ?? { messages: [], hasMore: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, conversationId]);

  // Join the conversation's room (the other person's messages arrive there),
  // and again after every reconnection.
  useEffect(() => {
    if (!socket || !conversationId || !connected) return;
    socket.emit('conversation:join', { conversationId });
    return () => { socket.emit('conversation:leave', { conversationId }); };
  }, [socket, conversationId, connected]);

  // Live messages for this thread. Two routes, so nothing is missed in the
  // moment before the room is joined: the room's `message:receive`, and the
  // `message:notification` every message also sends to the person's own room.
  useEffect(() => {
    if (!socket || !conversationId) return;
    const add = (m: ChatMessage, isSentByMe: boolean) => {
      if (String(m.conversationId) !== String(conversationId)) return;
      // A message from the other person arrives unread (the payload doesn't say).
      update((d) => ({ ...d, messages: mergeMessages(d.messages, [{ ...m, isSentByMe, isRead: isSentByMe ? m.isRead : false, status: undefined, error: undefined }]) }));
    };
    const onReceive = (m: ChatMessage) => add(m, !!m.isSentByMe);
    const onNotification = (n: { conversationId?: string; message?: ChatMessage }) => {
      if (n?.message && String(n.conversationId) === String(conversationId)) add({ ...n.message, conversationId: String(n.conversationId) }, false);
    };
    socket.on('message:receive', onReceive);
    socket.on('message:notification', onNotification);
    return () => {
      socket.off('message:receive', onReceive);
      socket.off('message:notification', onNotification);
    };
  }, [socket, conversationId, update]);

  // Catch up after a reconnection: everything newer than the newest message we have.
  useEffect(() => {
    if (!reconnects || !conversationId) return;
    const data = qc.getQueryData<ThreadData>(key);
    const newest = [...(data?.messages ?? [])].reverse().find(isReal);
    if (!newest) { void query.refetch(); return; }
    let cancelled = false;
    (async () => {
      try {
        const page = await fetchPage(conversationId, { after: newest._id });
        if (!cancelled) update((d) => ({ ...d, messages: mergeMessages(d.messages, page.messages) }));
      } catch { /* the next refetch covers it */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnects, conversationId]);

  /** Older messages, above the ones shown. */
  const loadOlder = useCallback(async () => {
    const data = qc.getQueryData<ThreadData>(key);
    const oldest = data?.messages.find(isReal);
    if (!conversationId || !oldest) return;
    const page = await fetchPage(conversationId, { before: oldest._id });
    update((d) => ({ messages: mergeMessages(d.messages, page.messages), hasMore: page.hasMore }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, qc, update]);

  /** Deliver one message: over the socket (acknowledged), else over HTTP. */
  const deliver = useCallback(async (clientMsgId: string, text: string) => {
    const fail = (error: string) => update((d) => ({
      ...d, messages: d.messages.map((m) => (m.clientMsgId === clientMsgId && m.status ? { ...m, status: 'failed', error } : m)),
    }));
    const stored = (message: ChatMessage) => {
      update((d) => ({ ...d, messages: mergeMessages(d.messages, [{ ...message, isSentByMe: true, status: undefined, error: undefined }]) }));
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    };
    if (socket?.connected) {
      try {
        const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('message:send', { conversationId, text, clientMsgId });
        if (ack?.ok) return stored(ack.message);
        // Refused for a reason (too long, chat closed…): no point retrying blindly.
        return fail(ack?.message || 'Not sent.');
      } catch { /* no answer in time: try over HTTP (same clientMsgId — stored once) */ }
    }
    try {
      const res = await fetch(`${API_BASE_URL}/chat/message`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text, clientMsgId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return fail(body.message || 'Not sent.');
      stored(body);
    } catch {
      fail('No connection — not sent.');
    }
  }, [socket, conversationId, qc, update]);

  const send = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text || !conversationId) return;
    const clientMsgId = newClientMsgId();
    update((d) => ({
      ...d,
      messages: mergeMessages(d.messages, [{
        _id: `local-${clientMsgId}`, clientMsgId, conversationId, text,
        createdAt: new Date().toISOString(), senderId: String(user?.userId || ''), isSentByMe: true, status: 'sending',
      }]),
    }));
    void deliver(clientMsgId, text);
  }, [conversationId, deliver, update, user?.userId]);

  const retry = useCallback((clientMsgId: string) => {
    const m = qc.getQueryData<ThreadData>(key)?.messages.find((x) => x.clientMsgId === clientMsgId);
    if (!m) return;
    update((d) => ({ ...d, messages: d.messages.map((x) => (x.clientMsgId === clientMsgId ? { ...x, status: 'sending', error: undefined } : x)) }));
    void deliver(clientMsgId, m.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliver, qc, update, conversationId]);

  const discard = useCallback((clientMsgId: string) => {
    update((d) => ({ ...d, messages: d.messages.filter((x) => x.clientMsgId !== clientMsgId || !x.status) }));
  }, [update]);

  // Is the browser tab itself showing?
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const messages = query.data?.messages ?? [];

  // A new unread message from the other person — however it arrived (live,
  // or by a refetch after the connection caught up) — is reported once. One
  // already waiting when the thread first loads counts too.
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const seen = seenRef.current ?? new Set<string>();
    let fresh: ChatMessage | null = null;
    for (const m of messages) {
      if (seen.has(m._id)) continue;
      seen.add(m._id);
      if (!m.isSentByMe && m.isRead === false) fresh = m;
    }
    seenRef.current = seen;
    if (fresh) onIncomingRef.current?.(fresh);
  }, [messages, query.data]);
  useEffect(() => { seenRef.current = null; }, [conversationId]);

  // Read, while on screen: whenever an unread message from the other person
  // is shown in a visible tab — not when the tab is in the background.
  const unreadFromThem = messages.some((m) => !m.isSentByMe && m.isRead === false);
  const markingRef = useRef(false);
  useEffect(() => {
    if (!visible || !pageVisible || !conversationId || !unreadFromThem || markingRef.current) return;
    markingRef.current = true;
    (async () => {
      try {
        await fetch(`${API_BASE_URL}/chat/conversation/${conversationId}/read`, { method: 'PUT', credentials: 'include' });
        update((d) => ({ ...d, messages: d.messages.map((m) => (m.isSentByMe ? m : { ...m, isRead: true })) }));
        qc.invalidateQueries({ queryKey: ['chat', 'unreadCount'] });
        qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      } catch { /* the next view tries again */ } finally {
        markingRef.current = false;
      }
    })();
  }, [visible, pageVisible, conversationId, unreadFromThem, qc, update]);

  // Coming back to the tab with the thread open: fetch what arrived meanwhile.
  useEffect(() => {
    if (visible && pageVisible && conversationId) void query.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageVisible]);

  return {
    messages,
    hasMore: !!query.data?.hasMore,
    isLoading: query.isLoading,
    error: query.error as (Error & { status?: number }) | null,
    refetch: query.refetch,
    loadOlder,
    send,
    retry,
    discard,
    connected,
  };
}
