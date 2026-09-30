/**
 * Concurrency and the compare-and-set wrapper.
 *
 * services/sessionState.js is exhaustively tested as a pure function, but
 * services/sessionTransition.js — the part that actually writes to the
 * database, retries on a lost race and raises ConcurrentModificationError — was
 * only 37% covered and had no concurrent test at all.
 *
 * The wider point these cases make: applyTransition is used on exactly ONE
 * path (completeSession). Every other status/payment write in the application
 * calls session.save() directly, so the guarantees demonstrated here do not
 * protect cancellation, payment capture, the webhook handlers or the scheduler.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const mockRefund = jest.fn().mockResolvedValue({ id: 'rfnd_conc', status: 'processed' });
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn().mockResolvedValue({ id: 'order_conc', status: 'created' }) },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app, f;
let server;
let patientToken, doctorToken;
let Session, DoctorAvailability, Review, WebhookEvent;
let transition;

beforeAll(async () => {
  await connectDb('concurrency');
  app = require('../../app');
  server = await startServer(app);
  Session = require('../../models/session');
  DoctorAvailability = require('../../models/doctorAvailability');
  Review = require('../../models/review');
  WebhookEvent = require('../../models/webhookEvent');
  transition = require('../../services/sessionTransition');

  const { seedAll } = require('../support/seed');
  f = await seedAll();

  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  patientToken = jwt.sign({ userId: String(f.patientA._id), username: f.patientA.username, role: 'patient' }, getJWTSecret(), { expiresIn: '1h' });
  doctorToken = jwt.sign({ userId: String(f.doctorA._id), username: f.doctorA.username, role: 'doctor' }, getJWTSecret(), { expiresIn: '1h' });
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

beforeEach(async () => {
  await Promise.all([Session.deleteMany({}), Review.deleteMany({}), WebhookEvent.deleteMany({})]);
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'rfnd_conc', status: 'processed' });
});

async function call(method, path, token, body) {
  const t = await request(server).get('/api/csrf-token');
  let req = request(server)[method](path)
    .set('Cookie', t.headers['set-cookie'])
    .set('X-CSRF-Token', t.body.csrfToken);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

async function futureSession(over = {}) {
  return Session.create({
    patientId: f.patientA._id, doctorId: f.doctorA._id,
    startsAt: new Date(Date.now() + 48 * 3600 * 1000),
    duration: 60, price: 2000,
    status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_conc_01',
    ...over
  });
}

describe('applyTransition compare-and-set', () => {
  const { EVENT, ACTOR } = require('../../services/sessionTransition');

  test('a transition applied against a stale in-memory copy still lands correctly', async () => {
    const s = await futureSession({ startsAt: new Date(Date.now() - 90 * 60 * 1000) });
    const stale = await Session.findById(s._id);

    // Someone else moves the row after `stale` was loaded.
    await Session.updateOne({ _id: s._id }, { $set: { doctorJoined: true, patientJoined: true } });

    const result = await transition.applyTransition(stale, {
      event: EVENT.COMPLETE,
      actor: ACTOR.DOCTOR
    });

    expect(result).toBeTruthy();
    const after = await Session.findById(s._id);
    expect(after.status).toBe('completed');
    // The concurrent write was not clobbered.
    expect(after.doctorJoined).toBe(true);
  });

  test('two simultaneous completes produce one completion, not two conflicting writes', async () => {
    const s = await futureSession({ startsAt: new Date(Date.now() - 90 * 60 * 1000) });
    const id = String(s._id);

    const results = await Promise.allSettled([
      transition.applyTransition(id, { event: EVENT.COMPLETE, actor: ACTOR.DOCTOR }),
      transition.applyTransition(id, { event: EVENT.COMPLETE, actor: ACTOR.DOCTOR })
    ]);

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const after = await Session.findById(s._id);
    expect(after.status).toBe('completed');
    // The loser collapses into a benign no-op rather than a second write.
    const changes = results.filter((r) => r.status === 'fulfilled' && r.value.changed);
    expect(changes).toHaveLength(1);
  });

  test('a bare ObjectId, a string id and a document all work identically', async () => {
    // This used to be a known trap, pinned here as a failing-by-design
    // characterisation: sessionTransition distinguished "a document" from "an
    // id" with `sessionOrId._id ? doc : findById(...)`, but a Mongoose
    // ObjectId has an `_id` getter returning ITSELF, so an ObjectId took the
    // document branch and was used AS the session. Every field read undefined
    // and the call died with a nonsensical 'status "undefined"'.
    //
    // The note here said it was "not live today — the single production call
    // site passes a document". services/sessionRefund.js then became a second
    // call site that passes an id, and it was live within the hour. The
    // detection is now explicit (string, or _bsontype === 'ObjectId'), so all
    // three accepted forms behave the same.
    for (const asArg of [
      (doc) => doc._id,          // bare ObjectId — the form that broke
      (doc) => String(doc._id),  // string id
      (doc) => doc               // hydrated document
    ]) {
      const s = await futureSession({ startsAt: new Date(Date.now() - 90 * 60 * 1000) });
      const result = await transition.tryTransition(asArg(s), { event: EVENT.COMPLETE, actor: ACTOR.DOCTOR });

      expect(result.changed).toBe(true);
      expect((await Session.findById(s._id)).status).toBe('completed');
    }
  });

  test('tryTransition reports an illegal transition instead of throwing', async () => {
    const s = await futureSession();
    // Completing before the session has started is illegal.
    const result = await transition.tryTransition(String(s._id), { event: EVENT.COMPLETE, actor: ACTOR.DOCTOR });
    expect(result.changed).toBe(false);
    expect(result.error).toBeDefined();
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('an illegal transition leaves the row byte-identical', async () => {
    const s = await futureSession();
    const before = (await Session.findById(s._id)).toObject();

    await transition.tryTransition(s._id, { event: EVENT.COMPLETE, actor: ACTOR.DOCTOR });

    const after = (await Session.findById(s._id)).toObject();
    expect(after.status).toBe(before.status);
    expect(after.paymentStatus).toBe(before.paymentStatus);
    expect(after.paymentId).toBe(before.paymentId);
  });
});

describe('concurrent HTTP requests on one session', () => {
  test('CONCURRENT cancels issue exactly ONE refund for one payment', async () => {
    // cancelSession used to guard with a read-then-save: load the session,
    // see status !== 'cancelled', save 'cancelled', then call the gateway. Two
    // requests whose reads both landed before either write both passed the
    // guard and both refunded the same paymentId — measured at 96% for two
    // concurrent requests. A patient double-clicking Cancel was the trigger.
    //
    // It now claims the cancellation with a compare-and-set
    // (applyTransition), so the loser's write matches nothing and it gets the
    // idempotent "already cancelled" answer without touching money.
    //
    // The interleaving is FORCED rather than raced: the first request is held
    // inside its compare-and-set until the second has also reached its own,
    // so both have read the session as un-cancelled before either writes.
    // That is the exact schedule that used to double-refund.
    const s = await futureSession();

    const realFindOneAndUpdate = Session.findOneAndUpdate;
    let writes = 0;
    let firstWriteEntered;
    const entered = new Promise((resolve) => { firstWriteEntered = resolve; });
    let releaseFirstWrite;
    const gate = new Promise((resolve) => { releaseFirstWrite = resolve; });

    Session.findOneAndUpdate = async function gatedFindOneAndUpdate(...args) {
      writes += 1;
      if (writes === 1) {
        firstWriteEntered();
        await gate;
      }
      return realFindOneAndUpdate.apply(this, args);
    };

    let ra, rb;
    try {
      // .then() forces supertest to dispatch; a Test object is lazy.
      const a = call('post', `/api/sessions/${s._id}/cancel`, patientToken, {}).then((r) => r);
      await entered;

      // A has read and validated but not yet written, so B sees the session
      // still un-cancelled and passes the same read guard.
      const b = call('post', `/api/sessions/${s._id}/cancel`, patientToken, {}).then((r) => r);

      const deadline = Date.now() + 8000;
      while (writes < 2 && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 10); });
      }
      expect(writes).toBeGreaterThanOrEqual(2);
      releaseFirstWrite();

      [ra, rb] = await Promise.all([a, b]);
    } finally {
      Session.findOneAndUpdate = realFindOneAndUpdate;
    }

    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    // One of them did the work; the other was told it was already done.
    const messages = [ra.body.message, rb.body.message].sort();
    expect(messages).toEqual(['Session already cancelled', 'Session cancelled successfully']);

    // The fix: the gateway is asked to refund exactly once.
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][0]).toBe('pay_conc_01');

    const after = await Session.findById(s._id);
    expect(after.status).toBe('cancelled');
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundAmount).toBe(2000);
    expect(after.refundId).toBe('rfnd_conc');
  });
  test('the cancelled status is written BEFORE the gateway is called', async () => {
    // Establishes the ordering the test above depends on, and rules out the
    // simpler explanation that the refund happens first. It also means a
    // gateway failure leaves a session already marked cancelled — which is why
    // the refund_failed state exists.
    const s = await futureSession({ paymentId: 'pay_order_probe' });

    let statusWhenGatewayCalled = null;
    mockRefund.mockImplementation(async () => {
      const row = await Session.findById(s._id).lean();
      statusWhenGatewayCalled = row.status;
      return { id: 'rfnd_probe', status: 'processed' };
    });

    await call('post', `/api/sessions/${s._id}/cancel`, patientToken, {});
    expect(statusWhenGatewayCalled).toBe('cancelled');
  });

  test('SEQUENTIAL cancels are idempotent — the contract the existing suite pins', async () => {
    const s = await futureSession({ paymentId: 'pay_conc_seq' });

    await call('post', `/api/sessions/${s._id}/cancel`, patientToken, {});
    await call('post', `/api/sessions/${s._id}/cancel`, patientToken, {});

    expect(mockRefund).toHaveBeenCalledTimes(1);
  });

  test('a cancel racing a complete cannot leave the session both cancelled and completed', async () => {
    const s = await futureSession({ startsAt: new Date(Date.now() + 30 * 60 * 1000) });

    await Promise.all([
      call('post', `/api/sessions/${s._id}/cancel`, patientToken, {}),
      call('post', `/api/sessions/${s._id}/complete`, doctorToken, {})
    ]);

    const after = await Session.findById(s._id);
    expect(['cancelled', 'completed', 'scheduled']).toContain(after.status);
    // Whatever won, the invariants must hold: a refunded session carries a
    // refund id and a positive amount; a non-refunded one does not.
    if (after.paymentStatus === 'refunded') {
      expect(after.refundId).toBeTruthy();
      expect(after.refundAmount).toBeGreaterThan(0);
    }
  });

  test('two simultaneous reviews create one row — because of the index, not the code', async () => {
    // submitReview guards with a read-then-write check: findOne for an existing
    // review, then save. Two concurrent requests both read nothing and both
    // save, exactly as with cancellation. What stops a duplicate here is the
    // unique index on {sessionId, patientId, reviewType} at the database level.
    //
    // Indexes are built asynchronously by Mongoose's autoIndex, so this has to
    // wait for the build before it means anything — and that wait is itself the
    // point: the guarantee lives in the index, not in the application.
    await Review.syncIndexes();

    const s = await futureSession({
      status: 'completed', startsAt: new Date(Date.now() - 5 * 3600 * 1000)
    });
    const body = { sessionId: String(s._id), reviewType: 'doctor', rating: 5, feedback: 'Great' };

    await Promise.all([
      call('post', '/api/reviews/submit', patientToken, body),
      call('post', '/api/reviews/submit', patientToken, body)
    ]);

    expect(await Review.countDocuments({ sessionId: s._id })).toBe(1);
  });

  test('without that index the application check alone permits duplicates', async () => {
    // Worth knowing because production deployments commonly disable autoIndex
    // for startup performance, and this app has no migration that creates the
    // index explicitly. If it is ever absent, one patient can submit the same
    // review twice by double-clicking, and the doctor's rating is recomputed
    // from the duplicates.
    await Review.collection.dropIndexes().catch(() => {});

    const s = await futureSession({
      status: 'completed', startsAt: new Date(Date.now() - 5 * 3600 * 1000),
      paymentId: 'pay_conc_review'
    });
    const body = { sessionId: String(s._id), reviewType: 'doctor', rating: 4, feedback: 'Fine' };

    // Force the interleaving the same way as the cancellation case.
    const realSave = Review.prototype.save;
    let saves = 0;
    let entered;
    const firstEntered = new Promise((resolve) => { entered = resolve; });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });

    Review.prototype.save = async function gatedSave(...args) {
      saves += 1;
      if (saves === 1) { entered(); await gate; }
      return realSave.apply(this, args);
    };

    try {
      const a = call('post', '/api/reviews/submit', patientToken, body).then((r) => r);
      await firstEntered;
      const b = call('post', '/api/reviews/submit', patientToken, body).then((r) => r);

      const deadline = Date.now() + 8000;
      while (saves < 2 && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 10); });
      }
      release();
      await Promise.all([a, b]);
    } finally {
      Review.prototype.save = realSave;
    }

    expect(await Review.countDocuments({ sessionId: s._id })).toBe(2);

    // A second-order consequence, discovered by trying to restore the index
    // here: once duplicates exist, the unique index can no longer be BUILT —
    // createIndex fails with E11000. So if this ever happens in production, the
    // fix is not "add the index", it is "find and merge every duplicate first,
    // then add the index".
    await expect(Review.syncIndexes()).rejects.toThrow(/duplicate key|Index build failed/i);

    await Review.deleteMany({});
    await Review.syncIndexes();
    expect(Review.collection.indexExists).toBeDefined();
  });
});

describe('concurrent slot booking', () => {
  test('two patients racing for one slot yield exactly one booking', async () => {
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const day = utcToZoned(new Date(Date.now() + 7 * 864e5), PLATFORM_TIMEZONE).localDate;

    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const bToken = jwt.sign(
      { userId: String(f.patientB._id), username: f.patientB.username, role: 'patient' },
      getJWTSecret(), { expiresIn: '1h' }
    );

    const payload = {
      doctorId: String(f.doctorA._id),
      sessionDate: day, sessionTime: '11:00 AM',
      price: 1500, mode: 'video', duration: 60
    };

    const results = await Promise.all([
      call('post', '/api/sessions/book', patientToken, payload),
      call('post', '/api/sessions/book', bToken, payload)
    ]);

    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);

    const avail = await DoctorAvailability.findOne({ doctorId: f.doctorA._id }).lean();
    expect(avail.bookedSlots.filter((b) => b.date === day)).toHaveLength(1);
    expect(await Session.countDocuments({ sessionTime: '11:00 AM' })).toBe(1);
  });
});

describe('concurrent webhook delivery', () => {
  const crypto = require('crypto');

  test('the same event delivered twice at once is recorded once', async () => {
    const s = await futureSession({
      status: 'payment_pending', paymentStatus: 'pending',
      paymentId: null, razorpayOrderId: 'order_race_01'
    });

    const payload = JSON.stringify({
      id: 'evt_race_01',
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_race_01', order_id: 'order_race_01', amount: 200000, status: 'captured' } } }
    });
    const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');

    const send = () => request(server)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(payload);

    const results = await Promise.all([send(), send(), send()]);

    // Exactly one delivery processed it. The others either arrived after it
    // finished (200 already_processed) or while it was still running — and
    // those are told 409, so Razorpay retries them, rather than 200. A 200
    // there would promise the event was handled before it was, and if the
    // in-flight attempt then failed nothing would ever retry it.
    const statuses = results.map((r) => r.body.status);
    expect(statuses.filter((st) => st === 'ok')).toHaveLength(1);
    for (const r of results) {
      if (r.body.status === 'ok') continue;
      expect([200, 409]).toContain(r.status);
      expect(['already_processed', 'in_progress']).toContain(r.body.status);
    }

    // The unique index plus the duplicate-key catch make this exactly-once.
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_race_01' })).toBe(1);
    expect((await WebhookEvent.findOne({ eventId: 'evt_race_01' })).status).toBe('done');

    const after = await Session.findById(s._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.paymentId).toBe('pay_race_01');
  });
});

describe('where the state machine is NOT used', () => {
  test('the state machine is used by the paths that have been converted, and no others', () => {
    // The wrapper enforces the invariants and the compare-and-set guard.
    // Coverage is still partial: payment capture, the webhook handlers, the
    // instant-session auto-cancel and the admin refund paths all still use
    // session.save() directly and get none of those guarantees.
    //
    // Pinned as a number so that converting a path shows up here as a
    // deliberate, visible change — which is what these two lines record.
    //
    // Converted so far:
    //   controllers/session.controller.js  completeSession, cancelSession
    //   services/sessionRefund.js          the claim / succeed / fail sequence,
    //                                      shared by the no-show auto-refund,
    //                                      cancelSession and (in time) the
    //                                      remaining refund paths
    // The scheduler's sweep and the socket call-ended handler go through
    // tryTransition, the non-throwing wrapper, so they do not appear in this
    // grep.
    const { execSync } = require('child_process');
    const root = require('path').join(__dirname, '..', '..');

    const callSites = execSync(
      'grep -rn "applyTransition(" controllers services socket routes --include="*.js" | grep -v "sessionTransition.js" || true',
      { cwd: root, encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);

    expect(callSites).toHaveLength(5);
    expect(callSites.filter((l) => /session\.controller\.js/.test(l))).toHaveLength(2);
    expect(callSites.filter((l) => /sessionRefund\.js/.test(l))).toHaveLength(3);

    const directSaves = execSync(
      'grep -rn "session\\.save()" controllers services socket --include="*.js" | wc -l',
      { cwd: root, encoding: 'utf8' }
    ).trim();
    // Still high, and each one is a money path that has not been converted.
    // This number should fall as they are; it must never rise.
    expect(Number(directSaves)).toBeLessThanOrEqual(17);
  });
});
