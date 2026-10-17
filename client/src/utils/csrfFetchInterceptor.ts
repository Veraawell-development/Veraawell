import { API_CONFIG } from '../config/api';
import { getCsrfToken, invalidateCsrfToken } from './csrfToken';
import { getAuthToken } from './authToken';

/**
 * Installs a global fetch wrapper for requests aimed at this app's own API.
 *
 * Why a global wrapper instead of editing every call site: there are 50+
 * files across this app that call `fetch()` directly with
 * `${API_CONFIG.BASE_URL}...` rather than going through one shared client —
 * retrofitting behaviour onto each of those individually would be a much
 * larger, higher-risk change than patching fetch once at startup. Import
 * this file exactly once, before anything else makes a request (see
 * main.tsx) — installCsrfFetchInterceptor() is idempotent, so accidentally
 * importing it twice is harmless.
 *
 * For every request to the API base URL (any method) it:
 *
 *  1. Sends cookies. In production the client (veraawell.com) and the API
 *     (api.veraawell.com) are different origins, so fetch's default
 *     `credentials: 'same-origin'` sends neither the session cookie nor the
 *     csrfToken cookie, and ignores any Set-Cookie on the response. Locally
 *     Vite proxies /api, which hides this. A caller that sets `credentials`
 *     itself (including 'omit') keeps its choice.
 *
 *  2. Drops an `Authorization` header that carries no token — `Bearer null`,
 *     `Bearer undefined`, `Bearer `. The server prefers the header over the
 *     cookie, so sending one of these turns a perfectly valid cookie session
 *     into a 401. Call sites build the header from an in-memory token that is
 *     null after a refresh, so this happens routinely.
 *
 *     And the reverse: when a request carries no Authorization header but the
 *     in-memory session token (utils/authToken.ts) is set, it is attached.
 *     That token exists precisely for browsers that won't send the session
 *     cookie (Safari), but most call sites never added it, so there a save
 *     failed with "No token provided" while the rest of the app looked signed
 *     in. Admin API calls are left alone — they authenticate with the admin
 *     token, and a user's Bearer header would take precedence over it.
 *
 *  3. On mutations (POST/PUT/PATCH/DELETE), attaches X-CSRF-Token (the
 *     double-submit half; see utils/csrfToken.ts). If the server rejects it
 *     with a 403 whose body says `category: 'csrf'`, the cached token is
 *     dropped, a fresh one fetched, and the request retried once — provided
 *     the body can be sent a second time. Any other 403 (an authorization
 *     denial, `category: 'authz'`) leaves the cached token alone.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** `Bearer`, `Bearer null`, `Bearer undefined` — a header with no token in it. */
const EMPTY_BEARER = /^Bearer(?:\s+(?:null|undefined))?\s*$/i;

function currentHref(): string {
  return typeof window !== 'undefined' && window.location?.href
    ? window.location.href
    : 'http://localhost/';
}

/** The path under API_CONFIG.BASE_URL ('/sessions/1'), or null if `rawUrl` isn't an API URL. */
function apiPath(rawUrl: string): string | null {
  try {
    const href = currentHref();
    const base = new URL(API_CONFIG.BASE_URL, href);
    const target = new URL(rawUrl, href);
    if (target.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/+$/, '');
    if (target.pathname === basePath) return '/';
    return target.pathname.startsWith(`${basePath}/`) ? target.pathname.slice(basePath.length) : null;
  } catch {
    return null;
  }
}

/** True when `rawUrl` points at API_CONFIG.BASE_URL (absolute or relative). */
export function isApiUrl(rawUrl: string): boolean {
  return apiPath(rawUrl) !== null;
}

/** Admin endpoints, and any call made from the admin console, use the admin token. */
function isAdminContext(path: string): boolean {
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  const page = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
  return page.startsWith('/super-admin-dashboard') || page.startsWith('/admin');
}

function isRequest(input: unknown): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

/**
 * Bodies fetch can send twice. A ReadableStream is consumed by the first
 * attempt, so a request carrying one is never retried.
 */
function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body === 'string') return true;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return true;
  return false;
}

/** A 403 the server attributes to the CSRF check, not to authorization. */
async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const type = response.headers.get('content-type') || '';
  if (!type.includes('json')) return false;
  try {
    const data = await response.clone().json();
    return data?.category === 'csrf';
  } catch {
    return false;
  }
}

/**
 * Wraps `originalFetch` with the behaviour described above. Exported
 * separately from the installer so it can be unit-tested without touching
 * the real window.fetch.
 */
export function createApiFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = isRequest(input) ? input : null;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    const path = apiPath(url);
    if (path === null) {
      return originalFetch(input, init);
    }

    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const isMutating = MUTATING_METHODS.has(method);

    // A Request object always reports a credentials mode ('same-origin' by
    // default), so it can't say whether the caller chose it — only 'omit' is
    // an unambiguous opt-out.
    let credentials: RequestCredentials;
    if (init?.credentials !== undefined) credentials = init.credentials;
    else if (request?.credentials === 'omit') credentials = 'omit';
    else credentials = 'include';

    // Same precedence as fetch itself: init.headers replaces the Request's.
    const headers = new Headers(init?.headers !== undefined ? init.headers : request?.headers);
    const authorization = headers.get('Authorization');
    if (authorization !== null && EMPTY_BEARER.test(authorization.trim())) {
      headers.delete('Authorization');
    }
    // ('omit' asked for an anonymous request; leave it anonymous.)
    if (credentials !== 'omit' && !headers.has('Authorization') && !isAdminContext(path)) {
      const sessionToken = getAuthToken();
      if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
    }

    if (!isMutating) {
      return originalFetch(input, { ...init, headers, credentials });
    }

    // A Request's body can only be read once; keep an unread copy for a retry.
    const replayRequest = request && !request.bodyUsed ? request.clone() : null;

    const send = (target: RequestInfo | URL, csrfToken: string | null): Promise<Response> => {
      const attemptHeaders = new Headers(headers);
      if (csrfToken) attemptHeaders.set('X-CSRF-Token', csrfToken);
      return originalFetch(target, { ...init, headers: attemptHeaders, credentials });
    };

    const response = await send(input, await getCsrfToken());

    if (!(await isCsrfRejection(response))) {
      return response;
    }

    // The cached token no longer matches the cookie (rotated, expired, or the
    // first load raced this mutation). Drop it whatever happens next.
    invalidateCsrfToken();

    const canReplay = request ? replayRequest !== null : isReplayableBody(init?.body);
    if (!canReplay) return response;

    const freshToken = await getCsrfToken();
    if (!freshToken) return response;

    return send(replayRequest ?? input, freshToken);
  };
}

let installed = false;

export function installCsrfFetchInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = createApiFetch(originalFetch);
}
