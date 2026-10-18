/**
 * What a session finally was, decided by the rules (docs/SESSION_RULES.md),
 * against a real database: the end-of-session sweep, the waiting patient's
 * "Leave & full refund", the doctor's pay for a late cancellation, and what
 * each screen is told.
 *
 * The money properties are the ones that matter: a refund owed is made once,
 * a refund not owed is never made, the doctor's counters move once per
 * outcome, and what the doctor is shown as earned is what they will be paid.
 */

require('../support/env');

const mongoose = require('mongoose');
const request = require('supertest');
const { startDb, stopDb, mountRoutes, tokenFor, makeUser, makeSession } = require('../helpers/harness');

jest.setTimeout(60000);

const mockRefund = jest.fn();
jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
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

let Session, DoctorProfile, attendance, outcomes, earnings, app;
let patient, doctor, stranger;

const emailsTo = (name) => (mockEmails[name] ? mockEmails[name].mock.calls : []);
const counters = async () => DoctorProfile.findOne({ userId: doctor._id }).select('lateCount noShowCount cancellationCount').lean();
const post = (path, who, body) => {
  let r = request(app).post(path);
  if (who) r = r.set('Authorization', `Bearer ${tokenFor(who)}`);
  return body === undefined ? r : r.send(body);
};
const get = (path, who) => request(app).get(path).set('Authorization', `Bearer ${tokenFor(who)}`);

/**
 * A 20-minute paid session that started `startedMinutesAgo`, with stays given
 * as [role, fromMinute, toMinute|null] relative to its start.
 */
async function sessionWith(stays = [], { startedMinutesAgo = 40, ...overrides } = {}) {
  const s = await makeSession({
    patient, doctor, hoursFromNow: -startedMinutesAgo / 60, duration: 20, price: 1000,
    paymentId: `pay_outcome_${new mongoose.Types.ObjectId()}`, doctorEarnings: 800, platformFee: 200,
    ...overrides
  });
  const start = new Date(s.startsAt).getTime();
  for (const [role, from, to] of stays) {
    // eslint-disable-next-line no-await-in-loop
    await attendance.recordJoin(s._id, role, { at: new Date(start + from * MIN), source: 'socket' });
    // eslint-disable-next-line no-await-in-loop
    if (to !== null && to !== undefined) await attendance.recordLeave(s._id, role, { at: new Date(start + to * MIN), source: 'socket' });
  }
  return Session.findById(s._id);
}

beforeAll(async () => {
  await startDb('session-outcomes');
  Session = require('../../models/session');
  DoctorProfile = require('../../models/doctorProfile');
  attendance = require('../../services/attendance');
  outcomes = require('../../services/sessionOutcomes');
  earnings = require('../../services/earnings');
  patient = await makeUser('patient');
  doctor = await makeUser('doctor');
  stranger = await makeUser('patient');
  await DoctorProfile.create({
    userId: doctor._id, specialization: ['Psychologist'], experience: 5, qualification: ['MA'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Psychologist',
    pricing: { min: 800, max: 2000, session20: 1000 }
  });
  app = mountRoutes({ '/api/sessions': '../../routes/sessions' });
});

afterAll(async () => { await stopDb(); });

beforeEach(async () => {
  await Session.deleteMany({});
  await DoctorProfile.updateOne({ userId: doctor._id }, { $set: { lateCount: 0, noShowCount: 0, cancellationCount: 0 } });
  mockRefund.mockReset();
  mockRefund.mockResolvedValue({ id: 'rfnd_outcome', status: 'processed' });
  for (const fn of Object.values(mockEmails)) fn.mockClear();
});

describe('the end-of-session sweep', () => {
  test('S1 both on time: completed, nobody refunded, the doctor gets their summary', async () => {
    const s = await sessionWith([['patient', -2, 20], ['doctor', -1, 20]]);
    expect(await outcomes.runOutcomeSweep()).toBe(1);
    const after = await Session.findById(s._id).lean();
    expect(after).toMatchObject({ status: 'completed', paymentStatus: 'paid', callStatus: 'completed', graceResult: 'both' });
    expect(after.outcome).toMatchObject({ code: 'completed', by: 'system' });
    // Together from T-1 (both early, E8) to the end.
    expect(after.actualDuration).toBe(21);
    expect(mockRefund).not.toHaveBeenCalled();
    expect(emailsTo('sendDoctorSessionSummaryEmail')).toHaveLength(1);
    expect(await counters()).toMatchObject({ lateCount: 0, noShowCount: 0 });
  });

  test('S3 the patient never came: a no-show the doctor is paid for, nobody refunded', async () => {
    const s = await sessionWith([['doctor', 0, 15]]);
    await outcomes.runOutcomeSweep();
    const after = await Session.findById(s._id).lean();
    expect(after.status).toBe('no-show');
    expect(after.outcome.code).toBe('patient_no_show');
    expect(after.paymentStatus).toBe('paid');
    expect(mockRefund).not.toHaveBeenCalled();
    expect(await Session.countDocuments({ _id: s._id, ...earnings.payableSessionMatch({ doctorId: doctor._id }) })).toBe(1);
    const subjects = emailsTo('sendSessionOutcomeEmail').map(([to, d]) => [to, d.subject]);
    expect(subjects).toEqual(expect.arrayContaining([
      [patient.email, 'We missed you today'],
      [doctor.email, "Your patient didn't join — you'll be paid"]
    ]));
  });

  test('S6 the doctor came 12 minutes late and the patient waited: completed, counted late', async () => {
    const s = await sessionWith([['patient', 0, null], ['doctor', 12, null]], { startedMinutesAgo: 50 });
    // The end moved to the doctor's join + 20 minutes: T+32.
    expect((await Session.findById(s._id).lean()).effectiveEndsAt).toEqual(new Date(new Date(s.startsAt).getTime() + 32 * MIN));
    await outcomes.runOutcomeSweep();
    const after = await Session.findById(s._id).lean();
    expect(after.status).toBe('completed');
    expect(after.attendance.every((a) => a.leftAt)).toBe(true);
    expect(await counters()).toMatchObject({ lateCount: 1, noShowCount: 0 });
  });

  test('a late doctor\'s session is not decided before its later end has passed', async () => {
    // Started 40 minutes ago; the doctor came at T+25, so it runs to T+45.
    const s = await sessionWith([['patient', 0, null], ['doctor', 25, null]]);
    expect(await outcomes.runOutcomeSweep()).toBe(0);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('S7 the doctor never came: refunded in full, once, and counted as a no-show', async () => {
    const s = await sessionWith([['patient', 0, 20]]);
    await outcomes.runOutcomeSweep();
    await outcomes.runOutcomeSweep();
    const after = await Session.findById(s._id).lean();
    expect(after.status).toBe('no-show');
    expect(after.outcome.code).toBe('doctor_no_show');
    expect(after.paymentStatus).toBe('refunded');
    expect(after.refundAmount).toBe(1000);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await counters()).toMatchObject({ noShowCount: 1, lateCount: 0 });
    expect(await Session.countDocuments({ _id: s._id, ...earnings.payableSessionMatch() })).toBe(0);
    expect(emailsTo('sendSessionOutcomeEmail').find(([to]) => to === patient.email)[1].subject)
      .toBe("Your session didn't happen — full refund on its way");
  });

  test('S8 nobody came: refunded in full, counted against the doctor', async () => {
    const s = await sessionWith([]);
    await outcomes.runOutcomeSweep();
    const after = await Session.findById(s._id).lean();
    expect(after.outcome.code).toBe('nobody_came');
    expect(after.paymentStatus).toBe('refunded');
    expect(await counters()).toMatchObject({ noShowCount: 1 });
  });

  test('E2 the doctor waited the grace out and left before the patient came: the patient missed it', async () => {
    const s = await sessionWith([['doctor', 1, 11], ['patient', 13, 20]]);
    await outcomes.runOutcomeSweep();
    const after = await Session.findById(s._id).lean();
    expect(after.outcome.code).toBe('patient_no_show');
    expect(after.graceResult).toBe('patient_absent');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('a free session is decided but no gateway is ever asked', async () => {
    const s = await sessionWith([['patient', 0, 20]], { paymentStatus: 'not_required', paymentId: null, price: 0 });
    await outcomes.runOutcomeSweep();
    expect((await Session.findById(s._id)).status).toBe('no-show');
    expect(mockRefund).not.toHaveBeenCalled();
  });
});

describe('"Leave & full refund"', () => {
  const claim = (s, who = patient) => post(`/api/sessions/${s._id}/claim-absent-refund`, who);

  test('before the grace is over it says when it will be available, and changes nothing', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 4 });
    const res = await claim(s);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/You can leave with a full refund at .+ if your therapist still hasn't joined/);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('is refused while the therapist is in the call', async () => {
    const s = await sessionWith([['patient', 0, null], ['doctor', 11, null]], { startedMinutesAgo: 12 });
    const res = await claim(s);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Your therapist is here now.');
  });

  test('is the patient\'s alone', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 11 });
    expect((await claim(s, doctor)).status).toBe(403);
    expect((await claim(s, stranger)).status).toBe(403);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('a free session has nothing to refund', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 11, paymentStatus: 'not_required', paymentId: null, price: 0 });
    const res = await claim(s);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no charge/);
  });

  test('after the grace, with the therapist absent: cancelled, refunded once, counted late, both told', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 11 });
    const res = await claim(s);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, refundAmount: 1000 });
    expect(res.body.message).toMatch(/full refund of ₹1000 is on its way/);

    const after = await Session.findById(s._id).lean();
    expect(after).toMatchObject({ status: 'cancelled', cancelledBy: 'patient', paymentStatus: 'refunded', refundAmount: 1000 });
    expect(after.outcome).toMatchObject({ code: 'doctor_absent_refund', by: 'patient' });
    expect(after.attendance.every((a) => a.leftAt)).toBe(true);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await counters()).toMatchObject({ lateCount: 1 });
    const recipients = emailsTo('sendSessionOutcomeEmail').map(([to]) => to);
    expect(recipients).toEqual(expect.arrayContaining([patient.email, doctor.email]));

    // A second press: the same answer, no second refund, no second count.
    const again = await claim(s);
    expect(again.status).toBe(200);
    expect(again.body.message).toBe('Your refund is already on its way.');
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await counters()).toMatchObject({ lateCount: 1 });
  });

  test('a double click refunds once', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 11 });
    const results = await Promise.all([claim(s), claim(s), claim(s)]);
    for (const r of results) expect(r.status).toBe(200);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await counters()).toMatchObject({ lateCount: 1 });
  });

  test('E4 the therapist came and left: available after 10 minutes on their own', async () => {
    const early = await sessionWith([['patient', 0, null], ['doctor', 1, 8]], { startedMinutesAgo: 15 });
    expect((await claim(early)).status).toBe(409); // alone 7 minutes
    const later = await sessionWith([['patient', 0, null], ['doctor', 1, 4]], { startedMinutesAgo: 15 });
    expect((await claim(later)).status).toBe(200); // alone 11 minutes
  });
});

describe('what each screen is told', () => {
  test('GET /:id carries the rules as the caller sees them', async () => {
    const s = await sessionWith([['patient', 0, null]], { startedMinutesAgo: 5 });
    const asPatient = await get(`/api/sessions/${s._id}`, patient);
    expect(asPatient.status).toBe(200);
    const r = asPatient.body.rules;
    expect(new Date(r.absentRefundAt)).toEqual(new Date(new Date(s.startsAt).getTime() + 10 * MIN));
    expect(new Date(r.graceEndsAt)).toEqual(new Date(new Date(s.startsAt).getTime() + 10 * MIN));
    expect(r.present).toEqual({ patient: true, doctor: false });
    expect(r.serverNow).toBeDefined();

    const asDoctor = await get(`/api/sessions/${s._id}`, doctor);
    expect(asDoctor.body.rules.absentRefundAt).toBeNull();
  });

  test('the session lists carry it too, and call history carries the outcome', async () => {
    const s = await sessionWith([['patient', 0, 20]]);
    await outcomes.runOutcomeSweep();
    const list = await get('/api/sessions/my-sessions', patient);
    expect(list.body.find((x) => x._id === String(s._id)).rules).toBeDefined();

    const history = await get('/api/sessions/call-history', patient);
    const row = history.body.find((x) => x._id === String(s._id));
    expect(row).toMatchObject({ outcome: 'doctor_no_show', paymentStatus: 'refunded', refundAmount: 1000, mode: 'Video Calling' });
  });
});

describe('cancelling', () => {
  test('a patient cancelling within 4 hours: no refund, and the doctor is paid their share', async () => {
    const s = await makeSession({ patient, doctor, hoursFromNow: 2, price: 1000, doctorEarnings: 800, platformFee: 200 });
    const res = await post(`/api/sessions/${s._id}/cancel`, patient);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refundAmount: 0, lateCancellation: true });

    const after = await Session.findById(s._id).lean();
    expect(after).toMatchObject({ status: 'cancelled', paymentStatus: 'paid', lateCancellation: true });
    expect(after.outcome.code).toBe('late_cancellation');
    expect(mockRefund).not.toHaveBeenCalled();
    expect(await Session.countDocuments({ _id: s._id, ...earnings.payableSessionMatch({ doctorId: doctor._id }) })).toBe(1);

    const stats = await get('/api/sessions/stats', doctor);
    expect(stats.body).toMatchObject({ totalSessions: 1, totalDoctorEarnings: 800 });

    const doctorMail = emailsTo('sendCancellationEmail').find(([to]) => to === doctor.email);
    expect(doctorMail[1].message).toMatch(/you'll still be paid your share \(₹800\)/);
  });

  test('a patient cancelling earlier: refunded, and not payable', async () => {
    const s = await makeSession({ patient, doctor, hoursFromNow: 10, price: 1000 });
    await post(`/api/sessions/${s._id}/cancel`, patient);
    const after = await Session.findById(s._id).lean();
    expect(after.outcome.code).toBe('cancelled_by_patient');
    expect(after.lateCancellation).toBe(false);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await Session.countDocuments({ _id: s._id, ...earnings.payableSessionMatch() })).toBe(0);
  });

  test('a doctor cancelling: refunded in full and counted', async () => {
    const s = await makeSession({ patient, doctor, hoursFromNow: 2, price: 1000 });
    await post(`/api/sessions/${s._id}/cancel`, doctor);
    const after = await Session.findById(s._id).lean();
    expect(after.outcome.code).toBe('cancelled_by_doctor');
    expect(after.lateCancellation).toBe(false);
    expect(await counters()).toMatchObject({ cancellationCount: 1 });
  });
});
