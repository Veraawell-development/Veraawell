/**
 * Colours and labels for an assessment severity. Real colour values: these
 * used to be Tailwind class strings ('bg-[#ECFDF5]') passed to inline
 * `style`, which is invalid CSS, so every severity pill rendered colourless.
 */
export interface SeverityStyle {
  bg: string;
  text: string;
  bar: string;
}

const STYLES: Record<string, SeverityStyle> = {
  minimal: { bg: '#ECFDF5', text: '#047857', bar: '#059669' },
  mild: { bg: '#FEF3C7', text: '#B45309', bar: '#D97706' },
  moderate: { bg: '#FFF7ED', text: '#C2410C', bar: '#EA580C' },
  'moderately-severe': { bg: '#FEF2F2', text: '#B91C1C', bar: '#DC2626' },
  severe: { bg: '#FEF2F2', text: '#B91C1C', bar: '#B91C1C' },
};

const FALLBACK: SeverityStyle = { bg: '#F3F4F6', text: '#4B5563', bar: '#4B5563' };

export const severityStyle = (severity: string | null | undefined): SeverityStyle =>
  (severity && STYLES[severity]) || FALLBACK;

/** "moderately-severe" → "Moderately severe". */
export const severityLabel = (severity: string | null | undefined): string => {
  const s = (severity || 'minimal').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
