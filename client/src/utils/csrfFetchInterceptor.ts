import { API_CONFIG } from '../config/api';
import { getCsrfToken, invalidateCsrfToken } from './csrfToken';

/**
 * Installs a global fetch wrapper that attaches the X-CSRF-Token header to
 * mutating requests (POST/PUT/PATCH/DELETE) aimed at this app's own API.
 *
 * Why a global wrapper instead of editing every call site: there are 50+
 * files across this app that call `fetch()` directly with
 * `${API_CONFIG.BASE_URL}...` rather than going through one shared client —
 * retrofitting a header onto each of those individually would be a much
 * larger, higher-risk change than patching fetch once at startup. Import
 * this file exactly once, before anything else makes a request (see
 * main.tsx) — installCsrfFetchInterceptor() is idempotent, so accidentally
 * importing it twice is harmless.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let installed = false;

export function installCsrfFetchInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();

    const isApiRequest = url.startsWith(API_CONFIG.BASE_URL);
    const isMutating = MUTATING_METHODS.has(method);

    if (!isApiRequest || !isMutating) {
      return originalFetch(input, init);
    }

    const token = await getCsrfToken();
    const headers = new Headers(init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined));
    if (token) headers.set('X-CSRF-Token', token);

    const response = await originalFetch(input, { ...init, headers });

    if (response.status === 403) {
      // Could be a genuinely stale/expired token (cookie rotated, tab open for
      // a long time) — invalidate the cache so the *next* attempt fetches a
      // fresh one, rather than leaving every subsequent mutation broken.
      invalidateCsrfToken();
    }

    return response;
  };
}
