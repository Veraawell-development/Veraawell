/** Shape checks for call signalling events, and the per-socket rate limit. */
const p = require('../services/call/callPayloads');
const { createBucket } = require('../utils/tokenBucket');

const id = '64b7f0c2a1b2c3d4e5f60718';

test('join needs a session id, protocol and page instance', () => {
  expect(p.join({ sessionId: id, protocol: 2, instanceId: 'abc' })).toBeNull();
  expect(p.join({ sessionId: 'nope', protocol: 2, instanceId: 'abc' })).toMatch(/sessionId/);
  expect(p.join({ sessionId: id, instanceId: 'abc' })).toMatch(/protocol/);
  expect(p.join({ sessionId: id, protocol: 2, instanceId: '' })).toMatch(/instanceId/);
  expect(p.join({ sessionId: id, protocol: 2, instanceId: 'a', client: { browser: 'x'.repeat(61) } })).toMatch(/too long/);
});

test('signal: exactly one of description or candidate, bounded', () => {
  expect(p.signal({ sessionId: id, epoch: 1, description: { type: 'offer', sdp: 'v=0' } })).toBeNull();
  expect(p.signal({ sessionId: id, epoch: 1, description: { type: 'rollback' } })).toBeNull();
  expect(p.signal({ sessionId: id, epoch: 1, candidate: null })).toBeNull();
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 } })).toBeNull();
  expect(p.signal({ sessionId: id, epoch: 1 })).toMatch(/exactly one/);
  expect(p.signal({ sessionId: id, epoch: 1, description: { type: 'hack', sdp: 'x' } })).toMatch(/type/);
  expect(p.signal({ sessionId: id, epoch: 1, description: { type: 'offer', sdp: 'x'.repeat(p.MAX_SDP + 1) } })).toMatch(/too large/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'x', sdpMLineIndex: 99 } })).toMatch(/sdpMLineIndex/);
  expect(p.signal({ sessionId: id, description: { type: 'offer', sdp: 'v' } })).toMatch(/epoch/);
});

test('media health, media state, prep data, leave', () => {
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: false, candidateType: 'relay', rtt: 120, loss: 2 })).toBeNull();
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: false, candidateType: 'bogus' })).toMatch(/candidateType/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: 'yes', videoFlowing: false })).toMatch(/required/);
  expect(p.mediaState({ sessionId: id, audio: true, video: false })).toBeNull();
  expect(p.mediaState({ sessionId: id, audio: true })).toMatch(/required/);
  expect(p.prepData({ sessionId: id, tags: ['calm'] })).toBeNull();
  expect(p.prepData({ sessionId: id, tags: Array(21).fill('x') })).toMatch(/tags/);
  expect(p.leave({ sessionId: id, reason: 'user' })).toBeNull();
});

test('token bucket: a burst, then the refill rate', () => {
  let t = 0;
  const b = createBucket({ perSec: 2, burst: 3 }, () => t);
  expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false]);
  t = 500;
  expect(b.take()).toBe(true);
  expect(b.take()).toBe(false);
});

test('every refusal has a message (the rest of the shapes)', () => {
  // join
  expect(p.join({ sessionId: id, protocol: 2, instanceId: 'a', client: 'x' })).toMatch(/client/);
  expect(p.join(null)).toMatch(/sessionId/);
  // signal
  expect(p.signal({ sessionId: id, epoch: 1, description: null })).toMatch(/type/);
  expect(p.signal({ sessionId: id, epoch: 1, description: { type: 'answer' } })).toMatch(/sdp/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: 'text' })).toMatch(/object/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: {} })).toMatch(/candidate\.candidate/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'x'.repeat(p.MAX_CANDIDATE + 1) } })).toMatch(/too large/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'c', sdpMid: 'x'.repeat(33) } })).toMatch(/sdpMid/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'c', sdpMLineIndex: 1.5 } })).toMatch(/sdpMLineIndex/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: 'c', usernameFragment: 'u'.repeat(65) } })).toMatch(/usernameFragment/);
  expect(p.signal({ sessionId: id, epoch: 1, candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0, usernameFragment: 'abc' } })).toBeNull();
  expect(p.signal({ sessionId: 'x', epoch: 1, candidate: null })).toMatch(/sessionId/);
  // media health
  expect(p.mediaHealth({ sessionId: 'x' })).toMatch(/sessionId/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: true, rtt: -1 })).toMatch(/rtt/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: true, rtt: 1e9 })).toMatch(/rtt/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: true, loss: 101 })).toMatch(/loss/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: true, iceState: 'x'.repeat(21) })).toMatch(/iceState/);
  expect(p.mediaHealth({ sessionId: id, audioFlowing: true, videoFlowing: true, candidateType: null, rtt: null, loss: null, iceState: 'connected' })).toBeNull();
  // media state, prep data, leave
  expect(p.mediaState({ sessionId: 'x' })).toMatch(/sessionId/);
  expect(p.mediaState({ sessionId: id, audio: true })).toMatch(/required/);
  expect(p.prepData({ sessionId: 'x' })).toMatch(/sessionId/);
  expect(p.prepData({ sessionId: id, tags: Array.from({ length: 21 }, () => 't') })).toMatch(/tags/);
  expect(p.prepData({ sessionId: id, tags: ['x'.repeat(41)] })).toMatch(/tags/);
  expect(p.leave({ sessionId: 'x' })).toMatch(/sessionId/);
  expect(p.leave({ sessionId: id, reason: 'r'.repeat(21) })).toMatch(/reason/);
  expect(p.leave({ sessionId: id })).toBeNull();
});

test('the socket origin guard: our sites and non-browser clients only', () => {
  const { originAllowed, buildIoOptions } = require('../config/socket');
  expect(originAllowed(undefined, ['https://veraawell.com'])).toBe(true);
  expect(originAllowed('https://veraawell.com/', ['https://veraawell.com'])).toBe(true);
  expect(originAllowed('https://evil.example', ['https://veraawell.com'])).toBe(false);
  const opts = buildIoOptions({ allowedOrigins: ['https://veraawell.com'] });
  const verdict = (origin) => new Promise((resolve) => opts.allowRequest({ headers: origin ? { origin } : {} }, (err, ok) => resolve(ok)));
  return Promise.all([verdict('https://evil.example'), verdict(undefined)]).then(([bad, none]) => {
    expect(typeof opts.allowRequest).toBe('function');
    expect(none).toBe(true);
    expect(bad).toBe(false);
  });
});
