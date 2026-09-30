import { reportFields } from './reportContent';

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
 * "Positive" and "4/10" carried the same visual weight as a paragraph of
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
 *  - Helvetica. jsPDF ships Helvetica/Times/Courier; the product's Newsreader
 *    and Public Sans would each need a ~100-300 KB embedded TTF for a document
 *    nobody reads on screen. Hierarchy is carried by size, weight and space.
 */

/* ────────────────────────────── design tokens ───────────────────────────── */

const INK = '#16262a';
const TEAL = '#0097b2';        // the logo teal, declared in index.css
const TEAL_WASH = '#f0fafc';   // the palest tint of it, for the summary strip
const MUTED = '#8a938f';
const HAIRLINE = '#e4e7e6';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 14;

const COMPANY = 'Veraawell Live Care Limited';
const LOGO_PATH = '/logo/1.png';

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
}

/* ───────────────────────────────── helpers ──────────────────────────────── */

let logoCache: string | null | undefined;

/**
 * The logo as a PNG data URI, fetched once.
 *
 * jsPDF cannot take a URL or an SVG, so this is the only route. Resolves to
 * null rather than throwing: a missing logo must degrade to a wordmark, never
 * to a failed download.
 */
async function loadLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch(LOGO_PATH);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const raw = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    // The source is 1024x1024. jsPDF decodes a PNG to raw pixels before
    // embedding, so handing it the original produced a 4 MB report for a
    // 13mm mark. Downscaled to roughly 300dpi at the size it is actually
    // drawn; falls back to the original if there is no canvas.
    logoCache = await downscale(raw, 160);
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/** Redraw a data-URI image at `size` px square. Returns the input unchanged if that is not possible. */
async function downscale(dataUri: string, size: number): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUri;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUri;
    ctx.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } catch {
    return dataUri;
  }
}

const fullName = (p?: { firstName?: string; lastName?: string } | null, prefix = '') =>
  (p?.firstName ? `${prefix}${p.firstName} ${p.lastName || ''}`.trim() : '');

const longDate = (d?: string | Date) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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
  const doc = new jsPDF();
  const logo = await loadLogo();

  const patient = fullName(report.patientId);
  const doctor = fullName(report.doctorId, 'Dr. ');
  const dateText = longDate(report.createdAt);

  let y = 0;

  /* ── masthead ──────────────────────────────────────────────────────────── */
  const LOGO_SIZE = 13;
  if (logo) {
    try {
      // Square source, so no aspect maths — and drawn large enough to read as
      // a mark rather than a speck.
      doc.addImage(logo, 'PNG', MARGIN, 14, LOGO_SIZE, LOGO_SIZE);
    } catch {
      /* a bad asset must not cost the user their download */
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text('Veraawell', logo ? MARGIN + LOGO_SIZE + 5 : MARGIN, 23.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(TEAL);
  doc.text('CLINICAL SESSION REPORT', PAGE_W - MARGIN, 19.5, { align: 'right' });
  doc.setTextColor(MUTED);
  doc.setFontSize(8.5);
  doc.text(dateText, PAGE_W - MARGIN, 25, { align: 'right' });

  doc.setDrawColor(TEAL);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, 33, PAGE_W - MARGIN, 33);

  y = 47;

  /* ── title ─────────────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(INK);
  const titleLines: string[] = doc.splitTextToSize(cleanTitle(report.title, patient), CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 7.6 + 8;

  /* ── who and what ──────────────────────────────────────────────────────── */
  const meta: Array<[string, string]> = [
    ['PREPARED BY', doctor || 'Your practitioner'],
    ['PATIENT', patient || '—'],
    ['REPORT TYPE', reportTypeLabel(report.reportType)],
    ['DATE', dateText || '—']
  ];

  const colW = CONTENT_W / 2;
  meta.forEach(([label, value], i) => {
    const x = MARGIN + (i % 2) * colW;
    const rowY = y + Math.floor(i / 2) * 12.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(MUTED);
    doc.text(label, x, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(INK);
    // Clipped to its own column, so a long value cannot collide with the next
    // label the way the original magic x-offsets allowed.
    doc.text(doc.splitTextToSize(value, colW - 8)[0], x, rowY + 5);
  });
  y += Math.ceil(meta.length / 2) * 12.5 + 6;

  /* ── at a glance ───────────────────────────────────────────────────────── */
  const fields = reportFields(report.content);
  const glance = fields.filter((f) => AT_A_GLANCE.has(f.label));
  const narrative = fields.filter((f) => !AT_A_GLANCE.has(f.label));

  if (glance.length > 0) {
    const H = 22;
    doc.setFillColor(TEAL_WASH);
    doc.roundedRect(MARGIN, y, CONTENT_W, H, 2.5, 2.5, 'F');

    const cellW = CONTENT_W / glance.length;
    glance.forEach((f, i) => {
      const x = MARGIN + i * cellW + 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(MUTED);
      doc.text(f.label.toUpperCase(), x, y + 8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(INK);
      doc.text(f.value, x, y + 15.5);

      // Progress is a number out of ten; a short meter reads faster than the
      // digits and costs two rectangles.
      const m = /^(\d+(?:\.\d+)?)\s*\/\s*10$/.exec(f.value);
      if (m) {
        const pct = Math.max(0, Math.min(1, parseFloat(m[1]) / 10));
        const barX = x + 22;
        const barW = Math.min(38, cellW - 34);
        if (barW > 10) {
          doc.setFillColor('#d8ecf1');
          doc.roundedRect(barX, y + 12.2, barW, 3.2, 1.6, 1.6, 'F');
          if (pct > 0) {
            doc.setFillColor(TEAL);
            doc.roundedRect(barX, y + 12.2, Math.max(3.2, barW * pct), 3.2, 1.6, 1.6, 'F');
          }
        }
      }

      if (i > 0) {
        doc.setDrawColor('#d8ecf1');
        doc.setLineWidth(0.3);
        doc.line(MARGIN + i * cellW, y + 5, MARGIN + i * cellW, y + H - 5);
      }
    });
    y += H + 12;
  } else {
    y += 4;
  }

  /* ── narrative ─────────────────────────────────────────────────────────── */
  // The sign-off occupies a fixed band at the foot of the last page, so the
  // body must stop above it or the two would overlap.
  const SIG_H = 30;
  const sigTop = PAGE_H - 34 - SIG_H;
  const contentBottom = sigTop - 6;

  // Where the last line of text was actually drawn. Distinct from `y`, which
  // carries each section's trailing gap — using that to decide whether the
  // sign-off fits pushed a report onto a second page over a few millimetres
  // of whitespace that nothing was ever drawn into.
  let lastInk = y;

  const newPage = () => {
    doc.addPage();
    y = MARGIN + 8;
    lastInk = y;
  };

  const section = (heading: string, body: string) => {
    if (!body) return;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const lines: string[] = doc.splitTextToSize(body, CONTENT_W);

    // Never orphan a heading at the foot of a page — but reserve only what
    // this section actually needs. A flat reservation broke a one-line
    // section onto a second page over a few spare millimetres.
    const needed = 5.8 + Math.min(lines.length, 2) * 5.4;
    if (y + needed > contentBottom) newPage();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(TEAL);
    doc.text(heading.toUpperCase(), MARGIN, y);
    y += 5.8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(INK);

    // Line by line, so a long body breaks across pages instead of running off
    // the bottom — the original only checked between sections.
    for (const line of lines) {
      if (y > contentBottom) newPage();
      doc.text(line, MARGIN, y);
      lastInk = y;
      y += 5.4;
    }
    y += 9;
  };

  if (narrative.length > 0) {
    for (const f of narrative) {
      // Observations arrive comma-joined; give them real bullets, including
      // the first, which the original '\n• ' join always missed.
      const body = f.label === 'Observations'
        ? f.value.split(', ').map((o) => `•   ${o}`).join('\n')
        : f.value;
      section(f.label, body);
    }
  } else if (glance.length === 0) {
    section('Notes', report.content || 'No details were recorded.');
  }

  /* ── sign-off, pinned to the foot of the last page ─────────────────────── */
  // Only move to a new page when real content would otherwise be sat on.
  if (lastInk > sigTop) newPage();

  let sy = sigTop;

  const sigW = 50;
  if (report.doctorSignature) {
    const size = pngSize(report.doctorSignature);
    let w = sigW;
    let h = 15;
    if (size) {
      h = Math.min(15, (size.h / size.w) * sigW);
      w = (size.w / size.h) * h;
    }
    try {
      doc.addImage(report.doctorSignature, 'PNG', MARGIN, sy + (16 - h), Math.min(w, sigW), h);
    } catch {
      /* fall through to the rule */
    }
  }
  sy += 17;

  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, sy, MARGIN + sigW + 14, sy);
  sy += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  doc.text(doctor || 'Practitioner', MARGIN, sy);
  sy += 4.4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  // The attestation is what gives the image meaning: a drawn signature is not
  // an identity check, so the document says only what it actually knows.
  doc.text(
    report.doctorSignature ? `Signed electronically on ${dateText}` : `Filed on ${dateText}`,
    MARGIN,
    sy
  );

  /* ── footer, stamped once the page count is known ──────────────────────── */
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, FOOTER_Y - 5.5, PAGE_W - MARGIN, FOOTER_Y - 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(COMPANY, MARGIN, FOOTER_Y);
    doc.text('Electronically generated', PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  }

  return doc;
}

/** Build and download. */
export async function generateReportPdf(report: ReportPdfInput): Promise<void> {
  const doc = await buildReportPdf(report);
  const safe = (report.title || 'session-report')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  doc.save(`${safe}.pdf`);
}
