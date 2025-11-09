import React, { useState, useEffect, useRef } from 'react';
import { FiMenu, FiSend, FiX } from 'react-icons/fi';
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
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('Fetching conversations from:', `${API_BASE_URL}/chat/conversations`);
      const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
        credentials: 'include',
        headers
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Conversations received:', data.length, 'conversations');
        console.log('Conversations data:', data);
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
    
    // Get token from cookie or localStorage
    const cookieString = document.cookie;
    console.log('[MESSAGES] All cookies:', cookieString);
    
    let token: string | undefined = cookieString.split('; ').find(row => row.startsWith('token='))?.split('=')[1];
    
    // Try localStorage as fallback
    if (!token) {
      const localToken = localStorage.getItem('token');
      if (localToken) {
        token = localToken;
        console.log('[MESSAGES] Token found in localStorage');
      } else {
        console.log('[MESSAGES] Token not found in localStorage');
      }
    } else {
      console.log('[MESSAGES] Token found in cookies');
    }
    
    if (!token) {
      console.error('[MESSAGES] ❌ No auth token found');
      console.error('[MESSAGES] This usually means you need to login');
      console.error('[MESSAGES] Available cookies:', document.cookie);
      console.error('[MESSAGES] localStorage keys:', Object.keys(localStorage));
      
      // Don't immediately redirect - let user see the page
      // They can click sync button or navigate away
      setLoading(false);
      return;
    }
    
    console.log('Token found, length:', token.length);
    console.log('Token preview:', token.substring(0, 20) + '...');
    console.log('Connecting to Socket.IO at:', `${SOCKET_URL}/chat`);
    
    // Initialize socket connection to /chat namespace
    socketRef.current = io(`${SOCKET_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    
    // Connection event handlers
    socketRef.current.on('connect', () => {
      console.log('[MESSAGES] ✅ Socket connected:', socketRef.current?.id);
      
      // Re-join conversation room if user was in one
      if (selectedConversation) {
        console.log('[MESSAGES] Re-joining conversation after reconnect:', selectedConversation._id);
        socketRef.current?.emit('conversation:join', selectedConversation._id);
      }
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('========================================');
      console.error('[MESSAGES] ❌ Socket connection error');
      console.error('========================================');
      console.error('[MESSAGES] Error:', error);
      console.error('[MESSAGES] Error message:', error.message);
      console.error('[MESSAGES] Error type:', error.constructor.name);
      console.error('========================================\n');
      
      // If authentication error, show helpful message
      if (error.message && error.message.includes('Authentication error')) {
        console.error('[MESSAGES] Authentication failed - token may be invalid or expired');
        console.error('[MESSAGES] Please try logging out and logging in again');
      }
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
      console.log('[MESSAGES] ✅ Socket reconnected after', attemptNumber, 'attempts');
      // Re-join conversation if needed
      if (selectedConversation) {
        socketRef.current?.emit('conversation:join', selectedConversation._id);
      }
    });
    
    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      console.log('[MESSAGES] Reconnection attempt', attemptNumber);
    });
    
    socketRef.current.on('reconnect_error', (error) => {
      console.error('[MESSAGES] Reconnection error:', error.message);
    });
    
    socketRef.current.on('reconnect_failed', () => {
      console.error('[MESSAGES] ❌ Reconnection failed after all attempts');
      alert('Connection lost. Please refresh the page.');
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
    
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [SOCKET_URL]);
  
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
      
      console.log('[MESSAGES] ✅ Message emitted to server');
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
    <div className="min-h-screen" style={{ backgroundColor: '#E0EAEA' }}>
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 shadow-lg transform transition-transform duration-300 ease-in-out z-50 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`} style={{ backgroundColor: '#7DA9A8' }}>
        <div className="h-full flex flex-col p-4 text-white">
          <div className="space-y-3 mb-6" style={{ fontFamily: 'Bree Serif, serif' }}>
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate(user?.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard'); setSidebarOpen(false); }}
            >
              <span className="text-base font-medium">My Dashboard</span>
            </div>
            <div 
              className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded-lg transition-colors"
              onClick={() => { navigate('/messages'); setSidebarOpen(false); }}
            >
              <span className="text-base font-medium">My Messages</span>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ backgroundColor: '#78BE9F' }}>
        <div className="px-6 py-4 flex items-center justify-center relative">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="absolute left-6 text-white hover:text-gray-200"
          >
            <FiMenu className="w-8 h-8" />
          </button>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Bree Serif, serif' }}>My Messages</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Conversations List */}
        <div className={`${selectedConversation ? 'hidden md:block' : 'block'} w-full md:w-96 bg-white border-r border-gray-200 overflow-y-auto`}>
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Bree Serif, serif', color: '#1F2937' }}>
                No Conversations Yet
              </h3>
              <p className="text-sm text-gray-600 mb-6" style={{ fontFamily: 'Inter, sans-serif' }}>
                Book a session with a doctor to start messaging
              </p>
              <button
                onClick={handleSyncConversations}
                disabled={syncing}
                className="px-6 py-3 rounded-full font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ 
                  backgroundColor: '#78BE9F',
                  color: '#FFFFFF',
                  fontFamily: 'Bree Serif, serif'
                }}
              >
                {syncing ? 'Syncing...' : 'Sync Existing Sessions'}
              </button>
              <p className="text-xs text-gray-500 mt-3" style={{ fontFamily: 'Inter, sans-serif' }}>
                Click to create conversations from your past sessions
              </p>
            </div>
          ) : (
            conversations.map((conversation) => (
            <div
              key={conversation._id}
              onClick={() => handleSelectConversation(conversation)}
              className={`flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                selectedConversation?._id === conversation._id ? 'bg-gray-100' : ''
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center text-white font-bold text-lg">
                  {conversation.userName.charAt(0)}
                </div>
                {conversation.unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {conversation.unreadCount}
                  </div>
                )}
              </div>

              {/* Conversation Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-base truncate" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                    {conversation.userName}
                  </h3>
                  <span className="text-sm text-gray-600 flex-shrink-0 ml-2" style={{ fontFamily: 'Bree Serif, serif' }}>
                    {conversation.lastMessageTime}
                  </span>
                </div>
                <p className="text-sm text-gray-600 truncate" style={{ fontFamily: 'Bree Serif, serif' }}>
                  {conversation.lastMessage}
                </p>
              </div>
            </div>
          ))
          )}
        </div>

        {/* Chat Area */}
        {selectedConversation ? (
          <div className="flex-1 flex flex-col bg-white">
            {/* Chat Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
              <button
                onClick={() => setSelectedConversation(null)}
                className="md:hidden text-gray-600 hover:text-gray-800"
              >
                <FiX className="w-6 h-6" />
              </button>
              <div className="w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center text-white font-bold text-lg">
                {selectedConversation.userName.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg" style={{ fontFamily: 'Bree Serif, serif', color: '#000000' }}>
                  {selectedConversation.userName}
                </h3>
                <p className="text-sm text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                  {selectedConversation.userRole === 'doctor' ? 'Doctor' : 'Patient'} • 
                  {selectedConversation.userRole === 'doctor' 
                    ? ' MD Assistant of Dept | Counseling Advise Psychiatry | Neuroscience | Psychotherapy' 
                    : ' Active now'}
                </p>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundColor: '#F5F5F5' }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500" style={{ fontFamily: 'Bree Serif, serif' }}>
                    No messages yet. Start the conversation!
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message._id}
                    className={`flex ${message.isSentByMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs md:max-w-md px-4 py-3 rounded-2xl ${
                        message.isSentByMe
                          ? 'rounded-br-none'
                          : 'rounded-bl-none'
                      }`}
                      style={{
                        backgroundColor: message.isSentByMe ? '#C8E6C9' : '#FFFFFF',
                        fontFamily: 'Bree Serif, serif'
                      }}
                    >
                      <p className="text-base" style={{ color: '#000000' }}>
                        {message.text}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {message.timestamp}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Write a message..."
                  className="flex-1 px-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:border-green-500"
                  style={{ fontFamily: 'Bree Serif, serif' }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#78BE9F' }}
                >
                  <FiSend className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-white">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-xl text-gray-600" style={{ fontFamily: 'Bree Serif, serif' }}>
                Select a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessagesPage;
