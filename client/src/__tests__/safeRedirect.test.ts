import { describe, it, expect } from 'vitest';
import { sanitizeRedirect, getRedirectFromSearch, loginPathFor } from '../utils/safeRedirect';

/**
 * `?redirect=` comes from the URL, so it is attacker-controlled: a link to
 * /login?redirect=https://evil.test must not send a freshly logged-in user
 * off-site.
 */
describe('sanitizeRedirect', () => {
  it('accepts in-app paths, with query and hash', () => {
    expect(sanitizeRedirect('/messages')).toBe('/messages');
    expect(sanitizeRedirect('/video-call/abc123')).toBe('/video-call/abc123');
    expect(sanitizeRedirect('/doctor-reports/p1?tab=notes#top')).toBe('/doctor-reports/p1?tab=notes#top');
  });

  it('rejects anything that leaves the origin', () => {
    for (const bad of [
      'https://evil.test',
      '//evil.test',
      '//evil.test/path',
      '/\\evil.test',
      '\\\\evil.test',
      'javascript:alert(1)',
      ' //evil.test',
      '/\t/evil.test',
      '/\n/evil.test',
      'evil.test',
      '',
    ]) {
      expect(sanitizeRedirect(bad)).toBeNull();
    }
  });

  it('rejects non-strings', () => {
    expect(sanitizeRedirect(null)).toBeNull();
    expect(sanitizeRedirect(undefined)).toBeNull();
    expect(sanitizeRedirect({ pathname: '/x' })).toBeNull();
  });

  it('will not bounce back to the login or signup page', () => {
    expect(sanitizeRedirect('/login')).toBeNull();
    expect(sanitizeRedirect('/login?redirect=/x')).toBeNull();
    expect(sanitizeRedirect('/signup/')).toBeNull();
  });
});

describe('getRedirectFromSearch', () => {
  it('decodes the parameter', () => {
    expect(getRedirectFromSearch('?redirect=%2Fvideo-call%2Fs1%3Fx%3D1')).toBe('/video-call/s1?x=1');
  });

  it('returns null when absent or unsafe', () => {
    expect(getRedirectFromSearch('')).toBeNull();
    expect(getRedirectFromSearch('?redirect=https%3A%2F%2Fevil.test')).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('round-trips through getRedirectFromSearch', () => {
    const path = loginPathFor('/doctor-reports/p1', '?tab=2');
    expect(path).toBe('/login?redirect=%2Fdoctor-reports%2Fp1%3Ftab%3D2');
    expect(getRedirectFromSearch(path.slice(path.indexOf('?')))).toBe('/doctor-reports/p1?tab=2');
  });
});
