/**
 * Patient Controller
 * Handles patient-specific operations — emergency contacts and doctor's patient list
 */

const Session = require('../models/session');
const User = require('../models/user');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('PATIENT-CTRL');

/** POST /api/patients/emergency-contact — Save patient emergency contact */
const saveEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { contactName, contactPhone, contactRelationship } = req.body;

  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can set emergency contact');
  if (!contactName || !contactPhone || !contactRelationship) {
    return res.status(400).json({ success: false, message: 'Contact name, phone, and relationship are required' });
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  user.emergencyContact = { name: contactName, phone: contactPhone, relationship: contactRelationship };
  await user.save();

  logger.info('Emergency contact saved', { userId: userId.substring(0, 8) });
  res.json({ success: true, message: 'Emergency contact saved successfully', emergencyContact: user.emergencyContact });
});

/** GET /api/patients/emergency-contact — Get patient emergency contact */
const getEmergencyContact = asyncHandler(async (req, res) => {
  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can view emergency contact');
  const user = await User.findById(req.user._id).select('emergencyContact');
  if (!user) throw new NotFoundError('User');
  res.json({ success: true, emergencyContact: user.emergencyContact || null });
});

/** GET /api/patients/doctor-patients — All patients for a doctor with session details */
const getDoctorPatients = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can view patient details');
  const doctorId = req.user._id.toString();

  const sessions = await Session.find({ doctorId }).populate('patientId', 'firstName lastName email').lean();

  const patientMap = new Map();
  sessions.forEach(session => {
    if (!session.patientId) return;
    const patientId = session.patientId._id.toString();
    if (!patientMap.has(patientId)) {
      patientMap.set(patientId, {
        _id: patientId,
        name: `${session.patientId.firstName} ${session.patientId.lastName}`,
        email: session.patientId.email,
        sessions: []
      });
    }
    patientMap.get(patientId).sessions.push({ sessionId: session._id, sessionType: session.sessionType, sessionDate: session.sessionDate, status: session.status, notes: session.sessionNotes });
  });

  const patients = Array.from(patientMap.values()).map(patient => {
    let occupation = 'Not specified', issue = 'Not specified';
    for (const session of patient.sessions) {
      if (session.notes) {
        const occupationMatch = session.notes.match(/occupation[:\s]+([^,\n]+)/i);
        if (occupationMatch) occupation = occupationMatch[1].trim();
        const issueMatch = session.notes.match(/(?:issue|concern|problem)[:\s]+([^,\n]+)/i);
        if (issueMatch) issue = issueMatch[1].trim();
      }
    }
    return { _id: patient._id, name: patient.name, email: patient.email, occupation, issue, totalSessions: patient.sessions.length, sessions: patient.sessions };
  });

  logger.info('Doctor patients fetched', { doctorId: doctorId.substring(0, 8), count: patients.length });
  res.json(patients);
});

module.exports = { saveEmergencyContact, getEmergencyContact, getDoctorPatients };
