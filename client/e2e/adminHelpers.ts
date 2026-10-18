/**
 * Shared helpers for the admin specs.
 *
 * Admin auth rides on the httpOnly `adminToken` cookie the server sets at
 * login — the console no longer keeps the token anywhere script can read it.
 * A test signs in by placing that cookie. Vite proxies /api on the same host,
 * and cookies are not port-scoped, so one cookie on `localhost` reaches both
 * the dev server and the API behind it.
 *
 * Some specs need fixtures that no endpoint can create on demand (a completed
 * session last week, bank details awaiting review). Those are written straight
 * into the stack's throwaway in-memory MongoDB, whose URI the fixture manifest
 * records — the same approach the stack itself uses to seed.
 */
import { createRequire } from 'module';
import path from 'path';
import { BrowserContext, APIRequestContext, Page, expect } from '@playwright/test';
import { fixtures, mailSink, API_URL } from './fixtures';

const serverRequire = createRequire(path.resolve(process.cwd(), '../server/package.json'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { MongoClient, ObjectId } = serverRequire('mongodb') as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = serverRequire('jsonwebtoken') as any;

/** The e2e stack's admin-realm secret (server/scripts/e2e-stack.js). */
const E2E_ADMIN_JWT_SECRET = 'e2e-admin-realm-secret-distinct';

export { ObjectId };

export async function setAdminCookie(context: BrowserContext, token: string) {
  await context.addCookies([{ name: 'adminToken', value: token, domain: 'localhost', path: '/' }]);
}

/** Signed in as the seeded super admin, by cookie. */
export async function asSuperAdmin(context: BrowserContext) {
  await setAdminCookie(context, fixtures().adminToken);
}

/** An admin-realm token that expired a minute ago. */
export function expiredAdminToken(): string {
  const { users } = fixtures();
  return jwt.sign(
    { userId: users.superAdmin.id, role: 'super_admin', exp: Math.floor(Date.now() / 1000) - 60 },
    E2E_ADMIN_JWT_SECRET
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function db(): Promise<any> {
  if (!client) {
    client = new MongoClient(fixtures().mongoUri);
    await client.connect();
  }
  return client.db();
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
  }
}

/** A mutation through the API the way the browser makes one: with the CSRF double-submit. */
export async function apiSend(
  request: APIRequestContext,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  urlPath: string,
  data?: unknown,
  headers: Record<string, string> = {}
) {
  const tokenRes = await request.get(`${API_URL}/csrf-token`);
  const { csrfToken } = await tokenRes.json();
  return request.fetch(`${API_URL}${urlPath}`, {
    method,
    headers: { 'X-CSRF-Token': csrfToken, ...headers },
    data,
  });
}

export const superAdminHeaders = () => ({ Authorization: `Bearer ${fixtures().adminToken}` });

/** Unique per run: the stack is reused between local runs. */
export const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** The newest signup code mailed to an address, waiting for the sink to catch up. */
export async function waitForOtp(email: string): Promise<string> {
  let code: string | null = null;
  await expect.poll(() => {
    const entries = mailSink().filter(
      (e) => e.fn === 'sendOTPEmail' && String(e.args?.[0]).toLowerCase() === email.toLowerCase()
    );
    const last = entries[entries.length - 1];
    code = last ? String(last.args?.[1] ?? '') : null;
    return code && /^\d{6}$/.test(code) ? code : null;
  }, { timeout: 15_000 }).not.toBeNull();
  return code as unknown as string;
}

/** The newest admin password-reset link mailed to an address. */
export async function waitForAdminResetUrl(email: string): Promise<string> {
  let url: string | null = null;
  await expect.poll(() => {
    const entries = mailSink().filter((e) => {
      if (e.fn !== 'sendAdminPasswordResetEmail') return false;
      const to = e.args?.[0] as { email?: string } | string | undefined;
      const address = typeof to === 'string' ? to : to?.email;
      return String(address).toLowerCase() === email.toLowerCase();
    });
    const last = entries[entries.length - 1];
    url = last ? String(last.args?.[1] ?? '') : null;
    return url && url.includes('/admin/reset-password/') ? url : null;
  }, { timeout: 15_000 }).not.toBeNull();
  return url as unknown as string;
}

/**
 * A new admin account, all the way through the real signup: register, the
 * mailed code, verify — then approved by the super admin through the API.
 */
export async function createApprovedAdmin(request: APIRequestContext, password = 'AdminPass123!') {
  const id = stamp();
  const email = `e2e.newadmin.${id}@veraawell.test`;
  const register = await apiSend(request, 'POST', '/auth/register', {
    role: 'admin', firstName: 'Fresh', lastName: `Admin${id}`, email, username: `e2e.newadmin.${id}`, password,
  });
  expect(register.status(), await register.text()).toBe(201);
  const otp = await waitForOtp(email);
  const verify = await apiSend(request, 'POST', '/auth/verify-signup', { email, otp });
  expect(verify.status(), await verify.text()).toBe(200);
  await approveAdminByEmail(request, email);
  return { email, password };
}

export async function approveAdminByEmail(request: APIRequestContext, email: string) {
  const pending = await request.get(`${API_URL}/admin/approvals/admins/pending`, { headers: superAdminHeaders() });
  const row = ((await pending.json()) as Array<{ _id: string; email: string }>).find((a) => a.email === email);
  expect(row, `pending admin ${email}`).toBeTruthy();
  const res = await apiSend(request, 'POST', `/admin/approvals/admins/${row!._id}/approve`, undefined, superAdminHeaders());
  expect(res.status()).toBe(200);
}

/** Sign in through the admin login form. */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto('/admin-login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

/** The console's sidebar — scoped so a tab label never matches page content. */
export const sidebar = (page: Page) => page.locator('nav');

/**
 * A therapist whose bank details are in a given review state, written directly:
 * there is no endpoint that submits bank details on a doctor's behalf.
 */
export async function createDoctorWithBankDetails(status: 'pending_admin_approval' | 'approved' | 'rejected', label = 'Bank') {
  const database = await db();
  const id = stamp();
  const userId = new ObjectId();
  const email = `e2e.bank.${id}@veraawell.test`;
  const accountNumber = `9${id}`.slice(0, 14).padEnd(12, '7');
  const now = new Date();
  await database.collection('users').insertOne({
    _id: userId,
    firstName: 'Payee',
    lastName: `${label}${id}`,
    email,
    username: email,
    password: 'not-a-login-account',
    role: 'doctor',
    approvalStatus: 'approved',
    status: 'active',
    isVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const submittedAt = new Date(now.getTime() - 60_000);
  await database.collection('doctorprofiles').insertOne({
    userId,
    specialization: ['Clinical Psychologist'],
    payoutApproved: status === 'approved',
    payoutApprovedAt: status === 'approved' ? now : null,
    payoutBankStatus: status,
    payoutRejectionReason: status === 'rejected' ? 'Name mismatch' : null,
    payoutBank: {
      accountHolderName: `Payee ${label} ${id}`,
      accountNumber,
      ifsc: 'HDFC0001234',
      panNumber: 'ABCDE1234F',
      submittedAt,
    },
    createdAt: now,
    updatedAt: now,
  });
  return { userId, email, name: `Payee ${label}${id}`, accountHolderName: `Payee ${label} ${id}`, accountNumber, submittedAt };
}

/** A delivered, paid session that ended `daysAgo` days ago — what a payout run pays for. */
export async function createPayableSession(doctorId: unknown, { daysAgo = 8, price = 1500, platformFee = 300 } = {}) {
  const database = await db();
  const { users } = fixtures();
  const endsAt = new Date(Date.now() - daysAgo * 864e5);
  const startsAt = new Date(endsAt.getTime() - 60 * 60_000);
  const res = await database.collection('sessions').insertOne({
    patientId: new ObjectId(users.patientA.id),
    doctorId,
    startsAt,
    endsAt,
    sessionDate: startsAt,
    duration: 60,
    price,
    platformFee,
    doctorEarnings: price - platformFee,
    status: 'completed',
    paymentStatus: 'paid',
    paymentId: `pay_e2e_${stamp()}`,
    doctorJoined: true,
    payoutId: null,
    callMode: 'Video Calling',
    createdAt: startsAt,
    updatedAt: endsAt,
  });
  return res.insertedId;
}
