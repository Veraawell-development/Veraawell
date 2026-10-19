import { describe, it, expect } from 'vitest';
import { joinWindow, canJoinNow, hasEnded, isBooked, outcomeLabel, type SessionLike } from '../utils/sessionRules';

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
    expect(label({ status: 'cancelled', paymentStatus: 'refund_failed' })).toBe('Cancelled — refund being retried');
  });

  it('no-shows say whose, and where the refund is', () => {
    expect(label({ status: 'no-show', outcome: { code: 'patient_no_show' } })).toBe('Missed — no refund');
    expect(label({ status: 'no-show', outcome: { code: 'patient_no_show' } }, 'doctor')).toBe("Patient didn't join — you're paid");
    expect(label({ status: 'no-show', outcome: { code: 'doctor_no_show' }, paymentStatus: 'refunded' })).toBe("Therapist didn't join — refunded");
    expect(label({ status: 'no-show', outcome: { code: 'doctor_no_show' }, paymentStatus: 'refund_failed' })).toBe("Therapist didn't join — refund being retried");
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
