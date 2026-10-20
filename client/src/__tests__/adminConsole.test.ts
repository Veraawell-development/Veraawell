import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveAdminTab, tabsForRole, isTabAllowed, ADMIN_TABS } from '../utils/adminTabs';
import { isPeriodKey, isInterruptedLock, isReadyToPay, needsTransferReference, canMarkPaid } from '../utils/payoutRules';
import { isReviewPublic } from '../utils/reviewVisibility';
import { formatPlatformDate, formatPlatformDateTime, formatPlatformLocalDate } from '../utils/dateUtils';

/**
 * The admin console's pure rules: who may open which tab, what the payout
 * screen offers, what the review screen calls public, how dates read. These
 * are the decisions that, done wrong, put a super-admin screen in front of a
 * normal admin or a "Mark paid" button on a payout with no amount.
 */

describe('admin tabs', () => {
  it('gives a super admin every tab', () => {
    expect(tabsForRole('super_admin')).toEqual([...ADMIN_TABS]);
  });

  it('gives a normal admin only analytics, doctors and reviews', () => {
    expect(tabsForRole('admin')).toEqual(['analytics', 'calls', 'doctors', 'reviews']);
  });

  it('gives an unknown role nothing', () => {
    expect(tabsForRole(undefined)).toEqual([]);
    expect(tabsForRole('patient')).toEqual([]);
  });

  it('never resolves a normal admin to a super-admin tab, whatever the source', () => {
    for (const tab of ['revenue', 'bankDetails', 'weeklyPayouts', 'admins', 'enquiries', 'articles']) {
      expect(isTabAllowed(tab, 'admin')).toBe(false);
      // location.state first, then the remembered tab
      expect(resolveAdminTab('admin', tab, tab)).toBe('analytics');
    }
  });

  it('takes the first allowed candidate', () => {
    expect(resolveAdminTab('admin', 'revenue', 'reviews')).toBe('reviews');
    expect(resolveAdminTab('super_admin', 'revenue', 'reviews')).toBe('revenue');
    expect(resolveAdminTab('super_admin', undefined, null, 'articles')).toBe('articles');
  });

  it('ignores junk', () => {
    expect(resolveAdminTab('super_admin', 'payouts', 42, { tab: 'revenue' }, '')).toBe('analytics');
    // 'payouts' was the retired onboarding tab: a remembered value must not resurrect it.
    expect(isTabAllowed('payouts', 'super_admin')).toBe(false);
  });
});

describe('payout rules', () => {
  it('accepts ISO week keys only', () => {
    expect(isPeriodKey('2026-W41')).toBe(true);
    expect(isPeriodKey(' 2026-W01 ')).toBe(true);
    for (const bad of ['2026-41', '2026-W4', '2026W41', '26-W41', '2026-w41', '', '2026-W41x']) {
      expect(isPeriodKey(bad)).toBe(false);
    }
  });

  it('calls a locked payout with null totals an interrupted lock', () => {
    expect(isInterruptedLock({ status: 'locked', totalsComputedAt: null })).toBe(true);
    expect(isReadyToPay({ status: 'locked', totalsComputedAt: null })).toBe(false);
  });

  it('treats a lock with totals, or from before the field existed, as ready to pay', () => {
    expect(isInterruptedLock({ status: 'locked', totalsComputedAt: '2026-10-13T00:00:00Z' })).toBe(false);
    expect(isReadyToPay({ status: 'locked', totalsComputedAt: '2026-10-13T00:00:00Z' })).toBe(true);
    expect(isInterruptedLock({ status: 'locked' })).toBe(false);
    expect(isReadyToPay({ status: 'locked' })).toBe(true);
  });

  it('never offers draft or paid payouts for payment', () => {
    expect(isReadyToPay({ status: 'draft', totalsComputedAt: null })).toBe(false);
    expect(isReadyToPay({ status: 'paid', totalsComputedAt: '2026-10-13T00:00:00Z' })).toBe(false);
    expect(isInterruptedLock({ status: 'draft', totalsComputedAt: null })).toBe(false);
  });

  it('requires a transfer reference only when money moves', () => {
    expect(needsTransferReference(1200)).toBe(true);
    expect(needsTransferReference(0)).toBe(false);
    expect(needsTransferReference(undefined)).toBe(false);
    expect(canMarkPaid(1200, '')).toBe(false);
    expect(canMarkPaid(1200, '   ')).toBe(false);
    expect(canMarkPaid(1200, 'N123')).toBe(true);
    expect(canMarkPaid(0, '')).toBe(true);
  });
});

describe('review visibility (mirrors Review.publicFilter)', () => {
  it('shows a doctor review nobody has moderated', () => {
    expect(isReviewPublic({ reviewType: 'doctor', reviewStatus: 'pending', approvedForDisplay: true, reviewedAt: null })).toBe(true);
    // legacy row: never approved, never looked at
    expect(isReviewPublic({ reviewType: 'doctor', reviewStatus: 'pending', approvedForDisplay: false })).toBe(true);
  });

  it('hides a doctor review an admin hid or flagged', () => {
    expect(isReviewPublic({ reviewType: 'doctor', reviewStatus: 'reviewed', approvedForDisplay: false, reviewedAt: '2026-10-01' })).toBe(false);
    expect(isReviewPublic({ reviewType: 'doctor', reviewStatus: 'flagged', approvedForDisplay: true, reviewedAt: '2026-10-01' })).toBe(false);
  });

  it('shows a platform review only once an admin approved it', () => {
    expect(isReviewPublic({ reviewType: 'platform', reviewStatus: 'pending', approvedForDisplay: false, reviewedAt: null })).toBe(false);
    // self-approved at submission by old code: no reviewedAt
    expect(isReviewPublic({ reviewType: 'platform', reviewStatus: 'pending', approvedForDisplay: true, reviewedAt: null })).toBe(false);
    expect(isReviewPublic({ reviewType: 'platform', reviewStatus: 'reviewed', approvedForDisplay: true, reviewedAt: '2026-10-01' })).toBe(true);
    expect(isReviewPublic({ reviewType: 'platform', reviewStatus: 'flagged', approvedForDisplay: true, reviewedAt: '2026-10-01' })).toBe(false);
  });
});

describe('platform dates (IST, whatever the machine zone)', () => {
  it('formats an instant on its IST calendar day', () => {
    // 20:00 UTC on 12 Oct is 01:30 IST on 13 Oct.
    expect(formatPlatformDate('2026-10-12T20:00:00.000Z')).toBe('13 Oct 2026');
    expect(formatPlatformDateTime('2026-10-12T20:00:00.000Z')).toBe('13 Oct 2026, 1:30 am');
  });

  it('formats a platform-local date without shifting it', () => {
    expect(formatPlatformLocalDate('2026-10-05')).toBe('5 Oct 2026');
    expect(formatPlatformLocalDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('shows a dash for missing or bad values', () => {
    expect(formatPlatformDate(null)).toBe('—');
    expect(formatPlatformDate('not a date')).toBe('—');
    expect(formatPlatformDateTime(undefined)).toBe('—');
    expect(formatPlatformLocalDate('2026-W41')).toBe('—');
  });
});

describe('adminApi', () => {
  type ApiModule = typeof import('../utils/adminApi');
  type TokenModule = typeof import('../utils/adminToken');
  let api: ApiModule;
  let tokens: TokenModule;
  const fetchMock = vi.fn();

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal('window', { location: { hostname: 'localhost', href: 'http://localhost:5173/super-admin-dashboard', pathname: '/super-admin-dashboard' } });
    vi.stubGlobal('fetch', fetchMock);
    api = await import('../utils/adminApi');
    tokens = await import('../utils/adminToken');
  });

  it('ends the session on a 401, and on a 403 unless it is an authz denial', () => {
    expect(api.endsAdminSession(401)).toBe(true);
    expect(api.endsAdminSession(403)).toBe(true);
    expect(api.endsAdminSession(403, 'csrf')).toBe(true);
    expect(api.endsAdminSession(403, 'authz')).toBe(false);
    for (const status of [0, 400, 404, 409, 429, 500, 502, 503]) {
      expect(api.endsAdminSession(status)).toBe(false);
    }
  });

  it("shows the server's message, with field errors when it sent them", () => {
    expect(api.serverErrorText({ message: 'This doctor has sessions' }, 'x')).toBe('This doctor has sessions');
    expect(api.serverErrorText({ message: 'Validation failed', errors: { email: 'Invalid email format', password: 'Too short' } }, 'x'))
      .toBe('Validation failed: Invalid email format. Too short');
    expect(api.serverErrorText({ errors: { a: 'A' } }, 'x')).toBe('A');
    expect(api.serverErrorText({ message: '   ' }, 'fallback')).toBe('fallback');
    expect(api.serverErrorText(null, 'fallback')).toBe('fallback');
    expect(api.serverErrorText('<html>', 'fallback')).toBe('fallback');
  });

  it('retries only what a retry can fix, once', () => {
    expect(api.adminQueryRetry(0, new api.AdminApiError('down', 0))).toBe(true);
    expect(api.adminQueryRetry(0, new api.AdminApiError('boom', 502))).toBe(true);
    expect(api.adminQueryRetry(1, new api.AdminApiError('boom', 502))).toBe(false);
    expect(api.adminQueryRetry(0, new api.AdminApiError('nope', 401))).toBe(false);
    expect(api.adminQueryRetry(0, new api.AdminApiError('conflict', 409))).toBe(false);
    expect(api.adminQueryRetry(0, new Error('other'))).toBe(false);
  });

  it('sends JSON with credentials and the in-memory token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    tokens.setAdminToken('tok-123');
    await api.adminFetch('/admin/x', { method: 'POST', body: { a: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/x');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"a":1}');
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer tok-123');
  });

  it('sends no Authorization header without a token (the cookie carries the session)', async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await api.adminFetch('/admin/x');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false);
  });

  it('throws the server message with status, code and category', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Week has not ended', code: 'PAYOUT_STATE' }));
    const err = await api.adminFetch('/admin/x').catch((e) => e);
    expect(err).toBeInstanceOf(api.AdminApiError);
    expect(err.message).toBe('Week has not ended');
    expect(err.status).toBe(409);
    expect(err.code).toBe('PAYOUT_STATE');
  });

  it('reports a lapsed session once, and not for authz denials or opted-out calls', async () => {
    const ended = vi.fn();
    api.setAdminSessionEndedHandler(ended);

    fetchMock.mockResolvedValueOnce(json(401, { message: 'Invalid or expired token' }));
    await api.adminFetch('/admin/x').catch(() => {});
    expect(ended).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(403, { message: 'Super admin privileges required', category: 'authz', code: 'AUTHZ_TIER_REQUIRED' }));
    await api.adminFetch('/admin/x').catch(() => {});
    expect(ended).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(401, { message: 'Current password is incorrect' }));
    const err = await api.adminFetch('/admin/auth/change-password', { method: 'POST', body: {}, sessionAware: false }).catch((e) => e);
    expect(err.message).toBe('Current password is incorrect');
    expect(ended).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(403, { message: 'Admin account is suspended' }));
    await api.adminFetch('/admin/x').catch(() => {});
    expect(ended).toHaveBeenCalledTimes(2);
  });

  it('turns a network failure into a status-0 error that does not end the session', async () => {
    const ended = vi.fn();
    api.setAdminSessionEndedHandler(ended);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await api.adminFetch('/admin/x').catch((e) => e);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Can't reach the server/);
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    const err502 = await api.adminFetch('/admin/x').catch((e) => e);
    expect(err502.status).toBe(502);
    expect(err502.message).toMatch(/server ran into a problem/);
    expect(ended).not.toHaveBeenCalled();
  });
});
