/**
 * A phone number someone can call back: 10 to 15 digits once spaces, dashes,
 * brackets and a leading + are ignored. The same rule the server applies (the
 * User schema, and the enquiry validator), so the form never accepts what the
 * API will refuse.
 */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * An Indian number as an emergency contact is typed or pasted — "+91 98765
 * 43210", "098765 43210", "9876543210" — as +91 and ten digits, or null when
 * it isn't one. The same rule as server/utils/phone.js. The old form kept
 * only digits and stopped at ten, so "+91 98765 43210" was saved as
 * 9198765432: a wrong number for the one person we may need to call.
 */
export function normaliseIndianPhone(value: string | null | undefined): string | null {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[1-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "+919876543210" (or a bare ten digits, as older contacts were saved) → "+91 98765 43210". */
export function formatIndianPhone(value: string | null | undefined): string {
  const normalised = normaliseIndianPhone(value);
  if (!normalised) return String(value ?? '');
  const d = normalised.slice(3);
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

/** The ten digits after +91, for the input box (which shows +91 as a fixed prefix). */
export function localIndianDigits(value: string | null | undefined): string {
  const normalised = normaliseIndianPhone(value);
  return normalised ? normalised.slice(3) : String(value ?? '').replace(/\D/g, '');
}

export const PHONE_HINT = 'Enter an Indian phone number: 10 digits, with or without +91.';
