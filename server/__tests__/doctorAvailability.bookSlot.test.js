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
