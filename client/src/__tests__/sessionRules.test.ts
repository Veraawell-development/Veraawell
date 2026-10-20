import { describe, it, expect } from 'vitest';
import { joinWindow, canJoinNow, hasEnded, isBooked, outcomeLabel, refundStatusText, cancelResultMessage, type SessionLike } from '../utils/sessionRules';
import { calculateRefundPreview } from '../utils/refundPolicy';

const MIN = 60 * 1000;
const T = new Date('2026-11-02T04:30:00.000Z'); // 10:00 IST
const at = (m: number) => new Date(T.getTime() + m * MIN);

const booked = (extra: Partial<SessionLike> = {}): SessionLike => ({
  status: 'scheduled', sessionType: 'regular', duration: 20,
  startsAt: T.toISOString(), endsAt: at(20).toISOString(), paymentStatus: 'paid', price: 1000, ...extra
});

describe('joining', () => {
  it('opens 15 minutes before the start and closes when the session ends — not an hour after the start', () => {
    const s = booked();
    expect(canJoinNow(s, at(-16))).toBe(false);
    expect(canJoinNow(s, at(-15))).toBe(true);
    expect(canJoinNow(s, at(20))).toBe(true);
    expect(canJoinNow(s, at(21))).toBe(false);
    expect(hasEnded(s, at(21))).toBe(true);
  });

  it('follows a late doctor\'s later end, and the server\'s window when it sent one', () => {
    expect(canJoinNow(booked({ effectiveEndsAt: at(32).toISOString() }), at(30))).toBe(true);
    const fromServer = booked({
      rules: {
        serverNow: T.toISOString(), startsAt: T.toISOString(), graceEndsAt: at(10).toISOString(),
        endsAt: at(20).toISOString(), effectiveEndsAt: at(25).toISOString(),
        joinOpensAt: at(-15).toISOString(), joinClosesAt: at(25).toISOString(),
        present: { patient: false, doctor: false }, doctorJoinedLate: true,
        absentRefundAt: null, missed: false, patientAbsent: false
      }
    });
    expect(joinWindow(fromServer).closesAt).toEqual(at(25));
  });

  it('an instant session is joinable while live; a finished one never', () => {
    expect(canJoinNow(booked({ sessionType: 'immediate' }), at(500))).toBe(true);
    for (const status of ['completed', 'cancelled', 'no-show']) {
      expect(canJoinNow(booked({ status }), at(0))).toBe(false);
    }
  });
});

describe('what became of a session', () => {
  const label = (extra: Partial<SessionLike>, viewer: 'patient' | 'doctor' = 'patient') => outcomeLabel(booked(extra), viewer)?.label;

  it('says nothing for a session still to come', () => {
    expect(outcomeLabel(booked(), 'patient')).toBeNull();
    // A checkout that was never paid: nothing was charged, nothing to refund.
    expect(label({ status: 'cancelled', paymentStatus: 'failed' })).toBe('Payment not completed');
    expect(label({ status: 'cancelled', paymentStatus: 'failed' }, 'doctor')).toBe('Payment not completed');
  });

  it('a cancellation says whether money came back — it used to read "Cancelled & Refunded" every time', () => {
    expect(label({ status: 'cancelled', outcome: { code: 'late_cancellation' } })).toBe('Cancelled — no refund (therapist paid)');
    expect(label({ status: 'cancelled', outcome: { code: 'late_cancellation' } }, 'doctor')).toBe("Cancelled late — you're paid");
    expect(label({ status: 'cancelled', outcome: { code: 'cancelled_by_patient' }, paymentStatus: 'refunded', refundAmount: 1000 }))
      .toBe('Cancelled — refunded ₹1000');
    expect(label({ status: 'cancelled', paymentStatus: 'paid' })).toBe('Cancelled — no refund');
    expect(label({ status: 'cancelled', paymentStatus: 'refund_failed' })).toBe("Cancelled — refund delayed — we're on it");
    expect(label({ status: 'cancelled', paymentStatus: 'not_required' })).toBe('Cancelled');
  });

  it('a refund that has only started is not called "refunded"', () => {
    expect(label({ status: 'cancelled', outcome: { code: 'cancelled_by_patient' }, paymentStatus: 'refund_pending', refundAmount: 1000 }))
      .toBe('Cancelled — refund started — 5–7 working days');
    expect(label({ status: 'cancelled', outcome: { code: 'cancelled_by_patient' }, paymentStatus: 'refund_pending' }, 'doctor'))
      .toBe('Cancelled — patient refund started');
    expect(label({ status: 'no-show', outcome: { code: 'doctor_no_show' }, paymentStatus: 'refund_pending' }))
      .toBe("Therapist didn't join — refund started — 5–7 working days");
  });

  it('no-shows say whose, and where the refund is', () => {
    expect(label({ status: 'no-show', outcome: { code: 'patient_no_show' } })).toBe('Missed — no refund');
    expect(label({ status: 'no-show', outcome: { code: 'patient_no_show' } }, 'doctor')).toBe("Patient didn't join — you're paid");
    expect(label({ status: 'no-show', outcome: { code: 'doctor_no_show' }, paymentStatus: 'refunded' })).toBe("Therapist didn't join — refunded");
    expect(label({ status: 'no-show', outcome: { code: 'doctor_no_show' }, paymentStatus: 'refund_failed' })).toBe("Therapist didn't join — refund delayed — we're on it");
    expect(label({ status: 'no-show', outcome: { code: 'nobody_came' }, paymentStatus: 'refunded' }, 'doctor')).toBe('Nobody joined — patient refunded');
  });

  it('the waiting patient\'s refund and agreed early endings', () => {
    expect(label({ status: 'cancelled', outcome: { code: 'doctor_absent_refund' }, paymentStatus: 'refunded' })).toBe("Therapist didn't join — refunded");
    expect(label({ status: 'cancelled', outcome: { code: 'doctor_absent_refund' }, paymentStatus: 'refunded' }, 'doctor')).toBe('Patient left after waiting — refunded');
    expect(label({ status: 'completed', outcome: { code: 'ended_by_consent' } })).toBe('Ended early by agreement');
    expect(label({ status: 'completed' })).toBe('Completed');
  });

  it('accepts the outcome as call history sends it (a bare code)', () => {
    expect(label({ status: 'no-show', outcome: 'patient_no_show' })).toBe('Missed — no refund');
  });
});

describe('isBooked', () => {
  it('counts paid, free and refunded bookings, not open or failed checkouts', () => {
    for (const p of ['paid', 'not_required', 'refunded', 'refund_pending', 'refund_failed']) expect(isBooked({ paymentStatus: p } as SessionLike)).toBe(true);
    for (const p of ['pending', 'failed', undefined]) expect(isBooked({ paymentStatus: p } as SessionLike)).toBe(false);
  });
});

describe('refundStatusText', () => {
  it('names each stage of a refund, and nothing when there is none', () => {
    expect(refundStatusText({ paymentStatus: 'refund_pending' })).toBe('refund started — 5–7 working days');
    expect(refundStatusText({ paymentStatus: 'refund_failed' })).toBe("refund delayed — we're on it");
    expect(refundStatusText({ paymentStatus: 'refunded', refundAmount: 800 })).toBe('refunded ₹800');
    expect(refundStatusText({ paymentStatus: 'refunded' })).toBe('refunded');
    for (const p of ['paid', 'not_required', 'failed', undefined]) expect(refundStatusText({ paymentStatus: p })).toBeNull();
  });
});

describe('after cancelling: what the patient is told', () => {
  it('says what the server did with the money — never "a refund if applicable"', () => {
    expect(cancelResultMessage({ refundState: 'issued', refundAmount: 1200 })).toBe('Session cancelled. Full refund of ₹1200 — it reaches your account in 5–7 working days.');
    expect(cancelResultMessage({ refundState: 'none', refundAmount: 0, lateCancellation: true })).toMatch(/^Session cancelled\. No refund — it was within 4 hours/);
    expect(cancelResultMessage({ refundState: 'unpaid', refundAmount: 1200 })).toBe('Session cancelled. Nothing was charged.');
    expect(cancelResultMessage({ refundState: 'failed', refundAmount: 1200 })).toMatch(/refund of ₹1200 is delayed/);
  });

  it('an older server that sent only the amount', () => {
    expect(cancelResultMessage({ refundAmount: 900 })).toMatch(/Full refund of ₹900/);
    expect(cancelResultMessage({ refundAmount: 0, lateCancellation: true })).toMatch(/No refund/);
    expect(cancelResultMessage({})).toBe('Session cancelled.');
  });
});

describe('the cancel preview follows the clock', () => {
  it('flips at the 4-hour mark for the same open panel (the moment passed in, not the moment it opened)', () => {
    const start = at(0);
    expect(calculateRefundPreview(1000, start, at(-4 * 60 - 1)).amount).toBe(1000);
    expect(calculateRefundPreview(1000, start, at(-4 * 60)).amount).toBe(0);
    expect(calculateRefundPreview(1000, start, at(-30)).amount).toBe(0);
  });
});
