/**
 * config/features.js — the switches that let a production problem be rolled
 * back from Render's environment settings.
 */

const features = require('../config/features');

const KEYS = ['SESSION_RULES', 'VIDEO_PROVIDER', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
const saved = {};

beforeEach(() => {
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const configureLiveKit = () => {
  process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
};

describe('sessionRulesVersion', () => {
  test('defaults to the rules production runs today', () => {
    expect(features.sessionRulesVersion()).toBe('v1');
  });

  test('reads the switch, case-insensitively, at call time', () => {
    process.env.SESSION_RULES = 'V2';
    expect(features.sessionRulesVersion()).toBe('v2');
    process.env.SESSION_RULES = 'v1';
    expect(features.sessionRulesVersion()).toBe('v1');
  });

  test('an unknown value falls back to the default rather than to anything new', () => {
    process.env.SESSION_RULES = 'v3';
    expect(features.sessionRulesVersion()).toBe('v1');
  });
});

describe('livekitConfig', () => {
  test('is disabled until all three credentials are present', () => {
    expect(features.livekitConfig().enabled).toBe(false);
    process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'key';
    expect(features.livekitConfig().enabled).toBe(false);
    process.env.LIVEKIT_API_SECRET = 'secret';
    expect(features.livekitConfig()).toEqual({
      enabled: true, url: 'wss://example.livekit.cloud', apiKey: 'key', apiSecret: 'secret'
    });
  });
});

describe('videoProvider', () => {
  test('defaults to the legacy call stack', () => {
    expect(features.videoProvider()).toBe('legacy');
  });

  test('LiveKit only when asked for and configured', () => {
    process.env.VIDEO_PROVIDER = 'livekit';
    expect(features.videoProvider()).toBe('legacy');
    configureLiveKit();
    expect(features.videoProvider()).toBe('livekit');
  });

  test('configured LiveKit is not used unless the switch says so', () => {
    configureLiveKit();
    expect(features.videoProvider()).toBe('legacy');
    process.env.VIDEO_PROVIDER = 'nonsense';
    expect(features.videoProvider()).toBe('legacy');
  });
});
