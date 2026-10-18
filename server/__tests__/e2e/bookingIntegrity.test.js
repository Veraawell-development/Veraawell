/**
 * Booking can only promise what can actually happen (sessions plan, Phase 2).
 *
 *   - a doctor counts as online only while actually connected, and goes
 *     offline a grace period after their last connection drops;
 *   - one doctor, one session at a time: no instant ring on top of a booked
 *     session, no slot sold into a running instant call;
 *   - no slot that has passed or starts within 15 minutes;
 *   - closing the payment window frees the slot at once (unless the payment
 *     in fact went through);
 *   - one bookability rule, and the therapist's page says when it fails;
 *   - a doctor can cancel, with a reason the patient is told;
 *   - chat opens only with a paid (or free) booking.
 */

require('../support/env');

const mongoose = require('mongoose');
const request = require('supertest');
const { startDb, stopDb, mountRoutes, tokenFor } = require('../helpers/harness');

jest.setTimeout(60000);

const mockOrdersCreate = jest.fn();
const mockFetchPayments = jest.fn();
const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: mockOrdersCreate, fetchPayments: mockFetchPayments },
  payments: { refund: mockRefund, fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
const mockEmails = {};
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => {
    if (!mockEmails[name]) mockEmails[name] = jest.fn().mockResolvedValue({ id: 'sink' });
    return mockEmails[name];
  }
}));

const MIN = 60 * 1000;

let Session, User, DoctorProfile, DoctorAvailability, Conversation, presence, seed, zoned, app;
let patient, patient2, doctor, n = 0;

const as = (who) => ({ Authorization: `Bearer ${tokenFor(who)}` });
const post = (path, who, body = {}) => request(app).post(path).set(as(who)).send(body);
const get = (path, who) => (who ? request(app).get(path).set(as(who)) : request(app).get(path));

/** IST date and 12-hour slot string of an instant. */
function istSlot(at) {
  const { localDate, localTime } = zoned.utcToZoned(at, 'Asia/Kolkata');
  return { date: localDate, time: zoned.to12hSlot(localTime) };
}

async function freshDoctor(profileOverrides = {}) {
  n += 1;
  const d = await seed.makeUser('doctor', `p2.doctor.${n}.${Date.now()}@veraawell.test`);
  await seed.makeDoctorProfile(d._id, profileOverrides);
  return d;
}

beforeAll(async () => {
  await startDb('booking-integrity');
  Session = require('../../models/session');
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');
  DoctorAvailability = require('../../models/doctorAvailability');
  Conversation = require('../../models/conversation');
  presence = require('../../services/presence');
  seed = require('../support/seed');
  zoned = require('../../utils/zonedTime');
  patient = await seed.makeUser('patient', `p2.patient.${Date.now()}@veraawell.test`);
  patient2 = await seed.makeUser('patient', `p2.patient2.${Date.now()}@veraawell.test`);
  app = mountRoutes({ '/api/sessions': '../../routes/sessions', '/api/doctor-status': '../../routes/doctor-status', '/api/chat': '../../routes/chat' });
});

afterAll(async () => { await stopDb(); });

beforeEach(async () => {
  presence._reset();
  mockOrdersCreate.mockReset();
  mockOrdersCreate.mockImplementation(async () => ({ id: `order_${new mongoose.Types.ObjectId()}` }));
  mockFetchPayments.mockReset();
  mockFetchPayments.mockResolvedValue({ items: [] });
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'rfnd_p2', status: 'processed' });
  for (const fn of Object.values(mockEmails)) fn.mockClear();
  doctor = await freshDoctor();
});

describe('presence: online means connected', () => {
  const isOnline = async (id) => (await User.findById(id).lean()).isOnline;

  test('the last connection gone, the doctor goes offline after the grace', async () => {
    await User.updateOne({ _id: doctor._id }, { $set: { isOnline: true } });
    presence.connected(doctor._id, 's1');
    presence.disconnected(doctor._id, 's1', { graceMs: 60 });
    expect(await isOnline(doctor._id)).toBe(true); // a refresh would be back by now
    await new Promise((r) => { setTimeout(r, 250); });
    expect(await isOnline(doctor._id)).toBe(false);
  });

  test('coming back within the grace keeps them online', async () => {
    await User.updateOne({ _id: doctor._id }, { $set: { isOnline: true } });
    presence.connected(doctor._id, 's1');
    presence.disconnected(doctor._id, 's1', { graceMs: 80 });
    presence.connected(doctor._id, 's2');
    await new Promise((r) => { setTimeout(r, 250); });
    expect(await isOnline(doctor._id)).toBe(true);
  });

  test('a second tab keeps them online when one closes', async () => {
    await User.updateOne({ _id: doctor._id }, { $set: { isOnline: true } });
    presence.connected(doctor._id, 's1');
    presence.connected(doctor._id, 's2');
    presence.disconnected(doctor._id, 's1', { graceMs: 40 });
    await new Promise((r) => { setTimeout(r, 150); });
    expect(presence.isConnected(doctor._id)).toBe(true);
    expect(await isOnline(doctor._id)).toBe(true);
  });

  test('after a restart, only doctors who reconnected stay online', async () => {
    const back = await freshDoctor();
    await User.updateMany({ _id: { $in: [doctor._id, back._id] } }, { $set: { isOnline: true } });
    presence.connected(back._id, 's-back');
    const switched = await presence.settleAfterBoot();
    expect(switched).toBeGreaterThanOrEqual(1);
    expect(await isOnline(doctor._id)).toBe(false);
    expect(await isOnline(back._id)).toBe(true);
  });
});

describe('instant requests', () => {
  const ring = (d = doctor, who = patient) => post('/api/sessions/book-immediate', who, { doctorId: String(d._id), mode: 'video', duration: 20 });
  const goOnline = async (d = doctor) => {
    await User.updateOne({ _id: d._id }, { $set: { isOnline: true } });
    presence.connected(d._id, `s-${d._id}`);
  };

  test('a doctor whose switch is on but who is not connected is refused as offline', async () => {
    await User.updateOne({ _id: doctor._id }, { $set: { isOnline: true } });
    const res = await ring();
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('offline');
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  test('a doctor in a session is refused as busy, with the way out', async () => {
    await goOnline();
    await Session.create({
      patientId: patient2._id, doctorId: doctor._id, startsAt: new Date(Date.now() - 5 * MIN),
      duration: 40, price: 1500, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_busy_1'
    });
    const res = await ring();
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('busy');
    expect(res.body.message).toMatch(/book a time instead/);
  });

  test('a booked session starting within the instant session (plus a buffer) also makes them busy', async () => {
    await goOnline();
    await Session.create({
      patientId: patient2._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 22 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_busy_2'
    });
    expect((await ring()).body.reason).toBe('busy');
  });

  test('free, connected and online: it goes through to payment', async () => {
    await goOnline();
    const res = await ring();
    expect(res.status).toBeLessThan(300);
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
  });

  test('the online list shows connected doctors and flags the busy one', async () => {
    const other = await freshDoctor();
    await goOnline();
    await goOnline(other);
    await Session.create({
      patientId: patient2._id, doctorId: other._id, startsAt: new Date(Date.now() - 2 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_busy_3'
    });
    const list = (await get('/api/doctor-status/online-doctors')).body.doctors;
    const byId = Object.fromEntries(list.map((d) => [String(d._id), d]));
    expect(byId[String(doctor._id)].busy).toBe(false);
    expect(byId[String(other._id)].busy).toBe(true);
  });
});

describe('time slots', () => {
  test('a slot starting within 15 minutes is neither offered nor bookable', async () => {
    const soon = istSlot(new Date(Date.now() + 10 * MIN));
    await DoctorAvailability.create({ doctorId: doctor._id, availabilityType: 'same_slots', defaultSlots: [soon.time], activeDates: [soon.date] });
    const slots = await get(`/api/sessions/doctors/${doctor._id}/slots/${soon.date}`);
    expect(slots.body.availableSlots).not.toContain(soon.time);

    const res = await post('/api/sessions/book', patient, { doctorId: String(doctor._id), sessionDate: soon.date, sessionTime: soon.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too soon/);
  });

  test('a slot a running instant call overlaps is neither offered nor sold', async () => {
    // A 55-minute instant call that started 5 minutes ago runs into the slot
    // 30 minutes from now.
    const slotAt = new Date(Date.now() + 30 * MIN);
    const slot = istSlot(slotAt);
    await DoctorAvailability.create({ doctorId: doctor._id, availabilityType: 'same_slots', defaultSlots: [slot.time], activeDates: [slot.date] });
    await Session.create({
      patientId: patient2._id, doctorId: doctor._id, sessionType: 'immediate', startsAt: new Date(Date.now() - 5 * MIN),
      duration: 55, price: 2000, status: 'active', paymentStatus: 'paid', paymentId: 'pay_instant_long', acceptanceStatus: 'accepted'
    });
    expect((await get(`/api/sessions/doctors/${doctor._id}/slots/${slot.date}`)).body.availableSlots).not.toContain(slot.time);
    const res = await post('/api/sessions/book', patient, { doctorId: String(doctor._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no longer available/);
  });

  test('a later free slot is offered and books', async () => {
    const slot = istSlot(new Date(Date.now() + 3 * 24 * 60 * MIN));
    await DoctorAvailability.create({ doctorId: doctor._id, availabilityType: 'same_slots', defaultSlots: [slot.time], activeDates: [slot.date] });
    expect((await get(`/api/sessions/doctors/${doctor._id}/slots/${slot.date}`)).body.availableSlots).toContain(slot.time);
    const res = await post('/api/sessions/book', patient, { doctorId: String(doctor._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(201);
  });
});

describe('closing the payment window', () => {
  async function checkout(who = patient) {
    const slot = istSlot(new Date(Date.now() + 2 * 24 * 60 * MIN));
    await DoctorAvailability.create({ doctorId: doctor._id, availabilityType: 'same_slots', defaultSlots: [slot.time], activeDates: [slot.date] });
    const res = await post('/api/sessions/book', who, { doctorId: String(doctor._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(201);
    return { session: res.body.session, slot };
  }

  test('frees the slot at once, so someone else can book it', async () => {
    const { session, slot } = await checkout();
    const res = await post(`/api/sessions/${session._id}/abandon-checkout`, patient);
    expect(res.body).toMatchObject({ success: true, outcome: 'expired' });
    expect((await Session.findById(session._id)).status).toBe('cancelled');
    expect((await get(`/api/sessions/doctors/${doctor._id}/slots/${slot.date}`)).body.availableSlots).toContain(slot.time);
    const again = await post('/api/sessions/book', patient2, { doctorId: String(doctor._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(again.status).toBe(201);
  });

  test('a payment that did go through books the session instead', async () => {
    const { session } = await checkout();
    mockFetchPayments.mockResolvedValue({ items: [{ id: 'pay_captured_abandon', status: 'captured', amount: 80000 }] });
    const res = await post(`/api/sessions/${session._id}/abandon-checkout`, patient);
    expect(res.body.outcome).toMatch(/^captured/);
    const after = await Session.findById(session._id);
    expect(after.paymentStatus).toBe('paid');
    expect(after.status).toBe('scheduled');
  });

  test('only the patient of the checkout, and a repeat is harmless', async () => {
    const { session } = await checkout();
    expect((await post(`/api/sessions/${session._id}/abandon-checkout`, patient2)).status).toBe(403);
    expect((await post(`/api/sessions/${session._id}/abandon-checkout`, doctor)).status).toBe(403);
    await post(`/api/sessions/${session._id}/abandon-checkout`, patient);
    const repeat = await post(`/api/sessions/${session._id}/abandon-checkout`, patient);
    expect(repeat.body).toMatchObject({ success: true, outcome: 'not-pending', status: 'cancelled' });
  });
});

describe('one bookability rule', () => {
  test("the therapist's page says whether a slot or an instant session can be booked — and nothing more", async () => {
    const res = await get(`/api/sessions/doctors/${doctor._id}`);
    expect(res.body).toMatchObject({ bookable: true, instantBookable: true });
    expect(res.body).not.toHaveProperty('payoutApproved');
    expect(res.body).not.toHaveProperty('bookableUntil');

    const ranOut = await freshDoctor({ bookableUntil: new Date(Date.now() - 864e5) });
    expect((await get(`/api/sessions/doctors/${ranOut._id}`)).body).toMatchObject({ bookable: false, instantBookable: true });

    const unpaid = await freshDoctor({ payoutApproved: false });
    expect((await get(`/api/sessions/doctors/${unpaid._id}`)).body).toMatchObject({ bookable: false, instantBookable: false });
  });

  test('a therapist without an approved way to be paid is refused up front, in plain words', async () => {
    const unpaid = await freshDoctor({ payoutApproved: false });
    const slot = istSlot(new Date(Date.now() + 2 * 24 * 60 * MIN));
    await DoctorAvailability.create({ doctorId: unpaid._id, availabilityType: 'same_slots', defaultSlots: [slot.time], activeDates: [slot.date] });
    const res = await post('/api/sessions/book', patient, { doctorId: String(unpaid._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/isn't taking bookings/);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });
});

describe('a doctor cancelling', () => {
  test('the patient is refunded in full and told the reason', async () => {
    const s = await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 26 * 60 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_doc_cancel'
    });
    const res = await post(`/api/sessions/${s._id}/cancel`, doctor, { reason: '  A family emergency — sorry for the short notice.  ' });
    expect(res.status).toBe(200);
    const after = await Session.findById(s._id).lean();
    expect(after).toMatchObject({ status: 'cancelled', cancelledBy: 'doctor', cancellationReason: 'A family emergency — sorry for the short notice.' });
    expect(after.outcome.code).toBe('cancelled_by_doctor');
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund.mock.calls[0][1].amount).toBe(800 * 100);
    const toPatient = mockEmails.sendCancellationEmail.mock.calls.find(([to]) => to === patient.email);
    expect(toPatient[1].message).toMatch(/A family emergency/);
  });

  test('a reason is cut at 300 characters, and only a doctor can give one', async () => {
    const s = await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 26 * 60 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_doc_cancel_2'
    });
    await post(`/api/sessions/${s._id}/cancel`, doctor, { reason: 'x'.repeat(500) });
    expect((await Session.findById(s._id).lean()).cancellationReason).toHaveLength(300);

    const p = await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 26 * 60 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_pat_cancel'
    });
    await post(`/api/sessions/${p._id}/cancel`, patient, { reason: 'not stored' });
    expect((await Session.findById(p._id).lean()).cancellationReason).toBeNull();
  });
});

describe('chat opens with a paid booking', () => {
  test('an unpaid checkout creates no conversation', async () => {
    const slot = istSlot(new Date(Date.now() + 2 * 24 * 60 * MIN));
    await DoctorAvailability.create({ doctorId: doctor._id, availabilityType: 'same_slots', defaultSlots: [slot.time], activeDates: [slot.date] });
    const res = await post('/api/sessions/book', patient, { doctorId: String(doctor._id), sessionDate: slot.date, sessionTime: slot.time, mode: 'video', duration: 20 });
    expect(res.status).toBe(201);
    expect(await Conversation.countDocuments({ 'participants.userId': { $all: [patient._id, doctor._id] } })).toBe(0);
  });

  test('confirming the payment opens it', async () => {
    const s = await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 2 * 24 * 60 * MIN),
      duration: 20, price: 800, status: 'payment_pending', paymentStatus: 'pending', razorpayOrderId: 'order_chat_1'
    });
    const { confirmPayment } = require('../../services/sessionPayment');
    const { ACTOR } = require('../../services/sessionState');
    const result = await confirmPayment({ session: s._id, paymentId: 'pay_chat_1', actor: ACTOR.SYSTEM });
    expect(result.outcome).toBe('confirmed');
    expect(await Conversation.countDocuments({ 'participants.userId': { $all: [patient._id, doctor._id] } })).toBe(1);
  });

  test('a conversation left over from an unpaid checkout cannot be written in', async () => {
    const leftover = await Conversation.findOrCreateConversation(patient._id, doctor._id, null);
    await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 2 * 24 * 60 * MIN),
      duration: 20, price: 800, status: 'cancelled', paymentStatus: 'failed'
    });
    const { sendMessageAndNotify } = require('../../services/chat.service');
    await expect(sendMessageAndNotify(null, null, { conversationId: leftover._id, senderId: String(patient._id), text: 'hello' }))
      .rejects.toMatchObject({ code: 'CHAT_NOT_OPEN' });

    await Session.create({
      patientId: patient._id, doctorId: doctor._id, startsAt: new Date(Date.now() + 3 * 24 * 60 * MIN),
      duration: 20, price: 800, status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_chat_2'
    });
    await sendMessageAndNotify(null, null, { conversationId: leftover._id, senderId: String(patient._id), text: 'hello' });
    expect(await require('../../models/message').countDocuments({ conversationId: leftover._id, text: 'hello' })).toBe(1);
  });

  test('over HTTP, sending into such a conversation is a 403 that says why', async () => {
    const leftover = await Conversation.findOrCreateConversation(patient2._id, doctor._id, null);
    const res = await post('/api/chat/message', patient2, { conversationId: String(leftover._id), text: 'hi' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Chat opens once a session is booked and paid/);
  });
});

describe('the price a booking is charged', () => {
  const { calculateSessionPrice, resolvePrice } = require('../../services/session.service');

  test('no profile, or a profile without prices, has no price', async () => {
    expect(await calculateSessionPrice(new mongoose.Types.ObjectId(), 'video', 20)).toBeNull();
    await DoctorProfile.updateOne({ userId: doctor._id }, { $unset: { pricing: 1 } });
    expect(await calculateSessionPrice(doctor._id, 'video', 20)).toBeNull();
  });

  test('a length that is not offered, or no positive price anywhere in the chain, has no price', () => {
    expect(resolvePrice({ min: 800, session20: 800 }, 'video', 30)).toBeNull();
    expect(resolvePrice({ min: 0, session20: 0 }, 'video', 20)).toBeNull();
    expect(resolvePrice({ max: Infinity }, 'video', 55)).toBeNull();
    expect(resolvePrice({ min: 800, audio: { session20: 600 } }, 'voice', 20)).toBe(600);
    expect(resolvePrice({ min: 800 }, 'voice', 20)).toBe(800);
  });
});

describe('the cleanup for conversations opened before payment', () => {
  test('dry run lists; --apply deletes only the empty ones', async () => {
    const { conversationsWithoutPayment } = require('../../migrations/conversationsWithoutPayment');
    const other = await freshDoctor();
    const empty = await Conversation.findOrCreateConversation(patient2._id, other._id, null);
    const third = await freshDoctor();
    const written = await Conversation.findOrCreateConversation(patient2._id, third._id, null);
    await require('../../models/message').create({ conversationId: written._id, senderId: patient2._id, receiverId: third._id, text: 'hi' });

    const db = mongoose.connection.db;
    const dry = await conversationsWithoutPayment(db);
    expect(dry.empty).toContain(String(empty._id));
    expect(dry.withMessages).toContain(String(written._id));
    expect(dry.deleted).toBe(0);
    expect(await Conversation.countDocuments({ _id: empty._id })).toBe(1);

    const applied = await conversationsWithoutPayment(db, { apply: true });
    expect(applied.deleted).toBeGreaterThanOrEqual(1);
    expect(await Conversation.countDocuments({ _id: empty._id })).toBe(0);
    expect(await Conversation.countDocuments({ _id: written._id })).toBe(1);
  });
});
