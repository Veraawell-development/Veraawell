/**
 * Crisis helplines — the one list every screen shows (the dashboard's
 * helpline modal, the crisis card on test results). India first: the
 * platform's patients. Checked Oct 2026.
 */
export interface Helpline {
  name: string;
  /** As shown. */
  number: string;
  /** As dialled (the tel: link). */
  tel: string;
  hours: string;
}

export const HELPLINES: Helpline[] = [
  { name: 'Emergency (police, ambulance)', number: '112', tel: '112', hours: 'Any time' },
  { name: 'Tele-MANAS — Government of India', number: '14416', tel: '14416', hours: 'Free · 24×7 · 20 languages' },
  { name: 'Tele-MANAS (alternate number)', number: '1-800-891-4416', tel: '18008914416', hours: 'Free · 24×7' },
  { name: 'Vandrevala Foundation', number: '+91 99996 66555', tel: '+919999666555', hours: 'Free · 24×7 · call or WhatsApp' },
];

/** The two numbers to show first when someone may be at risk right now. */
export const URGENT_HELPLINES: Helpline[] = HELPLINES.filter((h) => h.tel === '14416' || h.tel === '112');
