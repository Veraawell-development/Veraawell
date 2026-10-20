/**
 * Call statistics: the browsers report how a call went
 * (POST /api/sessions/:id/call-events), and the admin Calls tab reads it.
 */
require('../support/env');
const request = require('supertest');
const { startDb, stopDb, mountRoutes, tokenFor, adminTokenFor, makeUser, makeSession } = require('../helpers/harness');

jest.mock('../../services/email.service', () => new Proxy({}, { get: () => jest.fn().mockResolvedValue({ id: 'sink' }) }));

let app, patient, doctor, stranger, admin, CallLog, telemetry;

beforeAll(async () => {
  await startDb('call.telemetry');
  CallLog = require('../../models/callLog');
  telemetry = require('../../services/call/callTelemetry');
  patient = await makeUser('patient');
  doctor = await makeUser('doctor');
  stranger = await makeUser('patient');
  admin = await makeUser('admin');
  app = mountRoutes({ '/api/sessions': '../../routes/sessions', '/api/admin/calls': '../../routes/adminCalls.routes' });
});
afterAll(async () => { await stopDb(); });
beforeEach(() => telemetry._reset());

const post = (s, who, body) => request(app).post(`/api/sessions/${s._id}/call-events`).set('Authorization', `Bearer ${tokenFor(who)}`).send(body);

test('a party reports a call; the first connection is saved with its time and route', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t_${Date.now()}` });
  const at = new Date();
  expect((await post(s, patient, {
    mode: 'video', client: { browser: 'Safari 26', os: 'iOS 26' },
    events: [{ type: 'join-attempt', at }, { type: 'connected', at, data: { timeToConnectMs: 2300, candidateType: 'relay' } }]
  })).status).toBe(204);
  const log = await CallLog.findOne({ sessionId: s._id }).lean();
  expect(log.connectedAt).toBeTruthy();
  expect(log.relayUsed).toBe(true);
  expect(log.mode).toBe('video');
  expect(log.parties.patient).toMatchObject({ browser: 'Safari 26', os: 'iOS 26', candidateType: 'relay', timeToConnectMs: 2300 });
  expect(String(log.doctorId)).toBe(String(doctor._id));
});

test('failures are recorded with who and why', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t2_${Date.now()}` });
  expect((await post(s, doctor, { events: [{ type: 'failed', data: { reason: 'ice-failed', detail: 'no candidates' } }] })).status).toBe(204);
  const log = await CallLog.findOne({ sessionId: s._id }).lean();
  expect(log.failures[0]).toMatchObject({ party: 'doctor', reason: 'ice-failed', detail: 'no candidates' });
});

test('only the call\'s two people may report, and only known, bounded events', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t3_${Date.now()}` });
  expect((await post(s, stranger, { events: [] })).status).toBe(403);
  expect((await request(app).post(`/api/sessions/${s._id}/call-events`).send({ events: [] })).status).toBe(401);
  expect((await post(s, patient, { events: [{ type: 'rm -rf' }] })).status).toBe(400);
  expect((await post(s, patient, { events: Array.from({ length: 21 }, () => ({ type: 'reconnected' })) })).status).toBe(400);
});

test('the admin summary: success rate, relay share, median connect time, failures by reason', async () => {
  const s1 = await makeSession({ patient, doctor, paymentId: `pay_t4_${Date.now()}` });
  const s2 = await makeSession({ patient, doctor, paymentId: `pay_t5_${Date.now()}` });
  await post(s1, patient, { events: [{ type: 'connected', data: { timeToConnectMs: 1000, candidateType: 'host' } }] });
  await post(s2, patient, { events: [{ type: 'failed', data: { reason: 'ice-failed' } }] });
  const res = await request(app).get('/api/admin/calls/summary?days=7').set('Authorization', `Bearer ${adminTokenFor(admin)}`);
  expect(res.status).toBe(200);
  expect(res.body.calls).toBeGreaterThanOrEqual(2);
  expect(res.body.successRate).toBeLessThan(100);
  expect(res.body.failuresByReason['ice-failed']).toBeGreaterThanOrEqual(1);
  const list = await request(app).get('/api/admin/calls?failed=1').set('Authorization', `Bearer ${adminTokenFor(admin)}`);
  expect(list.body.calls.some((c) => String(c.sessionId) === String(s2._id))).toBe(true);
  // Not for patients or doctors.
  expect((await request(app).get('/api/admin/calls/summary').set('Authorization', `Bearer ${tokenFor(patient)}`)).status).toBeGreaterThanOrEqual(401);
});

test('heartbeats, recoveries and restarts add up; flushing at the end records why the call ended', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t6_${Date.now()}` });
  const id = String(s._id);
  telemetry.noteHealth(id, 'doctor', { candidateType: 'relay', rtt: 100, loss: 2 });
  telemetry.noteHealth(id, 'doctor', { candidateType: 'relay', rtt: 300, loss: 6 });
  await telemetry.noteEvents(id, 'patient', [
    { type: 'reconnected' }, { type: 'reconnected' }, { type: 'ice-restart' }, { type: 'server-restart' },
    { type: 'rejoin' }, { type: 'ice-stuck' }, { type: 'quality', data: { level: 2 } }, { type: 'peer-left' },
  ], { client: { browser: 'Chrome', os: 'Android' }, mode: 'voice' });
  await telemetry.flush(id, 'room-closed');
  const log = await CallLog.findOne({ sessionId: s._id }).lean();
  expect(log).toMatchObject({ reconnects: 2, iceRestarts: 1, serverRestarts: 1, attempts: 1, relayUsed: true, mode: 'voice', endReason: 'room-closed' });
  expect(log.quality).toMatchObject({ rttSumMs: 400, lossPct: 6, samples: 2 });
  expect(log.parties.doctor.candidateType).toBe('relay');
  expect(log.parties.patient).toMatchObject({ browser: 'Chrome', os: 'Android' });
  expect(log.failures.map((f) => f.reason)).toContain('ice-stuck');
  expect(log.endedAt).toBeTruthy();
});

test('a server restart saves every call in progress, and the earliest join and connection win across saves', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t7_${Date.now()}` });
  const id = String(s._id);
  const early = new Date(Date.now() - 60_000);
  await telemetry.noteEvents(id, 'patient', [{ type: 'join-attempt', at: early }]);
  await telemetry.flushAll('server-restart');
  await telemetry.noteEvents(id, 'doctor', [{ type: 'join-attempt', at: new Date() }]);
  await telemetry.flushAll();
  const log = await CallLog.findOne({ sessionId: s._id }).lean();
  expect(new Date(log.firstJoinAt).getTime()).toBe(early.getTime());
  expect(log.attempts).toBe(2);
});

test('every event type the browser sends is accepted', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t8_${Date.now()}` });
  const events = telemetry.EVENT_TYPES.slice(0, 20).map((type) => ({ type }));
  expect((await post(s, patient, { events })).status).toBe(204);
});

test('one call in the admin list, and a call with no statistics', async () => {
  const s = await makeSession({ patient, doctor, paymentId: `pay_t9_${Date.now()}` });
  await post(s, doctor, { events: [{ type: 'connected', data: { timeToConnectMs: 900, candidateType: 'srflx' } }] });
  const one = await request(app).get(`/api/admin/calls/${s._id}`).set('Authorization', `Bearer ${adminTokenFor(admin)}`);
  expect(one.status).toBe(200);
  expect(one.body.call.parties.doctor.candidateType).toBe('srflx');
  const none = await request(app).get('/api/admin/calls/000000000000000000000000').set('Authorization', `Bearer ${adminTokenFor(admin)}`);
  expect(none.status).toBe(404);
  const all = await request(app).get('/api/admin/calls?limit=5').set('Authorization', `Bearer ${adminTokenFor(admin)}`);
  expect(all.status).toBe(200);
  expect(all.body.calls.length).toBeLessThanOrEqual(5);
});
