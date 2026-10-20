/**
 * Phase 5 (patient side): what the session lists tell the patient about a
 * session they already rated, and what a cancellation says happened to the
 * money.
 */
require('../support/env');

const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn(), fetchPayments: jest.fn().mockResolvedValue({ items: [] }) },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: () => jest.fn().mockResolvedValue({ id: 'sink' })
}));

const request = require('supertest');
const { startDb, stopDb, clearDb, mountRoutes, tokenFor, makeUser, makeSession } = require('../helpers/harness');

let app, Review;

beforeAll(async () => {
  process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_x';
  process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'secret_x';
  await startDb('phase5.sessions');
  Review = require('../../models/review');
  app = mountRoutes({ '/api/sessions': '../../routes/sessions', '/api/reviews': '../../routes/reviews' });
});
afterAll(async () => { await stopDb(); });
afterEach(async () => { mockRefund.mockReset(); await clearDb(); });

const as = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

async function people() {
  return { patient: await makeUser('patient'), doctor: await makeUser('doctor') };
}

describe('a session the patient already rated', () => {
  test('my-sessions marks each completed session rated or not', async () => {
    const { patient, doctor } = await people();
    const rated = await makeSession({ patient, doctor, hoursFromNow: -5, status: 'completed' });
    const unrated = await makeSession({ patient, doctor, hoursFromNow: -3, status: 'completed' });
    const upcoming = await makeSession({ patient, doctor, hoursFromNow: 30 });
    const sent = await request(app).post('/api/reviews/submit').set(as(patient)).send({ sessionId: String(rated._id), rating: 5, reviewType: 'doctor' });
    expect(sent.status).toBe(201);

    const res = await request(app).get('/api/sessions/my-sessions').set(as(patient));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((s) => [String(s._id), s]));
    expect(byId[rated._id].rated).toBe(true);
    expect(byId[unrated._id].rated).toBe(false);
    expect(byId[upcoming._id].rated).toBeUndefined();
  });

  test('a platform review alone does not count as rating the therapist', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: -5, status: 'completed' });
    await request(app).post('/api/reviews/submit').set(as(patient)).send({ sessionId: String(s._id), rating: 4, reviewType: 'platform' });
    const res = await request(app).get('/api/sessions/my-sessions').set(as(patient));
    expect(res.body.find((x) => String(x._id) === String(s._id)).rated).toBe(false);
  });

  test('the doctor\'s list carries no rated flag', async () => {
    const { patient, doctor } = await people();
    await makeSession({ patient, doctor, hoursFromNow: -5, status: 'completed' });
    const res = await request(app).get('/api/sessions/my-sessions').set(as(doctor));
    expect(res.body[0].rated).toBeUndefined();
  });

  test('pending-feedback stops offering a session once it is rated', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: -5, status: 'completed' });
    const before = await request(app).get('/api/sessions/pending-feedback').set(as(patient));
    expect(String(before.body.session._id)).toBe(String(s._id));
    await request(app).post('/api/reviews/submit').set(as(patient)).send({ sessionId: String(s._id), rating: 3 });
    const after = await request(app).get('/api/sessions/pending-feedback').set(as(patient));
    expect(after.body.session).toBeNull();
  });

  test('a second rating of the same session is refused, and only one is stored', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: -5, status: 'completed' });
    await request(app).post('/api/reviews/submit').set(as(patient)).send({ sessionId: String(s._id), rating: 5 });
    const again = await request(app).post('/api/reviews/submit').set(as(patient)).send({ sessionId: String(s._id), rating: 1 });
    expect(again.status).toBe(400);
    expect(await Review.countDocuments({ sessionId: s._id })).toBe(1);
  });
});

describe('what a cancellation says about the money', () => {
  test('more than 4 hours out: the refund is issued', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: 30 });
    mockRefund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' });
    const res = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refundAmount: 1000, refundState: 'issued', lateCancellation: false });
    // A repeat says the same thing.
    const again = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(again.body).toMatchObject({ refundState: 'issued' });
  });

  test('within 4 hours: no refund', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: 2 });
    const res = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(res.body).toMatchObject({ refundAmount: 0, refundState: 'none', lateCancellation: true });
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a free session: nothing was charged', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: 30, price: 0, paymentStatus: 'not_required', paymentId: null });
    const res = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(res.body.refundState).toBe('unpaid');
  });

  test('the gateway refuses: the refund is delayed, not lost', async () => {
    const { patient, doctor } = await people();
    const s = await makeSession({ patient, doctor, hoursFromNow: 30 });
    mockRefund.mockRejectedValue(Object.assign(new Error('declined'), { error: { description: 'declined' } }));
    const res = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(res.body.refundState).toBe('failed');
    const again = await request(app).post(`/api/sessions/${s._id}/cancel`).set(as(patient)).send({});
    expect(again.body.refundState).toBe('failed');
  });
});
