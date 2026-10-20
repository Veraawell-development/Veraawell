import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { savePendingBooking, readPendingBooking, clearPendingBooking } from '../utils/pendingBooking';
import { abandonResult, paymentOutcome } from '../utils/razorpayCheckout';
import { doctorDisplayName, doctorInitials, experienceLabel, stripDrPrefix } from '../utils/doctorName';

/** A Map-backed sessionStorage for the node test environment. */
function installStorage() {
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return store;
}

describe('the booking kept across sign-in', () => {
  beforeEach(() => { installStorage(); });
  afterEach(() => { delete (globalThis as any).sessionStorage; });

  const choice = { doctorId: 'doc1', bookingType: 'scheduled' as const, mode: 'voice' as const, duration: 40, date: '2026-10-21', timeSlot: '10:00 AM' };

  it('comes back for the same therapist', () => {
    savePendingBooking(choice, 1_000);
    expect(readPendingBooking('doc1', 2_000)).toMatchObject(choice);
  });

  it('is not offered on another therapist\'s page', () => {
    savePendingBooking(choice, 1_000);
    expect(readPendingBooking('doc2', 2_000)).toBeNull();
  });

  it('expires after an hour, and is then removed', () => {
    savePendingBooking(choice, 0);
    expect(readPendingBooking('doc1', 61 * 60 * 1000)).toBeNull();
    expect(readPendingBooking('doc1', 1)).toBeNull();
  });

  it('can be cleared', () => {
    savePendingBooking(choice, 1_000);
    clearPendingBooking();
    expect(readPendingBooking('doc1', 2_000)).toBeNull();
  });

  it('ignores tampered or broken entries', () => {
    sessionStorage.setItem('vw_pending_booking', '{nope');
    expect(readPendingBooking('doc1')).toBeNull();
    sessionStorage.setItem('vw_pending_booking', JSON.stringify({ ...choice, mode: 'chat', savedAt: Date.now() }));
    expect(readPendingBooking('doc1')).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    (globalThis as any).sessionStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(() => savePendingBooking(choice)).not.toThrow();
    expect(readPendingBooking('doc1')).toBeNull();
    expect(() => clearPendingBooking()).not.toThrow();
  });
});

describe('closing the payment window', () => {
  it('says the time is free only when the server freed it', () => {
    expect(abandonResult({ outcome: 'expired' })).toBe('freed');
    expect(abandonResult({ outcome: 'not-pending', status: 'cancelled' })).toBe('freed');
    expect(abandonResult(null)).toBe('unknown'); // the request failed
    expect(abandonResult({ outcome: 'gateway-unavailable' })).toBe('unknown');
    expect(abandonResult({ outcome: 'noop' })).toBe('unknown');
  });

  it('a payment that did go through is a booking', () => {
    expect(abandonResult({ outcome: 'captured:confirmed' })).toBe('booked');
    expect(abandonResult({ outcome: 'not-pending', status: 'scheduled' })).toBe('booked');
    expect(abandonResult({ outcome: 'not-pending', status: 'active' })).toBe('booked');
  });

  it('an authorised, not yet captured payment is waited for', () => {
    expect(abandonResult({ outcome: 'awaiting-capture' })).toBe('processing');
  });
});

describe('waiting for a payment the browser could not verify', () => {
  it('reads the session the server returns', () => {
    expect(paymentOutcome({ status: 'scheduled', paymentStatus: 'paid' })).toBe('paid');
    expect(paymentOutcome({ status: 'active', paymentStatus: 'not_required' })).toBe('paid');
    expect(paymentOutcome({ status: 'payment_pending', paymentStatus: 'pending' })).toBe('pending');
    expect(paymentOutcome({ status: 'cancelled', paymentStatus: 'failed' })).toBe('failed');
    expect(paymentOutcome({ status: 'cancelled', paymentStatus: 'paid' })).toBe('failed');
    expect(paymentOutcome(null)).toBe('pending');
  });
});

describe('therapist names', () => {
  it('adds "Dr." once, even when they typed it themselves', () => {
    expect(doctorDisplayName('Asha', 'Rao')).toBe('Dr. Asha Rao');
    expect(doctorDisplayName('Dr. Asha', 'Rao')).toBe('Dr. Asha Rao');
    expect(doctorDisplayName('DR Asha', 'Rao')).toBe('Dr. Asha Rao');
    expect(doctorDisplayName('dr.', 'Rao')).toBe('Dr. Rao');
    expect(doctorDisplayName('Drishti', 'Rao')).toBe('Dr. Drishti Rao'); // a name starting "Dr", not a title
    expect(doctorDisplayName('', '')).toBe('Your therapist');
    expect(stripDrPrefix('Dr. Dr. X')).toBe('Dr. X');
  });

  it('initials skip the title', () => {
    expect(doctorInitials('Dr. Asha', 'Rao')).toBe('AR');
    expect(doctorInitials('Asha', '')).toBe('AS');
  });

  it('experience is shown only when given', () => {
    expect(experienceLabel(8)).toBe('8+ years');
    expect(experienceLabel(1)).toBe('1+ year');
    expect(experienceLabel(0)).toBeNull();
    expect(experienceLabel(undefined)).toBeNull();
  });
});
