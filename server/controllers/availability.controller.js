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
    // A new calendar starts as a weekly one (the Manage Calendar default).
    availability = new DoctorAvailability({ doctorId: userId, availabilityType: 'weekly', weeklySlots: [], offDates: [], defaultSlots: [], activeDates: [], customAvailability: [] });
    await availability.save();
  }
  res.json(availability);
});

/** GET /api/availability/doctor/:doctorId — A specific doctor's availability (public) */
const getDoctorAvailabilityById = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) {
    return res.json({ availabilityType: 'weekly', weeklySlots: [], offDates: [], defaultSlots: [], activeDates: [], customAvailability: [] });
  }
  // Public: which times are taken, never which sessions took them (the ids
  // of the doctor's booked sessions were in this response).
  const pub = availability.toObject();
  pub.bookedSlots = (pub.bookedSlots || []).map(({ date, time, slotKey }) => ({ date, time, slotKey }));
  res.json(pub);
});

/** POST /api/availability/save — Save doctor's availability settings */
const saveAvailability = asyncHandler(async (req, res) => {
  if (req.user.role !== 'doctor') throw new AuthorizationError('Only doctors can set availability');
  const userId = req.user._id.toString();
  const checked = require('../utils/availabilityInput').checkAvailability(req.body || {});
  if (checked.error) return res.status(400).json({ success: false, message: checked.error });
  const fields = checked.value;

  let availability = await DoctorAvailability.findOne({ doctorId: userId });
  if (availability) {
    Object.assign(availability, fields);
  } else {
    availability = new DoctorAvailability({ doctorId: userId, ...fields });
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
/** bookableUntil for a calendar that repeats weekly. */
const OPEN_ENDED = new Date('2100-01-01T00:00:00Z');

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
  // A weekly calendar repeats without an end: open-ended while any weekday
  // has times. (Bookings themselves stop BOOKING_HORIZON_DAYS ahead.)
  const repeats = availability.availabilityType === 'weekly'
    && (availability.weeklySlots || []).some((d) => d && Array.isArray(d.slots) && d.slots.length > 0);
  if (repeats) {
    bookableUntil = OPEN_ENDED;
  } else if (dates.length > 0) {
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

  // Booked sessions only. Checkouts still open or never paid showed on the
  // doctor's calendar as sessions, and their freed slots as "Booked".
  const { RELATIONSHIP_PAYMENT_STATES } = require('../services/chat.service');
  const upcomingSessions = await Session.find({ doctorId: userId, startsAt: { $gte: startOfTodayLocal }, paymentStatus: { $in: RELATIONSHIP_PAYMENT_STATES } })
    .populate('patientId', 'firstName lastName email')
    .sort({ startsAt: 1 })
    .limit(50);

  res.json(upcomingSessions);
});

module.exports = { getCurrentDoctorAvailability, getDoctorAvailabilityById, saveAvailability, getSlots, getUpcomingSessions, syncBookableUntil };
