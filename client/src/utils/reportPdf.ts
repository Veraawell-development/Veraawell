import { reportFields } from './reportContent';
import { doctorDisplayName } from './doctorName';
import {
  C, PAGE_W, MARGIN, CONTENT_W, BODY_BOTTOM, BODY_LEAD,
  loadLogo, masthead, title as drawTitle, factsCard, sectionHeading, bodyText, bullet, eyebrow, footers, fileName
} from './pdfTheme';

/**
 * The one clinical report PDF.
 *
 * There were four PDF generators across two libraries, and two of them
 * rendered the SAME report differently depending on which page you downloaded
 * it from — a patient and their doctor could hold two documents describing one
 * session and neither would match. This replaces the report role of all of
 * them; the task/homework PDF in pdfGenerator.ts stays, being a genuinely
 * different document.
 *
 * DESIGN NOTES
 *
 * The first pass laid every field out as an identical full-width section, so
 * "Positive" and "4/5" carried the same visual weight as a paragraph of
 * clinical narrative, and a short report left a large void before a signature
 * floating mid-page. A clinical document has two kinds of content and should
 * look like it does:
 *
 *   - measurements — mood, progress — which are short, scannable, and belong
 *     together in a summary strip at the top
 *   - narrative — observations, summary, recommendations, diagnosis — which
 *     is prose and wants a readable measure and room to breathe
 *
 * The sign-off is pinned to the foot of the last page rather than trailing the
 * text, because that is where a reader looks for it and because it stops a
 * short report from looking unfinished.
 *
 * Other deliberate choices:
 *  - "Clinical Session Report", not "Official Medical Report". This is a
 *    practitioner's record of a session; calling it official overstates what
 *    the platform has verified.
 *  - "PREPARED BY", with no profession. The server sends only a name, and the
 *    profession fields that exist disagree with each other and are partly
 *    self-declared. A document should not assert a credential nobody checked.
 *  - Body content comes from reportFields() in reportContent.ts, the same
 *    formatter the on-screen list and detail view use, so the PDF cannot drift
 *    from what the doctor saw when they filed it.
 *  - The look (masthead, facts card, numbered sections, footer with the
 *    registered company name) is shared with the task sheet: utils/pdfTheme.ts.
 */

/** Raw enum values must never reach the page — "other" is not a report type. */
const REPORT_TYPE_LABELS: Record<string, string> = {
  assessment: 'Assessment',
  progress: 'Progress Note',
  'treatment-plan': 'Treatment Plan',
  diagnosis: 'Diagnosis',
  discharge: 'Discharge Summary',
  other: 'Follow-up'
};

export const reportTypeLabel = (t?: string): string =>
  (t && REPORT_TYPE_LABELS[t]) || 'Consultation';

/** Fields that are measurements rather than narrative. */
const AT_A_GLANCE = new Set(['Mood', 'Progress']);

export interface ReportPdfInput {
  title?: string;
  reportType?: string;
  content?: string;
  createdAt?: string | Date;
  doctorId?: { firstName?: string; lastName?: string } | null;
  patientId?: { firstName?: string; lastName?: string } | null;
  /** Snapshot taken when the report was filed. */
  doctorSignature?: string | null;
  /** The session it is about (populated as { sessionDate, sessionTime }). */
  sessionId?: { sessionDate?: string | Date; startsAt?: string | Date } | string | null;
}

/* ───────────────────────────────── helpers ──────────────────────────────── */

const fullName = (p?: { firstName?: string; lastName?: string } | null) =>
  (p?.firstName ? `${p.firstName} ${p.lastName || ''}`.trim() : '');

// In IST, like every date on the platform: the viewer's own zone could print
// the day before (or after) the one the session and the signature belong to.
const longDate = (d?: string | Date) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

/** The date of the session a report is about, when it is known. */
export const reportSessionDate = (report: Pick<ReportPdfInput, 'sessionId'>): string => {
  const s = report.sessionId;
  if (!s || typeof s !== 'object') return '';
  return longDate(s.startsAt || s.sessionDate);
};

/**
 * Stored titles are built as "<Type> - <Patient> - <date>", so printed as-is
 * the heading repeats the two facts sitting directly beneath it in the meta
 * block. Trim the trailing date, and the patient name if it is still there.
 */
function cleanTitle(title: string | undefined, patient: string): string {
  let t = (title || 'Session Report').trim();
  t = t.replace(/\s*[-–—]\s*\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\s*$/, '');
  if (patient) {
    t = t.replace(new RegExp(`\\s*[-–—]\\s*${patient.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i'), '');
  }
  return t.trim() || 'Session Report';
}

/** Native pixel size of a PNG data URI, read from the IHDR chunk. */
function pngSize(dataUri: string): { w: number; h: number } | null {
  try {
    const b64 = dataUri.split(',')[1];
    const bin = atob(b64.slice(0, 64));
    const at = (i: number) =>
      (bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16) | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
    const w = at(16);
    const h = at(20);
    return w > 0 && h > 0 ? { w, h } : null;
  } catch {
    return null;
  }
}

/* ──────────────────────────────── the layout ────────────────────────────── */

export async function buildReportPdf(report: ReportPdfInput): Promise<any> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ compress: true });
  const logo = await loadLogo();

  const patient = fullName(report.patientId);
  // "Dr." once, even when the stored first name already carries it.
  const doctor = report.doctorId?.firstName ? doctorDisplayName(report.doctorId.firstName, report.doctorId.lastName) : '';
  const dateText = longDate(report.createdAt);
  const sessionDate = reportSessionDate(report);

  let y = masthead(doc, logo, 'Clinical session report', { text: reportTypeLabel(report.reportType) });

  /* ── title and facts ───────────────────────────────────────────────────── */
  y = drawTitle(doc, cleanTitle(report.title, patient), y + 4, sessionDate ? `Session on ${sessionDate}` : undefined);
  y = factsCard(doc, [
    ['Prepared by', doctor || 'Your practitioner'],
    ['Patient', patient || '—'],
    ['Session date', sessionDate || '—'],
    ['Filed on', dateText || '—'],
  ], y);

  /* ── at a glance ───────────────────────────────────────────────────────── */
  const fields = reportFields(report.content);
  const glance = fields.filter((f) => AT_A_GLANCE.has(f.label));
  const narrative = fields.filter((f) => !AT_A_GLANCE.has(f.label));

  if (glance.length > 0) {
    const H = 22;
    const GAP = 5;
    const cardW = (CONTENT_W - GAP * (glance.length - 1)) / glance.length;
    glance.forEach((f, i) => {
      const x = MARGIN + i * (cardW + GAP);
      doc.setFillColor(C.TEAL_WASH);
      doc.setDrawColor(C.TEAL_TINT);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, H, 3, 3, 'FD');
      eyebrow(doc, f.label, x + 6, y + 7, { color: C.TEAL_DARK });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(16);
      doc.setTextColor(C.INK);
      doc.text(f.value, x + 6, y + 15.6);

      // Progress is a number out of five; a meter reads faster than the digits.
      const m = /^(\d+(?:\.\d+)?)\s*\/\s*5$/.exec(f.value);
      if (m) {
        const pct = Math.max(0, Math.min(1, parseFloat(m[1]) / 5));
        const barX = x + 6 + doc.getTextWidth(f.value) + 6;
        const barW = cardW - (barX - x) - 7;
        if (barW > 10) {
          doc.setFillColor(C.TEAL_TINT);
          doc.roundedRect(barX, y + 12.8, barW, 2.6, 1.3, 1.3, 'F');
          if (pct > 0) {
            doc.setFillColor(C.TEAL);
            doc.roundedRect(barX, y + 12.8, Math.max(2.6, barW * pct), 2.6, 1.3, 1.3, 'F');
          }
        }
      }
    });
    y += H + 11;
  } else {
    y += 2;
  }

  /* ── narrative ─────────────────────────────────────────────────────────── */
  // The sign-off occupies a fixed band at the foot of the last page, so the
  // body must stop above it or the two would overlap.
  const SIG_H = 28;
  const sigTop = BODY_BOTTOM - SIG_H;
  const contentBottom = sigTop - 4;

  // Where the last line was actually drawn — distinct from `y`, which carries
  // each section's trailing gap; using that pushed short reports onto a second
  // page over whitespace nothing was drawn into.
  let lastInk = y;
  const newPage = () => {
    doc.addPage();
    y = MARGIN + 6;
    lastInk = y;
  };

  let index = 0;
  const section = (heading: string, paragraphs: string[], bullets = false) => {
    if (paragraphs.length === 0) return;
    bodyText(doc);
    const indent = bullets ? 5 : 0;
    const lines: Array<{ text: string; first: boolean }> = [];
    for (const p of paragraphs) {
      (doc.splitTextToSize(p, CONTENT_W - indent) as string[]).forEach((text, i) => lines.push({ text, first: i === 0 }));
    }
    // Never orphan a heading at the foot of a page — reserve only what this
    // section needs to show its heading and first two lines.
    if (y + 9 + Math.min(lines.length, 2) * BODY_LEAD > contentBottom) newPage();
    index += 1;
    y = sectionHeading(doc, index, heading, y);
    bodyText(doc);
    for (const line of lines) {
      if (y > contentBottom) { newPage(); bodyText(doc); }
      if (bullets && line.first) bullet(doc, MARGIN, y);
      doc.text(line.text, MARGIN + indent, y);
      lastInk = y;
      y += BODY_LEAD;
    }
    y += 7;
  };

  if (narrative.length > 0) {
    for (const f of narrative) {
      // Observations arrive comma-joined: one bullet each.
      if (f.label === 'Observations') section(f.label, f.value.split(', ').filter(Boolean), true);
      else section(f.label, f.value.split(/\n+/).filter(Boolean));
    }
  } else if (glance.length === 0) {
    section('Notes', [report.content || 'No details were recorded.']);
  }

  /* ── sign-off, pinned to the foot of the last page ─────────────────────── */
  if (lastInk > sigTop) newPage();
  let sy = sigTop;
  eyebrow(doc, report.doctorSignature ? 'Signed by' : 'Prepared by', MARGIN, sy);
  sy += 2;

  const sigW = 48;
  if (report.doctorSignature) {
    const size = pngSize(report.doctorSignature);
    let w = sigW;
    let h = 14;
    if (size) {
      h = Math.min(14, (size.h / size.w) * sigW);
      w = (size.w / size.h) * h;
    }
    try {
      doc.addImage(report.doctorSignature, 'PNG', MARGIN, sy + (15 - h), Math.min(w, sigW), h);
    } catch {
      /* fall through to the rule */
    }
  }
  sy += 17;
  doc.setDrawColor(C.HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, sy, MARGIN + 64, sy);
  sy += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.6);
  doc.setTextColor(C.INK);
  doc.text(doctor || 'Practitioner', MARGIN, sy);
  sy += 4.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(C.MUTED);
  // A drawn signature is not an identity check: the line says only what is known.
  doc.text(report.doctorSignature ? `Signed electronically on ${dateText}` : `Filed on ${dateText}`, MARGIN, sy);

  // A quiet note on the right of the sign-off, balancing it.
  doc.setFontSize(7.4);
  doc.text(['Confidential health information.', 'Share it only with people you choose.'], PAGE_W - MARGIN, sigTop + 22, { align: 'right', lineHeightFactor: 1.5 });

  footers(doc, 'Electronically generated');
  return doc;
}

/** Build and download. */
export async function generateReportPdf(report: ReportPdfInput): Promise<void> {
  const doc = await buildReportPdf(report);
  doc.save(`${fileName(report.title || 'session-report')}.pdf`);
}
