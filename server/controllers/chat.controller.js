/**
 * Chat Controller
 * Handles REST endpoints for conversations and messages.
 * Real-time messaging is socket/chat.socket.js; both send through
 * services/chat.service.js.
 */

const mongoose = require('mongoose');
const Conversation = require('../models/conversation');
const Message = require('../models/message');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError, ValidationError } = require('../utils/errors');
const chat = require('../services/chat.service');

const { RELATIONSHIP_PAYMENT_STATES } = chat;

/** The other person in a conversation, as the list shows them. */
function otherPerson(conv, userId) {
  const other = conv.participants.find((p) => !p.userId || String(p.userId._id || p.userId) !== String(userId));
  if (!other) return null;
  const u = other.userId && other.userId._id ? other.userId : null;
  const deleted = !u || u.firstName === 'Deleted';
  const name = deleted ? 'Deleted user' : `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return {
    userId: u ? u._id : null,
    // Every other screen names a doctor "Dr. …".
    userName: !deleted && other.role === 'doctor' ? `Dr. ${name}` : name,
    userRole: other.role,
    available: chat.canChat(u)
  };
}

/**
 * GET /api/chat/conversations — the caller's conversations, the one with the
 * latest message first (it used to sort by updatedAt, which reading a thread
 * also bumped — so opening a chat reordered both people's lists). Each says
 * whether messages can be sent (`canMessage`) and why not.
 */
const getConversations = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  const conversations = await Conversation.getConversationsForUser(userId);

  const convIds = conversations.map((c) => c._id);
  const [unreadAgg, windows] = await Promise.all([
    Message.aggregate([
      { $match: { conversationId: { $in: convIds }, receiverId: new mongoose.Types.ObjectId(userId), isRead: false } },
      { $group: { _id: '$conversationId', count: { $sum: 1 } } }
    ]),
    chat.chatWindowsForUser(userId)
  ]);
  const unreadMap = {};
  unreadAgg.forEach((r) => { unreadMap[String(r._id)] = r.count; });

  const list = conversations.map((conv) => {
    const other = otherPerson(conv, userId);
    if (!other) return null;
    const window = other.userId ? windows.get(String(other.userId)) : null;
    const canMessage = !!(other.available && window && window.open);
    return {
      _id: conv._id,
      userId: other.userId,
      userName: other.userName,
      userRole: other.userRole,
      lastMessage: conv.lastMessage?.text || '',
      lastMessageAt: conv.lastMessage?.timestamp || null,
      // Kept for older app builds; the app formats lastMessageAt itself now.
      lastMessageTime: conv.lastMessage?.timestamp ? chat.formatChatTime(conv.lastMessage.timestamp) : '',
      unreadCount: unreadMap[String(conv._id)] || 0,
      canMessage,
      closedReason: canMessage ? null
        : !other.available ? 'unavailable'
          : !window || !window.everBooked ? 'not-booked'
            : 'closed',
      closesAt: window ? window.closesAt : null,
      updatedAt: conv.updatedAt
    };
  }).filter(Boolean);

  res.json(list);
});

/**
 * GET /api/chat/messages/:conversationId — a page of the thread, oldest first.
 *   ?limit=1..100 (default 50)
 *   ?before=<messageId>  older than that message (scrolling up)
 *   ?after=<messageId>   newer than that message (catching up after a reconnect)
 * Reading it no longer marks anything read (PUT .../read does, when the thread
 * is actually on screen). The response is an array, as before; whether older
 * messages exist is in the X-Has-More header.
 */
const getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.actor.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

  const cursorOf = async (id, name) => {
    if (!id) return null;
    if (!mongoose.Types.ObjectId.isValid(String(id))) throw new ValidationError(`${name} must be a message id`);
    const m = await Message.findOne({ _id: id, conversationId }).select('createdAt').lean();
    if (!m) throw new ValidationError(`${name} is not a message in this conversation`);
    return { createdAt: m.createdAt, _id: m._id };
  };
  const before = await cursorOf(req.query.before, 'before');
  const after = before ? null : await cursorOf(req.query.after, 'after');

  const { messages, hasMore } = await Message.getPage(conversationId, { limit, before, after });
  res.set('X-Has-More', hasMore ? '1' : '0');
  res.set('Access-Control-Expose-Headers', 'X-Has-More');
  res.json(messages.map((m) => chat.formatMessage(m, { conversationId, viewerId: userId })));
});

/** POST /api/chat/conversation — the conversation with another person (created if needed) */
const findOrCreateConversation = asyncHandler(async (req, res) => {
  const { otherUserId } = req.body;
  const userId = req.actor.id;
  if (!otherUserId) return res.status(400).json({ success: false, message: 'Other user ID is required' });

  const session = await Session.findOne({
    $and: [
      { $or: [{ patientId: userId, doctorId: otherUserId }, { patientId: otherUserId, doctorId: userId }] },
      { $or: [{ paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } }, { status: 'completed' }] }
    ]
  }).select('_id').sort({ createdAt: -1 });
  if (!session) {
    return res.status(403).json({ success: false, code: 'CHAT_NOT_OPEN', message: 'Chat opens once a session is booked and paid.' });
  }

  const conversation = await Conversation.findOrCreateConversation(userId, otherUserId, session._id);
  const window = await chat.chatWindow(userId, otherUserId);
  res.json({ success: true, conversationId: conversation._id, canMessage: window.open, closesAt: window.closesAt });
});

const SEND_ERRORS = {
  CONVERSATION_NOT_FOUND: () => new NotFoundError('Conversation'),
  ACCESS_DENIED: (m) => new AuthorizationError(m),
  CHAT_NOT_OPEN: (m) => new AuthorizationError(m),
  CHAT_CLOSED: (m) => new AuthorizationError(m),
  RECIPIENT_UNAVAILABLE: (m) => new AuthorizationError(m),
  INVALID_MESSAGE: (m) => new ValidationError(m),
  MESSAGE_TOO_LONG: (m) => new ValidationError(m)
};

/** POST /api/chat/message — send a message (REST fallback; same rules as the socket) */
const sendMessage = asyncHandler(async (req, res) => {
  const { conversationId, text, clientMsgId } = req.body;
  const senderId = req.actor.id;
  if (!conversationId || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ success: false, message: 'Conversation ID and text are required' });
  }
  let result;
  try {
    const io = req.app.get('io');
    result = await chat.sendMessageAndNotify(io, io ? io.of('/chat') : null, { conversationId, senderId, text, clientMsgId });
  } catch (err) {
    const make = SEND_ERRORS[err.code];
    if (make) {
      const e = make(err.message);
      e.code = err.code;
      throw e;
    }
    throw err;
  }
  res.json({ success: true, ...result.formattedMessage, isSentByMe: true, duplicate: result.duplicate });
});

/** PUT /api/chat/conversation/:conversationId/read — the thread is on screen: mark it read */
const markAsRead = asyncHandler(async (req, res) => {
  const io = req.app.get('io');
  const { marked } = await chat.markConversationRead(io, io ? io.of('/chat') : null, req.params.conversationId, req.actor.id);
  res.json({ success: true, marked });
});

/** GET /api/chat/unread-count — unread messages across all conversations */
const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Message.countDocuments({ receiverId: new mongoose.Types.ObjectId(req.actor.id), isRead: false });
  res.json({ success: true, unreadCount });
});


module.exports = { getConversations, getMessages, findOrCreateConversation, sendMessage, markAsRead, getUnreadCount };
