import { test, expect, type Page } from '@playwright/test';
import { fixtures, latestOtpFor, mailSink, API_URL } from './fixtures';

/**
 * The careers page's "Join Us Now" card, end to end against the e2e stack:
 * real API, in-memory Mongo, Cloudinary stubbed, mail captured to a sink so the
 * OTP a real applicant would read from their inbox can be read here.
 *
 * public-careers.spec.ts mocks the OTP step and uploads nothing; these do
 * neither.
 */

const uniqueEmail = (tag: string) => `e2e.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e4)}@veraawell.test`;

async function openProfessionalTab(page: Page) {
  await page.context().clearCookies();
  await page.goto('/careers');
  await page.locator('button', { hasText: 'Join as Professional' }).click();
  await expect(page.locator('input[placeholder="John"]')).toBeVisible();
}

async function fillStep1(page: Page, { name = 'Asha Mehta', email = uniqueEmail('prof'), phone = '9876543210' } = {}) {
  await page.fill('input[placeholder="John"]', name);
  await page.fill('input[placeholder="john@example.com"]', email);
  await page.fill('input[placeholder="+91 98765 43210"]', phone);
  return email;
}

async function fillStep2(page: Page) {
  await page.locator('select').nth(0).selectOption({ label: 'Psychologist' });
  await page.locator('select').nth(1).selectOption({ label: 'Clinical Psychologist' });
  await page.fill('input[placeholder="Optional"]', 'RCI-12345');
  await page.locator('select').nth(2).selectOption({ label: 'LinkedIn' });
}

const next = (page: Page) => page.locator('button', { hasText: 'Next Step' }).click();
const PDF = { name: 'licence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%e2e\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') };

test.describe('Join as Professional — each step checks its own fields', () => {
  test('step 1 will not advance with blank fields', async ({ page }) => {
    await openProfessionalTab(page);
    await next(page);
    await expect(page.locator('input[placeholder="John"]')).toBeVisible();
    await expect(page.getByText(/enter your first name/i)).toBeVisible();
  });

  test('pressing Enter before the last step never submits the application', async ({ page }) => {
    await openProfessionalTab(page);
    let registerCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/register')) registerCalls += 1; });
    await fillStep1(page);
    await page.locator('input[placeholder="+91 98765 43210"]').press('Enter');
    await next(page);
    await page.locator('input[placeholder="Optional"]').press('Enter');
    await page.waitForTimeout(500);
    expect(registerCalls).toBe(0);
  });

  test('step 1 refuses a malformed email and a short phone number', async ({ page }) => {
    await openProfessionalTab(page);
    await fillStep1(page, { email: 'not-an-email' });
    await next(page);
    await expect(page.getByText(/valid email/i)).toBeVisible();

    await fillStep1(page, { phone: '12345' });
    await next(page);
    await expect(page.getByText(/valid phone/i)).toBeVisible();
    await expect(page.locator('input[placeholder="John"]')).toBeVisible();
  });

  test('step 2 needs a job role and a specialization', async ({ page }) => {
    await openProfessionalTab(page);
    await fillStep1(page);
    await next(page);
    await next(page);
    await expect(page.getByText(/job role/i).first()).toBeVisible();
    await expect(page.locator('input[placeholder="Min 6 characters"]')).toHaveCount(0);
  });

  test('mismatched or short passwords never reach the API', async ({ page }) => {
    await openProfessionalTab(page);
    await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await next(page);

    let registerCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/register')) registerCalls += 1; });

    await page.fill('input[placeholder="Min 6 characters"]', 'abc');
    await page.fill('input[placeholder="Re-enter password"]', 'abc');
    await page.locator('button', { hasText: 'Submit Application' }).click();
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible();

    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass124');
    await page.locator('button', { hasText: 'Submit Application' }).click();
    await expect(page.getByText(/do not match/i)).toBeVisible();
    expect(registerCalls).toBe(0);
  });

  test('a file that is not a PDF or image is refused before upload', async ({ page }) => {
    await openProfessionalTab(page);
    await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await next(page);
    await page.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText(/not a valid file type/i)).toBeVisible();
  });
});

test.describe('Join as Professional — the whole application, for real', () => {
  test('documents upload, the emailed code verifies, and the account waits for approval', async ({ page, request }) => {
    await openProfessionalTab(page);
    const email = await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await page.fill('textarea[placeholder*="Optional message"]', 'Eight years in clinical practice.');
    await next(page);

    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123');

    // Uploaded the moment it is chosen, with its status on screen.
    const uploaded = page.waitForResponse((r) => r.url().includes('/upload/doctor-document') && r.request().method() === 'POST');
    await page.locator('input[type="file"]').setInputFiles(PDF);
    expect((await uploaded).ok()).toBeTruthy();
    await expect(page.getByTestId('document-row')).toHaveAttribute('data-status', 'done');
    await expect(page.getByText('Uploaded')).toBeVisible();

    const registered = page.waitForResponse((r) => r.url().includes('/auth/register') && r.request().method() === 'POST');
    await page.locator('button', { hasText: 'Submit Application' }).click();
    const reg = await registered;
    expect(reg.ok(), await reg.text()).toBeTruthy();

    await expect(page.getByText(/6-digit verification code/i)).toBeVisible();
    await expect.poll(() => latestOtpFor(email), { timeout: 10000 }).not.toBeNull();
    const code = latestOtpFor(email)!;

    await page.fill('input[placeholder="000000"]', code);
    await page.locator('button', { hasText: 'Verify & Complete Application' }).click();
    await expect(page.getByText(/Application submitted successfully/i)).toBeVisible({ timeout: 10000 });

    // The account now exists, with its document, and cannot log in until an
    // admin approves it.
    const login = await request.post(`${API_URL}/auth/login`, { data: { username: email, password: 'SecurePass123', role: 'doctor' } });
    expect(login.status()).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await login.json())).toMatch(/pending|approv/i);

    const pending = await request.get(`${API_URL}/admin/approvals/doctors/pending`, {
      headers: { Authorization: `Bearer ${fixtures().adminToken}` }
    });
    expect(pending.ok()).toBeTruthy();
    const list = await pending.json();
    const rows = Array.isArray(list) ? list : (list.doctors || list.data || []);
    const applicant = rows.find((d: { email: string }) => d.email === email.toLowerCase());
    expect(applicant, 'applicant appears in the admin approval queue').toBeTruthy();
    expect(applicant.documents?.length).toBe(1);
    expect(applicant.documents[0].fileUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
  });

  test('a wrong code is refused, and a resent code works', async ({ page }) => {
    // Resend unlocks 30 seconds after a code is sent, as it would for a user.
    test.setTimeout(90_000);
    await openProfessionalTab(page);
    const email = await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await next(page);
    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123');
    await page.locator('button', { hasText: 'Submit Application' }).click();
    await expect.poll(() => latestOtpFor(email), { timeout: 10000 }).not.toBeNull();
    const first = latestOtpFor(email)!;

    const wrong = first === '000000' ? '111111' : '000000';
    await page.fill('input[placeholder="000000"]', wrong);
    await page.locator('button', { hasText: 'Verify & Complete Application' }).click();
    await expect(page.getByText(/invalid|incorrect|expired/i).first()).toBeVisible();

    const sentBefore = mailSink().filter((e) => e.fn === 'sendOTPEmail').length;
    const resend = page.getByRole('button', { name: /resend/i });
    await expect(resend).toBeEnabled({ timeout: 40_000 });
    await resend.click();
    await expect.poll(() => mailSink().filter((e) => e.fn === 'sendOTPEmail').length, { timeout: 10000 }).toBeGreaterThan(sentBefore);
    const second = latestOtpFor(email)!;

    await page.fill('input[placeholder="000000"]', second);
    await page.locator('button', { hasText: 'Verify & Complete Application' }).click();
    await expect(page.getByText(/Application submitted successfully/i)).toBeVisible({ timeout: 10000 });
  });

  test('an email that already has an account is told so before any code is sent', async ({ page }) => {
    await openProfessionalTab(page);
    await fillStep1(page, { email: fixtures().users.doctorA.email });
    await next(page);
    await fillStep2(page);
    await next(page);
    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123');
    await page.locator('button', { hasText: 'Submit Application' }).click();
    await expect(page.getByText(/already/i).first()).toBeVisible();
    await expect(page.locator('input[placeholder="000000"]')).toHaveCount(0);
  });

  test('double-clicking Submit registers once', async ({ page }) => {
    await openProfessionalTab(page);
    const email = await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await next(page);
    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123');

    let registerCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/register')) registerCalls += 1; });
    const submit = page.locator('button', { hasText: 'Submit Application' });
    await submit.dblclick();
    await expect(page.locator('input[placeholder="000000"]')).toBeVisible();
    expect(registerCalls).toBe(1);
    await expect.poll(() => mailSink().filter((e) => e.fn === 'sendOTPEmail' && String(e.args[0]).toLowerCase() === email).length).toBe(1);
  });
});

test.describe('Join as Professional — a failed upload says why and can be retried', () => {
  async function toStep3(page: Page) {
    await openProfessionalTab(page);
    await fillStep1(page);
    await next(page);
    await fillStep2(page);
    await next(page);
    await page.fill('input[placeholder="Min 6 characters"]', 'SecurePass123');
    await page.fill('input[placeholder="Re-enter password"]', 'SecurePass123');
  }

  test('the server\'s reason is shown on the file, Submit waits, and Retry recovers', async ({ page }) => {
    await toStep3(page);
    await page.route('**/api/upload/doctor-document', (route) => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ success: false, code: 'UPLOAD_BUSY', message: 'Our file storage is busy right now. Please try again in a minute.' })
    }));
    await page.locator('input[type="file"]').setInputFiles(PDF);
    await expect(page.getByTestId('document-row')).toHaveAttribute('data-status', 'error');
    await expect(page.getByText('Our file storage is busy right now')).toBeVisible();

    let registerCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/auth/register')) registerCalls += 1; });
    await page.locator('button', { hasText: 'Submit Application' }).click();
    await expect(page.getByText(/didn't upload\. Retry it or remove it/i)).toBeVisible();
    expect(registerCalls).toBe(0);

    await page.unroute('**/api/upload/doctor-document');
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('document-row')).toHaveAttribute('data-status', 'done');
  });

  test('a proxy error page (not JSON) still gives a readable message', async ({ page }) => {
    await toStep3(page);
    await page.route('**/api/upload/doctor-document', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' }));
    await page.locator('input[type="file"]').setInputFiles(PDF);
    await expect(page.getByText(/licence\.pdf.*didn't upload \(error 502\)/)).toBeVisible();
  });

  test('a dropped connection says so', async ({ page }) => {
    await toStep3(page);
    await page.route('**/api/upload/doctor-document', (route) => route.abort('connectionreset'));
    await page.locator('input[type="file"]').setInputFiles(PDF);
    await expect(page.getByText(/Couldn't reach our server/)).toBeVisible();
  });

  test('a removed file is not sent with the application', async ({ page, request }) => {
    await toStep3(page);
    await page.locator('input[type="file"]').setInputFiles(PDF);
    await expect(page.getByTestId('document-row')).toHaveAttribute('data-status', 'done');
    await page.getByRole('button', { name: /Remove licence\.pdf/ }).click();
    await expect(page.getByTestId('document-row')).toHaveCount(0);
    const registered = page.waitForResponse((r) => r.url().includes('/auth/register'));
    await page.locator('button', { hasText: 'Submit Application' }).click();
    const body = JSON.parse((await registered).request().postData() || '{}');
    expect(body.documents).toEqual([]);
    void request;
  });
});

test.describe('Partner with us — phone number', () => {
  test('"1234" is refused before anything is sent; a real number is accepted', async ({ page }) => {
    await page.goto('/careers');
    await page.locator('button', { hasText: 'Partner with us' }).click();
    let posts = 0;
    page.on('request', (r) => { if (r.url().includes('/api/enquiries') && r.method() === 'POST') posts += 1; });
    await page.fill('#enquiry-partner-name', 'Rahul Verma');
    await page.fill('#enquiry-partner-email', uniqueEmail('phone'));
    await page.fill('#enquiry-partner-organisation', 'MindCare Hospital');
    await page.fill('#enquiry-partner-phone', '1234');
    await page.fill('#enquiry-partner-message', 'Partnership please.');
    await page.getByRole('button', { name: 'Send Partnership Enquiry' }).click();
    await expect(page.getByText(/valid phone number/i)).toBeVisible();
    expect(posts).toBe(0);

    await page.fill('#enquiry-partner-phone', '+91 98200 11223');
    await page.getByRole('button', { name: 'Send Partnership Enquiry' }).click();
    await expect(page.getByText('Thank you — we have it')).toBeVisible();
    expect(posts).toBe(1);
  });
});

test.describe('Partner with us / Other Queries — the message reaches the admin', () => {
  for (const kind of ['partner', 'other'] as const) {
    test(`a ${kind} enquiry is stored where the super admin reads enquiries`, async ({ page, request }) => {
      await page.goto('/careers');
      await page.locator('button', { hasText: kind === 'partner' ? 'Partner with us' : 'Other Queries' }).click();
      const email = uniqueEmail(kind);
      await page.fill(`#enquiry-${kind}-name`, 'Ravi Kumar');
      await page.fill(`#enquiry-${kind}-email`, email);
      if (kind === 'partner') await page.fill('#enquiry-partner-organisation', 'Sunrise Clinic');
      else await page.fill('#enquiry-other-subject', 'Media request');
      await page.fill(`#enquiry-${kind}-message`, `Hello from the ${kind} e2e test.`);
      await page.getByRole('button', { name: kind === 'partner' ? 'Send Partnership Enquiry' : 'Send Enquiry' }).click();
      await expect(page.getByText('Thank you — we have it')).toBeVisible();

      const res = await request.get(`${API_URL}/enquiries`, { headers: { Authorization: `Bearer ${fixtures().adminToken}` } });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const found = body.data.enquiries.find((e: { email: string }) => e.email === email);
      expect(found, 'enquiry visible to the super admin').toBeTruthy();
      expect(found.type).toBe(kind);
    });
  }

  test('"Send another enquiry" starts a clean form', async ({ page }) => {
    await page.goto('/careers');
    await page.locator('button', { hasText: 'Other Queries' }).click();
    await page.fill('#enquiry-other-name', 'Ravi');
    await page.fill('#enquiry-other-email', uniqueEmail('again'));
    await page.fill('#enquiry-other-subject', 'Hi');
    await page.fill('#enquiry-other-message', 'First message.');
    await page.getByRole('button', { name: 'Send Enquiry' }).click();
    await expect(page.getByText('Thank you — we have it')).toBeVisible();
    await page.getByRole('button', { name: /send another/i }).click();
    await expect(page.locator('#enquiry-other-name')).toHaveValue('');
  });
});
