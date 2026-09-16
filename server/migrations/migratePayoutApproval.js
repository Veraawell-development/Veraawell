/**
 * Move doctors off the Razorpay Route bookability gate and onto payoutApproved,
 * and backfill bookableUntil from each doctor's published availability.
 *
 * WHY
 *
 * Booking used to require a non-synthetic `razorpayAccountId`. That gate is
 * gone: Route needs an RBI Payment Aggregator turnover threshold this platform
 * does not meet, and the onboarding flow only ever implemented one of the four
 * API calls a linked account needs. Money now lands in the platform account
 * and doctors are paid by bank transfer, so bookability asks a different
 * question — has an admin approved a way to pay this person — recorded in
 * `payoutApproved`, which defaults to false.
 *
 * That default is the danger. Deploy the new gate without this migration and
 * EVERY booking returns 409, because no existing profile carries the flag.
 *
 * WHAT IT DOES
 *
 * 1. payoutApproved: false for EVERY doctor. No grandfathering — see below.
 * 2. bookableUntil: derived from DoctorAvailability, so the directory can hide
 *    doctors whose calendar has run out — which is the state both live doctors
 *    were in while still being listed as bookable.
 * 3. Clears the fabricated `acc_mock_*` ids so nothing can mistake one for a
 *    real payout destination later.
 * 4. payoutBankStatus: 'pending_admin_approval' for anyone who already has
 *    real bank details on file, 'not_submitted' for everyone else.
 *
 * WHY NOTHING IS GRANDFATHERED
 *
 * An earlier draft of this migration carried `razorpayOnboardingStatus:
 * 'active'` forward into `payoutApproved: true`, because the bank-details form
 * did not exist yet and the alternative was zero bookable doctors with no way
 * to fix it from the UI. That draft said so explicitly, and said a second
 * migration would reset the flag once the form landed.
 *
 * The form and the weekly payout run have both landed, so that window is
 * closed and this IS that second migration.
 *
 * Grandfathering is now not merely generous but wrong. 'active' was written by
 * the old approveOnboarding, which fabricated an `acc_mock_…` id whenever the
 * Razorpay call threw and reported success anyway — so it is not evidence
 * that any human ever saw a bank account. Carried forward, a doctor would be
 * approved, bookable, taking real money, and appearing in the weekly payout as
 * owed, with no account number to send it to. The admin screen would not even
 * flag them, because it flags on payoutApproved being false.
 *
 * The cost of not grandfathering is one form per doctor and one click per
 * admin, on screens that now exist. The cost of grandfathering is money
 * arriving with nowhere to go.
 *
 * AFTER RUNNING THIS, THE DIRECTORY IS EMPTY until each doctor submits bank
 * details and an admin approves them. That is the intended state, not a
 * regression.
 *
 *   node migrations/migratePayoutApproval.js            # dry run
 *   node migrations/migratePayoutApproval.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function migrate() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const DoctorProfile = require('../models/doctorProfile');
  const DoctorAvailability = require('../models/doctorAvailability');
  // Registered so .populate('userId') can resolve the ref.
  require('../models/user');
  const { zonedToUtc } = require('../utils/zonedTime');
  const { PLATFORM_TIMEZONE } = require('../config/time');

  const profiles = await DoctorProfile.find({})
    .select('userId razorpayAccountId razorpayOnboardingStatus payoutApproved bookableUntil '
      + 'payoutBankStatus +payoutBank.submittedAt')
    .populate('userId', 'firstName lastName approvalStatus')
    .lean();

  const counts = { approved: 0, notApproved: 0, mockCleared: 0, dated: 0, undated: 0, hasBank: 0 };
  const rows = [];

  for (const profile of profiles) {
    const name = profile.userId
      ? `${profile.userId.firstName} ${profile.userId.lastName || ''}`.trim()
      : '(orphaned profile)';

    // 1. Bookability
    //
    // NO LONGER GRANDFATHERED. The note above describes a window that has
    // closed: it granted bookability to doctors whose Razorpay onboarding had
    // reached 'active', because the bank-details form did not exist yet and
    // the alternative was zero bookable doctors with no way to fix it. Both
    // the form and the weekly payout run have since shipped.
    //
    // Grandfathering now would be actively wrong rather than merely generous.
    // An 'active' onboarding status was set by the old approveOnboarding,
    // which fabricated `acc_mock_…` ids on failure — it is not evidence that
    // anyone ever saw a bank account. Carrying it forward would mark a doctor
    // approved, bookable and owed money, with no account number to send it
    // to, and the admin payout screen would NOT flag them because flagging
    // keys on payoutApproved being false. That is the exact class of lying
    // state this work removed.
    //
    // So: everyone re-submits, which is what was agreed. It costs each doctor
    // one form and an admin one click on a screen that now exists.
    const hasRealBankDetails = !!(profile.payoutBank && profile.payoutBank.submittedAt);
    const payoutApproved = false;
    counts[payoutApproved ? 'approved' : 'notApproved'] += 1;
    if (hasRealBankDetails) counts.hasBank += 1;

    // 2. Availability horizon
    const availability = await DoctorAvailability.findOne({ doctorId: profile.userId?._id || profile.userId })
      .select('activeDates customAvailability timezone').lean();

    const dates = [
      ...((availability && availability.activeDates) || []),
      ...(((availability && availability.customAvailability) || [])
        .filter((d) => d && Array.isArray(d.slots) && d.slots.length > 0)
        .map((d) => d.date))
    ].filter(Boolean);

    let bookableUntil = null;
    if (dates.length > 0) {
      const latest = dates.sort().at(-1);
      try {
        bookableUntil = zonedToUtc(latest, '23:59', (availability && availability.timezone) || PLATFORM_TIMEZONE);
      } catch (err) {
        console.log(`  ! unparseable active date for ${name}: ${latest}`);
      }
    }
    counts[bookableUntil ? 'dated' : 'undated'] += 1;

    // 3. Fabricated account ids
    const isMock = typeof profile.razorpayAccountId === 'string'
      && profile.razorpayAccountId.startsWith('acc_mock');
    if (isMock) counts.mockCleared += 1;

    const expired = bookableUntil && bookableUntil < new Date();
    rows.push({
      name,
      payoutApproved,
      bookableUntil: bookableUntil ? bookableUntil.toISOString().slice(0, 10) : null,
      expired: !!expired,
      clearing: isMock ? profile.razorpayAccountId : null
    });

    if (APPLY) {
      // payoutApprovedAt is cleared alongside the flag: a stamp left behind
      // reads as "an admin approved this on that date", which is now false.
      const $set = {
        payoutApproved,
        payoutApprovedAt: null,
        bookableUntil,
        // Someone who already typed real details lands in the admin queue
        // rather than being sent back to the form.
        payoutBankStatus: hasRealBankDetails ? 'pending_admin_approval' : 'not_submitted'
      };
      if (isMock) $set.razorpayAccountId = null;
      await DoctorProfile.updateOne({ _id: profile._id }, { $set });
    }
  }

  console.log(`Doctor profiles: ${profiles.length}\n`);
  for (const r of rows) {
    const bookable = r.payoutApproved && r.bookableUntil && !r.expired;
    console.log(`  ${r.name.padEnd(26)} payoutApproved=${String(r.payoutApproved).padEnd(5)} `
      + `bookableUntil=${String(r.bookableUntil).padEnd(11)}${r.expired ? ' (EXPIRED)' : ''}`
      + `${r.clearing ? `  clearing ${r.clearing}` : ''}`);
    if (!bookable) {
      const why = !r.payoutApproved ? 'not approved for payouts'
        : !r.bookableUntil ? 'no published availability'
          : 'calendar has expired';
      console.log(`  ${' '.repeat(26)} -> will NOT appear in the directory: ${why}`);
    }
  }

  console.log(`\n  approved      : ${counts.approved}`);
  console.log(`  not approved  : ${counts.notApproved}`);
  console.log(`  with a horizon: ${counts.dated}`);
  console.log(`  no horizon    : ${counts.undated}`);
  console.log(`  acc_mock ids cleared: ${counts.mockCleared}`);
  console.log(`  already have bank details (go to the admin queue): ${counts.hasBank}`);

  if (!APPLY) console.log('\nDry run — nothing was written. Re-run with --apply.');

  await mongoose.connection.close();
}

migrate().catch(async (error) => {
  console.error('\nMigration failed:', error);
  try { await mongoose.connection.close(); } catch (e) { /* already closed */ }
  process.exit(1);
});
