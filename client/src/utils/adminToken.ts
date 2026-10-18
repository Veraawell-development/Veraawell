/**
 * In-memory holder for the admin session token.
 *
 * The admin console used to keep its token in localStorage, where any script
 * that ever runs on the page — one XSS — can read the most privileged
 * credential in the app and use it from anywhere for its whole life. The
 * server already issues the same token as the httpOnly `adminToken` cookie,
 * and every API call sends cookies (see csrfFetchInterceptor.ts), so the
 * cookie alone carries the session across reloads.
 *
 * The copy kept here only backs up the cookie within one page's life (a
 * browser that drops the cookie still works until a reload) and is never
 * persisted — same reasoning as utils/authToken.ts for the user realm.
 */

let currentToken: string | null = null;

export function getAdminToken(): string | null {
  return currentToken;
}

export function setAdminToken(token: string | null): void {
  currentToken = token;
}

/** Older builds left the token in localStorage; it must not outlive them. */
export function clearLegacyAdminToken(): void {
  try {
    window.localStorage.removeItem('adminToken');
  } catch {
    /* storage blocked: nothing could have been stored either */
  }
}
