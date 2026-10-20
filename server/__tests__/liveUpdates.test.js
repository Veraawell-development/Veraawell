/**
 * services/liveUpdates.js: who is told what, in one place.
 */
require('./support/env');
const live = require('../services/liveUpdates');

function fakeIo() {
  const sent = [];
  const ns = { to: (room) => ({ emit: (event, data) => sent.push({ ns: '/data', room, event, data }) }), adapter: { rooms: new Map() } };
  return { sent, of: () => ns, to: (room) => ({ emit: (event, data) => sent.push({ ns: '/', room, event, data }) }) };
}

test('a cancellation reaches both people, the call room and the directory, saying who cancelled', () => {
  const io = fakeIo();
  live.sessionCancelled(io, { _id: 's1', patientId: 'p1', doctorId: { _id: 'd1' } }, { byRole: 'admin', refundAmount: 900, message: 'by support' });
  const cancelled = io.sent.filter((e) => e.event === 'session:cancelled');
  expect(cancelled.map((e) => `${e.ns}${e.room}`).sort()).toEqual(['/data' + 'user:d1', '/data' + 'user:p1', '/' + 's1'].sort());
  expect(cancelled[0].data).toMatchObject({ sessionId: 's1', byRole: 'admin', cancelledBy: 'admin', refundAmount: 900, message: 'by support', status: 'cancelled' });
  expect(io.sent.find((e) => e.event === 'doctor:availability')).toMatchObject({ room: 'role:patient', data: { doctorId: 'd1' } });
});

test('a booking sends only what the screens need — no fees, payment ids or emails', () => {
  const io = fakeIo();
  live.sessionBooked(io, {
    _id: 's1', sessionType: 'immediate', acceptanceDeadline: new Date('2026-10-20T10:02:00Z'), duration: 20, callMode: 'Video Calling',
    patientId: { _id: 'p1', firstName: 'Asha', lastName: 'R', email: 'a@x' }, doctorId: { _id: 'd1', firstName: 'D', lastName: 'P', email: 'd@x' },
    platformFee: 200, doctorEarnings: 800, paymentId: 'pay_x', razorpayOrderId: 'order_x'
  });
  const booked = io.sent.filter((e) => e.event === 'session:booked');
  expect(booked.map((e) => e.room).sort()).toEqual(['user:d1', 'user:p1']);
  const json = JSON.stringify(booked[0].data);
  for (const leak of ['platformFee', 'doctorEarnings', 'pay_x', 'order_x', 'a@x', 'd@x']) expect(json).not.toContain(leak);
  expect(booked[0].data.session).toMatchObject({ _id: 's1', sessionType: 'immediate', patientId: { _id: 'p1', firstName: 'Asha' } });
  expect(booked[0].data.acceptanceDeadline).toEqual(new Date('2026-10-20T10:02:00Z'));
});

test('clinical and payout updates go to the one person concerned', () => {
  const io = fakeIo();
  live.clinicalUpdated(io, 'p1', 'report');
  live.payoutUpdated(io, 'd1', 'paid');
  expect(io.sent).toEqual([
    { ns: '/data', room: 'user:p1', event: 'clinical:updated', data: { kind: 'report' } },
    { ns: '/data', room: 'user:d1', event: 'payout:updated', data: { status: 'paid' } }
  ]);
});

test('no io (scripts, tests) or an emit error never throws', () => {
  expect(() => live.sessionCancelled(null, { _id: 's', patientId: 'p', doctorId: 'd' }, { byRole: 'system' })).not.toThrow();
  const broken = { of: () => { throw new Error('boom'); }, to: () => ({ emit() {} }) };
  expect(() => live.clinicalUpdated(broken, 'p', 'task')).not.toThrow();
});
