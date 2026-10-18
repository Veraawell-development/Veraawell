/**
 * The weekly payout ledger.
 *
 * The property under test throughout is: a session's earnings are paid at
 * most once, and the amount written is always derived from the sessions
 * actually claimed rather than from a query run earlier. There are no
 * multi-document transactions available (standalone mongod in tests), so that
 * rests entirely on compare-and-set — which means the concurrency cases here
 * are the point of the file, not an extra.
 */

require('../support/env');

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

let Session, Payout, PayoutAdjustment, DoctorProfile, User;
let ledger, periodFor, periodFromKey;
let doctorA, doctorB, patientId, PERIOD;

/**
 * A delivered, paid session inside the period under test.
 *
 * Time is driven by `startsAt` only. models/session.js derives endsAt (and
 * every other representation) from it in a pre('validate') hook, so passing
 * an explicit `endsAt` is silently overwritten — pass `startsAt` to move a
 * session, and remember endsAt lands `duration` minutes later.
 */
async function payableSession(doctorId, overrides = {}) {
  return Session.create({
    patientId, doctorId,
    startsAt: new Date(PERIOD.periodStart.getTime() + 2 * 864e5),
    duration: 60,
    price: 1000, platformFee: 200, doctorEarnings: 800,
    status: 'completed', paymentStatus: 'paid', paymentId: `pay_${Math.random().toString(16).slice(2)}`,
    doctorJoined: true, patientJoined: true,
    ...overrides
  });
}

async function approvedProfile(userId) {
  return DoctorProfile.create({
    userId,
    specialization: ['Anxiety'], experience: 5, qualification: ['MPhil'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Clinical Psychologist',
    pricing: { min: 1000, max: 1000, session20: 1000 },
    payoutApproved: true,
    payoutBankStatus: 'approved',
    payoutBank: {
      accountHolderName: 'A Practitioner',
      accountNumber: '123456789012',
      ifsc: 'HDFC0001234',
      panNumber: 'ABCDE1234F'
    }
  });
}

beforeAll(async () => {
  await connectDb('payout-ledger');
  Session = require('../../models/session');
  Payout = require('../../models/payout');
  PayoutAdjustment = require('../../models/payoutAdjustment');
  DoctorProfile = require('../../models/doctorProfile');
  User = require('../../models/user');
  ledger = require('../../services/payoutLedger');
  ({ periodFor, periodFromKey } = require('../../services/payoutPeriod'));

  // Build the unique indexes BEFORE any test asserts on exactly-once.
  //
  // Mongoose builds indexes in the background, so a suite that starts writing
  // immediately races the build. Alone the build wins and everything passes;
  // in a full run, with every suite hitting one mongod, it loses — and
  // "exactly one clawback" quietly becomes three, because the constraint
  // enforcing it does not exist yet. That is the difference between testing
  // the guarantee and testing how fast the disk is. Same idiom as
  // dataLayer.test.js's WebhookEvent.syncIndexes().
  await Promise.all([Payout.syncIndexes(), PayoutAdjustment.syncIndexes()]);

  // A period safely after PAYOUT_EPOCH but in the past, so sessions in it have ended.
  PERIOD = periodFor(new Date(Date.now() - 10 * 864e5));

  patientId = new mongoose.Types.ObjectId();
  doctorA = new mongoose.Types.ObjectId();
  doctorB = new mongoose.Types.ObjectId();
});

afterAll(async () => { await disconnectDb(); });

beforeEach(async () => {
  await Promise.all([
    Session.deleteMany({}), Payout.deleteMany({}),
    PayoutAdjustment.deleteMany({}), DoctorProfile.deleteMany({})
  ]);
  await approvedProfile(doctorA);
});

describe('generate claims payable sessions', () => {
  test('a draft is created per doctor and carries no money yet', async () => {
    await payableSession(doctorA);
    await payableSession(doctorA);

    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    expect(created).toHaveLength(1);
    expect(created[0].claimed).toBe(2);

    const payout = await Payout.findOne({ doctorId: doctorA });
    expect(payout.status).toBe('draft');
    // A draft is a claim ticket, not an invoice: the amount is computed at
    // lock time from what was actually claimed.
    expect(payout.netPayable).toBe(0);
    expect(payout.grossEarnings).toBe(0);

    const claimed = await Session.find({ payoutId: payout._id });
    expect(claimed).toHaveLength(2);
    expect(claimed[0].payoutClaimedAt).toBeInstanceOf(Date);
  });

  test('sessions outside the period are not claimed', async () => {
    await payableSession(doctorA);
    await payableSession(doctorA, { startsAt: new Date(PERIOD.periodEnd.getTime() + 864e5) });

    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    expect(created[0].claimed).toBe(1);
  });

  test('a session ending exactly on the closing boundary belongs to the NEXT period', async () => {
    // The range is half-open, so two consecutive weeks cannot both claim it.
    // endsAt is derived as startsAt + duration, so start an hour before the
    // boundary to land exactly on it.
    await payableSession(doctorA, { startsAt: new Date(PERIOD.periodEnd.getTime() - 3600 * 1000) });
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    expect(created).toHaveLength(0);
  });

  test('unpayable sessions are left alone', async () => {
    await payableSession(doctorA, { paymentStatus: 'refunded', refundAmount: 1000, refundId: 'r1' });
    await payableSession(doctorA, { status: 'cancelled' });
    await payableSession(doctorA, { doctorJoined: false });        // doctor no-show
    await payableSession(doctorA, { paymentStatus: 'not_required', price: 0, doctorEarnings: 0 });

    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    expect(created).toHaveLength(0);
  });

  test('a patient no-show IS payable — the doctor attended', async () => {
    await payableSession(doctorA, { status: 'no-show', patientJoined: false, doctorJoined: true });
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    expect(created[0].claimed).toBe(1);
  });

  test('nothing before PAYOUT_EPOCH is ever claimed', async () => {
    // Without a floor, the first run bills every completed session in history.
    const ancient = periodFor(new Date(ledger.PAYOUT_EPOCH.getTime() - 30 * 864e5));
    await Session.create({
      patientId, doctorId: doctorA,
      startsAt: new Date(ancient.periodStart.getTime() + 3600 * 1000),
      duration: 60, price: 1000, platformFee: 200, doctorEarnings: 800,
      status: 'completed', paymentStatus: 'paid', paymentId: 'pay_ancient',
      doctorJoined: true, patientJoined: true
    });

    const { created } = await ledger.generatePayouts(ancient.periodKey);
    expect(created).toHaveLength(0);
  });

  test('running generate twice is a complete no-op the second time', async () => {
    await payableSession(doctorA);
    const first = await ledger.generatePayouts(PERIOD.periodKey);
    expect(first.created[0].claimed).toBe(1);

    // The candidate scan filters on payoutId: null, so after the first run
    // there is no doctor left with anything to claim and the second run does
    // not even touch the existing payout.
    const second = await ledger.generatePayouts(PERIOD.periodKey);
    expect(second.created).toHaveLength(0);
    expect(await Payout.countDocuments({ doctorId: doctorA })).toBe(1);
    expect(await Session.countDocuments({ payoutId: { $ne: null } })).toBe(1);
  });

  test('two concurrent generates produce one payout and claim each session once', async () => {
    await payableSession(doctorA);
    await payableSession(doctorA);

    await Promise.all([
      ledger.generatePayouts(PERIOD.periodKey),
      ledger.generatePayouts(PERIOD.periodKey)
    ]);

    expect(await Payout.countDocuments({ periodKey: PERIOD.periodKey })).toBe(1);
    const payout = await Payout.findOne({ periodKey: PERIOD.periodKey });
    expect(await Session.countDocuments({ payoutId: payout._id })).toBe(2);
    expect(await Session.countDocuments({ payoutId: null })).toBe(0);
  });
});

describe('lock freezes the money from what was actually claimed', () => {
  test('totals are summed from the claimed set', async () => {
    await payableSession(doctorA);
    await payableSession(doctorA, { price: 2000, platformFee: 400, doctorEarnings: 1600 });
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);

    const locked = await ledger.lockPayout(created[0].payoutId);

    expect(locked.status).toBe('locked');
    expect(locked.sessionCount).toBe(2);
    expect(locked.grossPrice).toBe(3000);
    expect(locked.platformFeeTotal).toBe(600);
    expect(locked.grossEarnings).toBe(2400);
    expect(locked.netPayable).toBe(2400);
    // The commission split adds up.
    expect(locked.platformFeeTotal + locked.grossEarnings).toBe(locked.grossPrice);
  });

  test('the bank details are snapshotted, and only the last four digits', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);

    expect(locked.bankSnapshot.accountHolderName).toBe('A Practitioner');
    expect(locked.bankSnapshot.ifsc).toBe('HDFC0001234');
    expect(locked.bankSnapshot.accountNumberLast4).toBe('9012');
    // A receipt must not carry the full account number.
    expect(JSON.stringify(locked.bankSnapshot)).not.toContain('123456789012');
  });

  test('outstanding adjustments are absorbed and netted off', async () => {
    await payableSession(doctorA);   // 800 earnings
    await PayoutAdjustment.create({
      doctorId: doctorA, amount: -300, kind: 'manual_debit',
      reason: 'agreed correction', idempotencyKey: 'manual:test-1'
    });

    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);

    expect(locked.grossEarnings).toBe(800);
    expect(locked.adjustmentsTotal).toBe(-300);
    expect(locked.netPayable).toBe(500);

    const settled = await PayoutAdjustment.findOne({ idempotencyKey: 'manual:test-1' });
    expect(String(settled.settledInPayoutId)).toBe(String(locked._id));
    expect(settled.settledAt).toBeInstanceOf(Date);
  });

  test('debt larger than the week carries forward instead of paying a negative amount', async () => {
    await payableSession(doctorA);   // 800
    await PayoutAdjustment.create({
      doctorId: doctorA, amount: -1200, kind: 'refund_clawback',
      reason: 'big refund', idempotencyKey: 'manual:test-2'
    });

    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);

    // You cannot bank-transfer a negative amount.
    expect(locked.netPayable).toBe(0);
    expect(locked.carriedForward).toBe(400);

    // The remainder re-enters the ledger as a fresh UNSETTLED row, so next
    // week's rule is unchanged and the debt is not written off.
    const carried = await PayoutAdjustment.findOne({ kind: 'carry_forward', settledInPayoutId: null });
    expect(carried.amount).toBe(-400);
    expect(String(carried.sourcePayoutId)).toBe(String(locked._id));
  });

  test('locking twice is refused, not double-counted', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);

    await expect(ledger.lockPayout(created[0].payoutId)).rejects.toThrow(/locked or paid/i);
  });

  test('two concurrent locks: one wins, the totals are not doubled', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);

    const results = await Promise.allSettled([
      ledger.lockPayout(created[0].payoutId),
      ledger.lockPayout(created[0].payoutId)
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const payout = await Payout.findById(created[0].payoutId);
    expect(payout.grossEarnings).toBe(800);
  });
});

describe('locking cannot lose money', () => {
  test('re-locking a locked payout does not swallow a new adjustment', async () => {
    // Lock used to settle every unsettled adjustment into the payout BEFORE
    // its draft->locked compare-and-set. On an already-locked payout that
    // marked a fresh clawback as deducted from a total that was already
    // frozen without it — and it was never collected from anyone.
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);

    const clawback = await PayoutAdjustment.create({
      doctorId: doctorA, amount: -300, kind: 'refund_clawback',
      idempotencyKey: 'clawback:relock-test', reason: 'test'
    });
    await expect(ledger.lockPayout(created[0].payoutId)).rejects.toThrow(/locked or paid/i);

    expect((await PayoutAdjustment.findById(clawback._id)).settledInPayoutId).toBeNull();
  });

  test('a lock that died before computing its totals cannot be paid, and can be resumed', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    // Simulate a crash between claiming the lock and freezing the amounts.
    await Payout.updateOne(
      { _id: created[0].payoutId },
      { $set: { status: 'locked', lockedAt: new Date(Date.now() - 10 * 60 * 1000), totalsComputedAt: null } }
    );

    await expect(ledger.markPaid(created[0].payoutId, { transferReference: 'UTR1' })).rejects.toThrow(/still being locked/i);

    const resumed = await ledger.lockPayout(created[0].payoutId);
    expect(resumed.grossEarnings).toBe(800);
    expect(resumed.totalsComputedAt).toBeInstanceOf(Date);
    const paid = await ledger.markPaid(created[0].payoutId, { transferReference: 'UTR1' });
    expect(paid.status).toBe('paid');
  });

  test('a payout locked before totalsComputedAt existed can still be paid', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);
    await Payout.collection.updateOne({ _id: created[0].payoutId }, { $unset: { totalsComputedAt: 1 } });

    const paid = await ledger.markPaid(created[0].payoutId, { transferReference: 'UTR-LEGACY' });
    expect(paid.status).toBe('paid');
  });

  test('a session that becomes payable after its week was locked is carried into the next draft', async () => {
    // Claims used to be bounded to the period being generated, so a session
    // swept to completed after its own week's payout froze matched no run,
    // ever, and the doctor was never paid for it.
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);

    const late = await payableSession(doctorA);

    const next = periodFor(new Date(PERIOD.periodEnd.getTime() + 2 * 864e5));
    const generated = await ledger.generatePayouts(next.periodKey, { now: new Date(next.periodEnd.getTime() + 1000) });
    expect(generated.created).toHaveLength(1);
    expect(generated.created[0].claimed).toBe(1);
    expect(String((await Session.findById(late._id)).payoutId)).toBe(String(generated.created[0].payoutId));
  });
});

describe('mark paid', () => {
  async function lockedPayout() {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    return ledger.lockPayout(created[0].payoutId);
  }

  test('records the reference and who did it', async () => {
    const locked = await lockedPayout();
    const adminId = new mongoose.Types.ObjectId();

    const paid = await ledger.markPaid(locked._id, { transferReference: 'UTR123456789', adminId });

    expect(paid.status).toBe('paid');
    expect(paid.transferReference).toBe('UTR123456789');
    expect(String(paid.paidBy)).toBe(String(adminId));
    expect(paid.paidAt).toBeInstanceOf(Date);
  });

  test('a reference is required — a payout with no UTR cannot be reconciled', async () => {
    const locked = await lockedPayout();
    await expect(ledger.markPaid(locked._id, { transferReference: '   ' }))
      .rejects.toThrow(/reference/i);
    expect((await Payout.findById(locked._id)).status).toBe('locked');
  });

  test('a draft cannot be marked paid — it has no computed amount', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await expect(ledger.markPaid(created[0].payoutId, { transferReference: 'UTR1' }))
      .rejects.toThrow(/not "locked"/i);
  });

  test('paying twice is refused — this is what stops a double bank transfer', async () => {
    const locked = await lockedPayout();
    await ledger.markPaid(locked._id, { transferReference: 'UTR-first' });

    await expect(ledger.markPaid(locked._id, { transferReference: 'UTR-second' }))
      .rejects.toThrow(/already been paid/i);

    // The original reference is intact — the second attempt changed nothing.
    expect((await Payout.findById(locked._id)).transferReference).toBe('UTR-first');
  });

  test('two concurrent mark-paid calls: exactly one succeeds', async () => {
    // The highest-severity failure mode in the feature: a double-clicked
    // button must not record (or prompt) two real transfers.
    const locked = await lockedPayout();
    const results = await Promise.allSettled([
      ledger.markPaid(locked._id, { transferReference: 'UTR-a' }),
      ledger.markPaid(locked._id, { transferReference: 'UTR-b' })
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Payout.findById(locked._id)).status).toBe('paid');
  });
});

describe('clawback when a paid-out session is refunded', () => {
  const { applyTransition } = require('../../services/sessionTransition');
  const { EVENT, ACTOR } = require('../../services/sessionState');

  test('a refund after payment creates a proportional negative adjustment', async () => {
    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-paid' });

    // Full refund of a 1000 session whose doctor share was 800.
    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 1000 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_1', refundAmount: 1000 } });

    const clawback = await PayoutAdjustment.findOne({ kind: 'refund_clawback' });
    expect(clawback).toBeTruthy();
    expect(clawback.amount).toBe(-800);
    expect(clawback.settledInPayoutId).toBeNull();   // lands on the NEXT payout
    expect(String(clawback.originPayoutId)).toBe(String(locked._id));
  });

  test('a partial refund claws back proportionally', async () => {
    const s = await payableSession(doctorA);        // price 1000, earnings 800
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-partial' });

    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 500 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_2', refundAmount: 500 } });

    // Half the price refunded -> half the doctor's share reclaimed.
    expect((await PayoutAdjustment.findOne({ kind: 'refund_clawback' })).amount).toBe(-400);
  });

  test('a refund while the payout is still a DRAFT just un-claims the session', async () => {
    // Cheapest correct answer: the doctor is simply never paid for it. Only
    // safe because a draft holds no money to correct.
    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);

    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 1000 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_3', refundAmount: 1000 } });

    expect((await Session.findById(s._id)).payoutId).toBeNull();
    expect(await PayoutAdjustment.countDocuments({ kind: 'refund_clawback' })).toBe(0);

    const locked = await ledger.lockPayout(created[0].payoutId);
    expect(locked.sessionCount).toBe(0);
    expect(locked.netPayable).toBe(0);
  });

  test('a refund on a session never paid out produces nothing', async () => {
    const s = await payableSession(doctorA);
    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 1000 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_4', refundAmount: 1000 } });

    expect(await PayoutAdjustment.countDocuments({})).toBe(0);
  });

  test('the clawback is written once, however many times the sweep runs', async () => {
    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-x' });

    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 1000 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_5', refundAmount: 1000 } });

    await ledger.reconcileClawbacks();
    await ledger.reconcileClawbacks();

    expect(await PayoutAdjustment.countDocuments({ kind: 'refund_clawback' })).toBe(1);
  });

  test('two sweeps racing on the same refund still write one clawback', async () => {
    // The sequential case above is handled by the upsert matching the row
    // that is already there. This is the other half: two writers in flight at
    // once, where both find nothing and both try to insert. Only the unique
    // index on idempotencyKey can decide that one, and the loser has to come
    // back as 'already-recorded' rather than as a 500 — the reconciliation
    // sweep runs hourly against the same sessions a refund webhook is
    // hooking, so this pair genuinely does overlap in production.
    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-race' });

    await Session.updateOne({ _id: s._id }, {
      $set: { paymentStatus: 'refunded', refundAmount: 1000, refundId: 'rfnd_race', refundedAt: new Date() }
    });

    const results = await Promise.all([
      ledger.reconcileClawbacks(),
      ledger.reconcileClawbacks(),
      ledger.reconcileClawbacks()
    ]);

    // Exactly one sweep recorded it; the others reported zero, not an error.
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await PayoutAdjustment.countDocuments({ kind: 'refund_clawback' })).toBe(1);
    expect((await PayoutAdjustment.findOne({ kind: 'refund_clawback' })).amount).toBe(-800);
  });

  test('reconciliation recovers a clawback the inline hook never wrote', async () => {
    // The inline hook is the fast path; the sweep is the guarantee.
    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-y' });

    // Simulate the hook having failed: refund the session behind the state
    // machine's back, so no hook could have fired.
    await Session.updateOne({ _id: s._id }, {
      $set: { paymentStatus: 'refunded', refundAmount: 1000, refundId: 'rfnd_6', refundedAt: new Date() }
    });
    expect(await PayoutAdjustment.countDocuments({})).toBe(0);

    const recorded = await ledger.reconcileClawbacks();
    expect(recorded).toBe(1);
    expect((await PayoutAdjustment.findOne({ kind: 'refund_clawback' })).amount).toBe(-800);
  });

  test('the hourly scheduler sweep is what actually calls this in production', async () => {
    // reconcileClawbacks is reached by cron, and a body only a cron can reach
    // is a body no test can call — so scheduler.js exports the job the same
    // way it exports runSessionStatusUpdate. This asserts the wiring, the
    // reported count, and the re-entrancy guard that stops two overlapping
    // ticks processing the same rows.
    const { runClawbackReconciliation } = require('../../services/scheduler');

    const s = await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const locked = await ledger.lockPayout(created[0].payoutId);
    await ledger.markPaid(locked._id, { transferReference: 'UTR-cron' });

    await Session.updateOne({ _id: s._id }, {
      $set: { paymentStatus: 'refunded', refundAmount: 1000, refundId: 'rfnd_cron', refundedAt: new Date() }
    });

    // Two ticks at once: one does the work, the other declines to re-enter.
    const [a, b] = await Promise.all([runClawbackReconciliation(), runClawbackReconciliation()]);
    expect([a, b].sort()).toEqual([0, 1]);
    expect(await PayoutAdjustment.countDocuments({ kind: 'refund_clawback' })).toBe(1);

    // A later tick with nothing left to do reports zero rather than throwing.
    expect(await runClawbackReconciliation()).toBe(0);
  });

  test('a failing sweep is swallowed, so one bad hour does not kill the cron', async () => {
    // node-cron does not restart a job whose callback rejects, and an
    // unhandled rejection here takes the whole scheduler process down with
    // it — the notification and status sweeps included. So the hourly job has
    // to absorb a database failure and report zero. Worth pinning: the
    // failure mode it prevents is silent and total.
    const { runClawbackReconciliation } = require('../../services/scheduler');
    const ledgerModule = require('../../services/payoutLedger');

    const spy = jest.spyOn(ledgerModule, 'reconcileClawbacks')
      .mockRejectedValue(new Error('connection to mongo lost'));
    try {
      await expect(runClawbackReconciliation()).resolves.toBe(0);
    } finally {
      spy.mockRestore();
    }

    // And the guard flag was released, so the next tick still runs.
    expect(await runClawbackReconciliation()).toBe(0);
  });

  test('the clawback is absorbed by the following week', async () => {
    // Week 1: earn 800, get paid, then the session is refunded.
    const s = await payableSession(doctorA);
    const w1 = await ledger.generatePayouts(PERIOD.periodKey);
    const locked1 = await ledger.lockPayout(w1.created[0].payoutId);
    await ledger.markPaid(locked1._id, { transferReference: 'UTR-w1' });
    await applyTransition(s._id, { event: EVENT.REFUND_INITIATED, actor: ACTOR.ADMIN, payload: { refundAmount: 1000 } });
    await applyTransition(s._id, { event: EVENT.REFUND_SUCCEEDED, actor: ACTOR.SYSTEM, payload: { refundId: 'rfnd_7', refundAmount: 1000 } });

    // Week 2: earn 800 again; the -800 clawback nets it to zero.
    const next = periodFor(new Date(PERIOD.periodEnd.getTime() + 864e5));
    await payableSession(doctorA, { startsAt: new Date(next.periodStart.getTime() + 2 * 864e5) });

    const w2 = await ledger.generatePayouts(next.periodKey, { now: new Date(next.periodEnd.getTime() + 1000) });
    const locked2 = await ledger.lockPayout(w2.created[0].payoutId);

    expect(locked2.grossEarnings).toBe(800);
    expect(locked2.adjustmentsTotal).toBe(-800);
    expect(locked2.netPayable).toBe(0);
    expect(locked2.carriedForward).toBe(0);
  });
});

describe('preview', () => {
  test('shows what is owed without writing anything', async () => {
    await payableSession(doctorA);
    await payableSession(doctorA);

    const preview = await ledger.previewPeriod(PERIOD.periodKey);

    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].sessionCount).toBe(2);
    expect(preview.rows[0].grossEarnings).toBe(1600);
    expect(preview.rows[0].netPayable).toBe(1600);
    expect(preview.rows[0].profile.payoutApproved).toBe(true);
    expect(preview.rows[0].profile.accountNumberLast4).toBe('9012');
    // Read-only.
    expect(await Payout.countDocuments({})).toBe(0);
    expect(await Session.countDocuments({ payoutId: { $ne: null } })).toBe(0);
  });

  test('flags a doctor who is owed money but not approved for payouts', async () => {
    await DoctorProfile.updateOne({ userId: doctorA }, { $set: { payoutApproved: false } });
    await payableSession(doctorA);

    const preview = await ledger.previewPeriod(PERIOD.periodKey);
    expect(preview.rows[0].profile.payoutApproved).toBe(false);
  });

  test('surfaces debt for a doctor with no payable sessions this week', async () => {
    // Otherwise the debt is invisible until they next work.
    await PayoutAdjustment.create({
      doctorId: doctorB, amount: -500, kind: 'refund_clawback',
      reason: 'from an earlier week', idempotencyKey: 'clawback:orphan-1'
    });

    const preview = await ledger.previewPeriod(PERIOD.periodKey);
    expect(preview.rows).toHaveLength(0);
    expect(preview.outstandingDebt).toHaveLength(1);
    expect(preview.outstandingDebt[0].outstanding).toBe(-500);
  });

  test('an invalid period key is rejected rather than silently returning nothing', async () => {
    // A 400 the admin can read, not a 500.
    await expect(ledger.previewPeriod('not-a-week')).rejects.toMatchObject({ statusCode: 400 });
    await expect(ledger.previewPeriod('2026-W99')).rejects.toThrow(/Invalid period/);
  });
});

describe('payouts only go to approved accounts, for finished weeks', () => {
  test('a week that has not ended cannot be generated', async () => {
    const current = periodFor(new Date());
    await expect(ledger.generatePayouts(current.periodKey)).rejects.toThrow(/has not ended/);
  });

  test('a doctor whose bank details are not approved cannot be locked or paid', async () => {
    // Changing bank details revokes approval. Lock used to snapshot whatever
    // was on file, approved or not, and mark-paid never looked.
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await DoctorProfile.updateOne({ userId: doctorA }, { $set: { payoutApproved: false, payoutBankStatus: 'pending_admin_approval' } });

    await expect(ledger.lockPayout(created[0].payoutId)).rejects.toThrow(/not approved/);
    expect((await Payout.findById(created[0].payoutId)).status).toBe('draft');
  });

  test('approval revoked after lock blocks mark-paid until it is restored', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);
    await DoctorProfile.updateOne({ userId: doctorA }, { $set: { payoutApproved: false, payoutBankStatus: 'pending_admin_approval' } });

    await expect(ledger.markPaid(created[0].payoutId, { transferReference: 'UTR9' })).rejects.toThrow(/not approved/);

    await DoctorProfile.updateOne({ userId: doctorA }, { $set: { payoutApproved: true, payoutBankStatus: 'approved' } });
    const paid = await ledger.markPaid(created[0].payoutId, { transferReference: 'UTR9' });
    expect(paid.status).toBe('paid');
    expect(paid.bankSnapshot.accountNumberLast4).toBe('9012');
  });

  test('a zero payout can be closed without inventing a bank reference', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await PayoutAdjustment.create({ doctorId: doctorA, amount: -800, kind: 'refund_clawback', idempotencyKey: 'clawback:zero-test', reason: 'test' });
    const locked = await ledger.lockPayout(created[0].payoutId);
    expect(locked.netPayable).toBe(0);
    const paid = await ledger.markPaid(created[0].payoutId, {});
    expect(paid.transferReference).toBe('NO-TRANSFER');
  });
});

describe('ledger edge cases', () => {
  test('locking or paying a payout that does not exist is a clear error', async () => {
    const ghost = new mongoose.Types.ObjectId();
    await expect(ledger.lockPayout(ghost)).rejects.toThrow(/not found/i);
    await expect(ledger.markPaid(ghost, { transferReference: 'UTR1' })).rejects.toThrow(/not found/i);
  });

  test('a non-zero payout still needs a reference', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await ledger.lockPayout(created[0].payoutId);
    await expect(ledger.markPaid(created[0].payoutId, {})).rejects.toThrow(/reference/i);
  });

  test('a doctor with no profile at all cannot be locked', async () => {
    const orphan = new mongoose.Types.ObjectId();
    await payableSession(orphan);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    const mine = created.find((c) => String(c.doctorId) === String(orphan));
    await expect(ledger.lockPayout(mine.payoutId)).rejects.toThrow(/not approved/);
  });
});

describe('accounts approved the old way', () => {
  test('a doctor marked payout-approved by the retired onboarding path, with no reviewed account, is not paid', async () => {
    // The legacy approval set payoutApproved without any bank details on
    // file. Those doctors are bookable, but nothing may be sent to them until
    // an admin approves an account in Bank Details.
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await DoctorProfile.updateOne({ userId: doctorA }, { $set: { payoutApproved: true, payoutBankStatus: 'not_submitted' } });
    await expect(ledger.lockPayout(created[0].payoutId)).rejects.toThrow(/not approved/);
  });

  test('an approved record with incomplete bank fields snapshots what it has rather than crashing', async () => {
    await payableSession(doctorA);
    const { created } = await ledger.generatePayouts(PERIOD.periodKey);
    await DoctorProfile.collection.updateOne({ userId: doctorA }, { $unset: { payoutBank: 1 } });
    const locked = await ledger.lockPayout(created[0].payoutId);
    expect(locked.bankSnapshot.accountNumberLast4).toBeNull();
    expect(locked.bankSnapshot.accountHolderName).toBeNull();
  });
});
