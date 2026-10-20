import { describe, it, expect } from 'vitest';
import { reportTypeLabel, reportSessionDate } from '../utils/reportPdf';

describe('the session a report is about', () => {
  it('is the IST calendar day, whatever zone the viewer is in', () => {
    // Stored as the IST day at UTC midnight; 21 Oct in India.
    expect(reportSessionDate({ sessionId: { sessionDate: '2026-10-21T00:00:00.000Z' } })).toBe('21 October 2026');
    // 23:30 IST on the 21st is 18:00 UTC — still the 21st.
    expect(reportSessionDate({ sessionId: { startsAt: '2026-10-21T18:00:00.000Z' } })).toBe('21 October 2026');
  });

  it('is empty when the session is unknown', () => {
    expect(reportSessionDate({ sessionId: null })).toBe('');
    expect(reportSessionDate({ sessionId: 'abc' })).toBe('');
    expect(reportSessionDate({})).toBe('');
  });
});

/**
 * The document said "Report type: other" under a heading that called itself an
 * Official Medical Report — a raw enum value printed at a patient, the same
 * class of leak as the JSON blob in reportContent.
 *
 * `other` is the stored value behind the option the doctor actually picked,
 * which PostSessionReportModal labels "Follow-up". The document should print
 * the word they chose.
 */
describe('report type labels', () => {
  it('never prints the raw enum value', () => {
    for (const raw of ['assessment', 'progress', 'treatment-plan', 'diagnosis', 'discharge', 'other']) {
      expect(reportTypeLabel(raw)).not.toBe(raw);
    }
  });

  it('maps "other" to the word the doctor chose in the form', () => {
    expect(reportTypeLabel('other')).toBe('Follow-up');
  });

  it('maps every type the form offers', () => {
    // These are the six values PostSessionReportModal can submit.
    expect(reportTypeLabel('assessment')).toBe('Assessment');
    expect(reportTypeLabel('progress')).toBe('Progress Note');
    expect(reportTypeLabel('treatment-plan')).toBe('Treatment Plan');
    expect(reportTypeLabel('diagnosis')).toBe('Diagnosis');
    expect(reportTypeLabel('discharge')).toBe('Discharge Summary');
  });

  it('falls back to a neutral word rather than printing nothing or undefined', () => {
    expect(reportTypeLabel(undefined)).toBe('Consultation');
    expect(reportTypeLabel('')).toBe('Consultation');
    expect(reportTypeLabel('some-future-type')).toBe('Consultation');
  });
});

describe('the company name printed on every PDF', () => {
  it('is the registered name, with the full stop after Ltd', async () => {
    const { COMPANY_LEGAL_NAME } = await import('../config/company');
    const { COMPANY } = await import('../utils/pdfTheme');
    expect(COMPANY_LEGAL_NAME).toBe('Veraawell Lifecare Pvt. Ltd.');
    expect(COMPANY).toBe(COMPANY_LEGAL_NAME);
  });
});
