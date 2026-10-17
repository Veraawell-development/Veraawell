import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import { fetchWithRetry } from '../utils/backendWakeup';

/**
 * Attempts for each chat request. Safari reports any dropped request as
 * "Load failed", and on a phone mid-call that happens; one failure used to
 * replace the whole chat with that message. Network errors and 5xx retry
 * with backoff (1s, 2s, 4s); a 4xx comes straight back.
 */
const CHAT_LOAD_ATTEMPTS = 4;

interface Message {
    _id: string;
    text: string;
    timestamp: string;
    senderId: string;
    senderName: string;
    isSentByMe: boolean;
    conversationId?: string;
}

interface SessionChatProps {
    targetUserId: string;
    targetUserName: string;
    onNewMessage?: () => void;
}

const SessionChat: React.FC<SessionChatProps> = ({ targetUserId, targetUserName, onNewMessage }) => {
    const { token, user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    // Bumped by the Retry button to run initialisation again.
    const [reloadKey, setReloadKey] = useState(0);

    const onNewMessageRef = useRef(onNewMessage);
    useEffect(() => {
        onNewMessageRef.current = onNewMessage;
    }, [onNewMessage]);

    // Initialize Chat
    useEffect(() => {
        let cancelled = false;
        initializeChat(() => cancelled);
        return () => {
            cancelled = true;
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetUserId, reloadKey]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const initializeChat = async (isCancelled: () => boolean) => {
        // No token is fine: requests and the socket handshake fall back to
        // the session cookie. Returning here used to leave the spinner up
        // forever for a cookie-only session.
        if (!targetUserId) return;

        try {
            setLoading(true);
            setError(null);

            // Authorization only when there is a token ("Bearer null" would
            // override the cookie); the global fetch wrapper adds the
            // in-memory token and cookies otherwise.
            const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

            // 1. Get or Create Conversation (idempotent, so safe to retry)
            console.log('[SESSION-CHAT] Finding conversation with:', targetUserId);
            const convResponse = await fetchWithRetry(`${API_BASE_URL}/chat/conversation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                credentials: 'include',
                body: JSON.stringify({ otherUserId: targetUserId })
            }, CHAT_LOAD_ATTEMPTS);
            if (isCancelled()) return;

            if (!convResponse.ok) {
                const errData = await convResponse.json().catch(() => ({}));
                throw new Error(errData.message || 'Failed to get conversation');
            }

            const convData = await convResponse.json();
            const newConversationId = convData.conversationId;
            setConversationId(newConversationId);

            // 2. Fetch History
            const histResponse = await fetchWithRetry(`${API_BASE_URL}/chat/messages/${newConversationId}?limit=50`, {
                headers: authHeaders,
                credentials: 'include'
            }, CHAT_LOAD_ATTEMPTS);
            if (isCancelled()) return;

            if (histResponse.ok) {
                const histData = await histResponse.json();
                if (Array.isArray(histData)) setMessages(histData);
            }

            // 3. Connect Socket — retrying on its own, and re-joining the
            // conversation on every (re)connect below.
            socketRef.current = io(`${SOCKET_URL}/chat`, {
                auth: token ? { token } : {},
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                // Its own connection, so these options apply: sharing the
                // /data socket's Manager meant inheriting its 5-attempt limit.
                forceNew: true
            });

            socketRef.current.on('connect', () => {
                console.log('[SESSION-CHAT] Socket connected');
                socketRef.current?.emit('conversation:join', newConversationId);
            });

            socketRef.current.on('message:receive', (message: Message) => {
                // The comment below used to be the only "check" there was — the
                // conversation was never actually compared. The server addresses
                // the sender's own echo to their user room, which reaches every
                // tab they have open, so a message from another thread would
                // otherwise land in this session's transcript.
                if (message.conversationId && message.conversationId !== newConversationId) {
                    return;
                }
                // Only add if it belongs to this conversation and isn't a duplicate
                setMessages(prev => {
                    if (prev.some(m => m._id === message._id)) {
                        return prev;
                    }
                    // Trigger notification callback if message is from the other person
                    if (onNewMessageRef.current && message.senderId !== user?.userId) {
                        onNewMessageRef.current();
                    }
                    return [...prev, message];
                });
            });

            setLoading(false);

        } catch (err: any) {
            if (isCancelled()) return;
            console.error('[SESSION-CHAT] Error initializing:', err);
            // "Load failed" / "Failed to fetch" are the browser's words for a
            // dropped connection; say that in ours.
            const message = err?.name === 'TypeError' || /Load failed|Failed to fetch|NetworkError|aborted/i.test(err?.message || '')
                ? 'Couldn\'t reach the chat. Check your connection.'
                : (err?.message || 'Couldn\'t load the chat.');
            setError(message);
            setLoading(false);
        }
    };

    const handleSendMessage = () => {
        if (!newMessage.trim() || !conversationId || !socketRef.current) return;

        const text = newMessage.trim();

        // No optimistic append here: this component renders the server's echo
        // only. MessagesPage does append optimistically and reconciles against
        // the echo; both are correct, and this one has less to go wrong.

        socketRef.current.emit('message:send', {
            conversationId,
            text
        });

        setNewMessage('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
                <p className="text-red-400 text-sm">{error}</p>
                <button
                    type="button"
                    onClick={() => setReloadKey(k => k + 1)}
                    className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-transparent">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="text-center text-white/40 text-sm mt-10">
                        <p>Start chatting with {targetUserName}</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.isSentByMe;
                        return (
                            <div key={msg._id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm shadow-sm ${isMe
                                        ? 'bg-white text-black rounded-br-none'
                                        : 'bg-[#27272A] text-white/90 rounded-bl-none border border-white/5'
                                        }`}
                                >
                                    <p className="leading-relaxed font-medium">{msg.text}</p>
                                    <p className={`text-[10px] mt-1.5 font-semibold tracking-wider uppercase text-right ${isMe ? 'text-black/40' : 'text-white/40'}`}>
                                        {msg.timestamp}
                                    </p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-transparent border-t border-white/10">
                <div className="flex gap-3 relative items-center">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-full px-5 py-3 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all shadow-inner"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="bg-white hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-black w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg shrink-0"
                    >
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionChat;
