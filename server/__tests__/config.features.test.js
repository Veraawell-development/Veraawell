/**
 * config/features.js — the switches that let a production problem be rolled
 * back from Render's environment settings.
 */

const features = require('../config/features');

const KEYS = ['SESSION_RULES'];
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

describe('sessionRulesVersion', () => {
  test('defaults to the session rules (v2); v1 is the rollback', () => {
    expect(features.sessionRulesVersion()).toBe('v2');
  });

  test('reads the switch, case-insensitively, at call time', () => {
    process.env.SESSION_RULES = 'V2';
    expect(features.sessionRulesVersion()).toBe('v2');
    process.env.SESSION_RULES = 'v1';
    expect(features.sessionRulesVersion()).toBe('v1');
  });

  test('an unknown value falls back to the default rather than to anything new', () => {
    process.env.SESSION_RULES = 'v3';
    expect(features.sessionRulesVersion()).toBe('v2');
  });
});

test('the call engine switch is gone with the old engine', () => {
  expect(features.callEngine).toBeUndefined();
});
