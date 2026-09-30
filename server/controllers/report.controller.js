/**
 * Report Controller
 * Handles doctor-generated patient reports — creation, sharing, and viewing
 */

const Report = require('../models/report');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger, shortId } = require('../utils/logger');

const logger = createLogger('REPORT-CTRL');

/**
 * POST /api/session-tools/reports
 * Create a report (Doctor only)
 */
const createReport = asyncHandler(async (req, res) => {
  const { title, reportType, content, isSharedWithPatient } = req.body;
  const doctorId = req.actor.id;
  // Server-derived from the authorized session — see authz/policies/clinicalRecords.policy.js
  const { sessionId, patientId } = req.authz.derived;

  // Snapshot the signature at filing time — see the field's note on the model.
  const DoctorProfile = require('../models/doctorProfile');
  const signingProfile = await DoctorProfile.findOne({ userId: doctorId }).select('+signature');

  const report = new Report({
    sessionId, doctorId, patientId, title, reportType, content,
    doctorSignature: (signingProfile && signingProfile.signature) || null,
    isSharedWithPatient: isSharedWithPatient !== undefined ? isSharedWithPatient : true
  });
  await report.save();

  // Mark session as having post-session report
  await Session.findByIdAndUpdate(sessionId, { postSessionReportCompleted: true, postSessionReportId: report._id });

  const populatedReport = await Report.findById(report._id)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  logger.info('Report created', { reportId: shortId(report._id), sessionId: shortId(sessionId) });
  res.status(201).json({ success: true, message: 'Report created successfully', report: populatedReport });
});

/**
 * GET /api/session-tools/reports/patient/:patientId
 * Get reports for a patient
 */
const getReportsByPatient = asyncHandler(async (req, res) => {
  const reports = await Report.find(req.authz.scope)
    .populate('doctorId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .populate('patientId', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.json({ success: true, reports });
});

/**
 * GET /api/session-tools/reports/doctor/:doctorId
 * Get all reports created by a doctor
 */
const getReportsByDoctor = asyncHandler(async (req, res) => {
  const reports = await Report.find(req.authz.scope)
    .populate('patientId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, reports });
});

/**
 * GET /api/session-tools/reports/session/:sessionId
 * Get all reports for a specific session — used by the patient-facing
 * SessionReportsModal, which previously (incorrectly) read from the separate,
 * disconnected /api/session-reports system that nothing ever wrote to.
 */
const getReportsBySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  // authorize('session:read') has already confirmed this actor is a party to
  // the session; patients additionally only see reports shared with them.
  const query = { sessionId };
  if (req.actor.role === 'patient') query.isSharedWithPatient = true;

  const reports = await Report.find(query)
    .populate('doctorId', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.json({ success: true, reports });
});

/**
 * PUT /api/session-tools/reports/:reportId/view
 * Mark a report as viewed by patient
 */
const markReportViewed = asyncHandler(async (req, res) => {
  const { reportId } = req.params;

  const report = req.authz.resource;

  report.viewedByPatient = true;
  report.viewedAt = new Date();
  await report.save();

  logger.info('Report marked as viewed', { reportId: shortId(reportId) });
  res.json({ success: true, message: 'Report marked as viewed', report });
});

module.exports = { createReport, getReportsByPatient, getReportsByDoctor, getReportsBySession, markReportViewed };
