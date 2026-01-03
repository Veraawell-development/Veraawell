/**
 * Chat Socket Handler
 * 
 * IMPORTANT: Always use config/auth.js for JWT secrets.
 * Never use process.env.JWT_SECRET directly or hardcoded fallbacks.
 * This ensures consistent authentication across all socket namespaces.
 */

const jwt = require('jsonwebtoken');
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const { getJWTSecret } = require('../config/auth');

// Store active users and their socket IDs
const activeUsers = new Map(); // userId -> socketId

// Socket.IO middleware for authentication
const socketAuthMiddleware = (socket, next) => {
  try {
    console.log('\n========================================');
    console.log('[CHAT AUTH] NEW AUTHENTICATION ATTEMPT');
    console.log('========================================');
    console.log('[CHAT AUTH] Socket ID:', socket.id);
    console.log('[CHAT AUTH] Timestamp:', new Date().toISOString());

    // Check auth token
    const authToken = socket.handshake.auth.token;
    console.log('[CHAT AUTH] Auth token from handshake:', authToken ? 'Present' : 'Missing');
    if (authToken) {
      console.log('[CHAT AUTH] Auth token length:', authToken.length);
      console.log('[CHAT AUTH] Auth token preview:', authToken.substring(0, 30) + '...');
    }

    // Check cookies
    const cookies = socket.handshake.headers.cookie;
    console.log('[CHAT AUTH] Cookies header:', cookies ? 'Present' : 'Missing');
    if (cookies) {
      console.log('[CHAT AUTH] Cookies:', cookies);
    }

    // Try to get token from auth or cookies
    let token = authToken;

    if (!token && cookies) {
      console.log('[CHAT AUTH] Trying to extract token from cookies...');
      const cookieArray = cookies.split('; ');
      console.log('[CHAT AUTH] Cookie array:', cookieArray);
      const tokenCookie = cookieArray.find(c => c.startsWith('token='));
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
        console.log('[CHAT AUTH] Token extracted from cookie, length:', token.length);
        console.log('[CHAT AUTH] Token preview:', token.substring(0, 30) + '...');
      } else {
        console.log('[CHAT AUTH] No token cookie found');
      }
    }

    if (!token) {
      console.error('[CHAT AUTH] FAILED: No token found in auth or cookies');
      console.log('========================================\n');
      return next(new Error('Authentication error: No token provided'));
    }

    console.log('[CHAT AUTH] Token found, attempting verification...');
    console.log('[CHAT AUTH] Using centralized JWT secret from config/auth.js');

    const decoded = jwt.verify(token, getJWTSecret());

    console.log('[CHAT AUTH] Token verified successfully!');
    console.log('[CHAT AUTH] Decoded token:', {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      iat: new Date(decoded.iat * 1000).toISOString(),
      exp: new Date(decoded.exp * 1000).toISOString()
    });

    socket.userId = decoded.userId;
    socket.userRole = decoded.role;

    console.log('[CHAT AUTH] Authentication successful for user:', socket.userId);
    console.log('========================================\n');
    next();
  } catch (error) {
    console.error('[CHAT AUTH] AUTHENTICATION FAILED');
    console.error('[CHAT AUTH] Error type:', error.name);
    console.error('[CHAT AUTH] Error message:', error.message);
    if (error.name === 'JsonWebTokenError') {
      console.error('[CHAT AUTH] This is a JWT verification error');
      console.error('[CHAT AUTH] Possible causes:');
      console.error('[CHAT AUTH]   1. Token signed with different secret');
      console.error('[CHAT AUTH]   2. Token format is invalid');
      console.error('[CHAT AUTH]   3. Token is corrupted');
    } else if (error.name === 'TokenExpiredError') {
      console.error('[CHAT AUTH] Token has expired');
      console.error('[CHAT AUTH] Expired at:', new Date(error.expiredAt).toISOString());
    }
    console.log('========================================\n');
    next(new Error('Authentication error: Invalid token'));
  }
};

// Initialize Socket.IO handlers
const initializeChatSocket = (io) => {
  // Create a namespace for chat to avoid conflicts with video call sockets
  const chatNamespace = io.of('/chat');

  // Apply authentication middleware to chat namespace only
  chatNamespace.use(socketAuthMiddleware);

  chatNamespace.on('connection', (socket) => {
    console.log(`[CHAT] User connected: ${socket.userId} (${socket.userRole})`);

    // Store user's socket ID
    activeUsers.set(socket.userId, socket.id);

    // Emit online status to all users
    socket.broadcast.emit('user:online', { userId: socket.userId });

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Handle joining a conversation room
    socket.on('conversation:join', async (conversationId) => {
      try {
        // Verify user is part of this conversation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(
          p => p.userId.toString() === socket.userId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied to this conversation' });
          return;
        }

        // Join the conversation room
        socket.join(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} joined conversation ${conversationId}`);

        // Mark messages as read
        await Message.markAsRead(conversationId, socket.userId);

        // Notify other participants that user is in the conversation
        socket.to(`conversation:${conversationId}`).emit('user:typing:stop', {
          conversationId,
          userId: socket.userId
        });
      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving a conversation room
    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    // Handle sending a message
    socket.on('message:send', async (data) => {
      try {
        const { conversationId, text } = data;
        const senderId = socket.userId;

        if (!conversationId || !text) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Verify conversation and get receiver
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }

        const isParticipant = conversation.participants.some(
          p => p.userId.toString() === senderId
        );

        if (!isParticipant) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Find receiver
        const receiver = conversation.participants.find(
          p => p.userId.toString() !== senderId
        );

        // Create message in database
        const message = await Message.create({
          conversationId,
          senderId,
          receiverId: receiver.userId,
          text,
          isDelivered: true,
          deliveredAt: new Date()
        });

        // Populate sender info
        await message.populate('senderId', 'firstName lastName email role');

        // Update conversation's last message
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: {
            text,
            senderId,
            timestamp: message.createdAt
          },
          updatedAt: new Date()
        });

        // Format message for frontend
        const formattedMessage = {
          _id: message._id,
          text: message.text,
          timestamp: new Date(message.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }),
          senderId: message.senderId._id,
          senderName: `${message.senderId.firstName} ${message.senderId.lastName}`,
          createdAt: message.createdAt
        };

        // Emit to sender
        socket.emit('message:receive', {
          ...formattedMessage,
          isSentByMe: true
        });

        // Emit to receiver in conversation room
        socket.to(`conversation:${conversationId}`).emit('message:receive', {
          ...formattedMessage,
          isSentByMe: false,
          conversationId
        });

        // Emit to receiver's personal room (for notification if not in conversation)
        const receiverSocketId = activeUsers.get(receiver.userId.toString());
        if (receiverSocketId) {
          chatNamespace.to(`user:${receiver.userId}`).emit('message:notification', {
            conversationId,
            message: formattedMessage,
            senderName: formattedMessage.senderName
          });
        }

        console.log(`Message sent in conversation ${conversationId} from ${senderId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message', error: error.message });
      }
    });

    // Handle typing indicator
    socket.on('typing:start', (data) => {
      const { conversationId } = data;
      socket.to(`conversation:${conversationId}`).emit('user:typing:start', {
        conversationId,
        userId: socket.userId
      });
    });

    socket.on('typing:stop', (data) => {
      const { conversationId } = data;
      socket.to(`conversation:${conversationId}`).emit('user:typing:stop', {
        conversationId,
        userId: socket.userId
      });
    });

    // Handle message read receipt
    socket.on('message:read', async (data) => {
      try {
        const { conversationId } = data;

        // Mark messages as read
        await Message.markAsRead(conversationId, socket.userId);

        // Update conversation
        await Conversation.findByIdAndUpdate(
          conversationId,
          {
            $set: {
              'participants.$[elem].lastReadAt': new Date()
            }
          },
          {
            arrayFilters: [{ 'elem.userId': socket.userId }]
          }
        );

        // Notify other participants
        socket.to(`conversation:${conversationId}`).emit('messages:read', {
          conversationId,
          userId: socket.userId,
          readAt: new Date()
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`[CHAT] User disconnected: ${socket.userId}`);
      activeUsers.delete(socket.userId);

      // Emit offline status
      socket.broadcast.emit('user:offline', { userId: socket.userId });
    });
  });

  console.log('[CHAT] Chat Socket.IO namespace initialized on /chat');
  return chatNamespace;
};

module.exports = { initializeChatSocket, activeUsers };
