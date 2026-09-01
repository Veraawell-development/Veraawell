/**
 * Conversation / message permissions.
 *
 * The socket handlers for `typing:start` and `typing:stop` took a
 * conversationId from the payload and broadcast into that room with no
 * membership check, so anyone could inject typing indicators into any
 * conversation. `conversation:join` and `message:send` did check — this
 * policy replaces those two inline checks as well, so all four events answer
 * to the same rule rather than to two implementations of it.
 */

const Conversation = require('../../models/conversation');
const { idOf } = require('../actor');
const { CODE } = require('../errors');

module.exports = {
  subject: 'Conversation',
  locate: { from: 'params', key: 'conversationId' },
  load: (id) => Conversation.findById(id),

  rules: {
    'conversation:participate': ({ actor, resource }) =>
      (resource.participants || []).some((p) => p.userId && idOf(p.userId) === actor.id) || {
        allow: false,
        code: CODE.NOT_PARTICIPANT,
        message: 'You are not a participant in this conversation'
      }
  }
};
