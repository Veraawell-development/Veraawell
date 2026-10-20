const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['patient', 'doctor'],
      required: true
    },
    lastReadAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    text: String,
    senderId: mongoose.Schema.Types.ObjectId,
    timestamp: Date
  },
  // The two user ids, sorted and joined: one conversation per pair. Without a
  // unique key, two "find or create" calls at once (both people opening the
  // in-call chat) created two threads and split the history between them.
  // Sparse: rows from before it existed get it from
  // migrations/conversationPairKeys.js (which also merges duplicates).
  pairKey: { type: String, unique: true, sparse: true },
  // Track if this conversation is based on a session
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// The list: a user's conversations, latest message first.
conversationSchema.index({ 'participants.userId': 1, 'lastMessage.timestamp': -1 });

/** One key per pair of people, whatever order they're given in. */
function pairKeyOf(a, b) {
  return [String(a), String(b)].sort().join('_');
}
conversationSchema.statics.pairKeyOf = pairKeyOf;

/**
 * The conversation between two people, created if there is none — at most
 * one, even when two callers ask at the same moment (an upsert on the unique
 * pair key; a duplicate-key race just reads the winner).
 */
conversationSchema.statics.findOrCreateConversation = async function(user1Id, user2Id, sessionId = null) {
  const pairKey = pairKeyOf(user1Id, user2Id);
  // A thread from before pair keys: adopt it rather than starting a second.
  const legacy = await this.findOne({ pairKey: { $exists: false }, 'participants.userId': { $all: [user1Id, user2Id] } }).select('_id');
  if (legacy) {
    await this.updateOne({ _id: legacy._id, pairKey: { $exists: false } }, { $set: { pairKey } }, { timestamps: false }).catch(() => {});
    return this.findById(legacy._id).populate('participants.userId', 'firstName lastName email role');
  }

  const User = mongoose.model('User');
  const [user1, user2] = await Promise.all([User.findById(user1Id).select('role'), User.findById(user2Id).select('role')]);
  if (!user1 || !user2) throw new Error('Users not found');

  const insert = {
    participants: [
      { userId: user1Id, role: user1.role },
      { userId: user2Id, role: user2.role }
    ],
    sessionId
  };
  try {
    await this.updateOne({ pairKey }, { $setOnInsert: { pairKey, ...insert } }, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err; // the other caller created it first
  }
  return this.findOne({ pairKey }).populate('participants.userId', 'firstName lastName email role');
};

/** A user's conversations, the one with the latest message first. */
conversationSchema.statics.getConversationsForUser = async function(userId) {
  return this.find({ 'participants.userId': userId })
    .populate('participants.userId', 'firstName lastName email role status approvalStatus deletedAt')
    .sort({ 'lastMessage.timestamp': -1, createdAt: -1 });
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
