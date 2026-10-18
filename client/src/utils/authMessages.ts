/**
 * Words for the login page.
 *
 * The API sends a failed or refused Google sign-in back to
 * `/login?error=<code>`. The login page used to ignore the parameter, so
 * cancelling on Google's screen, or being refused as a practitioner still
 * awaiting approval, looked exactly like nothing having happened.
 */
const LOGIN_ERRORS: Record<string, string> = {
  'google-auth-failed': "Google sign-in didn't complete. Please try again.",
  'google-cancelled': 'Google sign-in was cancelled.',
  'google-session': "We couldn't finish signing you in with Google in this browser. Please try again, or sign in with your email and password.",
  'google-unavailable': "Google sign-in isn't available right now. Please sign in with your email and password.",
  'google-email-unverified': "Google hasn't verified this email address, so it can't be used to sign in to an existing account. Please sign in with your password.",
  'google-doctor-signup': 'Practitioners join Veraawell through the Join Us page. Already approved? Sign in with the email and password from your application.',
  'account-pending': 'Your practitioner account is awaiting approval. We will email you when you can sign in.',
  'account-rejected': 'Your practitioner application was not approved. Please check your email for details, or write to support@veraawell.com.',
  'account-suspended': 'This account has been suspended. Please contact support@veraawell.com.',
  'admin-account': 'Admin accounts sign in through the Admin Portal.',
};

/** The message for a `?error=` code, or null for none/unknown. */
export function loginErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code] : LOGIN_ERRORS['google-auth-failed'];
}

/**
 * The one line to show for a failed auth request. Field errors when the
 * server named any, else its message. `errors` arrives as `{}` on a
 * validation error with no fields, and joining that used to produce an empty
 * string — which the form then replaced with "Network error".
 */
export function authFailureMessage(data: unknown, fallback: string): string {
  const body = (data && typeof data === 'object' ? data : {}) as { errors?: unknown; message?: unknown };
  if (body.errors && typeof body.errors === 'object') {
    const fields = Object.values(body.errors as Record<string, unknown>).filter(
      (v): v is string => typeof v === 'string' && v.trim() !== ''
    );
    if (fields.length) return fields.join(', ');
  }
  if (typeof body.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}
