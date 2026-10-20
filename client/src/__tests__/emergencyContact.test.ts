import { describe, expect, it } from 'vitest';
import { formatIndianPhone, localIndianDigits, normaliseIndianPhone } from '../utils/phone';
import { checkEmergencyContact, hasEmergencyContact } from '../utils/emergencyContact';

describe('normaliseIndianPhone: however it is typed, the same number', () => {
  it.each([
    ['9876543210'],
    ['+91 98765 43210'],
    ['+919876543210'],
    ['91 98765 43210'],
    ['098765 43210'],
    ['(+91) 98765-43210'],
  ])('%s → +919876543210', (input) => {
    expect(normaliseIndianPhone(input)).toBe('+919876543210');
  });

  it('the old bug: "+91 98765 43210" is not cut to 9198765432', () => {
    expect(normaliseIndianPhone('+91 98765 43210')).not.toBe('+919198765432');
  });

  it.each([
    [''], ['12345'], ['98765432'], ['0000000000'], ['+1 415 555 0100 22'], ['98765 43210 9'], ['abc'],
  ])('refuses %s', (input) => {
    expect(normaliseIndianPhone(input)).toBeNull();
  });

  it('formats for display, and gives the ten digits back', () => {
    expect(formatIndianPhone('9876543210')).toBe('+91 98765 43210');
    expect(formatIndianPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatIndianPhone('not a number')).toBe('not a number');
    expect(localIndianDigits('+91 98765 43210')).toBe('9876543210');
  });
});

describe('checkEmergencyContact', () => {
  const full = { name: ' Asha ', phone: '+91 98765 43210', relationship: 'Parent' };

  it('a full contact: trimmed, phone stored as +91 and ten digits', () => {
    expect(checkEmergencyContact(full)).toEqual({
      ok: true, clear: false, contact: { name: 'Asha', phone: '+919876543210', relationship: 'Parent' },
    });
  });

  it('all empty clears it — unless one is required to join', () => {
    const empty = { name: '', phone: ' ', relationship: '' };
    expect(checkEmergencyContact(empty)).toEqual({ ok: true, clear: true });
    const required = checkEmergencyContact(empty, { required: true });
    expect(required.ok).toBe(false);
  });

  it('half-filled is refused field by field', () => {
    const r = checkEmergencyContact({ name: 'Asha', phone: '', relationship: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['phone', 'relationship']);
  });

  it('a wrong phone says what is expected', () => {
    const r = checkEmergencyContact({ ...full, phone: '12345' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toMatch(/10 digits/);
  });

  it('hasEmergencyContact needs a name and a phone', () => {
    expect(hasEmergencyContact({ name: 'A', phone: '+919876543210' })).toBe(true);
    expect(hasEmergencyContact({ name: 'A', phone: null })).toBe(false);
    expect(hasEmergencyContact(undefined)).toBe(false);
  });
});
