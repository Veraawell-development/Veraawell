/**
 * Can patients find and book this therapist — and if not, why not?
 *
 * The directory applies one rule (services/bookability.js), but nothing told
 * the therapist which part of it they were missing: the dashboard only warned
 * about calendar dates, so a new therapist with no prices or unapproved bank
 * details saw "You are now Online" and waited for bookings that could not come
 * (found live, 2026-10-20). This turns the same rule into a checklist the
 * therapist can act on, one item per condition, each with the screen that
 * fixes it.
 *
 * It must never disagree with bookabilityOf(): `visible` and `instantReady`
 * are taken from it, not recomputed.
 */

const DoctorProfile = require('../models/doctorProfile');
const DoctorAvailability = require('../models/doctorAvailability');
const { bookabilityOf } = require('./bookability');
const { PRICE_PATHS } = require('./session.service');

const PRICE_LABELS = {
  'pricing.session20': '20-min video',
  'pricing.session40': '40-min video',
  'pricing.session55': '55-min video',
  'pricing.audio.session20': '20-min voice',
  'pricing.audio.session40': '40-min voice',
  'pricing.audio.session55': '55-min voice',
};

const valueAt = (obj, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj);

/** The profile fields a patient's directory card and profile page rely on. */
function profileGaps(profile) {
  if (!profile) return ['professional details'];
  const gaps = [];
  if (!profile.type) gaps.push('professional type');
  if (!(profile.qualification || []).length) gaps.push('a qualification');
  if (!(profile.languages || []).length) gaps.push('a language');
  if (!(profile.specialization || []).length) gaps.push('a specialization');
  return gaps;
}

/**
 * @param {object} user  the therapist's User document (isOnline is read from it)
 * @returns {Promise<{ visible: boolean, instantReady: boolean, online: boolean, checks: Array<object> }>}
 */
async function visibilityFor(user, { now = new Date() } = {}) {
  const profile = await DoctorProfile.findOne({ userId: user._id })
    .select('type qualification languages specialization pricing payoutApproved payoutBankStatus payoutRejectionReason bookableUntil')
    .lean();
  const { scheduled, instant } = bookabilityOf(profile, { now });

  const gaps = profileGaps(profile);
  const missingPrices = PRICE_PATHS.filter((p) => !(Number(valueAt(profile || {}, p)) > 0)).map((p) => PRICE_LABELS[p] || p);
  const bankStatus = (profile && profile.payoutBankStatus) || 'not_submitted';
  const bankOk = !!(profile && profile.payoutApproved);
  const until = profile && profile.bookableUntil ? new Date(profile.bookableUntil) : null;
  const datesOk = !!until && until >= now;
  // A calendar can be saved with nothing in it; tell those apart from none.
  const hasCalendar = !!(await DoctorAvailability.exists({ doctorId: user._id }));

  const checks = [
    {
      key: 'profile',
      ok: gaps.length === 0,
      title: 'Profile',
      detail: gaps.length === 0 ? 'Complete' : `Add ${gaps.join(', ')}`,
      fix: '/profile-setup',
    },
    {
      key: 'prices',
      ok: missingPrices.length === 0,
      title: 'Prices for all six sessions',
      detail: missingPrices.length === 0 ? 'All set' : `Missing: ${missingPrices.join(', ')}`,
      fix: '/doctor-settings#pricing',
    },
    {
      key: 'bank',
      ok: bankOk,
      title: 'Bank details approved',
      status: bankStatus,
      detail: bankOk ? 'Approved'
        : bankStatus === 'pending_admin_approval' ? 'Submitted — waiting for Veraawell to approve them'
          : bankStatus === 'rejected' ? `Not accepted${profile.payoutRejectionReason ? `: ${profile.payoutRejectionReason}` : ''} — please resubmit`
            : 'Not submitted yet',
      fix: '/doctor-settings#payouts',
    },
    {
      key: 'dates',
      ok: datesOk,
      title: 'Open times in your calendar',
      detail: datesOk ? 'Patients can book times ahead'
        : hasCalendar ? 'No open times ahead — patients can only talk to you while you are online' : 'Not set up yet',
      fix: '/manage-calendar',
    },
  ];

  return { visible: scheduled, instantReady: instant, online: !!user.isOnline, checks };
}

module.exports = { visibilityFor, profileGaps };
