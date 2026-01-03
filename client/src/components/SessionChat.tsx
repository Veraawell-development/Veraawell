import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';

interface Message {
    _id: string;
    text: string;
    timestamp: string;
    senderId: string;
    senderName: string;
    isSentByMe: boolean;
}

interface SessionChatProps {
    targetUserId: string;
    targetUserName: string;
}

const SessionChat: React.FC<SessionChatProps> = ({ targetUserId, targetUserName }) => {
    const { token, user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);

    const API_BASE_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001/api'
        : 'https://veraawell-backend.onrender.com/api';

    const SOCKET_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5001'
        : 'https://veraawell-backend.onrender.com';

    // Initialize Chat
    useEffect(() => {
        initializeChat();
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [targetUserId]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const initializeChat = async () => {
        if (!token || !targetUserId) return;

        try {
            setLoading(true);

            // 1. Get or Create Conversation
            console.log('[SESSION-CHAT] Finding conversation with:', targetUserId);
            const convResponse = await fetch(`${API_BASE_URL}/chat/conversation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({ otherUserId: targetUserId })
            });

            if (!convResponse.ok) {
                const errData = await convResponse.json();
                throw new Error(errData.message || 'Failed to get conversation');
            }

            const convData = await convResponse.json();
            const newConversationId = convData.conversationId;
            setConversationId(newConversationId);

            // 2. Fetch History
            const histResponse = await fetch(`${API_BASE_URL}/chat/messages/${newConversationId}?limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });

            if (histResponse.ok) {
                const histData = await histResponse.json();
                // Reverse if backend returns newest first, but usually backend returns chronological or we sort
                // Assuming backend returns chronological (oldest first) or we handle it. 
                // Based on MessagesPage, it seems to just set them.
                setMessages(histData);
            }

            // 3. Connect Socket
            socketRef.current = io(`${SOCKET_URL}/chat`, {
                auth: { token },
                transports: ['websocket', 'polling'],
                withCredentials: true
            });

            socketRef.current.on('connect', () => {
                console.log('[SESSION-CHAT] Socket connected');
                socketRef.current?.emit('conversation:join', newConversationId);
            });

            socketRef.current.on('message:receive', (message: Message) => {
                // Only add if it belongs to this conversation and isn't a duplicate
                setMessages(prev => {
                    if (prev.some(m => m._id === message._id)) {
                        return prev;
                    }
                    return [...prev, message];
                });
            });

            setLoading(false);

        } catch (err: any) {
            console.error('[SESSION-CHAT] Error initializing:', err);
            setError(err.message);
            setLoading(false);
        }
    };

    const handleSendMessage = () => {
        if (!newMessage.trim() || !conversationId || !socketRef.current) return;

        const text = newMessage.trim();

        // Optimistic UI update (optional, but let's wait for ack or echo for simplicity/robustness like MessagesPage)
        // Actually MessagesPage doesn't do optimistic, it waits for 'message:receive' even for own messages? 
        // Checking MessagesPage.tsx... yes, it listens for 'message:receive' and appends.
        // AND it emits 'message:send'. 

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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full flex items-center justify-center p-4 text-center">
                <p className="text-red-400 text-sm">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900/30 rounded-xl overflow-hidden border border-gray-700/50">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 text-sm mt-10">
                        <p>Start chatting with {targetUserName}</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => {
                        const isMe = msg.isSentByMe;
                        return (
                            <div key={msg._id || idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${isMe
                                        ? 'bg-teal-600 text-white rounded-br-none'
                                        : 'bg-gray-700 text-gray-200 rounded-bl-none'
                                        }`}
                                >
                                    <p>{msg.text}</p>
                                    <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-teal-200' : 'text-gray-400'}`}>
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
            <div className="p-3 bg-gray-800/80 border-t border-gray-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 bg-gray-900/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionChat;
