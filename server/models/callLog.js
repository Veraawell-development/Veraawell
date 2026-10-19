/**
 * One record per session's call: how it connected, how often it had to
 * recover, why it failed. Kept apart from Session so the session document
 * the policy checks read on every request stays small. Expires after 180 days.
 *
 * This is how call reliability is measured instead of guessed — the admin
 * Calls tab (routes/adminCalls.routes.js) reads it.
 */
const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  browser: { type: String, default: null },
  os: { type: String, default: null },
  appVersion: { type: String, default: null },
  candidateType: { type: String, enum: ['host', 'srflx', 'prflx', 'relay', null], default: null },
  timeToConnectMs: { type: Number, default: null }
}, { _id: false });

const callLogSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, unique: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  mode: { type: String, enum: ['video', 'voice', null], default: null },
  firstJoinAt: { type: Date, default: null },
  connectedAt: { type: Date, default: null },
  relayUsed: { type: Boolean, default: false },
  attempts: { type: Number, default: 0 },
  reconnects: { type: Number, default: 0 },
  iceRestarts: { type: Number, default: 0 },
  serverRestarts: { type: Number, default: 0 },
  failures: {
    type: [{ _id: false, at: Date, party: String, reason: String, detail: String }],
    default: []
  },
  parties: {
    patient: { type: partySchema, default: () => ({}) },
    doctor: { type: partySchema, default: () => ({}) }
  },
  quality: {
    rttAvgMs: { type: Number, default: null },
    lossPct: { type: Number, default: null },
    samples: { type: Number, default: 0 }
  },
  endedAt: { type: Date, default: null },
  endReason: { type: String, default: null },
  expireAt: { type: Date, default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

callLogSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
callLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
