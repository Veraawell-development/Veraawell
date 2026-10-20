import { describe, expect, it } from 'vitest';
import {
  activePopup, chooseVisitPopup, nextRatingSkip, ratingPromptDue, readRatingSkip, REASK_AFTER_MS,
} from '../utils/dashboardPopups';

const due = (welcome: boolean, rating: boolean, mood: boolean) => ({ welcome, rating, mood });
const none = { welcome: false, rating: false, mood: false };

describe('one dashboard popup per visit', () => {
  it('waits until all three are known', () => {
    expect(chooseVisitPopup({ chosen: null, settled: false, due: due(true, false, true) })).toBeNull();
  });

  it('then picks by priority: rating, welcome, mood', () => {
    expect(chooseVisitPopup({ chosen: null, settled: true, due: due(true, true, true) })).toBe('rating');
    expect(chooseVisitPopup({ chosen: null, settled: true, due: due(true, false, true) })).toBe('welcome');
    expect(chooseVisitPopup({ chosen: null, settled: true, due: due(false, false, true) })).toBe('mood');
    expect(chooseVisitPopup({ chosen: null, settled: true, due: none })).toBe('none');
  });

  it('the old race: a rating answer arriving later never replaces the popup on screen', () => {
    // mood was chosen; then the rating prompt becomes due
    expect(chooseVisitPopup({ chosen: 'mood', settled: true, due: due(false, true, true) })).toBe('mood');
    expect(activePopup('mood', none)).toBe('mood');
  });

  it('nothing else shows once the chosen one is closed', () => {
    expect(activePopup('welcome', { ...none, welcome: true })).toBeNull();
    expect(chooseVisitPopup({ chosen: 'welcome', settled: true, due: due(false, true, true) })).toBe('welcome');
  });

  it('a popup no longer due (just saved) still shows until it is closed', () => {
    expect(activePopup('rating', none)).toBe('rating');
  });

  it("'none' renders nothing", () => {
    expect(activePopup('none', none)).toBeNull();
    expect(activePopup(null, none)).toBeNull();
  });
});

describe('"Do this later" on the rating prompt', () => {
  const now = 1_800_000_000_000;

  it('asks once more on a later visit, then stops', () => {
    let skip = readRatingSkip(null);
    expect(ratingPromptDue(skip, now)).toBe(true);
    skip = nextRatingSkip(skip, now);
    expect(ratingPromptDue(skip, now + 60_000)).toBe(false);
    expect(ratingPromptDue(skip, now + REASK_AFTER_MS)).toBe(true);
    skip = nextRatingSkip(skip, now + REASK_AFTER_MS);
    expect(ratingPromptDue(skip, now + 10 * REASK_AFTER_MS)).toBe(false);
  });

  it("an old 'true' flag counts as one skip long ago (so it asks once more)", () => {
    expect(ratingPromptDue(readRatingSkip('true'), now)).toBe(true);
  });

  it('garbage in storage reads as no skip', () => {
    expect(readRatingSkip('{oops')).toEqual({ count: 0, at: 0 });
  });
});
