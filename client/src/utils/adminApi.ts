import { API_BASE_URL } from '../config/api';
import { getAdminToken } from './adminToken';

/**
 * The admin console's one way of calling the API.
 *
 * Every admin screen used to build its own fetch, and most of them threw a
 * bare `new Error('Request failed')` — so the server's explanation ("this
 * doctor has sessions, reject them instead", "that week hasn't ended") never
 * reached the person who needed it, and an expired session looked exactly
 * like an empty queue. Here a failure always carries the server's `message`,
 * its HTTP status, and its `code`/`category`, and a response that means the
 * session is over is reported once, centrally (AdminContext signs out).
 */

export class AdminApiError extends Error {
  /** HTTP status; 0 when the server could not be reached at all. */
  readonly status: number;
  readonly code?: string;
  readonly category?: string;

  constructor(message: string, status: number, code?: string, category?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.category = category;
  }
}

/**
 * Does this response mean the admin session is over?
 *
 * A 401 always does. A 403 does too (suspended, no longer approved, demoted)
 * unless the server says it is an authorization denial — `category: 'authz'`
 * is "this account may not do this", and the account is still signed in.
 */
export function endsAdminSession(status: number, category?: string): boolean {
  return status === 401 || (status === 403 && category !== 'authz');
}

/** The server's minimum for admin passwords (server/routes/admin/auth.js). */
export const ADMIN_MIN_PASSWORD_LENGTH = 8;

export const SESSION_ENDED_MESSAGE = 'Your admin session has ended — please sign in again';

/** What to say when the response carried no usable message. */
export function fallbackMessage(status: number): string {
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  if (status === 401) return SESSION_ENDED_MESSAGE;
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The server ran into a problem. Try again in a moment.';
  return 'Something went wrong. Please try again.';
}

/**
 * The text to show for an error body: the server's `message`, followed by its
 * per-field `errors` when it sent them ("Validation failed" alone tells the
 * admin nothing about which field).
 */
export function serverErrorText(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const { message, errors } = body as { message?: unknown; errors?: unknown };
  const text = typeof message === 'string' && message.trim() ? message.trim() : '';
  const details = errors && typeof errors === 'object'
    ? Object.values(errors as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim())
    : [];
  if (details.length) return text ? `${text}: ${details.join('. ')}` : details.join('. ');
  return text || fallback;
}

/** The message of anything thrown, for a toast. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Retry policy for admin queries: once, and only for failures a retry can fix
 * (unreachable, 5xx). Retrying a 401 or a 409 just repeats the answer.
 */
export function adminQueryRetry(failureCount: number, err: unknown): boolean {
  if (failureCount >= 1) return false;
  return err instanceof AdminApiError && (err.status === 0 || err.status >= 500);
}

type SessionEndedHandler = (err: AdminApiError) => void;
let sessionEndedHandler: SessionEndedHandler | null = null;

/** AdminContext registers here; returns the unregister function. */
export function setAdminSessionEndedHandler(handler: SessionEndedHandler): () => void {
  sessionEndedHandler = handler;
  return () => {
    if (sessionEndedHandler === handler) sessionEndedHandler = null;
  };
}

export interface AdminFetchOptions extends Omit<RequestInit, 'body'> {
  /** Sent as JSON, or as-is when it is FormData. */
  body?: unknown;
  /**
   * false for the few endpoints where a 401 is an answer about the request,
   * not the session: login (bad credentials) and change-password (wrong
   * current password).
   */
  sessionAware?: boolean;
}

/** Call `${API_BASE_URL}${path}` as the signed-in admin; resolves with the parsed JSON. */
export async function adminFetch<T = unknown>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { body, sessionAware = true, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);
  const token = getAdminToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...rest, headers, body: payload });
  } catch {
    throw new AdminApiError(fallbackMessage(0), 0);
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = (data && typeof data === 'object' ? data : {}) as { code?: unknown; category?: unknown };
    const code = typeof record.code === 'string' ? record.code : undefined;
    const category = typeof record.category === 'string' ? record.category : undefined;
    const error = new AdminApiError(serverErrorText(data, fallbackMessage(response.status)), response.status, code, category);
    if (sessionAware && endsAdminSession(response.status, category)) sessionEndedHandler?.(error);
    throw error;
  }
  return data as T;
}
