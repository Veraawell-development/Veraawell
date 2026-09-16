/**
 * Session Report Controller
 * Handles post-session reports shared between doctor and patient
 */

const SessionReport = require('../models/sessionReport');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger, shortId } = require('../utils/logger');

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
  // this actor is one of its two parties.
  const { sessionId } = req.params;
  const reports = await SessionReport.find({ sessionId }).populate('doctorId', 'firstName lastName').sort({ createdAt: -1 }).lean();
  res.json({ success: true, reports });
});

/** POST /api/session-reports — Create a new report (Doctor only) */
const createReport = asyncHandler(async (req, res) => {
  const userId = req.actor.id;
  const { reportType, title, content, attachments } = req.body;
  // Server-derived from the session authorize('session-report:create') verified.
  const { sessionId, patientId } = req.authz.derived;

  const report = new SessionReport({ sessionId, patientId, doctorId: userId, reportType, title, content, attachments: attachments || [] });
  await report.save();
  await report.populate('doctorId', 'firstName lastName');
  await report.populate('sessionId', 'sessionDate sessionTime');

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
