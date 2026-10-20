/**
 * Chat socket (the /chat namespace).
 *
 * Every event goes through the guarded registrar (authz/socket.js): the
 * participant policy, a shape check and a rate limit. Sending is
 * acknowledged — {ok:true, message} or {ok:false, code, message} — so the app
 * can show "Not sent — Retry"; failures used to be a generic 'error' event
 * nobody listened to, and an unsent message looked sent. Storage and delivery
 * are services/chat.service.js, shared with the REST fallback.
 *
 * Reading is not a side effect of joining any more (PUT /chat/conversation/
 * :id/read, when the thread is actually on screen). Typing indicators were
 * never wired up in the app and are gone.
 */

const { sendMessageAndNotify } = require('../services/chat.service');
const { createSocketAuthMiddleware } = require('./authMiddleware');
const { createGuardedRegistrar } = require('../authz/socket');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CHAT-SOCKET');
const socketAuthMiddleware = createSocketAuthMiddleware('CHAT-AUTH');

const OBJECT_ID = /^[a-f0-9]{24}$/i;
/** The conversation id, sent bare or as {conversationId}; a malformed one is a 400, not a server error. */
function conversationIdError(payload) {
  const id = typeof payload === 'string' ? payload : payload && payload.conversationId;
  return typeof id === 'string' && OBJECT_ID.test(id) ? null : 'A valid conversationId is required';
}
function sendError(p) {
  const e = conversationIdError(p);
  if (e) return e;
  if (typeof p.text !== 'string') return 'text is required';
  if (p.clientMsgId !== undefined && p.clientMsgId !== null && (typeof p.clientMsgId !== 'string' || p.clientMsgId.length > 64)) return 'clientMsgId is invalid';
  return null;
}

/** What the app shows when a send is refused (raw errors stay in the log). */
const SAFE_CODES = new Set(['INVALID_MESSAGE', 'MESSAGE_TOO_LONG', 'CHAT_NOT_OPEN', 'CHAT_CLOSED', 'RECIPIENT_UNAVAILABLE', 'ACCESS_DENIED']);

const reply = (ack, value) => { if (typeof ack === 'function') ack(value); };

const initializeChatSocket = (io) => {
  const chatNamespace = io.of('/chat');
  chatNamespace.use(socketAuthMiddleware);

  chatNamespace.on('connection', (socket) => {
    const { on } = createGuardedRegistrar(socket, { tag: 'CHAT' });

    // Every message for this person, whichever thread is open.
    socket.join(`user:${socket.userId}`);

    on('conversation:join', {
      mode: 'policy', action: 'conversation:participate', key: 'conversationId',
      validate: conversationIdError, rate: { perSec: 2, burst: 10 }
    }, (payload, { resource, ack }) => {
      socket.join(`conversation:${String(resource._id)}`);
      reply(ack, { ok: true });
    });

    on('conversation:leave', {
      mode: 'policy', action: 'conversation:participate', key: 'conversationId',
      validate: conversationIdError, rate: { perSec: 2, burst: 10 }
    }, (payload, { resource, ack }) => {
      socket.leave(`conversation:${String(resource._id)}`);
      reply(ack, { ok: true });
    });

    // About six database operations per message: limited per socket, and a
    // socket that keeps flooding is cut off (authz/socket.js).
    on('message:send', {
      mode: 'policy', action: 'conversation:participate', key: 'conversationId',
      validate: sendError, rate: { perSec: 1, burst: 8 }
    }, async (data, { resource, ack }) => {
      try {
        const { formattedMessage, duplicate } = await sendMessageAndNotify(io, chatNamespace, {
          conversationId: String(resource._id),
          senderId: socket.userId,
          text: data.text,
          clientMsgId: data.clientMsgId
        });
        reply(ack, { ok: true, message: { ...formattedMessage, isSentByMe: true }, duplicate });
      } catch (error) {
        const code = SAFE_CODES.has(error.code) ? error.code : 'SEND_FAILED';
        if (code === 'SEND_FAILED') logger.error('Error sending message', { error: error.message });
        reply(ack, { ok: false, code, message: code === 'SEND_FAILED' ? 'Your message could not be sent. Please try again.' : error.message });
      }
    });

    on('disconnect', { mode: 'open' }, () => {});
  });

  logger.info('Chat Socket.IO namespace initialized on /chat');
  return chatNamespace;
};

module.exports = { initializeChatSocket };
