/**
 * Phase 6 — the therapist side, end to end over HTTP.
 *
 *  - "Can patients find you?": GET /api/profile/visibility names each missing
 *    condition of the directory rule (services/bookability.js), and agrees
 *    with it.
 *  - The online switch takes the state asked for, and says whether being
 *    online lets patients ring the therapist at all.
 *  - Weekly calendars: times per weekday repeat on their own; a day can be
 *    switched off or given its own times; the saved calendar is checked; and
 *    nothing beyond the 14-day booking horizon can be booked.
 *  - Notes, tasks and reports are checked before they are stored; one report
 *    per session; a report can be kept from the patient.
 *  - Stats count what was held, and minutes actually spent.
 *  - My Patients carries facts, not guesses, and no emails.
 */

require('../support/env');

const request = require('supertest');
const mongoose = require('mongoose');
const { startServer, stopServer } = require('../support/server');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('isomorphic-dompurify', () => ({ sanitize: (v) => v }));
const mockMail = {};
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => {
    if (!mockMail[name]) mockMail[name] = jest.fn().mockResolvedValue({ id: 'sink' });
    return mockMail[name];
  }
}));

let server, f;
let User, DoctorProfile, DoctorAvailability, Session, Report;
let tokens = {};

async function call(method, path, token, body) {
  const csrfRes = await request(server).get('/api/csrf-token');
  let req = request(server)[method](path).set('Cookie', csrfRes.headers['set-cookie']).set('X-CSRF-Token', csrfRes.body.csrfToken);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

const { utcToZoned, zonedToUtc } = require('../../utils/zonedTime');
const istDay = (n) => utcToZoned(new Date(Date.now() + n * 864e5), 'Asia/Kolkata').localDate;
const weekdayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const { getJWTSecret } = require('../../config/auth');
  return jwt.sign({ userId: String(user._id), username: user.username, role: user.role }, getJWTSecret(), { expiresIn: '1h' });
}

/** An approved doctor with no profile, as an admin approval leaves them. */
async function newDoctor(label) {
  const email = `p6.${label}.${Date.now()}${Math.floor(Math.random() * 1000)}@veraawell.test`;
  const user = await User.create({
    firstName: 'Nova', lastName: label, email, username: email, password: 'Secret123!',
    role: 'doctor', approvalStatus: 'approved', status: 'active', isVerified: true
  });
  return { user, token: tokenFor(user) };
}

beforeAll(async () => {
  await connectDb('phase6-doctor');
  const app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');
  DoctorAvailability = require('../../models/doctorAvailability');
  Session = require('../../models/session');
  Report = require('../../models/report');
  const { seedAll } = require('../support/seed');
  f = await seedAll();
  tokens = {
    doctorA: tokenFor(f.doctorA), doctorB: tokenFor(f.doctorB),
    patientA: tokenFor(f.patientA), patientB: tokenFor(f.patientB)
  };
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

/* ───────────────────────────── visibility ───────────────────────────── */

describe('"can patients find you?"', () => {
  test('a seeded, fully set-up therapist: visible, every check done', async () => {
    const res = await call('get', '/api/profile/visibility', tokens.doctorA);
    expect(res.status).toBe(200);
    expect(res.body.visible).toBe(true);
    expect(res.body.instantReady).toBe(true);
    expect(res.body.checks.map((c) => [c.key, c.ok])).toEqual([['profile', true], ['prices', true], ['bank', true], ['dates', true]]);
  });

  test('a brand-new therapist: not visible, and each missing piece is named with its fix', async () => {
    const { token } = await newDoctor('vis');
    const res = await call('get', '/api/profile/visibility', token);
    expect(res.status).toBe(200);
    expect(res.body.visible).toBe(false);
    expect(res.body.instantReady).toBe(false);
    const byKey = Object.fromEntries(res.body.checks.map((c) => [c.key, c]));
    expect(byKey.profile).toMatchObject({ ok: false, fix: '/profile-setup' });
    expect(byKey.prices.detail).toMatch(/Missing: 20-min video, 20-min voice, 40-min video/);
    expect(byKey.bank).toMatchObject({ ok: false, status: 'not_submitted', fix: '/doctor-settings#payouts' });
    expect(byKey.dates).toMatchObject({ ok: false, detail: 'Not set up yet', fix: '/manage-calendar' });
  });

  test('bank details waiting for approval, or not accepted with a reason, say so', async () => {
    const { user, token } = await newDoctor('bank');
    await DoctorProfile.collection.insertOne({ userId: user._id, payoutBankStatus: 'pending_admin_approval', payoutApproved: false, pricing: {} });
    let bank = (await call('get', '/api/profile/visibility', token)).body.checks.find((c) => c.key === 'bank');
    expect(bank.detail).toMatch(/waiting for Veraawell to approve/);
    await DoctorProfile.collection.updateOne({ userId: user._id }, { $set: { payoutBankStatus: 'rejected', payoutRejectionReason: 'Name mismatch' } });
    bank = (await call('get', '/api/profile/visibility', token)).body.checks.find((c) => c.key === 'bank');
    expect(bank.detail).toMatch(/Not accepted: Name mismatch/);
  });

  test('agrees with the directory: whatever it says, the public list says the same', async () => {
    const vis = await call('get', '/api/profile/visibility', tokens.doctorB);
    const list = await request(server).get('/api/sessions/doctors');
    const listed = JSON.stringify(list.body).includes(String(f.doctorB._id));
    expect(listed).toBe(vis.body.visible);
  });

  test('patients cannot ask', async () => {
    expect((await call('get', '/api/profile/visibility', tokens.patientA)).status).toBe(403);
    expect((await request(server).get('/api/profile/visibility')).status).toBe(401);
  });
});

/* ───────────────────────────── online switch ───────────────────────────── */

describe('the online switch', () => {
  afterEach(async () => { await User.updateOne({ _id: f.doctorA._id }, { $set: { isOnline: false } }); });

  test('sets the state asked for — asking twice does not flip it back', async () => {
    const first = await call('post', '/api/doctor-status/toggle-online', tokens.doctorA, { online: true });
    expect(first.body.isOnline).toBe(true);
    const again = await call('post', '/api/doctor-status/toggle-online', tokens.doctorA, { online: true });
    expect(again.body.isOnline).toBe(true);
    expect((await User.findById(f.doctorA._id)).isOnline).toBe(true);
    const off = await call('post', '/api/doctor-status/toggle-online', tokens.doctorA, { online: false });
    expect(off.body.isOnline).toBe(false);
  });

  test('without a body it still toggles (older tabs)', async () => {
    const res = await call('post', '/api/doctor-status/toggle-online', tokens.doctorA);
    expect(res.body.isOnline).toBe(true);
  });

  test('says whether patients can ring the therapist', async () => {
    expect((await call('post', '/api/doctor-status/toggle-online', tokens.doctorA, { online: true })).body.instantReady).toBe(true);
    const { token } = await newDoctor('ring');
    const res = await call('post', '/api/doctor-status/toggle-online', token, { online: true });
    expect(res.body).toMatchObject({ isOnline: true, instantReady: false });
  });
});

/* ───────────────────────────── weekly calendar ───────────────────────────── */

describe('a weekly calendar', () => {
  let doc;
  beforeEach(async () => {
    doc = await newDoctor('cal');
    await DoctorProfile.create({
      userId: doc.user._id, type: 'Psychologist', experience: 3, specialization: ['Anxiety'], qualification: ['MA Psychology'],
      languages: ['English'], treatsFor: ['Anxiety'],
      pricing: { min: 500, max: 900, session20: 500, session40: 700, session55: 900, audio: { session20: 500, session40: 700, session55: 900 } },
      payoutApproved: true, payoutBankStatus: 'approved'
    });
  });

  const slotsOn = async (date) => (await request(server).get(`/api/sessions/doctors/${doc.user._id}/slots/${date}`)).body;
  const times = (body) => JSON.stringify(body);

  test('times set for a weekday repeat every week, and the therapist is listed without an end date', async () => {
    const day = istDay(3);
    const res = await call('post', '/api/availability/save', doc.token, {
      availabilityType: 'weekly', weeklySlots: [{ weekday: weekdayOf(day), slots: ['10:00 AM', '14:00'] }]
    });
    expect(res.status).toBe(200);
    expect(times(await slotsOn(day))).toMatch(/10:00 AM/);
    expect(times(await slotsOn(day))).toMatch(/02:00 PM/);
    // The same weekday a week later — not ticked anywhere.
    expect(times(await slotsOn(istDay(10)))).toMatch(/10:00 AM/);
    // Another weekday has nothing.
    expect(times(await slotsOn(istDay(4)))).not.toMatch(/10:00 AM/);
    const profile = await DoctorProfile.findOne({ userId: doc.user._id }).lean();
    expect(profile.bookableUntil.getUTCFullYear()).toBe(2100);
    const listed = await request(server).get('/api/sessions/doctors');
    expect(JSON.stringify(listed.body)).toContain(String(doc.user._id));
  });

  test('a day switched off has no times; a day with its own times shows those instead', async () => {
    const off = istDay(3);
    const own = istDay(4);
    await call('post', '/api/availability/save', doc.token, {
      availabilityType: 'weekly',
      weeklySlots: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, slots: ['10:00 AM'] })),
      offDates: [off],
      customAvailability: [{ date: own, slots: [{ time: '05:00 PM', isBooked: true }] }]
    });
    expect(times(await slotsOn(off))).not.toMatch(/AM|PM/);
    const ownSlots = times(await slotsOn(own));
    expect(ownSlots).toMatch(/05:00 PM/);
    expect(ownSlots).not.toMatch(/10:00 AM/);
    // The client's "isBooked" is never trusted.
    const stored = await DoctorAvailability.findOne({ doctorId: doc.user._id }).lean();
    expect(stored.customAvailability[0].slots[0].isBooked).toBe(false);
  });

  test('a weekly calendar with no times leaves the therapist unlisted', async () => {
    await call('post', '/api/availability/save', doc.token, { availabilityType: 'weekly', weeklySlots: [] });
    expect((await DoctorProfile.findOne({ userId: doc.user._id }).lean()).bookableUntil).toBeNull();
  });

  test.each([
    ['a slot off the hour', { availabilityType: 'weekly', weeklySlots: [{ weekday: 1, slots: ['09:30 AM'] }] }, /on the hour/],
    ['a slot before 9 AM', { availabilityType: 'weekly', weeklySlots: [{ weekday: 1, slots: ['07:00 AM'] }] }, /9 AM to 8 PM/],
    ['a weekday listed twice', { availabilityType: 'weekly', weeklySlots: [{ weekday: 1, slots: ['10:00 AM'] }, { weekday: 1, slots: ['11:00 AM'] }] }, /twice/],
    ['a weekday out of range', { availabilityType: 'weekly', weeklySlots: [{ weekday: 7, slots: ['10:00 AM'] }] }, /weekday/],
    ['an unknown calendar type', { availabilityType: 'monthly' }, /repeats/],
    ['a date far ahead', { availabilityType: 'weekly', offDates: [istDay(90)] }, /60 days/],
    ['a date that is not a date', { availabilityType: 'weekly', offDates: ['2026-02-30'] }, /not a date/],
  ])('refuses %s, and saves nothing', async (_label, body, message) => {
    await call('post', '/api/availability/save', doc.token, { availabilityType: 'weekly', weeklySlots: [{ weekday: 2, slots: ['10:00 AM'] }] });
    const res = await call('post', '/api/availability/save', doc.token, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    const stored = await DoctorAvailability.findOne({ doctorId: doc.user._id }).lean();
    expect(stored.weeklySlots).toEqual([expect.objectContaining({ weekday: 2, slots: ['10:00 AM'] })]);
  });

  test('past dates in a save are dropped, not refused', async () => {
    const res = await call('post', '/api/availability/save', doc.token, {
      availabilityType: 'same_slots', defaultSlots: ['10:00 AM'], activeDates: ['2020-01-01', istDay(2)]
    });
    expect(res.status).toBe(200);
    expect((await DoctorAvailability.findOne({ doctorId: doc.user._id }).lean()).activeDates).toEqual([istDay(2)]);
  });

  test('nothing beyond 14 days ahead can be booked, even on a repeating weekday', async () => {
    const far = istDay(21);
    await call('post', '/api/availability/save', doc.token, {
      availabilityType: 'weekly', weeklySlots: [{ weekday: weekdayOf(far), slots: ['10:00 AM'] }]
    });
    expect(times(await slotsOn(far))).not.toMatch(/10:00 AM/);
    const res = await call('post', '/api/sessions/book', tokens.patientB, {
      doctorId: String(doc.user._id), sessionDate: far, sessionTime: '10:00 AM', duration: 20, mode: 'video', serviceType: 'consultation'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/14 days ahead/);
  });
});

/* ─────────────────────── notes, tasks and reports ─────────────────────── */

describe('what a therapist files', () => {
  let session;
  beforeEach(async () => {
    session = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 3 * 3600e3), duration: 20, price: 1000,
      status: 'completed', paymentStatus: 'paid', paymentId: `pay_p6_${Date.now()}`, callMode: 'Video Calling', doctorJoined: true
    });
  });

  test.each([
    ['a due date in the past', { dueDate: istDay(-2) }, /already passed/],
    ['a due date that is not a date', { dueDate: 'soon' }, /Choose a due date/],
    ['a due date over a year away', { dueDate: istDay(400) }, /within a year/],
    ['no title', { title: '  ' }, /title/],
    ['a priority that does not exist', { priority: 'urgent' }, /low, medium or high/],
  ])('a task with %s is refused', async (_label, override, message) => {
    const res = await call('post', '/api/session-tools/tasks', tokens.doctorA, {
      sessionId: String(session._id), title: 'Sleep diary', description: 'Every morning', dueDate: istDay(5), priority: 'medium', ...override
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
  });

  test('a task due today is accepted and stored at the start of that IST day', async () => {
    const res = await call('post', '/api/session-tools/tasks', tokens.doctorA, {
      sessionId: String(session._id), title: 'Breathe', description: 'Twice a day', dueDate: istDay(0)
    });
    expect(res.status).toBe(201);
    expect(new Date(res.body.task.dueDate).toISOString()).toBe(zonedToUtc(istDay(0), '00:00', 'Asia/Kolkata').toISOString());
  });

  test('an empty or oversized note is refused; a note is always private', async () => {
    expect((await call('post', '/api/session-tools/notes', tokens.doctorA, { sessionId: String(session._id), content: '   ' })).status).toBe(400);
    expect((await call('post', '/api/session-tools/notes', tokens.doctorA, { sessionId: String(session._id), content: 'x'.repeat(5001) })).status).toBe(400);
    const ok = await call('post', '/api/session-tools/notes', tokens.doctorA, { sessionId: String(session._id), topicsDiscussed: 'Work stress', isPrivate: false });
    expect(ok.status).toBe(201);
    expect(ok.body.note.isPrivate).toBe(true);
    expect(ok.body.note.content).toBe('Work stress');
  });

  test('one report per session — a second is refused', async () => {
    const body = { sessionId: String(session._id), title: 'Progress', reportType: 'progress', content: '{"mood":"low"}' };
    expect((await call('post', '/api/session-tools/reports', tokens.doctorA, body)).status).toBe(201);
    const again = await call('post', '/api/session-tools/reports', tokens.doctorA, body);
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already been filed/);
    expect(await Report.countDocuments({ sessionId: session._id })).toBe(1);
  });

  test('a report kept from the patient is stored that way, and the patient does not see it', async () => {
    const res = await call('post', '/api/session-tools/reports', tokens.doctorA, {
      sessionId: String(session._id), title: 'Private plan', reportType: 'treatment-plan', content: '{"summary":"x"}', isSharedWithPatient: false
    });
    expect(res.status).toBe(201);
    expect(res.body.report.isSharedWithPatient).toBe(false);
    const asPatient = await call('get', `/api/session-tools/reports/patient/${f.patientA._id}`, tokens.patientA);
    expect(JSON.stringify(asPatient.body)).not.toContain('Private plan');
    const asDoctor = await call('get', `/api/session-tools/reports/patient/${f.patientA._id}`, tokens.doctorA);
    expect(JSON.stringify(asDoctor.body)).toContain('Private plan');
  });

  test.each([
    ['an unknown type', { reportType: 'other-stuff' }],
    ['an empty report', { content: '  ' }],
    ['a share flag that is not yes/no', { isSharedWithPatient: 'maybe' }],
  ])('a report with %s is refused', async (_label, override) => {
    const res = await call('post', '/api/session-tools/reports', tokens.doctorA, {
      sessionId: String(session._id), title: 'R', reportType: 'progress', content: '{"a":1}', ...override
    });
    expect(res.status).toBe(400);
  });
});

/* ───────────────────────────── stats & patients ───────────────────────────── */

describe('what the therapist is shown about their practice', () => {
  let doc, patient;
  beforeAll(async () => {
    doc = await newDoctor('stats');
    patient = f.patientB;
    const base = { doctorId: doc.user._id, patientId: patient._id, paymentStatus: 'paid', callMode: 'Video Calling', price: 1000, platformFee: 200, doctorEarnings: 800 };
    await Session.create([
      { ...base, startsAt: new Date(Date.now() - 5 * 864e5), duration: 40, actualDuration: 33, status: 'completed', doctorJoined: true, paymentId: 'pay_p6_a' },
      { ...base, startsAt: new Date(Date.now() - 4 * 864e5), duration: 20, status: 'cancelled', cancelledBy: 'patient', lateCancellation: true, paymentId: 'pay_p6_b' },
      { ...base, startsAt: new Date(Date.now() - 3 * 864e5), duration: 55, status: 'cancelled', cancelledBy: 'patient', paymentStatus: 'refunded', refundAmount: 1000, paymentId: 'pay_p6_c' },
      { ...base, startsAt: new Date(Date.now() + 2 * 864e5), duration: 20, status: 'scheduled', paymentId: 'pay_p6_d' },
    ]);
  });

  test('sessions held and minutes come from what happened; late cancellations are paid, not held', async () => {
    const res = await call('get', '/api/sessions/stats', doc.token);
    expect(res.status).toBe(200);
    expect(res.body.totalSessions).toBe(2);       // held + late cancellation (both paid)
    expect(res.body.heldSessions).toBe(1);
    expect(res.body.totalDurationMinutes).toBe(33); // minutes spent, not 40 + 20 booked
    expect(res.body.platformFeePercent).toBe(20);
  });

  test('My Patients: real counts, last and next session, no email, no guessed "issue"', async () => {
    const res = await call('get', '/api/patients/doctor-patients', doc.token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const row = res.body[0];
    expect(row).toMatchObject({ _id: String(patient._id), completedSessions: 1, upcomingSessions: 1 });
    expect(row.nextSessionAt).toBeTruthy();
    expect(row.lastSessionAt).toBeTruthy();
    expect(row.sessions).toHaveLength(4);
    expect(row).not.toHaveProperty('email');
    expect(row).not.toHaveProperty('issue');
    expect(row).not.toHaveProperty('occupation');
    expect(JSON.stringify(res.body)).not.toContain(patient.email);
  });

  test('My Patients sorts by the next session, then by who was seen last; a deleted patient drops out', async () => {
    const d = await newDoctor('order');
    const base = { doctorId: d.user._id, paymentStatus: 'paid', callMode: 'Video Calling', price: 1000, platformFee: 200, doctorEarnings: 800 };
    const gone = await User.create({ firstName: 'Gone', lastName: 'Patient', email: `gone.${Date.now()}@veraawell.test`, username: `gone.${Date.now()}`, password: 'Secret123!', role: 'patient', status: 'active', isVerified: true });
    let n = 0;
    const s = (patientId, days, status, extra = {}) => ({ ...base, patientId, startsAt: new Date(Date.now() + days * 864e5), duration: 20, status, paymentId: `pay_p6_o_${Date.now()}_${n += 1}`, ...extra });
    await Session.create([
      // patientA: seen 10 days ago, nothing booked
      s(f.patientA._id, -10, 'completed', { doctorJoined: true }),
      // patientB: seen 2 days ago and 6 days ago; two upcoming — the earlier one is "next"
      s(f.patientB._id, -2, 'completed', { doctorJoined: true }),
      s(f.patientB._id, -6, 'completed', { doctorJoined: true }),
      s(f.patientB._id, 5, 'scheduled'),
      s(f.patientB._id, 3, 'scheduled'),
      // a patient whose account was then deleted
      s(gone._id, -1, 'completed', { doctorJoined: true }),
    ]);
    await User.deleteOne({ _id: gone._id });

    const res = await call('get', '/api/patients/doctor-patients', d.token);
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p._id)).toEqual([String(f.patientB._id), String(f.patientA._id)]);
    const b = res.body[0];
    expect(b.completedSessions).toBe(2);
    expect(b.upcomingSessions).toBe(2);
    expect(new Date(b.nextSessionAt) < new Date(Date.now() + 4 * 864e5)).toBe(true);
    expect(new Date(b.lastSessionAt) > new Date(Date.now() - 3 * 864e5)).toBe(true);
    expect(res.body[1].nextSessionAt).toBeNull();

    // A long history lists the latest 20 sessions, but counts them all.
    await Session.create(Array.from({ length: 22 }, (_, i) => s(f.patientA._id, -20 - i, 'completed', { doctorJoined: true })));
    const many = (await call('get', '/api/patients/doctor-patients', d.token)).body.find((p) => p._id === String(f.patientA._id));
    expect(many.sessions).toHaveLength(20);
    expect(many.completedSessions).toBe(23);
  });

  test('call history carries the therapist\'s own share', async () => {
    const res = await call('get', '/api/sessions/call-history', doc.token);
    expect(res.status).toBe(200);
    const held = res.body.find((c) => c.status === 'completed');
    expect(held.doctorEarnings).toBe(800);
  });
});

void mongoose;
