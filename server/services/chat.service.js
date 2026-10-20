/**
 * Chat: storing a message once and telling everyone who should know — shared
 * by the socket handler (socket/chat.socket.js, 'message:send') and the REST
 * fallback (controllers/chat.controller.js, POST /api/chat/message), so the
 * two can't drift apart.
 *
 * What a send guarantees:
 *  - stored once: the sender's clientMsgId makes a retry (after a timeout, or
 *    the REST fallback after a socket failure) return the stored message
 *    instead of a second copy;
 *  - refused with a reason the screen can show (too long, chat closed, the
 *    other person can't receive messages) — failures used to be a generic
 *    socket 'error' nobody listened to, so an unsent message looked sent;
 *  - only between two people who are allowed to talk: a booked-and-paid (or
 *    free) session between them, ending no more than CHAT_WINDOW_DAYS ago, and
 *    both accounts active.
 */

const Conversation = require('../models/conversation');
const Message = require('../models/message');
const SocketEmitter = require('../utils/socketEmitter');
const { PLATFORM_TIMEZONE } = require('../config/time');

/**
 * Payment states in which a session ties a patient and a doctor together for
 * chat: money changed hands (or none was owed). `refunded` and the refund
 * states stay in — that booking was paid, so the two really were matched —
 * but only for CHAT_WINDOW_DAYS after it.
 */
const RELATIONSHIP_PAYMENT_STATES = Object.freeze(['paid', 'not_required', 'refunded', 'refund_pending', 'refund_failed']);

/** Chat stays open this long after the two people's last session, then read-only. */
const CHAT_WINDOW_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
const MAX_TEXT = 5000;
const PREVIEW = 200;

/** A message's time of day as both people read it: India time, 12-hour. */
function formatChatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PLATFORM_TIMEZONE });
}

function chatError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Sessions that matched these two people (or one person with anyone). */
function relationshipFilter(a, b) {
  const pair = b
    ? { $or: [{ patientId: a, doctorId: b }, { patientId: b, doctorId: a }] }
    : { $or: [{ patientId: a }, { doctorId: a }] };
  return { $and: [pair, { $or: [{ paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } }, { status: 'completed' }] }] };
}

function sessionEnd(s) {
  if (s.endsAt) return new Date(s.endsAt).getTime();
  if (s.startsAt) return new Date(s.startsAt).getTime() + (s.duration || 60) * 60 * 1000;
  return 0;
}

/** Have these two people ever had a paid, free or held session? */
async function hasBookedRelationship([a, b]) {
  if (!a || !b) return false;
  const Session = require('../models/session');
  return !!(await Session.exists(relationshipFilter(a, b)));
}

/**
 * Can these two message each other now, and until when?
 * @returns {Promise<{everBooked:boolean, open:boolean, closesAt:Date|null}>}
 */
async function chatWindow(a, b, now = new Date()) {
  const Session = require('../models/session');
  const sessions = await Session.find(relationshipFilter(a, b)).select('endsAt startsAt duration').lean();
  return windowFrom(sessions, now);
}

function windowFrom(sessions, now) {
  if (!sessions.length) return { everBooked: false, open: false, closesAt: null };
  const last = Math.max(...sessions.map(sessionEnd));
  const closesAt = new Date(last + CHAT_WINDOW_DAYS * DAY);
  return { everBooked: true, open: now < closesAt, closesAt };
}

/** chatWindow for one user against each of their contacts, in one query. */
async function chatWindowsForUser(userId, now = new Date()) {
  const Session = require('../models/session');
  const sessions = await Session.find(relationshipFilter(userId)).select('patientId doctorId endsAt startsAt duration').lean();
  const byOther = new Map();
  for (const s of sessions) {
    const other = String(s.patientId) === String(userId) ? String(s.doctorId) : String(s.patientId);
    if (!byOther.has(other)) byOther.set(other, []);
    byOther.get(other).push(s);
  }
  const result = new Map();
  for (const [other, list] of byOther) result.set(other, windowFrom(list, now));
  return result;
}

/** Can this account take part in a chat right now? */
function canChat(user) {
  if (!user || user.deletedAt) return false;
  if (user.status && user.status !== 'active') return false;
  if (user.role === 'doctor' && user.approvalStatus && user.approvalStatus !== 'approved') return false;
  return true;
}

/** What both screens show for a message. A deleted sender reads "Deleted user". */
function formatMessage(msg, { conversationId, viewerId = null } = {}) {
  const sender = msg.senderId && typeof msg.senderId === 'object' && msg.senderId._id ? msg.senderId : null;
  const senderId = sender ? sender._id : msg.senderId;
  return {
    _id: msg._id,
    conversationId: String(conversationId || msg.conversationId),
    clientMsgId: msg.clientMsgId || null,
    text: msg.text,
    createdAt: msg.createdAt,
    timestamp: formatChatTime(msg.createdAt),
    senderId,
    senderName: sender ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Deleted user' : 'Deleted user',
    ...(viewerId ? { isSentByMe: String(senderId) === String(viewerId), isRead: !!msg.isRead } : {})
  };
}

const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Store a message and deliver it.
 * @returns {Promise<{formattedMessage:object, receiverId:string, duplicate:boolean}>}
 * @throws Error with .code: INVALID_MESSAGE | MESSAGE_TOO_LONG | CONVERSATION_NOT_FOUND |
 *   ACCESS_DENIED | CHAT_NOT_OPEN | CHAT_CLOSED | RECIPIENT_UNAVAILABLE
 */
async function sendMessageAndNotify(io, chatNamespace, { conversationId, senderId, text, clientMsgId = null }) {
  if (typeof text !== 'string' || !text.trim()) throw chatError('INVALID_MESSAGE', 'Message text is required');
  const body = text.trim();
  if (body.length > MAX_TEXT) throw chatError('MESSAGE_TOO_LONG', `Messages can be up to ${MAX_TEXT} characters.`);
  const clientId = typeof clientMsgId === 'string' && CLIENT_ID.test(clientMsgId) ? clientMsgId : null;

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw chatError('CONVERSATION_NOT_FOUND', 'Conversation not found');
  const me = conversation.participants.find((p) => p.userId && String(p.userId) === String(senderId));
  const other = conversation.participants.find((p) => p.userId && String(p.userId) !== String(senderId));
  if (!me || !other) throw chatError('ACCESS_DENIED', 'Access denied');

  // A retry of a message already stored: hand it back, store nothing.
  if (clientId) {
    const existing = await Message.findOne({ senderId, clientMsgId: clientId }).populate('senderId', 'firstName lastName role').lean();
    if (existing) return deliverDuplicate(chatNamespace, existing, conversationId, senderId);
  }

  const User = require('../models/user');
  const [sender, receiver] = await Promise.all([
    User.findById(senderId).select('status role approvalStatus deletedAt').lean(),
    User.findById(other.userId).select('status role approvalStatus deletedAt').lean()
  ]);
  // Checked on every send, not only at the socket handshake: a suspension
  // used to leave an already-open chat socket able to keep messaging.
  if (!canChat(sender)) throw chatError('ACCESS_DENIED', "Your account can't send messages right now.");
  if (!canChat(receiver)) throw chatError('RECIPIENT_UNAVAILABLE', "This person can't receive messages right now.");

  const window = await chatWindow(senderId, other.userId);
  if (!window.everBooked) throw chatError('CHAT_NOT_OPEN', 'Chat opens once a session is booked and paid.');
  if (!window.open) throw chatError('CHAT_CLOSED', `This chat closed ${CHAT_WINDOW_DAYS} days after your last session. Book a new session to message again.`);

  let message;
  try {
    message = await Message.create({
      conversationId,
      senderId,
      receiverId: other.userId,
      text: body,
      ...(clientId ? { clientMsgId: clientId } : {})
    });
  } catch (err) {
    // The same message sent twice at once: the other attempt stored it.
    if (err.code === 11000 && clientId) {
      const existing = await Message.findOne({ senderId, clientMsgId: clientId }).populate('senderId', 'firstName lastName role').lean();
      if (existing) return deliverDuplicate(chatNamespace, existing, conversationId, senderId);
    }
    throw err;
  }
  await message.populate('senderId', 'firstName lastName role');

  // Only ever moves forward: two sends finishing out of order used to leave
  // the older one as the "last message".
  await Conversation.updateOne(
    { _id: conversationId, $or: [{ 'lastMessage.timestamp': { $lte: message.createdAt } }, { 'lastMessage.timestamp': { $exists: false } }, { 'lastMessage.timestamp': null }] },
    { $set: { lastMessage: { text: body.slice(0, PREVIEW), senderId, timestamp: message.createdAt } } }
  );

  const formattedMessage = formatMessage(message, { conversationId });
  const receiverId = String(other.userId);

  if (chatNamespace) {
    // The receiver's copy, in the conversation room. `.except` the sender's
    // user room: the sender is in this room too, and a plain broadcast
    // delivered them their own message as an incoming one (every message
    // appeared twice). Excluding the user room covers all of their tabs.
    chatNamespace.to(`conversation:${conversationId}`).except(`user:${senderId}`).emit('message:receive', { ...formattedMessage, isSentByMe: false });
    // The sender's copy, to all their tabs: reconciles the "sending…" bubble
    // (matched by clientMsgId) with the stored message.
    chatNamespace.to(`user:${senderId}`).emit('message:receive', { ...formattedMessage, isSentByMe: true });
    // The receiver's personal room: a notice even when this thread isn't open.
    chatNamespace.to(`user:${receiverId}`).emit('message:notification', { conversationId: String(conversationId), message: formattedMessage, senderName: formattedMessage.senderName });
  }
  if (io) {
    new SocketEmitter(io).emitToUser(receiverId, 'chat:new-message', { conversationId: String(conversationId), senderName: formattedMessage.senderName });
  }

  return { message, formattedMessage, receiverId, duplicate: false };
}

function deliverDuplicate(chatNamespace, existing, conversationId, senderId) {
  const formattedMessage = formatMessage(existing, { conversationId });
  if (chatNamespace) chatNamespace.to(`user:${senderId}`).emit('message:receive', { ...formattedMessage, isSentByMe: true });
  return { message: existing, formattedMessage, receiverId: String(existing.receiverId), duplicate: true };
}

/**
 * Mark a conversation read for one person. Only on purpose (the thread is on
 * screen) — opening a thread's history used to count as reading it, and so
 * did the in-call chat merely being mounted. Never touches the list order
 * (timestamps: false): reading used to bump the thread to the top for both.
 * The person's other tabs and dashboards are told, so their badges follow.
 */
async function markConversationRead(io, chatNamespace, conversationId, userId) {
  const mongoose = require('mongoose');
  const result = await Message.updateMany(
    { conversationId, receiverId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { 'participants.$[me].lastReadAt': new Date() } },
    { arrayFilters: [{ 'me.userId': new mongoose.Types.ObjectId(String(userId)) }], timestamps: false }
  );
  if (result.modifiedCount > 0) {
    if (chatNamespace) chatNamespace.to(`user:${userId}`).emit('conversation:read', { conversationId: String(conversationId) });
    if (io) new SocketEmitter(io).emitToUser(String(userId), 'chat:read', { conversationId: String(conversationId) });
  }
  return { marked: result.modifiedCount };
}

module.exports = {
  sendMessageAndNotify,
  markConversationRead,
  hasBookedRelationship,
  chatWindow,
  chatWindowsForUser,
  canChat,
  formatMessage,
  formatChatTime,
  RELATIONSHIP_PAYMENT_STATES,
  CHAT_WINDOW_DAYS,
  MAX_TEXT
};
