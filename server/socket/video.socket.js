/**
 * Video Socket Handler
 * Handles WebRTC signaling for video/audio calls.
 * Manages room creation, user join/leave, and call tracking.
 */
// Socket.IO handler for WebRTC video calling with comprehensive logging
const Session = require('../models/session');
const jwt = require('jsonwebtoken');
const { getJWTSecret } = require('../config/auth');
const { createLogger } = require('../utils/logger');

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
        if (room.users.has(socket.id)) {
          room.users.delete(socket.id);
          // Notify other users in the room
          socket.to(socket.roomId).emit('user-left', { userId, role });
          log.info('User socket left room', { socketId: socket.id, userId, role, sessionId: socket.roomId });
          
          const uniqueUsers = new Set(Array.from(room.users.values()).map(u => u.userId)).size;
          // Mark session as completed immediately when last user leaves
          if (uniqueUsers === 0) {
            try {
              const session = await Session.findById(socket.roomId);
              if (session && session.callStatus === 'in-progress') {
                session.callEndTime = new Date();
                
                // Calculate used minutes purely based on the synchronized remaining seconds memory!
                // This ignores any paused time accurately.
                const sessionDurationInMinutes = session.duration || 60;
                let usedMinutes = 0;
                
                if (room.remainingSeconds !== undefined) {
                  usedMinutes = sessionDurationInMinutes - Math.ceil(room.remainingSeconds / 60);
                } else if (session.callStartTime) {
                  const durationMs = session.callEndTime - session.callStartTime;
                  usedMinutes = Math.max(1, Math.round(durationMs / 60000));
                }
                
                // Update duration (max it at session duration)
                session.actualDuration = Math.max(0, Math.min(sessionDurationInMinutes, usedMinutes));
                
                // Check if session is actually completed (time is up)
                if (session.actualDuration >= session.duration) {
                  session.callStatus = 'completed';
                  session.status = 'completed';
                } else {
                  session.callStatus = 'paused';
                  // Keep status as 'scheduled' so they can rejoin!
                  session.status = 'scheduled';
                }
                
                await session.save();
                log.info('Call paused or completed', { 
                  sessionId: socket.roomId.substring(0, 8),
                  duration: session.actualDuration,
                  status: session.status
                });
              }
            } catch (error) {
              log.error('Failed to update call tracking', { error: error.message });
            }
          }
          
          // Clean up empty rooms
          if (uniqueUsers === 0) {
            if (room.timerInterval) {
              clearInterval(room.timerInterval);
            }
            activeRooms.delete(socket.roomId);
            log.info('Room cleaned up and timer stopped', { roomId: socket.roomId });
          } else if (uniqueUsers < 2 && room.timerInterval) {
            // Pause timer if users drop below 2
            clearInterval(room.timerInterval);
            room.timerInterval = null;
            log.info('Timer paused due to unique users < 2', { roomId: socket.roomId });
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

        // Update call tracking - mark call as started or resumed
        // Handle undefined/null callStatus from old sessions
        if (!session.callStatus || session.callStatus === 'not-started' || session.callStatus === 'paused') {
          session.callStatus = 'in-progress';
          session.callStartTime = new Date();
          await session.save();
          log.info('Call started or resumed', { sessionId: sessionId.substring(0, 8) });
        }

        // Verify user authorization
        const patientId = session.patientId?.toString();
        const doctorId = session.doctorId?.toString();
        
        // Debug: Full ID comparison for authorization check
        logger.debug('Authorization check', {
          userId: userId?.substring(0, 8),
          patientId: patientId?.substring(0, 8),
          doctorId: doctorId?.substring(0, 8),
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
          // Calculate initial remaining seconds
          const sessionDurationInMinutes = session.duration || 60;
          const actualDurationInMinutes = session.actualDuration || 0;
          let remainingSeconds = Math.max(0, sessionDurationInMinutes * 60 - actualDurationInMinutes * 60);

          if (session.sessionType === 'immediate' && remainingSeconds <= 0) {
             remainingSeconds = sessionDurationInMinutes * 60;
          }

          activeRooms.set(sessionId, {
            users: new Map(),
            createdAt: new Date(),
            timerInterval: null, // Timer starts when both join
            remainingSeconds: remainingSeconds
          });
          log.info('Room created (timer waiting for 2nd user)', { sessionId, remainingSeconds });
        } else {
          // If room already exists, instantly send the current synchronized time to the newly joined user
          const existingRoom = activeRooms.get(sessionId);
          if (existingRoom) {
            socket.emit('timer-sync', { remainingSeconds: existingRoom.remainingSeconds });
          }
        }

        const room = activeRooms.get(sessionId);
        room.users.set(socket.id, { userId, role });

        const uniqueUsers = new Set(Array.from(room.users.values()).map(u => u.userId)).size;

        // START TIMER IF BOTH JOINED
        if (uniqueUsers >= 2 && !room.timerInterval) {
          log.info('Both users joined, starting timer engine', { sessionId });
          room.timerInterval = setInterval(async () => {
            const currentRoom = activeRooms.get(sessionId);
            const currentUniqueUsers = currentRoom ? new Set(Array.from(currentRoom.users.values()).map(u => u.userId)).size : 0;
            
            if (!currentRoom || currentUniqueUsers < 2) {
              // Pause if someone leaves
              if (currentRoom && currentRoom.timerInterval) {
                clearInterval(currentRoom.timerInterval);
                currentRoom.timerInterval = null;
                log.info('Timer paused, waiting for user to return', { sessionId });
              }
              return;
            }

            currentRoom.remainingSeconds -= 1;
            
            // Broadcast the current synchronized time
            io.to(sessionId).emit('timer-sync', { remainingSeconds: currentRoom.remainingSeconds });

            // Auto-cut when time is up
            if (currentRoom.remainingSeconds <= 0) {
              clearInterval(currentRoom.timerInterval);
              
              // Force database update to complete session
              try {
                const endingSession = await Session.findById(sessionId);
                if (endingSession) {
                  endingSession.callStatus = 'completed';
                  endingSession.status = 'completed';
                  endingSession.actualDuration = endingSession.duration;
                  endingSession.callEndTime = new Date();
                  await endingSession.save();
                  log.info('Session auto-completed due to timer', { sessionId });
                }
              } catch (err) {
                log.error('Failed to auto-complete session', { error: err.message });
              }

              // Broadcast time up to clients
              io.to(sessionId).emit('session-time-up');
            }
          }, 1000);
        }

        log.info(`${role.toUpperCase()} socket joined room`, {
          sessionId: sessionId.substring(0, 8),
          userId: userId.substring(0, 8),
          socketId: socket.id.substring(0, 8),
          uniqueUsers,
          syncedRemainingSeconds: room.remainingSeconds
        });

        // Notify the user about successful room join
        socket.emit('room-joined', {
          sessionId,
          userId,
          role,
          otherUsers: Array.from(new Set(Array.from(room.users.values()).map(u => u.userId)))
            .filter(id => id !== userId)
            .map(id => {
              const u = Array.from(room.users.values()).find(user => user.userId === id);
              return { userId: id, role: u?.role };
            }),
          userCount: uniqueUsers,
          timestamp: new Date().toISOString()
        });

        // Notify others in the room
        socket.to(sessionId).emit('user-joined', {
          userId,
          role,
          timestamp: new Date().toISOString()
        });

        log.info(`Active unique users in room ${sessionId.substring(0, 8)}:`, {
          count: uniqueUsers,
          users: Array.from(new Set(Array.from(room.users.values()).map(u => u.userId))).map(id => id.substring(0, 8))
        });

      } catch (error) {
        log.error('Error joining room', { error: error.message, sessionId });
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // WebRTC Signaling: Send offer
    socket.on('request-end-session', ({ sessionId, requestedByRole }) => {
      console.log('[VIDEO-SOCKET] Request end session', { sessionId, requestedByRole });
      socket.to(sessionId).emit('request-end-session', { requestedByRole });
    });

    socket.on('confirm-end-session', ({ sessionId, agree, confirmedByRole }) => {
      console.log('[VIDEO-SOCKET] Confirm end session', { sessionId, agree, confirmedByRole });
      socket.to(sessionId).emit('confirm-end-session', { agree, confirmedByRole });
    });

    socket.on('leave-room', ({ sessionId }) => {
      log.info('User leaving room manually', { userId, role, sessionId });
      if (activeRooms.has(sessionId)) {
        const room = activeRooms.get(sessionId);
        room.users.delete(socket.id);
        
        const uniqueUsers = new Set(Array.from(room.users.values()).map(u => u.userId)).size;
        
        socket.to(sessionId).emit('user-left', { userId, role });
        
        log.info('User removed from room', {
          sessionId: sessionId.substring(0, 8),
          count: uniqueUsers
        });

        if (uniqueUsers < 2 && room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }
      }
      socket.leave(sessionId);
      socket.roomId = null;
    });

    socket.on('patient-ready', ({ sessionId }) => {
      log.info('Patient ready signal received', { sessionId: sessionId.substring(0, 8) });
      socket.to(sessionId).emit('patient-ready');
    });

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
