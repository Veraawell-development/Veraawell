# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication — Login >> doctor can log in and lands on doctor dashboard or profile setup
- Location: e2e/auth.spec.ts:40:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Page snapshot

```yaml
- main [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]:
      - button "Back to Home" [ref=e7]:
        - img [ref=e8]
      - generic [ref=e10]:
        - img [ref=e12]
        - heading "Mental wellness, made accessible." [level=2] [ref=e34]:
          - text: Mental wellness,
          - text: made accessible.
        - paragraph [ref=e35]:
          - text: Connect with certified therapists and take
          - text: control of your mental health journey.
        - generic [ref=e36]:
          - generic [ref=e39]: Licensed professionals
          - generic [ref=e42]: Private & confidential
          - generic [ref=e45]: Sessions on your schedule
    - generic [ref=e46]:
      - generic [ref=e49]:
        - generic [ref=e50]:
          - heading "Welcome back" [level=1] [ref=e51]
          - paragraph [ref=e52]: Sign in to continue
        - generic [ref=e53]:
          - paragraph [ref=e54]: I am a
          - generic [ref=e55]:
            - button "Patient" [ref=e56]:
              - img [ref=e58]
              - text: Patient
            - button "Doctor" [ref=e61]:
              - img [ref=e63]
              - text: Doctor
              - img [ref=e68]
        - generic [ref=e70]:
          - generic [ref=e71]:
            - generic [ref=e72]: Email or Phone
            - generic [ref=e73]:
              - generic:
                - img
              - textbox "Enter your email or phone" [ref=e74]: e2e.doctor@veerawell.test
          - generic [ref=e75]:
            - generic [ref=e76]: Password
            - generic [ref=e77]:
              - generic:
                - img
              - textbox "Enter your password" [ref=e78]: TestDoctor123!
              - button [ref=e79]:
                - img [ref=e80]
          - button "Forgot password?" [ref=e84]
          - button "Sign In as Doctor" [ref=e85]
        - generic [ref=e86]: Your doctor account is pending approval. An admin will review your application soon.
        - button "Admin Portal" [ref=e88]:
          - text: Admin Portal
          - img [ref=e89]
      - paragraph [ref=e91]: Veraawell © 2026
```

# Test source

```ts
  1   | /**
  2   |  * Authentication E2E Tests
  3   |  * Tests login, registration, role switching, validation and logout.
  4   |  * Runs WITHOUT pre-existing auth state (fresh browser context).
  5   |  */
  6   | 
  7   | import { test, expect } from '@playwright/test';
  8   | import { TEST_PATIENT, TEST_DOCTOR } from './helpers';
  9   | 
  10  | test.describe('Authentication — Login', () => {
  11  |   test.beforeEach(async ({ page }) => {
  12  |     // Clear all cookies and localStorage to ensure we start with a clean session
  13  |     // This prevents auto-redirect when a previous test left an auth cookie
  14  |     await page.context().clearCookies();
  15  |     await page.goto('/login');
  16  |     // Clear localStorage after navigation (page context is available)
  17  |     await page.evaluate(() => localStorage.clear());
  18  |     await page.waitForLoadState('networkidle');
  19  |   });
  20  | 
  21  |   test('login page renders with Patient/Doctor toggle', async ({ page }) => {
  22  |     // The role selector is only visible in login mode (not signup)
  23  |     // The AuthPage shows Patient/Doctor buttons inside the login form
  24  |     await expect(page.locator('button').filter({ hasText: /^Patient$/ }).first()).toBeVisible({ timeout: 5000 });
  25  |     await expect(page.locator('button').filter({ hasText: /^Doctor$/ }).first()).toBeVisible({ timeout: 5000 });
  26  |     // Tab switchers
  27  |     await expect(page.locator('button').filter({ hasText: /^Sign In$/ }).first()).toBeVisible({ timeout: 5000 });
  28  |     await expect(page.locator('button').filter({ hasText: /^Sign Up$/ }).first()).toBeVisible({ timeout: 5000 });
  29  |   });
  30  | 
  31  |   test('patient can log in and lands on patient dashboard', async ({ page }) => {
  32  |     await page.locator('button').filter({ hasText: /^Patient$/ }).first().click();
  33  |     await page.fill('input[placeholder*="email"]', TEST_PATIENT.email);
  34  |     await page.fill('input[type="password"]', TEST_PATIENT.password);
  35  |     await page.click('button[type="submit"]');
  36  |     await page.waitForURL('**/patient-dashboard', { timeout: 20000 });
  37  |     await expect(page).toHaveURL(/patient-dashboard/);
  38  |   });
  39  | 
  40  |   test('doctor can log in and lands on doctor dashboard or profile setup', async ({ page }) => {
  41  |     await page.locator('button').filter({ hasText: /^Doctor$/ }).first().click();
  42  |     await page.fill('input[placeholder*="email"]', TEST_DOCTOR.email);
  43  |     await page.fill('input[type="password"]', TEST_DOCTOR.password);
  44  | 
  45  |     // Intercept the login API call to confirm it succeeds before waiting for nav
  46  |     const [loginResponse] = await Promise.all([
  47  |       page.waitForResponse(resp => resp.url().includes('/auth/login') && resp.request().method() === 'POST', { timeout: 15000 }),
  48  |       page.click('button[type="submit"]'),
  49  |     ]);
  50  | 
  51  |     const loginData = await loginResponse.json();
> 52  |     expect(loginResponse.ok()).toBeTruthy();
      |                                ^ Error: expect(received).toBeTruthy()
  53  |     expect(loginData.token || loginData.success).toBeTruthy();
  54  | 
  55  |     // After a successful login, App.tsx calls checkAuth then redirects.
  56  |     // Wait for the page to navigate away from /login (to any route)
  57  |     await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 20000 });
  58  |     const url = page.url();
  59  |     // Doctor can land on profile-setup (new), doctor-dashboard (approved), or pending-approval page
  60  |     expect(url).not.toMatch(/\/login/);
  61  |   });
  62  | 
  63  |   test('shows error for wrong password', async ({ page }) => {
  64  |     await page.locator('button').filter({ hasText: /^Patient$/ }).first().click();
  65  |     await page.fill('input[placeholder*="email"]', TEST_PATIENT.email);
  66  |     await page.fill('input[type="password"]', 'WrongPassword999!');
  67  |     await page.click('button[type="submit"]');
  68  |     // Should NOT navigate away
  69  |     await page.waitForTimeout(3000);
  70  |     await expect(page).not.toHaveURL(/patient-dashboard/);
  71  |     // Error message should appear
  72  |     await expect(page.locator('.bg-red-50, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  73  |   });
  74  | 
  75  |   test('shows error for empty fields', async ({ page }) => {
  76  |     await page.click('button[type="submit"]');
  77  |     await page.waitForTimeout(2000);
  78  |     await expect(page).not.toHaveURL(/patient-dashboard/);
  79  |   });
  80  | 
  81  |   test('forgot password link navigates to reset page', async ({ page }) => {
  82  |     await page.click('button:has-text("Forgot password?")');
  83  |     await expect(page).toHaveURL(/forgot-password/);
  84  |   });
  85  | });
  86  | 
  87  | test.describe('Authentication — Registration', () => {
  88  |   test('signup form appears when Sign Up tab is clicked', async ({ page }) => {
  89  |     await page.goto('/login');
  90  |     await page.click('button:has-text("Sign Up")');
  91  |     await expect(page.locator('input[placeholder*="name"]').or(page.locator('input[placeholder="Your full name"]'))).toBeVisible();
  92  |     await expect(page.locator('input[type="email"]')).toBeVisible();
  93  |     await expect(page.locator('input[type="tel"]')).toBeVisible();
  94  |   });
  95  | 
  96  |   test('registration form shows error for mismatched passwords', async ({ page }) => {
  97  |     await page.goto('/login');
  98  |     await page.click('button:has-text("Sign Up")');
  99  |     await page.fill('input[placeholder="Your full name"]', 'Test User');
  100 |     await page.fill('input[type="email"]', 'test_new_user_xyz@veerawell.test');
  101 |     await page.fill('input[type="tel"]', '9876543210');
  102 |     // Fill passwords
  103 |     const pwInputs = page.locator('input[type="password"]');
  104 |     await pwInputs.nth(0).fill('Password123!');
  105 |     await pwInputs.nth(1).fill('DifferentPassword456!');
  106 |     await page.click('button:has-text("Create Account")');
  107 |     // Error message
  108 |     await expect(page.locator('text=Passwords do not match')).toBeVisible({ timeout: 5000 });
  109 |   });
  110 | 
  111 |   test('Doctor "join us here" link points to careers page', async ({ page }) => {
  112 |     await page.goto('/login');
  113 |     await page.click('button:has-text("Sign Up")');
  114 |     const link = page.locator('a[href="/careers"]');
  115 |     await expect(link).toBeVisible();
  116 |   });
  117 | });
  118 | 
  119 | test.describe('Authentication — Admin Portal', () => {
  120 |   test('admin portal link navigates to admin login', async ({ page }) => {
  121 |     await page.goto('/login');
  122 |     await page.click('button:has-text("Admin Portal")');
  123 |     await expect(page).toHaveURL(/admin-login/);
  124 |   });
  125 | });
  126 | 
```