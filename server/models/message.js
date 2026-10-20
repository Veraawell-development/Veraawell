const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  // The sender's own id for this message (a retry after a timeout carries
  // the same one), so a message is stored once however often it is sent.
  clientMsgId: { type: String, maxlength: 64 },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// A thread, in order (with _id breaking ties between equal times).
messageSchema.index({ conversationId: 1, createdAt: -1, _id: -1 });
// Unread counts: was a scan of the whole collection.
messageSchema.index({ receiverId: 1, isRead: 1, conversationId: 1 });
// One message per (sender, client id): retries don't duplicate.
messageSchema.index({ senderId: 1, clientMsgId: 1 }, { unique: true, partialFilterExpression: { clientMsgId: { $type: 'string' } } });

/**
 * A page of a thread, oldest first. Cursor-based — `skip` shifted under new
 * messages, giving duplicates and gaps:
 *   - latest `limit` messages (no cursor);
 *   - `before`: the `limit` messages older than that message (scrolling up);
 *   - `after`: messages newer than that message (catching up after a
 *     reconnect), oldest first, up to `limit`.
 * A cursor is { createdAt, _id } of a message in this conversation.
 */
messageSchema.statics.getPage = async function(conversationId, { limit = 50, before = null, after = null } = {}) {
  const filter = { conversationId };
  if (before) filter.$or = [{ createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before._id } }];
  if (after) filter.$or = [{ createdAt: { $gt: after.createdAt } }, { createdAt: after.createdAt, _id: { $gt: after._id } }];
  const ascending = !!after;
  const rows = await this.find(filter)
    .populate('senderId', 'firstName lastName role')
    .sort(ascending ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return { messages: ascending ? page : page.reverse(), hasMore };
};

// Static method to mark messages as read
messageSchema.statics.markAsRead = async function(conversationId, userId) {
  const result = await this.updateMany(
    {
      conversationId,
      receiverId: userId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
  
  return result;
};

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
