import { describe, it, expect } from 'vitest';
import { reportTypeLabel } from '../utils/reportPdf';

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
