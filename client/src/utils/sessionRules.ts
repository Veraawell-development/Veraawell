/**
 * The session rules, as the screens show them (docs/SESSION_RULES.md).
 *
 * The server decides everything — join window, the real end, whether a
 * waiting patient may leave with a refund, what a session finally was — and
 * sends it with each session as `rules` (server/services/sessionPolicy.view)
 * and `outcome`. This file only turns that into what a screen needs, so the
 * call screen, the session modals, the calendars and call history all say the
 * same thing. It used to be worked out separately in each, with different
 * windows (one said up to an hour after the start, another until the end).
 */
import { resolveSessionStart } from './dateUtils';

const MINUTE = 60 * 1000;
const JOIN_LEAD_MINUTES = 15;

/** What the server sends as `session.rules`. Dates arrive as ISO strings. */
export interface SessionRulesView {
  serverNow: string;
  startsAt: string;
  graceEndsAt: string;
  endsAt: string;
  effectiveEndsAt: string;
  joinOpensAt: string;
  joinClosesAt: string;
  present: { patient: boolean; doctor: boolean };
  doctorJoinedLate: boolean;
  absentRefundAt: string | null;
  missed: boolean;
  patientAbsent: boolean;
}

export interface SessionLike {
  status?: string;
  sessionType?: string;
  duration?: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  effectiveEndsAt?: string | Date | null;
  sessionDate?: string | Date | null;
  sessionTime?: string | null;
  paymentStatus?: string;
  price?: number;
  refundAmount?: number;
  cancelledBy?: string | null;
  lateCancellation?: boolean;
  outcome?: { code?: string | null } | string | null;
  rules?: SessionRulesView | null;
}

const LIVE = ['scheduled', 'active'];

/**
 * When the session can be joined: from 15 minutes before the start until it
 * really ends. From the server's `rules` when present; otherwise from the
 * stored times, with the same meaning.
 */
export function joinWindow(session: SessionLike): { opensAt: Date; closesAt: Date } {
  if (session.rules) {
    return { opensAt: new Date(session.rules.joinOpensAt), closesAt: new Date(session.rules.joinClosesAt) };
  }
  const start = resolveSessionStart(session);
  const end = session.effectiveEndsAt
    ? new Date(session.effectiveEndsAt)
    : session.endsAt
      ? new Date(session.endsAt)
      : new Date(start.getTime() + (session.duration || 60) * MINUTE);
  return { opensAt: new Date(start.getTime() - JOIN_LEAD_MINUTES * MINUTE), closesAt: end };
}

/** Can the call be opened right now? An instant session can, while it is live. */
export function canJoinNow(session: SessionLike, now: Date = new Date()): boolean {
  if (!LIVE.includes(session.status || '')) return false;
  if (session.sessionType === 'immediate') return true;
  const { opensAt, closesAt } = joinWindow(session);
  return now >= opensAt && now <= closesAt;
}

/** Live, but its time is over: waiting for the end-of-session decision. */
export function hasEnded(session: SessionLike, now: Date = new Date()): boolean {
  return LIVE.includes(session.status || '') && session.sessionType !== 'immediate' && now > joinWindow(session).closesAt;
}

export type OutcomeTone = 'good' | 'neutral' | 'warn' | 'bad';

const outcomeCode = (session: SessionLike): string | null => {
  const o = session.outcome;
  if (!o) return null;
  return typeof o === 'string' ? o : o.code || null;
};

const refunded = (session: SessionLike) =>
  session.paymentStatus === 'refunded' || session.paymentStatus === 'refund_pending';

/** For an outcome that owes a refund: where that refund actually is. */
const refundState = (session: SessionLike) => {
  if (refunded(session)) return 'refunded';
  if (session.paymentStatus === 'refund_failed') return 'refund being retried';
  if (session.paymentStatus === 'not_required') return 'nothing was charged';
  return 'refund pending';
};

/**
 * What became of a finished session, in a few words for this viewer. Null
 * for a session that is still upcoming or under way.
 */
export function outcomeLabel(session: SessionLike, viewer: 'patient' | 'doctor'): { label: string; tone: OutcomeTone } | null {
  const status = session.status || '';
  if (LIVE.includes(status) || status === 'payment_pending') return null;
  const code = outcomeCode(session);
  const amount = session.refundAmount || session.price || 0;
  const refund = refundState(session);
  const patient = viewer === 'patient';

  if (status === 'completed') {
    return code === 'ended_by_consent'
      ? { label: 'Ended early by agreement', tone: 'good' }
      : { label: 'Completed', tone: 'good' };
  }

  if (status === 'no-show') {
    switch (code) {
      case 'patient_no_show':
        return patient
          ? { label: 'Missed — no refund', tone: 'warn' }
          : { label: "Patient didn't join — you're paid", tone: 'neutral' };
      case 'doctor_no_show':
        return patient
          ? { label: `Therapist didn't join — ${refund}`, tone: 'bad' }
          : { label: `You didn't join — patient ${refund}`, tone: 'bad' };
      case 'nobody_came':
        return { label: `Nobody joined — ${patient ? refund : `patient ${refund}`}`, tone: 'neutral' };
      default:
        return refunded(session)
          ? { label: 'No-show — refunded', tone: 'neutral' }
          : { label: 'No-show', tone: 'neutral' };
    }
  }

  if (status === 'cancelled') {
    switch (code) {
      case 'late_cancellation':
        return patient
          ? { label: 'Cancelled — no refund (therapist paid)', tone: 'warn' }
          : { label: "Cancelled late — you're paid", tone: 'neutral' };
      case 'doctor_absent_refund':
        return patient
          ? { label: `Therapist didn't join — ${refund}`, tone: 'bad' }
          : { label: `Patient left after waiting — ${refund}`, tone: 'bad' };
      case 'cancelled_by_doctor':
        return { label: patient ? `Cancelled by therapist — ${refund}` : `You cancelled — patient ${refund}`, tone: 'bad' };
      case 'instant_unanswered':
        return { label: patient ? `No answer — ${refund}` : `Request not answered — patient ${refund}`, tone: 'neutral' };
      case 'checkout_abandoned':
        return { label: 'Payment not completed', tone: 'neutral' };
      default:
        if (refunded(session)) return { label: patient ? `Cancelled — refunded ₹${amount}` : 'Cancelled — patient refunded', tone: 'neutral' };
        if (session.paymentStatus === 'refund_failed') return { label: 'Cancelled — refund being retried', tone: 'warn' };
        return { label: 'Cancelled — no refund', tone: 'neutral' };
    }
  }
  return null;
}
