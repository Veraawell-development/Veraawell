import { useMutation } from '@tanstack/react-query';
import { API_BASE_URL } from '../config/api';

/**
 * Posts a public enquiry to POST /api/enquiries.
 *
 * Shared by the two careers tabs ("Partner with us", "Other Queries") and the
 * /contact form, which are three different-looking surfaces sending the same
 * payload. Before this hook existed, all three dropped the message: two
 * behind a `mailto:` link and one behind a `setTimeout` that showed a success
 * toast without making a request.
 *
 * The X-CSRF-Token header is attached by utils/csrfFetchInterceptor.ts, so
 * nothing here needs to know about CSRF.
 */

export type EnquiryType = 'partner' | 'other' | 'contact';

export interface EnquiryPayload {
  type: EnquiryType;
  name: string;
  email: string;
  message: string;
  phone?: string;
  organisation?: string;
  subject?: string;
}

/** Field-keyed messages from the server's ValidationError envelope. */
export type EnquiryFieldErrors = Partial<Record<keyof EnquiryPayload, string>>;

export class EnquiryError extends Error {
  fieldErrors: EnquiryFieldErrors;

  constructor(message: string, fieldErrors: EnquiryFieldErrors = {}) {
    super(message);
    this.name = 'EnquiryError';
    this.fieldErrors = fieldErrors;
  }
}

export function useSubmitEnquiry() {
  return useMutation({
    mutationFn: async (payload: EnquiryPayload) => {
      const response = await fetch(`${API_BASE_URL}/enquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      // A rejected enquiry still has to say *why*, and the server answers with
      // a field-keyed `errors` object — surfacing it beats a generic failure
      // message on a five-field form.
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new EnquiryError(
          body?.message || 'Something went wrong. Please try again.',
          body?.errors || {}
        );
      }
      return body as { success: boolean; message: string; data: { id: string; type: EnquiryType } };
    },
  });
}
