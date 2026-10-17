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
 * does not offer that combination.
 *
 * Every price field defaults to 0, and 0 means "not set" — the settings page
 * saves all six slots at once, so a therapist who priced only video has three
 * zero audio prices. The old lookup tested the video slots with `!= null`, so
 * an unset slot resolved to ₹0, and a ₹0 booking is `not_required`: a free
 * session the therapist never offered and is never paid for. It also fell
 * back to the CLIENT's price when no profile existed. Now 0 is skipped
 * exactly like an absent value, the fallback chain matches what the profile
 * page shows (client/src/pages/DoctorProfilePage.tsx), and nothing the client
 * sends can set the price.
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
  if (!BOOKABLE_DURATIONS.includes(dur)) return null;
  const positive = (...values) => values.find((v) => typeof v === 'number' && v > 0) || null;

  const videoChain = {
    20: [pricing.session20, pricing.min],
    40: [pricing.session40, pricing.session20, pricing.min],
    55: [pricing.session55, pricing.max]
  };
  const audio = pricing.audio || {};
  const chain = mode === 'voice'
    ? [audio[`session${dur}`], ...videoChain[dur]]
    : videoChain[dur];

  const price = positive(...chain);
  return price && Number.isFinite(price) ? price : null;
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
  validateBookingParams,
  BOOKABLE_DURATIONS,
  getOrCreateAvailability,
  getGenderBasedImage
};
