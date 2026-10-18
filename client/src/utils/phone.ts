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
