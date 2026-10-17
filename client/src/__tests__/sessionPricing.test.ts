import { describe, it, expect } from 'vitest';
import { resolveSessionPrice, offeredDurations } from '../utils/sessionPricing';

/**
 * The profile page's prices must match what the server will charge
 * (resolvePrice is authoritative). The old code used `!= null`, so a slot a
 * doctor had saved as 0 — "not offered" — was shown and offered at ₹0.
 */
describe('resolveSessionPrice', () => {
  it('uses the explicit slot price', () => {
    const p = { min: 300, max: 900, session20: 400, session40: 700, session55: 1000 };
    expect(resolveSessionPrice(p, 20, 'video')).toBe(400);
    expect(resolveSessionPrice(p, 40, 'video')).toBe(700);
    expect(resolveSessionPrice(p, 55, 'video')).toBe(1000);
  });

  it('treats 0 as not set and falls back along the chain', () => {
    const p = { min: 300, max: 900, session20: 0, session40: 0, session55: 0 };
    expect(resolveSessionPrice(p, 20, 'video')).toBe(300); // session20 → min
    expect(resolveSessionPrice(p, 40, 'video')).toBe(300); // session40 → session20 → min
    expect(resolveSessionPrice(p, 55, 'video')).toBe(900); // session55 → max
  });

  it('40 falls back to the 20-minute price before min', () => {
    expect(resolveSessionPrice({ min: 100, session20: 250 }, 40, 'video')).toBe(250);
  });

  it('55 does not fall back to min or the shorter slots', () => {
    expect(resolveSessionPrice({ min: 100, session20: 250, session40: 400 }, 55, 'video')).toBeNull();
  });

  it('returns null when nothing in the chain is positive', () => {
    expect(resolveSessionPrice({ min: 0, max: 0, session20: 0 }, 20, 'video')).toBeNull();
    expect(resolveSessionPrice({}, 40, 'video')).toBeNull();
    expect(resolveSessionPrice(null, 20, 'video')).toBeNull();
  });

  it('voice prefers the audio price, then the whole video chain', () => {
    const p = { min: 300, max: 900, session20: 400, audio: { session20: 200, session40: 0 } };
    expect(resolveSessionPrice(p, 20, 'voice')).toBe(200);
    expect(resolveSessionPrice(p, 40, 'voice')).toBe(400); // audio 0 → session40 unset → session20
    expect(resolveSessionPrice(p, 55, 'voice')).toBe(900);
    expect(resolveSessionPrice({ min: 300 }, 20, 'voice')).toBe(300); // no audio block at all
  });

  it('rejects durations and modes the server does not accept', () => {
    const p = { min: 300, max: 900 };
    expect(resolveSessionPrice(p, 30, 'video')).toBeNull();
    expect(resolveSessionPrice(p, 60, 'video')).toBeNull();
    expect(resolveSessionPrice(p, 20, 'chat' as never)).toBeNull();
  });

  it('ignores negative and non-numeric values', () => {
    expect(resolveSessionPrice({ session20: -50, min: 120 }, 20, 'video')).toBe(120);
    expect(resolveSessionPrice({ session20: NaN as number, min: 120 }, 20, 'video')).toBe(120);
  });
});

describe('offeredDurations', () => {
  it('lists only bookable durations, in order', () => {
    expect(offeredDurations({ min: 300, session20: 0 }, 'video')).toEqual([20, 40]);
    expect(offeredDurations({ max: 800 }, 'video')).toEqual([55]);
    expect(offeredDurations({}, 'voice')).toEqual([]);
  });
});
