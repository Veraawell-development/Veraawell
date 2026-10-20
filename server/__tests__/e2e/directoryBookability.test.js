/**
 * The public therapist directory lists only therapists a patient can book.
 *
 * WHY
 *
 * The directory was `DoctorProfile.find({})` filtered to "has a user". It
 * therefore advertised four kinds of unbookable doctor, all of them live at
 * once on the running platform:
 *
 *   1. Applications still `pending`, and applications that had been
 *      `rejected` — `approvalStatus` was never referenced anywhere in
 *      session.controller.js.
 *   2. Doctors with no approved payout route, whose bookings are refused with
 *      409 by resolveBookingPaymentState.
 *   3. Doctors with no price set.
 *   4. Doctors whose published calendar had run out. Both real doctors were in
 *      this state — activeDates ended six weeks before the directory was still
 *      showing them with a Book button.
 *
 * A patient reaching a booking page with no times on it, or a 409 after
 * choosing a therapist, is the visible half of that. This suite pins each
 * exclusion separately so a future change can only remove one deliberately.
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

let app, server, User, DoctorProfile, DoctorAvailability;
let seq = 0;

/** A fully bookable doctor; each test spoils exactly one precondition. */
async function makeDoctor({ userOverrides = {}, profileOverrides = {} } = {}) {
  seq += 1;
  const user = await User.create({
    firstName: 'Dir', lastName: `Doc${seq}`,
    email: `dir.doc.${seq}.${Date.now()}@test.local`,
    username: `dir.doc.${seq}.${Date.now()}@test.local`,
    password: 'DirDoctor123!',
    role: 'doctor',
    approvalStatus: 'approved',
    status: 'active',
    isVerified: true,
    ...userOverrides
  });

  const profile = await DoctorProfile.create({
    userId: user._id,
    specialization: ['Anxiety'], experience: 5, qualification: ['MPhil'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Clinical Psychologist',
    pricing: { min: 600, max: 2000, session20: 800, session40: 1500, session55: 2000, audio: { session20: 600, session40: 1200, session55: 1600 } },
    payoutApproved: true,
    bookableUntil: new Date(Date.now() + 14 * 864e5),
    ...profileOverrides
  });

  return { user, profile };
}

/** Is this doctor visible in the public directory? */
async function isListed(userId) {
  const res = await request(server).get('/api/sessions/doctors');
  expect(res.status).toBe(200);
  return res.body.some((d) => String(d.userId?._id) === String(userId));
}

beforeAll(async () => {
  await connectDb('directory-bookability');
  app = require('../../app');
  server = await startServer(app);
  User = require('../../models/user');
  DoctorProfile = require('../../models/doctorProfile');
  DoctorAvailability = require('../../models/doctorAvailability');
}, 180000);

afterAll(async () => {
  await stopServer(server);
  await disconnectDb();
});

afterEach(async () => {
  await Promise.all([
    DoctorProfile.deleteMany({}),
    DoctorAvailability.deleteMany({}),
    User.deleteMany({ role: 'doctor' })
  ]);
});

describe('who the directory lists', () => {
  test('a fully bookable doctor is listed — the control', async () => {
    // Without this every exclusion below could pass for the wrong reason.
    const { user } = await makeDoctor();
    expect(await isListed(user._id)).toBe(true);
  });

  test('a doctor whose payouts are not approved is hidden', async () => {
    const { user } = await makeDoctor({ profileOverrides: { payoutApproved: false } });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor whose application is still pending is hidden', async () => {
    const { user } = await makeDoctor({ userOverrides: { approvalStatus: 'pending' } });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor whose application was rejected is hidden', async () => {
    const { user } = await makeDoctor({ userOverrides: { approvalStatus: 'rejected' } });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor with no price set is hidden', async () => {
    const { user } = await makeDoctor({
      profileOverrides: { pricing: { min: 0, max: 0, session20: 0 } }
    });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor with a gap in their six prices is hidden — they would be sold at a price they never set', async () => {
    const { user } = await makeDoctor({
      profileOverrides: { pricing: { min: 800, max: 2000, session20: 800, session40: 1500, session55: 2000, audio: { session20: 600, session40: 0, session55: 1600 } } }
    });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor whose calendar has run out is hidden', async () => {
    // The exact state both live doctors were in.
    const { user } = await makeDoctor({
      profileOverrides: { bookableUntil: new Date(Date.now() - 3 * 864e5) }
    });
    expect(await isListed(user._id)).toBe(false);
  });

  test('a doctor who has never published a calendar is hidden', async () => {
    const { user } = await makeDoctor({ profileOverrides: { bookableUntil: null } });
    expect(await isListed(user._id)).toBe(false);
  });

  test('the single-doctor endpoint still resolves a hidden doctor by id', async () => {
    // Hiding from the list must not 404 an existing profile link — a patient
    // with an old bookmark should still see the profile, and be stopped at
    // booking rather than at the page.
    const { user } = await makeDoctor({ profileOverrides: { payoutApproved: false } });
    const res = await request(server).get(`/api/sessions/doctors/${user._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pricing');
  });
});

describe('bookableUntil is derived from the doctor\'s own calendar', () => {
  const { syncBookableUntil } = require('../../controllers/availability.controller');

  test('it tracks the latest active date, to the end of that local day', async () => {
    const { user } = await makeDoctor({ profileOverrides: { bookableUntil: null } });
    const availability = await DoctorAvailability.create({
      doctorId: user._id,
      availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM'],
      activeDates: ['2099-01-05', '2099-01-20', '2099-01-12'],
      customAvailability: []
    });

    await syncBookableUntil(user._id, availability);

    const profile = await DoctorProfile.findOne({ userId: user._id }).select('+bookableUntil');
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    const local = utcToZoned(profile.bookableUntil, PLATFORM_TIMEZONE);
    // End of the day, not its midnight start — otherwise the last bookable day
    // drops out of the directory as soon as it begins.
    expect(local.localDate).toBe('2099-01-20');
    expect(local.localTime).toBe('23:59');
  });

  test('a custom day with slots counts, one with none does not', async () => {
    const { user } = await makeDoctor({ profileOverrides: { bookableUntil: null } });
    const availability = await DoctorAvailability.create({
      doctorId: user._id,
      availabilityType: 'different_slots',
      defaultSlots: [],
      activeDates: ['2099-01-05'],
      customAvailability: [
        { date: '2099-03-03', slots: [{ time: '10:00 AM', isBooked: false }] },
        { date: '2099-06-06', slots: [] }   // switched off: not bookable
      ]
    });

    await syncBookableUntil(user._id, availability);

    const profile = await DoctorProfile.findOne({ userId: user._id }).select('+bookableUntil');
    const { utcToZoned } = require('../../utils/zonedTime');
    const { PLATFORM_TIMEZONE } = require('../../config/time');
    expect(utcToZoned(profile.bookableUntil, PLATFORM_TIMEZONE).localDate).toBe('2099-03-03');
  });

  test('clearing every date clears the field, which hides the doctor', async () => {
    const { user } = await makeDoctor();
    expect(await isListed(user._id)).toBe(true);

    const availability = await DoctorAvailability.create({
      doctorId: user._id,
      availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM'],
      activeDates: [],
      customAvailability: []
    });
    await syncBookableUntil(user._id, availability);

    const profile = await DoctorProfile.findOne({ userId: user._id }).select('+bookableUntil');
    expect(profile.bookableUntil).toBeNull();
    expect(await isListed(user._id)).toBe(false);
  });
});

describe('what the directory and profile show', () => {
  test('a therapist without a photo gets none — not a stock face guessed from their first name', async () => {
    // getGenderBasedImage used to put /female.jpg or /male.jpg under their
    // name; the app now shows their initials instead.
    const { user } = await makeDoctor({ userOverrides: { firstName: 'Priya' }, profileOverrides: { profileImage: '' } });
    const list = await request(server).get('/api/sessions/doctors');
    const listed = list.body.find((d) => String(d.userId?._id) === String(user._id));
    expect(listed.profileImage).toBe('');
    const one = await request(server).get(`/api/sessions/doctors/${user._id}`);
    expect(one.body.profileImage).toBe('');
  });

  test('a real photo is passed through', async () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/doctors/a.jpg';
    const { user } = await makeDoctor({ profileOverrides: { profileImage: url } });
    const one = await request(server).get(`/api/sessions/doctors/${user._id}`);
    expect(one.body.profileImage).toBe(url);
  });

  test('"open days" leave out a day whose only time has already passed', async () => {
    // getDoctorById counted any unbooked slot, so today showed as open on the
    // strength of this morning's times and then listed none.
    const { utcToZoned } = require('../../utils/zonedTime');
    const now = utcToZoned(new Date(), 'Asia/Kolkata');
    const hh = Number(now.localTime.split(':')[0]);
    if (hh < 2) return; // needs an hour of today already behind us
    const h = hh - 1;
    const past = `${String((h % 12) || 12).padStart(2, '0')}:00 ${h >= 12 ? 'PM' : 'AM'}`;
    const tomorrow = utcToZoned(new Date(Date.now() + 864e5), 'Asia/Kolkata').localDate;
    const { user } = await makeDoctor();
    await DoctorAvailability.create({
      doctorId: user._id, availabilityType: 'same_slots',
      defaultSlots: [past], activeDates: [now.localDate, tomorrow]
    });
    const one = await request(server).get(`/api/sessions/doctors/${user._id}`);
    expect(one.body.openDates).not.toContain(now.localDate);
    expect(one.body.openDates).toContain(tomorrow);
  });
});

describe('the rule itself, outside a request', () => {
  const { bookabilityOf, bookableProfileFilter } = require('../../services/bookability');
  const full = { session20: 800, session40: 1500, session55: 2000, audio: { session20: 600, session40: 1200, session55: 1600 } };

  test('no profile, or a gap in the six prices: not bookable at all', () => {
    expect(bookabilityOf(null)).toEqual({ scheduled: false, instant: false });
    expect(bookabilityOf({ payoutApproved: true, pricing: { ...full, audio: { ...full.audio, session55: 0 } }, bookableUntil: new Date(Date.now() + 864e5) }))
      .toEqual({ scheduled: false, instant: false });
  });

  test('paid and priced but no dates ahead: instant only', () => {
    const now = new Date();
    expect(bookabilityOf({ payoutApproved: true, pricing: full, bookableUntil: new Date(now - 864e5) }, { now }))
      .toEqual({ scheduled: false, instant: true });
    expect(bookabilityOf({ payoutApproved: true, pricing: full })).toEqual({ scheduled: false, instant: true });
  });

  test('the query form asks for all six prices, and dates only when booking a time', () => {
    const scheduled = bookableProfileFilter();
    expect(scheduled.payoutApproved).toBe(true);
    expect(Object.values(scheduled).filter((v) => v && v.$gt === 0)).toHaveLength(6);
    expect(scheduled.bookableUntil.$gte).toBeInstanceOf(Date);
    expect(bookableProfileFilter({ scheduled: false }).bookableUntil).toBeUndefined();
  });

  test('a doctor with no calendar yet gets one with the default times, once', async () => {
    const { getOrCreateAvailability } = require('../../services/session.service');
    const { user } = await makeDoctor();
    const first = await getOrCreateAvailability(user._id);
    expect(first.defaultSlots).toEqual(['09:00 AM', '11:00 AM', '03:00 PM', '05:00 PM']);
    const again = await getOrCreateAvailability(user._id);
    expect(String(again._id)).toBe(String(first._id));
    expect(await DoctorAvailability.countDocuments({ doctorId: user._id })).toBe(1);
  });
});
