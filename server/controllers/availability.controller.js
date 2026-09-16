/**
 * Availability Controller
 * Manages doctor availability — slots, booking, and calendar
 */

const DoctorAvailability = require('../models/doctorAvailability');
const Session = require('../models/session');
const { asyncHandler } = require('../middleware/error.middleware');
const { AuthorizationError } = require('../utils/errors');
const { zonedToUtc, utcToZoned } = require('../utils/zonedTime');
const { PLATFORM_TIMEZONE } = require('../config/time');
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
  await syncBookableUntil(userId, availability);
  logger.info('Availability saved', { doctorId: userId.substring(0, 8) });
  res.json({ success: true, message: 'Availability saved successfully', availability });
});

/**
 * Denormalise "the last date this doctor has slots for" onto their profile.
 *
 * The public directory must not list a therapist whose calendar has run out —
 * that is how a patient reaches a booking page with no times on it, which is
 * exactly what both live doctors looked like: activeDates ending six weeks in
 * the past while they were still listed and still showed a Book button.
 *
 * Availability lives in its own collection, so the directory cannot filter on
 * it without a $lookup — and filtering *after* pagination would return short,
 * ragged pages. One denormalised indexed date keeps the directory a single
 * query. It is derived, never authoritative: DoctorAvailability remains the
 * source of truth and this is recomputed from it on every save.
 */
async function syncBookableUntil(doctorId, availability) {
  const DoctorProfile = require('../models/doctorProfile');
  const { zonedToUtc } = require('../utils/zonedTime');

  const dates = [
    ...(availability.activeDates || []),
    ...(availability.customAvailability || [])
      .filter((day) => day && Array.isArray(day.slots) && day.slots.length > 0)
      .map((day) => day.date)
  ].filter(Boolean);

  let bookableUntil = null;
  if (dates.length > 0) {
    const latest = dates.sort().at(-1);
    try {
      // End of that local day, so a date is "bookable until" its last minute
      // rather than its midnight start.
      bookableUntil = zonedToUtc(latest, '23:59', availability.timezone || PLATFORM_TIMEZONE);
    } catch (err) {
      logger.warn('Could not derive bookableUntil from availability', { doctorId: String(doctorId).substring(0, 8), latest });
    }
  }

  await DoctorProfile.updateOne({ userId: doctorId }, { $set: { bookableUntil } });
  return bookableUntil;
}

/** GET /api/availability/slots/:doctorId/:date — Get available slots for a date */
const getSlots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.params;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) return res.json({ slots: [] });
  const slots = availability.getAvailableSlotsForDate(date);
  res.json({ slots: slots.filter(s => !s.isBooked) });
});

/** GET /api/availability/upcoming-sessions — Upcoming sessions for calendar (Doctor only) */
const getUpcomingSessions = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can access this');
  const userId = req.user._id.toString();
  // This compared a Date-typed field against a 'YYYY-MM-DD' STRING, and used
  // server-local midnight to build it. Query the instant instead.
  const startOfTodayLocal = zonedToUtc(
    utcToZoned(new Date(), PLATFORM_TIMEZONE).localDate, '00:00', PLATFORM_TIMEZONE
  );

  const upcomingSessions = await Session.find({ doctorId: userId, startsAt: { $gte: startOfTodayLocal } })
    .populate('patientId', 'firstName lastName email')
    .sort({ startsAt: 1 })
    .limit(50);

  res.json(upcomingSessions);
});

module.exports = { getCurrentDoctorAvailability, getDoctorAvailabilityById, saveAvailability, getSlots, getUpcomingSessions, syncBookableUntil };
