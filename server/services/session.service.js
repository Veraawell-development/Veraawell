/**
 * Session Service
 * Business logic for pricing calculation and slot resolution.
 * Called by session.controller.js — not directly by any route.
 */

const DoctorProfile = require('../models/doctorProfile');
const DoctorAvailability = require('../models/doctorAvailability');

/**
 * Calculate the server-authoritative price for a session based on mode + duration.
 * @param {string} doctorId
 * @param {string} mode - 'voice' | 'video'
 * @param {number} duration - 20 | 40 | 55
 * @param {number} fallbackPrice - client-provided price as last resort
 * @returns {number} finalPrice
 */
async function calculateSessionPrice(doctorId, mode, duration, fallbackPrice = 0) {
  const doctorProfile = await DoctorProfile.findOne({ userId: doctorId });
  if (!doctorProfile) return fallbackPrice;

  const dur = parseInt(duration) || 20;
  let price = 0;

  if (mode === 'voice' && doctorProfile.pricing.audio) {
    switch (dur) {
      case 20: price = doctorProfile.pricing.audio.session20 || doctorProfile.pricing.session20 || doctorProfile.pricing.min; break;
      case 40: price = doctorProfile.pricing.audio.session40 || doctorProfile.pricing.session40 || doctorProfile.pricing.session20 || doctorProfile.pricing.min; break;
      case 55: price = doctorProfile.pricing.audio.session55 || doctorProfile.pricing.session55 || doctorProfile.pricing.max; break;
      default: price = doctorProfile.pricing.min;
    }
  } else {
    switch (dur) {
      case 20: price = (doctorProfile.pricing.session20 != null) ? doctorProfile.pricing.session20 : doctorProfile.pricing.min; break;
      case 40: price = (doctorProfile.pricing.session40 != null) ? doctorProfile.pricing.session40 : (doctorProfile.pricing.session20 || doctorProfile.pricing.min); break;
      case 55: price = (doctorProfile.pricing.session55 != null) ? doctorProfile.pricing.session55 : doctorProfile.pricing.max; break;
      default: price = doctorProfile.pricing.min;
    }
  }

  return price;
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

module.exports = { calculateSessionPrice, getOrCreateAvailability, getGenderBasedImage };
