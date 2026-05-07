/**
 * Session Report Controller
 * Handles post-session reports shared between doctor and patient
 */

const SessionReport = require('../models/sessionReport');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-REPORT-CTRL');

/** GET /api/session-reports/patient/:patientId */
const getReportsByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const userId = req.user._id.toString();
  if (userId !== patientId && req.user.role !== 'doctor') throw new AuthorizationError('Unauthorized access');
  const reports = await SessionReport.find({ patientId, isSharedWithPatient: true })
    .populate('sessionId', 'sessionDate sessionTime')
    .populate('doctorId', 'firstName lastName')
    .sort({ createdAt: -1 }).lean();
  res.json({ success: true, reports });
});

/** GET /api/session-reports/session/:sessionId */
const getReportsBySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.patientId.toString() !== userId && session.doctorId.toString() !== userId) throw new AuthorizationError('Unauthorized access');
  const reports = await SessionReport.find({ sessionId }).populate('doctorId', 'firstName lastName').sort({ createdAt: -1 }).lean();
  res.json({ success: true, reports });
});

/** POST /api/session-reports — Create a new report (Doctor only) */
const createReport = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can create reports');
  const userId = req.user._id;
  const { sessionId, reportType, title, content, attachments } = req.body;

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');
  if (session.doctorId.toString() !== userId.toString()) throw new AuthorizationError('You can only create reports for your own sessions');

  const report = new SessionReport({ sessionId, patientId: session.patientId, doctorId: userId, reportType, title, content, attachments: attachments || [] });
  await report.save();
  await report.populate('doctorId', 'firstName lastName');
  await report.populate('sessionId', 'sessionDate sessionTime');

  logger.info('Session report created', { reportId: report._id.toString().substring(0, 8) });
  res.status(201).json({ success: true, report });
});

/** GET /api/session-reports/:reportId — Get a single report */
const getReportById = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const userId = req.user._id.toString();
  const report = await SessionReport.findById(reportId).populate('sessionId', 'sessionDate sessionTime patientId doctorId').populate('doctorId', 'firstName lastName').lean();
  if (!report) throw new NotFoundError('Report');
  if (report.patientId.toString() !== userId && report.doctorId._id.toString() !== userId) throw new AuthorizationError('Unauthorized access');
  res.json({ success: true, report });
});

module.exports = { getReportsByPatient, getReportsBySession, createReport, getReportById };
