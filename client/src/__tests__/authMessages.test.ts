import { describe, it, expect } from 'vitest';
import { authFailureMessage, loginErrorMessage } from '../utils/authMessages';

describe('loginErrorMessage', () => {
  it('explains every code the API sends back to /login', () => {
    for (const code of [
      'google-auth-failed', 'google-cancelled', 'google-expired', 'google-session', 'google-unavailable', 'google-email-unverified',
      'google-doctor-signup', 'account-pending', 'account-rejected', 'account-suspended', 'admin-account',
    ]) {
      expect(loginErrorMessage(code)).toMatch(/\w/);
    }
    expect(loginErrorMessage('account-pending')).toMatch(/awaiting approval/);
  });

  it('shows nothing without a code, and a generic failure for one it does not know', () => {
    expect(loginErrorMessage(null)).toBeNull();
    expect(loginErrorMessage('')).toBeNull();
    expect(loginErrorMessage('<script>')).toBe(loginErrorMessage('google-auth-failed'));
    expect(loginErrorMessage('toString')).toBe(loginErrorMessage('google-auth-failed'));
  });
});

describe('authFailureMessage', () => {
  it('prefers the field errors the server named', () => {
    expect(authFailureMessage({ message: 'Validation failed', errors: { email: 'Invalid email format', phoneNo: 'Bad phone' } }, 'x'))
      .toBe('Invalid email format, Bad phone');
  });

  it('falls back to the message when errors is empty — not to an empty string', () => {
    // An empty `errors: {}` used to join to '', which the form then showed
    // as "Network error. Please try again."
    expect(authFailureMessage({ message: 'You are registered as a patient.', errors: {} }, 'x')).toBe('You are registered as a patient.');
  });

  it('falls back to the caller\'s text for a body with nothing usable', () => {
    expect(authFailureMessage({}, 'Login failed.')).toBe('Login failed.');
    expect(authFailureMessage(null, 'Login failed.')).toBe('Login failed.');
    expect(authFailureMessage({ message: '   ' }, 'Login failed.')).toBe('Login failed.');
  });
});
