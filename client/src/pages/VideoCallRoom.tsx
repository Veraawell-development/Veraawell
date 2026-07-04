import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { io, Socket } from 'socket.io-client';
import { useDataSocket } from '../hooks/useDataSocket';
import { toast } from 'react-hot-toast';
import SessionToolsModal from '../components/SessionToolsModal';
import SessionChat from '../components/SessionChat';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
// RatingModal removed - feedback is handled by PatientDashboard

const VideoCallRoom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);

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
  // RatingModal removed - PatientDashboard owns the only feedback modal
  const [acceptanceStatus, setAcceptanceStatus] = useState<'pending' | 'accepted' | 'delayed'>('pending');
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [doctorNote, setDoctorNote] = useState('');

  //  Mandatory Emergency Contact State
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [newEmergencyContact, setNewEmergencyContact] = useState({ name: '', phone: '' });

  // Consent Ending Modal States
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentRequester, setConsentRequester] = useState<string | null>(null);

  // Chat Notification State
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  useEffect(() => {
    if (showChat || showDoctorPanel) {
      setHasUnreadMessages(false);
    }
  }, [showChat, showDoctorPanel]);

  //  REAL-TIME: Listen for session updates via data socket (backup)
  const { socket: dataSocket } = useDataSocket();

  useEffect(() => {
    if (!dataSocket) return;

    const handleStatusUpdate = (data: any) => {
      console.log('[VIDEO-ROOM] Status update via DataSocket:', data);
      if (data.sessionId === sessionId) {
        if (data.acceptanceStatus) setAcceptanceStatus(data.acceptanceStatus);
        if (data.delayMinutes) setDelayMinutes(data.delayMinutes);
        if (data.doctorNote) setDoctorNote(data.doctorNote);
      }
    };

    dataSocket.on('session:status-update', handleStatusUpdate);
    return () => {
      dataSocket.off('session:status-update', handleStatusUpdate);
    };
  }, [dataSocket, sessionId]);

  const fetchSessionData = async () => {
    try {
      setLoadingSession(true);
      console.log(' Fetching session data for:', sessionId);

      // Fetch session details and TURN credentials in parallel
      const [sessionResponse, turnResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/sessions/${sessionId}`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/sessions/turn-credentials`, { credentials: 'include' }).catch(() => null)
      ]);

      if (!sessionResponse.ok) {
        throw new Error('Failed to fetch session data');
      }

      const data = await sessionResponse.json();
      console.log(' Session data received:', data);
      setSessionData(data);

      // Initialize states from fetched data
      if (data.acceptanceStatus) setAcceptanceStatus(data.acceptanceStatus);
      if (data.delayMinutes) setDelayMinutes(data.delayMinutes);
      if (data.doctorNote) setDoctorNote(data.doctorNote);

      // Handle TURN credentials
      if (turnResponse && turnResponse.ok) {
        const turnData = await turnResponse.json();
        if (turnData.success && turnData.iceServers) {
          iceServersRef.current = { iceServers: turnData.iceServers };
          console.log('[VIDEO-CALL]  Loaded secure TURN credentials');
        }
      }
    } catch (error) {
      console.error('Error fetching session data:', error);
      setError('Failed to load session details');
    } finally {
      setLoadingSession(false);
    }
  };

  const saveEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmergencyContact.name || !newEmergencyContact.phone) return;

    setSavingContact(true);
    try {
      const response = await fetch(`${API_BASE_URL}/profile/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          emergencyContact: {
            name: newEmergencyContact.name,
            phone: newEmergencyContact.phone
          }
        })
      });

      if (response.ok) {
        setShowEmergencyModal(false);
        // We'll also update the local user object manually if we can, 
        // but Since we don't have a setter for user in AuthContext we rely on modal closure.
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to save emergency contact');
      }
    } catch (err) {
      console.error('Error saving emergency contact:', err);
      setError('Failed to save emergency contact');
    } finally {
      setSavingContact(false);
    }
  };

  // ICE servers configuration (Google's public STUN servers by default, updated via API)
  const iceServersRef = useRef<RTCConfiguration>({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  });

  useEffect(() => {
    if (!sessionId || !user) return;

    //  Mandatory Check: Ensure patient has emergency contact
    if (user.role === 'patient') {
      const hasContact = user.emergencyContact?.name && user.emergencyContact?.phone;
      if (!hasContact) {
        console.log('[VIDEO-ROOM] Emergency contact missing. Prompting user.');
        setShowEmergencyModal(true);
      }
    }

    fetchSessionData();

    return () => {
      cleanup();
    };
  }, [sessionId, user]);

  useEffect(() => {
    if (sessionData && !socketRef.current) {
      initializeCall();
    }
  }, [sessionData]);

  useEffect(() => {
    // Listen for server timer sync when connected
    if (connectionState === 'connected' && socketRef.current) {
      const socket = socketRef.current;

      const handleTimerSync = (data: { remainingSeconds: number }) => {
        setDuration(data.remainingSeconds);
        
        // Warnings based on server-synchronized time
        if (data.remainingSeconds === 300) {
          setQualityMessage('5 minutes remaining');
          setTimeout(() => setQualityMessage(null), 3000);
        } else if (data.remainingSeconds === 120) {
          setQualityMessage(' 2 minutes remaining');
          setTimeout(() => setQualityMessage(null), 3000);
        } else if (data.remainingSeconds === 60) {
          setQualityMessage(' 1 minute remaining!');
          setTimeout(() => setQualityMessage(null), 3000);
        }
      };

      const handleTimeUp = () => {
        setQualityMessage(' Time\'s up! Session ending...');
        setTimeout(() => {
          endCall('timer_expired');
        }, 2000);
      };

      socket.on('timer-sync', handleTimerSync);
      socket.on('session-time-up', handleTimeUp);

      return () => {
        socket.off('timer-sync', handleTimerSync);
        socket.off('session-time-up', handleTimeUp);
      };
    }
  }, [connectionState]);

  //  FIX: Force chat closed on mount and when modals appear
  useEffect(() => {
    setShowChat(false);
  }, []);



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
      console.log('[VIDEO-CALL]  Connecting to:', SOCKET_URL);
      const socket = io(SOCKET_URL, {
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

        //  FIX: Only set remoteUserJoined if there's someone with a DIFFERENT role
        if (data.otherUsers && data.otherUsers.length > 0) {
          console.log('[VIDEO-CALL]  Other users detected:', data.otherUsers.map((u: any) => u.role));
          const hasOppositeRole = data.otherUsers.some((u: any) => u.role !== user?.role);

          if (hasOppositeRole) {
            console.log('[VIDEO-CALL]  Opposite participant found in room. Syncing...');
            setRemoteUserJoined(true);
            
            //  FIX: Patient sends ready signal if doctor is already there
            if (user?.role === 'patient') {
              console.log('[VIDEO-CALL]  Patient joined and ready, notifying doctor');
              socket.emit('patient-ready', { sessionId });
            }
          } else {
            console.log('[VIDEO-CALL] ℹ️ Only same-role participants found. Staying in Waiting Room.');
            setRemoteUserJoined(false);
          }
        } else {
          console.log('[VIDEO-CALL] ℹ️ Room is empty. Staying in Waiting Room.');
          setRemoteUserJoined(false);
        }
      });

      socket.on('user-joined', async (data) => {
        console.log('[VIDEO-CALL]  User joined event:', data.role);

        //  FIX: Only set remoteUserJoined if the joining user has a DIFFERENT role
        if (data.role !== user?.role) {
          console.log('[VIDEO-CALL]  Opposite participant joined. Closing Waiting Room.');
          setRemoteUserJoined(true);
          toast.success(`${data.role === 'doctor' ? 'Doctor' : 'Patient'} has joined the call`);
          
          //  AGGRESSIVE FIX: Reset peer connection for both roles to ensure a clean start!
          // This fixes the issue where patient reuses old connection and fails to connect!
          if (peerConnectionRef.current) {
            console.log('[VIDEO-CALL]  Resetting peer connection on user-joined');
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }

          //  FIX: Doctor does NOT create offer immediately on user-joined.
          // Doctor waits for 'patient-ready' signal!
          if (user?.role === 'patient') {
            console.log('[VIDEO-CALL]  Patient ready, notifying doctor');
            socket.emit('patient-ready', { sessionId });
          }
        } else {
          console.log('[VIDEO-CALL] Same role user joined (probably a reconnection). Keeping Waiting Room.');
        }
      });

      //  FIX: Listen for patient-ready signal
      socket.on('patient-ready', async () => {
        console.log('[VIDEO-CALL]  Patient ready signal received');
        if (user?.role === 'doctor') {
          console.log('[VIDEO-CALL]  Doctor initiating call after patient ready');
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
        toast.error(`${data.role === 'patient' ? 'Patient' : 'Doctor'} has left the session`, { id: 'user-left-session' });
        setTimeout(() => setQualityMessage(null), 5000);
      });

      socket.on('request-end-session', (data) => {
        console.log('[VIDEO-CALL] Request end session from:', data.requestedByRole);
        setConsentRequester(data.requestedByRole);
        setShowConsentModal(true);
      });

      socket.on('confirm-end-session', (data) => {
        console.log('[VIDEO-CALL] Confirm end session:', data);
        if (data.agree) {
          setShowConsentModal(false);
          endCall('mutual_consent');
        } else {
          setShowConsentModal(false);
          setQualityMessage('The other user declined to end the session.');
          setTimeout(() => setQualityMessage(null), 3000);
        }
      });

      socket.on('media-state-change', (data) => {
        console.log('[VIDEO-CALL] Remote media state changed:', data);
        setRemoteAudioEnabled(prev => {
          if (prev !== data.audio) {
            toast(data.audio ? 'Mic is on' : 'Mic is off', { icon: null });
          }
          return data.audio;
        });
        setRemoteVideoEnabled(prev => {
          if (prev !== data.video) {
            toast(data.video ? 'Camera is on' : 'Camera is off', { icon: null });
          }
          return data.video;
        });
      });

      socket.on('error', (data) => {
        console.error('[VIDEO-CALL]  Socket error:', data.message);
        setError(data.message);
      });

      socket.on('call-ended', (data) => {
        console.log('[VIDEO-CALL]  Remote user ended call:', data);
        // Explicitly close chat sidebar when call ends
        setShowChat(false);

        const otherUser = data.userName || (user?.role === 'doctor' ? 'Patient' : 'Doctor');
        toast.error(`${otherUser} has ended the session`, { duration: 4000 });

        // After 2 seconds, navigate to dashboard with appropriate state
        setTimeout(() => {
          cleanup();

          if (user?.role === 'doctor') {
            navigate('/doctor-dashboard', {
              state: {
                pendingReport: {
                  sessionId: sessionId || '',
                  patientId: sessionData?.patientId?._id || sessionData?.patientId,
                  patientName: `${sessionData?.patientId?.firstName || ''} ${sessionData?.patientId?.lastName || ''}`.trim(),
                  sessionDuration: sessionData?.duration || 60
                }
              }
            });
          } else {
            // Patient Side: Mark complete and show rating on dashboard
            fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
              method: 'POST',
              credentials: 'include'
            }).catch(console.error);
            navigate('/patient-dashboard', { state: { showRating: true, sessionId } });
          }
        }, 2000);
      });

      socket.on('session:status-update', (data) => {
        console.log('[VIDEO-CALL] Received session status update:', data);
        if (data.acceptanceStatus) setAcceptanceStatus(data.acceptanceStatus);
        if (data.delayMinutes) setDelayMinutes(data.delayMinutes);
        if (data.doctorNote) setDoctorNote(data.doctorNote);

        if (data.acceptanceStatus === 'accepted') {
          showQualityMessage('Doctor has accepted and is joining!');
        }
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
    const pc = new RTCPeerConnection(iceServersRef.current);
    peerConnectionRef.current = pc;

    // Add local stream tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      console.log('[VIDEO-CALL]  Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        //  Safari Compatibility Fix: Explicitly call play() as Safari sometimes ignores autoPlay
        remoteVideoRef.current.play().catch(e => console.warn('[VIDEO-CALL] Safari AutoPlay prevented:', e));
      }
      setConnectionState('connected');
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log(' Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          sessionId,
          candidate: event.candidate
        });
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('[VIDEO-CALL]  Connection state:', pc.connectionState);
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
      console.log('[VIDEO-CALL]  ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'checking') {
        setConnectionQuality('good');
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectionQuality('excellent');
      } else if (pc.iceConnectionState === 'disconnected') {
        setConnectionQuality('poor');
        showQualityMessage('Connection quality degraded');
      } else if (pc.iceConnectionState === 'failed') {
        setConnectionQuality('disconnected');
        showQualityMessage('Connection lost. Attempting to reconnect...');
        
        //  FIX: Attempt to reconnect if we are the doctor (offerer)
        if (user?.role === 'doctor') {
          console.log('[VIDEO-CALL]  ICE failed. Doctor attempting to reconnect');
          setTimeout(() => {
            createOffer(stream);
          }, 3000);
        }
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
      console.log('[VIDEO-CALL]  Creating offer, current state:', peerConnectionRef.current?.signalingState || 'no-peer');

      // Close existing peer connection if any
      if (peerConnectionRef.current) {
        console.log('[VIDEO-CALL]  Closing existing peer connection');
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

      console.log('[VIDEO-CALL]  Sending offer');
      socketRef.current?.emit('offer', {
        sessionId,
        offer
      });
    } catch (err) {
      console.error('[VIDEO-CALL]  Error creating offer:', err);
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit, stream: MediaStream) => {
    try {
      console.log('[VIDEO-CALL]  Handling offer, current state:', peerConnectionRef.current?.signalingState || 'no-peer');

      // If we have a peer connection in 'have-local-offer' state, we have a glare condition
      if (peerConnectionRef.current?.signalingState === 'have-local-offer') {
        console.log('[VIDEO-CALL]  Glare detected! Resolving based on role...');
        // Patient always yields to doctor in glare situations
        if (user?.role === 'patient') {
          console.log('[VIDEO-CALL]  Patient yielding, restarting as answerer');
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

        // Process any queued ICE candidates
        while (iceCandidateQueue.current.length > 0) {
          const candidate = iceCandidateQueue.current.shift();
          if (candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log('[VIDEO-CALL]  Sending answer');
        socketRef.current?.emit('answer', {
          sessionId,
          answer
        });
      } else {
        console.log('[VIDEO-CALL]  Ignoring offer, wrong signaling state:', pc.signalingState);
      }
    } catch (err) {
      console.error('[VIDEO-CALL]  Error handling offer:', err);
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

          // Process any queued ICE candidates
          while (iceCandidateQueue.current.length > 0) {
            const candidate = iceCandidateQueue.current.shift();
            if (candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          }
        } else {
          console.log('[VIDEO-CALL]  Ignoring answer, wrong signaling state:', pc.signalingState);
        }
      }
    } catch (err) {
      console.error('[VIDEO-CALL]  Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      if (peerConnectionRef.current) {
        if (peerConnectionRef.current.remoteDescription) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          iceCandidateQueue.current.push(candidate);
          console.log('[VIDEO-CALL] Queued ICE candidate (remoteDescription not set yet)');
        }
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

        // Ensure video element resumes playing if paused by the browser
        if (videoTrack.enabled && localVideoRef.current) {
          localVideoRef.current.play().catch(e => console.warn('Play interrupted:', e));
        }

        // Notify remote user about video state change
        socketRef.current?.emit('media-state-change', {
          sessionId,
          video: videoTrack.enabled,
          audio: isAudioEnabled
        });

        console.log('[VIDEO-CALL]  Video toggled:', videoTrack.enabled);
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

        console.log('[VIDEO-CALL]  Audio toggled:', audioTrack.enabled);
      }
    }
  };

  const requestEndSession = () => {
    // If the other person has dropped or hasn't joined, instantly force-end
    if (!remoteUserJoined) {
      endCall('ended_by_user');
      return;
    }

    if (socketRef.current && sessionId && user) {
      socketRef.current.emit('request-end-session', { sessionId, requestedByRole: user.role });
      setConsentRequester(user.role);
      setShowConsentModal(true);
    }
  };

  const cancelEndSessionRequest = () => {
    setShowConsentModal(false);
    setConsentRequester(null);
  };

  const handleConsentResponse = (agree: boolean) => {
    if (socketRef.current && sessionId && user) {
      socketRef.current.emit('confirm-end-session', { sessionId, agree, confirmedByRole: user.role });
      setShowConsentModal(false);
      if (agree) {
        endCall('mutual_consent');
      }
    }
  };

  const endCall = async (reason: string = 'user_action') => {
    console.log(`[VIDEO-CALL]  Ending call (Reason: ${reason})...`, { role: user?.role, sessionId });

    // Explicitly close chat sidebar
    setShowChat(false);

    // Emit socket event to notify other user
    if (socketRef.current && sessionId && user) {
      socketRef.current.emit('call-ended', {
        sessionId,
        endedBy: user.role,
        userName: user.firstName || 'User'
      });
      console.log('[VIDEO-CALL]  Emitted call-ended event');
    }

    // Cleanup immediately for both
    cleanup();

    // For doctors: Navigate to dashboard with state to trigger mandatory report
    if (user?.role === 'doctor') {
      navigate('/doctor-dashboard', {
        state: {
          pendingReport: {
            sessionId: sessionId || '',
            patientId: sessionData?.patientId?._id || sessionData?.patientId,
            patientName: `${sessionData?.patientId?.firstName || ''} ${sessionData?.patientId?.lastName || ''}`.trim(),
            sessionDuration: sessionData?.duration || 60
          }
        }
      });
      return;
    }

    // For patients: Mark session as completed (background) and navigate to dashboard
    if (user?.role === 'patient') {
      try {
        fetch(`${API_BASE_URL}/sessions/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
      } catch (e) {
        console.error('Error marking completion:', e);
      }
      navigate('/patient-dashboard', { state: { showRating: true, sessionId } });
    }
  };




  const isVoiceMode = sessionData?.callMode === 'Voice Calling';

  const remoteUserName = remoteUserJoined 
    ? (user?.role === 'patient' 
        ? `Dr. ${sessionData?.doctorId?.lastName || sessionData?.doctorId?.firstName || 'Therapist'}` 
        : `${sessionData?.patientId?.firstName || 'Patient'} ${sessionData?.patientId?.lastName || ''}`.trim()) 
    : 'Waiting...';

  const localUserName = user 
    ? (user.role === 'doctor' 
        ? `Dr. ${user.lastName || user.firstName || 'Therapist'}` 
        : `${user.firstName || 'Patient'} ${user.lastName || ''}`.trim()) 
    : 'You';

  const remoteUserImage = user?.role === 'patient' 
    ? sessionData?.doctorId?.profileImage || sessionData?.doctorId?.profile?.profileImage || (sessionData?.doctorId?.gender === 'female' ? '/female.jpg' : '/male.jpg')
    : sessionData?.patientId?.profileImage || sessionData?.patientId?.profile?.profileImage;

  const localUserImage = user?.role === 'doctor'
    ? sessionData?.doctorId?.profileImage || sessionData?.doctorId?.profile?.profileImage || user?.profileImage || user?.profile?.profileImage || (user?.gender === 'female' ? '/female.jpg' : '/male.jpg')
    : sessionData?.patientId?.profileImage || sessionData?.patientId?.profile?.profileImage || user?.profileImage || user?.profile?.profileImage;

  // Voice Call UI Component
  const VoiceCallInterface = () => (
    <div className="relative w-full flex-1 rounded-[32px] overflow-hidden bg-[#0F172A] flex flex-col items-center justify-center font-sans shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-white/5 ring-1 ring-white/10 isolate">
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 -left-1/4 w-full h-full bg-teal-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 -right-1/4 w-full h-full bg-blue-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-[pulse_10s_ease-in-out_infinite_reverse]" />
      </div>

      {/* Central Profile Area */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Avatar Area */}
        <div className="relative mb-12">
          {remoteUserJoined && remoteAudioEnabled && (
            <>
              {/* Sound waves rings */}
              <div className="absolute inset-0 rounded-full border-2 border-teal-400/30 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
              <div className="absolute -inset-4 rounded-full border-2 border-teal-400/20 animate-[ping_2.5s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]" />
              <div className="absolute -inset-8 rounded-full border-2 border-teal-400/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite_1s]" />
            </>
          )}
          {/* Main Avatar */}
          <div className="relative w-40 h-40 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 shadow-[0_0_40px_rgba(45,212,191,0.3)] flex items-center justify-center text-white text-5xl font-light tracking-widest z-10 overflow-hidden">
            {remoteUserJoined ? (
              remoteUserImage && !remoteUserImage.includes('doctor-0') ? (
                <img src={remoteUserImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.role === 'patient' ? 'DR' : 'PT'
              )
            ) : '?'}
          </div>
        </div>
        
        {/* Name */}
        <h2 className="text-4xl font-extralight text-white mb-3 tracking-wide">
          {remoteUserName}
        </h2>
        
        {/* Status */}
        <p className={`text-sm tracking-[0.3em] uppercase font-semibold transition-colors duration-500 ${remoteUserJoined && remoteAudioEnabled ? 'text-teal-400 shadow-teal-400/50 drop-shadow-md' : 'text-slate-500'}`}>
          {remoteUserJoined
            ? (remoteAudioEnabled ? 'Speaking...' : 'Microphone Muted')
            : 'Connecting...'}
        </p>
        
        {/* Delay Message */}
        {sessionData?.delayMinutes > 0 && (
          <div className="mt-12 px-6 py-4 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-slate-300 text-sm w-full max-w-sm text-center shadow-2xl">
            <span className="font-semibold text-white">Delayed {sessionData.delayMinutes} mins</span>
            {sessionData.doctorNote && <p className="mt-2 text-slate-400 font-light italic">"{sessionData.doctorNote}"</p>}
          </div>
        )}
      </div>

      {/* Local User Floating Status */}
      <div className="absolute bottom-10 left-10 flex items-center gap-4 bg-white/5 backdrop-blur-xl shadow-2xl p-3 pr-6 rounded-full border border-white/10 transition-transform hover:scale-105 z-10">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white font-medium tracking-wider text-sm shadow-inner overflow-hidden border border-white/10">
          {localUserImage && !localUserImage.includes('doctor-0') ? (
            <img src={localUserImage} alt="You" className="w-full h-full object-cover" />
          ) : (
            localUserName.substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-0.5">{localUserName}</span>
          <span className={`text-xs font-semibold uppercase tracking-wider ${isAudioEnabled ? 'text-teal-400' : 'text-red-400'}`}>
            {isAudioEnabled ? 'Mic Active' : 'Muted'}
          </span>
        </div>
      </div>
    </div>
  );

  const cleanup = () => {
    console.log('[VIDEO-CALL]  Cleaning up resources...');

    // Stop all local stream tracks (camera and microphone)
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('[VIDEO-CALL] Stopping track:', track.kind);
        track.stop();
      });
      setLocalStream(null);
    }

    // Clear queue
    iceCandidateQueue.current = [];

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
    <div className="min-h-screen bg-[#09090B] flex flex-col p-4 md:p-6 gap-4">
      {/* Minimal Header */}
      <div className="flex justify-between items-center z-10 shrink-0">
        <button
          onClick={() => navigate(user?.role === 'patient' ? '/patient-dashboard' : '/doctor-dashboard')}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors group px-4 py-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 backdrop-blur-md"
        >
          <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm font-medium">Back to Dashboard</span>
        </button>

        <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-sm">
          <div className={`flex items-center gap-2 ${getSignalColor()}`}>
            {getSignalIcon()}
          </div>
          <div className="w-[1px] h-4 bg-white/20"></div>
          <div className={`w-2 h-2 rounded-full ${duration < 60 ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]' :
            duration < 300 ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]' :
              'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
            }`}></div>
          <span className={`text-sm font-sans font-medium tracking-wide ${duration < 60 ? 'text-red-400' :
            duration < 300 ? 'text-amber-400' :
              'text-white/90'
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
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black/80 backdrop-blur-md border border-white/10 text-white/90 px-4 py-2 rounded-full shadow-lg z-20 text-sm flex items-center gap-2">
          <div className="animate-pulse">{getSignalIcon()}</div>
          {qualityMessage}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden flex flex-col">

        {/* Render Voice Interface OR Video Interface */}
        {isVoiceMode ? (
          <VoiceCallInterface />
        ) : (
          <div className="relative w-full flex-1 rounded-[32px] overflow-hidden bg-[#18181B] shadow-[0_0_60px_rgba(0,0,0,0.6)] border border-white/5 ring-1 ring-white/10 isolate">
            {/* Remote Video (Main Stage) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Remote Video On/Off State */}
            {!remoteVideoEnabled && remoteUserJoined && (
              <div className="absolute inset-0 bg-[#18181B] flex flex-col items-center justify-center font-sans z-10">
                <div className="text-center">
                  <div className="w-24 h-24 bg-[#27272A] rounded-full flex items-center justify-center mb-6 mx-auto border border-white/20 shadow-lg shadow-black/50">
                    <svg className="w-12 h-12 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                  <p className="text-white font-medium text-lg tracking-wide">Camera is off</p>
                </div>
              </div>
            )}

            {/* Remote Audio Muted Indicator (Video Mode) */}
            {!remoteAudioEnabled && remoteUserJoined && (
              <div className="absolute top-6 right-6 bg-black/60 backdrop-blur-md border border-white/10 text-red-400 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg z-20">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                </svg>
                Mic off
              </div>
            )}

            {/* Remote User Label */}
            <div className="absolute top-6 left-6 bg-black/60 backdrop-blur-md border border-white/10 text-white/90 px-4 py-1.5 rounded-full text-xs font-medium shadow-lg z-20">
              {remoteUserName}
            </div>

            {/* Waiting Overlay / Waiting Room (Patient Only) */}
            {user?.role === 'patient' && !remoteUserJoined && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0F1115] z-[100] font-sans">
                <div className="text-center text-white relative z-10 p-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-screen w-full">
                  
                  <div className="flex flex-col items-center">
                    {/* Minimal Inline Spinner & Text */}
                    <div className="flex flex-col items-center gap-6">
                      {/* Explicit Waiting Room Label */}
                      <div className="text-white/40 uppercase tracking-[0.2em] text-[10px] font-bold mb-2">
                        Waiting Room
                      </div>

                      <div className="w-10 h-10 border-2 border-white/20 border-t-white/90 rounded-full animate-spin"></div>
                      
                      <div className="space-y-2 text-center mt-2">
                        <h2 className="text-2xl font-medium tracking-wide text-white/90">
                          {acceptanceStatus === 'pending' ? 'Calling Doctor...' : 
                           acceptanceStatus === 'accepted' ? 'Doctor has joined' : 'Waiting...'}
                        </h2>
                        
                        {acceptanceStatus === 'pending' && (
                          <p className="text-white/50 text-sm">Connecting you with {sessionData?.doctorId ? `Dr. ${sessionData.doctorId.lastName}` : 'your therapist'}</p>
                        )}

                        {acceptanceStatus === 'accepted' && (
                          <div className="animate-in fade-in duration-300">
                            <p className="text-teal-400 font-medium text-sm">Doctor has joined. Starting session...</p>
                          </div>
                        )}

                        {acceptanceStatus === 'delayed' && (
                          <div className="animate-in fade-in duration-300 mt-4">
                            <p className="text-amber-400/90 font-medium text-sm">Doctor will join in {delayMinutes}m</p>
                            {doctorNote && <p className="text-white/50 text-xs italic mt-1">"{doctorNote}"</p>}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Leave Button directly below the text */}
                    <div className="mt-10">
                      <button
                        onClick={() => endCall('user_clicked_end')}
                        className="px-5 py-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
                      >
                        Leave call
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Waiting Overlay (Doctor Only) */}
            {!remoteUserJoined && user?.role === 'doctor' && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0F1115] z-[100] font-sans">
                <div className="text-center text-white relative z-10 p-8 max-w-lg mx-auto flex flex-col items-center justify-center min-h-screen w-full">
                  <div className="flex flex-col items-center gap-6">
                    <div className="text-white/40 uppercase tracking-[0.2em] text-[10px] font-bold mb-2">
                      Waiting Room
                    </div>
                    
                    <div className="w-10 h-10 border-2 border-white/20 border-t-white/90 rounded-full animate-spin"></div>
                    
                    <div className="space-y-2 text-center mt-2">
                      <h2 className="text-2xl font-medium tracking-wide text-white/90">Waiting for patient</h2>
                      <p className="text-sm font-medium text-white/50">Session will start automatically when they join.</p>
                    </div>
                  </div>

                  <div className="mt-10">
                    <button
                      onClick={() => endCall('user_clicked_end')}
                      className="px-5 py-2 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition-colors"
                    >
                      End Call
                    </button>
                  </div>
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
            <div className="absolute bottom-6 right-6 w-60 h-40 bg-[#18181B] rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-20 group">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transition-opacity duration-300 -scale-x-100"
                style={{ opacity: isVideoEnabled ? 1 : 0 }}
              />

              {/* Local Video Off State */}
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-[#18181B] flex flex-col items-center justify-center font-sans z-10">
                  <div className="w-14 h-14 bg-[#27272A] rounded-full flex items-center justify-center border border-white/20 mb-3 shadow-md shadow-black/50">
                    <svg className="w-6 h-6 text-white/90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
                    </svg>
                  </div>
                  <span className="text-xs text-white/90 uppercase tracking-[0.2em] font-bold">You</span>
                </div>
              )}

              {/* Local Mic State */}
              {!isAudioEnabled && (
                <div className="absolute top-3 right-3 bg-red-500/80 backdrop-blur-sm p-1.5 rounded-full shadow-lg transition-opacity duration-300">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100]">
          <div className="bg-[#18181B] border border-white/10 p-8 rounded-[2rem] max-w-sm w-full mx-4 shadow-2xl shadow-black/50 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-xl font-medium tracking-wide text-white mb-2">End Session?</h3>
            <p className="text-white/60 font-light mb-8 leading-relaxed text-sm">
              {consentRequester === user?.role 
                ? 'Waiting for the other user to agree...' 
                : 'The other user has requested to end the session. Do you agree?'}
            </p>
            <div className="flex gap-3 justify-end">
              {consentRequester === user?.role ? (
                <button
                  onClick={() => cancelEndSessionRequest()}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all text-sm"
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleConsentResponse(false)}
                    className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all text-sm"
                  >
                    No, Stay
                  </button>
                  <button
                    onClick={() => handleConsentResponse(true)}
                    className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl font-medium transition-all text-sm"
                  >
                    Yes, End
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Doctor Panel - AGGRESSIVE FIX: Always render so it listens for messages in bg */}
      {user?.role === 'doctor' && sessionData && (
        <>
          {/* Session Tools Modal */}
          <SessionToolsModal
            isOpen={showDoctorPanel}
            onClose={() => setShowDoctorPanel(false)}
              sessionId={sessionId || ''}
              patientId={sessionData.patientId?._id || sessionData.patientId}
              patientName={`${sessionData.patientId?.firstName || ''} ${sessionData.patientId?.lastName || ''}`.trim()}
              onNewMessage={() => !showDoctorPanel && setHasUnreadMessages(true)}
            />
        </>
      )}

      {/* Patient Chat Panel - AGGRESSIVE FIX: Always render so it listens for messages in bg */}
      {user?.role === 'patient' && (
        <>
          {/* Chat Sidebar */}
          <div className={`fixed inset-0 z-[150] overflow-hidden pointer-events-none ${showChat ? 'visible' : 'invisible delay-300'}`}>
            {/* Backdrop */}
            <div
              className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity pointer-events-auto ${showChat ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setShowChat(false)}
            />

            {/* Floating Sidebar */}
            <div
              className={`absolute top-4 right-4 bottom-4 w-full max-w-sm bg-[#18181B]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.8)] transform transition-transform duration-300 ease-in-out pointer-events-auto flex flex-col overflow-hidden ${showChat ? 'translate-x-0' : 'translate-x-[120%]'}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
                <div>
                  <h2 className="text-xl font-medium text-white tracking-wide">
                    Chat
                  </h2>
                  <p className="text-sm text-white/50 mt-1 font-light">
                    With <span className="text-white/90 font-medium">Dr. {sessionData?.doctorId?.firstName} {sessionData?.doctorId?.lastName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-white/40 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Chat Content */}
              <div className="flex-1 overflow-hidden bg-black/20">
                {sessionData && (
                  <SessionChat
                    targetUserId={sessionData.doctorId?._id || sessionData.doctorId}
                    targetUserName={`Dr. ${sessionData.doctorId?.firstName || ''} ${sessionData.doctorId?.lastName || ''}`}
                    onNewMessage={() => !showChat && setHasUnreadMessages(true)}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Minimal Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-3 z-50 bg-[#1A1A1A]/80 backdrop-blur-2xl px-6 py-4 rounded-full shadow-[0_16px_40px_rgba(0,0,0,0.5)] border border-white/10 isolate">
        {/* Audio Toggle */}
        <button
          onClick={toggleAudio}
          className={`w-12 h-12 rounded-full ${isAudioEnabled ? 'bg-white/10 hover:bg-white/20 text-white/90' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'} transition-all flex items-center justify-center border border-white/5`}
          title={isAudioEnabled ? 'Mute' : 'Unmute'}
        >
          {isAudioEnabled ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
            </svg>
          )}
        </button>

        {/* Video Toggle */}
        {!isVoiceMode && (
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full ${isVideoEnabled ? 'bg-white/10 hover:bg-white/20 text-white/90' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'} transition-all flex items-center justify-center border border-white/5`}
            title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {isVideoEnabled ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z" />
              </svg>
            )}
          </button>
        )}

        {/* Chat Toggle Button (Patient Only) */}
        {user?.role === 'patient' && (
          <button
            onClick={() => setShowChat(!showChat)}
            className={`relative w-12 h-12 rounded-full ${showChat ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white/90'} transition-all flex items-center justify-center border border-white/5`}
            title="Chat"
          >
            {hasUnreadMessages && (
              <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.582-1.033A11.196 11.196 0 0012 21c5.523 0 10-4.03 10-9s-4.477-9-10-9-10 4.03-10 9c0 2.274.938 4.35 2.479 5.91a8.558 8.558 0 01-1.398 3.59.75.75 0 00.932 1.077c1.479-.817 2.42-1.488 2.791-1.933z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Session Tools Toggle Button (Doctor Only) */}
        {user?.role === 'doctor' && (
          <button
            onClick={() => setShowDoctorPanel(!showDoctorPanel)}
            className={`relative w-12 h-12 rounded-full ${showDoctorPanel ? 'bg-white/20 text-white' : 'bg-white/10 hover:bg-white/20 text-white/90'} transition-all flex items-center justify-center border border-white/5`}
            title="Session Tools"
          >
            {hasUnreadMessages && (
              <span className="absolute top-0 right-0 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
            )}
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </button>
        )}

        <div className="w-[1px] h-8 bg-white/10 mx-2"></div>

        {/* End Call Button */}
        <button
          onClick={() => {
            if (remoteUserJoined) {
              requestEndSession();
            } else {
              endCall('user_clicked_end');
            }
          }}
          className="w-16 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          title="End call"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
          </svg>
        </button>
      </div>

      {/* Emergency Contact Modal (Patient Only) */}
      {showEmergencyModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-[200] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-teal-600 p-8 text-white relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold font-serif mb-2">Safety First</h2>
              <p className="text-teal-100/80 text-sm leading-relaxed">
                Please provide an emergency contact before we begin your session.
              </p>
            </div>

            <form onSubmit={saveEmergencyContact} className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 transition-colors group-focus-within:text-teal-600">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newEmergencyContact.name}
                    onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, name: e.target.value })}
                    className="w-full bg-gray-50 border-gray-200 border-2 rounded-2xl px-5 py-4 focus:border-teal-500 focus:bg-white focus:outline-none transition-all font-medium text-gray-800"
                    placeholder="e.g. Spouse, Parent, Friend"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                    Contact Phone
                  </label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold border-r pr-3 mr-3 border-gray-200">+91</span>
                    <input
                      type="tel"
                      required
                      pattern="[0-9]{10}"
                      value={newEmergencyContact.phone}
                      onChange={(e) => setNewEmergencyContact({ ...newEmergencyContact, phone: e.target.value })}
                      className="w-full bg-gray-50 border-gray-200 border-2 rounded-2xl pl-20 pr-5 py-4 focus:border-teal-500 focus:bg-white focus:outline-none transition-all font-medium text-gray-800"
                      placeholder="1234567890"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingContact}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-5 rounded-2xl shadow-lg shadow-teal-600/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 active:shadow-inner disabled:opacity-50"
              >
                {savingContact ? 'Saving Profile...' : 'Start Session Safely'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCallRoom;
