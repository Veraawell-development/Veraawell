import { COMPANY_LEGAL_NAME } from '../config/company';

/**
 * The look every Veraawell PDF shares (the clinical report and the task sheet).
 *
 * Editorial and calm, in the product's own teal: a softly lit masthead with
 * the colour logo, spaced uppercase eyebrows, a light large title, facts in
 * one hairline card, rounded tinted panels for measurements, numbered
 * sections, and a quiet footer carrying the registered company name. Colour
 * comes from tints and light, never from heavy fills; no text is pure black.
 *
 * Helvetica only: jsPDF ships it, and embedding the product's fonts would add
 * 100–300 KB to a document for a few headings. Weight, size, spacing and
 * colour carry the hierarchy.
 */

// jsPDF's instance type, without importing the library eagerly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Pdf = any;

export const C = {
  INK: '#17282c',
  BODY: '#3b4a4d',
  MUTED: '#7b888a',
  HAIRLINE: '#e3e9ea',
  TEAL: '#0097b2',        // the logo teal (index.css)
  TEAL_DARK: '#00748a',
  TEAL_TINT: '#d6eef3',
  TEAL_WASH: '#f1f9fb',
};

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 20;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const FOOTER_Y = PAGE_H - 12;
/** Where page content must stop, above the footer. */
export const BODY_BOTTOM = PAGE_H - 26;

export const COMPANY = COMPANY_LEGAL_NAME;
const LOGO_PATH = '/logo/1.png';

/* ─────────────────────────────── the logo ─────────────────────────────── */

let logoCache: string | null | undefined;

/**
 * The colour logo as a PNG data URI, fetched once.
 *
 * jsPDF cannot take a URL or an SVG. Resolves to null rather than throwing: a
 * missing logo degrades to the wordmark, never to a failed download. The
 * 1024px source is redrawn at ~300 dpi for the size it is drawn at — handed
 * the original, jsPDF produced a 4 MB file for a 13 mm mark.
 */
export async function loadLogo(): Promise<string | null> {
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
    logoCache = await downscale(raw, 180);
  } catch {
    logoCache = null;
  }
  return logoCache;
}

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

/* ─────────────────────────────── primitives ─────────────────────────────── */

const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t)) as [number, number, number];
};

/** Small spaced capitals: section labels, field labels. */
export function eyebrow(doc: Pdf, text: string, x: number, y: number, opts: { color?: string; size?: number; align?: 'left' | 'right' | 'center'; bold?: boolean } = {}) {
  doc.setFont('helvetica', opts.bold === false ? 'normal' : 'bold');
  doc.setFontSize(opts.size ?? 6.6);
  doc.setTextColor(opts.color ?? C.MUTED);
  doc.text(text.toUpperCase(), x, y, { align: opts.align ?? 'left', charSpace: 0.45 });
}

/** A rounded pill with text; returns its width. `x` is its left edge, or right edge when align is 'right'. */
export function pill(doc: Pdf, text: string, x: number, y: number, opts: { fill?: string; color?: string; align?: 'left' | 'right' } = {}) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const label = text.toUpperCase();
  const w = doc.getTextWidth(label) + label.length * 0.35 + 7;
  const h = 6;
  const left = opts.align === 'right' ? x - w : x;
  doc.setFillColor(opts.fill ?? C.TEAL_TINT);
  doc.roundedRect(left, y - h / 2, w, h, h / 2, h / 2, 'F');
  doc.setTextColor(opts.color ?? C.TEAL_DARK);
  doc.text(label, left + 3.5, y + 0.95, { charSpace: 0.35 });
  return w;
}

/**
 * The masthead: a band of soft teal light fading to white, the colour logo
 * and wordmark with the company's registered name, and on the right what the
 * document is (eyebrow) and its kind (pill).
 */
export function masthead(doc: Pdf, logo: string | null, kind: string, badge?: { text: string; fill?: string; color?: string }) {
  const BAND = 40;
  const steps = 40;
  for (let i = 0; i < steps; i += 1) {
    doc.setFillColor(...mix('#e6f5f8', '#ffffff', i / (steps - 1)));
    doc.rect(0, (BAND / steps) * i, PAGE_W, BAND / steps + 0.2, 'F');
  }

  const LOGO = 14;
  const top = 14;
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, top, LOGO, LOGO);
    } catch {
      /* a bad asset must not cost the user their download */
    }
  }
  const textX = logo ? MARGIN + LOGO + 4.5 : MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(C.INK);
  doc.text('Veraawell', textX, top + 6.6, { charSpace: -0.15 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(C.MUTED);
  doc.text(COMPANY, textX, top + 11.4);

  eyebrow(doc, kind, PAGE_W - MARGIN, top + 4.2, { color: C.TEAL, align: 'right', size: 6.8 });
  if (badge) pill(doc, badge.text, PAGE_W - MARGIN, top + 10.6, { align: 'right', fill: badge.fill, color: badge.color });

  return BAND + 2; // where the content starts
}

/** A light, large title with an optional line under it; returns the new y. */
export function title(doc: Pdf, text: string, y: number, subtitle?: string) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(24);
  doc.setTextColor(C.INK);
  const lines: string[] = doc.splitTextToSize(text, CONTENT_W);
  doc.text(lines, MARGIN, y, { charSpace: -0.2, lineHeightFactor: 1.15 });
  let next = y + (lines.length - 1) * 9.6 + 3;
  if (subtitle) {
    next += 3.6;
    doc.setFontSize(9);
    doc.setTextColor(C.MUTED);
    doc.text(subtitle, MARGIN, next);
  }
  return next + 9;
}

/** Facts in one hairline card, in equal columns divided by hairlines; returns the new y. */
export function factsCard(doc: Pdf, items: Array<[string, string]>, y: number) {
  const H = 19;
  doc.setDrawColor(C.HAIRLINE);
  doc.setLineWidth(0.3);
  doc.setFillColor('#ffffff');
  doc.roundedRect(MARGIN, y, CONTENT_W, H, 3, 3, 'FD');
  const colW = CONTENT_W / items.length;
  items.forEach(([label, value], i) => {
    const x = MARGIN + i * colW + 6;
    if (i > 0) doc.line(MARGIN + i * colW, y + 4.5, MARGIN + i * colW, y + H - 4.5);
    eyebrow(doc, label, x, y + 7.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.6);
    doc.setTextColor(C.INK);
    // Clipped to its column, so a long value can't run into the next one.
    doc.text(doc.splitTextToSize(value || '—', colW - 10)[0], x, y + 13.4);
  });
  return y + H + 10;
}

/** A numbered section heading with a hairline beneath; returns the y for the body. */
export function sectionHeading(doc: Pdf, index: number, heading: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(C.TEAL);
  const num = String(index).padStart(2, '0');
  doc.text(num, MARGIN, y);
  doc.setFontSize(10.6);
  doc.setTextColor(C.INK);
  doc.text(heading, MARGIN + 8, y);
  doc.setDrawColor(C.HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + 3, PAGE_W - MARGIN, y + 3);
  return y + 9;
}

export const BODY_SIZE = 10;
export const BODY_LEAD = 5.5;

/** Sets the body text style. */
export function bodyText(doc: Pdf) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_SIZE);
  doc.setTextColor(C.BODY);
}

/** A small teal dot, for bullet lists. */
export function bullet(doc: Pdf, x: number, y: number) {
  doc.setFillColor(C.TEAL);
  doc.circle(x + 0.8, y - 1.25, 0.75, 'F');
}

/** The footer on every page: hairline, legal name, a note, and the page count. */
export function footers(doc: Pdf, note: string) {
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(C.HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, FOOTER_Y - 5.5, PAGE_W - MARGIN, FOOTER_Y - 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(C.MUTED);
    doc.text(COMPANY, MARGIN, FOOTER_Y);
    doc.text(note, PAGE_W / 2, FOOTER_Y, { align: 'center' });
    doc.text(`veraawell.com  ·  Page ${i} of ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
  }
}

/** A plain file name from a title. */
export const fileName = (base: string) =>
  base.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'document';
