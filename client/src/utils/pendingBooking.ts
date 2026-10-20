/**
 * The booking a signed-out patient was about to make, kept across sign-in.
 *
 * "Book" on a therapist's page sends a signed-out patient to /login; the
 * sign-in, sign-up + email code and Google flows all return to the page, but
 * the choices themselves (length, mode, day, time) lived in component state
 * and were gone — the patient had to pick everything again, and an instant
 * booking came back as a scheduled one. They are parked here, per tab
 * (sessionStorage), for an hour, and read back by the therapist's page.
 *
 * Storage can be missing or throw (private mode, blocked site data): every
 * access is wrapped, and the page works the same without it.
 */

export interface PendingBooking {
  doctorId: string;
  bookingType: 'scheduled' | 'immediate';
  serviceType?: string;
  mode: 'video' | 'voice';
  duration: number;
  date?: string;
  timeSlot?: string;
  savedAt: number;
}

const KEY = 'vw_pending_booking';
const MAX_AGE_MS = 60 * 60 * 1000;

export function savePendingBooking(booking: Omit<PendingBooking, 'savedAt'>, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...booking, savedAt: now }));
  } catch {
    /* storage unavailable: the patient just picks again */
  }
}

/** The parked booking for this therapist, if there is a fresh one. */
export function readPendingBooking(doctorId: string | undefined, now = Date.now()): PendingBooking | null {
  if (!doctorId) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBooking;
    if (!parsed || parsed.doctorId !== doctorId) return null;
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > MAX_AGE_MS || parsed.savedAt > now) {
      clearPendingBooking();
      return null;
    }
    if (parsed.mode !== 'video' && parsed.mode !== 'voice') return null;
    if (parsed.bookingType !== 'scheduled' && parsed.bookingType !== 'immediate') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBooking(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
