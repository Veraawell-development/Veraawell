// Socket.IO handler for WebRTC video calling with comprehensive logging
const Session = require('./models/session');
const jwt = require('jsonwebtoken');
const { getJWTSecret } = require('./config/auth');
const { createLogger } = require('./utils/logger');

const logger = createLogger('SOCKET-HANDLER');

// Store active rooms and users
const activeRooms = new Map(); // roomId -> { users: Map<userId, {role, socketId}>, createdAt: Date }
const userSockets = new Map(); // userId -> socketId

// JWT verification middleware for Socket.IO
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token;
  
  logger.debug('Authentication attempt', {
    hasToken: !!token,
    socketId: socket.id
  });
  
  if (!token) {
    logger.error('No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const JWT_SECRET = getJWTSecret(); // Use config module - no hardcoded fallback
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = {
      id: decoded.userId,
      role: decoded.role,
      username: decoded.username
    };
    logger.debug('Authentication successful', {
      userId: decoded.userId?.substring(0, 8) + '...',
      role: decoded.role
    });
    next();
  } catch (error) {
    logger.error('Token verification failed', { error: error.message });
    next(new Error('Authentication error: Invalid token'));
  }
};

// Use existing logger
const log = logger;

module.exports = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { id: userId, role, username } = socket.user || {};
    log.info('New socket connection', { socketId: socket.id, userId, role });

    // Handle disconnection
    socket.on('disconnect', async () => {
      log.info('User disconnected', { userId, role, sessionId: socket.roomId });
      if (socket.roomId && activeRooms.has(socket.roomId)) {
        const room = activeRooms.get(socket.roomId);
        if (room.users.has(userId)) {
          room.users.delete(userId);
          // Notify other users in the room
          socket.to(socket.roomId).emit('user-left', { userId, role });
          log.info('User left room', { userId, role, sessionId: socket.roomId });
          
          // Update call tracking when ANY user leaves
          // Mark session as completed immediately when last user leaves
          if (room.users.size === 0) {
            try {
              const session = await Session.findById(socket.roomId);
              if (session && session.callStatus === 'in-progress') {
                session.callEndTime = new Date();
                session.callStatus = 'completed';
                // Calculate actual duration in minutes (minimum 1 minute)
                if (session.callStartTime) {
                  const durationMs = session.callEndTime - session.callStartTime;
                  session.actualDuration = Math.max(1, Math.round(durationMs / 60000));
                } else {
                  session.actualDuration = 1; // Default to 1 minute if no start time
                }
                session.status = 'completed';
                await session.save();
                log.info('Call ended and tracked', { 
                  sessionId: socket.roomId.substring(0, 8),
                  duration: session.actualDuration
                });
              }
            } catch (error) {
              log.error('Failed to update call tracking', { error: error.message });
            }
          }
          
          // Clean up empty rooms
          if (room.users.size === 0) {
            activeRooms.delete(socket.roomId);
            log.info('Room cleaned up', { roomId: socket.roomId });
          }
        }
      }
      userSockets.delete(userId);
    });

    // Join video call room
    socket.on('join-room', async ({ sessionId }) => {
      try {
        if (!userId || !role) {
          throw new Error('User not authenticated');
        }

        log.info('User joining room', { userId, role, sessionId });

        // Verify session exists
        const session = await Session.findById(sessionId);
        if (!session) {
          log.error('Session not found', { sessionId });
          return socket.emit('error', { message: 'Session not found' });
        }

        // Update call tracking - mark call as started
        // Handle undefined/null callStatus from old sessions
        if (!session.callStatus || session.callStatus === 'not-started') {
          session.callStatus = 'in-progress';
          session.callStartTime = new Date();
          await session.save();
          log.info('Call started', { sessionId: sessionId.substring(0, 8) });
        }

        // Verify user authorization
        const patientId = session.patientId?.toString();
        const doctorId = session.doctorId?.toString();
        
        // Debug: Log full IDs for comparison
        console.log('[AUTH-DEBUG] Full ID comparison:', {
          userId: userId,
          patientId: patientId,
          doctorId: doctorId,
          sessionType: session.sessionType
        });
        
        // For immediate sessions, allow if user is patient OR if doctorId is null (self-session)
        const isPatient = userId === patientId;
        const isDoctor = doctorId && userId === doctorId;
        // For immediate sessions, allow anyone to join (open session)
        const isImmediateSession = session.sessionType === 'immediate';
        
        const isAuthorized = isPatient || isDoctor || isImmediateSession;

        if (!isAuthorized) {
          log.error('Unauthorized join attempt', { 
            userId: userId.substring(0, 8), 
            patientId: patientId?.substring(0, 8) || 'null',
            doctorId: doctorId?.substring(0, 8) || 'null',
            sessionId: sessionId.substring(0, 8),
            sessionType: session.sessionType
          });
          socket.emit('error', { message: 'Not authorized to join this session' });
          return;
        }
        
        log.info('User authorized for video call', {
          userId: userId.substring(0, 8),
          role: isPatient ? 'patient' : (isDoctor ? 'doctor' : 'self-session'),
          sessionType: session.sessionType
        });

        // Leave any existing room
        if (socket.roomId) {
          socket.leave(socket.roomId);
          log.info('User left previous room', { userId, role, sessionId: socket.roomId });
        }

        // Join the new room
        socket.join(sessionId);
        socket.roomId = sessionId;
        userSockets.set(userId, socket.id);

        // Initialize room if doesn't exist
        if (!activeRooms.has(sessionId)) {
          activeRooms.set(sessionId, {
            users: new Map(),
            createdAt: new Date()
          });
          log.info('Room created', { sessionId });
        }

        const room = activeRooms.get(sessionId);
        room.users.set(userId, { role, socketId: socket.id });

        log.info(`${role.toUpperCase()} joined room`, {
          sessionId: sessionId.substring(0, 8),
          userId: userId.substring(0, 8),
          totalUsers: room.users.size
        });

        // Notify the user about successful room join
        socket.emit('room-joined', {
          sessionId,
          userId,
          role,
          otherUsers: Array.from(room.users.entries())
            .filter(([id]) => id !== userId)
            .map(([id, user]) => ({ userId: id, role: user.role })),
          userCount: room.users.size,
          timestamp: new Date().toISOString()
        });

        // Notify others in the room
        socket.to(sessionId).emit('user-joined', {
          userId,
          role,
          timestamp: new Date().toISOString()
        });

        log.info(`Active users in room ${sessionId.substring(0, 8)}:`, {
          count: room.users.size,
          users: Array.from(room.users.keys()).map(id => id.substring(0, 8))
        });

      } catch (error) {
        log.error('Error joining room', { error: error.message, sessionId });
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // WebRTC Signaling: Send offer
    socket.on('offer', ({ sessionId, offer, targetUserId }) => {
      log.info('Offer received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8),
        to: targetUserId?.substring(0, 8)
      });

      socket.to(sessionId).emit('offer', {
        offer,
        senderId: socket.id
      });
    });

    // WebRTC Signaling: Send answer
    socket.on('answer', ({ sessionId, answer, targetUserId }) => {
      log.info('Answer received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8),
        to: targetUserId?.substring(0, 8)
      });

      socket.to(sessionId).emit('answer', {
        answer,
        senderId: socket.id
      });
    });

    // WebRTC Signaling: ICE candidate
    socket.on('ice-candidate', ({ sessionId, candidate }) => {
      log.info('ICE candidate received', {
        sessionId: sessionId.substring(0, 8),
        from: socket.id.substring(0, 8)
      });

      socket.to(sessionId).emit('ice-candidate', {
        candidate,
        senderId: socket.id
      });
    });

    // Media state change (mute/unmute, video on/off)
    socket.on('media-state-change', ({ sessionId, video, audio }) => {
      log.info('Media state change', {
        sessionId: sessionId.substring(0, 8),
        userId: userId.substring(0, 8),
        video,
        audio
      });
      
      // Broadcast media state to other users in the room
      socket.to(sessionId).emit('media-state-change', {
        userId,
        video,
        audio
      });
    });

    // User leaving room
    socket.on('leave-room', ({ sessionId, userId, role }) => {
      handleUserLeave(socket, sessionId, userId, role);
    });

    // Note: Main disconnect handler is above (lines 73-118)
    // This duplicate handler has been removed to prevent conflicts
  });

  // Helper function to handle user leaving
  function handleUserLeave(socket, sessionId, userId, role) {
    const room = activeRooms.get(sessionId);
    if (room) {
      room.users.delete(userId);
      
      log.info('User left room', { userId, role, sessionId });
      log.info(`Remaining users in room ${sessionId?.substring(0, 8) || 'unknown'}:`, {
        count: room.users.size
      });

      // Notify others
      socket.to(sessionId).emit('user-left', {
        userId,
        role,
        timestamp: new Date().toISOString()
      });

      // Clean up empty rooms
      if (room.users.size === 0) {
        activeRooms.delete(sessionId);
        log.info('Room closed (empty)', { sessionId: sessionId.substring(0, 8) });
      }
    }

    socket.leave(sessionId);
    userSockets.delete(userId);
  }

  // Log active rooms every 30 seconds
  setInterval(() => {
    if (activeRooms.size > 0) {
      log.info('Active video call rooms', {
        totalRooms: activeRooms.size,
        rooms: Array.from(activeRooms.entries()).map(([id, room]) => ({
          sessionId: id.substring(0, 8),
          users: room.users.size,
          duration: Math.floor((Date.now() - room.createdAt) / 1000) + 's'
        }))
      });
    }
  }, 30000);
};
