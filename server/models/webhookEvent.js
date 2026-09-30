const mongoose = require('mongoose');

/**
 * One row per Razorpay webhook event id — the exactly-once record.
 *
 * A row is a CLAIM first and a receipt second. It is inserted as
 * 'processing' before the handler runs and only becomes 'done' once the
 * handler has succeeded. It used to be written as a finished receipt up
 * front, so a delivery that failed halfway (a DB blip inside
 * payment.captured, say) returned 500, Razorpay retried — and the retry was
 * answered "already_processed" and dropped. A captured payment could be lost
 * for good that way. See controllers/payment.controller.js claimWebhookEvent.
 */
const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventType: { type: String },
  // Rows written before this field existed were receipts of events whose
  // processing had at least started, and were always treated as handled.
  // Defaulting to 'done' keeps that meaning for them.
  status: {
    type: String,
    enum: ['processing', 'done'],
    default: 'done'
  },
  /** When the current attempt took the claim. A stale claim can be taken over. */
  claimedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: Date.now }
});

// Auto-delete records older than 30 days to keep collection small
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
