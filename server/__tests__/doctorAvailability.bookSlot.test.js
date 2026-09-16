/**
 * Integration test for the C11 fix: DoctorAvailability.bookSlot used to be a
 * read-check-push-save race (two concurrent bookings for the same slot could
 * both pass the in-memory "already booked?" check before either saved). This
 * test proves the atomic findOneAndUpdate-based rewrite actually prevents a
 * double-booking under real concurrency, against a real (in-memory) MongoDB —
 * a plain unit test calling the function once wouldn't catch this class of bug.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const DoctorAvailability = require('../models/doctorAvailability');

jest.setTimeout(60000);

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await DoctorAvailability.deleteMany({});
});

async function makeAvailabilityWithOneOpenSlot(doctorId) {
  return DoctorAvailability.create({
    doctorId,
    availabilityType: 'same_slots',
    defaultSlots: ['10:00 AM'],
    activeDates: ['2099-01-01'],
    bookedSlots: []
  });
}

describe('DoctorAvailability.bookSlot — atomicity', () => {
  test('two concurrent bookings for the same slot: exactly one succeeds', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await makeAvailabilityWithOneOpenSlot(doctorId);

    const sessionIdA = new mongoose.Types.ObjectId();
    const sessionIdB = new mongoose.Types.ObjectId();

    // Load the SAME slot from two independent document instances, simulating
    // two concurrent requests each fetching their own copy of the availability
    // doc before either writes — this is exactly the race window that used to
    // allow a double-booking.
    const [availA, availB] = await Promise.all([
      DoctorAvailability.findOne({ doctorId }),
      DoctorAvailability.findOne({ doctorId })
    ]);

    const [resultA, resultB] = await Promise.all([
      availA.bookSlot('2099-01-01', '10:00 AM', sessionIdA),
      availB.bookSlot('2099-01-01', '10:00 AM', sessionIdB)
    ]);

    // Exactly one of the two concurrent attempts must have won.
    const successes = [resultA, resultB].filter(Boolean).length;
    expect(successes).toBe(1);

    // And the database must reflect exactly one booking for that slot, not two.
    const finalDoc = await DoctorAvailability.findOne({ doctorId });
    const bookingsForSlot = finalDoc.bookedSlots.filter(
      b => b.date === '2099-01-01' && b.time === '10:00 AM'
    );
    expect(bookingsForSlot).toHaveLength(1);
  });

  test('booking a slot that does not exist in configured availability fails cleanly', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await makeAvailabilityWithOneOpenSlot(doctorId);
    const avail = await DoctorAvailability.findOne({ doctorId });

    const booked = await avail.bookSlot('2099-01-01', '11:00 AM', new mongoose.Types.ObjectId());
    expect(booked).toBe(false);
  });

  test('booking an already-booked slot (sequentially) returns false, does not throw', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await makeAvailabilityWithOneOpenSlot(doctorId);

    const avail1 = await DoctorAvailability.findOne({ doctorId });
    const first = await avail1.bookSlot('2099-01-01', '10:00 AM', new mongoose.Types.ObjectId());
    expect(first).toBe(true);

    const avail2 = await DoctorAvailability.findOne({ doctorId });
    const second = await avail2.bookSlot('2099-01-01', '10:00 AM', new mongoose.Types.ObjectId());
    expect(second).toBe(false);
  });
});

/**
 * Legacy bookedSlots rows predate the `slotKey` field, which the schema now
 * marks `required: true`. Mongoose validates the WHOLE document on save(), so
 * those rows failed validation on every later write — including writes that
 * never touched them. Verified against the live database: a doctor with three
 * such rows got HTTP 400 from POST /api/availability/save every single time,
 * and therefore could not extend their calendar at all. Their availability
 * silently expired and they became unbookable.
 *
 * getAvailableSlotsForDate already read through a `slotKey || safeSlotKey(...)`
 * fallback, so the READ path tolerated these rows; only the write path did not.
 * The pre('validate') hook now derives the missing key, closing that asymmetry.
 */
describe('DoctorAvailability — legacy bookedSlots without a slotKey', () => {
  /** Insert straight through the driver, bypassing validation — how they got there. */
  async function insertLegacyRow(doctorId, sessionId) {
    await mongoose.connection.collection('doctoravailabilities').insertOne({
      doctorId,
      availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM'],
      activeDates: ['2099-01-01'],
      customAvailability: [],
      bookedSlots: [
        { date: '2099-01-01', time: '10:00 AM', sessionId },
        { date: '2099-01-02', time: '08:00 PM', sessionId: new mongoose.Types.ObjectId() }
      ]
    });
  }

  test('the fixture really is missing slotKey, or the rest of this proves nothing', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await insertLegacyRow(doctorId, new mongoose.Types.ObjectId());
    const raw = await mongoose.connection.collection('doctoravailabilities').findOne({ doctorId });
    expect(raw.bookedSlots).toHaveLength(2);
    expect(raw.bookedSlots[0].slotKey).toBeUndefined();
  });

  test('an unrelated save no longer fails validation, and heals the rows', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    await insertLegacyRow(doctorId, new mongoose.Types.ObjectId());

    // Exactly what controllers/availability.controller.js saveAvailability does.
    const availability = await DoctorAvailability.findOne({ doctorId });
    availability.activeDates = ['2099-01-01', '2099-02-02'];
    await expect(availability.save()).resolves.toBeDefined();

    const after = await DoctorAvailability.findOne({ doctorId });
    expect(after.activeDates).toContain('2099-02-02');
    expect(after.bookedSlots.map((b) => b.slotKey))
      .toEqual(['2099-01-01T10:00', '2099-01-02T20:00']);
  });

  test('releaseSlot can free a healed legacy row', async () => {
    // releaseSlot matches on slotKey, so before the fix a pre-slotKey booking
    // could never be released — cancelling its session left the slot blocked
    // forever with only a warning in the log.
    const doctorId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    await insertLegacyRow(doctorId, sessionId);

    const availability = await DoctorAvailability.findOne({ doctorId });
    await availability.save(); // heal

    const fresh = await DoctorAvailability.findOne({ doctorId });
    await expect(fresh.releaseSlot('2099-01-01', '10:00 AM', sessionId)).resolves.toBe(true);
    expect(fresh.bookedSlots.map((b) => b.slotKey)).toEqual(['2099-01-02T20:00']);
  });

  test('a slot whose date or time cannot be parsed is still rejected, not invented', async () => {
    // Deriving a key from unparseable input would fabricate an identity that
    // releaseSlot could never match. Failing loudly is the correct outcome.
    const doctorId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('doctoravailabilities').insertOne({
      doctorId,
      availabilityType: 'same_slots',
      defaultSlots: [],
      activeDates: [],
      customAvailability: [],
      bookedSlots: [{ date: 'not-a-date', time: 'half past nine', sessionId: new mongoose.Types.ObjectId() }]
    });

    const availability = await DoctorAvailability.findOne({ doctorId });
    availability.activeDates = ['2099-03-03'];
    await expect(availability.save()).rejects.toThrow(/slotKey/);
  });

  test('a row that already has a slotKey is left exactly as it is', async () => {
    const doctorId = new mongoose.Types.ObjectId();
    const sessionId = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('doctoravailabilities').insertOne({
      doctorId,
      availabilityType: 'same_slots',
      defaultSlots: ['10:00 AM'],
      activeDates: ['2099-01-01'],
      customAvailability: [],
      // Deliberately inconsistent with date/time: if the hook recomputed keys
      // it would overwrite this, and slot identity would shift under a booking
      // that is already live.
      bookedSlots: [{ date: '2099-01-01', time: '10:00 AM', slotKey: 'preexisting-key', sessionId }]
    });

    const availability = await DoctorAvailability.findOne({ doctorId });
    availability.activeDates = ['2099-01-01', '2099-04-04'];
    await availability.save();

    const after = await DoctorAvailability.findOne({ doctorId });
    expect(after.bookedSlots[0].slotKey).toBe('preexisting-key');
  });
});
