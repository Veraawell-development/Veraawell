/**
 * A therapist's name as the app shows it: "Dr. Asha Rao".
 *
 * Every professional is shown with "Dr." (a product decision), but some
 * typed it into their first name themselves, and the screens printed
 * "Dr. Dr. Asha". A leading "Dr" / "Dr." / "DR." is dropped before it is
 * added back.
 */
export function stripDrPrefix(name: string | null | undefined): string {
  return String(name || '').replace(/^\s*dr\.?(\s+|$)/i, '').trim();
}

export function doctorDisplayName(firstName?: string | null, lastName?: string | null): string {
  const bare = stripDrPrefix([firstName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' '));
  return bare ? `Dr. ${bare}` : 'Your therapist';
}

/** Initials for an avatar without a photo: "AR" for Asha Rao. */
export function doctorInitials(firstName?: string | null, lastName?: string | null): string {
  const parts = stripDrPrefix([firstName, lastName].filter(Boolean).join(' ')).split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return initials.toUpperCase();
}

/** Years of experience for a card: "8+ years", or null when not given. */
export function experienceLabel(years: number | null | undefined): string | null {
  const n = Number(years);
  return Number.isFinite(n) && n > 0 ? `${Math.floor(n)}+ ${Math.floor(n) === 1 ? 'year' : 'years'}` : null;
}
