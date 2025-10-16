/**
 * WebRTC Service
 * Handles WebRTC connection management, signaling, and peer connections
 */

const { webrtcConfig } = require('../config/webrtc.config');
const logger = require('../utils/logger');
const { validateICECandidate, validateSDP } = require('../utils/security');

class WebRTCService {
  constructor() {
    this.activePeerConnections = new Map();
    this.signalingQueue = new Map();
    this.connectionStats = new Map();
  }
  
  /**
   * Create a new peer connection configuration
   */
  createPeerConnectionConfig(roomId, userId) {
    const config = {
      iceServers: webrtcConfig.iceServers,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceTransportPolicy: 'all'
    };
    
    logger.webrtcLog('peer-connection-config-created', null, userId, {
      roomId,
      iceServersCount: config.iceServers.length
    });
    
    return config;
  }
  
  /**
   * Process WebRTC offer
   */
  async processOffer(sessionId, fromUserId, toUserId, offer) {
    try {
      // Validate SDP
      if (!validateSDP(offer)) {
        throw new Error('Invalid SDP offer format');
      }
      
      // Store offer in signaling queue
      const signalingKey = `${sessionId}-${fromUserId}-${toUserId}`;
      
      if (!this.signalingQueue.has(signalingKey)) {
        this.signalingQueue.set(signalingKey, {
          offers: [],
          answers: [],
          iceCandidates: []
        });
      }
      
      const signaling = this.signalingQueue.get(signalingKey);
      signaling.offers.push({
        offer,
        timestamp: new Date(),
        processed: false
      });
      
      logger.webrtcLog('offer-processed', sessionId, fromUserId, {
        toUserId,
        sdpType: offer.type,
        sdpSize: offer.sdp.length
      });
      
      return {
        success: true,
        signalingKey,
        queueSize: signaling.offers.length
      };
      
    } catch (error) {
      logger.error('Error processing WebRTC offer', {
        sessionId,
        fromUserId,
        toUserId,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Process WebRTC answer
   */
  async processAnswer(sessionId, fromUserId, toUserId, answer) {
    try {
      // Validate SDP
      if (!validateSDP(answer)) {
        throw new Error('Invalid SDP answer format');
      }
      
      const signalingKey = `${sessionId}-${toUserId}-${fromUserId}`; // Note: reversed order
      
      if (!this.signalingQueue.has(signalingKey)) {
        throw new Error('No corresponding offer found for this answer');
      }
      
      const signaling = this.signalingQueue.get(signalingKey);
      signaling.answers.push({
        answer,
        timestamp: new Date(),
        processed: false
      });
      
      logger.webrtcLog('answer-processed', sessionId, fromUserId, {
        toUserId,
        sdpType: answer.type,
        sdpSize: answer.sdp.length
      });
      
      return {
        success: true,
        signalingKey,
        queueSize: signaling.answers.length
      };
      
    } catch (error) {
      logger.error('Error processing WebRTC answer', {
        sessionId,
        fromUserId,
        toUserId,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Process ICE candidate
   */
  async processICECandidate(sessionId, fromUserId, toUserId, candidate) {
    try {
      // Validate ICE candidate
      if (!validateICECandidate(candidate)) {
        throw new Error('Invalid ICE candidate format');
      }
      
      const signalingKey = `${sessionId}-${fromUserId}-${toUserId}`;
      
      if (!this.signalingQueue.has(signalingKey)) {
        this.signalingQueue.set(signalingKey, {
          offers: [],
          answers: [],
          iceCandidates: []
        });
      }
      
      const signaling = this.signalingQueue.get(signalingKey);
      signaling.iceCandidates.push({
        candidate,
        timestamp: new Date(),
        processed: false
      });
      
      logger.webrtcLog('ice-candidate-processed', sessionId, fromUserId, {
        toUserId,
        candidateType: this.extractCandidateType(candidate.candidate),
        protocol: this.extractProtocol(candidate.candidate)
      });
      
      return {
        success: true,
        signalingKey,
        queueSize: signaling.iceCandidates.length
      };
      
    } catch (error) {
      logger.error('Error processing ICE candidate', {
        sessionId,
        fromUserId,
        toUserId,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Get media constraints based on session type and user preferences
   */
  getMediaConstraints(sessionType = 'therapy', quality = 'high') {
    const baseConstraints = { ...webrtcConfig.mediaConstraints };
    
    // Adjust constraints based on session type
    switch (sessionType) {
      case 'therapy':
        // High quality for therapy sessions
        baseConstraints.video.width = { ideal: 1280, max: 1920 };
        baseConstraints.video.height = { ideal: 720, max: 1080 };
        baseConstraints.video.frameRate = { ideal: 30 };
        break;
        
      case 'consultation':
        // Medium quality for consultations
        baseConstraints.video.width = { ideal: 960, max: 1280 };
        baseConstraints.video.height = { ideal: 540, max: 720 };
        baseConstraints.video.frameRate = { ideal: 24 };
        break;
        
      case 'emergency':
        // Lower quality for emergency calls (faster connection)
        baseConstraints.video.width = { ideal: 640, max: 960 };
        baseConstraints.video.height = { ideal: 360, max: 540 };
        baseConstraints.video.frameRate = { ideal: 15 };
        break;
    }
    
    // Adjust based on quality setting
    if (quality === 'low') {
      baseConstraints.video.width = { ideal: 320, max: 640 };
      baseConstraints.video.height = { ideal: 240, max: 360 };
      baseConstraints.video.frameRate = { ideal: 15, max: 24 };
    }
    
    return baseConstraints;
  }
  
  /**
   * Get screen sharing constraints
   */
  getScreenShareConstraints() {
    return {
      ...webrtcConfig.screenShareConstraints,
      video: {
        ...webrtcConfig.screenShareConstraints.video,
        width: { ideal: 1920, max: 3840 },
        height: { ideal: 1080, max: 2160 },
        frameRate: { ideal: 15, max: 30 }
      }
    };
  }
  
  /**
   * Track connection statistics
   */
  updateConnectionStats(sessionId, userId, stats) {
    const key = `${sessionId}-${userId}`;
    
    if (!this.connectionStats.has(key)) {
      this.connectionStats.set(key, {
        userId,
        sessionId,
        startTime: new Date(),
        updates: []
      });
    }
    
    const connectionStat = this.connectionStats.get(key);
    connectionStat.updates.push({
      timestamp: new Date(),
      ...stats
    });
    
    // Keep only last 100 updates to prevent memory issues
    if (connectionStat.updates.length > 100) {
      connectionStat.updates = connectionStat.updates.slice(-100);
    }
    
    // Log significant changes
    this.analyzeConnectionQuality(connectionStat);
    
    return connectionStat;
  }
  
  /**
   * Analyze connection quality and log issues
   */
  analyzeConnectionQuality(connectionStat) {
    const recent = connectionStat.updates.slice(-5); // Last 5 updates
    
    if (recent.length < 2) return;
    
    // Check for packet loss
    const avgPacketLoss = recent.reduce((sum, stat) => 
      sum + (stat.packetsLost || 0), 0) / recent.length;
    
    if (avgPacketLoss > 5) { // More than 5% packet loss
      logger.warn('High packet loss detected', {
        sessionId: connectionStat.sessionId,
        userId: connectionStat.userId,
        avgPacketLoss,
        component: 'connection-quality'
      });
    }
    
    // Check for low bitrate
    const avgBitrate = recent.reduce((sum, stat) => 
      sum + (stat.bitrate || 0), 0) / recent.length;
    
    if (avgBitrate < 100000) { // Less than 100kbps
      logger.warn('Low bitrate detected', {
        sessionId: connectionStat.sessionId,
        userId: connectionStat.userId,
        avgBitrate,
        component: 'connection-quality'
      });
    }
    
    // Check for high RTT
    const avgRTT = recent.reduce((sum, stat) => 
      sum + (stat.rtt || 0), 0) / recent.length;
    
    if (avgRTT > 500) { // More than 500ms RTT
      logger.warn('High RTT detected', {
        sessionId: connectionStat.sessionId,
        userId: connectionStat.userId,
        avgRTT,
        component: 'connection-quality'
      });
    }
  }
  
  /**
   * Get connection quality assessment
   */
  getConnectionQuality(sessionId, userId) {
    const key = `${sessionId}-${userId}`;
    const connectionStat = this.connectionStats.get(key);
    
    if (!connectionStat || connectionStat.updates.length === 0) {
      return { quality: 'unknown', reason: 'No statistics available' };
    }
    
    const recent = connectionStat.updates.slice(-3);
    const latest = recent[recent.length - 1];
    
    // Calculate quality score (0-100)
    let score = 100;
    
    // Packet loss penalty
    if (latest.packetsLost > 0) {
      score -= Math.min(latest.packetsLost * 10, 50);
    }
    
    // RTT penalty
    if (latest.rtt > 100) {
      score -= Math.min((latest.rtt - 100) / 10, 30);
    }
    
    // Bitrate penalty
    if (latest.bitrate < 500000) {
      score -= Math.min((500000 - latest.bitrate) / 10000, 20);
    }
    
    // Determine quality level
    let quality;
    if (score >= 80) quality = 'excellent';
    else if (score >= 60) quality = 'good';
    else if (score >= 40) quality = 'fair';
    else quality = 'poor';
    
    return {
      quality,
      score: Math.max(0, Math.round(score)),
      stats: latest,
      timestamp: new Date()
    };
  }
  
  /**
   * Clean up signaling data for ended session
   */
  cleanupSession(sessionId) {
    const keysToDelete = [];
    
    for (const [key, value] of this.signalingQueue.entries()) {
      if (key.startsWith(sessionId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.signalingQueue.delete(key);
    });
    
    // Clean up connection stats
    for (const [key, value] of this.connectionStats.entries()) {
      if (value.sessionId === sessionId) {
        this.connectionStats.delete(key);
      }
    }
    
    logger.webrtcLog('session-cleanup', sessionId, null, {
      signalingKeysRemoved: keysToDelete.length,
      component: 'cleanup'
    });
  }
  
  /**
   * Extract candidate type from ICE candidate string
   */
  extractCandidateType(candidateStr) {
    const match = candidateStr.match(/typ (\w+)/);
    return match ? match[1] : 'unknown';
  }
  
  /**
   * Extract protocol from ICE candidate string
   */
  extractProtocol(candidateStr) {
    const match = candidateStr.match(/(\w+) \d+/);
    return match ? match[1].toLowerCase() : 'unknown';
  }
  
  /**
   * Get WebRTC statistics summary
   */
  getStatsSummary() {
    return {
      activeConnections: this.connectionStats.size,
      signalingQueues: this.signalingQueue.size,
      totalSignalingMessages: Array.from(this.signalingQueue.values())
        .reduce((sum, queue) => 
          sum + queue.offers.length + queue.answers.length + queue.iceCandidates.length, 0)
    };
  }
}

module.exports = new WebRTCService();
