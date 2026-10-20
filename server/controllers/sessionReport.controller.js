/**
 * Session Report Controller
 * Handles post-session reports shared between doctor and patient
 */

const SessionReport = require('../models/sessionReport');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger, shortId } = require('../utils/logger');
const { isOwnCloudinaryUrl } = require('../utils/cloudinaryUrl');

const logger = createLogger('SESSION-REPORT-CTRL');

/** GET /api/session-reports/patient/:patientId */
const getReportsByPatient = asyncHandler(async (req, res) => {
  // This handler used to gate on `userId !== patientId && role !== 'doctor'`,
  // which reads as "any doctor may see this" rather than "the treating doctor
  // may see this". Verified: an unrelated doctor retrieved a stranger's report
  // titled "PHI: suicidal ideation notes".
  //
  // withScope('session-report:list-by-patient') now requires an actual
  // doctor-patient Session to exist, and returns DENY otherwise.
  const reports = await SessionReport.find(req.authz.scope)
    .populate('sessionId', 'sessionDate sessionTime')
    .populate('doctorId', 'firstName lastName')
    .sort({ createdAt: -1 }).lean();
  res.json({ success: true, reports });
});

/** GET /api/session-reports/session/:sessionId */
const getReportsBySession = asyncHandler(async (req, res) => {
  // authorize('session:read') has already loaded the session and confirmed
  // this actor is one of its two parties. Being a party is not the same as
  // being shown everything: a patient sees only the reports shared with them,
  // as on every other report read. This route returned unshared ones too.
  const { sessionId } = req.params;
  const query = { sessionId };
  if (req.actor.role === 'patient') query.isSharedWithPatient = true;
  const reports = await SessionReport.find(query).populate('doctorId', 'firstName lastName').sort({ createdAt: -1 }).lean();
  res.json({ success: true, reports });
});

/**
 * Attachments are URLs from an earlier upload; only ones that point into our
 * own Cloudinary account are accepted (see utils/cloudinaryUrl.js), and only
 * the two fields the schema stores. Returns null when any entry is invalid.
 */
function cleanAttachments(attachments) {
  if (attachments === undefined || attachments === null) return [];
  if (!Array.isArray(attachments) || attachments.length > 10) return null;
  const out = [];
  for (const a of attachments) {
    if (!a || typeof a !== 'object' || !isOwnCloudinaryUrl(a.url)) return null;
    out.push({ filename: typeof a.filename === 'string' ? a.filename.slice(0, 255) : undefined, url: a.url });
  }
  return out;
}

/** POST /api/session-reports — Create a new report (Doctor only) */
const createReport = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  const { reportType, title, content, attachments } = req.body;
  // Server-derived from the session authorize('session-report:create') verified.
  const { sessionId, patientId } = req.authz.derived;

  const cleanedAttachments = cleanAttachments(attachments);
  if (!cleanedAttachments) {
    return res.status(400).json({ success: false, message: 'Attachments must be files uploaded through this service' });
  }

  const report = new SessionReport({ sessionId, patientId, doctorId: userId, reportType, title, content, attachments: cleanedAttachments });
  await report.save();
  await report.populate('doctorId', 'firstName lastName');
  await report.populate('sessionId', 'sessionDate sessionTime');

  require('../services/liveUpdates').clinicalUpdated(req.app.get('io'), patientId, 'report');
  logger.info('Session report created', { reportId: shortId(report._id) });
  res.status(201).json({ success: true, report });
});

/** GET /api/session-reports/:reportId — Get a single report */
const getReportById = asyncHandler(async (req, res) => {
  // authorize('session-report:read') loaded and authorized the record; this
  // re-reads it only to attach the populated fields the response needs.
  const report = await SessionReport.findById(req.authz.resource._id)
    .populate('sessionId', 'sessionDate sessionTime patientId doctorId')
    .populate('doctorId', 'firstName lastName')
    .lean();
  res.json({ success: true, report });
});

module.exports = { getReportsByPatient, getReportsBySession, createReport, getReportById };
