/**
 * WebRTC Signaling Socket Handler
 * Manages peer-to-peer connection establishment and signaling
 */

const VideoCallSession = require('../models/VideoCallSession');
const VideoCallRoom = require('../models/VideoCallRoom');
const { validateJWT } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

class SignalingSocket {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // In-memory room state
    this.users = new Map(); // Connected users
    
    this.setupSocketHandlers();
  }
  
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`New socket connection: ${socket.id}`);
      
      // Authentication middleware
      socket.use(async (packet, next) => {
        try {
          const token = socket.handshake.auth.token;
          const user = await validateJWT(token);
          socket.userId = user.id;
          socket.userRole = user.role;
          next();
        } catch (error) {
          next(new Error('Authentication failed'));
        }
      });
      
      // Store user connection
      this.users.set(socket.userId, {
        socketId: socket.id,
        userId: socket.userId,
        role: socket.userRole,
        joinedAt: new Date()
      });
      
      // Socket event handlers
      this.handleJoinRoom(socket);
      this.handleLeaveRoom(socket);
      this.handleWebRTCSignaling(socket);
      this.handleScreenShare(socket);
      this.handleChatMessage(socket);
      this.handleConnectionQuality(socket);
      this.handleDisconnection(socket);
    });
  }
  
  handleJoinRoom(socket) {
    socket.on('join-room', async (data) => {
      try {
        const { roomId, deviceInfo } = data;
        
        // Validate room access
        const room = await VideoCallRoom.findOne({ roomId, status: 'active' });
        if (!room) {
          socket.emit('error', { message: 'Room not found or inactive' });
          return;
        }
        
        if (!room.isUserAllowed(socket.userId)) {
          socket.emit('error', { message: 'Access denied to this room' });
          return;
        }
        
        // Check room capacity
        const currentParticipants = this.getRoomParticipants(roomId);
        if (currentParticipants.length >= room.settings.maxParticipants) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }
        
        // Join socket room
        socket.join(roomId);
        socket.currentRoom = roomId;
        
        // Update room state
        if (!this.rooms.has(roomId)) {
          this.rooms.set(roomId, {
            participants: new Map(),
            createdAt: new Date(),
            settings: room.settings
          });
        }
        
        const roomState = this.rooms.get(roomId);
        roomState.participants.set(socket.userId, {
          socketId: socket.id,
          userId: socket.userId,
          role: socket.userRole,
          deviceInfo,
          joinedAt: new Date(),
          connectionQuality: 'good'
        });
        
        // Find or create session
        let session = await VideoCallSession.findActiveSession(roomId);
        if (!session) {
          session = new VideoCallSession({
            sessionId: this.generateSessionId(),
            roomId,
            scheduledStartTime: new Date(),
            actualStartTime: new Date(),
            status: 'active'
          });
          await session.save();
        }
        
        // Add participant to session
        await session.addParticipant(socket.userId, socket.userRole, deviceInfo);
        
        // Notify existing participants
        socket.to(roomId).emit('user-joined', {
          userId: socket.userId,
          role: socket.userRole,
          deviceInfo
        });
        
        // Send room state to new participant
        const participants = Array.from(roomState.participants.values())
          .filter(p => p.userId !== socket.userId);
        
        socket.emit('room-joined', {
          roomId,
          sessionId: session.sessionId,
          participants,
          roomSettings: room.settings,
          userPermissions: room.getUserPermissions(socket.userId)
        });
        
        logger.info(`User ${socket.userId} joined room ${roomId}`);
        
      } catch (error) {
        logger.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });
  }
  
  handleLeaveRoom(socket) {
    socket.on('leave-room', async () => {
      await this.leaveCurrentRoom(socket);
    });
  }
  
  async leaveCurrentRoom(socket) {
    if (!socket.currentRoom) return;
    
    try {
      const roomId = socket.currentRoom;
      const roomState = this.rooms.get(roomId);
      
      if (roomState) {
        roomState.participants.delete(socket.userId);
        
        // If room is empty, clean up
        if (roomState.participants.size === 0) {
          this.rooms.delete(roomId);
          
          // End session
          const session = await VideoCallSession.findActiveSession(roomId);
          if (session) {
            session.status = 'ended';
            session.endTime = new Date();
            await session.save();
          }
        }
      }
      
      // Update session
      const session = await VideoCallSession.findActiveSession(roomId);
      if (session) {
        await session.removeParticipant(socket.userId);
      }
      
      // Notify other participants
      socket.to(roomId).emit('user-left', {
        userId: socket.userId
      });
      
      socket.leave(roomId);
      socket.currentRoom = null;
      
      logger.info(`User ${socket.userId} left room ${roomId}`);
      
    } catch (error) {
      logger.error('Error leaving room:', error);
    }
  }
  
  handleWebRTCSignaling(socket) {
    // Offer handling
    socket.on('webrtc-offer', (data) => {
      const { targetUserId, offer, sessionDescription } = data;
      const targetUser = this.users.get(targetUserId);
      
      if (targetUser) {
        this.io.to(targetUser.socketId).emit('webrtc-offer', {
          fromUserId: socket.userId,
          offer,
          sessionDescription
        });
        
        logger.debug(`WebRTC offer sent from ${socket.userId} to ${targetUserId}`);
      }
    });
    
    // Answer handling
    socket.on('webrtc-answer', (data) => {
      const { targetUserId, answer, sessionDescription } = data;
      const targetUser = this.users.get(targetUserId);
      
      if (targetUser) {
        this.io.to(targetUser.socketId).emit('webrtc-answer', {
          fromUserId: socket.userId,
          answer,
          sessionDescription
        });
        
        logger.debug(`WebRTC answer sent from ${socket.userId} to ${targetUserId}`);
      }
    });
    
    // ICE candidate handling
    socket.on('webrtc-ice-candidate', (data) => {
      const { targetUserId, candidate } = data;
      const targetUser = this.users.get(targetUserId);
      
      if (targetUser) {
        this.io.to(targetUser.socketId).emit('webrtc-ice-candidate', {
          fromUserId: socket.userId,
          candidate
        });
      }
    });
    
    // Connection state updates
    socket.on('webrtc-connection-state', async (data) => {
      const { state, targetUserId } = data;
      
      if (socket.currentRoom) {
        const session = await VideoCallSession.findActiveSession(socket.currentRoom);
        if (session) {
          session.technical.iceConnectionState = state;
          await session.save();
        }
      }
      
      // Notify target user
      if (targetUserId) {
        const targetUser = this.users.get(targetUserId);
        if (targetUser) {
          this.io.to(targetUser.socketId).emit('peer-connection-state', {
            fromUserId: socket.userId,
            state
          });
        }
      }
    });
  }
  
  handleScreenShare(socket) {
    socket.on('start-screen-share', (data) => {
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('screen-share-started', {
          userId: socket.userId,
          streamId: data.streamId
        });
      }
    });
    
    socket.on('stop-screen-share', () => {
      if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('screen-share-stopped', {
          userId: socket.userId
        });
      }
    });
  }
  
  handleChatMessage(socket) {
    socket.on('chat-message', async (data) => {
      if (!socket.currentRoom) return;
      
      const { message, timestamp } = data;
      
      // Validate message
      if (!message || message.trim().length === 0) return;
      if (message.length > 1000) return; // Message too long
      
      const chatData = {
        userId: socket.userId,
        message: message.trim(),
        timestamp: timestamp || new Date(),
        messageId: this.generateMessageId()
      };
      
      // Broadcast to room
      this.io.to(socket.currentRoom).emit('chat-message', chatData);
      
      // Log chat message (for compliance)
      const session = await VideoCallSession.findActiveSession(socket.currentRoom);
      if (session) {
        await session.addAuditLog('chat-message', socket.userId, `Message: ${message.substring(0, 50)}...`);
      }
    });
  }
  
  handleConnectionQuality(socket) {
    socket.on('connection-quality', async (data) => {
      const { quality, stats } = data;
      
      if (socket.currentRoom) {
        const roomState = this.rooms.get(socket.currentRoom);
        if (roomState && roomState.participants.has(socket.userId)) {
          const participant = roomState.participants.get(socket.userId);
          participant.connectionQuality = quality;
        }
        
        // Update session
        const session = await VideoCallSession.findActiveSession(socket.currentRoom);
        if (session) {
          await session.updateConnectionQuality(socket.userId, quality);
        }
        
        // Notify other participants
        socket.to(socket.currentRoom).emit('peer-quality-update', {
          userId: socket.userId,
          quality,
          stats
        });
      }
    });
  }
  
  handleDisconnection(socket) {
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.id}`);
      
      // Clean up user connection
      this.users.delete(socket.userId);
      
      // Leave current room
      await this.leaveCurrentRoom(socket);
    });
  }
  
  // Utility methods
  getRoomParticipants(roomId) {
    const roomState = this.rooms.get(roomId);
    return roomState ? Array.from(roomState.participants.values()) : [];
  }
  
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
  
  generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
}

module.exports = SignalingSocket;
