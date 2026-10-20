/**
 * The attendance record: who was in a session's call, and when.
 *
 * Everything the session rules decide — late, absent, refund, the real end
 * time — is read from these intervals, so the properties that matter are the
 * ones a real call produces by accident: two tabs, a reconnect, a join racing
 * another join, a leave arriving out of order, a server restart mid-call, and
 * sessions that were already under way when attendance started being recorded.
 */

require('../support/env');

const mongoose = require('mongoose');
const { connectDb, disconnectDb } = require('../support/db');

jest.setTimeout(60000);

const MIN = 60 * 1000;

let Session, attendance;
let patientId, doctorId;

/** A paid scheduled session starting `startOffsetMin` minutes from `base`. */
async function liveSession({ base = new Date(), startOffsetMin = 0, duration = 20, ...overrides } = {}) {
  return Session.create({
    patientId, doctorId,
    startsAt: new Date(base.getTime() + startOffsetMin * MIN),
    duration, price: 1000,
    status: 'scheduled', paymentStatus: 'paid',
    ...overrides
  });
}

const reload = (id) => Session.findById(id).lean();
const at = (session, minutes) => new Date(new Date(session.startsAt).getTime() + minutes * MIN);

/** A stand-in for socket.io that records what reached each user room. */
function fakeIo() {
  const sent = [];
  return {
    sent,
    of: () => ({ to: (room) => ({ emit: (event, data) => sent.push({ room, event, data }) }) })
  };
}

beforeAll(async () => {
  await connectDb('attendance');
  Session = require('../../models/session');
  attendance = require('../../services/attendance');
  patientId = new mongoose.Types.ObjectId();
  doctorId = new mongoose.Types.ObjectId();
});

afterAll(async () => { await disconnectDb(); });

beforeEach(async () => { await Session.deleteMany({}); });

describe('recordJoin', () => {
  test('opens one stay and sets the first-join flags', async () => {
    const s = await liveSession();
    const res = await attendance.recordJoin(s._id, 'patient', { at: at(s, 1), source: 'socket' });
    expect(res).toEqual({ opened: true });

    const doc = await reload(s._id);
    expect(doc.attendance).toHaveLength(1);
    expect(doc.attendance[0]).toMatchObject({ role: 'patient', leftAt: null, source: 'socket' });
    expect(doc.attendance[0].joinedAt).toEqual(at(s, 1));
    expect(doc.patientJoined).toBe(true);
    expect(doc.patientJoinedAt).toEqual(at(s, 1));
    expect(doc.doctorJoined).toBe(false);
  });

  test('a second join while already in (another tab) is a no-op', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'socket' });
    const again = await attendance.recordJoin(s._id, 'doctor', { at: at(s, 2), source: 'socket' });
    expect(again).toEqual({ opened: false });

    const doc = await reload(s._id);
    expect(doc.attendance).toHaveLength(1);
    expect(doc.doctorJoinedAt).toEqual(at(s, 0));
  });

  test('concurrent joins for the same person open exactly one stay', async () => {
    const s = await liveSession();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => attendance.recordJoin(s._id, 'patient', { at: at(s, 1), source: 'socket' }))
    );
    expect(results.filter((r) => r.opened)).toHaveLength(1);
    const doc = await reload(s._id);
    expect(doc.attendance.filter((a) => a.role === 'patient' && a.leftAt === null)).toHaveLength(1);
  });

  test('patient and doctor each get their own stay', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 1), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.attendance.map((a) => a.role).sort()).toEqual(['doctor', 'patient']);
  });

  test('a rejoin after leaving opens a new stay but never moves the first-join time', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    await attendance.recordLeave(s._id, 'patient', { at: at(s, 3), source: 'socket' });
    const res = await attendance.recordJoin(s._id, 'patient', { at: at(s, 4), source: 'socket' });
    expect(res.opened).toBe(true);

    const doc = await reload(s._id);
    expect(doc.attendance).toHaveLength(2);
    expect(doc.patientJoinedAt).toEqual(at(s, 0));
  });

  test('nothing is recorded on a session that is no longer live', async () => {
    for (const status of ['cancelled', 'completed', 'no-show', 'payment_pending']) {
      const s = await liveSession({ status });
      const res = await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
      expect(res.opened).toBe(false);
      const doc = await reload(s._id);
      expect(doc.attendance).toBeUndefined();
      expect(doc.patientJoined).toBe(false);
    }
  });

  test('rejects an unknown role', async () => {
    const s = await liveSession();
    await expect(attendance.recordJoin(s._id, 'admin', { source: 'socket' })).rejects.toThrow(/unknown role/);
  });

  test('keeps at most MAX_INTERVALS stays, dropping the oldest', async () => {
    const s = await liveSession();
    const many = Array.from({ length: attendance.MAX_INTERVALS }, (_, i) => ({
      role: 'patient', joinedAt: at(s, i * 0.01), leftAt: at(s, i * 0.01 + 0.005), source: 'socket'
    }));
    await Session.updateOne({ _id: s._id }, { $set: { attendance: many, patientJoined: true, patientJoinedAt: at(s, 0) } });

    await attendance.recordJoin(s._id, 'patient', { at: at(s, 5), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.attendance).toHaveLength(attendance.MAX_INTERVALS);
    expect(doc.attendance[doc.attendance.length - 1]).toMatchObject({ leftAt: null });
    expect(doc.attendance[0].joinedAt).toEqual(many[1].joinedAt);
  });
});

describe('recordLeave', () => {
  test('closes the open stay', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'socket' });
    const res = await attendance.recordLeave(s._id, 'doctor', { at: at(s, 7), source: 'socket' });
    expect(res).toEqual({ closed: true });
    const doc = await reload(s._id);
    expect(doc.attendance[0].leftAt).toEqual(at(s, 7));
  });

  test('a leave with nothing open is a no-op', async () => {
    const s = await liveSession();
    expect(await attendance.recordLeave(s._id, 'doctor', { at: at(s, 1), source: 'socket' })).toEqual({ closed: false });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 2), source: 'socket' });
    await attendance.recordLeave(s._id, 'doctor', { at: at(s, 3), source: 'socket' });
    expect(await attendance.recordLeave(s._id, 'doctor', { at: at(s, 4), source: 'socket' })).toEqual({ closed: false });
    const doc = await reload(s._id);
    expect(doc.attendance[0].leftAt).toEqual(at(s, 3));
  });

  test('a leave stamped before the open stay began (out of order) is ignored', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 5), source: 'backfill' });
    const res = await attendance.recordLeave(s._id, 'patient', { at: at(s, 4), source: 'backfill' });
    expect(res.closed).toBe(false);
    const doc = await reload(s._id);
    expect(doc.attendance[0].leftAt).toBeNull();
  });

  test('closes only that person\'s stay', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'socket' });
    await attendance.recordLeave(s._id, 'patient', { at: at(s, 2), source: 'socket' });
    const doc = await reload(s._id);
    const byRole = Object.fromEntries(doc.attendance.map((a) => [a.role, a]));
    expect(byRole.patient.leftAt).toEqual(at(s, 2));
    expect(byRole.doctor.leftAt).toBeNull();
  });
});

describe('the real end time', () => {
  test('a doctor joining late moves the end so the patient keeps their minutes', async () => {
    const s = await liveSession({ duration: 20 });
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    let doc = await reload(s._id);
    expect(doc.effectiveEndsAt).toBeNull();

    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 5), source: 'socket' });
    doc = await reload(s._id);
    expect(doc.effectiveEndsAt).toEqual(at(s, 25));
  });

  test('a doctor on time leaves the end where it was', async () => {
    const s = await liveSession({ duration: 20 });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, -3), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.effectiveEndsAt).toBeNull();
  });

  test('a late patient never moves the end', async () => {
    const s = await liveSession({ duration: 20 });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'socket' });
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 8), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.effectiveEndsAt).toBeNull();
  });

  test('a doctor reconnect does not move the end again', async () => {
    const s = await liveSession({ duration: 20 });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 4), source: 'socket' });
    await attendance.recordLeave(s._id, 'doctor', { at: at(s, 6), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 9), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.effectiveEndsAt).toEqual(at(s, 24));
  });
});

describe('sessions already under way before attendance was recorded', () => {
  test('a reconnect carries the legacy first join over, so a punctual doctor is not made late', async () => {
    const s = await liveSession({ duration: 20 });
    // Joined at the start under the old code: only the flag and timestamp.
    await Session.updateOne({ _id: s._id }, { $set: { doctorJoined: true, doctorJoinedAt: at(s, 0) } });

    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 12), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.attendance).toHaveLength(2);
    expect(doc.attendance[0]).toMatchObject({ role: 'doctor', source: 'backfill' });
    expect(doc.attendance[0].joinedAt).toEqual(at(s, 0));
    expect(doc.attendance[0].leftAt).toEqual(at(s, 12));
    expect(doc.attendance[1]).toMatchObject({ role: 'doctor', source: 'socket', leftAt: null });
    expect(doc.doctorJoinedAt).toEqual(at(s, 0));
    // First join was on time: the end did not move.
    expect(doc.effectiveEndsAt).toBeNull();
  });

  test('the carry-over happens once, never on later joins', async () => {
    const s = await liveSession();
    await Session.updateOne({ _id: s._id }, { $set: { patientJoined: true, patientJoinedAt: at(s, 0) } });
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 3), source: 'socket' });
    await attendance.recordLeave(s._id, 'patient', { at: at(s, 4), source: 'socket' });
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 5), source: 'socket' });
    const doc = await reload(s._id);
    expect(doc.attendance.filter((a) => a.source === 'backfill')).toHaveLength(1);
    expect(doc.attendance).toHaveLength(3);
  });
});

describe('closeAll and the restart cleanup', () => {
  test('closeAll closes every open stay', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'socket' });
    await attendance.closeAll(s._id, { at: at(s, 20) });
    const doc = await reload(s._id);
    expect(doc.attendance.every((a) => a.leftAt && a.leftAt.getTime() === at(s, 20).getTime())).toBe(true);
  });

  test('closeAll on a session with no attendance at all is a no-op, not an error', async () => {
    const s = await liveSession();
    await expect(attendance.closeAll(s._id, { at: at(s, 20) })).resolves.toEqual({ closed: false });
  });

  test('a restart closes socket stays the old process left open, and nothing else', async () => {
    const s = await liveSession();
    const other = await liveSession();
    const bootAt = at(s, 10);
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 0), source: 'backfill' });
    await attendance.recordJoin(other._id, 'patient', { at: at(s, 11), source: 'socket' });

    const closed = await attendance.closeStaleSocketStays({ bootAt });
    expect(closed).toBe(1);

    const doc = await reload(s._id);
    const byRole = Object.fromEntries(doc.attendance.map((a) => [a.role, a]));
    expect(byRole.patient.leftAt).toEqual(bootAt);
    expect(byRole.doctor.leftAt).toBeNull(); // LiveKit rooms don't restart with us
    const later = await reload(other._id);
    expect(later.attendance[0].leftAt).toBeNull(); // joined after the boot

    // The person reconnects and gets a fresh stay.
    expect((await attendance.recordJoin(s._id, 'patient', { at: at(s, 11), source: 'socket' })).opened).toBe(true);
  });
});

describe('telling both screens', () => {
  test('a join and a leave reach both parties; a late doctor also sends the new end', async () => {
    const io = fakeIo();
    const s = await liveSession({ duration: 20 });
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket', io });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 5), source: 'socket', io });
    await attendance.recordLeave(s._id, 'patient', { at: at(s, 6), source: 'socket', io });

    const rooms = [`user:${patientId}`, `user:${doctorId}`];
    const events = (name) => io.sent.filter((e) => e.event === name);

    expect(events('session:attendance')).toHaveLength(6);
    for (const e of events('session:attendance')) expect(rooms).toContain(e.room);

    const lastPresence = events('session:attendance').slice(-1)[0].data;
    expect(lastPresence).toMatchObject({ sessionId: String(s._id), present: { patient: false, doctor: true } });

    const timing = events('session:timing');
    expect(timing.map((e) => e.room).sort()).toEqual([...rooms].sort());
    expect(new Date(timing[0].data.effectiveEndsAt)).toEqual(at(s, 25));
  });

  test('no-ops tell nobody', async () => {
    const io = fakeIo();
    const s = await liveSession();
    await attendance.recordLeave(s._id, 'doctor', { at: at(s, 1), source: 'socket', io });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 1), source: 'socket' });
    await attendance.recordJoin(s._id, 'doctor', { at: at(s, 2), source: 'socket', io });
    expect(io.sent).toHaveLength(0);
  });

  test('snapshot reports who is in right now', async () => {
    const s = await liveSession();
    await attendance.recordJoin(s._id, 'patient', { at: at(s, 0), source: 'socket' });
    const snap = await attendance.snapshot(s._id, at(s, 1));
    expect(snap.present).toEqual({ patient: true, doctor: false });
    expect(snap.attendance).toHaveLength(1);
    expect(await attendance.snapshot(new mongoose.Types.ObjectId())).toBeNull();
  });
});
