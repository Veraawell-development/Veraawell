import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import SessionToolsModal from '../components/SessionToolsModal';
import SessionChat from '../components/SessionChat';
import PostSessionReportModal from '../components/PostSessionReportModal';
import RatingModal from '../components/RatingModal';

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
  const [showChat, setShowChat] = useState(false);
  const [sessionData, setSessionData] = useState<any>(null);
  const [_loadingSession, setLoadingSession] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [endCallNotification, setEndCallNotification] = useState<{ show: boolean; userName: string }>({ show: false, userName: '' });

  const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001'
    : 'https://veraawell-backend.onrender.com';

  const fetchSessionData = async () => {
    try {
      setLoadingSession(true);
      console.log(' Fetching session data for:', sessionId);

      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await response.json();
      console.log(' Session data received:', data);
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

    return () => {
      cleanup();
    };
  }, [sessionId, user]);

  useEffect(() => {
    if (sessionData && !peerConnectionRef.current) {
      initializeCall();
    }
  }, [sessionData]);

  useEffect(() => {
    // Start countdown timer when connected and session data is available
    if (connectionState === 'connected' && sessionData) {
      if (!sessionData.sessionDate || !sessionData.sessionTime) return;

      const [hours, minutes] = sessionData.sessionTime.split(':').map(Number);
      const sessionStart = new Date(sessionData.sessionDate);
      sessionStart.setUTCHours(hours, minutes, 0, 0);

      // Default to 60 minutes if duration is not set
      const sessionDurationInMinutes = sessionData.duration || 60;
      const sessionEnd = new Date(sessionStart.getTime() + (sessionDurationInMinutes * 60000));
      const now = new Date();

      // Calculate initial remaining seconds based on current time
      // This handles cases where user joins late or reconnects
      let initialRemaining = Math.floor((sessionEnd.getTime() - now.getTime()) / 1000);

      // ✨ FIX: If session is immediate and was created recently, or if timer would be <= 0
      // but session just started/is immediate, default to full duration.
      // This prevents 0:00 issues due to clock drift or timezone mismatches on immediate calls.
      if (sessionData.sessionType === 'immediate' && initialRemaining <= 0) {
        initialRemaining = sessionDurationInMinutes * 60;
      } else if (now < sessionStart) {
        // If session hasn't started yet (scheduled), set to full duration
        initialRemaining = sessionDurationInMinutes * 60;
      }

      setDuration(initialRemaining > 0 ? initialRemaining : 0);

      const timer = setInterval(() => {
        setDuration(prev => {
          // Show warning at 5 minutes
          if (prev === 300) {
            setQualityMessage('⏰ 5 minutes remaining');
            setTimeout(() => setQualityMessage(null), 3000);
          }

          // Show final warning at 1 minute
          if (prev === 60) {
            setQualityMessage('⚠️ 1 minute remaining!');
            setTimeout(() => setQualityMessage(null), 3000);
          }

          if (prev <= 1) {
            // Auto-end call when time runs out
            clearInterval(timer);
            setQualityMessage('⏱️ Time\'s up! Session ending...');
            setTimeout(() => {
              endCall('timer_expired');
            }, 2000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [connectionState, sessionData]);

  // ✨ FIX: Force chat closed when session loads or when modals appear
  useEffect(() => {
    if (sessionData || showRatingModal || showReportModal) {
      setShowChat(false);
    }
  }, [sessionData, showRatingModal, showReportModal]);

  const initializeCall = async () => {
    try {
      // Validate authentication before proceeding
      if (!token) {
        console.error('[VIDEO-CALL]  No authentication token available');
        setError('Authentication error: Please log in again');
        setTimeout(() => {
          navigate(user?.role === 'patient' ? '/patient-dashboard' : '/doctor-dashboard');
        }, 2000);
        return;
      }

      console.log('[VIDEO-CALL]  Initializing with token:', token.substring(0, 20) + '...');

      // Determine media constraints based on call mode
      const isVoiceCall = sessionData?.callMode === 'Voice Calling';
      console.log(`[VIDEO-CALL] Mode: ${sessionData?.callMode}, Video enabled: ${!isVoiceCall}`);

      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVoiceCall,
        audio: true
      });

      setLocalStream(stream);

      // Only set video src if video is enabled
      if (!isVoiceCall && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Set initial states
      setIsVideoEnabled(!isVoiceCall);
      setIsAudioEnabled(true);

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
        console.error('[VIDEO-CALL] Connection error:', err.message);
        setError('Failed to connect to video call server: ' + err.message);

        // If authentication error, redirect to login
        if (err.message.includes('Authentication')) {
          setTimeout(() => {
            navigate('/auth');
          }, 2000);
        }
      });

      socket.on('connect', () => {
        console.log('[VIDEO-CALL]  Connected to server, Socket ID:', socket.id);
        // Join the room after successful connection
        socket.emit('join-room', { sessionId });
      });

      // Socket event handlers
      socket.on('room-joined', (data) => {
        console.log('[VIDEO-CALL]  Joined room:', data);
        setError(null); // Clear any previous errors
        // Check if there are other users in the room
        if (data.otherUsers && data.otherUsers.length > 0) {
          console.log('[VIDEO-CALL] 👥 Other users in room:', data.otherUsers);
          setRemoteUserJoined(true);
          // Only doctor creates offer when joining an existing room
          if (user?.role === 'doctor') {
            console.log('[VIDEO-CALL]  Doctor initiating call as offerer');
            createOffer(stream);
          }
        }
      });

      socket.on('user-joined', async (data) => {
        console.log('[VIDEO-CALL]  Remote user joined:', data.role);
        setRemoteUserJoined(true);
        // Only doctor creates offer when someone joins
        if (user?.role === 'doctor') {
          console.log('[VIDEO-CALL]  Doctor initiating call as offerer');
          await createOffer(stream);
        }
      });

      socket.on('offer', async ({ offer, senderId }) => {
        console.log('[VIDEO-CALL] Received offer from:', senderId);
        await handleOffer(offer, stream);
      });

      socket.on('answer', async ({ answer }) => {
        console.log('[VIDEO-CALL] Received answer');
        await handleAnswer(answer);
      });

      socket.on('ice-candidate', async ({ candidate }) => {
        console.log('[VIDEO-CALL] Received ICE candidate');
        await handleIceCandidate(candidate);
      });

      socket.on('user-left', (data) => {
        console.log('[VIDEO-CALL] Remote user left:', data.role);
        setRemoteUserJoined(false);
        setConnectionState('disconnected');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      });

      socket.on('media-state-change', (data) => {
        console.log('[VIDEO-CALL] Remote media state changed:', data);
        setRemoteVideoEnabled(data.video);
        setRemoteAudioEnabled(data.audio);
      });

      socket.on('error', (data) => {
        console.error('[VIDEO-CALL]  Socket error:', data.message);
        setError(data.message);
      });

      socket.on('call-ended', (data) => {
        console.log('[VIDEO-CALL] 📞 Remote user ended call:', data);
        // Explicitly close chat sidebar when call ends
        setShowChat(false);

        // Show notification popup
        setEndCallNotification({
          show: true,
          userName: data.userName || 'The other participant'
        });

        // After 2 seconds, show appropriate modal
        setTimeout(() => {
          setEndCallNotification({ show: false, userName: '' });

          if (user?.role === 'doctor') {
            setShowReportModal(true);
          } else {
            // Mark session complete first for patient
            fetch(`${API_BASE_URL}/api/sessions/${sessionId}/complete`, {
              method: 'POST',
              credentials: 'include'
            }).then(() => {
              setShowRatingModal(true);
            }).catch(err => {
              console.error('Error marking session complete:', err);
              setShowRatingModal(true); // Show anyway
            });
          }
        }, 2000);
      });


    } catch (err) {
      console.error('[VIDEO-CALL]  Error initializing call:', err);
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
        console.log('[VIDEO-CALL]  Glare detected! Resolving based on role...');
        // Patient always yields to doctor in glare situations
        if (user?.role === 'patient') {
          console.log('[VIDEO-CALL] 🔄 Patient yielding, restarting as answerer');
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        } else {
          console.log('[VIDEO-CALL]  Doctor ignoring offer, keeping own offer');
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
        console.log('[VIDEO-CALL]  Ignoring offer, wrong signaling state:', pc.signalingState);
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
          console.log('[VIDEO-CALL]  Answer set successfully');
        } else {
          console.log('[VIDEO-CALL]  Ignoring answer, wrong signaling state:', pc.signalingState);
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

  const endCall = async (reason: string = 'user_action') => {
    console.log(`[VIDEO-CALL] 📞 Ending call (Reason: ${reason})...`, { role: user?.role, sessionId });

    // Explicitly close chat sidebar
    setShowChat(false);

    // Emit socket event to notify other user
    if (socketRef.current && sessionId && user) {
      socketRef.current.emit('call-ended', {
        sessionId,
        endedBy: user.role,
        userName: user.firstName || 'User'
      });
      console.log('[VIDEO-CALL] 📤 Emitted call-ended event');
    }

    // For doctors: Show report modal instead of ending immediately
    if (user?.role === 'doctor') {
      setShowReportModal(true);
      return;
    }

    // For patients: Mark session as completed FIRST, then show rating modal
    try {
      console.log('[VIDEO-CALL] ✅ Marking session as completed before review...');

      const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      if (!response.ok) {
        console.error('[VIDEO-CALL] ❌ Failed to mark session as completed:', await response.text());
        // Continue anyway - show rating modal even if completion fails
      } else {
        console.log('[VIDEO-CALL] ✅ Session marked as completed successfully');
      }
    } catch (error) {
      console.error('[VIDEO-CALL] ❌ Error marking session as completed:', error);
      // Continue anyway - show rating modal even if completion fails
    }

    // Show rating modal (session should now be completed)
    setShowRatingModal(true);
  };

  const handleEndCall = () => {
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

  const handleReportSubmit = () => {
    setShowReportModal(false);
    handleEndCall();
  };

  const handleRatingSubmit = async (ratingData: { score: number; review: string }) => {
    try {
      console.log('[RATING] Submitting rating from video call:', { sessionId, score: ratingData.score });

      const response = await fetch(`${API_BASE_URL}/api/ratings/${sessionId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(ratingData)
      });

      if (response.ok) {
        console.log('[RATING] Rating submitted successfully');
        // Close rating modal and end call
        setShowRatingModal(false);
        handleEndCall();
      } else {
        const data = await response.json();
        console.error('[RATING] Error response:', data);
        alert(data.message || 'Failed to submit rating');
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating. Please try again.');
    }
  };

  const isVoiceMode = sessionData?.callMode === 'Voice Calling';


  // Voice Call UI Component
  const VoiceCallInterface = () => (
    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex flex-col items-center justify-center">
      {/* Remote User Avatar (Large) */}
      <div className="relative mb-12">
        {/* Pulsing Rings Animation */}
        <div className={`absolute inset-0 rounded-full bg-blue-500 opacity-20 ${remoteAudioEnabled ? 'animate-ping' : ''}`}></div>
        <div className={`absolute -inset-4 rounded-full bg-blue-500 opacity-10 ${remoteAudioEnabled ? 'animate-pulse' : ''}`}></div>

        <div className="w-48 h-48 rounded-full border-4 border-blue-400 overflow-hidden shadow-2xl relative z-10 bg-gray-800">
          {/* If we had user images, we would show them here. For now using Initials/Placeholder */}
          <div className="w-full h-full flex items-center justify-center bg-gray-700 text-white text-5xl font-bold">
            {remoteUserJoined ? (user?.role === 'patient' ? 'Dr' : 'Pt') : '?'}
          </div>
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-2">
            {remoteUserJoined
              ? (user?.role === 'patient' ? `Dr. ${sessionData?.doctorId?.lastName || 'Therapist'}` : `${sessionData?.patientId?.firstName || 'Patient'}`)
              : 'Waiting...'}
          </h2>
          <p className="text-blue-200 text-lg">
            {remoteUserJoined
              ? (remoteAudioEnabled ? 'Speaking...' : 'Muted')
              : 'Connecting...'}
          </p>
        </div>
      </div>

      {/* Local User Avatar (Small) */}
      <div className="absolute bottom-32 right-8 flex items-center gap-3 bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10">
        <div className="relative">
          <div className={`absolute inset-0 rounded-full bg-green-500 opacity-30 ${isAudioEnabled ? 'animate-pulse' : ''}`}></div>
          <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold border-2 border-green-400 relative z-10">
            You
          </div>
        </div>
        <div className="text-white text-sm">
          <div className="font-medium">You</div>
          <div className="text-xs text-gray-400">{isAudioEnabled ? 'Mic On' : 'Mic Off'}</div>
        </div>
      </div>
    </div>
  );

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

    console.log('[VIDEO-CALL]  Cleanup complete');
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Minimal Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 flex justify-between items-center">
        <button
          onClick={() => navigate(user?.role === 'patient' ? '/patient-dashboard' : '/doctor-dashboard')}
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
          <div className={`w-2.5 h-2.5 rounded-full ${duration < 60 ? 'bg-red-500 animate-pulse' :
            duration < 300 ? 'bg-yellow-400 animate-pulse' :
              'bg-green-400'
            }`}></div>
          <span className={`text-sm font-sans font-semibold ${duration < 60 ? 'text-red-400 animate-pulse' :
            duration < 300 ? 'text-yellow-300' :
              'text-white'
            }`}>
            {formatDuration(duration)}
          </span>
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

      {/* Main Content Area */}
      <div className="flex-1 relative bg-gray-900">

        {/* Render Voice Interface OR Video Interface */}
        {isVoiceMode ? (
          <VoiceCallInterface />
        ) : (
          <>
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
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                  <p className="text-gray-400">Camera is off</p>
                </div>
              </div>
            )}

            {/* Remote Audio Muted Indicator (Video Mode) */}
            {!remoteAudioEnabled && remoteUserJoined && (
              <div className="absolute top-4 right-4 bg-red-500 bg-opacity-90 text-white px-2 py-1 rounded-md text-xs flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
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
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 backdrop-blur-sm text-white px-2 py-0.5 rounded text-xs flex items-center gap-1">
                You
                {!isAudioEnabled && (
                  <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                  </svg>
                )}
              </div>
            </div>
          </>
        )}
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
              patientId={sessionData.patientId?._id || sessionData.patientId}
              patientName={`${sessionData.patientId?.firstName || ''} ${sessionData.patientId?.lastName || ''}`.trim()}
            />
          )}
        </>
      )}

      {/* Patient Chat Panel */}
      {user?.role === 'patient' && !showRatingModal && (
        <>
          {/* Chat Sidebar */}
          <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
            {/* Backdrop */}
            <div
              className={`absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity pointer-events-auto ${showChat ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setShowChat(false)}
            />

            {/* Sidebar */}
            <div
              className={`absolute top-0 right-0 h-full w-full max-w-sm bg-gray-900/95 backdrop-blur-xl border-l border-gray-700 shadow-2xl transform transition-transform duration-300 ease-in-out pointer-events-auto flex flex-col ${showChat ? 'translate-x-0' : 'translate-x-full'}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/50">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-wide" style={{ fontFamily: 'Bree Serif, serif' }}>
                    Chat
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    With <span className="text-teal-400 font-semibold">Dr. {sessionData?.doctorId?.firstName} {sessionData?.doctorId?.lastName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Chat Content */}
              <div className="flex-1 overflow-hidden p-4">
                {sessionData && (
                  <SessionChat
                    targetUserId={sessionData.doctorId?._id || sessionData.doctorId}
                    targetUserName={`Dr. ${sessionData.doctorId?.firstName || ''} ${sessionData.doctorId?.lastName || ''}`}
                  />
                )}
              </div>
            </div>
          </div>
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
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
            </svg>
          )}
        </button>

        {!isVoiceMode && (
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full ${isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'} text-white transition-all flex items-center justify-center shadow-xl`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoEnabled ? (
              <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
              </svg>
            )}
          </button>
        )}

        {/* Chat Toggle Button (Patient Only) */}
        {user?.role === 'patient' && (
          <button
            onClick={() => setShowChat(!showChat)}
            className={`w-14 h-14 rounded-full ${showChat ? 'bg-teal-600 hover:bg-teal-700' : 'bg-gray-700 hover:bg-gray-600'} text-white transition-all flex items-center justify-center shadow-xl`}
            title="Chat"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
        )}

        <button
          onClick={() => endCall('user_clicked_end')}
          className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all flex items-center justify-center shadow-xl"
          title="End call"
        >
          <svg className="w-6 h-6" fill="white" viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>

      {/* Post-Session Report Modal (Doctor Only) */}
      {user?.role === 'doctor' && sessionData && (
        <PostSessionReportModal
          isOpen={showReportModal}
          sessionId={sessionId || ''}
          patientId={sessionData.patientId?._id || sessionData.patientId}
          patientName={`${sessionData.patientId?.firstName || ''} ${sessionData.patientId?.lastName || ''}`.trim()}
          sessionDate={sessionData.sessionDate}
          sessionDuration={sessionData.duration || 60}
          onSubmit={handleReportSubmit}
          onCancel={() => setShowReportModal(false)}
        />
      )}

      {/* Rating Modal (Patient Only) */}
      {user?.role === 'patient' && sessionData && (
        <RatingModal
          isOpen={showRatingModal}
          sessionId={sessionId || ''}
          doctorName={sessionData?.doctorId ? `Dr. ${sessionData.doctorId.lastName || sessionData.doctorId.firstName}` : 'Doctor'}
          onClose={() => setShowRatingModal(false)}
          onSubmit={handleRatingSubmit}
        />
      )}

      {/* End Call Notification Popup */}
      {endCallNotification.show && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              {/* Icon */}
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                Session Ended
              </h3>

              {/* Message */}
              <p className="text-gray-600 text-lg mb-2">
                <span className="font-semibold text-gray-800">{endCallNotification.userName}</span> has ended the session
              </p>

              <p className="text-sm text-gray-500">
                Redirecting to post-session review...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCallRoom;
