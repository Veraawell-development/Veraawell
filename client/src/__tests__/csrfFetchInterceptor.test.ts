import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The fetch wrapper every API call in the app goes through.
 *
 * Production runs the client on veraawell.com and the API on
 * api.veraawell.com, so every one of these behaviours only shows up
 * cross-origin — which is exactly what local dev (Vite proxying /api) hides.
 * These tests pin the page to the production hostname so API_CONFIG resolves
 * to the absolute API URL, the same as it does in the browser.
 */

const API = 'https://api.veraawell.com/api';

type Call = { url: string; init: RequestInit | undefined; input: RequestInfo | URL };

let calls: Call[];
let csrfTokens: string[];
let respond: (call: Call) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const call = { url, init, input };
  if (url === `${API}/csrf-token`) {
    const token = csrfTokens.shift() ?? 'exhausted';
    return json(200, { csrfToken: token });
  }
  calls.push(call);
  return respond(call);
});

async function load(pagePath = '/doctor/abc') {
  vi.resetModules();
  vi.stubGlobal('window', {
    location: { hostname: 'veraawell.com', href: `https://veraawell.com${pagePath}`, pathname: pagePath },
    fetch: mockFetch,
  });
  vi.stubGlobal('fetch', mockFetch);
  const mod = await import('../utils/csrfFetchInterceptor');
  const tokens = await import('../utils/csrfToken');
  const auth = await import('../utils/authToken');
  return { ...mod, ...tokens, ...auth, apiFetch: mod.createApiFetch(mockFetch as unknown as typeof fetch) };
}

function headersOf(call: Call): Headers {
  if (call.init?.headers) return new Headers(call.init.headers);
  if (call.input instanceof Request) return call.input.headers;
  return new Headers();
}

beforeEach(() => {
  calls = [];
  csrfTokens = ['token-1', 'token-2', 'token-3'];
  respond = () => json(200, { ok: true });
  mockFetch.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('credentials', () => {
  it('sends cookies on a cross-origin API mutation that did not ask for them', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/payments/verify`, { method: 'POST', body: '{}' });
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('sends cookies on GETs too', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/sessions/doctor`);
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('keeps a credentials mode the caller chose explicitly', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/health`, { credentials: 'omit' });
    expect(calls[0].init?.credentials).toBe('omit');
  });

  it('leaves requests to other origins untouched', async () => {
    const { apiFetch } = await load();
    const init = { method: 'POST', body: 'x' };
    await apiFetch('https://api.cloudinary.com/v1_1/upload', init);
    expect(calls[0].init).toBe(init);
    expect(mockFetch).not.toHaveBeenCalledWith(`${API}/csrf-token`, expect.anything());
  });

  it('does not treat a lookalike host or path as the API', async () => {
    const { isApiUrl } = await load();
    expect(isApiUrl(`${API}/sessions`)).toBe(true);
    expect(isApiUrl(API)).toBe(true);
    expect(isApiUrl('https://api.veraawell.com.evil.test/api/sessions')).toBe(false);
    expect(isApiUrl('https://api.veraawell.com/apix')).toBe(false);
    expect(isApiUrl('/api/sessions')).toBe(false); // same-origin path, not the API host
  });
});

describe('Authorization header', () => {
  for (const value of ['Bearer null', 'Bearer undefined', 'Bearer ', 'Bearer']) {
    it(`drops "${value}" so the cookie session is used instead`, async () => {
      const { apiFetch } = await load();
      await apiFetch(`${API}/protected`, { headers: { Authorization: value } });
      expect(headersOf(calls[0]).has('Authorization')).toBe(false);
    });
  }

  it('keeps a real bearer token', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/protected`, { headers: { Authorization: 'Bearer eyJ.abc.def' } });
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer eyJ.abc.def');
  });

  it('keeps other headers when it drops the empty one', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer null' },
      body: '{}',
    });
    const h = headersOf(calls[0]);
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.has('Authorization')).toBe(false);
  });
});

describe('in-memory session token', () => {
  // Safari may not send the session cookie to api.veraawell.com at all; the
  // in-memory token is the fallback, and most call sites never attached it.
  it('is attached when the request has no Authorization header', async () => {
    const { apiFetch, setAuthTokenInMemory } = await load();
    setAuthTokenInMemory('eyJ.session.tok');
    await apiFetch(`${API}/auth/patient-profile`, { method: 'POST', body: '{}' });
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer eyJ.session.tok');
  });

  it('replaces a "Bearer null" header', async () => {
    const { apiFetch, setAuthTokenInMemory } = await load();
    setAuthTokenInMemory('eyJ.session.tok');
    await apiFetch(`${API}/profile/signature`, { method: 'PUT', headers: { Authorization: 'Bearer null' }, body: '{}' });
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer eyJ.session.tok');
  });

  it("doesn't override a header the caller set", async () => {
    const { apiFetch, setAuthTokenInMemory } = await load();
    setAuthTokenInMemory('eyJ.session.tok');
    await apiFetch(`${API}/x`, { headers: { Authorization: 'Bearer other' } });
    expect(headersOf(calls[0]).get('Authorization')).toBe('Bearer other');
  });

  it('is not sent with nothing to send', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/x`);
    expect(headersOf(calls[0]).has('Authorization')).toBe(false);
  });

  it('is kept off admin API calls and the admin console', async () => {
    let ctx = await load();
    ctx.setAuthTokenInMemory('eyJ.session.tok');
    await ctx.apiFetch(`${API}/admin/users`);
    expect(headersOf(calls[0]).has('Authorization')).toBe(false);

    calls = [];
    ctx = await load('/super-admin-dashboard');
    ctx.setAuthTokenInMemory('eyJ.session.tok');
    await ctx.apiFetch(`${API}/articles`, { method: 'POST', body: '{}' });
    expect(headersOf(calls[0]).has('Authorization')).toBe(false);
  });

  it("is kept off a request that asked for credentials: 'omit'", async () => {
    const { apiFetch, setAuthTokenInMemory } = await load();
    setAuthTokenInMemory('eyJ.session.tok');
    await apiFetch(`${API}/health`, { credentials: 'omit' });
    expect(headersOf(calls[0]).has('Authorization')).toBe(false);
  });
});

describe('CSRF header', () => {
  it('is attached to mutations', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/sessions/1/cancel`, { method: 'PATCH', body: '{}' });
    expect(headersOf(calls[0]).get('X-CSRF-Token')).toBe('token-1');
  });

  it('is not attached to GETs, and GETs do not fetch a token', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/sessions/doctor`);
    expect(headersOf(calls[0]).has('X-CSRF-Token')).toBe(false);
    expect(csrfTokens).toEqual(['token-1', 'token-2', 'token-3']);
  });

  it('is fetched once and reused', async () => {
    const { apiFetch } = await load();
    await apiFetch(`${API}/a`, { method: 'POST' });
    await apiFetch(`${API}/b`, { method: 'DELETE' });
    expect(headersOf(calls[0]).get('X-CSRF-Token')).toBe('token-1');
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-1');
  });
});

describe('403 handling', () => {
  it('retries once with a fresh token when the server says the CSRF token was rejected', async () => {
    const { apiFetch } = await load();
    let n = 0;
    respond = () => (n++ === 0
      ? json(403, { success: false, category: 'csrf', code: 'CSRF_TOKEN_INVALID' })
      : json(200, { ok: true }));

    const res = await apiFetch(`${API}/profile/pricing`, { method: 'PUT', body: JSON.stringify({ price: 500 }) });

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(headersOf(calls[0]).get('X-CSRF-Token')).toBe('token-1');
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-2');
    expect(calls[1].init?.body).toBe(JSON.stringify({ price: 500 }));
    expect(calls[1].init?.credentials).toBe('include');
  });

  it('retries only once', async () => {
    const { apiFetch } = await load();
    respond = () => json(403, { category: 'csrf', code: 'CSRF_TOKEN_MISSING' });
    const res = await apiFetch(`${API}/x`, { method: 'POST', body: 'a' });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(2);
  });

  it('hands the caller a readable body after a failed retry', async () => {
    const { apiFetch } = await load();
    respond = () => json(403, { category: 'csrf', message: 'CSRF token missing' });
    const res = await apiFetch(`${API}/x`, { method: 'POST', body: 'a' });
    expect((await res.json()).message).toBe('CSRF token missing');
  });

  it('replays FormData, URLSearchParams and Blob bodies', async () => {
    const { apiFetch } = await load();
    for (const body of [new FormData(), new URLSearchParams('a=1'), new Blob(['x'])]) {
      calls = [];
      let n = 0;
      respond = () => (n++ === 0 ? json(403, { category: 'csrf' }) : json(200, {}));
      const res = await apiFetch(`${API}/upload`, { method: 'POST', body });
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(2);
      expect(calls[1].init?.body).toBe(body);
    }
  });

  it('does not replay a stream body, but still drops the stale token', async () => {
    const { apiFetch } = await load();
    respond = () => json(403, { category: 'csrf' });
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } });
    const res = await apiFetch(`${API}/x`, { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(1);

    respond = () => json(200, {});
    await apiFetch(`${API}/y`, { method: 'POST' });
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-2');
  });

  it('does not invalidate the token or retry on an authorization 403', async () => {
    const { apiFetch } = await load();
    respond = () => json(403, { success: false, category: 'authz', code: 'AUTHZ_WRONG_ROLE' });
    const res = await apiFetch(`${API}/sessions/1/missed`, { method: 'POST' });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(1);

    respond = () => json(200, {});
    await apiFetch(`${API}/y`, { method: 'POST' });
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-1');
  });

  it('does not treat a non-JSON 403 as a CSRF rejection', async () => {
    const { apiFetch } = await load();
    respond = () => new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
    const res = await apiFetch(`${API}/x`, { method: 'POST' });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(1);
  });
});

describe('Request objects', () => {
  it('reads the URL and method from the Request and applies the same rules', async () => {
    const { apiFetch } = await load();
    const req = new Request(`${API}/payments/verify`, {
      method: 'POST',
      headers: { Authorization: 'Bearer null', 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
    await apiFetch(req);
    const h = headersOf(calls[0]);
    expect(h.get('X-CSRF-Token')).toBe('token-1');
    expect(h.has('Authorization')).toBe(false);
    expect(h.get('Content-Type')).toBe('application/json');
    expect(calls[0].init?.credentials).toBe('include');
  });

  it('retries a Request with its body intact', async () => {
    const { apiFetch } = await load();
    const seenBodies: string[] = [];
    let n = 0;
    respond = async (call) => {
      // Consume the body the way a real network send would.
      const sent = new Request(call.input as Request, call.init);
      seenBodies.push(await sent.text());
      return n++ === 0 ? json(403, { category: 'csrf' }) : json(200, {});
    };
    const req = new Request(`${API}/x`, { method: 'POST', body: 'payload' });
    const res = await apiFetch(req);
    expect(res.status).toBe(200);
    expect(seenBodies).toEqual(['payload', 'payload']);
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-2');
  });

  it("respects a Request's explicit credentials: 'omit'", async () => {
    const { apiFetch } = await load();
    await apiFetch(new Request(`${API}/health`, { credentials: 'omit' }));
    expect(calls[0].init?.credentials).toBe('omit');
  });
});

describe('installCsrfFetchInterceptor', () => {
  it('replaces window.fetch once', async () => {
    const { installCsrfFetchInterceptor } = await load();
    const w = window as unknown as { fetch: typeof fetch };
    installCsrfFetchInterceptor();
    const wrapped = w.fetch;
    expect(wrapped).not.toBe(mockFetch);
    installCsrfFetchInterceptor();
    expect(w.fetch).toBe(wrapped);

    await w.fetch(`${API}/a`, { method: 'POST' });
    expect(calls[0].init?.credentials).toBe('include');
  });
});

describe('invalidateCsrfToken', () => {
  it('forces the next mutation to fetch a new token (used on logout)', async () => {
    const { apiFetch, invalidateCsrfToken } = await load();
    await apiFetch(`${API}/a`, { method: 'POST' });
    invalidateCsrfToken();
    await apiFetch(`${API}/b`, { method: 'POST' });
    expect(headersOf(calls[1]).get('X-CSRF-Token')).toBe('token-2');
  });
});

describe('a session the API turns away', () => {
  async function loadWithListener(pagePath?: string) {
    const loaded = await load(pagePath);
    const events = await import('../utils/sessionEvents');
    const heard = vi.fn();
    events.onSessionRejected(heard);
    return { ...loaded, heard };
  }

  it('is reported on a 401 from any user API call, read or write', async () => {
    const { apiFetch, heard } = await loadWithListener();
    respond = () => json(401, { message: 'Invalid or expired token' });
    await apiFetch(`${API}/sessions/my-sessions`);
    await apiFetch(`${API}/session-tools/journal`, { method: 'POST', body: '{}' });
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('is reported on a 403 that refuses the account itself, and not on an ordinary 403', async () => {
    const { apiFetch, heard } = await loadWithListener();
    respond = () => json(403, { message: 'This account has been suspended', code: 'ACCOUNT_REFUSED' });
    await apiFetch(`${API}/sessions/my-sessions`);
    expect(heard).toHaveBeenCalledTimes(1);

    respond = () => json(403, { message: 'Insufficient permissions', category: 'authz' });
    await apiFetch(`${API}/sessions/someone-elses`);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('is not reported where a 401 is an answer: the session check, sign-in, sign-out', async () => {
    const { apiFetch, heard } = await loadWithListener();
    respond = () => json(401, { message: 'Invalid credentials' });
    await apiFetch(`${API}/protected`);
    await apiFetch(`${API}/auth/login`, { method: 'POST', body: '{}' });
    await apiFetch(`${API}/auth/logout`, { method: 'POST' });
    expect(heard).not.toHaveBeenCalled();
  });

  it('is not reported for the admin console, which has its own session', async () => {
    const onAdminPage = await loadWithListener('/super-admin-dashboard');
    respond = () => json(401, {});
    await onAdminPage.apiFetch(`${API}/sessions/x`);
    expect(onAdminPage.heard).not.toHaveBeenCalled();

    const adminApi = await loadWithListener('/patient-dashboard');
    await adminApi.apiFetch(`${API}/admin/approvals/doctors/pending`);
    expect(adminApi.heard).not.toHaveBeenCalled();
  });

  it('is not reported for an anonymous request or a success', async () => {
    const { apiFetch, heard } = await loadWithListener();
    respond = () => json(401, {});
    await apiFetch(`${API}/doctors`, { credentials: 'omit' });
    respond = () => json(200, { ok: true });
    await apiFetch(`${API}/sessions/my-sessions`);
    expect(heard).not.toHaveBeenCalled();
  });

  it('still hands the caller the response', async () => {
    const { apiFetch } = await loadWithListener();
    respond = () => json(401, { message: 'Invalid or expired token' });
    const res = await apiFetch(`${API}/sessions/my-sessions`);
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Invalid or expired token');
  });
});
