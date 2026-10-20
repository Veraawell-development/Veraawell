/**
 * Indian phone numbers, as an emergency contact is entered: "+91 98765 43210",
 * "098765 43210", "9876543210" and "91-98765-43210" are all the same number.
 *
 * Stored as +91 and ten digits (E.164), so a doctor's tel: link dials it from
 * anywhere. The emergency-contact form used to strip everything but digits
 * and stop at ten, so typing "+91 98765 43210" saved 9198765432 — a wrong
 * number in the one field that has to be right. Keep in step with
 * client/src/utils/phone.ts.
 */
function normaliseIndianPhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[1-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

const CONTACT_LIMITS = { name: 80, relationship: 40 };

/**
 * An emergency contact from a request body, checked: either all three fields
 * (name, phone, relationship) or none — `{ clear: true }` — so a contact can
 * be removed, but never saved half-filled. Returns { contact } | { clear } |
 * { error }.
 */
function readEmergencyContact({ name, phone, relationship } = {}) {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const n = text(name);
  const p = typeof phone === 'number' ? String(phone) : text(phone);
  const r = text(relationship);
  if (!n && !p && !r) return { clear: true };
  if (!n || !p || !r) return { error: 'An emergency contact needs a name, a phone number and a relationship.' };
  if (n.length > CONTACT_LIMITS.name) return { error: `The contact's name can be at most ${CONTACT_LIMITS.name} characters.` };
  if (r.length > CONTACT_LIMITS.relationship) return { error: `The relationship can be at most ${CONTACT_LIMITS.relationship} characters.` };
  const normalised = normaliseIndianPhone(p);
  if (!normalised) return { error: 'Enter an Indian phone number: 10 digits, with or without +91.' };
  return { contact: { name: n, phone: normalised, relationship: r } };
}

module.exports = { normaliseIndianPhone, readEmergencyContact };
