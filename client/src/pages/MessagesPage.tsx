import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
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

interface Conversation {
  _id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  userRole: string;
}

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/api'
    : 'https://veraawell-backend.onrender.com/api';

  const SOCKET_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001'
    : 'https://veraawell-backend.onrender.com';

  // Fetch conversations from API
  const fetchConversations = async () => {
    try {
      // Use credentials: 'include' for cookie-based auth
      console.log('Fetching conversations from:', `${API_BASE_URL}/chat/conversations`);
      const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
        credentials: 'include'
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Conversations received:', data.length, 'conversations');
        setConversations(data);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Failed to fetch conversations:', response.status, errorData);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Socket.IO connection
  useEffect(() => {
    console.log('[MESSAGES] Initializing Socket.IO connection...');

    if (!token) {
      console.error('[MESSAGES] ❌ No auth token available from context');
      // Set loading to false so user sees empty state or loading spinner isn't stuck
      setLoading(false);
      return;
    }

    console.log('Connecting to Socket.IO at:', `${SOCKET_URL}/chat`);

    // Initialize socket connection to /chat namespace
    socketRef.current = io(`${SOCKET_URL}/chat`, {
      auth: { token }, // Use token directly from context
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('[MESSAGES]  Socket connected:', socketRef.current?.id);

      // Re-join conversation room if user was in one
      if (selectedConversation) {
        console.log('[MESSAGES] Re-joining conversation after reconnect:', selectedConversation._id);
        socketRef.current?.emit('conversation:join', selectedConversation._id);
      }
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('[MESSAGES] ❌ Socket connection error:', error.message);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('[MESSAGES] Socket disconnected. Reason:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected us, try to reconnect
        console.log('[MESSAGES] Server disconnected, attempting reconnect...');
        socketRef.current?.connect();
      }
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('[MESSAGES]  Socket reconnected after', attemptNumber, 'attempts');
      // Re-join conversation if needed
      if (selectedConversation) {
        socketRef.current?.emit('conversation:join', selectedConversation._id);
      }
    });

    // Listen for incoming messages
    socketRef.current.on('message:receive', (message: Message) => {
      setMessages(prev => [...prev, message]);
      // Update conversation list
      fetchConversations();
    });

    // Listen for message notifications
    socketRef.current.on('message:notification', (data) => {
      console.log('New message notification:', data);
      // Update conversation list
      fetchConversations();
    });

    // Cleanup on unmount or token change
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [SOCKET_URL, token]); // Add token as dependency

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Load messages for selected conversation
  const loadMessages = async (conversation: Conversation) => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/chat/messages/${conversation._id}`, {
        credentials: 'include',
        headers
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data);

        // Join conversation room via socket
        if (socketRef.current) {
          socketRef.current.emit('conversation:join', conversation._id);
        }
      } else {
        console.error('Failed to fetch messages');
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    // Leave previous conversation room
    if (selectedConversation && socketRef.current) {
      socketRef.current.emit('conversation:leave', selectedConversation._id);
    }

    setSelectedConversation(conversation);
    loadMessages(conversation);
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation || sending) {
      return;
    }

    // Check if socket exists and is connected
    if (!socketRef.current) {
      console.error('[MESSAGES] ❌ Socket not initialized');
      alert('Connection error. Please refresh the page.');
      return;
    }

    if (!socketRef.current.connected) {
      console.error('[MESSAGES] ❌ Socket not connected');
      alert('Not connected. Please check your internet connection.');
      return;
    }

    setSending(true);
    console.log('[MESSAGES] Sending message:', newMessage.substring(0, 50) + '...');

    try {
      // Send message via Socket.IO
      socketRef.current.emit('message:send', {
        conversationId: selectedConversation._id,
        text: newMessage.trim()
      });

      console.log('[MESSAGES]  Message emitted to server');
      setNewMessage('');

      // Reset sending state after a short delay
      setTimeout(() => setSending(false), 500);
    } catch (error) {
      console.error('[MESSAGES] ❌ Error sending message:', error);
      alert('Failed to send message. Please try again.');
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sync conversations from existing sessions
  const handleSyncConversations = async () => {
    try {
      setSyncing(true);
      console.log('Syncing conversations...');

      const response = await fetch(`${API_BASE_URL}/sessions/sync-conversations`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Sync result:', data);
        alert(`Sync completed!\n\nConversations created: ${data.stats.conversationsCreated}\nAlready existing: ${data.stats.conversationsExisting}\nTotal sessions: ${data.stats.totalSessions}`);

        // Refresh conversations list
        await fetchConversations();
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        console.error('Sync failed:', errorData);
        alert(`Sync failed: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error syncing conversations:', error);
      alert('Error syncing conversations. Check console for details.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E0EAEA' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard')}
            className="text-slate-600 hover:text-slate-800 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Bree Serif, serif' }}>Messages</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncConversations}
            disabled={syncing}
            className="text-sm text-cyan-600 hover:text-cyan-700 font-semibold transition-colors disabled:opacity-50"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {syncing ? 'Syncing...' : 'Sync Sessions'}
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
            {user?.firstName?.charAt(0) || user?.username?.charAt(0) || 'U'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Conversations List */}
        <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-white border-r border-slate-100 flex-col`}>
          <div className="p-4 border-b border-slate-50">
            <div className="relative">
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-lg text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                <div className="w-16 h-16 mb-4 rounded-full bg-slate-50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-slate-500 font-medium text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>No conversations yet</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation._id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${selectedConversation?._id === conversation._id
                    ? 'bg-gradient-to-r from-cyan-50 to-teal-50 border border-cyan-100'
                    : 'hover:bg-slate-50 border border-transparent'
                    }`}
                >
                  <div className="relative flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                    {conversation.userName.charAt(0)}
                    {conversation.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-white">
                        {conversation.unreadCount}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h3 className="font-bold text-sm text-slate-900 truncate" style={{ fontFamily: 'Bree Serif, serif' }}>
                        {conversation.userName}
                      </h3>
                      <span className="text-xs text-slate-400" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {conversation.lastMessageTime?.split('T')[0] || 'Recently'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {conversation.lastMessage || 'Start a conversation'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-white">
            {/* Chat Header */}
            <div className="flex items-center gap-3 p-4 border-b border-slate-100 bg-white">
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden text-slate-600 hover:text-slate-800"
              >
                <FiX className="w-6 h-6" />
              </button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold text-base shadow-sm">
                {selectedConversation.userName.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-slate-900" style={{ fontFamily: 'Bree Serif, serif' }}>
                  {selectedConversation.userName}
                </h3>
                <p className="text-xs text-slate-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {selectedConversation.userRole === 'doctor' ? 'Professional' : 'Patient'} • Active now
                </p>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-6 bg-white rounded-2xl shadow-sm border border-slate-100 max-w-sm">
                    <p className="text-slate-800 font-bold mb-1" style={{ fontFamily: 'Bree Serif, serif' }}>
                      No messages yet
                    </p>
                    <p className="text-slate-500 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Send a message to start the conversation!</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message._id}
                    className={`flex ${message.isSentByMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2.5 shadow-sm ${message.isSentByMe
                        ? 'rounded-2xl rounded-tr-none bg-gradient-to-br from-cyan-500 to-teal-500 text-white'
                        : 'rounded-2xl rounded-tl-none bg-white border border-slate-100 text-slate-800'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <p className="text-sm leading-relaxed">
                        {message.text}
                      </p>
                      <p className={`text-[10px] mt-1 text-right ${message.isSentByMe ? 'text-cyan-100' : 'text-slate-400'
                        }`}>
                        {message.timestamp}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-slate-100">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Write a message..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-full text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-gradient-to-br from-cyan-500 to-teal-500 hover:shadow-lg hover:shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSend className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50">
            <div className="text-center max-w-md p-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white shadow-sm flex items-center justify-center relative">
                <div className="absolute inset-0 bg-cyan-50 rounded-full transform scale-110 opacity-50 blur-sm"></div>
                <svg className="w-12 h-12 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                Welcome to Messages
              </h2>
              <p className="text-slate-500 text-sm leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                Select a conversation from the left to start chatting with your doctors or patients. Your communication is secure and private.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
