import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createRequire } from 'module';
import path from 'path';
import { mailSink, API_URL } from './fixtures';
import { apiSend, db, closeDb, stamp, superAdminHeaders, waitForOtp } from './adminHelpers';

/**
 * Patient and doctor authentication, end to end against the e2e stack: the
 * real API and database, mail captured to a sink so the codes and reset links
 * a person would read in their inbox can be read here.
 *
 * Every test makes its own accounts. The seeded patientA/doctorA are shared
 * with the dashboard specs, and several of these tests change a password.
 */

const serverRequire = createRequire(path.resolve(process.cwd(), '../server/package.json'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = serverRequire('jsonwebtoken') as any;
/** The e2e stack's user-realm secret (server/scripts/e2e-stack.js). */
const E2E_JWT_SECRET = 'e2e-user-realm-secret-do-not-reuse';

const PASSWORD = 'Wellness123!';
const uniqueEmail = (tag: string) => `e2e.auth.${tag}.${stamp()}@veraawell.test`;

// The dashboards are large lazy chunks: on a cold dev server the first one
// to open can take half a minute to compile.
test.beforeEach(() => {
  test.setTimeout(90_000);
});

test.afterAll(async () => {
  await closeDb();
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function openLogin(page: Page, url = '/login') {
  await page.context().clearCookies();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: /Welcome back|Create account/ })).toBeVisible();
}

async function signIn(page: Page, role: 'Patient' | 'Doctor', email: string, password: string) {
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByPlaceholder('Enter your email').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: `Sign In as ${role}` }).click();
}

const formError = (page: Page) => page.locator('.bg-red-50').first();

/**
 * A new account's dashboard opens with a "set up your profile" welcome, and a
 * patient's with a daily mood check-in after it. Closed in whatever order
 * they appear.
 */
async function dismissWelcome(page: Page) {
  const closers = page.getByRole('button', { name: "I'll do this later" })
    .or(page.getByRole('button', { name: 'Close', exact: true }))
    .or(page.getByRole('button', { name: 'Close modal', exact: true }));
  for (let i = 0; i < 3; i += 1) {
    const shown = await closers.first().waitFor({ state: 'visible', timeout: 4_000 }).then(() => true, () => false);
    if (!shown) return;
    await closers.first().click();
    await page.waitForTimeout(300);
  }
}

/** The dashboard's own way out: the menu drawer's "Sign Out". Lands on home, signed out. */
async function signOutFromMenu(page: Page) {
  await dismissWelcome(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByText('Sign Out', { exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
  await page.waitForLoadState('load');
  await expect.poll(() => sessionCookie(page)).toBeUndefined();
  // Signed-out home: the navbar offers sign-in again.
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({ timeout: 20_000 });
}

async function registerViaApi(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await apiSend(request, 'POST', '/auth/register', body);
  expect(res.status(), await res.text()).toBe(201);
}

/** A patient account, verified, made through the API. */
async function verifiedPatient(request: APIRequestContext, tag = 'patient') {
  const email = uniqueEmail(tag);
  await registerViaApi(request, {
    firstName: 'Asha', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543210', role: 'patient',
  });
  const verify = await apiSend(request, 'POST', '/auth/verify-signup', { email, otp: await waitForOtp(email) });
  expect(verify.status()).toBe(200);
  return email;
}

/** A practitioner application, verified — pending until an admin acts. */
async function pendingDoctor(request: APIRequestContext) {
  const email = uniqueEmail('doctor');
  await registerViaApi(request, {
    firstName: 'Dev', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543211', role: 'doctor',
    jobRole: 'Psychologist', specialization: 'Clinical Psychologist',
  });
  const verify = await apiSend(request, 'POST', '/auth/verify-signup', { email, otp: await waitForOtp(email) });
  expect(verify.status()).toBe(200);
  const body = await verify.json();
  // No session for an application nobody has reviewed yet.
  expect(body.requiresApproval).toBe(true);
  expect(body.token).toBeUndefined();
  expect(verify.headers()['set-cookie'] ?? '').not.toMatch(/(^|\n)token=/);

  const user = await (await db()).collection('users').findOne({ email });
  return { email, id: String(user._id) };
}

async function adminDecides(request: APIRequestContext, doctorId: string, decision: 'approve' | 'reject', reason?: string) {
  const res = await apiSend(request, 'POST', `/admin/approvals/doctors/${doctorId}/${decision}`,
    reason ? { reason } : {}, superAdminHeaders());
  expect(res.status(), await res.text()).toBe(200);
}

async function latestResetToken(email: string): Promise<string> {
  let token: string | null = null;
  await expect.poll(() => {
    const entries = mailSink().filter((e) => {
      if (e.fn !== 'sendPasswordResetEmail') return false;
      const to = e.args?.[0] as { email?: string } | undefined;
      return String(to?.email).toLowerCase() === email.toLowerCase();
    });
    const last = entries[entries.length - 1];
    token = last ? String(last.args?.[1] ?? '') : null;
    return token && /^[0-9a-f]{96}$/.test(token) ? token : null;
  }, { timeout: 15_000 }).not.toBeNull();
  return token as unknown as string;
}

async function sessionCookie(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === 'token');
}

// ── patient: sign up ─────────────────────────────────────────────────────────

test.describe('Patient sign-up', () => {
  test('sign up, a wrong code counts down, a resent code works, and the session survives a reload', async ({ page }) => {
    const email = uniqueEmail('signup');
    await openLogin(page, '/signup');

    await page.getByPlaceholder('Your full name').fill('Asha Rao');
    // A phone keyboard's autocomplete leaves a trailing space.
    await page.getByPlaceholder('rahul.sharma@gmail.com').fill(`${email} `);
    await page.getByPlaceholder('+91 84487 45066').fill('+91 98765 43210');
    await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
    await page.getByPlaceholder('Confirm Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();

    // The first request after the stack boots can take a few seconds.
    await expect(page.getByText('Check your email')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    const first = await waitForOtp(email);

    const wrong = first === '000000' ? '111111' : '000000';
    await page.getByPlaceholder('------').fill(wrong);
    await page.getByRole('button', { name: 'Verify Account' }).click();
    await expect(formError(page)).toHaveText('Invalid verification code. 4 attempts left.');

    // The resend button unlocks after its cooldown.
    const resend = page.getByRole('button', { name: 'Resend code', exact: true });
    await expect(resend).toBeEnabled({ timeout: 35_000 });
    await resend.click();
    await expect.poll(async () => (await waitForOtp(email)) !== first, { timeout: 15_000 }).toBe(true);
    const fresh = await waitForOtp(email);

    // The superseded code no longer works.
    await page.getByPlaceholder('------').fill(first);
    await page.getByRole('button', { name: 'Verify Account' }).click();
    await expect(formError(page)).toContainText('Invalid verification code');

    await page.getByPlaceholder('------').fill(fresh);
    await page.getByRole('button', { name: 'Verify Account' }).click();
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });

    expect(await sessionCookie(page)).toBeTruthy();
    await page.reload();
    await expect(page).toHaveURL(/patient-dashboard/);
  });

  test('the form checks phone, password and duplicates before sending a code', async ({ page, request }) => {
    const taken = await verifiedPatient(request, 'taken');
    await openLogin(page, '/signup');

    const fill = async (email: string, phone: string, password: string, confirm = password) => {
      await page.getByPlaceholder('Your full name').fill('Asha Rao');
      await page.getByPlaceholder('rahul.sharma@gmail.com').fill(email);
      await page.getByPlaceholder('+91 84487 45066').fill(phone);
      await page.getByPlaceholder('Password', { exact: true }).fill(password);
      await page.getByPlaceholder('Confirm Password').fill(confirm);
      await page.getByRole('button', { name: 'Create Account' }).click();
    };

    await fill(uniqueEmail('x'), '1234', PASSWORD);
    await expect(formError(page)).toHaveText('Please enter a valid phone number (10 to 15 digits)');

    await fill(uniqueEmail('x'), '9876543210', 'abc');
    await expect(formError(page)).toHaveText('Password must be at least 6 characters long');

    await fill(uniqueEmail('x'), '9876543210', PASSWORD, `${PASSWORD}x`);
    await expect(formError(page)).toHaveText('Passwords do not match');

    await fill(taken, '9876543210', PASSWORD);
    await expect(formError(page)).toHaveText('User already exists');
    await expect(page.getByText('Check your email')).toHaveCount(0);
  });

  test('signing in before verifying goes to the code step, and the code finishes the sign-in', async ({ page, request }) => {
    const email = uniqueEmail('unverified');
    await registerViaApi(request, {
      firstName: 'Asha', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543210', role: 'patient',
    });
    const original = await waitForOtp(email);

    await openLogin(page);
    await signIn(page, 'Patient', email, PASSWORD);
    await expect(page.getByText('Check your email')).toBeVisible();
    // Signing in mailed a fresh code; the old one is superseded.
    await expect.poll(async () => (await waitForOtp(email)) !== original, { timeout: 15_000 }).toBe(true);

    await page.getByPlaceholder('------').fill(await waitForOtp(email));
    await page.getByRole('button', { name: 'Verify Account' }).click();
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
  });

  test('a wrong password for an unverified signup does not reveal it or send a code', async ({ page, request }) => {
    const email = uniqueEmail('unverified2');
    await registerViaApi(request, {
      firstName: 'Asha', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543210', role: 'patient',
    });
    const sent = mailSink().filter((e) => e.fn === 'sendOTPEmail' && e.args?.[0] === email).length;

    await openLogin(page);
    await signIn(page, 'Patient', email, 'not-the-password');
    await expect(formError(page)).toHaveText('User not found. Please sign up first.');
    expect(mailSink().filter((e) => e.fn === 'sendOTPEmail' && e.args?.[0] === email).length).toBe(sent);
  });
});

// ── patient: sign in, out, and sessions that end ─────────────────────────────

test.describe('Patient sign-in', () => {
  test('signs in with a messy-cased, space-padded address and shows progress while it waits', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);

    // Hold the response so the in-flight state can be seen.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/auth/login', async (route) => {
      await held;
      await route.continue();
    });

    await signIn(page, 'Patient', `  ${email.toUpperCase()} `, PASSWORD);
    const busy = page.getByRole('button', { name: 'Signing in...' });
    await expect(busy).toBeVisible();
    await expect(busy).toBeDisabled();
    release();

    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
  });

  test('wrong password, unknown address and the wrong role each say what happened', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);

    await signIn(page, 'Patient', email, 'not-it-at-all');
    await expect(formError(page)).toHaveText('Invalid credentials');

    await signIn(page, 'Patient', uniqueEmail('nobody'), PASSWORD);
    await expect(formError(page)).toHaveText('User not found. Please sign up first.');

    await signIn(page, 'Doctor', email, PASSWORD);
    await expect(formError(page)).toHaveText('You are registered as a patient. Please use the correct role to login.');
    expect(await sessionCookie(page)).toBeUndefined();
  });

  test('sign out ends the session: the cookie goes and the dashboard asks for a sign-in', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);
    await signIn(page, 'Patient', email, PASSWORD);
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });

    await signOutFromMenu(page);

    await page.goto('/patient-dashboard');
    await page.waitForURL(/\/login\?redirect=%2Fpatient-dashboard/, { timeout: 20_000 });
  });

  test('a password changed on another device signs this one out cleanly, with the reason', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);
    await signIn(page, 'Patient', email, PASSWORD);
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });

    // Token times are whole seconds: let the change land in a later one.
    await page.waitForTimeout(1_100);
    const other = await apiSend(request, 'POST', '/auth/login', { username: email, password: PASSWORD, role: 'patient' });
    const { token } = await other.json();
    const change = await apiSend(request, 'PUT', '/auth/update-password',
      { currentPassword: PASSWORD, newPassword: 'Changed456!' }, { Authorization: `Bearer ${token}` });
    expect(change.status(), await change.text()).toBe(200);

    // Any request this tab makes now is refused. That used to leave it looking
    // signed in, every screen failing one call at a time, until a reload.
    await page.evaluate(() => fetch('/api/auth/profile'));

    await page.waitForURL(/\/login\?redirect=%2Fpatient-dashboard/, { timeout: 20_000 });
    await expect(page.getByText('Your password was changed. Please sign in again.')).toBeVisible();
    expect(await sessionCookie(page)).toBeUndefined();

    // And the new password gets them straight back to where they were.
    await signIn(page, 'Patient', email, 'Changed456!');
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
  });

  test('a dead session cookie is cleared on the next visit, quietly', async ({ page }) => {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'token', value: 'not-a-real-token', domain: 'localhost', path: '/' }]);
    await page.goto('/patient-dashboard');
    await page.waitForURL(/\/login\?redirect=/, { timeout: 20_000 });
    expect(await sessionCookie(page)).toBeUndefined();
    // A visitor with an old cookie is not shown an alarming toast.
    await expect(page.getByText('Your session has ended')).toHaveCount(0);
  });
});

// ── patient: password reset and change, account deletion ─────────────────────

test.describe('Patient password and account', () => {
  test('forgot password: the emailed link sets a new one, once', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/forgot-password/);
    // The sign-in form has an "Enter your email" field too, and stays on
    // screen while this page's code loads.
    await expect(page.getByRole('heading', { name: 'Forgot Password?' })).toBeVisible();

    const emailField = page.getByPlaceholder('Enter your email');
    await emailField.fill(` ${email} `);
    await expect(emailField).toHaveValue(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByText('If this email is registered, you will receive a reset link shortly.')).toBeVisible();

    const resetToken = await latestResetToken(email);
    await page.goto(`/reset-password?token=${resetToken}`);
    const fields = page.locator('input[type="password"]');
    await fields.nth(0).fill('Brandnew789!');
    await fields.nth(1).fill('Different789!');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();

    await fields.nth(1).fill('Brandnew789!');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.getByText(/Password reset successful/)).toBeVisible();
    await page.waitForURL('**/login', { timeout: 10_000 });

    await signIn(page, 'Patient', email, PASSWORD);
    await expect(formError(page)).toHaveText('Invalid credentials');
    await signIn(page, 'Patient', email, 'Brandnew789!');
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });

    // The link is single-use.
    const replay = await apiSend(request, 'POST', '/auth/reset-password', { token: resetToken, newPassword: 'Another789!' });
    expect(replay.status()).toBe(400);
    expect((await replay.json()).message).toBe('This reset link is invalid or has already been used. Please request a new one.');
  });

  test('an unknown address gets the same answer and no email', async ({ page }) => {
    const email = uniqueEmail('ghost');
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Forgot Password?' })).toBeVisible();
    await page.locator('input[type="email"]').fill(email);
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByText('If this email is registered, you will receive a reset link shortly.')).toBeVisible();
    expect(mailSink().some((e) => e.fn === 'sendPasswordResetEmail' && (e.args?.[0] as { email?: string })?.email === email)).toBe(false);
  });

  test('change password in settings keeps this session and retires the old password', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);
    await signIn(page, 'Patient', email, PASSWORD);
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Update Password' }).click();
    await page.getByPlaceholder('Current Password').fill('wrong-current-1');
    await page.getByPlaceholder('New Password', { exact: true }).fill('Settings789!');
    await page.getByPlaceholder('Confirm New Password').fill('Settings789!');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    // A wrong current password is an answer about the form — it must not
    // sign anyone out.
    await expect(page.getByText('Incorrect current password')).toBeVisible();
    await expect(page).toHaveURL(/\/settings/);

    await page.getByPlaceholder('Current Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Password updated successfully')).toBeVisible();

    // Still signed in here, after a reload too.
    await page.reload();
    await expect(page).toHaveURL(/\/settings/);

    const oldLogin = await apiSend(request, 'POST', '/auth/login', { username: email, password: PASSWORD });
    expect(oldLogin.status()).toBe(401);
    const newLogin = await apiSend(request, 'POST', '/auth/login', { username: email, password: 'Settings789!' });
    expect(newLogin.status()).toBe(200);
  });

  test('deleting the account signs out, goes home, and the address can sign up again', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await openLogin(page);
    await signIn(page, 'Patient', email, PASSWORD);
    await page.waitForURL('**/patient-dashboard', { timeout: 20_000 });
    await page.goto('/settings');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete Account' }).click();
    await page.waitForURL((url) => url.pathname === '/', { timeout: 20_000 });
    expect(await sessionCookie(page)).toBeUndefined();

    const login = await apiSend(request, 'POST', '/auth/login', { username: email, password: PASSWORD });
    expect(login.status()).toBe(401);
    const again = await apiSend(request, 'POST', '/auth/register', {
      firstName: 'Asha', lastName: '', email, username: email, password: PASSWORD, phoneNo: '9876543210', role: 'patient',
    });
    expect(again.status()).toBe(201);
  });
});

// ── Google ───────────────────────────────────────────────────────────────────

test.describe('Google sign-in', () => {
  test('the button starts a Google sign-in with a state check, for patients only', async ({ page, request }) => {
    const start = await request.get(`${API_URL}/auth/google?role=patient`, { maxRedirects: 0 });
    expect(start.status()).toBe(302);
    const google = new URL(start.headers().location);
    expect(google.hostname).toBe('accounts.google.com');
    // Without a state nonce the callback accepts anyone's authorization code.
    expect(google.searchParams.get('state')).toBeTruthy();

    await openLogin(page);
    await expect(page.getByRole('button', { name: 'Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Doctor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Google' })).toHaveCount(0);
  });

  test('a callback this browser never started is sent back to the login page, signed out', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/api/auth/google/callback?code=someone-elses-code&state=forged');
    await page.waitForURL(/\/login/, { timeout: 20_000 });
    await expect(formError(page)).toHaveText('That Google sign-in expired or was started in another browser. Please try again.');
    expect(await sessionCookie(page)).toBeUndefined();
  });

  for (const [code, text] of [
    ['google-cancelled', 'Google sign-in was cancelled.'],
    ['account-pending', 'Your practitioner account is awaiting approval. We will email you when you can sign in.'],
    ['account-suspended', 'This account has been suspended. Please contact support@veraawell.com.'],
    ['google-doctor-signup', 'Practitioners join Veraawell through the Join Us page.'],
  ] as const) {
    test(`a refused or failed Google sign-in (${code}) is explained, once`, async ({ page }) => {
      await openLogin(page, `/login?redirect=%2Fmessages&error=${code}`);
      await expect(formError(page)).toContainText(text);
      // Dropped from the address, so a refresh doesn't repeat it; the
      // destination is kept.
      await expect(page).toHaveURL(/\/login\?redirect=%2Fmessages$/);
    });
  }

  test('coming back from Google goes straight to the dashboard — the landing page never flashes', async ({ page, request }) => {
    const email = await verifiedPatient(request);
    await page.context().clearCookies();
    // The session cookie Google's callback sets, set the same way here.
    const login = await apiSend(page.request, 'POST', '/auth/login', { username: email, password: PASSWORD, role: 'patient' });
    expect(login.status()).toBe(200);

    // Watch for the landing page's hero at any moment, and slow the session
    // check so a flash could not slip between two looks.
    await page.addInitScript(() => {
      (window as unknown as { landingSeen: boolean }).landingSeen = false;
      new MutationObserver(() => {
        const h1 = document.querySelector('h1');
        if (h1 && /Your mind/.test(h1.textContent || '')) (window as unknown as { landingSeen: boolean }).landingSeen = true;
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.route('**/api/protected', async (route) => {
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });

    await page.goto('/?auth=success&role=patient');
    await page.waitForURL('**/patient-dashboard', { timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { landingSeen: boolean }).landingSeen)).toBe(false);
  });

  test('coming back from Google with no session lands on an explanation, not a bounce', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/?auth=success&role=patient');
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    await expect(formError(page)).toContainText("We couldn't finish signing you in with Google");
  });
});

// ── doctor ───────────────────────────────────────────────────────────────────

test.describe('Doctor sign-in', () => {
  test('pending: refused with the reason; approved: signed in; signed out cleanly', async ({ page, request }) => {
    const doctor = await pendingDoctor(request);

    await openLogin(page);
    await signIn(page, 'Doctor', doctor.email, PASSWORD);
    await expect(formError(page)).toHaveText(
      'Your doctor account is pending approval. An admin will review your application soon.');
    expect(await sessionCookie(page)).toBeUndefined();

    await adminDecides(request, doctor.id, 'approve');

    await signIn(page, 'Doctor', doctor.email, PASSWORD);
    await page.waitForURL('**/doctor-dashboard', { timeout: 20_000 });
    await page.reload();
    await expect(page).toHaveURL(/doctor-dashboard/);

    // Signing in on the patient tab names the right one.
    const patientTab = await apiSend(request, 'POST', '/auth/login', { username: doctor.email, password: PASSWORD, role: 'patient' });
    expect((await patientTab.json()).message).toBe('You are registered as a doctor. Please use the correct role to login.');

    await signOutFromMenu(page);
    await page.goto('/doctor-dashboard');
    await page.waitForURL(/\/login\?redirect=%2Fdoctor-dashboard/, { timeout: 20_000 });
  });

  test('rejected: told so, with the admin\'s reason', async ({ page, request }) => {
    const doctor = await pendingDoctor(request);
    await adminDecides(request, doctor.id, 'reject', 'Licence number could not be verified');

    await openLogin(page);
    await signIn(page, 'Doctor', doctor.email, PASSWORD);
    await expect(formError(page)).toHaveText(
      'Your doctor account has been rejected. Reason: Licence number could not be verified');
    expect(await sessionCookie(page)).toBeUndefined();
  });

  test('an old session for an application still pending is ended, with the reason', async ({ page, request }) => {
    // verify-signup used to hand a pending applicant a 30-day cookie, which
    // opened the doctor dashboard before anyone had checked their licence.
    const doctor = await pendingDoctor(request);
    const old = jwt.sign({ userId: doctor.id, username: doctor.email, role: 'doctor' }, E2E_JWT_SECRET, { expiresIn: '30d' });

    await page.context().clearCookies();
    await page.context().addCookies([{ name: 'token', value: old, domain: 'localhost', path: '/' }]);
    await page.goto('/doctor-dashboard');
    await page.waitForURL(/\/login\?redirect=%2Fdoctor-dashboard/, { timeout: 20_000 });
    await expect(page.getByText('Your practitioner account is awaiting approval. We will email you when you can sign in.')).toBeVisible();
    expect(await sessionCookie(page)).toBeUndefined();
  });

  test('a doctor rejected while signed in is signed out on their next request', async ({ page, request }) => {
    const doctor = await pendingDoctor(request);
    await adminDecides(request, doctor.id, 'approve');

    await openLogin(page);
    await signIn(page, 'Doctor', doctor.email, PASSWORD);
    await page.waitForURL('**/doctor-dashboard', { timeout: 20_000 });

    await adminDecides(request, doctor.id, 'reject', 'Complaint upheld');
    await page.evaluate(() => fetch('/api/auth/profile'));

    await page.waitForURL(/\/login\?redirect=%2Fdoctor-dashboard/, { timeout: 20_000 });
    await expect(page.getByText('This practitioner account has been rejected')).toBeVisible();
    expect(await sessionCookie(page)).toBeUndefined();
  });

  test('forgot password works for a doctor too', async ({ page, request }) => {
    const doctor = await pendingDoctor(request);
    await adminDecides(request, doctor.id, 'approve');

    const forgot = await apiSend(request, 'POST', '/auth/forgot-password', { email: doctor.email });
    expect(forgot.status()).toBe(200);
    await page.context().clearCookies();
    await page.goto(`/reset-password?token=${await latestResetToken(doctor.email)}`);
    const fields = page.locator('input[type="password"]');
    await fields.nth(0).fill('DoctorNew789!');
    await fields.nth(1).fill('DoctorNew789!');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await page.waitForURL('**/login', { timeout: 10_000 });

    await signIn(page, 'Doctor', doctor.email, 'DoctorNew789!');
    await page.waitForURL('**/doctor-dashboard', { timeout: 20_000 });
  });
});
