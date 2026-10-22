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
  // ever opened and closed Razorpay used to be listed here.
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  const sessions = await Session.find({ doctorId, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } })
    .select('patientId startsAt endsAt duration status sessionType callMode outcome paymentStatus refundAmount cancelledBy lateCancellation')
    .populate('patientId', 'firstName lastName')
    .sort({ startsAt: -1 })
    .lean();

  // What the card used to show — an "occupation" and "primary issue" pulled
  // out of free-text notes by regex (always "Not specified"), every session
  // counted including cancelled ones, and the patient's email, which this
  // screen never needs — is replaced by facts from the sessions themselves.
  const now = Date.now();
  const byPatient = new Map();
  for (const s of sessions) {
    if (!s.patientId) continue;
    const id = String(s.patientId._id);
    if (!byPatient.has(id)) {
      byPatient.set(id, {
        _id: id,
        firstName: s.patientId.firstName,
        lastName: s.patientId.lastName,
        name: `${s.patientId.firstName || ''} ${s.patientId.lastName || ''}`.trim(),
        completedSessions: 0,
        upcomingSessions: 0,
        lastSessionAt: null,
        nextSessionAt: null,
        sessions: [],
      });
    }
    const p = byPatient.get(id);
    const startsAt = s.startsAt ? new Date(s.startsAt) : null;
    if (s.status === 'completed') {
      p.completedSessions += 1;
      if (startsAt && (!p.lastSessionAt || startsAt > p.lastSessionAt)) p.lastSessionAt = startsAt;
    }
    if ((s.status === 'scheduled' || s.status === 'active') && startsAt && startsAt.getTime() >= now - 60 * 60 * 1000) {
      p.upcomingSessions += 1;
      if (!p.nextSessionAt || startsAt < p.nextSessionAt) p.nextSessionAt = startsAt;
    }
    if (p.sessions.length < 20) {
      p.sessions.push({
        _id: s._id, startsAt: s.startsAt, endsAt: s.endsAt, duration: s.duration, status: s.status,
        sessionType: s.sessionType, callMode: s.callMode, outcome: s.outcome,
        paymentStatus: s.paymentStatus, refundAmount: s.refundAmount,
        cancelledBy: s.cancelledBy, lateCancellation: !!s.lateCancellation,
      });
    }
  }

  // Next session first, then most recently seen.
  const patients = [...byPatient.values()].sort((x, y) =>
    (x.nextSessionAt ? 0 : 1) - (y.nextSessionAt ? 0 : 1)
    || (x.nextSessionAt && y.nextSessionAt ? x.nextSessionAt - y.nextSessionAt : 0)
    || (y.lastSessionAt || 0) - (x.lastSessionAt || 0));

  logger.info('Doctor patients fetched', { doctorId: doctorId.substring(0, 8), count: patients.length });
  res.json(patients);
});

module.exports = { saveEmergencyContact, getEmergencyContact, getDoctorPatients };
