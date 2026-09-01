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
  const { content, mood, topicsDiscussed, progressInsights, therapeuticTechniques, isPrivate } = req.body;
  const doctorId = req.actor.id;

  // sessionId and patientId come from the session that authorize('note:create')
  // already loaded and verified this doctor owns. patientId used to be read
  // from req.body, which let a doctor file a note against any patient id —
  // authorize() now deletes those keys from the body entirely.
  const { sessionId, patientId } = req.authz.derived;

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
  // The filter is the authorization: withScope('note:list-by-session') pins
  // it to this actor and returns DENY for anyone who is neither party.
  const notes = await SessionNote.find(req.authz.scope)
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
  const notes = await SessionNote.find(req.authz.scope)
    .populate('doctorId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .populate('patientId', 'firstName lastName')
    .sort({ createdAt: -1 });

  res.json({ success: true, notes });
});

/**
 * GET /api/session-tools/notes/doctor/:doctorId
 * Get all notes created by a doctor
 */
const getNotesByDoctor = asyncHandler(async (req, res) => {
  const notes = await SessionNote.find(req.authz.scope)
    .populate('patientId', 'firstName lastName')
    .populate('sessionId', 'sessionDate sessionTime')
    .sort({ createdAt: -1 });

  res.json({ success: true, notes });
});

module.exports = { createNote, getNotesBySession, getNotesByPatient, getNotesByDoctor };
