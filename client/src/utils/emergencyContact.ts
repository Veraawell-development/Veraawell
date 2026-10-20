import { normaliseIndianPhone, PHONE_HINT } from './phone';

/**
 * The one rule for a patient's emergency contact, used by every form that
 * asks for it (profile page, the Join-from-dashboard prompt, the call room).
 * They used to disagree: free text on the profile page, exactly ten digits
 * (and no way to type +91) in the modal, an HTML pattern in the call room,
 * and nothing at all on the server. Matches server/utils/phone.js.
 */
export interface EmergencyContactValue {
  name: string;
  phone: string;
  relationship: string;
}

export type EmergencyContactErrors = Partial<Record<keyof EmergencyContactValue, string>>;

export const RELATIONSHIP_OPTIONS = ['Parent', 'Spouse', 'Partner', 'Sibling', 'Child', 'Friend', 'Guardian', 'Other'];

export const EMPTY_CONTACT: EmergencyContactValue = { name: '', phone: '', relationship: '' };

export type ContactCheck =
  | { ok: true; clear: true }
  | { ok: true; clear: false; contact: EmergencyContactValue }
  | { ok: false; errors: EmergencyContactErrors };

/**
 * Checks a contact as typed. `required` (joining a session) refuses an empty
 * one; otherwise all-empty means "remove it". A half-filled contact is never
 * accepted — the server refuses it too.
 */
export function checkEmergencyContact(value: EmergencyContactValue, { required = false } = {}): ContactCheck {
  const name = value.name.trim();
  const phone = value.phone.trim();
  const relationship = value.relationship.trim();
  if (!name && !phone && !relationship && !required) return { ok: true, clear: true };

  const errors: EmergencyContactErrors = {};
  if (!name) errors.name = "Enter your contact's name";
  else if (name.length > 80) errors.name = 'Keep the name under 80 characters';
  const normalised = normaliseIndianPhone(phone);
  if (!phone) errors.phone = 'Enter a phone number';
  else if (!normalised) errors.phone = PHONE_HINT;
  if (!relationship) errors.relationship = 'Choose how you know them';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, clear: false, contact: { name, phone: normalised as string, relationship } };
}

/** Whether a stored contact (from /protected or the profile) is complete enough to join a session. */
export function hasEmergencyContact(contact?: { name?: string | null; phone?: string | null } | null): boolean {
  return !!(contact?.name && contact?.phone);
}
