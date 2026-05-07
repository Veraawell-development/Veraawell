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

const logger = createLogger('CHAT-CTRL');

/** GET /api/chat/conversations — All conversations for the logged-in user */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  logger.debug('Fetching conversations', { userId: userId.substring(0, 8), role: req.user.role });

  const conversations = await Conversation.getConversationsForUser(userId);
  logger.debug('Conversations found', { count: conversations.length });

  const formattedConversations = await Promise.all(conversations.map(async (conv) => {
    const otherParticipant = conv.participants.find(p => p.userId && p.userId._id && p.userId._id.toString() !== userId);
    if (!otherParticipant) return null;
    const unreadCount = await Message.getUnreadCount(conv._id, userId);
    return {
      _id: conv._id,
      userId: otherParticipant.userId._id,
      userName: `${otherParticipant.userId.firstName} ${otherParticipant.userId.lastName}`,
      userRole: otherParticipant.role,
      lastMessage: conv.lastMessage?.text || '',
      lastMessageTime: conv.lastMessage?.timestamp ? new Date(conv.lastMessage.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      unreadCount,
      updatedAt: conv.updatedAt
    };
  }));

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

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation');
  if (!conversation.participants.some(p => p.userId && p.userId.toString() === senderId)) throw new AuthorizationError('Access denied');

  const receiver = conversation.participants.find(p => p.userId && p.userId.toString() !== senderId);
  const message = await Message.create({ conversationId, senderId, receiverId: receiver.userId, text, isDelivered: true, deliveredAt: new Date() });
  await Conversation.findByIdAndUpdate(conversationId, { lastMessage: { text, senderId, timestamp: message.createdAt }, updatedAt: new Date() });
  await message.populate('senderId', 'firstName lastName email role');

  res.json({ success: true, _id: message._id, text: message.text, timestamp: new Date(message.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }), senderId: message.senderId._id, senderName: `${message.senderId.firstName} ${message.senderId.lastName}`, isSentByMe: true, createdAt: message.createdAt });
});

/** PUT /api/chat/conversation/:conversationId/read — Mark conversation as read */
const markAsRead = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user._id;
  await Message.markAsRead(conversationId, userId.toString());
  await Conversation.findByIdAndUpdate(conversationId, { $set: { 'participants.$[elem].lastReadAt': new Date() } }, { arrayFilters: [{ 'elem.userId': userId }] });
  res.json({ success: true, message: 'Marked as read' });
});

/** GET /api/chat/unread-count — Total unread messages across all conversations */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const conversations = await Conversation.find({ 'participants.userId': req.user._id });
  let totalUnread = 0;
  for (const conv of conversations) { totalUnread += await Message.getUnreadCount(conv._id, userId); }
  res.json({ success: true, unreadCount: totalUnread });
});

module.exports = { getConversations, getMessages, findOrCreateConversation, sendMessage, markAsRead, getUnreadCount };
