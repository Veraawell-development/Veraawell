/**
 * Can this therapist be booked — and is that what every screen says?
 *
 * The same rule was written out four times (the directory, the "online now"
 * list, the booking path, and not at all on the therapist's own page), and
 * they had drifted: a doctor not set up for payment could be opened from a
 * direct link and booked right up to the last step, which then failed.
 *
 *   approved, active account                         always
 *   an admin-approved way to be paid (payoutApproved) always
 *   a price (pricing.min > 0)                        always
 *   published dates still ahead (bookableUntil)      to book a time slot;
 *                                                    an instant session
 *                                                    doesn't use the calendar
 *
 * Whether they're online, actually connected and free right now is the
 * separate, live question in services/availability.js.
 */

const BOOKABLE_USER_FILTER = Object.freeze({ role: 'doctor', approvalStatus: 'approved', status: 'active' });

/** The DoctorProfile part of the rule, as a query filter. */
function bookableProfileFilter({ scheduled = true, now = new Date() } = {}) {
  const filter = { payoutApproved: true, 'pricing.min': { $gt: 0 } };
  if (scheduled) filter.bookableUntil = { $gte: now };
  return filter;
}

/**
 * The same rule for a loaded profile.
 *
 * @returns {{ scheduled: boolean, instant: boolean }}
 */
function bookabilityOf(profile, { now = new Date() } = {}) {
  if (!profile) return { scheduled: false, instant: false };
  // `instant` is also "can be booked at all" — the booking path then checks
  // the chosen slot exists, the precise form of having dates ahead.
  const paidAndPriced = !!profile.payoutApproved && Number(profile.pricing && profile.pricing.min) > 0;
  const datesAhead = !!profile.bookableUntil && new Date(profile.bookableUntil) >= now;
  return { scheduled: paidAndPriced && datesAhead, instant: paidAndPriced };
}

const NOT_BOOKABLE_MESSAGE = "This therapist isn't taking bookings right now.";

module.exports = { BOOKABLE_USER_FILTER, bookableProfileFilter, bookabilityOf, NOT_BOOKABLE_MESSAGE };
