// Date and Time Utility Functions

/**
 * Parses a time string (e.g. "14:30" or "02:30 PM") and returns [hours, minutes] in 24h format
 */
export const parseTime = (timeString: string): [number, number] => {
  if (!timeString) return [0, 0];
  if (timeString.includes(' ')) {
    const [time, modifier] = timeString.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return [hours, minutes];
  }
  return timeString.split(':').map(Number) as [number, number];
};

// ── Session instants ────────────────────────────────────────────────────────
//
// A session's `startsAt` is the authoritative UTC instant (server:
// services/sessionTime.js). `sessionDate` is a UTC midnight and `sessionTime`
// an IST wall-clock string, so `new Date(sessionDate).setHours(h, m)` applies
// the VIEWER's offset: correct only in IST, and 5h30m off on a UTC machine.

/** The zone every slot is published in (server: PLATFORM_TIMEZONE). */
export const PLATFORM_TIMEZONE = 'Asia/Kolkata';
/** Asia/Kolkata is UTC+05:30 all year — no DST — so a fixed offset is exact. */
const PLATFORM_OFFSET_MINUTES = 330;

export interface SessionTimeFields {
  startsAt?: string | Date | null;
  sessionDate?: string | Date | null;
  sessionTime?: string | null;
}

/**
 * When a session starts, as a real instant. Client mirror of the server's
 * resolveStartsAt: `startsAt` when present; otherwise the legacy pair read as
 * IST wall clock; an immediate session's `sessionDate` (already an instant,
 * not a midnight) as-is.
 */
export const resolveSessionStart = (session: SessionTimeFields | null | undefined): Date => {
  if (!session) return new Date(NaN);
  if (session.startsAt) return new Date(session.startsAt);

  const raw = session.sessionDate ? new Date(session.sessionDate) : new Date(NaN);
  if (Number.isNaN(raw.getTime())) return raw;

  const isInstant = raw.getUTCHours() !== 0 || raw.getUTCMinutes() !== 0 || raw.getUTCSeconds() !== 0;
  if (isInstant || !session.sessionTime) return raw;

  const [h, m] = parseTime(session.sessionTime);
  if (Number.isNaN(h) || Number.isNaN(m)) return raw;
  return new Date(
    Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate(), h, m) - PLATFORM_OFFSET_MINUTES * 60000
  );
};

/** When a session ends: `endsAt`, else start + duration (default 60 min). */
export const resolveSessionEnd = (session: SessionTimeFields & { endsAt?: string | Date | null; duration?: number | null }): Date => {
  if (session.endsAt) return new Date(session.endsAt);
  return new Date(resolveSessionStart(session).getTime() + (session.duration || 60) * 60000);
};

/** The session's calendar day in IST as 'YYYY-MM-DD' (for grouping by day). */
export const sessionLocalDateKey = (session: SessionTimeFields): string => {
  const start = resolveSessionStart(session);
  if (Number.isNaN(start.getTime())) return '';
  return new Date(start.getTime() + PLATFORM_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
};

/** Whole calendar days (IST) from today to the session's day: 0 today, 1 tomorrow, negative if past. */
export const daysUntilSession = (session: SessionTimeFields, now: Date = new Date()): number => {
  const key = sessionLocalDateKey(session);
  if (!key) return 0;
  const todayKey = new Date(now.getTime() + PLATFORM_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
};

/** A session date for display, in IST. Options as for toLocaleDateString. */
export const formatSessionDay = (
  start: Date,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
  locale = 'en-IN'
): string => start.toLocaleDateString(locale, { ...options, timeZone: PLATFORM_TIMEZONE });

/** A session time for display, in IST, e.g. "2:30 pm". */
export const formatSessionClock = (start: Date, locale = 'en-IN'): string =>
  start.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PLATFORM_TIMEZONE });

/**
 * Any stored instant (an ISO string from the API) as an IST calendar date,
 * e.g. "13 Oct 2026"; '—' when missing or unparseable. For admin screens,
 * which used to print dates in whatever zone the admin's laptop was set to.
 */
export const formatPlatformDate = (
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string => {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : formatSessionDay(date, options);
};

/** Like formatPlatformDate, with the IST time, e.g. "13 Oct 2026, 2:30 pm". */
export const formatPlatformDateTime = (value: string | Date | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${formatSessionDay(date)}, ${formatSessionClock(date)}`;
};

/**
 * A platform-local calendar date ('YYYY-MM-DD', e.g. a payout period's
 * localFrom) for display. Read at IST noon so no zone can move it a day.
 */
export const formatPlatformLocalDate = (
  localDate: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string => {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return '—';
  return formatSessionDay(new Date(`${localDate}T12:00:00+05:30`), options);
};

/**
 * Formats a date string into a readable format with ordinal suffix
 * @example "2025-01-15" → "15th January 2025"
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear();
  
  const suffix = (day: number): string => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  
  return `${day}${suffix(day)} ${month} ${year}`;
};

/**
 * Formats a time string from 24h to 12h format
 * @example "14:30" → "2:30 PM"
 */
export const formatTime = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

/**
 * Checks if a date is today
 */
export const isToday = (dateString: string): boolean => {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

/**
 * Checks if a date/time is in the past
 */
export const isPast = (dateString: string, timeString?: string): boolean => {
  const date = new Date(dateString);
  if (timeString) {
    const [hours, minutes] = parseTime(timeString);
    date.setHours(hours, minutes, 0, 0);
  }
  return date < new Date();
};

/**
 * Gets relative time string (e.g., "2 hours ago", "Just now")
 */
export const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  
  return formatDate(dateString);
};

/**
 * Formats date for API (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses date string to Date object safely
 */
export const parseDate = (dateString: string): Date | null => {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

/**
 * Gets day of week name
 */
export const getDayOfWeek = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { weekday: 'long' });
};

/**
 * Gets short day of week name
 */
export const getShortDayOfWeek = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { weekday: 'short' });
};

/**
 * Checks if date is tomorrow
 */
export const isTomorrow = (dateString: string): boolean => {
  const date = new Date(dateString);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
};

/**
 * Time-of-day greeting phrase, e.g. "Good morning".
 */
export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 20) return 'Good evening';
  if (hour >= 20 && hour < 24) return 'Good night';
  return 'Night owl';
};

/**
 * Punctuation to close out a greeting — an exclamation during the lively hours,
 * a quieter full stop once it's late so a "Good night!" doesn't read as too loud.
 */
export const getGreetingPunctuation = (): string => {
  const hour = new Date().getHours();
  return hour >= 5 && hour < 20 ? '!' : '.';
};

/**
 * Gets days until a date
 */
export const getDaysUntil = (dateString: string): number => {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  
  const diff = date.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
