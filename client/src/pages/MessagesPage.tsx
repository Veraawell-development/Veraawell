import React, { useState, useEffect, useRef } from 'react';
import { FiSend, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

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
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        
        // Auto-select most recent immediately to prevent empty state flashing
        if (data.length > 0 && !selectedConversation) {
          setSelectedConversation(data[0]);
          loadMessages(data[0]);
        }
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
      console.error('[MESSAGES]  No auth token available from context');
      // Set loading to false so user sees empty state or loading spinner isn't stuck
      setLoading(false);
      return;
    }

    console.log('Connecting to Socket.IO at:', `${SOCKET_URL}/chat`);

    // Initialize socket connection to /chat namespace
    socketRef.current = io(`${SOCKET_URL}/chat`, {
      auth: { token }, // Use token directly from context
      transports: ['websocket'],
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
      console.error('[MESSAGES]  Socket connection error:', error.message);
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
      console.error('[MESSAGES]  Socket not initialized');
      alert('Connection error. Please refresh the page.');
      return;
    }

    if (!socketRef.current.connected) {
      console.error('[MESSAGES]  Socket not connected');
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
      console.error('[MESSAGES]  Error sending message:', error);
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



  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F0F2F5]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#38ABAE] mx-auto"></div>
          <p className="mt-4 text-gray-500 font-medium tracking-wide">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen pt-[64px] md:pt-[80px] flex bg-white overflow-hidden box-border">
      <div className="flex w-full h-full">
        
        {/* Conversations List (Left Pane) */}
        <div className={`${selectedConversation ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] lg:w-[380px] bg-white border-r border-gray-100 flex-col shrink-0`}>
          
          {/* Sidebar Header */}
          <div className="p-5 pb-3 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard')}
                className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Messages</h1>
            </div>
            
            <div className="relative group">
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50/50 hover:bg-gray-50 border border-gray-100 focus:bg-white focus:border-teal-500/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/10 transition-all text-gray-800 placeholder-gray-400"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              <svg className="w-4 h-4 text-gray-400 group-focus-within:text-teal-500 absolute left-3.5 top-[11px] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          </div>
          
          {/* Conversation Items */}
          <div className="overflow-y-auto flex-1 px-3 pb-3 space-y-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="w-16 h-16 mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                </div>
                <p className="text-gray-500 font-medium text-[15px]" style={{ fontFamily: 'Inter, sans-serif' }}>No conversations yet</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation._id}
                  onClick={() => handleSelectConversation(conversation)}
                  className={`flex items-center gap-3 p-3 mx-1 rounded-xl cursor-pointer transition-colors ${selectedConversation?._id === conversation._id
                    ? 'bg-teal-50/50'
                    : 'hover:bg-gray-50/50'
                    }`}
                >
                  <div className={`relative flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold text-base transition-colors ${selectedConversation?._id === conversation._id ? 'bg-[#38ABAE]' : 'bg-[#38ABAE]/90 group-hover:bg-[#38ABAE]'}`}>
                    {conversation.userName.charAt(0)}
                    {conversation.unreadCount > 0 && (
                      <div className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ring-2 ring-white">
                        {conversation.unreadCount}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <h3 className={`font-semibold text-sm truncate tracking-tight ${selectedConversation?._id === conversation._id ? 'text-teal-950' : 'text-gray-800'}`}>
                        {conversation.userName}
                      </h3>
                      <span className={`text-[11px] font-medium ${selectedConversation?._id === conversation._id ? 'text-teal-700/70' : 'text-gray-400'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                        {conversation.lastMessageTime?.split('T')[0] || 'Recently'}
                      </span>
                    </div>
                    <p className={`text-xs truncate ${selectedConversation?._id === conversation._id ? 'text-teal-900/80 font-medium' : 'text-gray-500'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                      {conversation.lastMessage || 'Start a conversation'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area (Right Pane) */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-[#FAFAFA] min-w-0 relative">
            {/* Background Pattern (Optional subtle detail) */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
            
            {/* Chat Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0 z-10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="md:hidden p-1.5 -ml-2 text-gray-400 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-full bg-[#38ABAE] flex items-center justify-center text-white font-semibold text-base shadow-sm">
                  {selectedConversation.userName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-gray-900 tracking-tight">
                    {selectedConversation.userName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <p className="text-xs font-medium text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {selectedConversation.userRole === 'doctor' ? 'Professional' : 'Patient'}
                    </p>
                  </div>
                </div>
              </div>
              <button className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-800 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                </svg>
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 py-8 space-y-6 relative z-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-300">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-8 bg-white rounded-[24px] shadow-sm border border-gray-100 max-w-sm">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#38ABAE]/10 flex items-center justify-center">
                      <svg className="w-8 h-8 text-[#38ABAE]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                         <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                         <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                      </svg>
                    </div>
                    <h4 className="text-gray-900 font-extrabold mb-2 tracking-tight text-lg">Start the Conversation</h4>
                    <p className="text-gray-500 text-[14px] leading-relaxed font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      Say hello to {selectedConversation.userName}! Everything is end-to-end encrypted and completely private.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isLastMessage = index === messages.length - 1;
                  const isNextMessageSameSender = !isLastMessage && messages[index + 1].senderId === message.senderId;
                  
                  return (
                  <div
                    key={message._id}
                    className={`flex ${message.isSentByMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2.5 shadow-sm ${message.isSentByMe
                        ? `bg-[#38ABAE] text-white rounded-[18px] rounded-tr-[4px] ${isNextMessageSameSender ? 'rounded-br-[4px]' : ''}`
                        : `bg-white border border-gray-100 text-gray-800 rounded-[18px] rounded-tl-[4px] ${isNextMessageSameSender ? 'rounded-bl-[4px]' : ''}`
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <p className="text-[14.5px] leading-relaxed">
                        {message.text}
                      </p>
                      <p className={`text-[9px] mt-1 font-semibold uppercase tracking-wider ${message.isSentByMe ? 'text-teal-100 text-right' : 'text-gray-400 text-left'
                        }`}>
                        {message.timestamp}
                      </p>
                    </div>
                  </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Container */}
            <div className="p-4 bg-white border-t border-gray-100 shrink-0 z-10">
              <div className="flex items-center gap-3 bg-gray-50/50 border border-gray-100 rounded-full p-1.5 pl-5 focus-within:bg-white focus-within:ring-2 focus-within:ring-teal-500/10 focus-within:border-teal-500/30 transition-all">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent border-none text-[14.5px] text-gray-800 focus:outline-none focus:ring-0 placeholder-gray-400"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-white bg-[#38ABAE] hover:bg-[#2A8285] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-white relative">
            <div className="text-center max-w-sm p-10 flex flex-col items-center">
              <div className="w-20 h-20 mb-6 rounded-full bg-[#F0F2F5] flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-2 tracking-tight">
                Your Messages
              </h2>
              <p className="text-gray-500 text-[14px] leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                Select a conversation from the sidebar or start a new one to begin chatting.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
