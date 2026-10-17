/**
 * Post-login destinations.
 *
 * ProtectedRoute sends a logged-out visitor to `/login?redirect=<path+search>`
 * so a deep link (a video-call URL, a report, /messages) survives the login.
 * The value comes from the URL, so anyone can craft it: only a same-origin
 * relative path is honoured, never a scheme, a protocol-relative `//host`, or
 * a backslash form some browsers normalise into one.
 */

/** Pages a login must not bounce back to. */
const AUTH_PATHS = new Set(['/login', '/signup']);

const OAUTH_REDIRECT_KEY = 'veraawell:postLoginRedirect';

export function sanitizeRedirect(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/')) return null;
  // `//evil.test` is another host; browsers treat `/\evil.test` the same way.
  if (value.startsWith('//') || value.includes('\\')) return null;
  // Control characters (tab/newline are stripped by URL parsers, which can
  // turn `/\t/evil.test` into `//evil.test`).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  const pathOnly = value.split(/[?#]/)[0];
  if (AUTH_PATHS.has(pathOnly.replace(/\/+$/, '') || '/')) return null;

  return value;
}

/** Reads and validates `?redirect=` from a location.search string. */
export function getRedirectFromSearch(search: string): string | null {
  try {
    return sanitizeRedirect(new URLSearchParams(search).get('redirect'));
  } catch {
    return null;
  }
}

/** `/login?redirect=…` for the given in-app location. */
export function loginPathFor(pathname: string, search = ''): string {
  const target = sanitizeRedirect(`${pathname}${search}`);
  return target ? `/login?redirect=${encodeURIComponent(target)}` : '/login';
}

/**
 * Google sign-in leaves the site and comes back to `/?auth=success`, so the
 * destination has to be parked for the round trip. sessionStorage is per-tab
 * and same-origin, which is exactly the scope of that round trip.
 */
export function rememberOAuthRedirect(target: string | null): void {
  try {
    if (target) sessionStorage.setItem(OAUTH_REDIRECT_KEY, target);
    else sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
  } catch {
    // Storage blocked: the user lands on their dashboard instead.
  }
}

export function consumeOAuthRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(OAUTH_REDIRECT_KEY);
    sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
    return sanitizeRedirect(value);
  } catch {
    return null;
  }
}
