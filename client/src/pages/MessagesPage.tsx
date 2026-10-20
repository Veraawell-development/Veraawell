import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config/api';
import ChatThread from '../chat/ChatThread';
import { initials, listTimeLabel } from '../chat/chatUtils';

interface Conversation {
  _id: string;
  userId: string | null;
  userName: string;
  userRole: 'patient' | 'doctor';
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
  canMessage: boolean;
  closedReason: 'closed' | 'unavailable' | 'not-booked' | null;
}

/** Wide enough for the list and the thread side by side (Tailwind md). */
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/**
 * Messages: the conversation list and the open conversation (src/chat/).
 * The thread is the same component as the in-call chat.
 *
 * `?c=<conversationId>` opens a conversation directly (links from elsewhere).
 */
const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const selectedId = params.get('c');

  const { data: conversations = [], isLoading, isError, refetch, isFetching } = useQuery<Conversation[]>({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/chat/conversations`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
    staleTime: 0,
  });

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('c', id); else next.delete('c');
    setParams(next, { replace: !id });
  };

  // Open the latest conversation on a wide screen, once. On a phone the list
  // comes first — and Back to it used to re-open the first conversation at
  // once, so the others could never be reached.
  useEffect(() => {
    if (!selectedId && conversations.length > 0 && isWide()) select(conversations[0]._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length > 0]);

  const selected = conversations.find((c) => c._id === selectedId) || null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? conversations.filter((c) => c.userName.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)) : conversations;
  }, [conversations, search]);

  const back = () => navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard');

  return (
    <div className="w-full h-[100dvh] pt-[64px] md:pt-[80px] flex bg-white overflow-hidden box-border">
      <div className="flex w-full h-full min-h-0">
        {/* The list */}
        <aside className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] lg:w-[380px] bg-white border-r border-gray-100 flex-col shrink-0 min-h-0`} aria-label="Conversations">
          <div className="p-5 pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <button type="button" onClick={back} aria-label="Back to dashboard" className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-500 hover:text-gray-900">
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Messages</h1>
            </div>
            <label htmlFor="chat-search" className="sr-only">Search conversations</label>
            <input
              id="chat-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or message"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 focus:bg-white focus:border-teal-500/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/10 text-gray-800 placeholder-gray-400"
            />
          </div>

          <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-1">
            {isLoading ? (
              <p className="text-center text-sm text-gray-400 mt-10" role="status">Loading conversations…</p>
            ) : isError ? (
              <div className="text-center mt-10 px-4" role="alert">
                <p className="text-sm text-gray-600">Couldn't load your conversations.</p>
                <button type="button" onClick={() => { void refetch(); }} disabled={isFetching} className="mt-3 px-4 py-2 rounded-full bg-[#38ABAE] text-white text-xs font-semibold disabled:opacity-50">Try again</button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-500 mt-10 px-6">
                {search ? 'No conversations match.' : 'No conversations yet. Chat opens with a therapist once a session is booked.'}
              </p>
            ) : filtered.map((c) => {
              const active = c._id === selectedId;
              return (
                <button
                  type="button"
                  key={c._id}
                  onClick={() => select(c._id)}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-colors ${active ? 'bg-teal-50/70' : 'hover:bg-gray-50'}`}
                  data-testid="conversation-item"
                >
                  <span className="relative flex-shrink-0 w-11 h-11 rounded-full bg-[#38ABAE] flex items-center justify-center text-white font-semibold text-sm" aria-hidden="true">
                    {initials(c.userName)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`font-semibold text-sm truncate ${active ? 'text-teal-950' : 'text-gray-800'}`}>{c.userName}</span>
                      <span className="text-[11px] text-gray-400 shrink-0">{listTimeLabel(c.lastMessageAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className={`text-xs truncate ${c.unreadCount ? 'text-gray-900 font-semibold' : 'text-gray-500'}`}>{c.lastMessage || 'No messages yet'}</span>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center" aria-label={`${c.unreadCount} unread`}>
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* The conversation */}
        {selected ? (
          <section className="flex-1 flex flex-col min-w-0 min-h-0" aria-label={`Conversation with ${selected.userName}`}>
            <header className="flex items-center gap-3 px-4 md:px-6 py-3.5 border-b border-gray-100 bg-white shrink-0">
              <button type="button" onClick={() => select(null)} aria-label="Back to conversations" className="md:hidden p-1.5 -ml-1 text-gray-500 hover:text-gray-900 rounded-full">
                <FiArrowLeft className="w-5 h-5" />
              </button>
              <span className="w-10 h-10 rounded-full bg-[#38ABAE] flex items-center justify-center text-white font-semibold text-sm" aria-hidden="true">{initials(selected.userName)}</span>
              <div className="min-w-0">
                <h2 className="font-bold text-[15px] text-gray-900 truncate">{selected.userName}</h2>
                <p className="text-xs text-gray-500">{selected.userRole === 'doctor' ? 'Therapist' : 'Patient'}</p>
              </div>
            </header>
            <div className="flex-1 min-h-0">
              <ChatThread
                conversationId={selected._id}
                otherName={selected.userName}
                canMessage={selected.canMessage}
                closedReason={selected.closedReason}
                visible
                theme="light"
              />
            </div>
          </section>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-white">
            <div className="text-center max-w-sm p-10">
              <h2 className="text-[20px] font-bold text-gray-900 mb-2">Your messages</h2>
              <p className="text-gray-500 text-[14px]">Choose a conversation to read and reply.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
