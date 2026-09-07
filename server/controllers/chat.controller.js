/**
 * Chat Controller
 * Handles REST endpoints for conversations and messages
 * Real-time messaging is handled by socket/chat.socket.js
 */

const Conversation = require('../models/conversation');
const Message = require('../models/message');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { sendMessageAndNotify } = require('../services/chat.service');

const logger = createLogger('CHAT-CTRL');

/** GET /api/chat/conversations — All conversations for the logged-in user */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  logger.debug('Fetching conversations', { userId: userId.substring(0, 8), role: req.user.role });

  const conversations = await Conversation.getConversationsForUser(userId);
  logger.debug('Conversations found', { count: conversations.length });

  // Batch fetch all unread counts in a single aggregation instead of N separate queries
  const convIds = conversations.map(c => c._id);
  const unreadAgg = await Message.aggregate([
    { $match: { conversationId: { $in: convIds }, receiverId: req.user._id, isRead: false } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } }
  ]);
  const unreadMap = {};
  unreadAgg.forEach(r => { unreadMap[r._id.toString()] = r.count; });

  const formattedConversations = conversations.map((conv) => {
    const otherParticipant = conv.participants.find(p => p.userId && p.userId._id && p.userId._id.toString() !== userId);
    if (!otherParticipant) return null;
    return {
      _id: conv._id,
      userId: otherParticipant.userId._id,
      userName: `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`,
      userRole: otherParticipant.role,
      lastMessage: conv.lastMessage?.text || '',
      lastMessageTime: conv.lastMessage?.timestamp ? new Date(conv.lastMessage.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      unreadCount: unreadMap[conv._id.toString()] || 0,
      updatedAt: conv.updatedAt
    };
  });

  const validConversations = formattedConversations.filter(c => c !== null).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(validConversations);
});

/** GET /api/chat/messages/:conversationId — Messages for a conversation */
const getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id.toString();
  const limit = parseInt(req.query.limit) || 50;
  const skip = parseInt(req.query.skip) || 0;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation');
  if (!conversation.participants.some(p => p.userId && p.userId.toString() === userId)) throw new AuthorizationError('Access denied');

  const messages = await Message.getMessagesForConversation(conversationId, limit, skip);
  const formattedMessages = messages.map(msg => ({
    _id: msg._id, text: msg.text,
    timestamp: new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    senderId: msg.senderId._id, senderName: `${msg.senderId.firstName} ${msg.senderId.lastName}`,
    isSentByMe: msg.senderId._id.toString() === userId, isRead: msg.isRead, createdAt: msg.createdAt
  }));

  await Message.markAsRead(conversationId, userId);
  await Conversation.findByIdAndUpdate(conversationId, { $set: { 'participants.$[elem].lastReadAt': new Date() } }, { arrayFilters: [{ 'elem.userId': userId }] });

  res.json(formattedMessages);
});

/** POST /api/chat/conversation — Find or create a conversation with another user */
const findOrCreateConversation = asyncHandler(async (req, res) => {
  const { otherUserId } = req.body;
  const userId = req.user._id.toString();
  if (!otherUserId) return res.status(400).json({ success: false, message: 'Other user ID is required' });

  const session = await Session.findOne({ $or: [{ patientId: userId, doctorId: otherUserId }, { patientId: otherUserId, doctorId: userId }] });
  if (!session) return res.status(403).json({ success: false, message: 'Cannot create conversation. Users must have had a session together.' });

  const conversation = await Conversation.findOrCreateConversation(userId, otherUserId, session._id);
  res.json({ success: true, conversationId: conversation._id });
});

/** POST /api/chat/message — Send a message (REST fallback) */
const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, text } = req.body;
  const senderId = req.user._id.toString();
  if (!conversationId || !text) return res.status(400).json({ success: false, message: 'Conversation ID and text are required' });

  // Shared with the socket 'message:send' handler (server/socket/chat.socket.js)
  // via chat.service.js — this used to persist the message but skip all
  // real-time fan-out (conversation room, receiver's personal room, /data
  // namespace), so a receiver got no live notification if this fallback path
  // was ever actually used, only a stale conversation list until they reloaded.
  let formattedMessage;
  try {
    const io = req.app.get('io');
    const chatNamespace = io ? io.of('/chat') : null;
    ({ formattedMessage } = await sendMessageAndNotify(io, chatNamespace, { conversationId, senderId, text }));
  } catch (err) {
    if (err.code === 'CONVERSATION_NOT_FOUND') throw new NotFoundError('Conversation');
    if (err.code === 'ACCESS_DENIED') throw new AuthorizationError('Access denied');
    throw err;
  }

  res.json({ success: true, ...formattedMessage, isSentByMe: true });
});

/** PUT /api/chat/conversation/:conversationId/read — Mark conversation as read */
const markAsRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;

  // This was the one chat route with no membership check — it took
  // conversationId straight from the params and wrote. It was not exploitable,
  // because both writes below are scoped to the caller's own receiverId and
  // their own participant entry, so a stranger's call matched nothing. But it
  // answered 200 to a stranger, and it stopped being dead code the moment the
  // client started calling it on every read, so it gets the same check every
  // sibling route already has.
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation');
  if (!conversation.participants.some(p => p.userId && p.userId.toString() === userId.toString())) {
    throw new AuthorizationError('Access denied');
  }

  await Message.markAsRead(conversationId, userId.toString());
  // arrayFilters is not reliably cast by Mongoose, so pass the ObjectId the
  // participant entry actually stores rather than a string.
  await Conversation.findByIdAndUpdate(
    conversationId,
    { $set: { 'participants.$[elem].lastReadAt': new Date() } },
    { arrayFilters: [{ 'elem.userId': userId }] }
  );
  res.json({ success: true, message: 'Marked as read' });
});

/** GET /api/chat/unread-count — Total unread messages across all conversations */
const getUnreadCount = asyncHandler(async (req, res) => {
  // Single aggregation instead of N+1 queries
  const result = await Message.aggregate([
    { $match: { receiverId: req.user._id, isRead: false } },
    { $count: 'total' }
  ]);
  const totalUnread = result.length > 0 ? result[0].total : 0;
  res.json({ success: true, unreadCount: totalUnread });
});

module.exports = { getConversations, getMessages, findOrCreateConversation, sendMessage, markAsRead, getUnreadCount };
