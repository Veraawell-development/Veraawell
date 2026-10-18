/**
 * Ending a session early takes both people (docs/SESSION_RULES.md, D8).
 *
 * One person asks, the other answers. What has to hold: nobody ends a session
 * alone (not by asking twice, not by answering their own request, not with a
 * request that has lapsed), a yes completes the session exactly once and
 * records why, a no changes nothing, and the HTTP endpoints and the call
 * socket's events give the same answers.
 */

require('../support/env');

const request = require('supertest');
const { startDb, stopDb, mountRoutes, tokenFor, makeUser, makeSession } = require('../helpers/harness');

jest.setTimeout(60000);

const mockSummary = jest.fn().mockResolvedValue({ id: 'sink' });
jest.mock('../../services/email.service', () => new Proxy({}, {
  get: (_t, name) => (name === 'sendDoctorSessionSummaryEmail' ? mockSummary : jest.fn().mockResolvedValue({ id: 'sink' }))
}));

const MIN = 60 * 1000;

let Session, attendance, ending, patient, doctor, stranger, app;

/** A session under way, both people in the call from its start. */
async function inCall({ startedMinutesAgo = 5, patientIn = true, doctorIn = true, ...overrides } = {}) {
  const s = await makeSession({ patient, doctor, hoursFromNow: -startedMinutesAgo / 60, duration: 20, ...overrides });
  const at = new Date(s.startsAt);
  if (patientIn) await attendance.recordJoin(s._id, 'patient', { at, source: 'socket' });
  if (doctorIn) await attendance.recordJoin(s._id, 'doctor', { at, source: 'socket' });
  return s;
}

/** A stand-in for socket.io that records every emit, by namespace and room. */
function fakeIo() {
  const sent = [];
  const target = (ns, room, except) => ({
    except: (id) => target(ns, room, id),
    emit: (event, data) => sent.push({ ns, room, except, event, data })
  });
  return {
    sent,
    to: (room) => target('/', room, null),
    of: (ns) => ({ to: (room) => target(ns, room, null) })
  };
}

const post = (path, who, body) => {
  let r = request(app).post(path);
  if (who) r = r.set('Authorization', `Bearer ${tokenFor(who)}`);
  return body === undefined ? r : r.send(body);
};

beforeAll(async () => {
  await startDb('consent-end');
  Session = require('../../models/session');
  attendance = require('../../services/attendance');
  ending = require('../../services/sessionEnding');
  patient = await makeUser('patient');
  doctor = await makeUser('doctor');
  stranger = await makeUser('patient');
  app = mountRoutes({ '/api/sessions': '../../routes/sessions' });
});

afterAll(async () => { await stopDb(); });

beforeEach(async () => {
  await Session.deleteMany({});
  mockSummary.mockClear();
});

describe('asking', () => {
  test('stamps the request and asks the other person — in the call and on their dashboard', async () => {
    const s = await inCall();
    const io = fakeIo();
    const res = await ending.requestEnd(s._id, 'patient', { io });
    expect(res.ended).toBe(false);
    expect(res.expiresAt).toBeInstanceOf(Date);

    const doc = await Session.findById(s._id).lean();
    expect(doc.endConsent.requestedBy).toBe('patient');
    expect(doc.status).toBe('scheduled');

    const room = io.sent.find((e) => e.event === 'request-end-session');
    expect(room).toMatchObject({ ns: '/', room: String(s._id), data: { requestedByRole: 'patient' } });
    const dash = io.sent.find((e) => e.event === 'session:end-requested');
    expect(dash).toMatchObject({ ns: '/data', room: `user:${doctor._id}`, data: { sessionId: String(s._id), by: 'patient' } });
  });

  test('is refused when the other person is not in the call — that is Leave', async () => {
    const s = await inCall({ doctorIn: false });
    await expect(ending.requestEnd(s._id, 'patient')).rejects.toThrow(/isn't in the call/);
    const doc = await Session.findById(s._id).lean();
    expect(doc.endConsent && doc.endConsent.requestedBy).toBeFalsy();
  });

  test('is refused to someone not in the call themselves', async () => {
    const s = await inCall({ patientIn: false });
    await expect(ending.requestEnd(s._id, 'patient')).rejects.toThrow(/Join the call first/);
  });

  test('is refused once the session is over', async () => {
    const s = await inCall();
    await Session.updateOne({ _id: s._id }, { $set: { status: 'completed' } });
    await expect(ending.requestEnd(s._id, 'doctor')).rejects.toThrow(/already ended/);
  });

  test('asking twice is still only asking', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'doctor');
    const again = await ending.requestEnd(s._id, 'doctor');
    expect(again.ended).toBe(false);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('both pressing End at once is agreement', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'patient');
    const res = await ending.requestEnd(s._id, 'doctor');
    expect(res.ended).toBe(true);
    const doc = await Session.findById(s._id).lean();
    expect(doc.status).toBe('completed');
    expect(doc.outcome).toMatchObject({ code: 'ended_by_consent', by: 'doctor' });
  });
});

describe('answering', () => {
  test('yes completes the session, records why, closes the stays and tells everyone', async () => {
    const s = await inCall({ startedMinutesAgo: 7 });
    await ending.requestEnd(s._id, 'patient');
    const io = fakeIo();
    const res = await ending.respondToEnd(s._id, 'doctor', true, { io });
    expect(res).toEqual({ ended: true });

    const doc = await Session.findById(s._id).lean();
    expect(doc.status).toBe('completed');
    expect(doc.paymentStatus).toBe('paid');
    expect(doc.callStatus).toBe('completed');
    expect(doc.outcome).toMatchObject({ code: 'ended_by_consent', by: 'doctor' });
    expect(doc.endConsent.agreedAt).toBeInstanceOf(Date);
    expect(doc.actualDuration).toBe(7);
    expect(doc.attendance.every((a) => a.leftAt)).toBe(true);

    const events = io.sent.map((e) => e.event);
    expect(events).toEqual(expect.arrayContaining(['confirm-end-session', 'session-ended', 'session:ended']));
    const dash = io.sent.filter((e) => e.event === 'session:ended').map((e) => e.room).sort();
    expect(dash).toEqual([`user:${doctor._id}`, `user:${patient._id}`].sort());
    expect(mockSummary).toHaveBeenCalledTimes(1);
  });

  test('no clears the request and the call carries on', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'doctor');
    const io = fakeIo();
    expect(await ending.respondToEnd(s._id, 'patient', false, { io })).toEqual({ ended: false });

    const doc = await Session.findById(s._id).lean();
    expect(doc.status).toBe('scheduled');
    expect(doc.endConsent.requestedBy).toBeNull();
    expect(io.sent.find((e) => e.event === 'confirm-end-session').data).toEqual({ agree: false, confirmedByRole: 'patient' });
    expect(io.sent.find((e) => e.event === 'session:end-declined').room).toBe(`user:${doctor._id}`);
  });

  test('nobody can answer their own request', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'patient');
    await expect(ending.respondToEnd(s._id, 'patient', true)).rejects.toThrow(/no request/);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('a lapsed request ends nothing', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'patient', { now: new Date(Date.now() - 3 * MIN) });
    await expect(ending.respondToEnd(s._id, 'doctor', true)).rejects.toThrow(/expired/);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('without a request there is nothing to answer', async () => {
    const s = await inCall();
    await expect(ending.respondToEnd(s._id, 'doctor', true)).rejects.toThrow(/no request/);
  });

  test('a double yes completes once and the repeat is told it already ended', async () => {
    const s = await inCall();
    await ending.requestEnd(s._id, 'patient');
    const results = await Promise.all([
      ending.respondToEnd(s._id, 'doctor', true).catch((e) => e),
      ending.respondToEnd(s._id, 'doctor', true).catch((e) => e)
    ]);
    for (const r of results) expect(r).toMatchObject({ ended: true });
    expect((await Session.findById(s._id)).status).toBe('completed');
    expect(mockSummary).toHaveBeenCalledTimes(1);
  });
});

describe('the HTTP endpoints', () => {
  test('ask, then agree: the session is completed', async () => {
    const s = await inCall();
    const asked = await post(`/api/sessions/${s._id}/end-request`, patient);
    expect(asked.status).toBe(200);
    expect(asked.body).toMatchObject({ success: true, ended: false });

    const agreed = await post(`/api/sessions/${s._id}/end-response`, doctor, { agree: true });
    expect(agreed.status).toBe(200);
    expect(agreed.body).toMatchObject({ success: true, ended: true });
    expect((await Session.findById(s._id)).status).toBe('completed');
  });

  test('both asking is agreement; a no from the other side keeps it going', async () => {
    const s = await inCall();
    await post(`/api/sessions/${s._id}/end-request`, doctor);
    const no = await post(`/api/sessions/${s._id}/end-response`, patient, { agree: false });
    expect(no.status).toBe(200);
    expect(no.body).toMatchObject({ ended: false, message: 'The session continues.' });
    expect((await Session.findById(s._id)).status).toBe('scheduled');

    await post(`/api/sessions/${s._id}/end-request`, doctor);
    const both = await post(`/api/sessions/${s._id}/end-request`, patient);
    expect(both.body).toMatchObject({ ended: true, message: 'Session ended.' });
    expect((await Session.findById(s._id)).status).toBe('completed');
  });

  test('asking alone is a clear 409', async () => {
    const s = await inCall({ doctorIn: false });
    const res = await post(`/api/sessions/${s._id}/end-request`, patient);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/use Leave/);
  });

  test('the answer must be a yes or a no', async () => {
    const s = await inCall();
    await post(`/api/sessions/${s._id}/end-request`, patient);
    for (const body of [{}, { agree: 'yes' }, { agree: 1 }]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await post(`/api/sessions/${s._id}/end-response`, doctor, body);
      expect(res.status).toBe(400);
    }
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });

  test('outsiders are turned away and nothing moves', async () => {
    const s = await inCall();
    expect((await post(`/api/sessions/${s._id}/end-request`, stranger)).status).toBe(403);
    expect((await post(`/api/sessions/${s._id}/end-request`, null)).status).toBe(401);
    await post(`/api/sessions/${s._id}/end-request`, patient);
    expect((await post(`/api/sessions/${s._id}/end-response`, stranger, { agree: true })).status).toBe(403);
    expect((await Session.findById(s._id)).status).toBe('scheduled');
  });
});
