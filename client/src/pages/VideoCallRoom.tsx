import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import SessionToolsModal from '../components/SessionToolsModal';

const VideoCallRoom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [remoteUserJoined, setRemoteUserJoined] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'disconnected'>('excellent');
  const [qualityMessage, setQualityMessage] = useState<string | null>(null);
  const [showDoctorPanel, setShowDoctorPanel] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [_loadingSession, setLoadingSession] = useState(true);

  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5001' 
    : 'https://veraawell-backend.onrender.com';

  const fetchSessionData = async () => {
    try {
      setLoadingSession(true);
      console.log('📋 Fetching session data for:', sessionId);
      
      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      console.log('📋 Session data received:', data);
      setSessionData(data);
    } catch (error) {
      console.error('Error fetching session data:', error);
      setError('Failed to load session details');
    } finally {
      setLoadingSession(false);
    }
  };

  // ICE servers configuration (Google's public STUN servers)
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  useEffect(() => {
    if (!sessionId || !user) return;

    fetchSessionData();
    initializeCall();
    
    return () => {
      cleanup();
    };
  }, [sessionId, user]);

  useEffect(() => {
    // Start timer only when connected
    if (connectionState === 'connected') {
      const timer = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [connectionState]);

  const initializeCall = async () => {
    try {
      // Validate authentication before proceeding
      if (!token) {
        console.error('[VIDEO-CALL] ❌ No authentication token available');
        setError('Authentication error: Please log in again');
        setTimeout(() => {
          navigate(user?.role === 'patient' ? '/patient-dashboard' : '/doctor-dashboard');
        }, 2000);
        return;
      }

      console.log('[VIDEO-CALL] 🔐 Initializing with token:', token.substring(0, 20) + '...');

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to Socket.IO server with authentication
      console.log('[VIDEO-CALL] 🔌 Connecting to:', API_BASE_URL);
      const socket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'],
        auth: {
          token: token
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      socketRef.current = socket;

      // Handle connection errors
      socket.on('connect_error', (err) => {
        console.error('[VIDEO-CALL] ❌ Connection error:', err.message);
        setError('Failed to connect to video call server: ' + err.message);
        
        // If authentication error, redirect to login
        if (err.message.includes('Authentication')) {
          setTimeout(() => {
            navigate('/auth');
          }, 2000);
        }
      });

      socket.on('connect', () => {
        console.log('[VIDEO-CALL] ✅ Connected to server, Socket ID:', socket.id);
        // Join the room after successful connection
        socket.emit('join-room', { sessionId });
      });

      // Socket event handlers
      socket.on('room-joined', (data) => {
        console.log('[VIDEO-CALL] ✅ Joined room:', data);
        setError(null); // Clear any previous errors
        // Check if there are other users in the room
        if (data.otherUsers && data.otherUsers.length > 0) {
          console.log('[VIDEO-CALL] 👥 Other users in room:', data.otherUsers);
          setRemoteUserJoined(true);
          // Only doctor creates offer when joining an existing room
          if (user?.role === 'doctor') {
            console.log('[VIDEO-CALL] 👨‍⚕️ Doctor initiating call as offerer');
            createOffer(stream);
          }
        }
      });

      socket.on('user-joined', async (data) => {
        console.log('[VIDEO-CALL] 👤 Remote user joined:', data.role);
        setRemoteUserJoined(true);
        // Only doctor creates offer when someone joins
        if (user?.role === 'doctor') {
          console.log('[VIDEO-CALL] 👨‍⚕️ Doctor initiating call as offerer');
          await createOffer(stream);
        }
      });

      socket.on('offer', async ({ offer, senderId }) => {
        console.log('[VIDEO-CALL] 📨 Received offer from:', senderId);
        await handleOffer(offer, stream);
      });

      socket.on('answer', async ({ answer }) => {
        console.log('[VIDEO-CALL] 📨 Received answer');
        await handleAnswer(answer);
      });

      socket.on('ice-candidate', async ({ candidate }) => {
        console.log('[VIDEO-CALL] 🧊 Received ICE candidate');
        await handleIceCandidate(candidate);
      });

      socket.on('user-left', (data) => {
        console.log('[VIDEO-CALL] 👋 Remote user left:', data.role);
        setRemoteUserJoined(false);
        setConnectionState('disconnected');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      });

      socket.on('media-state-change', (data) => {
        console.log('[VIDEO-CALL] 🔄 Remote media state changed:', data);
        setRemoteVideoEnabled(data.video);
        setRemoteAudioEnabled(data.audio);
      });

      socket.on('error', (data) => {
        console.error('[VIDEO-CALL] ❌ Socket error:', data.message);
        setError(data.message);
      });

    } catch (err) {
      console.error('[VIDEO-CALL] ❌ Error initializing call:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        setError('Camera/microphone access denied. Please allow permissions and refresh.');
      } else {
        setError('Failed to initialize video call: ' + errorMessage);
      }
    }
  };

  const createPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;

    // Add local stream tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      console.log('[VIDEO-CALL] 🎥 Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      setConnectionState('connected');
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log('🧊 Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          sessionId,
          candidate: event.candidate
        });
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('[VIDEO-CALL] 🔌 Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionState('connected');
        setConnectionQuality('excellent');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionState('disconnected');
        setConnectionQuality('disconnected');
      }
    };

    // Monitor connection quality via ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('[VIDEO-CALL] 🧊 ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'checking') {
        setConnectionQuality('good');
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionQuality('excellent');
      } else if (pc.iceConnectionState === 'disconnected') {
        setConnectionQuality('poor');
        showQualityMessage('Connection quality degraded');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionQuality('disconnected');
        showQualityMessage('Connection lost');
      }
    };

    // Monitor stats for quality
    const statsInterval = setInterval(async () => {
      if (pc.connectionState === 'connected') {
        try {
          const stats = await pc.getStats();
          let packetsLost = 0;
          let packetsReceived = 0;
          
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              packetsLost = report.packetsLost || 0;
              packetsReceived = report.packetsReceived || 0;
            }
          });
          
          if (packetsReceived > 0) {
            const lossRate = packetsLost / (packetsLost + packetsReceived);
            if (lossRate > 0.1) {
              setConnectionQuality('poor');
              showQualityMessage('Adjusting quality for network conditions');
            } else if (lossRate > 0.05) {
              setConnectionQuality('good');
            } else {
              setConnectionQuality('excellent');
            }
          }
        } catch (err) {
          console.error('[VIDEO-CALL] Error getting stats:', err);
        }
      }
    }, 3000);

    // Store interval reference for cleanup
    (pc as any).statsInterval = statsInterval;

    return pc;
  };

  const createOffer = async (stream: MediaStream) => {
    try {
      console.log('[VIDEO-CALL] 🎬 Creating offer, current state:', peerConnectionRef.current?.signalingState || 'no-peer');
      
      // Close existing peer connection if any
      if (peerConnectionRef.current) {
        console.log('[VIDEO-CALL] 🔄 Closing existing peer connection');
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Create fresh peer connection
      peerConnectionRef.current = createPeerConnection(stream);
      
      const pc = peerConnectionRef.current;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      
      console.log('[VIDEO-CALL] 📤 Sending offer');
      socketRef.current?.emit('offer', {
        sessionId,
        offer
      });
    } catch (err) {
      console.error('[VIDEO-CALL] ❌ Error creating offer:', err);
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit, stream: MediaStream) => {
    try {
      console.log('[VIDEO-CALL] 📨 Handling offer, current state:', peerConnectionRef.current?.signalingState || 'no-peer');
      
      // If we have a peer connection in 'have-local-offer' state, we have a glare condition
      if (peerConnectionRef.current?.signalingState === 'have-local-offer') {
        console.log('[VIDEO-CALL] ⚠️ Glare detected! Resolving based on role...');
        // Patient always yields to doctor in glare situations
        if (user?.role === 'patient') {
          console.log('[VIDEO-CALL] 🔄 Patient yielding, restarting as answerer');
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        } else {
          console.log('[VIDEO-CALL] ⏭️ Doctor ignoring offer, keeping own offer');
          return; // Doctor ignores incoming offer
        }
      }
      
      // Create peer connection if needed
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = createPeerConnection(stream);
      }
      
      const pc = peerConnectionRef.current;
      
      // Only process offer if in stable state
      if (pc.signalingState === 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        console.log('[VIDEO-CALL] 📤 Sending answer');
        socketRef.current?.emit('answer', {
          sessionId,
          answer
        });
      } else {
        console.log('[VIDEO-CALL] ⚠️ Ignoring offer, wrong signaling state:', pc.signalingState);
      }
    } catch (err) {
      console.error('[VIDEO-CALL] ❌ Error handling offer:', err);
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      if (peerConnectionRef.current) {
        const pc = peerConnectionRef.current;
        // Only set remote description if we're waiting for an answer
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[VIDEO-CALL] ✅ Answer set successfully');
        } else {
          console.log('[VIDEO-CALL] ⚠️ Ignoring answer, wrong signaling state:', pc.signalingState);
        }
      }
    } catch (err) {
      console.error('[VIDEO-CALL] ❌ Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const showQualityMessage = (message: string) => {
    setQualityMessage(message);
    setTimeout(() => setQualityMessage(null), 3000);
  };

  const getSignalIcon = () => {
    switch (connectionQuality) {
      case 'excellent':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
          </svg>
        );
      case 'good':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7z" />
          </svg>
        );
      case 'poor':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const getSignalColor = () => {
    switch (connectionQuality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-yellow-400';
      case 'poor': return 'text-orange-400';
      default: return 'text-red-400';
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        
        // Notify remote user about video state change
        socketRef.current?.emit('media-state-change', {
          sessionId,
          video: videoTrack.enabled,
          audio: isAudioEnabled
        });
        
        console.log('[VIDEO-CALL] 📹 Video toggled:', videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        
        // Notify remote user about audio state change
        socketRef.current?.emit('media-state-change', {
          sessionId,
          video: isVideoEnabled,
          audio: audioTrack.enabled
        });
        
        console.log('[VIDEO-CALL] 🎤 Audio toggled:', audioTrack.enabled);
      }
    }
  };

  const endCall = () => {
    if (socketRef.current && sessionId && user) {
      socketRef.current.emit('leave-room', {
        sessionId,
        userId: user.userId,
        role: user.role
      });
    }
    cleanup();
    navigate(user?.role === 'patient' ? '/patient-dashboard' : '/doctor-dashboard');
  };

  const cleanup = () => {
    console.log('[VIDEO-CALL] 🧹 Cleaning up resources...');
    
    // Stop all local stream tracks (camera and microphone)
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('[VIDEO-CALL] 🛑 Stopping track:', track.kind);
        track.stop();
      });
      setLocalStream(null);
    }
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Close peer connection and clear stats interval
    if (peerConnectionRef.current) {
      const statsInterval = (peerConnectionRef.current as any).statsInterval;
      if (statsInterval) {
        clearInterval(statsInterval);
      }
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    console.log('[VIDEO-CALL] ✅ Cleanup complete');
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Minimal Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 flex justify-between items-center">
        <button
          onClick={endCall}
          className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors group"
        >
          <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>
        
        <div className="flex items-center gap-3 bg-gray-800 bg-opacity-90 backdrop-blur-sm px-5 py-3 rounded-full border border-gray-600">
          <div className={`flex items-center gap-2 ${getSignalColor()}`}>
            {getSignalIcon()}
          </div>
          <div className="w-px h-4 bg-gray-600"></div>
          <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-white text-sm font-sans font-semibold">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-20">
          {error}
        </div>
      )}

      {/* Quality Message */}
      {qualityMessage && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-90 text-white px-4 py-2 rounded-lg shadow-lg z-20 text-sm flex items-center gap-2">
          <div className="animate-pulse">{getSignalIcon()}</div>
          {qualityMessage}
        </div>
      )}

      {/* Video Container */}
      <div className="flex-1 relative bg-gray-900">
        {/* Remote Video (Main - Full Screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
            
            {/* Remote Video On/Off State */}
            {!remoteVideoEnabled && remoteUserJoined && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                  <p className="text-gray-400">Camera is off</p>
                </div>
              </div>
            )}

            {/* Remote Audio Muted Indicator */}
            {!remoteAudioEnabled && remoteUserJoined && (
              <div className="absolute top-4 right-4 bg-red-500 bg-opacity-90 text-white px-2 py-1 rounded-md text-xs flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                </svg>
                Mic off
              </div>
            )}

            {/* Remote User Label */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs">
              {user?.role === 'patient' ? 'Therapist' : 'Patient'}
            </div>

            {/* Waiting Overlay */}
            {!remoteUserJoined && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-90">
                <div className="text-center text-white">
                  <div className="mb-6">
                    <div className="w-12 h-12 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </div>
                  <h2 className="text-xl font-light mb-2">Waiting for {user?.role === 'patient' ? 'therapist' : 'patient'}</h2>
                  <p className="text-xs text-gray-400">Session will begin shortly...</p>
                </div>
              </div>
            )}

            {/* Connection Status */}
            {remoteUserJoined && connectionState !== 'connected' && (
              <div className="absolute top-4 right-4 bg-yellow-500 text-white px-2 py-1 rounded-md text-xs">
                Connecting...
              </div>
            )}

        {/* Local Video (Small - Picture in Picture) */}
        <div className="absolute bottom-24 right-6 w-48 h-36 bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-700 z-10">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* Local Video Off State */}
            {!isVideoEnabled && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </div>
                </div>
              </div>
            )}

            <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 backdrop-blur-sm text-white px-2 py-0.5 rounded text-xs flex items-center gap-1">
              You
              {!isAudioEnabled && (
                <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                </svg>
              )}
            </div>
          </div>
      </div>

      {/* Doctor Panel */}
      {user?.role === 'doctor' && (
        <>
          {/* Toggle Button */}
          <button
            onClick={() => setShowDoctorPanel(!showDoctorPanel)}
            className="absolute right-6 top-1/2 transform -translate-y-1/2 bg-teal-600 hover:bg-teal-700 text-white p-3 rounded-l-lg shadow-xl z-40 transition-all"
            title="Session Tools"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

          {/* Session Tools Modal */}
          {sessionData && (
            <SessionToolsModal 
              isOpen={showDoctorPanel}
              onClose={() => setShowDoctorPanel(false)}
              sessionId={sessionId || ''}
              patientId={user?.role === 'doctor' ? sessionData.patientId?._id || sessionData.patientId : sessionData.doctorId?._id || sessionData.doctorId}
              patientName={user?.role === 'doctor' 
                ? `${sessionData.patientId?.firstName || ''} ${sessionData.patientId?.lastName || ''}`.trim() 
                : `${sessionData.doctorId?.firstName || ''} ${sessionData.doctorId?.lastName || ''}`.trim()}
            />
          )}
        </>
      )}

      {/* Minimal Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4 z-50">
        <button
          onClick={toggleAudio}
          className={`w-14 h-14 rounded-full ${isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-all flex items-center justify-center shadow-xl`}
          title={isAudioEnabled ? 'Mute' : 'Unmute'}
        >
          {isAudioEnabled ? (
            <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
            </svg>
          )}
        </button>

        <button
          onClick={toggleVideo}
          className={`w-14 h-14 rounded-full ${isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-all flex items-center justify-center shadow-xl`}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {isVideoEnabled ? (
            <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
              <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
            </svg>
          )}
        </button>

        <button
          onClick={endCall}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all flex items-center justify-center shadow-xl"
          title="End call"
        >
          <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCallRoom;
