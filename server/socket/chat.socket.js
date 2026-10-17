/**
 * Chat Socket Handler
 * 
 * IMPORTANT: Always use config/auth.js for JWT secrets.
 * Never use process.env.JWT_SECRET directly or hardcoded fallbacks.
 * This ensures consistent authentication across all socket namespaces.
 */

const Message = require('../models/message');
const { sendMessageAndNotify } = require('../services/chat.service');
const { createSocketAuthMiddleware } = require('./authMiddleware');
const { createGuardedRegistrar } = require('../authz/socket');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CHAT-SOCKET');

// Store active users and their socket IDs
const activeUsers = new Map(); // userId -> Set<socketId>

// Socket.IO middleware for authentication — see socket/authMiddleware.js
const socketAuthMiddleware = createSocketAuthMiddleware('CHAT-AUTH');

// Initialize Socket.IO handlers
const initializeChatSocket = (io) => {
  // Create a namespace for chat to avoid conflicts with video call sockets
  const chatNamespace = io.of('/chat');

  // Apply authentication middleware to chat namespace only
  chatNamespace.use(socketAuthMiddleware);

  chatNamespace.on('connection', (socket) => {
    logger.info('User connected', { userId: socket.userId?.substring(0, 8), role: socket.userRole });

    // See authz/socket.js. typing:start / typing:stop previously broadcast
    // into whatever conversation room the client named, with no check.
    const { on } = createGuardedRegistrar(socket, { tag: 'CHAT' });

    // Track this connection. activeUsers is userId -> Set<socketId> (not a
    // single socketId) so a user with two tabs/devices open doesn't lose
    // presence when the OLDER tab disconnects — a single-value map meant the
    // older tab's disconnect handler would delete the entry that now pointed
    // at the still-live newer tab, silently killing message:notification for
    // that user until a full reconnect.
    if (!activeUsers.has(socket.userId)) activeUsers.set(socket.userId, new Set());
    activeUsers.get(socket.userId).add(socket.id);

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Handle joining a conversation room
    on('conversation:join', { mode: 'policy', action: 'conversation:participate', key: 'conversationId' }, async (payload, { resource }) => {
      try {
        // The registrar has already loaded this conversation and run the
        // participant policy on it — `resource` is that document. The id is
        // taken from it rather than from the payload, which the client may
        // send either bare or as { conversationId }; the handler used to
        // assume the bare form and look up the whole object as an id.
        const conversationId = String(resource._id);

        // Join the conversation room
        socket.join(`conversation:${conversationId}`);
        logger.info('User joined conversation', { userId: socket.userId?.substring(0, 8), conversationId: conversationId?.substring(0, 8) });

        // Mark messages as read
        await Message.markAsRead(conversationId, socket.userId);

        // Notify other participants that user is in the conversation
        socket.to(`conversation:${conversationId}`).emit('user:typing:stop', {
          conversationId,
          userId: socket.userId
        });
      } catch (error) {
        logger.error('Error joining conversation', { error: error.message });
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Handle leaving a conversation room
    on('conversation:leave', { mode: 'policy', action: 'conversation:participate', key: 'conversationId' }, (payload, { resource }) => {
      const conversationId = String(resource._id);
      socket.leave(`conversation:${conversationId}`);
      logger.info('User left conversation', { userId: socket.userId?.substring(0, 8), conversationId: conversationId?.substring(0, 8) });
    });

    // Handle sending a message
    on('message:send', { mode: 'policy', action: 'conversation:participate', key: 'conversationId' }, async (data) => {
      try {
        const { conversationId, text } = data;
        const senderId = socket.userId;

        if (!conversationId || !text) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Persistence + fan-out is shared with the REST fallback in
        // chat.controller.js (see chat.service.js) so the two entry points
        // can't drift into different real-time behavior again.
        // Persistence and the full fan-out — including the sender's own echo —
        // live in the shared helper, so this handler and the REST fallback
        // deliver byte-identical events.
        await sendMessageAndNotify(io, chatNamespace, { conversationId, senderId, text });

        logger.info('Message sent', { conversationId: conversationId?.substring(0, 8), senderId: senderId?.substring(0, 8) });
      } catch (error) {
        logger.error('Error sending message', { error: error.message });
        // The raw error text used to ride along to the client — Mongoose
        // validation and cast messages included. It stays in the log.
        socket.emit('error', {
          message: error.code === 'INVALID_MESSAGE' ? 'Invalid message data' : 'Failed to send message'
        });
      }
    });

    // Handle typing indicator
    on('typing:start', { mode: 'policy', action: 'conversation:participate', key: 'conversationId' }, (data) => {
      const { conversationId } = data;
      socket.to(`conversation:${conversationId}`).emit('user:typing:start', {
        conversationId,
        userId: socket.userId
      });
    });

    on('typing:stop', { mode: 'policy', action: 'conversation:participate', key: 'conversationId' }, (data) => {
      const { conversationId } = data;
      socket.to(`conversation:${conversationId}`).emit('user:typing:stop', {
        conversationId,
        userId: socket.userId
      });
    });

    // Note: a message:read / messages:read handler used to live here — a
    // complete, correct read-receipt broadcast that neither SessionChat.tsx
    // nor MessagesPage.tsx ever emitted or listened for. Read state is
    // actually derived elsewhere (as a side effect of GET /chat/messages/:id
    // and the conversation:join handler below), which is what drives unread
    // badge counts today. Removed rather than left as dead, unreachable API
    // surface that looked like a supported feature.

    // Handle disconnection
    on('disconnect', { mode: 'open' }, () => {
      logger.info('User disconnected', { userId: socket.userId?.substring(0, 8) });
      const sockets = activeUsers.get(socket.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) activeUsers.delete(socket.userId);
      }
    });
  });

  logger.info('Chat Socket.IO namespace initialized on /chat');
  return chatNamespace;
};

module.exports = { initializeChatSocket, activeUsers };
