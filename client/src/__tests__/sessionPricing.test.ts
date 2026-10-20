import { describe, it, expect } from 'vitest';
import {
  resolveSessionPrice, offeredDurations, startingPrice, missingPriceSlots, formatINR
} from '../utils/sessionPricing';

/**
 * The profile page's prices must match what the server will charge
 * (services/session.service.js resolvePrice is authoritative). Both now read
 * the therapist's own price for the exact slot — the old fallback chain
 * (voice → video, 40 → 20, min / max) sold prices nobody had set.
 */
const FULL = {
  min: 400, max: 1600,
  session20: 500, session40: 900, session55: 1200,
  audio: { session20: 400, session40: 800, session55: 1100 },
};

describe('resolveSessionPrice', () => {
  it('uses the explicit slot price for each of the six sessions', () => {
    expect(resolveSessionPrice(FULL, 20, 'video')).toBe(500);
    expect(resolveSessionPrice(FULL, 40, 'video')).toBe(900);
    expect(resolveSessionPrice(FULL, 55, 'video')).toBe(1200);
    expect(resolveSessionPrice(FULL, 20, 'voice')).toBe(400);
    expect(resolveSessionPrice(FULL, 40, 'voice')).toBe(800);
    expect(resolveSessionPrice(FULL, 55, 'voice')).toBe(1100);
  });

  it('never falls back: an unset slot has no price, whatever min/max or the other mode say', () => {
    const partial = { min: 300, max: 900, session20: 300, session40: 0, audio: { session20: 0 } };
    expect(resolveSessionPrice(partial, 40, 'video')).toBeNull(); // was session20 → 300
    expect(resolveSessionPrice(partial, 55, 'video')).toBeNull(); // was max → 900
    expect(resolveSessionPrice(partial, 20, 'voice')).toBeNull(); // was video 20 → 300
    expect(resolveSessionPrice({ min: 300 }, 20, 'voice')).toBeNull();
  });

  it('returns null for missing pricing, bad durations and modes, and non-positive values', () => {
    expect(resolveSessionPrice(null, 20, 'video')).toBeNull();
    expect(resolveSessionPrice({}, 40, 'video')).toBeNull();
    expect(resolveSessionPrice(FULL, 30, 'video')).toBeNull();
    expect(resolveSessionPrice(FULL, 60, 'video')).toBeNull();
    expect(resolveSessionPrice(FULL, 20, 'chat' as never)).toBeNull();
    expect(resolveSessionPrice({ session20: -50 }, 20, 'video')).toBeNull();
    expect(resolveSessionPrice({ session20: NaN as number }, 20, 'video')).toBeNull();
  });
});

describe('offeredDurations / startingPrice', () => {
  it('lists only priced durations, in order', () => {
    expect(offeredDurations(FULL, 'video')).toEqual([20, 40, 55]);
    expect(offeredDurations({ session55: 800 }, 'video')).toEqual([55]);
    expect(offeredDurations({ min: 300, max: 800 }, 'video')).toEqual([]);
  });

  it('starts from the lowest of the six real prices', () => {
    expect(startingPrice(FULL)).toBe(400);
    expect(startingPrice({ min: 1, session55: 900 })).toBe(900); // min is not a price
    expect(startingPrice({})).toBeNull();
  });
});

describe('missingPriceSlots', () => {
  it('names every slot still to be priced, in form order', () => {
    expect(missingPriceSlots({
      video: { 20: '500', 40: '', 55: '0' },
      voice: { 20: 400, 40: null, 55: '1100' },
    })).toEqual(['40-min video', '55-min video', '40-min voice']);
  });

  it('is empty when all six are set', () => {
    expect(missingPriceSlots({
      video: { 20: '500', 40: '900', 55: '1200' },
      voice: { 20: '400', 40: '800', 55: '1100' },
    })).toEqual([]);
  });
});

describe('formatINR', () => {
  it('groups the Indian way and keeps paise only when there are some', () => {
    expect(formatINR(800)).toBe('₹800');
    expect(formatINR(1500)).toBe('₹1,500');
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1234.5)).toBe('₹1,234.50');
    expect(formatINR(null)).toBe('—');
  });
});
