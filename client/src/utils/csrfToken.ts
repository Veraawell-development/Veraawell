import { API_CONFIG } from '../config/api';

/**
 * Client half of the H10 CSRF fix (see server/middleware/csrf.middleware.js
 * and the comment above app.get('/api/csrf-token', ...) in server/app.js for
 * the full rationale, including why this can't just read document.cookie —
 * the frontend and API are on different origins in production).
 *
 * Fetches the CSRF token once, caches it in memory, and re-fetches if a
 * request is ever rejected for a stale/missing token (e.g. first load raced
 * a mutation, or the cookie expired).
 */

let cachedToken: string | null = null;
let inFlight: Promise<string | null> | null = null;
// Bumped on every invalidation so a fetch that was already in flight when the
// cache was dropped (logout, CSRF rejection) can't write its now-stale value
// back into the cache after the fact.
let generation = 0;

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_CONFIG.BASE_URL}/csrf-token`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.csrfToken || null;
  } catch {
    return null;
  }
}

export async function getCsrfToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!inFlight) {
    const startedAt = generation;
    const request = fetchCsrfToken().then((token) => {
      if (startedAt === generation) {
        cachedToken = token;
        inFlight = null;
      }
      return token;
    });
    inFlight = request;
  }
  return inFlight;
}

/** Call after a 403 CSRF rejection (or on logout) to force a fresh token on the next attempt. */
export function invalidateCsrfToken(): void {
  generation += 1;
  cachedToken = null;
  inFlight = null;
}
