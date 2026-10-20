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
    ['session reminder', () => email.sendSessionReminderEmail('p@test.local', { patientId: {}, doctorId: {} }, '15min')],
    ['session outcome', () => email.sendSessionOutcomeEmail('p@test.local', { subject: 'We missed you today', title: 'We missed you today' })]
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

describe('session reminders', () => {
  const lastMessage = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
  const session = {
    _id: '6ad5208dd7714afa4c772be1', sessionTime: '09:00 AM', meetingLink: '/video-call/0f3a9c',
    patientId: { firstName: 'Asha', lastName: 'Rao' }, doctorId: { firstName: 'Meera', lastName: 'Pal' }
  };

  test("the patient's: their greeting, the doctor's name, and a link that opens the session", async () => {
    await email.sendSessionReminderEmail('p@test.local', session, '15min');
    const { subject, html } = lastMessage();
    expect(subject).toBe('Reminder: Your session with Dr. Meera Pal starts in 15 minutes');
    expect(html).toContain('Hi Asha,');
    // A full address to the session's own call page — the stored meetingLink
    // is relative (and for booked sessions, a random path).
    expect(html).toMatch(/href="https?:\/\/[^"]+\/video-call\/6ad5208dd7714afa4c772be1"/);
    expect(html).not.toContain('/video-call/0f3a9c');
  });

  test("the doctor's: addressed to the doctor, about the patient", async () => {
    await email.sendSessionReminderEmail('d@test.local', session, 'start', { recipient: 'doctor' });
    const { subject, html } = lastMessage();
    expect(subject).toBe('Your session with Asha Rao is starting now!');
    expect(html).toContain('Hi Dr. Meera,');
    expect(html).toContain('Asha Rao');
  });
});

describe('session outcome emails', () => {
  const lastMessage = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];

  test('a refund outcome: the words, the amount, and the patient\'s dashboard', async () => {
    await email.sendSessionOutcomeEmail('p@test.local', {
      subject: "Your session didn't happen — full refund on its way",
      title: "Your therapist didn't join",
      recipientName: 'Asha',
      paragraphs: ["Your therapist didn't join your session, so we're refunding you in full.", 'Usually within 5–7 working days.'],
      when: 'Mon, 2 Nov 2026, 10:00 am (20 min)',
      amountLabel: 'Refund',
      amount: 1000
    });
    const { subject, html, to } = lastMessage();
    expect(to).toBe('p@test.local');
    expect(subject).toBe("Your session didn't happen — full refund on its way | Veraawell");
    expect(html).toContain('Hi Asha,');
    expect(html).toContain('₹1,000');
    expect(html).toContain('patient-dashboard');
    expect(html).toContain('2 Nov 2026');
  });

  test('to a doctor: addressed as Dr., linked to their dashboard, and values escaped', async () => {
    await email.sendSessionOutcomeEmail('d@test.local', {
      subject: 'Session refunded', title: 'Session refunded', doctor: true, recipientName: 'Rao',
      paragraphs: ['<b>Asha</b> waited for you.']
    });
    const { html } = lastMessage();
    expect(html).toContain('Hi Dr. Rao,');
    expect(html).toContain('doctor-dashboard');
    expect(html).toContain('&lt;b&gt;Asha&lt;/b&gt;');
    expect(html).not.toContain('<b>Asha</b>');
  });

  test('the session summary says payouts are weekly', async () => {
    await email.sendDoctorSessionSummaryEmail('d@test.local', { earnings: 800 });
    expect(lastMessage().html).toContain('Earnings are paid out weekly');
  });
});

describe('approval outcomes', () => {
  const lastMessage = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];

  test('an approved doctor is sent to /login, not the /auth route that 404s', async () => {
    await email.sendDoctorApprovedEmail('doc@example.com', 'Neha');
    expect(lastMessage().html).toContain('/login');
    expect(lastMessage().html).not.toMatch(/\/auth["']/);
  });

  test('a rejection carries the reason the admin typed, escaped', async () => {
    await email.sendDoctorRejectedEmail('doc@example.com', 'Neha', 'Licence <expired>');
    expect(lastMessage().html).toContain('Licence &lt;expired&gt;');
  });

  test('a rejection with no reason has no empty Reason line', async () => {
    await email.sendDoctorRejectedEmail('doc@example.com', 'Neha');
    expect(lastMessage().html).not.toContain('Reason:');
  });

  test('admins hear the outcome of their request, with their own wording and link', async () => {
    await email.sendAdminDecisionEmail('a@example.com', 'Asha', true);
    expect(lastMessage().subject).toMatch(/approved/i);
    expect(lastMessage().html).toContain('/admin-login');
    expect(lastMessage().html).toMatch(/admin dashboard/i);

    await email.sendAdminDecisionEmail('a@example.com', 'Asha', false, 'Unknown requester');
    expect(lastMessage().html).toContain('Unknown requester');
    expect(lastMessage().html).toMatch(/admin access was not approved/i);
  });

  test('an admin signup code is labelled for an admin, not a patient', async () => {
    await email.sendOTPEmail('a@example.com', '123456', 'admin');
    expect(lastMessage().html).toContain('<strong>Admin</strong>');
  });
});

describe('Phase 4: what the emails say', () => {
  const lastSent = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];

  test('every email has a plain-text part and replies go to support', async () => {
    await email.sendCancellationEmail('p@test.local', { recipientName: 'Asha', date: 'Tue, 21 Oct 2026', refundState: 'issued', refundAmount: 1234.5 });
    const m = lastSent();
    expect(m.replyTo).toBe('support@veraawell.com');
    expect(m.text).toContain('Asha');
    expect(m.text).not.toMatch(/<[a-z]/i);
  });

  test('amounts in Indian format', async () => {
    expect(email.inr(1234.5)).toBe('₹1,234.50');
    expect(email.inr(800)).toBe('₹800');
    expect(email.inr('x')).toBe('');
  });

  test('a cancellation says what happened to the money — never a refund that did not happen', async () => {
    const states = {
      issued: (await email.sendCancellationEmail('a@t.l', { refundState: 'issued', refundAmount: 1000 }), lastSent().html),
      failed: (await email.sendCancellationEmail('a@t.l', { refundState: 'failed', refundAmount: 1000 }), lastSent().html),
      none: (await email.sendCancellationEmail('a@t.l', { refundState: 'none', refundAmount: 0 }), lastSent().html),
      unpaid: (await email.sendCancellationEmail('a@t.l', { refundState: 'unpaid', refundAmount: 1000 }), lastSent().html),
      hide: (await email.sendCancellationEmail('a@t.l', { refundState: 'hide', refundAmount: 1000 }), lastSent().html),
    };
    expect(states.issued).toMatch(/₹1,000/);
    expect(states.issued).toMatch(/5–7 working days/);
    expect(states.failed).toMatch(/taking longer than usual/);
    expect(states.none).toMatch(/within 4 hours/);
    for (const k of ['unpaid', 'hide']) {
      expect(states[k]).not.toMatch(/Refund/);
      expect(states[k]).not.toMatch(/₹/);
    }
  });

  test('bank details approved: weekly bank transfer, not "Razorpay within 3 days"', async () => {
    await email.sendPayoutActivatedEmail('d@t.l', 'Rao');
    const m = lastSent();
    expect(m.subject).toMatch(/bank details are approved/i);
    expect(m.html).toMatch(/weekly, by bank transfer/);
    expect(m.html).not.toMatch(/Razorpay|3 business days/);
  });

  test('booking confirmation: therapist, time, amount paid and a way to the dashboard', async () => {
    await email.sendBookingConfirmationEmail('p@t.l', { doctorName: 'Dr. Pal', date: 'Tue, 21 Oct 2026', time: '2:30 pm IST', duration: 40, mode: 'Video', price: 1500 });
    const { html } = lastSent();
    for (const s of ['Dr. Pal', '2:30 pm IST', '40 minutes', '₹1,500', '/patient-dashboard', '4 hours']) expect(html).toContain(s);
  });

  test('payment failed: no "Dr. your doctor", no claim that no money left the account', async () => {
    await email.sendPaymentFailedEmail('p@t.l', { patientName: 'Asha', doctorName: null, amount: 900 });
    const { html } = lastSent();
    expect(html).not.toMatch(/Dr\. your doctor|No money has been deducted/);
    expect(html).toMatch(/refunded automatically/);
  });

  test('the doctor summary computes the fee % from the booking itself', async () => {
    await email.sendDoctorSessionSummaryEmail('d@t.l', { doctorName: 'Rao', price: 1000, platformFee: 250, earnings: 750, feePercent: 20 });
    const { html } = lastSent();
    expect(html).toContain('Platform Fee (25%)');
    expect(html).toContain('₹750');
  });

  test('notices and admin alerts', async () => {
    await email.sendNoticeEmail('p@t.l', { subject: 'Request sent', title: 'Request sent', paragraphs: ['A <b>bold</b> claim'], rows: [['Amount paid', '₹900']], path: 'messages', buttonLabel: 'Open' });
    let m = lastSent();
    expect(m.subject).toBe('Request sent | Veraawell');
    expect(m.html).toContain('A &lt;b&gt;bold&lt;/b&gt; claim');
    expect(m.html).toContain('/messages');
    process.env.ADMIN_ALERT_EMAIL = 'ops@test.local';
    await email.sendAdminAlertEmail('A refund failed', ['Razorpay said no.']);
    m = lastSent();
    expect(m.to).toBe('ops@test.local');
    expect(m.subject).toBe('[Admin] A refund failed | Veraawell');
    delete process.env.ADMIN_ALERT_EMAIL;
  });

  test('the signup code says how long it works', async () => {
    await email.sendOTPEmail('a@t.l', '123456', 'patient');
    expect(lastSent().html).toMatch(/works for 15 minutes/);
  });
});
