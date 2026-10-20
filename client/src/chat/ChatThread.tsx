import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChatThread } from './useChatThread';
import { clockLabel, closedMessage, dayLabel, linkify, MAX_MESSAGE, startsNewDay, type ChatMessage } from './chatUtils';

/**
 * A conversation: the messages and the box to write in. Shared by the
 * Messages page (light) and the in-call chat (dark), so both behave the same:
 * day separators, older messages on demand, "Not sent — Retry", clickable
 * links, Enter to send and Shift+Enter for a new line, a jump back to the
 * latest message instead of yanking the reader down, and a clear notice when
 * the chat can't be written in.
 */

interface Props {
  conversationId: string | null;
  otherName: string;
  canMessage?: boolean;
  closedReason?: string | null;
  /** On screen now (marks messages read only then). */
  visible?: boolean;
  theme?: 'light' | 'dark';
  onIncoming?: (m: ChatMessage) => void;
}

const THEMES = {
  light: {
    area: 'bg-[#FAFAFA]',
    mine: 'bg-[#38ABAE] text-white rounded-[18px] rounded-tr-[4px]',
    theirs: 'bg-white border border-gray-100 text-gray-800 rounded-[18px] rounded-tl-[4px]',
    metaMine: 'text-teal-100',
    metaTheirs: 'text-gray-400',
    day: 'bg-white text-gray-500 border border-gray-100',
    composer: 'bg-white border-t border-gray-100',
    input: 'bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400 focus:bg-white focus:border-teal-500/40',
    send: 'bg-[#38ABAE] hover:bg-[#2A8285] text-white',
    muted: 'text-gray-500',
    notice: 'bg-amber-50 border border-amber-200 text-amber-800',
    link: 'underline underline-offset-2',
    jump: 'bg-white text-gray-700 border border-gray-200 shadow',
  },
  dark: {
    area: 'bg-transparent',
    mine: 'bg-white text-black rounded-2xl rounded-br-none',
    theirs: 'bg-[#27272A] text-white/90 rounded-2xl rounded-bl-none border border-white/5',
    metaMine: 'text-black/40',
    metaTheirs: 'text-white/40',
    day: 'bg-white/10 text-white/60',
    composer: 'border-t border-white/10',
    input: 'bg-black/40 border border-white/10 text-white/90 placeholder-white/30 focus:border-white/30',
    send: 'bg-white hover:bg-gray-200 text-black',
    muted: 'text-white/40',
    notice: 'bg-amber-500/10 border border-amber-500/30 text-amber-200',
    link: 'underline underline-offset-2',
    jump: 'bg-white text-black shadow',
  },
};

const MessageText: React.FC<{ text: string; linkClass: string }> = ({ text, linkClass }) => (
  <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
    {linkify(text).map((part, i) => (part.kind === 'link'
      ? <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>{part.value}</a>
      : <React.Fragment key={i}>{part.value}</React.Fragment>))}
  </p>
);

const ChatThread: React.FC<Props> = ({ conversationId, otherName, canMessage = true, closedReason = null, visible = true, theme = 'light', onIncoming }) => {
  const t = THEMES[theme];
  const thread = useChatThread(conversationId, { visible, onIncoming });
  const [draft, setDraft] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const keepFrom = useRef<number | null>(null);

  // Stay at the latest message when the reader is already there; otherwise
  // leave them where they are (it used to scroll down on every change).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (keepFrom.current !== null) {
      // Older messages were added above: keep the view still.
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (atBottom || (thread.messages.length > lastCount.current && thread.messages[thread.messages.length - 1]?.isSentByMe)) {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = thread.messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages]);

  useEffect(() => { setAtBottom(true); setDraft(''); }, [conversationId]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const loadOlder = async () => {
    const el = listRef.current;
    if (!el) return;
    setLoadingOlder(true);
    keepFrom.current = el.scrollHeight - el.scrollTop;
    try { await thread.loadOlder(); } catch { keepFrom.current = null; } finally { setLoadingOlder(false); }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_MESSAGE || !canMessage) return;
    thread.send(text);
    setDraft('');
    setAtBottom(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a new line; never while an IME is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  if (!conversationId) return null;

  if (thread.isLoading) {
    return (
      <div className={`h-full flex items-center justify-center ${t.area}`} role="status" aria-label="Loading messages">
        <div className={`w-8 h-8 border-2 rounded-full animate-spin ${theme === 'dark' ? 'border-white/20 border-t-white' : 'border-gray-200 border-t-[#38ABAE]'}`} />
      </div>
    );
  }

  if (thread.error && !thread.messages.length) {
    const forbidden = thread.error.status === 403;
    return (
      <div className={`h-full flex flex-col items-center justify-center gap-3 p-6 text-center ${t.area}`} role="alert">
        <p className={`text-sm ${t.muted}`}>{forbidden ? 'Chat opens once a session is booked and paid.' : "Couldn't load these messages."}</p>
        {!forbidden && (
          <button type="button" onClick={() => { void thread.refetch(); }} className={`px-4 py-2 rounded-full text-xs font-semibold ${t.send}`}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const near = draft.length > MAX_MESSAGE - 300;

  return (
    <div className={`flex flex-col h-full min-h-0 ${t.area}`}>
      <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-5 space-y-3 relative" aria-live="polite" aria-relevant="additions" data-testid="chat-thread">
        {thread.hasMore && (
          <div className="flex justify-center">
            <button type="button" onClick={() => { void loadOlder(); }} disabled={loadingOlder} className={`px-3 py-1 rounded-full text-xs ${t.day}`}>
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {thread.messages.length === 0 ? (
          <p className={`text-center text-sm mt-10 ${t.muted}`}>Say hello to {otherName}. Only the two of you can read these messages.</p>
        ) : thread.messages.map((m, i) => (
          <React.Fragment key={m.clientMsgId ? `c:${m.clientMsgId}` : m._id}>
            {startsNewDay(thread.messages, i) && (
              <div className="flex justify-center py-1"><span className={`px-3 py-0.5 rounded-full text-[11px] font-medium ${t.day}`}>{dayLabel(m.createdAt)}</span></div>
            )}
            <div className={`flex ${m.isSentByMe ? 'justify-end' : 'justify-start'}`} data-testid="chat-message" data-own={m.isSentByMe ? 'true' : 'false'} data-status={m.status || 'sent'}>
              <div className={`max-w-[80%] md:max-w-[70%] px-4 py-2.5 shadow-sm ${m.isSentByMe ? t.mine : t.theirs} ${m.status === 'failed' ? 'opacity-70' : ''}`}>
                <MessageText text={m.text} linkClass={t.link} />
                <p className={`text-[10px] mt-1 font-semibold tracking-wide ${m.isSentByMe ? `${t.metaMine} text-right` : t.metaTheirs}`}>
                  {m.status === 'sending' ? 'Sending…' : m.status === 'failed' ? 'Not sent' : clockLabel(m.createdAt)}
                </p>
              </div>
            </div>
            {m.status === 'failed' && m.clientMsgId && (
              <div className="flex justify-end items-center gap-2 text-xs -mt-1" role="alert">
                <span className="text-red-500">{m.error || 'Not sent.'}</span>
                <button type="button" onClick={() => thread.retry(m.clientMsgId!)} className="font-semibold text-red-600 underline">Retry</button>
                <button type="button" onClick={() => thread.discard(m.clientMsgId!)} className={`underline ${t.muted}`}>Remove</button>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {!atBottom && (
        <div className="relative">
          <button type="button" onClick={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; setAtBottom(true); }} className={`absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold ${t.jump}`}>
            ↓ Latest messages
          </button>
        </div>
      )}

      <div className={`p-3 md:p-4 shrink-0 ${t.composer}`}>
        {!canMessage ? (
          <p className={`text-sm rounded-xl px-4 py-3 text-center ${t.notice}`} role="status">{closedMessage(closedReason, otherName)}</p>
        ) : (
          <>
            {!thread.connected && <p className={`text-[11px] mb-1.5 px-2 ${t.muted}`}>Reconnecting… messages will still be sent.</p>}
            <div className="flex items-end gap-2">
              <label htmlFor={`chat-input-${conversationId}`} className="sr-only">Message to {otherName}</label>
              <textarea
                id={`chat-input-${conversationId}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={MAX_MESSAGE}
                placeholder="Type a message…"
                className={`flex-1 resize-none max-h-32 rounded-2xl px-4 py-2.5 text-[14.5px] focus:outline-none transition-colors ${t.input}`}
              />
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim()}
                aria-label="Send message"
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${t.send}`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                </svg>
              </button>
            </div>
            {near && <p className={`text-[11px] mt-1 text-right ${t.muted}`}>{draft.length}/{MAX_MESSAGE}</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default ChatThread;
