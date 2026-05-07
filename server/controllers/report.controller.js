/**
 * Report Controller
 * Handles doctor-generated patient reports — creation, sharing, and viewing
 */

const Report = require('../models/report');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('REPORT-CTRL');

/**
 * POST /api/session-tools/reports
 * Create a report (Doctor only)
 */
const createReport = asyncHandler(async (req, res) => {
  const { sessionId, patientId, title, reportType, content, isSharedWithPatient } = req.body;
  const doctorId = req.user._id.toString();

  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can create reports');

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');

  const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (sessionDoctorId !== doctorId) throw new AuthorizationError('Unauthorized to create reports for this session');

  const report = new Report({
    sessionId, doctorId, patientId, title, reportType, content,
    isSharedWithPatient: isSharedWithPatient !== undefined ? isSharedWithPatient : true
  });
  await report.save();

  // Mark session as having post-session report
  await Session.findByIdAndUpdate(sessionId, { postSessionReportCompleted: true, postSessionReportId: report._id });

  const populatedReport = await Report.findById(report._id)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  logger.info('Report created', { reportId: report._id.toString().substring(0, 8), sessionId: sessionId.substring(0, 8) });
  res.status(201).json({ success: true, message: 'Report created successfully', report: populatedReport });
});

/**
 * GET /api/session-tools/reports/patient/:patientId
 * Get reports for a patient
 */
const getReportsByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role;

  if (userRole === 'patient' && userId !== patientId) throw new AuthorizationError('Unauthorized');

  let query = { patientId };
  if (userRole === 'patient') query.isSharedWithPatient = true;
  else if (userRole === 'doctor') query.doctorId = userId;

  const reports = await Report.find(query)
    .populate('doctorId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, reports });
});

/**
 * GET /api/session-tools/reports/doctor/:doctorId
 * Get all reports created by a doctor
 */
const getReportsByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const userId = req.user._id.toString();

  if (userId !== doctorId) throw new AuthorizationError('Unauthorized');

  const reports = await Report.find({ doctorId })
    .populate('patientId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, reports });
});

/**
 * PUT /api/session-tools/reports/:reportId/view
 * Mark a report as viewed by patient
 */
const markReportViewed = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const userId = req.user._id.toString();

  const report = await Report.findById(reportId);
  if (!report) throw new NotFoundError('Report');
  if (report.patientId.toString() !== userId) throw new AuthorizationError('Unauthorized');

  report.viewedByPatient = true;
  report.viewedAt = new Date();
  await report.save();

  logger.info('Report marked as viewed', { reportId: reportId.substring(0, 8) });
  res.json({ success: true, message: 'Report marked as viewed', report });
});

module.exports = { createReport, getReportsByPatient, getReportsByDoctor, markReportViewed };
