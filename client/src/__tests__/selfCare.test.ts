/**
 * Self-care tools: when crisis help shows on a test result, the shared
 * helpline list, the severity colours, and the production rule that sends
 * unknown routes to the app but lets a missing image 404.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { crisisReason, SELF_HARM_ITEMS } from '../utils/crisisSupport';
import { HELPLINES, URGENT_HELPLINES } from '../data/helplines';
import { severityLabel, severityStyle } from '../utils/severityStyle';
import { MENTAL_HEALTH_TESTS, calculateTestScore, maxScoreFor } from '../data/mentalHealthTests';

describe('crisis help on a test result', () => {
  it('any answer above 0 to a self-harm question shows it, whatever the total', () => {
    expect(crisisReason('depression', 'minimal', [{ questionId: 9, answer: 1 }])).toBe('self-harm');
    expect(crisisReason('post-partum', 'mild', [{ questionId: 10, answer: 1 }])).toBe('self-harm');
  });

  it('a 0 on the self-harm question does not, on its own', () => {
    expect(crisisReason('depression', 'mild', [{ questionId: 9, answer: 0 }, { questionId: 1, answer: 3 }])).toBeNull();
    // The same question number on another test is not a self-harm question.
    expect(crisisReason('anxiety', 'mild', [{ questionId: 9, answer: 3 }])).toBeNull();
  });

  it('a severe or moderately severe result on any test shows it', () => {
    expect(crisisReason('adhd', 'severe', [])).toBe('severe');
    expect(crisisReason('depression', 'moderately-severe', null)).toBe('severe');
    expect(crisisReason('anxiety', 'moderate', [])).toBeNull();
  });

  it('the self-harm questions are the ones the tests really ask about it', () => {
    for (const [type, id] of Object.entries(SELF_HARM_ITEMS)) {
      const q = MENTAL_HEALTH_TESTS[type].questions.find((x) => x.id === id);
      expect([type, q?.text]).toEqual([type, expect.stringMatching(/harm|better off dead/i)]);
    }
  });

  it('the urgent numbers are Tele-MANAS and 112, from the one shared list', () => {
    expect(URGENT_HELPLINES.map((h) => h.tel).sort()).toEqual(['112', '14416']);
    for (const h of HELPLINES) expect(h.tel).toMatch(/^\+?\d+$/);
  });
});

describe('scoring fixes the patient sees', () => {
  it('PHQ-9 is out of 27, and item 10 adds nothing', () => {
    const all3 = Array.from({ length: 10 }, (_, i) => ({ questionId: i + 1, answer: 3 }));
    expect(calculateTestScore('depression', all3)).toEqual({ total: 27, severity: 'severe', percentage: 100 });
  });

  it('the addiction result is out of the chosen path, and reaches every band', () => {
    const drugs = (yes: number) => [{ questionId: 1, answer: 1 }, ...[5, 6, 7].map((id, i) => ({ questionId: id, answer: i < yes ? 1 : 0 }))];
    expect([0, 1, 2, 3].map((n) => calculateTestScore('addiction', drugs(n)).severity))
      .toEqual(['minimal', 'mild', 'moderate', 'severe']);
    expect(maxScoreFor('addiction', drugs(0))).toBe(3);
    expect(maxScoreFor('depression')).toBe(27);
  });
});

describe('severity pills', () => {
  it('use real colour values (not Tailwind class names, which inline styles ignore)', () => {
    for (const sev of ['minimal', 'mild', 'moderate', 'moderately-severe', 'severe', 'unknown']) {
      const s = severityStyle(sev);
      for (const v of [s.bg, s.text, s.bar]) expect(v).toMatch(/^#[0-9A-F]{6}$/i);
    }
    expect(severityLabel('moderately-severe')).toBe('Moderately severe');
    expect(severityLabel(undefined)).toBe('Minimal');
  });
});

describe('client/vercel.json rewrite', () => {
  // Vercel matches `source` as a path-to-regexp pattern; ours is one regex
  // group, so the same regex anchored is what Vercel applies.
  const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'));
  const spa = config.rewrites.find((r: { destination: string }) => r.destination === '/index.html');
  const rewritten = (path: string) => new RegExp(`^${spa.source}$`).test(path);

  it('sends app routes to index.html', () => {
    for (const path of ['/', '/patient-dashboard', '/doctor/64f0c2a1b2c3d4e5f6a7b8c9', '/test-results/preview', '/resources/articles/sleep-and-mood', '/admin/reset-password/abc123def']) {
      expect([path, rewritten(path)]).toEqual([path, true]);
    }
  });

  it('lets a missing image, script or stylesheet 404 instead of answering with the app page', () => {
    for (const path of ['/priya.png', '/no-such.webp', '/assets/index-abc123.js', '/assets/index-abc123.css', '/photos/team.jpg','/favicon.ico']) {
      expect([path, rewritten(path)]).toEqual([path, false]);
    }
  });
});
