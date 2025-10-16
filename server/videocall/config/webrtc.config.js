/**
 * WebRTC Configuration for Veraawell Video Calls
 * Contains ICE servers, TURN servers, and WebRTC settings
 */

const webrtcConfig = {
  // ICE Servers configuration
  iceServers: [
    // Google STUN servers (free)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // Backup STUN servers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    
    // TURN servers (replace with your own in production)
    {
      urls: 'turn:your-turn-server.com:3478',
      username: process.env.TURN_USERNAME || 'demo-user',
      credential: process.env.TURN_PASSWORD || 'demo-pass'
    }
  ],
  
  // WebRTC connection constraints
  connectionConstraints: {
    optional: [
      { DtlsSrtpKeyAgreement: true },
      { RtpDataChannels: true }
    ]
  },
  
  // Media constraints for video/audio
  mediaConstraints: {
    video: {
      width: { min: 320, ideal: 1280, max: 1920 },
      height: { min: 240, ideal: 720, max: 1080 },
      frameRate: { min: 15, ideal: 30, max: 60 },
      facingMode: 'user' // Front camera for therapy sessions
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100
    }
  },
  
  // Screen sharing constraints
  screenShareConstraints: {
    video: {
      cursor: 'always',
      displaySurface: 'monitor'
    },
    audio: true
  },
  
  // Connection timeout settings
  timeouts: {
    connectionTimeout: 30000, // 30 seconds
    reconnectTimeout: 5000,   // 5 seconds
    maxReconnectAttempts: 5
  },
  
  // Data channel configuration
  dataChannelConfig: {
    ordered: true,
    maxRetransmits: 3
  }
};

// Room configuration
const roomConfig = {
  maxParticipants: 2, // Patient + Doctor only
  sessionTimeout: 3600000, // 1 hour max session
  recordingEnabled: false, // Default recording off (requires consent)
  
  // Room security settings
  security: {
    requireAuth: true,
    allowGuestAccess: false,
    encryptionRequired: true
  }
};

// Socket.IO configuration
const socketConfig = {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  },
  
  // Connection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  
  // Namespace for video calls
  namespace: '/videocall'
};

module.exports = {
  webrtcConfig,
  roomConfig,
  socketConfig
};
