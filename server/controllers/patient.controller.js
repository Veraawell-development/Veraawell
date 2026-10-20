/**
 * Patient Controller
 * Handles patient-specific operations — emergency contacts and doctor's patient list
 */

const Session = require('../models/session');
const User = require('../models/user');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');
const { readEmergencyContact } = require('../utils/phone');

const logger = createLogger('PATIENT-CTRL');

/**
 * POST /api/patients/emergency-contact — save the patient's emergency
 * contact, or remove it when all three fields are empty. The phone is checked
 * and stored as +91 and ten digits; it used to be saved as typed, unchecked.
 */
const saveEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const { contactName, contactPhone, contactRelationship } = req.body || {};

  if (req.user.role !== 'patient') throw new AuthorizationError('Only patients can set emergency contact');
  const read = readEmergencyContact({ name: contactName, phone: contactPhone, relationship: contactRelationship });
  if (read.error) return res.status(400).json({ success: false, message: read.error });

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  user.emergencyContact = read.clear ? { name: null, phone: null, relationship: null } : read.contact;
  await user.save();

  logger.info(read.clear ? 'Emergency contact removed' : 'Emergency contact saved', { userId: userId.substring(0, 8) });
  res.json({
    success: true,
    message: read.clear ? 'Emergency contact removed' : 'Emergency contact saved',
    emergencyContact: user.emergencyContact
  });
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

  // Only real bookings: a checkout row exists before payment, so everyone who
  // ever opened and closed Razorpay used to be listed here, email included.
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  const sessions = await Session.find({ doctorId, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } })
    .populate('patientId', 'firstName lastName email').lean();

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
