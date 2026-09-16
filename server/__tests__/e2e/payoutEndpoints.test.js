/**
 * The payout HTTP surface: what a doctor can submit, what an admin can see,
 * and what neither of them can do.
 *
 * WHY A SEPARATE SUITE FROM payoutLedger.test.js
 *
 * That suite tests the ledger as a library — periods, netting, clawbacks,
 * concurrency — by calling services/payoutLedger.js directly. It never goes
 * through HTTP, so it proves nothing about the layer that decides what leaves
 * the server. This one covers the half that only exists in the controller:
 *
 *   - The server-side format rules on IFSC, PAN and account number. A wrong
 *     IFSC means a transfer that bounces; a wrong account number means one
 *     that succeeds into a stranger's account. Client-side validation is a
 *     convenience, so the rules are asserted where they are enforced.
 *   - The masking. `getMyBankDetails` must never return a full account
 *     number, even to the doctor who typed it — a response body ends up in
 *     logs and browser caches. The ONE endpoint that returns it in full is
 *     the super-admin approval queue, because an admin needs it to make the
 *     transfer. That asymmetry is the thing worth pinning: it is one `.select`
 *     away from being wrong in either direction.
 *   - Approval is what makes a doctor bookable, so approving from the wrong
 *     state, or without a submission to look at, has to be refused.
 *
 * Route-level authorization is swept generically by authz.sweep.test.js, which
 * only ever asserts refusals. Nothing exercised these endpoints on their
 * SUCCESS paths, which left the controller at 24% coverage — including every
 * branch above.
 */

require('../support/env');

const request = require('supertest');
const mongoose = require('mongoose');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

let app, server, f;
let User, DoctorProfile, Payout, PayoutAdjustment, Session;
let doctorToken, otherDoctorToken, adminToken, superAdminToken;

const GOOD = {
  accountHolderName: 'Asha Rao',
  accountNumber: '123456789012',
  ifsc: 'HDFC0001234',
  panNumber: 'ABCDE1234F'
};

async function csrfPair() {
  const res = await request(server).get('/api/csrf-token');
  return { csrf: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function call(method, path, token, body) {
  const { csrf, cookie } = await csrfPair();
  let req = request(server)[method](path).set('Cookie', cookie).set('X-CSRF-Token', csrf);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

beforeAll(async () => {
  await connectDb('payout-endpoints');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');
  Payout = require('../../models/payout');
  PayoutAdjustment = require('../../models/payoutAdjustment');
  Session = require('../../models/session');

  // The exactly-once constraints must exist before anything asserts on them.
  await Promise.all([Payout.syncIndexes(), PayoutAdjustment.syncIndexes()]);

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret, getAdminJWTSecret } = require('../../config/auth');
  doctorToken = jwt.sign(
    { userId: String(f.doctorA._id), username: f.doctorA.username, role: 'doctor' },
    getJWTSecret(), { expiresIn: '1h' }
  );
  otherDoctorToken = jwt.sign(
    { userId: String(f.doctorB._id), username: f.doctorB.username, role: 'doctor' },
    getJWTSecret(), { expiresIn: '1h' }
  );
  adminToken = jwt.sign({ userId: String(f.admin._id), role: 'admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
  superAdminToken = jwt.sign({ userId: String(f.superAdmin._id), role: 'super_admin' }, getAdminJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  // The seed makes doctors payout-approved so they are bookable. Rewind to
  // "never submitted" so each test drives the transition it is about.
  await DoctorProfile.updateMany(
    { userId: { $in: [f.doctorA._id, f.doctorB._id] } },
    {
      $set: { payoutApproved: false, payoutApprovedAt: null, payoutBankStatus: 'not_submitted', payoutRejectionReason: null },
      $unset: { payoutBank: 1 }
    }
  );
  // Sessions too: a payable session left behind by one test changes what the
  // next one's preview and generate see.
  await Promise.all([Payout.deleteMany({}), PayoutAdjustment.deleteMany({}), Session.deleteMany({})]);
});

/* ───────────────────────── the doctor's own details ────────────────────── */

describe('a doctor submitting bank details', () => {
  test('a valid submission is accepted and parks the doctor in the approval queue', async () => {
    const res = await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending_admin_approval');

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id })
      .select('payoutBankStatus payoutApproved +payoutBank.accountNumber +payoutBank.ifsc +payoutBank.submittedAt');
    expect(profile.payoutBankStatus).toBe('pending_admin_approval');
    // Submitting does NOT make them bookable — an admin still has to look.
    expect(profile.payoutApproved).toBe(false);
    expect(profile.payoutBank.accountNumber).toBe('123456789012');
    expect(profile.payoutBank.submittedAt).toBeInstanceOf(Date);
  });

  test('the account number is stored with spaces stripped, and the IFSC and PAN upper-cased', async () => {
    // People copy account numbers out of passbooks in groups of four, and
    // type an IFSC however their keyboard left it. Normalising on the way in
    // means the stored value is the one that goes on the transfer.
    const res = await call('post', '/api/payouts/bank-details', doctorToken, {
      ...GOOD,
      accountNumber: '1234 5678 9012',
      ifsc: 'hdfc0001234',
      panNumber: 'abcde1234f'
    });
    expect(res.status).toBe(200);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id })
      .select('+payoutBank.accountNumber +payoutBank.ifsc +payoutBank.panNumber');
    expect(profile.payoutBank.accountNumber).toBe('123456789012');
    expect(profile.payoutBank.ifsc).toBe('HDFC0001234');
    expect(profile.payoutBank.panNumber).toBe('ABCDE1234F');
  });

  test.each([
    ['a too-short name', { accountHolderName: 'A' }, 'accountHolderName'],
    ['an account number with letters', { accountNumber: '12345678abc' }, 'accountNumber'],
    ['an account number that is too short', { accountNumber: '12345678' }, 'accountNumber'],
    ['an IFSC without the fifth-character zero', { ifsc: 'HDFC1001234' }, 'ifsc'],
    ['an IFSC of the wrong length', { ifsc: 'HDFC000123' }, 'ifsc'],
    ['a PAN in the wrong shape', { panNumber: 'ABCD11234F' }, 'panNumber']
  ])('%s is refused, naming the field', async (_label, override, field) => {
    const res = await call('post', '/api/payouts/bank-details', doctorToken, { ...GOOD, ...override });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors || res.body.details || {})).toContain(field);

    // Nothing was written — a rejected submission must not half-land.
    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id })
      .select('payoutBankStatus +payoutBank.submittedAt');
    expect(profile.payoutBankStatus).toBe('not_submitted');
  });

  test('every bad field is reported at once, not one per round trip', async () => {
    const res = await call('post', '/api/payouts/bank-details', doctorToken, {
      accountHolderName: 'X', accountNumber: 'nope', ifsc: 'bad', panNumber: 'bad'
    });
    expect(res.status).toBe(400);
    const errors = res.body.errors || res.body.details || {};
    expect(Object.keys(errors).sort())
      .toEqual(['accountHolderName', 'accountNumber', 'ifsc', 'panNumber']);
  });

  test('a resubmission replaces the details and revokes an existing approval', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, superAdminToken, {});
    expect((await DoctorProfile.findOne({ userId: f.doctorA._id })).payoutApproved).toBe(true);

    const res = await call('post', '/api/payouts/bank-details', doctorToken, {
      ...GOOD, accountNumber: '999888777666'
    });
    expect(res.status).toBe(200);

    // The whole point of the model hook: changing where money goes cannot
    // keep an approval granted against the old account.
    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id })
      .select('payoutApproved payoutBankStatus +payoutBank.accountNumber');
    expect(profile.payoutApproved).toBe(false);
    expect(profile.payoutBankStatus).toBe('pending_admin_approval');
    expect(profile.payoutBank.accountNumber).toBe('999888777666');
  });
});

describe('a doctor reading back their own details', () => {
  test('before submitting, the status is not_submitted and there are no details', async () => {
    const res = await call('get', '/api/payouts/bank-details', doctorToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('not_submitted');
    expect(res.body.details).toBeNull();
    expect(res.body.payoutApproved).toBe(false);
  });

  test('after submitting, the account number comes back MASKED and the PAN partly hidden', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);

    const res = await call('get', '/api/payouts/bank-details', doctorToken);
    expect(res.status).toBe(200);
    expect(res.body.details.accountNumberMasked).toBe('••••9012');
    expect(res.body.details.panMasked).toBe('ABC••••F');
    expect(res.body.details.ifsc).toBe('HDFC0001234');

    // The full number must not appear anywhere in the payload, under any key.
    expect(JSON.stringify(res.body)).not.toContain('123456789012');
    expect(JSON.stringify(res.body)).not.toContain('ABCDE1234F');
  });

  test('a rejection comes back with the reason, so the doctor knows what to fix', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/reject`, superAdminToken,
      { reason: 'Name does not match the account' });

    const res = await call('get', '/api/payouts/bank-details', doctorToken);
    expect(res.body.status).toBe('rejected');
    expect(res.body.rejectionReason).toBe('Name does not match the account');
    expect(res.body.payoutApproved).toBe(false);
  });

  test('one doctor cannot read another doctor\'s details by asking', async () => {
    // The endpoint is self-scoped by req.actor.id with no addressable id in
    // the path, so this is really a test that it stays that way.
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);

    const res = await call('get', '/api/payouts/bank-details', otherDoctorToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('not_submitted');
    expect(JSON.stringify(res.body)).not.toContain('9012');
  });
});

/* ───────────────────────── the admin approval queue ────────────────────── */

describe('the admin approval queue', () => {
  test('a pending submission is listed WITH the full account number', async () => {
    // The one place the full number is returned: an admin cannot make a bank
    // transfer against four asterisks. Gated on super admin.
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);

    const res = await call('get', '/api/admin/payments/payouts/bank-details', superAdminToken);
    expect(res.status).toBe(200);
    const mine = res.body.submissions.find((s) => String(s.doctorId) === String(f.doctorA._id));
    expect(mine).toBeTruthy();
    expect(mine.accountNumber).toBe('123456789012');
    expect(mine.ifsc).toBe('HDFC0001234');
    expect(mine.panNumber).toBe('ABCDE1234F');
    expect(mine.email).toBe(f.doctorA.email);
  });

  test('the queue defaults to pending, and an approved doctor drops out of it', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, superAdminToken, {});

    const pending = await call('get', '/api/admin/payments/payouts/bank-details', superAdminToken);
    expect(pending.body.submissions.map((s) => String(s.doctorId)))
      .not.toContain(String(f.doctorA._id));

    const approved = await call('get', '/api/admin/payments/payouts/bank-details?status=approved', superAdminToken);
    expect(approved.body.submissions.map((s) => String(s.doctorId)))
      .toContain(String(f.doctorA._id));
  });

  test('an unrecognised status filter falls back to pending rather than returning everything', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    const res = await call('get', '/api/admin/payments/payouts/bank-details?status=../../etc', superAdminToken);
    expect(res.status).toBe(200);
    expect(res.body.submissions.every((s) => s.status === 'pending_admin_approval')).toBe(true);
  });

  test('an ordinary admin cannot see the queue — account numbers are super-admin only', async () => {
    const res = await call('get', '/api/admin/payments/payouts/bank-details', adminToken);
    expect(res.status).toBe(403);
  });
});

describe('approving and rejecting', () => {
  test('approval makes the doctor bookable and records who decided', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);

    const res = await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, superAdminToken, {});
    expect(res.status).toBe(200);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(profile.payoutApproved).toBe(true);
    expect(profile.payoutApprovedAt).toBeInstanceOf(Date);
    expect(String(profile.payoutApprovedBy)).toBe(String(f.superAdmin._id));
    expect(profile.payoutBankStatus).toBe('approved');
  });

  test('approving a doctor who never submitted anything is refused', async () => {
    // Otherwise an admin can grant a payout route by clicking a stale row,
    // and the doctor becomes bookable with no account on file at all.
    const res = await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, superAdminToken, {});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not submitted/i);
    expect((await DoctorProfile.findOne({ userId: f.doctorA._id })).payoutApproved).toBe(false);
  });

  test('approving a doctor id that has no profile is a 404, not a silent success', async () => {
    const res = await call('post', `/api/admin/payments/payouts/bank-details/${new mongoose.Types.ObjectId()}/approve`, superAdminToken, {});
    expect(res.status).toBe(404);
  });

  test('rejection requires a reason', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);

    const blank = await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/reject`, superAdminToken, { reason: '   ' });
    expect(blank.status).toBe(400);
    expect((await DoctorProfile.findOne({ userId: f.doctorA._id })).payoutBankStatus)
      .toBe('pending_admin_approval');
  });

  test('rejection revokes approval as well as setting the reason', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, superAdminToken, {});

    const res = await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/reject`, superAdminToken,
      { reason: 'IFSC belongs to a closed branch' });
    expect(res.status).toBe(200);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(profile.payoutApproved).toBe(false);
    expect(profile.payoutApprovedAt).toBeNull();
    expect(profile.payoutBankStatus).toBe('rejected');
    expect(profile.payoutRejectionReason).toBe('IFSC belongs to a closed branch');
  });

  test('rejecting a doctor id that has no profile is a 404', async () => {
    const res = await call('post', `/api/admin/payments/payouts/bank-details/${new mongoose.Types.ObjectId()}/reject`, superAdminToken, { reason: 'nope' });
    expect(res.status).toBe(404);
  });

  test('a doctor cannot approve themselves', async () => {
    await call('post', '/api/payouts/bank-details', doctorToken, GOOD);
    const res = await call('post', `/api/admin/payments/payouts/bank-details/${f.doctorA._id}/approve`, doctorToken, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await DoctorProfile.findOne({ userId: f.doctorA._id })).payoutApproved).toBe(false);
  });
});

/* ──────────────────────────── the weekly run ───────────────────────────── */

describe('the weekly payout run over HTTP', () => {
  test('the preview defaults to the week that has just closed, not the current one', async () => {
    // An admin pays on a Tuesday for the week that ended on Sunday. Defaulting
    // to the in-progress week would show a number that is still changing.
    const { previousPeriod } = require('../../services/payoutPeriod');
    const res = await call('get', '/api/admin/payments/payouts/preview', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.period.periodKey).toBe(previousPeriod().periodKey);
  });

  test('an invalid period key is refused rather than treated as an empty week', async () => {
    const res = await call('get', '/api/admin/payments/payouts/preview?period=not-a-week', adminToken);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('generate, lock and mark-paid walk a payout to paid and record the reference', async () => {
    const { periodFor } = require('../../services/payoutPeriod');
    const period = periodFor(new Date(Date.now() - 10 * 864e5));

    // Two days into the period, not the first hour: PAYOUT_EPOCH clamps the
    // window's start, and this period straddles it. A session before the
    // epoch is deliberately unpayable — the floor that stops a first run
    // claiming every completed session in history.
    await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(period.periodStart.getTime() + 2 * 864e5),
      duration: 60, price: 1000, doctorEarnings: 800, platformFee: 200,
      status: 'completed', paymentStatus: 'paid',
      doctorJoined: true, patientJoined: true,
      razorpayPaymentId: 'pay_endpoint_1', payoutId: null
    });

    const generated = await call('post', '/api/admin/payments/payouts/generate', superAdminToken, { period: period.periodKey });
    expect(generated.status).toBe(200);
    expect(generated.body.created.length).toBe(1);

    const payoutId = generated.body.created[0].payoutId;
    const locked = await call('post', `/api/admin/payments/payouts/${payoutId}/lock`, superAdminToken, {});
    expect(locked.status).toBe(200);
    expect(locked.body.payout.netPayable).toBe(800);
    expect(locked.body.payout.status).toBe('locked');

    const paid = await call('post', `/api/admin/payments/payouts/${payoutId}/mark-paid`, superAdminToken,
      { transferReference: 'UTR-ENDPOINT-1' });
    expect(paid.status).toBe(200);
    expect(paid.body.payout.status).toBe('paid');
    expect(paid.body.payout.transferReference).toBe('UTR-ENDPOINT-1');

    // And the doctor can now see it in their own history.
    const mine = await call('get', '/api/payouts/my-payouts', doctorToken);
    expect(mine.status).toBe(200);
    expect(mine.body.payouts).toHaveLength(1);
    expect(mine.body.payouts[0].netPayable).toBe(800);
    expect(mine.body.payouts[0].transferReference).toBe('UTR-ENDPOINT-1');
  });

  test('a doctor sees nothing while their payout is still a draft', async () => {
    // Drafts are an admin working state. Showing one to a doctor would
    // promise a number that lock can still change.
    await Payout.create({
      doctorId: f.doctorA._id,
      periodKey: '2026-W01',
      periodStart: new Date('2025-12-29T00:00:00Z'),
      periodEnd: new Date('2026-01-05T00:00:00Z'),
      scheduledPayoutDate: new Date('2026-01-06T00:00:00Z'),
      status: 'draft'
    });

    const res = await call('get', '/api/payouts/my-payouts', doctorToken);
    expect(res.status).toBe(200);
    expect(res.body.payouts).toHaveLength(0);
  });

  test('the admin list filters by period and by status', async () => {
    await Payout.create({
      doctorId: f.doctorA._id, periodKey: '2026-W02',
      periodStart: new Date('2026-01-05T00:00:00Z'), periodEnd: new Date('2026-01-12T00:00:00Z'),
      scheduledPayoutDate: new Date('2026-01-13T00:00:00Z'), status: 'locked'
    });

    const byPeriod = await call('get', '/api/admin/payments/payouts?period=2026-W02', adminToken);
    expect(byPeriod.status).toBe(200);
    expect(byPeriod.body.count).toBe(1);
    expect(byPeriod.body.currentPeriod).toMatch(/^\d{4}-W\d{2}$/);

    const byStatus = await call('get', '/api/admin/payments/payouts?status=paid', adminToken);
    expect(byStatus.body.count).toBe(0);

    // A junk status must not widen the query to everything.
    const junk = await call('get', '/api/admin/payments/payouts?status=whatever', adminToken);
    expect(junk.body.count).toBe(1);
  });

  test('generating and locking are super-admin only; reading is not', async () => {
    // adminPayments.routes.js draws this line: reading payment state is an
    // admin capability, moving money is a super-admin one.
    expect((await call('get', '/api/admin/payments/payouts', adminToken)).status).toBe(200);
    expect((await call('post', '/api/admin/payments/payouts/generate', adminToken, {})).status).toBe(403);
    expect((await call('post', `/api/admin/payments/payouts/${new mongoose.Types.ObjectId()}/lock`, adminToken, {})).status).toBe(403);
  });

  test('a malformed payout id is rejected before it reaches Mongoose', async () => {
    const res = await call('post', '/api/admin/payments/payouts/not-an-objectid/lock', superAdminToken, {});
    expect(res.status).toBe(400);
  });

  test('locking a payout that does not exist is refused', async () => {
    const res = await call('post', `/api/admin/payments/payouts/${new mongoose.Types.ObjectId()}/lock`, superAdminToken, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
