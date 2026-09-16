/**
 * The weekly payout ledger: work out what each practitioner is owed, freeze
 * it, record that it was paid, and claw it back if a session is later refunded.
 *
 * THE ONE RULE THAT MATTERS
 *
 * A session's earnings must be paid at most once. There are no multi-document
 * transactions available here (the test harness runs a standalone mongod, so
 * `withTransaction` throws; production Atlas is a replica set), so that
 * guarantee cannot rest on one. It rests instead on the idiom
 * DoctorAvailability.bookSlot already uses: put the precondition in the FILTER
 * and treat a non-match as "someone else won", never on a prior read.
 *
 *   claim:     { ...payable, payoutId: null } -> $set payoutId
 *   mark paid: { _id, status: 'locked' }      -> $set status 'paid'
 *
 * THE ORDER IS THE SAFETY PROPERTY
 *
 * A draft payout carries no money. The sequence is create the ticket, claim
 * sessions onto it, THEN sum what it actually holds. Doing it the obvious way
 * round — aggregate, sum, create with that sum, claim — overpays whenever a
 * session is refunded between the sum and the claim. Deriving the total from
 * the claimed set makes it unfalsifiable.
 *
 * Every step is idempotent, so a crash anywhere leaves a resumable state
 * rather than a half-paid one.
 */

const mongoose = require('mongoose');
const { payableSessionMatch } = require('./earnings');
const { periodFor, periodFromKey } = require('./payoutPeriod');
const { createLogger } = require('../utils/logger');
const { AppError } = require('../utils/errors');

const logger = createLogger('PAYOUT-LEDGER');

/**
 * Nothing before this is ever claimed.
 *
 * Without a floor the first generate run sweeps up every completed session in
 * the collection's history and presents it as this week's bill. Cheapest
 * catastrophic-loss prevention in the feature.
 */
const PAYOUT_EPOCH = new Date(process.env.PAYOUT_EPOCH || '2026-09-01T00:00:00.000Z');

class PayoutStateError extends AppError {
  constructor(message) { super(message, 409); this.code = 'PAYOUT_STATE'; }
}

/* ────────────────────────────── preview ────────────────────────────────── */

/**
 * What each doctor is owed for a period. Read-only: this is what the admin
 * screen renders, and it must never be the basis for an amount that gets
 * written — see lockPayout.
 */
async function previewPeriod(periodKey) {
  const Session = require('../models/session');
  const period = periodFromKey(periodKey);
  const from = period.periodStart < PAYOUT_EPOCH ? PAYOUT_EPOCH : period.periodStart;

  const rows = await Session.aggregate([
    { $match: payableSessionMatch({ unpaidOnly: true, period: { from, to: period.periodEnd } }) },
    {
      $group: {
        _id: '$doctorId',
        sessionCount: { $sum: 1 },
        grossPrice: { $sum: '$price' },
        platformFeeTotal: { $sum: '$platformFee' },
        grossEarnings: { $sum: '$doctorEarnings' }
      }
    },
    // Unsettled adjustments are deliberately NOT period-scoped: a clawback
    // raised this week against a session paid three weeks ago has to land in
    // whichever payout is generated next, or it never lands at all.
    {
      $lookup: {
        from: 'payoutadjustments',
        let: { d: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$doctorId', '$$d'] }, settledInPayoutId: null } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ],
        as: 'adj'
      }
    },
    {
      $addFields: {
        adjustmentsTotal: { $ifNull: [{ $first: '$adj.total' }, 0] },
        adjustmentCount: { $ifNull: [{ $first: '$adj.count' }, 0] }
      }
    },
    { $addFields: { rawNet: { $add: ['$grossEarnings', '$adjustmentsTotal'] } } },
    {
      $addFields: {
        netPayable: { $max: ['$rawNet', 0] },
        carriedForward: { $max: [{ $multiply: ['$rawNet', -1] }, 0] }
      }
    },
    // The approval gate belongs in the query, not the UI: an unapproved
    // doctor must be visibly blocked on the screen the admin pays from.
    {
      $lookup: {
        from: 'doctorprofiles',
        let: { d: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$d'] } } },
          {
            $project: {
              payoutApproved: 1,
              payoutBankStatus: 1,
              accountHolderName: '$payoutBank.accountHolderName',
              ifsc: '$payoutBank.ifsc',
              accountNumberLast4: {
                $let: {
                  vars: { acc: { $ifNull: ['$payoutBank.accountNumber', ''] } },
                  in: { $substrCP: ['$$acc', { $max: [0, { $subtract: [{ $strLenCP: '$$acc' }, 4] }] }, 4] }
                }
              }
            }
          }
        ],
        as: 'profile'
      }
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        let: { d: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$d'] } } },
          { $project: { firstName: 1, lastName: 1, email: 1 } }
        ],
        as: 'doctor'
      }
    },
    { $unwind: { path: '$doctor', preserveNullAndEmptyArrays: true } },
    { $project: { adj: 0, rawNet: 0 } },
    { $sort: { netPayable: -1 } }
  ]);

  const existing = await require('../models/payout')
    .find({ periodKey }).select('doctorId status netPayable transferReference').lean();
  const byDoctor = new Map(existing.map((p) => [String(p.doctorId), p]));

  return {
    period,
    rows: rows.map((r) => ({ ...r, existingPayout: byDoctor.get(String(r._id)) || null })),
    // Doctors with outstanding debt but no payable sessions do not appear
    // above (the $match is on Session), so surface them separately or the
    // debt is invisible until they next work.
    outstandingDebt: await outstandingDebtByDoctor()
  };
}

/** Doctors carrying a net negative adjustment balance. */
async function outstandingDebtByDoctor() {
  const PayoutAdjustment = require('../models/payoutAdjustment');
  return PayoutAdjustment.aggregate([
    { $match: { settledInPayoutId: null } },
    { $group: { _id: '$doctorId', outstanding: { $sum: '$amount' }, rows: { $sum: 1 } } },
    { $match: { outstanding: { $lt: 0 } } }
  ]);
}

/* ───────────────────────────── generate ────────────────────────────────── */

/**
 * Create a draft payout per doctor for the period and claim their payable
 * sessions onto it.
 *
 * Claiming is the compare-and-set. `payoutId: null` sits inside the filter,
 * so a session already claimed by a concurrent run simply does not match —
 * a short `modifiedCount` is information, not an error.
 */
async function generatePayouts(periodKey, { adminId } = {}) {
  const Session = require('../models/session');
  const Payout = require('../models/payout');
  const period = periodFromKey(periodKey);
  const from = period.periodStart < PAYOUT_EPOCH ? PAYOUT_EPOCH : period.periodStart;

  const doctorIds = await Session.distinct('doctorId',
    payableSessionMatch({ unpaidOnly: true, period: { from, to: period.periodEnd } }));

  const created = [];
  for (const doctorId of doctorIds) {
    // Upsert so two concurrent generates converge on one document; the unique
    // index on { doctorId, periodKey } is what makes that safe.
    let payout;
    try {
      payout = await Payout.findOneAndUpdate(
        { doctorId, periodKey },
        {
          $setOnInsert: {
            doctorId,
            periodKey,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            scheduledPayoutDate: period.scheduledPayoutDate,
            status: 'draft'
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
      payout = await Payout.findOne({ doctorId, periodKey });
    }

    // Never touch a payout that is already frozen or paid.
    if (!payout || payout.status !== 'draft') continue;

    const claim = await Session.updateMany(
      {
        ...payableSessionMatch({ doctorId, unpaidOnly: true, period: { from, to: period.periodEnd } })
      },
      { $set: { payoutId: payout._id, payoutClaimedAt: new Date() } }
    );

    created.push({ payoutId: payout._id, doctorId, claimed: claim.modifiedCount });
  }

  logger.info('Payout drafts generated', { periodKey, doctors: created.length });
  return { period, created };
}

/* ─────────────────────────────── lock ──────────────────────────────────── */

/**
 * Freeze a draft: absorb outstanding adjustments, then compute the money from
 * the sessions actually claimed.
 *
 * Re-runnable on purpose. Settling adjustments filters on
 * `settledInPayoutId: null`, and the totals are derived from
 * `{ payoutId: this }`, so a crash part-way through converges on the same
 * answer rather than double-counting.
 */
async function lockPayout(payoutId) {
  const Session = require('../models/session');
  const Payout = require('../models/payout');
  const PayoutAdjustment = require('../models/payoutAdjustment');
  const DoctorProfile = require('../models/doctorProfile');

  const payout = await Payout.findById(payoutId);
  if (!payout) throw new PayoutStateError('Payout not found');
  if (payout.status === 'paid') throw new PayoutStateError('This payout has already been paid');

  // Pull in any clawback the inline hook missed before freezing the number.
  await reconcileClawbacks({ doctorId: payout.doctorId });

  await PayoutAdjustment.updateMany(
    { doctorId: payout.doctorId, settledInPayoutId: null },
    { $set: { settledInPayoutId: payout._id, settledAt: new Date() } }
  );

  const [sums] = await Session.aggregate([
    { $match: { payoutId: payout._id } },
    {
      $group: {
        _id: null,
        sessionCount: { $sum: 1 },
        grossPrice: { $sum: '$price' },
        platformFeeTotal: { $sum: '$platformFee' },
        grossEarnings: { $sum: '$doctorEarnings' }
      }
    }
  ]);
  const [adj] = await PayoutAdjustment.aggregate([
    { $match: { settledInPayoutId: payout._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const grossEarnings = (sums && sums.grossEarnings) || 0;
  const adjustmentsTotal = (adj && adj.total) || 0;
  const rawNet = grossEarnings + adjustmentsTotal;

  const profile = await DoctorProfile.findOne({ userId: payout.doctorId })
    .select('+payoutBank.accountHolderName +payoutBank.accountNumber +payoutBank.ifsc');
  const account = (profile && profile.payoutBank && profile.payoutBank.accountNumber) || '';

  const updated = await Payout.findOneAndUpdate(
    { _id: payout._id, status: 'draft' },
    {
      $set: {
        status: 'locked',
        lockedAt: new Date(),
        sessionCount: (sums && sums.sessionCount) || 0,
        grossPrice: (sums && sums.grossPrice) || 0,
        platformFeeTotal: (sums && sums.platformFeeTotal) || 0,
        grossEarnings,
        adjustmentsTotal,
        netPayable: Math.max(0, rawNet),
        carriedForward: Math.max(0, -rawNet),
        bankSnapshot: {
          accountHolderName: (profile && profile.payoutBank && profile.payoutBank.accountHolderName) || null,
          accountNumberLast4: account ? account.slice(-4) : null,
          ifsc: (profile && profile.payoutBank && profile.payoutBank.ifsc) || null
        }
      }
    },
    { new: true }
  );
  if (!updated) throw new PayoutStateError('This payout was locked or paid by another request');

  // The unpayable remainder re-enters the ledger as a fresh unsettled row, so
  // next week's rule is unchanged and the debt cannot be quietly written off.
  if (updated.carriedForward > 0) {
    // Upsert, for the same reason as ensureClawback: idempotent on a retry
    // even if the unique index has not been built.
    try {
      await PayoutAdjustment.updateOne(
        { idempotencyKey: `carry:${updated._id}` },
        {
          $setOnInsert: {
            doctorId: updated.doctorId,
            amount: -updated.carriedForward,
            kind: 'carry_forward',
            sourcePayoutId: updated._id,
            reason: `Carried forward from ${updated.periodKey}`
          }
        },
        { upsert: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err; // already written on an earlier attempt
    }
  }

  logger.info('Payout locked', {
    payoutId: String(updated._id).substring(0, 8),
    netPayable: updated.netPayable,
    carriedForward: updated.carriedForward
  });
  return updated;
}

/* ────────────────────────────── mark paid ──────────────────────────────── */

/**
 * Record that the bank transfer happened.
 *
 * The compare-and-set on `status: 'locked'` is the single most important line
 * in this file: it is what stops a double-clicked admin button from recording
 * — and prompting — a second real transfer.
 */
async function markPaid(payoutId, { transferReference, adminId }) {
  const Payout = require('../models/payout');
  const ref = String(transferReference || '').trim();
  if (!ref) throw new AppError('A transfer reference (UTR) is required to mark a payout paid', 400);

  const updated = await Payout.findOneAndUpdate(
    { _id: payoutId, status: 'locked' },
    { $set: { status: 'paid', paidAt: new Date(), paidBy: adminId || null, transferReference: ref } },
    { new: true }
  );
  if (!updated) {
    const current = await Payout.findById(payoutId).select('status transferReference').lean();
    if (!current) throw new PayoutStateError('Payout not found');
    // The overwhelmingly likely cause is a double-clicked button, so say that
    // rather than describing the state machine.
    if (current.status === 'paid') {
      throw new PayoutStateError(
        `This payout has already been paid${current.transferReference ? ` (ref ${current.transferReference})` : ''}`
      );
    }
    throw new PayoutStateError(`Cannot mark paid — this payout is "${current.status}", not "locked"`);
  }

  logger.info('Payout marked paid', { payoutId: String(updated._id).substring(0, 8), reference: ref });
  return updated;
}

/* ───────────────────────────── clawback ────────────────────────────────── */

/**
 * A session that was paid out has been refunded, so the platform is short the
 * doctor's share of it.
 *
 * Called from applyTransition whenever a session actually reaches `refunded`,
 * rather than from each of the four refund paths — the fifth would not have
 * remembered. Keyed on the post-state, not the event, because three different
 * table rows converge on `refunded`.
 */
async function onSessionRefunded(session) {
  if (!session || !session.payoutId) return { adjusted: false, reason: 'never-paid-out' };

  const Payout = require('../models/payout');
  const Session = require('../models/session');
  const payout = await Payout.findById(session.payoutId).select('status').lean();
  if (!payout) return { adjusted: false, reason: 'payout-missing' };

  if (payout.status === 'draft') {
    // Not yet frozen, so the cheapest correct answer is to un-claim it: the
    // doctor is simply never paid for it and no ledger row is needed. Only
    // safe because a draft carries no money — there is no stored total to
    // correct.
    const released = await Session.findOneAndUpdate(
      { _id: session._id, payoutId: payout._id },
      { $set: { payoutId: null, payoutClaimedAt: null } }
    );
    if (released) return { adjusted: false, reason: 'released-from-draft' };
    // Lost the race with a concurrent lock; fall through and claw back.
  }

  return ensureClawback(session, session.payoutId);
}

/** The doctor's share of what was refunded, preserving the commission split. */
function clawbackAmount(session) {
  const price = session.price || 0;
  const refunded = session.refundAmount || 0;
  const earnings = session.doctorEarnings || 0;
  if (!(price > 0) || !(refunded > 0) || !(earnings > 0)) return 0;
  // Proportional because adminRefundSession accepts a partial override.
  return -Math.round((refunded / price) * earnings);
}

async function ensureClawback(session, originPayoutId) {
  const PayoutAdjustment = require('../models/payoutAdjustment');
  const amount = clawbackAmount(session);
  if (amount === 0) return { adjusted: false, reason: 'zero-amount' };

  // An upsert keyed on idempotencyKey rather than create-and-catch-11000.
  // Both are correct against a racing writer, because the unique index
  // resolves that — but only the upsert is also correct when the index is
  // MISSING, and the dominant caller here is the hourly reconciliation sweep
  // re-walking sessions it has already clawed back. create() degrades to
  // "write another row every hour" the moment the index isn't there;
  // $setOnInsert matches the existing row instead. E11000 is still caught,
  // for two upserts landing in the same instant.
  try {
    const result = await PayoutAdjustment.updateOne(
      { idempotencyKey: `clawback:${session._id}` },
      {
        $setOnInsert: {
          doctorId: session.doctorId,
          amount,
          kind: 'refund_clawback',
          sessionId: session._id,
          originPayoutId,
          reason: `Refund of ${session.refundAmount} on session ${session._id}`
        }
      },
      { upsert: true }
    );
    if (!result.upsertedCount) return { adjusted: false, reason: 'already-recorded' };
    logger.info('Clawback recorded', { sessionId: String(session._id).substring(0, 8), amount });
    return { adjusted: true, amount };
  } catch (err) {
    if (err.code === 11000) return { adjusted: false, reason: 'already-recorded' };
    throw err;
  }
}

/**
 * The actual guarantee. The inline hook is the fast path; this is what makes
 * a missed one self-correcting, and it is safe to run concurrently with it
 * because the idempotency key is unique.
 */
async function reconcileClawbacks({ doctorId } = {}) {
  const Session = require('../models/session');
  const filter = { payoutId: { $ne: null }, paymentStatus: 'refunded' };
  if (doctorId) filter.doctorId = doctorId;

  const candidates = await Session.find(filter)
    .select('_id doctorId payoutId price doctorEarnings refundAmount').lean();

  let recorded = 0;
  for (const session of candidates) {
    const result = await ensureClawback(session, session.payoutId);
    if (result.adjusted) recorded += 1;
  }
  if (recorded > 0) logger.info('Clawback reconciliation recorded rows', { recorded });
  return recorded;
}

module.exports = {
  PAYOUT_EPOCH,
  PayoutStateError,
  previewPeriod,
  generatePayouts,
  lockPayout,
  markPaid,
  onSessionRefunded,
  reconcileClawbacks,
  clawbackAmount,
  outstandingDebtByDoctor,
  periodFor
};
