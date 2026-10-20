/**
 * Session Service
 * Business logic for pricing calculation and slot resolution.
 * Called by session.controller.js — not directly by any route.
 */

const DoctorProfile = require('../models/doctorProfile');
const DoctorAvailability = require('../models/doctorAvailability');

/** The session lengths a therapist can price and a patient can book. */
const BOOKABLE_DURATIONS = [20, 40, 55];
const BOOKABLE_MODES = ['video', 'voice'];

/**
 * The server-authoritative price for a session, or null when the therapist
 * has not priced that exact combination.
 *
 * Veraawell sells exactly six sessions — 20, 40 and 55 minutes, each by video
 * or voice — and a therapist is bookable only once all six have a price
 * (services/bookability.js). So the price is the therapist's own price for
 * that slot and nothing else. It used to fall back along a chain (voice to
 * video, 40 to 20, then pricing.min / pricing.max), which sold sessions at
 * prices the therapist never set: one who priced only 20-min video could be
 * booked for 55-min voice at their "max". 0 means "not set" (a ₹0 booking
 * would be a free session nobody offered), and nothing the client sends can
 * set the price.
 *
 * @param {string} doctorId
 * @param {'video'|'voice'} mode
 * @param {number} duration  one of BOOKABLE_DURATIONS
 * @returns {Promise<number|null>}
 */
async function calculateSessionPrice(doctorId, mode, duration) {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorId }).select('pricing').lean();
  if (!doctorProfile || !doctorProfile.pricing) return null;
  return resolvePrice(doctorProfile.pricing, mode, duration);
}

/** Pure half of calculateSessionPrice, exported for tests. */
function resolvePrice(pricing, mode, duration) {
  const dur = Number(duration);
  if (!pricing || !BOOKABLE_DURATIONS.includes(dur) || !BOOKABLE_MODES.includes(mode)) return null;
  const slot = mode === 'voice' ? (pricing.audio || {})[`session${dur}`] : pricing[`session${dur}`];
  return typeof slot === 'number' && Number.isFinite(slot) && slot > 0 ? slot : null;
}

/** The six price fields, as DoctorProfile paths — every one must be set to book. */
const PRICE_PATHS = Object.freeze(BOOKABLE_DURATIONS.flatMap((d) => [`pricing.session${d}`, `pricing.audio.session${d}`]));

/** True when every one of the six sessions has a price. */
function isFullyPriced(pricing) {
  return BOOKABLE_MODES.every((mode) => BOOKABLE_DURATIONS.every((d) => resolvePrice(pricing, mode, d) !== null));
}

/**
 * Validate the booking parameters the client controls. Returns an error
 * message, or null when they are acceptable.
 */
function validateBookingParams({ mode, duration }) {
  if (mode !== undefined && !BOOKABLE_MODES.includes(mode)) return 'Session mode must be video or voice';
  if (!BOOKABLE_DURATIONS.includes(Number(duration))) {
    return `Session length must be one of ${BOOKABLE_DURATIONS.join(', ')} minutes`;
  }
  return null;
}

/**
 * Get or create a DoctorAvailability record with sensible defaults.
 * @param {string} doctorId
 * @returns {DoctorAvailability}
 */
async function getOrCreateAvailability(doctorId) {
  let availability = await DoctorAvailability.findOne({ doctorId });
  if (!availability) {
    availability = new DoctorAvailability({ doctorId, availabilityType: 'same_slots', defaultSlots: ['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM'], activeDates: [], bookedSlots: [] });
    await availability.save();
  }
  return availability;
}

/**
 * Heuristic gender-based default profile image for doctors without a profile photo.
 */
function getGenderBasedImage(user) {
  const firstName = (user.firstName || '').toLowerCase();
  const femaleNames = ['shreya', 'priya', 'anjali', 'kavya', 'divya', 'neha', 'pooja', 'riya', 'sneha', 'swati', 'nikita', 'preeti', 'shweta', 'megha', 'isha', 'tanvi', 'aditi', 'aishwarya', 'ananya', 'deepika', 'kriti', 'nisha', 'rachana', 'sakshi', 'simran', 'sonali', 'tanya', 'varsha', 'vidya', 'zoya'];
  const femaleSuffixes = ['a', 'i', 'ya', 'ka', 'na'];
  const endsWithFemaleSuffix = femaleSuffixes.some(s => firstName.endsWith(s) && firstName.length > 3);
  return (femaleNames.includes(firstName) || endsWithFemaleSuffix) ? '/female.jpg' : '/male.jpg';
}

module.exports = {
  calculateSessionPrice,
  resolvePrice,
  isFullyPriced,
  PRICE_PATHS,
  validateBookingParams,
  BOOKABLE_DURATIONS,
  BOOKABLE_MODES,
  getOrCreateAvailability,
  getGenderBasedImage
};
