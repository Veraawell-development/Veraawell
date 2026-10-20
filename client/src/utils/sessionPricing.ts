/**
 * What a session of a given length and mode costs with a given doctor.
 *
 * Client mirror of the server's resolvePrice (services/session.service.js),
 * which is authoritative: the booking request's `price` is ignored there, so
 * this only decides what the profile page shows and which options it offers.
 *
 * Veraawell sells exactly six sessions — 20, 40 and 55 minutes, each by video
 * or voice — and a therapist is listed only once all six are priced. So the
 * price is the therapist's own price for that exact slot, or null. There used
 * to be a fallback chain (voice → video, 40 → 20, then min / max), which
 * showed and sold prices the therapist had never set.
 */

export const SESSION_DURATIONS = [20, 40, 55] as const;
export type SessionDuration = typeof SESSION_DURATIONS[number];
export type SessionMode = 'video' | 'voice';
export const SESSION_MODES: readonly SessionMode[] = ['video', 'voice'];

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

function isSessionDuration(value: number): value is SessionDuration {
  return (SESSION_DURATIONS as readonly number[]).includes(value);
}

function positive(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The price in rupees, or null when this doctor hasn't priced the combination. */
export function resolveSessionPrice(
  pricing: DoctorPricing | null | undefined,
  duration: number,
  mode: SessionMode
): number | null {
  if (!pricing || !isSessionDuration(duration)) return null;
  if (mode === 'voice') return positive(pricing.audio?.[`session${duration}` as const]);
  if (mode === 'video') return positive(pricing[`session${duration}` as const]);
  return null;
}

/** Durations bookable in `mode`, in display order. */
export function offeredDurations(pricing: DoctorPricing | null | undefined, mode: SessionMode): SessionDuration[] {
  return SESSION_DURATIONS.filter(d => resolveSessionPrice(pricing, d, mode) !== null);
}

/** The lowest of the six prices — "From ₹X" — or null when none is set. */
export function startingPrice(pricing: DoctorPricing | null | undefined): number | null {
  const prices = SESSION_MODES.flatMap((m) => offeredDurations(pricing, m).map((d) => resolveSessionPrice(pricing, d, m) as number));
  return prices.length ? Math.min(...prices) : null;
}

/**
 * A price-grid form as the doctor settings and profile setup pages hold it
 * (strings, as typed).
 */
export interface PriceForm {
  video: Record<SessionDuration, string | number | null | undefined>;
  voice: Record<SessionDuration, string | number | null | undefined>;
}

/**
 * The slots a doctor still has to price, as labels ("40-min voice"), in the
 * order the form shows them. Every one of the six is required: the server
 * refuses a grid with a gap (profile.controller validatePricingGrid).
 */
export function missingPriceSlots(form: PriceForm): string[] {
  const missing: string[] = [];
  for (const mode of SESSION_MODES) {
    for (const d of SESSION_DURATIONS) {
      if (positive(form[mode][d]) === null) missing.push(`${d}-min ${mode}`);
    }
  }
  return missing;
}

/** Rupees as Indians read them: "₹1,500", "₹1,234.50". */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  const n = Number(amount);
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
