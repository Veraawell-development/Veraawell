/**
 * Availability Controller
 * Manages doctor availability — slots, booking, and calendar
 */

const DoctorAvailability = require('../models/doctorAvailability');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { NotFoundError, AuthorizationError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('AVAILABILITY-CTRL');

/** GET /api/availability/doctor/current — Logged-in doctor's own availability */
const getCurrentDoctorAvailability = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can access this');
  const userId = req.user._id.toString();

  let availability = await DoctorAvailability.findOne({ doctorId: userId });
  if (!availability) {
    availability = new DoctorAvailability({ doctorId: userId, availabilityType: 'same_slots', defaultSlots: [], activeDates: [], customAvailability: [] });
    await availability.save();
  }
  res.json(availability);
});

/** GET /api/availability/doctor/:doctorId — A specific doctor's availability (public) */
const getDoctorAvailabilityById = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) {
    return res.json({ availabilityType: 'same_slots', defaultSlots: [], activeDates: [], customAvailability: [] });
  }
  res.json(availability);
});

/** POST /api/availability/save — Save doctor's availability settings */
const saveAvailability = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can set availability');
  const userId = req.user._id.toString();
  const { availabilityType, defaultSlots, customAvailability, activeDates } = req.body;

  let availability = await DoctorAvailability.findOne({ doctorId: userId });
  if (availability) {
    availability.availabilityType = availabilityType;
    availability.defaultSlots = defaultSlots || [];
    availability.customAvailability = customAvailability || [];
    availability.activeDates = activeDates || [];
  } else {
    availability = new DoctorAvailability({ doctorId: userId, availabilityType, defaultSlots: defaultSlots || [], customAvailability: customAvailability || [], activeDates: activeDates || [] });
  }
  await availability.save();
  logger.info('Availability saved', { doctorId: userId.substring(0, 8) });
  res.json({ success: true, message: 'Availability saved successfully', availability });
});

/** GET /api/availability/slots/:doctorId/:date — Get available slots for a date */
const getSlots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.params;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) return res.json({ slots: [] });
  const slots = availability.getAvailableSlotsForDate(date);
  res.json({ slots: slots.filter(s => !s.isBooked) });
});

/** POST /api/availability/book-slot — Book a slot during session booking */
const bookSlot = asyncHandler(async (req, res) => {
  const { doctorId, date, time, sessionId } = req.body;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) throw new NotFoundError('Doctor availability');

  if (!availability.isSlotAvailable(date, time)) {
    return res.status(400).json({ success: false, message: 'Slot is not available' });
  }
  const booked = await availability.bookSlot(date, time, sessionId);
  if (booked) res.json({ success: true, message: 'Slot booked successfully' });
  else res.status(400).json({ success: false, message: 'Failed to book slot' });
});

/** POST /api/availability/release-slot — Release a slot (cancellation) */
const releaseSlot = asyncHandler(async (req, res) => {
  const { doctorId, date, time } = req.body;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) throw new NotFoundError('Doctor availability');
  const released = await availability.releaseSlot(date, time);
  res.json({ success: true, message: released ? 'Slot released successfully' : 'Slot release not needed or already released' });
});

/** GET /api/availability/upcoming-sessions — Upcoming sessions for calendar (Doctor only) */
const getUpcomingSessions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can access this');
  const userId = req.user._id.toString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingSessions = await Session.find({ doctorId: userId, status: 'scheduled', sessionDate: { $gte: today.toISOString().split('T')[0] } })
    .populate('patientId', 'firstName lastName')
    .sort({ sessionDate: 1, sessionTime: 1 })
    .limit(20);

  res.json(upcomingSessions);
});

module.exports = { getCurrentDoctorAvailability, getDoctorAvailabilityById, saveAvailability, getSlots, bookSlot, releaseSlot, getUpcomingSessions };
