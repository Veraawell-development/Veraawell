/**
 * What a session of a given length and mode costs with a given doctor.
 *
 * Client mirror of the server's resolvePrice (services/session.service.js),
 * which is authoritative: the booking request's `price` is ignored there, so
 * this only decides what the profile page shows and which options it offers.
 *
 * The rule: walk a fallback chain and take the first value greater than 0.
 * 0 (or unset) means "not offered" — it is never a price. If nothing in the
 * chain is positive the combination can't be booked and the server answers
 * 400, so the page must not offer it.
 *
 *   video 20 → session20, min
 *   video 40 → session40, session20, min
 *   video 55 → session55, max
 *   voice N  → audio.sessionN, then the video chain for N
 */

export const SESSION_DURATIONS = [20, 40, 55] as const;
export type SessionDuration = typeof SESSION_DURATIONS[number];
export type SessionMode = 'video' | 'voice';

export interface DoctorPricing {
  min?: number | null;
  max?: number | null;
  session20?: number | null;
  session40?: number | null;
  session55?: number | null;
  audio?: {
    session20?: number | null;
    session40?: number | null;
    session55?: number | null;
  } | null;
}

function videoChain(pricing: DoctorPricing, duration: SessionDuration): Array<number | null | undefined> {
  switch (duration) {
    case 20: return [pricing.session20, pricing.min];
    case 40: return [pricing.session40, pricing.session20, pricing.min];
    case 55: return [pricing.session55, pricing.max];
  }
}

function isSessionDuration(value: number): value is SessionDuration {
  return (SESSION_DURATIONS as readonly number[]).includes(value);
}

/** The price in rupees, or null when this doctor doesn't offer the combination. */
export function resolveSessionPrice(
  pricing: DoctorPricing | null | undefined,
  duration: number,
  mode: SessionMode
): number | null {
  if (!pricing || !isSessionDuration(duration)) return null;
  if (mode !== 'video' && mode !== 'voice') return null;

  const chain = mode === 'voice'
    ? [pricing.audio?.[`session${duration}` as const], ...videoChain(pricing, duration)]
    : videoChain(pricing, duration);

  for (const value of chain) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** Durations bookable in `mode`, in display order. */
export function offeredDurations(pricing: DoctorPricing | null | undefined, mode: SessionMode): SessionDuration[] {
  return SESSION_DURATIONS.filter(d => resolveSessionPrice(pricing, d, mode) !== null);
}
