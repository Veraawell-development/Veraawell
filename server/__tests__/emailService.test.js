/**
 * services/email.service.js against a stand-in for the Resend SDK.
 *
 * The stand-in behaves like the real resend@4: `emails.send` never throws, it
 * resolves `{ data, error }`. That one fact was what the service got wrong —
 * every send was wrapped in a try/catch that could not fire, and logged
 * "sent" with `id: data.id` read off the envelope (always undefined) — so a
 * rejected API key looked, in the logs and to the caller, like success.
 */

require('./support/env');

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } }))
}));

let email;

beforeAll(() => {
  process.env.RESEND = 're_test_stub';
  email = require('../services/email.service');
});

afterAll(() => {
  delete process.env.RESEND;
});

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
});

const refused = { data: null, error: { name: 'validation_error', message: 'The domain is not verified' } };

describe('a provider error is an error', () => {
  test('a signup code the provider refuses rejects, instead of reporting success', async () => {
    mockSend.mockResolvedValueOnce(refused);
    await expect(email.sendOTPEmail('a@test.local', '123456', 'patient')).rejects.toThrow(/domain is not verified/);
  });

  test('so does a password reset link', async () => {
    mockSend.mockResolvedValueOnce(refused);
    await expect(email.sendPasswordResetEmail({ email: 'a@test.local', firstName: 'A' }, 'tok')).rejects.toThrow(/refused/);
  });

  test('a delivered message resolves with the provider\'s real id', async () => {
    await expect(email.sendOTPEmail('a@test.local', '123456', 'patient')).resolves.toEqual({ id: 'msg_123' });
  });

  test('a notification after a committed write never throws, and reports the failure as null', async () => {
    mockSend.mockResolvedValueOnce(refused);
    await expect(email.sendBookingConfirmationEmail('a@test.local', { date: '1 Jan', time: '10:00', type: 'Video' })).resolves.toBeNull();

    mockSend.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(email.sendCancellationEmail('a@test.local', { date: '1 Jan' })).resolves.toBeNull();
  });
});

describe('user-controlled values are escaped', () => {
  const htmlOf = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0].html;

  test('names and free text cannot inject markup', async () => {
    await email.sendCancellationEmail('a@test.local', {
      recipientName: '<a href="https://evil.example">Asha</a>',
      message: '<img src=x onerror=alert(1)>',
      date: '1 Jan', time: '10:00', cancelledBy: 'Doctor', refundAmount: 0
    });
    const html = htmlOf();
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Asha&lt;/a&gt;');
  });

  test('doctor and admin names too', async () => {
    await email.sendDoctorApprovedEmail('d@test.local', '<script>x</script>');
    expect(htmlOf()).toContain('&lt;script&gt;x&lt;/script&gt;');

    await email.sendPayoutOnboardingRejectedEmail('d@test.local', 'Rao', '<b>bad</b> details');
    expect(htmlOf()).toContain('&lt;b&gt;bad&lt;/b&gt; details');
  });
});

describe('missing optional fields drop out instead of printing "undefined"', () => {
  // Regression from production: doctors received "Hi Dr. undefined",
  // "undefined minutes" and "₹undefined" because a caller passed fewer
  // fields than the template assumed.
  const lastMessage = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];

  test.each([
    ['doctor new booking', () => email.sendDoctorNewBookingEmail('d@test.local', { patientName: 'Asha' })],
    ['doctor session summary', () => email.sendDoctorSessionSummaryEmail('d@test.local', {})],
    ['payment failed', () => email.sendPaymentFailedEmail('p@test.local', {})],
    ['cancellation', () => email.sendCancellationEmail('p@test.local', {})],
    ['refund initiated', () => email.sendRefundInitiatedEmail('p@test.local', {})],
    ['refund confirmed', () => email.sendRefundConfirmedEmail('p@test.local', {})],
    ['booking confirmation', () => email.sendBookingConfirmationEmail('p@test.local', {})],
    ['payout activated', () => email.sendPayoutActivatedEmail('d@test.local')],
    ['session reminder', () => email.sendSessionReminderEmail('p@test.local', { patientId: {}, doctorId: {} }, '15min')]
  ])('%s', async (_name, send) => {
    await send();
    const { subject, html } = lastMessage();
    expect(subject).not.toMatch(/undefined|null|NaN/);
    expect(html).not.toMatch(/undefined|NaN/);
    expect(html).not.toMatch(/>null</);
  });

  test('present fields still render, with their units', async () => {
    await email.sendDoctorNewBookingEmail('d@test.local', {
      doctorName: 'Rao', patientName: 'Asha', date: '1 Jan', time: '10:00', duration: 40, type: 'Video', doctorEarnings: 800
    });
    const { html, subject } = lastMessage();
    expect(html).toContain('Hi Dr. Rao,');
    expect(html).toContain('40 minutes');
    expect(html).toContain('₹800');
    expect(subject).toBe('New Session Booked with Asha on 1 Jan');
  });
});
