import { describe, it, expect } from 'vitest';
import { parseReportContent, reportFields, formatReportText, reportSnippet } from '../utils/reportContent';

/**
 * The bug these pin: a patient opened their dashboard and was shown
 *   {"reportType":"progress","mood":"low","progress":4,"observations":["Follow-up recommend...
 * because the doctor had recorded a mood and observations but left summary,
 * recommendations and diagnosis blank, and every renderer's fallback chain
 * ended at the raw JSON.
 */

const BLANK_FREE_TEXT = JSON.stringify({
  reportType: 'progress',
  mood: 'low',
  progress: 4,
  observations: ['Follow-up recommended', 'Good engagement'],
  summary: '',
  recommendations: '',
  diagnosis: ''
});

describe('a report whose free-text fields are all empty', () => {
  it('never shows the patient raw JSON', () => {
    const snippet = reportSnippet(BLANK_FREE_TEXT);
    expect(snippet).not.toContain('{');
    expect(snippet).not.toContain('reportType');
    expect(snippet).not.toContain('"');
  });

  it('shows what the doctor did fill in', () => {
    const snippet = reportSnippet(BLANK_FREE_TEXT);
    expect(snippet).toContain('Low');
    expect(snippet).toContain('4/10');
    expect(snippet).toContain('Follow-up recommended');
  });

  it('exports readably too', () => {
    const text = formatReportText(BLANK_FREE_TEXT);
    expect(text).not.toContain('{');
    expect(text).toContain('Mood: Low');
    expect(text).toContain('Progress: 4/10');
    expect(text).toContain('Observations: Follow-up recommended, Good engagement');
  });
});

describe('a report the doctor wrote prose in', () => {
  const WITH_SUMMARY = JSON.stringify({
    reportType: 'progress', mood: 'positive', progress: 8,
    observations: ['Showing improvement'],
    summary: 'Patient is responding well to the new routine.',
    recommendations: 'Continue weekly sessions.', diagnosis: ''
  });

  it('prefers the doctor own words in a one-line preview', () => {
    expect(reportSnippet(WITH_SUMMARY)).toBe('Patient is responding well to the new routine.');
  });

  it('keeps every filled field in the full text, in a stable order', () => {
    expect(formatReportText(WITH_SUMMARY).split('\n')).toEqual([
      'Mood: Positive',
      'Progress: 8/10',
      'Observations: Showing improvement',
      'Summary: Patient is responding well to the new routine.',
      'Recommendations: Continue weekly sessions.'
    ]);
  });

  it('omits fields that were left blank rather than printing empty labels', () => {
    expect(formatReportText(WITH_SUMMARY)).not.toContain('Diagnosis');
  });
});

describe('content that is not one of our structured reports', () => {
  it('passes ordinary prose straight through', () => {
    expect(formatReportText('Patient arrived on time and engaged well.'))
      .toBe('Patient arrived on time and engaged well.');
    expect(reportSnippet('good working')).toBe('good working');
  });

  it('treats a non-JSON string as prose rather than trying to parse it', () => {
    expect(parseReportContent('not json at all')).toBeNull();
    expect(parseReportContent('{ broken json')).toBeNull();
    expect(reportFields('plain text')).toEqual([]);
  });

  it('survives empty and missing content', () => {
    expect(formatReportText('')).toBe('');
    expect(formatReportText(undefined)).toBe('');
    expect(reportSnippet(undefined)).toBe('');
  });

  it('says so when a structured report recorded nothing at all', () => {
    const empty = JSON.stringify({ reportType: 'progress', mood: '', progress: 0, observations: [] });
    expect(formatReportText(empty)).toBe('No details were recorded.');
    expect(reportSnippet(empty)).toBe('No details recorded');
  });
});

describe('snippet length', () => {
  it('truncates long prose with an ellipsis', () => {
    const long = 'x'.repeat(200);
    const s = reportSnippet(long, 90);
    expect(s).toHaveLength(90);
    expect(s.endsWith('...')).toBe(true);
  });

  it('collapses newlines so a list row stays one line', () => {
    expect(reportSnippet('line one\n\nline two')).toBe('line one line two');
  });
});
