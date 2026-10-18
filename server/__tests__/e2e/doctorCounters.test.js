/**
 * The doctor's late / no-show / cancellation counters (docs/SESSION_RULES.md,
 * D7): counted once per call, admin-only, and never in the way of the refund
 * or cancellation they ride along with.
 */

require('../support/env');

const mongoose = require('mongoose');
const { startDb, stopDb, makeUser } = require('../helpers/harness');

jest.setTimeout(60000);

let DoctorProfile, counters, doctor;

beforeAll(async () => {
  await startDb('doctor-counters');
  DoctorProfile = require('../../models/doctorProfile');
  counters = require('../../services/doctorCounters');
  doctor = await makeUser('doctor');
  await DoctorProfile.create({
    userId: doctor._id, specialization: ['Psychologist'], experience: 5, qualification: ['MA'],
    languages: ['English'], treatsFor: ['Anxiety'], type: 'Psychologist', pricing: { min: 800, max: 2000 }
  });
});

afterAll(async () => { await stopDb(); });

const read = () => DoctorProfile.findOne({ userId: doctor._id }).lean();

test('each kind moves its own counter by one', async () => {
  expect(await counters.increment(doctor._id, 'late')).toBe(true);
  expect(await counters.increment(doctor._id, 'no_show')).toBe(true);
  const p = await read();
  expect(p).toMatchObject({ lateCount: 1, noShowCount: 1, cancellationCount: 0 });
});

test('cancellations record when, and flag the third for an admin — once', async () => {
  const now = new Date('2026-10-19T05:00:00.000Z');
  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await counters.increment(doctor._id, 'cancel', { now });
  }
  const p = await read();
  expect(p.cancellationCount).toBe(4);
  expect(p.lastCancellationDate).toEqual(now);
  expect(p.cancellationWarningIssued).toBe(true);
});

test('concurrent increments are all counted', async () => {
  const before = (await read()).lateCount;
  await Promise.all(Array.from({ length: 10 }, () => counters.increment(doctor._id, 'late')));
  expect((await read()).lateCount).toBe(before + 10);
});

test('a doctor without a profile, or a failing write, never throws', async () => {
  expect(await counters.increment(new mongoose.Types.ObjectId(), 'late')).toBe(true);
  const spy = jest.spyOn(DoctorProfile, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('db down'); });
  expect(await counters.increment(doctor._id, 'late')).toBe(false);
  spy.mockRestore();
});

test('an unknown kind is a programming error', async () => {
  await expect(counters.increment(doctor._id, 'rude')).rejects.toThrow(/unknown kind/);
});
