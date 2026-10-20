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
 *   a price for all six sessions (20/40/55 min,      always
 *     video and voice)
 *   published dates still ahead (bookableUntil)      to book a time slot;
 *                                                    an instant session
 *                                                    doesn't use the calendar
 *
 * All six prices, not "any price": Veraawell offers every length in both
 * modes, and a therapist with a gap used to be sold at a fallback price they
 * never set (services/session.service.js resolvePrice). Until the gap is
 * filled in their settings, they are not listed.
 *
 * Whether they're online, actually connected and free right now is the
 * separate, live question in services/availability.js.
 */

const { PRICE_PATHS, isFullyPriced } = require('./session.service');

const BOOKABLE_USER_FILTER = Object.freeze({ role: 'doctor', approvalStatus: 'approved', status: 'active' });

/** The DoctorProfile part of the rule, as a query filter. */
function bookableProfileFilter({ scheduled = true, now = new Date() } = {}) {
  const filter = { payoutApproved: true };
  for (const path of PRICE_PATHS) filter[path] = { $gt: 0 };
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
  const paidAndPriced = !!profile.payoutApproved && isFullyPriced(profile.pricing);
  const datesAhead = !!profile.bookableUntil && new Date(profile.bookableUntil) >= now;
  return { scheduled: paidAndPriced && datesAhead, instant: paidAndPriced };
}

const NOT_BOOKABLE_MESSAGE = "This therapist isn't taking bookings right now.";

module.exports = { BOOKABLE_USER_FILTER, bookableProfileFilter, bookabilityOf, NOT_BOOKABLE_MESSAGE };
