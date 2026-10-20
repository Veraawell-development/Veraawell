/**
 * Which full-screen popup the patient dashboard shows on a visit: the welcome
 * (unfinished profile), the rating prompt (a finished session not yet rated)
 * or the daily mood check-in. At most one per visit — a new patient used to
 * get all three, one after another.
 *
 * The choice waits until all three are known, then holds for the visit. It
 * used to be made as soon as the first answer arrived: the rating prompt's
 * data comes back later than the others, and when it did the popup already
 * on screen (welcome or mood) vanished mid-read — and the rating prompt
 * didn't show either.
 */
export type DashboardPopup = 'welcome' | 'rating' | 'mood';

/** Most important first: a session that just ended, then setting up, then mood. */
const PRIORITY: DashboardPopup[] = ['rating', 'welcome', 'mood'];

export interface PopupState {
  /** What this visit settled on: a popup, 'none', or null while still deciding. */
  chosen: DashboardPopup | 'none' | null;
  /** True once every popup's "is it due?" has an answer. */
  settled: boolean;
  due: Record<DashboardPopup, boolean>;
}

/** The visit's choice: kept once made; made only when everything is known. */
export function chooseVisitPopup({ chosen, settled, due }: PopupState): DashboardPopup | 'none' | null {
  if (chosen !== null) return chosen;
  if (!settled) return null;
  return PRIORITY.find((p) => due[p]) ?? 'none';
}

/**
 * The popup to render now: the visit's choice until it is closed. Not
 * re-checked against "due" — saving a mood or a rating makes it not due any
 * more, and the popup must still finish (its thank-you) rather than vanish.
 */
export function activePopup(chosen: DashboardPopup | 'none' | null, closed: Record<DashboardPopup, boolean>): DashboardPopup | null {
  return chosen && chosen !== 'none' && !closed[chosen] ? chosen : null;
}

/**
 * "Do this later" on the rating prompt. It used to mean "never" (one flag,
 * forever), so the prompt was lost after one tap. Now it asks once more, on
 * a later visit at least REASK_AFTER_MS on, then stops for that session.
 */
export const REASK_AFTER_MS = 12 * 60 * 60 * 1000;

export interface RatingSkip { count: number; at: number }

/** Reads the stored skip; the old value 'true' counts as one skip long ago. */
export function readRatingSkip(raw: string | null): RatingSkip {
  if (!raw) return { count: 0, at: 0 };
  if (raw === 'true') return { count: 1, at: 0 };
  try {
    const parsed = JSON.parse(raw);
    return { count: Number(parsed.count) || 0, at: Number(parsed.at) || 0 };
  } catch {
    return { count: 0, at: 0 };
  }
}

export function ratingPromptDue(skip: RatingSkip, now: number = Date.now()): boolean {
  if (skip.count === 0) return true;
  if (skip.count === 1) return now - skip.at >= REASK_AFTER_MS;
  return false;
}

export function nextRatingSkip(skip: RatingSkip, now: number = Date.now()): RatingSkip {
  return { count: skip.count + 1, at: now };
}
