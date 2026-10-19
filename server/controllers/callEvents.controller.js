/**
 * Call statistics: what the browsers report about a call, and the admin's
 * view of it (the Calls tab).
 */
const { asyncHandler } = require('../middleware/error.middleware');
const telemetry = require('../services/call/callTelemetry');

const MAX_EVENTS = 20;
const MAX_BYTES = 16 * 1024;

/** POST /api/sessions/:sessionId/call-events — one of the call's two people. */
const postCallEvents = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (JSON.stringify(body).length > MAX_BYTES) return res.status(413).json({ success: false, message: 'Too large' });
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length > MAX_EVENTS) return res.status(400).json({ success: false, message: `At most ${MAX_EVENTS} events` });
  const valid = events.filter((e) => e && telemetry.EVENT_TYPES.includes(e.type)
    && (e.at === undefined || !Number.isNaN(new Date(e.at).getTime()))
    && (e.data === undefined || (e.data && typeof e.data === 'object')));
  if (valid.length !== events.length) return res.status(400).json({ success: false, message: 'Unknown or malformed event' });
  const session = req.authz.resource;
  const role = String(session.doctorId && (session.doctorId._id || session.doctorId)) === String(req.actor.id) ? 'doctor' : 'patient';
  const client = body.client && typeof body.client === 'object' ? body.client : null;
  const mode = ['video', 'voice'].includes(body.mode) ? body.mode : null;
  await telemetry.noteEvents(String(session._id), role, valid, { client, mode });
  res.status(204).end();
});

/** GET /api/admin/calls/summary?days=7|30 */
const getCallSummary = asyncHandler(async (req, res) => {
  const CallLog = require('../models/callLog');
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const logs = await CallLog.find({ createdAt: { $gte: since } })
    .select('connectedAt relayUsed reconnects failures parties').lean();
  const total = logs.length;
  const connected = logs.filter((l) => l.connectedAt).length;
  const relayed = logs.filter((l) => l.relayUsed).length;
  const times = logs.flatMap((l) => ['patient', 'doctor'].map((r) => l.parties && l.parties[r] && l.parties[r].timeToConnectMs)).filter((t) => typeof t === 'number').sort((a, b) => a - b);
  const reasons = {};
  for (const l of logs) for (const f of l.failures || []) reasons[f.reason] = (reasons[f.reason] || 0) + 1;
  res.json({
    success: true,
    days,
    calls: total,
    connected,
    successRate: total ? Math.round((connected / total) * 1000) / 10 : null,
    relayShare: connected ? Math.round((relayed / connected) * 1000) / 10 : null,
    medianTimeToConnectMs: times.length ? times[Math.floor(times.length / 2)] : null,
    reconnects: logs.reduce((n, l) => n + (l.reconnects || 0), 0),
    failuresByReason: reasons
  });
});

/** GET /api/admin/calls?failed=1&limit=50 */
const listCalls = asyncHandler(async (req, res) => {
  const CallLog = require('../models/callLog');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const filter = req.query.failed === '1' ? { $or: [{ connectedAt: null }, { 'failures.0': { $exists: true } }] } : {};
  const calls = await CallLog.find(filter).sort({ createdAt: -1 }).limit(limit)
    .populate('doctorId', 'firstName lastName').populate('patientId', 'firstName lastName').lean();
  res.json({ success: true, calls });
});

/** GET /api/admin/calls/:sessionId */
const getCall = asyncHandler(async (req, res) => {
  const CallLog = require('../models/callLog');
  const call = await CallLog.findOne({ sessionId: req.params.sessionId })
    .populate('doctorId', 'firstName lastName').populate('patientId', 'firstName lastName').lean();
  if (!call) return res.status(404).json({ success: false, message: 'No statistics for this session' });
  res.json({ success: true, call });
});

module.exports = { postCallEvents, getCallSummary, listCalls, getCall };
