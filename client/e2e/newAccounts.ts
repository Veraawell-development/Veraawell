/**
 * Fresh therapist accounts for specs that must not share a seeded doctor.
 *
 * The seeded doctors are used by many specs at once (online toggles, booked
 * slots, prices); a spec that goes online, or books a time, would race them.
 * Each account here is new, signs in with the e2e doctor password, and is
 * named "<first> <Label><stamp>" so a spec can find its card on screen.
 */
import { BrowserContext, APIRequestContext, expect } from '@playwright/test';
import { fixtures } from './fixtures';
import { db, ObjectId, apiSend, stamp } from './adminHelpers';

/** Every account made here, so a spec can remove what it created (see removeNewAccounts). */
const created: Array<InstanceType<typeof ObjectId>> = [];

/**
 * Deletes the accounts this spec file created and everything that hangs off
 * them. Other specs count the directory ("2 available") and list a seeded
 * patient's therapists; leftovers from here broke both.
 */
export async function removeNewAccounts() {
  if (created.length === 0) return;
  const database = await db();
  const ids = created.splice(0);
  const sessions = await database.collection('sessions')
    .find({ $or: [{ doctorId: { $in: ids } }, { patientId: { $in: ids } }] }, { projection: { _id: 1 } }).toArray();
  const sessionIds = sessions.map((x: { _id: unknown }) => x._id);
  await Promise.all([
    database.collection('sessions').deleteMany({ _id: { $in: sessionIds } }),
    database.collection('reports').deleteMany({ $or: [{ doctorId: { $in: ids } }, { patientId: { $in: ids } }] }),
    database.collection('tasks').deleteMany({ $or: [{ doctorId: { $in: ids } }, { patientId: { $in: ids } }] }),
    database.collection('conversations').deleteMany({ 'participants.userId': { $in: ids } }),
    database.collection('doctorprofiles').deleteMany({ userId: { $in: ids } }),
    database.collection('doctoravailabilities').deleteMany({ doctorId: { $in: ids } }),
    database.collection('users').deleteMany({ _id: { $in: ids } }),
  ]);
}

/** An approved doctor account with no profile yet. */
export async function createNewDoctor(label = 'Onboard', firstName = 'Nova') {
  const database = await db();
  const seeded = await database.collection('users').findOne({ _id: new ObjectId(fixtures().users.doctorB.id) });
  const id = stamp();
  const userId = new ObjectId();
  const email = `e2e.newdoc.${id}@veraawell.test`;
  const now = new Date();
  await database.collection('users').insertOne({
    _id: userId,
    firstName,
    lastName: `${label}${id}`,
    email,
    username: email,
    password: seeded.password,
    role: 'doctor',
    approvalStatus: 'approved',
    status: 'active',
    isVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  created.push(userId);
  return { userId, id: String(userId), email, password: fixtures().users.doctorB.password, lastName: `${label}${id}` };
}

export const PRICES = { session20: 600, session40: 1000, session55: 1400, audio: { session20: 500, session40: 900, session55: 1200 } };

/** A doctor a patient can book: complete profile, all six prices, approved bank details. */
export async function createBookableDoctor(label = 'Bookable') {
  const doctor = await createNewDoctor(label, 'Tara');
  const now = new Date();
  await (await db()).collection('doctorprofiles').insertOne({
    userId: doctor.userId,
    type: 'Psychologist',
    experience: 7,
    specialization: ['Anxiety'],
    treatsFor: ['Anxiety'],
    qualification: ['MSc Psychology'],
    languages: ['English'],
    modeOfSession: ['Video Call', 'Audio Call'],
    pricing: { ...PRICES, min: 500, max: 1400 },
    profileImage: '',
    bio: 'E2E therapist.',
    payoutApproved: true,
    payoutApprovedAt: now,
    payoutBankStatus: 'approved',
    createdAt: now,
    updatedAt: now,
  });
  return doctor;
}

/** An IST calendar day `daysAhead` from now, as the availability API stores it. */
export function istDay(daysAhead: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + daysAhead * 864e5));
}

/** Publishes open dates as the signed-in doctor, the way Manage Calendar does. */
export async function publishDates(context: BrowserContext, days = [2, 3, 4], slots = ['10:00 AM', '11:00 AM', '04:00 PM']) {
  const res = await apiSend(context.request as unknown as APIRequestContext, 'POST', '/availability/save', {
    availabilityType: 'same_slots', defaultSlots: slots, activeDates: days.map(istDay), customAvailability: []
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

/** A patient with a complete profile and an emergency contact, and no history. */
export async function createNewPatient(label = 'Fresh') {
  const database = await db();
  const seeded = await database.collection('users').findOne({ _id: new ObjectId(fixtures().users.patientB.id) });
  const id = stamp();
  const userId = new ObjectId();
  const email = `e2e.newpat.${id}@veraawell.test`;
  const now = new Date();
  await database.collection('users').insertOne({
    _id: userId,
    firstName: 'Pia',
    lastName: `${label}${id}`,
    email,
    username: email,
    password: seeded.password,
    role: 'patient',
    status: 'active',
    isVerified: true,
    profileCompleted: true,
    dateOfBirth: new Date('1995-04-12'),
    gender: 'female',
    phoneNumber: '9876543210',
    emergencyContact: { name: 'Asha', phone: '+919876543211', relationship: 'Sister' },
    createdAt: now,
    updatedAt: now,
  });
  created.push(userId);
  return { userId, id: String(userId), email, password: fixtures().users.patientB.password, lastName: `${label}${id}` };
}

/** Saves a weekly calendar as the signed-in doctor: the same times on the given weekdays (0 = Sunday). */
export async function publishWeekly(context: BrowserContext, { weekdays = [0, 1, 2, 3, 4, 5, 6], slots = ['10:00 AM', '11:00 AM'], offDates = [] as string[] } = {}) {
  const res = await apiSend(context.request as unknown as APIRequestContext, 'POST', '/availability/save', {
    availabilityType: 'weekly',
    weeklySlots: weekdays.map((weekday) => ({ weekday, slots })),
    offDates,
    customAvailability: [],
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
}
