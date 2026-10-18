/**
 * Helpers for the session-lifecycle specs.
 *
 * Sessions are written straight into the e2e stack's in-memory MongoDB (the
 * same approach as adminHelpers.ts), already paid and already at the moment
 * a test needs — "started 11 minutes ago", "ended half an hour ago" — so a
 * spec can test what happens at that moment without booking through Razorpay
 * and without waiting real minutes. Time-driven jobs are then run on demand
 * through the stack's job trigger, with the clock the test chooses.
 */
import { BrowserContext, APIRequestContext, expect } from '@playwright/test';
import { fixtures, API_URL } from './fixtures';
import { db, ObjectId, apiSend } from './adminHelpers';

const MINUTE = 60 * 1000;
const PLATFORM_TIMEZONE = 'Asia/Kolkata';

/** The platform-zone calendar date and wall-clock time of an instant. */
function istParts(at: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PLATFORM_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const hour = Number(get('hour')) % 24;
  const minute = get('minute');
  const localDate = `${get('year')}-${get('month')}-${get('day')}`;
  const localTime = `${String(hour).padStart(2, '0')}:${minute}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const sessionTime = `${String(h12).padStart(2, '0')}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
  return { localDate, localTime, sessionTime };
}

export interface CreateSessionOptions {
  patientId: string;
  doctorId: string;
  /** Minutes from now the session starts (negative = already started). */
  startsInMinutes: number;
  duration?: 20 | 40 | 55;
  sessionType?: 'regular' | 'immediate';
  status?: 'scheduled' | 'active' | 'payment_pending' | 'completed' | 'cancelled' | 'no-show';
  paymentStatus?: 'paid' | 'pending' | 'not_required';
  price?: number;
  callMode?: 'Video Calling' | 'Voice Calling';
  extra?: Record<string, unknown>;
}

/** Writes a realistic session document and returns its id. */
export async function createSession(opts: CreateSessionOptions): Promise<string> {
  const {
    patientId, doctorId, startsInMinutes, duration = 20, sessionType = 'regular',
    status = 'scheduled', paymentStatus = 'paid', price = 1000, callMode = 'Video Calling', extra = {},
  } = opts;
  const startsAt = new Date(Date.now() + startsInMinutes * MINUTE);
  const endsAt = new Date(startsAt.getTime() + duration * MINUTE);
  const { localDate, localTime, sessionTime } = istParts(startsAt);
  const _id = new ObjectId();
  const platformFee = Math.round(price * 0.2);
  const now = new Date();
  await (await db()).collection('sessions').insertOne({
    _id,
    patientId: new ObjectId(patientId),
    doctorId: new ObjectId(doctorId),
    startsAt, endsAt, timezone: PLATFORM_TIMEZONE, localDate, localTime,
    sessionDate: new Date(`${localDate}T00:00:00.000Z`), sessionTime,
    duration, sessionType, status, paymentStatus,
    price, platformFee, doctorEarnings: price - platformFee,
    paymentId: paymentStatus === 'paid' ? `stub_e2e_${_id}` : null,
    razorpayOrderId: null,
    acceptanceStatus: sessionType === 'immediate' ? 'accepted' : 'pending',
    callMode, callStatus: 'not-started',
    meetingLink: `/video-call/${_id}`,
    doctorJoined: false, patientJoined: false,
    refundAmount: 0, payoutId: null,
    notificationStatus: { reminderSent: false, startSent: false, lateSent: false },
    createdAt: now, updatedAt: now,
    ...extra,
  });
  return String(_id);
}

/** The session as stored, for assertions. */
export async function readSession(id: string) {
  return (await db()).collection('sessions').findOne({ _id: new ObjectId(id) });
}

/** Overwrites fields on a stored session (e.g. to move its end time). */
export async function patchSession(id: string, set: Record<string, unknown>) {
  await (await db()).collection('sessions').updateOne({ _id: new ObjectId(id) }, { $set: set });
}

/**
 * Runs one of the stack's time-driven jobs, optionally pretending it is a
 * different time. Returns whatever the job returned.
 */
export async function runJob(name: string, now?: Date): Promise<unknown> {
  const res = await fetch(`${fixtures().controlUrl}/jobs/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(now ? { now: now.toISOString() } : {}),
  });
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body.result;
}

/**
 * Signs a browser context in as a user, the way the app does: the login
 * response sets the httpOnly session cookie for localhost, which both the
 * Vite dev server and the API share.
 */
export async function signIn(context: BrowserContext, email: string, password: string, role: 'patient' | 'doctor') {
  const res = await apiSend(context.request as unknown as APIRequestContext, 'POST', '/auth/login', { username: email, password, role });
  expect(res.status(), await res.text()).toBe(200);
}

export { API_URL };
