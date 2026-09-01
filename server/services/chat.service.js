/**
 * Shared message persistence + real-time fan-out, used by both the socket
 * handler (socket/chat.socket.js, 'message:send') and the REST fallback
 * (controllers/chat.controller.js, POST /api/chat/message).
 *
 * Previously these were two independent implementations: the socket path did
 * DB write + full fan-out (conversation room, receiver's personal room,
 * /data namespace), while the REST fallback only did the DB write. If the
 * REST fallback is ever actually used (that's the point of a "fallback" —
 * e.g. WebSockets blocked by a restrictive network), the receiver got zero
 * real-time notification, only a stale conversation list until their next
 * manual reload. One shared function means both paths can't drift again.
 */

const Conversation = require('../models/conversation');
const Message = require('../models/message');
const SocketEmitter = require('../utils/socketEmitter');

/**
 * @param {object} io - the main Socket.IO server instance (for the /data namespace broadcast)
 * @param {object} chatNamespace - the io.of('/chat') namespace (for chat-room emits)
 * @param {{conversationId: string, senderId: string, text: string}} params
 * @returns {Promise<object>} the formatted message that was persisted and broadcast
 */
async function sendMessageAndNotify(io, chatNamespace, { conversationId, senderId, text }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const err = new Error('Conversation not found');
    err.code = 'CONVERSATION_NOT_FOUND';
    throw err;
  }

  const isParticipant = conversation.participants.some(p => p.userId && p.userId.toString() === senderId);
  if (!isParticipant) {
    const err = new Error('Access denied');
    err.code = 'ACCESS_DENIED';
    throw err;
  }

  const receiver = conversation.participants.find(p => p.userId && p.userId.toString() !== senderId);

  const message = await Message.create({
    conversationId,
    senderId,
    receiverId: receiver.userId,
    text,
    isDelivered: true,
    deliveredAt: new Date()
  });
  await message.populate('senderId', 'firstName lastName email role');

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: { text, senderId, timestamp: message.createdAt },
    updatedAt: new Date()
  });

  const formattedMessage = {
    _id: message._id,
    text: message.text,
    timestamp: new Date(message.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    senderId: message.senderId._id,
    senderName: `${message.senderId.firstName} ${message.senderId.lastName}`,
    createdAt: message.createdAt
  };

  const receiverId = receiver.userId.toString();

  if (chatNamespace) {
    // Receiver's copy in the conversation room (Socket.IO delivers only to
    // sockets actually in that room, so this is a no-op if nobody's there —
    // no need for a separate "is anyone connected" check beforehand).
    chatNamespace.to(`conversation:${conversationId}`).emit('message:receive', {
      ...formattedMessage,
      isSentByMe: false,
      conversationId
    });
    // Receiver's personal room, for a notification even if they're not
    // currently viewing this conversation.
    chatNamespace.to(`user:${receiverId}`).emit('message:notification', {
      conversationId,
      message: formattedMessage,
      senderName: formattedMessage.senderName
    });
  }

  if (io) {
    new SocketEmitter(io).emitToUser(receiverId, 'chat:new-message', {
      conversationId,
      message: formattedMessage,
      senderName: formattedMessage.senderName
    });
  }

  return { message, formattedMessage, receiverId };
}

module.exports = { sendMessageAndNotify };
