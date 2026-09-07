/**
 * Fixture seeding, straight through Mongoose.
 *
 * Deliberately does NOT go through POST /api/auth/register. That path writes a
 * PendingUser carrying a bcrypt HASH of a 6-digit OTP (services/auth.service.js:133)
 * and only creates a real User once verify-signup succeeds — which is why
 * client/e2e/seed-test-users.js (register, then immediately log in) can never
 * produce a login-able account. Seeding the User collection directly is the only
 * way to get a deterministic, verified fixture set.
 *
 * Shared by __tests__/e2e/* (in-process) and scripts/e2e-stack.js (out-of-process)
 * so the Playwright fixtures and the supertest fixtures are the same objects.
 */

const PASSWORDS = {
  patient: 'TestPatient123!',
  doctor: 'TestDoctor123!',
  admin: 'TestAdmin123!',
  // Keyed by role, so every role the seeder creates needs an entry — a missing
  // one silently falls back to the patient password and the manifest then
  // advertises a credential that does not work.
  super_admin: 'TestAdmin123!'
};

/**
 * A doctor profile with every required field populated and a payout account
 * that is NOT synthetic — session.controller.js:87 rejects booking outright
 * when razorpayAccountId is absent or matches isSyntheticAccountId().
 */
async function makeDoctorProfile(userId, overrides = {}) {
  const DoctorProfile = require('../../models/doctorProfile');
  return DoctorProfile.create({
    userId,
    specialization: ['Clinical Psychologist'],
    experience: 8,
    qualification: ['MPhil Clinical Psychology'],
    languages: ['English', 'Hindi'],
    treatsFor: ['Anxiety', 'Depression'],
    type: 'Psychologist',
    modeOfSession: ['video', 'audio'],
    bio: 'Seeded fixture doctor.',
    pricing: {
      min: 800,
      max: 2000,
      session20: 800,
      session40: 1500,
      session55: 2000,
      audio: { session20: 600, session40: 1200, session55: 1600 }
    },
    razorpayAccountId: 'acc_live_seededfixture01',
    payoutSetupCompleted: true,
    razorpayOnboardingStatus: 'active',
    ...overrides
  });
}

/** A user whose password is bcrypt-hashed by the model's pre-save hook. */
async function makeUser(role, email, extra = {}) {
  const User = require('../../models/user');
  if (!PASSWORDS[role]) throw new Error(`seed: no password defined for role "${role}"`);
  return User.create({
    firstName: role === 'patient' ? 'E2E' : 'Dr',
    lastName: role.charAt(0).toUpperCase() + role.slice(1),
    email: email.toLowerCase(),
    username: email.toLowerCase(),
    password: PASSWORDS[role],
    role,
    approvalStatus: 'approved',
    status: 'active',
    isVerified: true,
    phoneNumber: '9000000001',
    ...extra
  });
}

/**
 * Publish availability for the next `days` days.
 *
 * activeDates matters: getAvailableSlotsForDate (models/doctorAvailability.js:108)
 * falls back to defaultSlots ONLY when the date is listed in activeDates, so a
 * profile without it exposes no bookable slots at all.
 */
async function makeAvailability(doctorId, days = 14) {
  const DoctorAvailability = require('../../models/doctorAvailability');
  const { utcToZoned } = require('../../utils/zonedTime');
  const { PLATFORM_TIMEZONE } = require('../../config/time');

  const activeDates = [];
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(Date.now() + i * 864e5);
    activeDates.push(utcToZoned(d, PLATFORM_TIMEZONE).localDate);
  }

  return DoctorAvailability.create({
    doctorId,
    availabilityType: 'same_slots',
    defaultSlots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM', '04:00 PM'],
    activeDates,
    customAvailability: [],
    bookedSlots: []
  });
}

/**
 * The full fixture set. Two patients and two doctors so that every
 * "stranger cannot touch this" case has a real counterparty to test with.
 */
async function seedAll() {
  const stamp = Date.now();
  const patientA = await makeUser('patient', `e2e.patient@veraawell.test`);
  const patientB = await makeUser('patient', `e2e.patient2@veraawell.test`);
  const doctorA = await makeUser('doctor', `e2e.doctor@veraawell.test`, { jobRole: 'Psychologist' });
  const doctorB = await makeUser('doctor', `e2e.doctor2@veraawell.test`, { jobRole: 'Psychologist' });
  const admin = await makeUser('admin', `e2e.admin@veraawell.test`);
  const superAdmin = await makeUser('super_admin', `e2e.superadmin@veraawell.test`);

  const profileA = await makeDoctorProfile(doctorA._id);
  const profileB = await makeDoctorProfile(doctorB._id);
  await makeAvailability(doctorA._id);
  await makeAvailability(doctorB._id);

  // One already-paid future session between patientA and doctorA.
  const Session = require('../../models/session');
  const { zonedToUtc, utcToZoned } = require('../../utils/zonedTime');
  const { PLATFORM_TIMEZONE } = require('../../config/time');
  const dayAfter = utcToZoned(new Date(Date.now() + 2 * 864e5), PLATFORM_TIMEZONE).localDate;

  const paidSession = await Session.create({
    patientId: patientA._id,
    doctorId: doctorA._id,
    // zonedToUtc takes 24-hour 'HH:mm', not a 12-hour slot label.
    startsAt: zonedToUtc(dayAfter, '10:00', PLATFORM_TIMEZONE),
    duration: 60,
    price: 1500,
    status: 'scheduled',
    paymentStatus: 'paid',
    paymentId: 'pay_seededrealpayment01',
    callMode: 'Video Calling'
  });

  return {
    stamp,
    passwords: PASSWORDS,
    patientA, patientB, doctorA, doctorB, admin, superAdmin,
    profileA, profileB, paidSession
  };
}

module.exports = { seedAll, makeUser, makeDoctorProfile, makeAvailability, PASSWORDS };
