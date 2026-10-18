/**
 * Profile setup, pricing, emergency contacts, the doctor's patient roster,
 * availability publishing, the removal of the standalone OTP system and the
 * SEO routes.
 *
 * These sat between 8% and 37% covered. The second OTP system they used to
 * exercise no longer gated registration and nothing in the client called it;
 * it has been removed, and the tests below now pin that it stays gone.
 */

require('../support/env');

const request = require('supertest');
const { startServer, stopServer } = require('../support/server');
const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

jest.mock('razorpay', () => jest.fn().mockImplementation(() => ({
  orders: { create: jest.fn() },
  payments: { refund: jest.fn(), fetchMultipleRefund: jest.fn().mockResolvedValue({ items: [] }) },
  accounts: { create: jest.fn() }
})));
const mockSendOtp = jest.fn().mockResolvedValue({ id: 'sink' });
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => (name === 'sendOTPEmail' ? (...a) => mockSendOtp(...a) : jest.fn().mockResolvedValue({ id: 'sink' }))
}));
jest.mock('isomorphic-dompurify', () => ({ sanitize: (s) => s }));

let app, f;
let server;
let patientToken, doctorToken;
let User, DoctorProfile, DoctorAvailability, Session;

beforeAll(async () => {
  await connectDb('profile.patient.otp');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');
  DoctorAvailability = require('../../models/doctorAvailability');
  Session = require('../../models/session');

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
  mockSendOtp.mockClear();
});

async function call(method, path, token, body) {
  const t = await request(server).get('/api/csrf-token');
  let req = request(server)[method](path)
    .set('Cookie', t.headers['set-cookie'])
    .set('X-CSRF-Token', t.body.csrfToken);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req.send() : req.send(body);
}

describe('profile setup', () => {
  test('a patient can save demographics and an emergency contact', async () => {
    const res = await call('post', '/api/profile/setup', patientToken, {
      fullName: 'Asha Rao',
      phoneNumber: '9812345678',
      dateOfBirth: '1995-04-12',
      gender: 'Female',
      emergencyContact: { name: 'Ravi Rao', phone: '9812345679', relationship: 'Sibling' }
    });
    expect(res.status).toBeLessThan(300);

    const user = await User.findById(f.patientA._id);
    expect(user.firstName).toBe('Asha');
    expect(user.lastName).toBe('Rao');
    expect(user.phoneNumber).toBe('9812345678');
  });

  test('a full name with several parts splits into first and the rest', async () => {
    await call('post', '/api/profile/setup', patientToken, { fullName: 'Maria del Carmen Santos' });
    const user = await User.findById(f.patientA._id);
    expect(user.firstName).toBe('Maria');
    expect(user.lastName).toBe('del Carmen Santos');
  });

  test('a doctor can save professional details and they land on the DoctorProfile', async () => {
    const res = await call('post', '/api/profile/setup', doctorToken, {
      fullName: 'Dev Mehta',
      type: 'Psychiatrist',
      experience: 12,
      specialization: ['Trauma', 'Anxiety'],
      qualification: ['MD Psychiatry'],
      languages: ['English'],
      modeOfSession: ['video'],
      quote: 'Progress, not perfection.',
      quoteAuthor: 'Anon'
    });
    expect(res.status).toBeLessThan(300);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(profile.type).toBe('Psychiatrist');
    expect(profile.experience).toBe(12);
    expect(profile.specialization).toEqual(expect.arrayContaining(['Trauma']));
  });

  test('GET /api/profile/setup returns the caller\'s own profile only', async () => {
    const mine = await call('get', '/api/profile/setup', doctorToken);
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).not.toContain(String(f.doctorB._id));
  });

  test('profile status reports completion', async () => {
    const res = await call('get', '/api/profile/status', patientToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('profileCompleted');
  });

  test('PUT /api/profile only accepts phone and country code', async () => {
    const res = await call('put', '/api/profile', patientToken, {
      phoneNumber: '9000011111',
      countryCode: '+91',
      role: 'admin',            // an attempt at privilege escalation
      approvalStatus: 'approved'
    });
    expect(res.status).toBeLessThan(300);

    const user = await User.findById(f.patientA._id);
    expect(user.phoneNumber).toBe('9000011111');
    expect(user.role).toBe('patient');
  });

  test('profile routes require authentication', async () => {
    expect((await call('get', '/api/profile/setup', null)).status).toBe(401);
    expect((await call('post', '/api/profile/setup', null, {})).status).toBe(401);
    expect((await call('get', '/api/profile/status', null)).status).toBe(401);
  });
});

describe('doctor pricing', () => {
  const validPricing = {
    session20: 800, session40: 1500, session55: 2000,
    audio: { session20: 600, session40: 1200, session55: 1600 }
  };

  test('a doctor can set all six price slots', async () => {
    const res = await call('patch', '/api/profile/pricing', doctorToken, { pricing: validPricing });
    expect(res.status).toBeLessThan(300);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(profile.pricing.session40).toBe(1500);
    expect(profile.pricing.audio.session20).toBe(600);
  });

  test('a missing pricing object is a 400', async () => {
    const res = await call('patch', '/api/profile/pricing', doctorToken, {});
    expect(res.status).toBe(400);
  });

  test('a negative price is refused', async () => {
    const res = await call('patch', '/api/profile/pricing', doctorToken, {
      pricing: { ...validPricing, session20: -1 }
    });
    expect(res.status).toBe(400);
  });

  test('a non-numeric price is refused', async () => {
    const res = await call('patch', '/api/profile/pricing', doctorToken, {
      pricing: { ...validPricing, session40: 'free' }
    });
    expect(res.status).toBe(400);
  });

  test('a positive price under the ₹1 floor is refused', async () => {
    // ₹1 is Razorpay's minimum order amount, so nothing smaller is chargeable.
    const res = await call('patch', '/api/profile/pricing', doctorToken, {
      pricing: { ...validPricing, session20: 0.5 }
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least ₹1/);
  });

  test('₹1 — the smallest chargeable amount — is accepted on every slot', async () => {
    const onePricing = {
      session20: 1, session40: 1, session55: 1,
      audio: { session20: 1, session40: 1, session55: 1 }
    };
    const res = await call('patch', '/api/profile/pricing', doctorToken, { pricing: onePricing });
    expect(res.status).toBeLessThan(300);

    const profile = await DoctorProfile.findOne({ userId: f.doctorA._id });
    expect(profile.pricing.session20).toBe(1);
    expect(profile.pricing.audio.session55).toBe(1);

    // Put the fixture back so later suites' price assumptions still hold.
    const restore = await call('patch', '/api/profile/pricing', doctorToken, { pricing: validPricing });
    expect(restore.status).toBeLessThan(300);
  });

  test('a patient cannot set pricing', async () => {
    const res = await call('patch', '/api/profile/pricing', patientToken, { pricing: validPricing });
    expect(res.status).toBe(403);
  });
});

describe('profile setup applies the same pricing rules as PATCH /pricing', () => {
  // Regressions. POST /api/profile/setup used to write the price grid raw —
  // negative and ₹10,00,000 prices went straight onto a bookable profile —
  // computed min/max as Math.min/Math.max over an empty list (Infinity and
  // -Infinity for a doctor who had not priced anything), overwrote an
  // existing grid whenever the request did not carry one, and forced the
  // doctor's profile online.
  let freshDoc;
  let freshDocToken;

  beforeAll(async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const { makeUser } = require('../support/seed');
    freshDoc = await makeUser('doctor', `fresh.doctor.${Date.now()}@veraawell.test`, { jobRole: 'Psychologist' });
    freshDocToken = jwt.sign({ userId: String(freshDoc._id), role: 'doctor' }, getJWTSecret(), { expiresIn: '1h' });
  });

  test('a brand-new profile saved without pricing starts unpriced, not at Infinity', async () => {
    const res = await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Fresh Doctor', type: 'Psychologist', experience: 3 });
    expect(res.status).toBeLessThan(300);

    const profile = await DoctorProfile.findOne({ userId: freshDoc._id }).lean();
    expect(profile.pricing.min).toBe(0);
    expect(profile.pricing.max).toBe(0);
  });

  test('saving the profile without pricing leaves an existing grid alone', async () => {
    const priced = await call('patch', '/api/profile/pricing', freshDocToken, {
      pricing: { session20: 700, session40: 1100, session55: 1400 }
    });
    expect(priced.status).toBeLessThan(300);

    await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Fresh Doctor', type: 'Psychologist' });

    const profile = await DoctorProfile.findOne({ userId: freshDoc._id }).lean();
    expect(profile.pricing.session40).toBe(1100);
    expect(profile.pricing.min).toBe(700);
    expect(profile.pricing.max).toBe(1400);
  });

  test('an out-of-range price is refused, and nothing in the request is written', async () => {
    for (const bad of [{ session20: -5 }, { session55: 100000 }, { audio: { session20: 'free' } }]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Renamed Doctor', pricing: bad });
      expect(res.status).toBe(400);
    }

    expect((await User.findById(freshDoc._id)).firstName).toBe('Fresh');
    expect((await DoctorProfile.findOne({ userId: freshDoc._id }).lean()).pricing.min).toBe(700);
  });

  test('a valid grid is stored as numbers with min and max derived', async () => {
    const res = await call('post', '/api/profile/setup', freshDocToken, {
      fullName: 'Fresh Doctor',
      pricing: { session20: '500', session40: 900, session55: 1200, audio: { session20: 400 } }
    });
    expect(res.status).toBeLessThan(300);

    const { pricing } = await DoctorProfile.findOne({ userId: freshDoc._id }).lean();
    expect(pricing.session20).toBe(500);
    expect(pricing.audio.session20).toBe(400);
    expect(pricing.min).toBe(400);
    expect(pricing.max).toBe(1200);
  });

  test('profile and banner images must be our uploads or bundled defaults', async () => {
    const own = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/doctors/a.jpg`;
    for (const body of [
      { profileImage: 'https://evil.example/a.jpg' },
      { bannerImage: 'https://res.cloudinary.com/someone-else/image/upload/b.jpg' },
      { profileImage: 'javascript:alert(1)' }
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Fresh Doctor', ...body });
      expect(res.status).toBe(400);
    }

    const ok = await call('post', '/api/profile/setup', freshDocToken, {
      fullName: 'Fresh Doctor', profileImage: own, bannerImage: '/profile-bg.svg'
    });
    expect(ok.status).toBeLessThan(300);
    expect((await DoctorProfile.findOne({ userId: freshDoc._id }).lean()).profileImage).toBe(own);

    const cleared = await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Fresh Doctor', profileImage: '' });
    expect(cleared.status).toBeLessThan(300);
  });

  test('saving the profile does not put the doctor online', async () => {
    await DoctorProfile.updateOne({ userId: freshDoc._id }, { $set: { isOnline: false } });

    await call('post', '/api/profile/setup', freshDocToken, { fullName: 'Fresh Doctor' });

    expect((await DoctorProfile.findOne({ userId: freshDoc._id }).lean()).isOnline).toBe(false);
  });
});

describe('doctor presence ("Available Now")', () => {
  // Regressions, both seen in production: the list printed each online
  // doctor's email on the patient's screen, and it listed doctors who were
  // online but not bookable — "All Available" showed 0 while "Available Now"
  // showed 2.
  const online = () => request(server).get('/api/doctor-status/online-doctors');
  const ids = (res) => res.body.doctors.map((d) => String(d._id));
  // Online = the doctor's switch on AND a live dashboard connection
  // (services/presence.js). A test stands in for the connection.
  const presence = require('../../services/presence');
  const goOnline = async (doctor) => {
    await User.updateOne({ _id: doctor._id }, { $set: { isOnline: true } });
    presence.connected(doctor._id, `test-socket-${doctor._id}`);
  };

  afterEach(async () => {
    await User.updateMany({ role: 'doctor' }, { $set: { isOnline: false } });
    presence._reset();
  });

  test('lists a bookable online doctor without publishing their email', async () => {
    await goOnline(f.doctorA);

    const res = await online();
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(String(f.doctorA._id));
    for (const d of res.body.doctors) expect(d).not.toHaveProperty('email');
    expect(JSON.stringify(res.body)).not.toContain(f.doctorA.email);

    // The public profile rides along, through the same allowlist the
    // directory uses — so nothing private comes with it.
    const entry = res.body.doctors.find((d) => String(d._id) === String(f.doctorA._id));
    expect(entry.profile.pricing.min).toBeGreaterThan(0);
    expect(entry.profile).not.toHaveProperty('payoutBank');
    expect(entry.profile).not.toHaveProperty('payoutApproved');
  });

  test('omits online doctors a patient could not book', async () => {
    const { makeUser, makeDoctorProfile } = require('../support/seed');
    const stamp = Date.now();
    const unapprovedPayout = await makeUser('doctor', `online.nopayout.${stamp}@veraawell.test`, { isOnline: true });
    await makeDoctorProfile(unapprovedPayout._id, { payoutApproved: false });
    const unpriced = await makeUser('doctor', `online.unpriced.${stamp}@veraawell.test`, { isOnline: true });
    await makeDoctorProfile(unpriced._id, { pricing: { min: 0, max: 0 } });
    const pendingApplication = await makeUser('doctor', `online.pending.${stamp}@veraawell.test`, { isOnline: true, approvalStatus: 'pending' });
    await makeDoctorProfile(pendingApplication._id);
    const noProfile = await makeUser('doctor', `online.noprofile.${stamp}@veraawell.test`, { isOnline: true });

    const listed = ids(await online());
    for (const d of [unapprovedPayout, unpriced, pendingApplication, noProfile]) {
      expect(listed).not.toContain(String(d._id));
    }
  });

  test('the switch alone is not enough: a doctor with no live connection is not listed', async () => {
    await User.updateOne({ _id: f.doctorA._id }, { $set: { isOnline: true } });
    expect(ids(await online())).not.toContain(String(f.doctorA._id));
  });

  test('a doctor in a session is listed as busy', async () => {
    await goOnline(f.doctorA);
    const s = await Session.create({
      patientId: f.patientA._id, doctorId: f.doctorA._id,
      startsAt: new Date(Date.now() - 5 * 60 * 1000), duration: 20, price: 800,
      status: 'scheduled', paymentStatus: 'paid', paymentId: 'pay_busy_now'
    });
    try {
      const entry = (await online()).body.doctors.find((d) => String(d._id) === String(f.doctorA._id));
      expect(entry.busy).toBe(true);
    } finally {
      await Session.deleteOne({ _id: s._id });
    }
    const free = (await online()).body.doctors.find((d) => String(d._id) === String(f.doctorA._id));
    expect(free.busy).toBe(false);
  });

  test('an instant booking needs no published calendar, so an expired one does not hide the doctor', async () => {
    await goOnline(f.doctorA);
    await DoctorProfile.updateOne({ userId: f.doctorA._id }, { $set: { bookableUntil: new Date(Date.now() - 864e5) } });
    try {
      expect(ids(await online())).toContain(String(f.doctorA._id));
    } finally {
      await DoctorProfile.updateOne({ userId: f.doctorA._id }, { $set: { bookableUntil: new Date(Date.now() + 14 * 864e5) } });
    }
  });
});

describe('emergency contacts', () => {
  test('a patient can save and read back their emergency contact', async () => {
    const saved = await call('post', '/api/patients/emergency-contact', patientToken, {
      contactName: 'Ravi Rao', contactPhone: '9812345679', contactRelationship: 'Sibling'
    });
    expect(saved.status).toBeLessThan(300);

    const read = await call('get', '/api/patients/emergency-contact', patientToken);
    expect(read.status).toBe(200);
    expect(JSON.stringify(read.body)).toContain('Ravi Rao');
  });

  test('a doctor can neither set nor read a patient\'s emergency contact through this route', async () => {
    expect((await call('post', '/api/patients/emergency-contact', doctorToken, { contactName: 'x', contactPhone: '9', contactRelationship: 'y' })).status).toBe(403);
    expect((await call('get', '/api/patients/emergency-contact', doctorToken)).status).toBe(403);
  });

  test('the treating doctor CAN read it through the session-scoped route', async () => {
    await call('post', '/api/patients/emergency-contact', patientToken, {
      contactName: 'Ravi Rao', contactPhone: '9812345679', contactRelationship: 'Sibling'
    });

    const ok = await call('get', `/api/sessions/patients/${f.patientA._id}/emergency-contact`, doctorToken);
    expect(ok.status).toBe(200);
  });

  test('a doctor with no treating relationship cannot read it', async () => {
    const jwt = require('jsonwebtoken');
    const { getJWTSecret } = require('../../config/auth');
    const strangerDoc = jwt.sign(
      { userId: String(f.doctorB._id), username: f.doctorB.username, role: 'doctor' },
      getJWTSecret(), { expiresIn: '1h' }
    );
    const res = await call('get', `/api/sessions/patients/${f.patientA._id}/emergency-contact`, strangerDoc);
    expect(res.status).toBe(403);
  });
});

describe('the doctor\'s patient roster', () => {
  test('it lists only patients the doctor has actually seen', async () => {
    const res = await call('get', '/api/patients/doctor-patients', doctorToken);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).toContain(String(f.patientA._id));   // has a session with doctorA
    expect(body).not.toContain(String(f.patientB._id)); // has none
  });

  test('a patient cannot read the roster', async () => {
    const res = await call('get', '/api/patients/doctor-patients', patientToken);
    expect(res.status).toBe(403);
  });
});

describe('availability publishing', () => {
  test('a doctor can publish a grid and read it back', async () => {
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const day = utcToZoned(new Date(Date.now() + 4 * 864e5), PLATFORM_TIMEZONE).localDate;

    const res = await call('post', '/api/availability/save', doctorToken, {
      availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM', '11:00 AM'],
      activeDates: [day],
      customAvailability: []
    });
    expect(res.status).toBeLessThan(300);

    const mine = await call('get', '/api/availability/doctor/current', doctorToken);
    expect(mine.status).toBe(200);

    const slots = await request(server).get(`/api/availability/slots/${f.doctorA._id}/${day}`);
    expect(slots.status).toBe(200);
    expect(JSON.stringify(slots.body)).toMatch(/10:00 AM|10:00/);
  });

  test('slot strings are canonicalised, so mixed formats collapse to one slot', async () => {
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const day = utcToZoned(new Date(Date.now() + 6 * 864e5), PLATFORM_TIMEZONE).localDate;

    await call('post', '/api/availability/save', doctorToken, {
      availabilityType: 'same_slots',
      defaultSlots: ['9:00 AM', '09:00', '09:00 AM'],
      activeDates: [day]
    });

    const grid = await DoctorAvailability.findOne({ doctorId: f.doctorA._id });
    const nine = grid.defaultSlots.filter((s) => /09:00/.test(s));
    expect(new Set(nine).size).toBe(1);
  });

  test('a date not in activeDates exposes no slots', async () => {
    const far = '2029-12-25';
    const slots = await request(server).get(`/api/availability/slots/${f.doctorA._id}/${far}`);
    expect(slots.status).toBe(200);
    const list = slots.body.slots || slots.body.availableSlots || [];
    expect(list).toHaveLength(0);
  });

  test('a patient cannot publish availability', async () => {
    const res = await call('post', '/api/availability/save', patientToken, {
      availabilityType: 'same_slots', defaultSlots: ['10:00 AM'], activeDates: ['2029-01-01']
    });
    expect(res.status).toBe(403);
  });

  test('the public slot read is unauthenticated by design', async () => {
    const res = await request(server).get(`/api/availability/doctor/${f.doctorA._id}`);
    expect(res.status).toBe(200);
  });

  test('a malformed doctorId on the public availability route returns 500', async () => {
    // routes/availability.js:7,9 mount these two reads with no
    // validateObjectIdParam, unlike every comparable route. A junk id reaches
    // Mongoose, raises a CastError, and surfaces as a 500 — an unauthenticated
    // caller can generate server-error noise at will, and a client cannot tell
    // "bad id" from "server broken".
    const byDoctor = await request(server).get('/api/availability/doctor/not-an-id');
    expect(byDoctor.status).toBe(500);

    const slots = await request(server).get('/api/availability/slots/not-an-id/2029-01-01');
    expect(slots.status).toBe(500);

    // For contrast, the equivalent session route DOES validate and answers 400.
    const validated = await request(server).get('/api/sessions/doctors/not-an-id');
    expect(validated.status).toBe(400);
  });
});

describe('the standalone OTP system is gone', () => {
  // Regression. These tests used to exercise /api/otp/{send,verify,resend}: a
  // second email-OTP system that no longer gated registration (its check in
  // auth.service had been commented out) and that nothing in the client
  // called. It was an unauthenticated way to make the server email any
  // address. Signup verifies through the PendingUser code instead.
  test('its three endpoints no longer exist, and send no mail', async () => {
    for (const path of ['/api/otp/send', '/api/otp/verify', '/api/otp/resend']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await call('post', path, null, { email: 'newuser@test.local', userType: 'patient', otp: '123456' });
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  test('registration still sends exactly one code, through the signup path', async () => {
    const res = await call('post', '/api/auth/register', null, {
      firstName: 'NoOtp', lastName: 'User',
      email: 'no.otp@test.local', username: 'no.otp@test.local',
      password: 'password123', phoneNo: '9000000099', role: 'patient'
    });
    expect(res.status).toBe(201);
    expect(mockSendOtp).toHaveBeenCalledTimes(1);
    expect(mockSendOtp.mock.calls[0][0]).toBe('no.otp@test.local');
  });
});

describe('SEO routes', () => {
  test('sitemap.xml is served as XML and lists real URLs', async () => {
    const res = await request(server).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('<urlset');
    expect(res.text).toMatch(/<loc>/);
  });

  test('robots.txt is served as plain text and points at the sitemap', async () => {
    const res = await request(server).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/Sitemap:/i);
  });
});
