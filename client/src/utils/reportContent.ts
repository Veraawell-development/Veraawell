/**
 * Turning a stored session report into something a person can read.
 *
 * PostSessionReportModal saves the whole form as `content: JSON.stringify(...)`,
 * so a report's content is a JSON blob rather than prose. Four places then
 * un-packed it independently, each with its own idea of what to do, and each
 * fell back to printing the blob:
 *
 *   - the patient dashboard tried summary || recommendations || diagnosis and,
 *     when a doctor had filled in mood and observations but left those three
 *     empty, showed the patient
 *     {"reportType":"progress","mood":"low","progress":4,...}
 *   - the PDF export printed the raw string whenever parsing did not apply
 *   - the plain-text export always printed the raw string
 *   - the detail modal was handed report.content untouched
 *
 * Falling back to raw JSON is never right. A report that recorded a mood and
 * some observations is perfectly readable — it just has nothing in the free-text
 * fields. So the fallback is to render whatever the doctor DID fill in, and
 * the blob is only ever shown when the content genuinely is not one of ours.
 */

/** The shape PostSessionReportModal stores. Every field is optional in practice. */
export interface StructuredReport {
  reportType?: string;
  mood?: string;
  progress?: number;
  observations?: string[];
  summary?: string;
  recommendations?: string;
  diagnosis?: string;
}

/** The structured form, or null when the content is ordinary prose. */
export function parseReportContent(content?: string): StructuredReport | null {
  const raw = (content || '').trim();
  if (!raw.startsWith('{') || !raw.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StructuredReport) : null;
  } catch {
    return null;
  }
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Ordered label/value pairs for whatever the doctor actually filled in. */
export function reportFields(content?: string): Array<{ label: string; value: string }> {
  const r = parseReportContent(content);
  if (!r) return [];

  const out: Array<{ label: string; value: string }> = [];
  if (r.mood) out.push({ label: 'Mood', value: titleCase(r.mood) });
  if (typeof r.progress === 'number' && r.progress > 0) {
    out.push({ label: 'Progress', value: `${r.progress}/10` });
  }
  if (Array.isArray(r.observations) && r.observations.length > 0) {
    out.push({ label: 'Observations', value: r.observations.join(', ') });
  }
  if (r.summary) out.push({ label: 'Summary', value: r.summary });
  if (r.recommendations) out.push({ label: 'Recommendations', value: r.recommendations });
  if (r.diagnosis) out.push({ label: 'Diagnosis', value: r.diagnosis });
  return out;
}

/**
 * The whole report as readable text — for exports, and for anywhere that wants
 * a single string. Prose content passes straight through.
 */
export function formatReportText(content?: string): string {
  const fields = reportFields(content);
  if (fields.length === 0) {
    // Either ordinary prose, or a structured report with nothing filled in.
    return parseReportContent(content) ? 'No details were recorded.' : (content || '');
  }
  return fields.map((f) => `${f.label}: ${f.value}`).join('\n');
}

/**
 * A one-line preview for list rows.
 *
 * Prefers the doctor's own words, then falls back to the structured fields —
 * never to the JSON itself.
 */
export function reportSnippet(content?: string, maxLength = 90): string {
  const r = parseReportContent(content);

  let text: string;
  if (r) {
    text = r.summary || r.recommendations || r.diagnosis
      || reportFields(content).map((f) => `${f.label}: ${f.value}`).join(' · ')
      || 'No details recorded';
  } else {
    text = content || '';
  }

  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}
