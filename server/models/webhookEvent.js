const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  eventType: { type: String },
  processedAt: { type: Date, default: Date.now }
});

// Auto-delete records older than 30 days to keep collection small
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
