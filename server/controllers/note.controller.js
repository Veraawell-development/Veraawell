/**
 * Session Note Controller
 * Handles all session note operations — create, read (by session/patient/doctor)
 */

const SessionNote = require('../models/sessionNote');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('NOTE-CTRL');

/**
 * POST /api/session-tools/notes
 * Create a session note (Doctor only)
 */
const createNote = asyncHandler(async (req, res) => {
  const { sessionId, patientId, content, mood, topicsDiscussed, progressInsights, therapeuticTechniques, isPrivate } = req.body;
  const doctorId = req.user._id.toString();

  if (req.user.role !== 'doctor') {
    throw new AuthorizationError('Only doctors can create session notes');
  }

  const session = await Session.findById(sessionId);
  if (!session) throw new NotFoundError('Session');

  const sessionDoctorId = session.doctorId?._id?.toString() || session.doctorId?.toString();
  if (sessionDoctorId !== doctorId) {
    throw new AuthorizationError('Unauthorized to create notes for this session');
  }

  const note = new SessionNote({ sessionId, doctorId, patientId, content, mood, topicsDiscussed, progressInsights, therapeuticTechniques, isPrivate: isPrivate || false });
  await note.save();

  const populatedNote = await SessionNote.findById(note._id)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName');

  logger.info('Session note created', { noteId: note._id.toString().substring(0, 8), doctorId: doctorId.substring(0, 8) });
  res.status(201).json({ success: true, message: 'Session note created successfully', note: populatedNote });
});

/**
 * GET /api/session-tools/notes/session/:sessionId
 * Get notes for a specific session
 */
const getNotesBySession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role;

  let query = { sessionId };
  if (userRole === 'patient') {
    query.isPrivate = false;
    query.patientId = userId;
  } else if (userRole === 'doctor') {
    query.doctorId = userId;
  }

  const notes = await SessionNote.find(query)
    .populate('doctorId', 'firstName lastName')
    .populate('patientId', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.json({ success: true, notes });
});

/**
 * GET /api/session-tools/notes/patient/:patientId
 * Get all notes for a patient
 */
const getNotesByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const userId = req.user._id.toString();
  const userRole = req.user.role;

  if (userRole === 'patient' && userId !== patientId) {
    throw new AuthorizationError('Unauthorized');
  }

  let query = { patientId };
  if (userRole === 'patient') query.isPrivate = false;
  else if (userRole === 'doctor') query.doctorId = userId;

  const notes = await SessionNote.find(query)
    .populate('doctorId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, notes });
});

/**
 * GET /api/session-tools/notes/doctor/:doctorId
 * Get all notes created by a doctor
 */
const getNotesByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const userId = req.user._id.toString();

  if (userId !== doctorId) throw new AuthorizationError('Unauthorized');

  const notes = await SessionNote.find({ doctorId })
    .populate('patientId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, notes });
});

module.exports = { createNote, getNotesBySession, getNotesByPatient, getNotesByDoctor };
