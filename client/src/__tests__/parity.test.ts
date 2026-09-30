/**
 * Cross-side parity: two implementations of the same rules, pinned to each other.
 *
 * Refund tiers and assessment severity are each written twice — once in
 * client/src and once in server/. The client copy decides what a patient is
 * SHOWN before they cancel; the server copy decides what they are actually
 * REFUNDED. Nothing currently stops those two drifting, and a drift means the
 * app promises one number and pays another.
 *
 * These tests import both implementations and assert they agree, so a change to
 * either side alone fails here.
 */

import { describe, it, expect } from 'vitest';
import { calculateRefundPreview } from '../utils/refundPolicy';
// The server modules are plain CommonJS with no side effects on import.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverRefund = require('../../../server/services/refundPolicy');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverScoring = require('../../../server/utils/assessmentScoring');
import { MENTAL_HEALTH_TESTS, calculateTestScore } from '../data/mentalHealthTests';

const HOURS = [
  0, 0.5, 1, 3.99, 4, 4.01, 5, 12, 23.99, 24, 24.01, 25, 48, 72, 720
];
const PRICES = [0, 1, 99, 100, 799, 800, 1500, 2001, 99999];

describe('refund tiers agree on both sides', () => {
  it('every price and notice combination produces the same amount', () => {
    const mismatches: string[] = [];

    for (const price of PRICES) {
      for (const hours of HOURS) {
        const when = new Date(Date.now() + hours * 3600 * 1000);
        const client = calculateRefundPreview(price, when).amount;
        const server = serverRefund.calculateRefund(price, hours, 'patient');
        // A millisecond of clock drift between the two calls can straddle the
        // boundary; only flag a genuine disagreement. There is one boundary
        // now — the 24h edge went away with the 50% tier.
        const nearBoundary = [4].some((b) => Math.abs(hours - b) < 0.02);
        if (client !== server && !nearBoundary) {
          mismatches.push(`price ${price} at ${hours}h: client ${client} vs server ${server}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('the client label never contradicts the server amount', () => {
    for (const price of [800, 1500, 2000]) {
      for (const hours of [1, 12, 48]) {
        const when = new Date(Date.now() + hours * 3600 * 1000);
        const { amount, label } = calculateRefundPreview(price, when);
        expect(amount).toBe(serverRefund.calculateRefund(price, hours, 'patient'));

        // Two tiers, so there is no third case: any amount that is neither
        // the full price nor zero would itself be the bug.
        if (amount === price) expect(label).toContain('100%');
        else if (amount === 0) expect(label).toContain('No refund');
        else throw new Error(`unexpected partial refund of ${amount} on a ${price} session`);
      }
    }
  });

  it('the client has no notion of who cancelled, so it understates a doctor cancellation', () => {
    // The server gives a full refund whenever the DOCTOR cancels, at any
    // notice. calculateRefundPreview takes only a price and a date, so a
    // doctor-initiated cancellation inside 4 hours is previewed to the patient
    // as "No refund" while the server refunds in full. The preview is wrong in
    // the patient's favour, which is the safer direction, but it is still wrong.
    const soon = new Date(Date.now() + 1 * 3600 * 1000);
    const preview = calculateRefundPreview(2000, soon).amount;
    const serverPatient = serverRefund.calculateRefund(2000, 1, 'patient');
    const serverDoctor = serverRefund.calculateRefund(2000, 1, 'doctor');

    expect(preview).toBe(serverPatient);
    expect(preview).toBe(0);
    expect(serverDoctor).toBe(2000);
    expect(preview).not.toBe(serverDoctor);
  });
});

describe('assessment scoring agrees on both sides', () => {
  // The server exports its table, so compare the two directly instead of
  // inferring thresholds from a rounded percentage.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SERVER_TABLES = serverScoring.SCORING_TABLES as Record<string, {
    maxScore: number;
    severityLevels: Record<string, { min?: number; max?: number }>;
  }>;

  it('every test the client defines is scored by the server with the same maxScore', () => {
    const mismatches: string[] = [];

    for (const [type, def] of Object.entries(MENTAL_HEALTH_TESTS)) {
      const server = SERVER_TABLES[type];
      if (!server) { mismatches.push(`${type}: absent from the server table`); continue; }
      if (server.maxScore !== def.scoring.maxScore) {
        mismatches.push(`${type}: client maxScore ${def.scoring.maxScore} vs server ${server.maxScore}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('every severity threshold matches on both sides', () => {
    const mismatches: string[] = [];

    for (const [type, def] of Object.entries(MENTAL_HEALTH_TESTS)) {
      const server = SERVER_TABLES[type];
      if (!server) continue;

      const clientLevels = def.scoring.severityLevels as Record<string, { min?: number; max?: number }>;
      const names = new Set([...Object.keys(clientLevels), ...Object.keys(server.severityLevels)]);

      for (const name of names) {
        const c = clientLevels[name];
        const srv = server.severityLevels[name];
        if (!c || !srv) { mismatches.push(`${type}.${name}: present on only one side`); continue; }
        if (c.min !== srv.min || c.max !== srv.max) {
          mismatches.push(`${type}.${name}: client ${JSON.stringify(c)} vs server ${JSON.stringify(srv)}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('the two scorers return identical results for the same answers', () => {
    const mismatches: string[] = [];

    for (const type of Object.keys(MENTAL_HEALTH_TESTS)) {
      const maxAnswer = 3;
      for (let answer = 0; answer <= maxAnswer; answer += 1) {
        for (const n of [1, 3, 7]) {
          const rs = Array.from({ length: n }, (_, i) => ({ questionId: i + 1, answer }));
          const client = calculateTestScore(type, rs);
          const server = serverScoring.computeScore(type, rs);
          if (!server) { mismatches.push(`${type}: server returned null`); continue; }
          if (client.total !== server.total
            || client.severity !== server.severity
            || client.percentage !== server.percentage) {
            mismatches.push(
              `${type} n=${n} a=${answer}: client ${JSON.stringify(client)} vs server ${JSON.stringify(server)}`
            );
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('DLA-20 is accepted by the server but has no client definition at all', () => {
    // The server's VALID_TEST_TYPES includes 'dla20', and assessmentScoring
    // deliberately excludes it so the CLIENT's score is stored verbatim — the
    // one test type where the browser decides a clinical severity label.
    //
    // But the client has no definition for it: MENTAL_HEALTH_TESTS holds ten
    // entries and dla20 is not among them, so calculateTestScore('dla20')
    // throws 'Invalid test type'. The server is waiting for a score the client
    // cannot produce.
    //
    // The patient dashboard used to offer a DLA-20 tile anyway, spelled
    // 'disability' — a third spelling matching neither side — which bounced
    // every patient who tapped it straight back to the list. That tile and the
    // matching filter pill on MyTestsPage are gone: the platform no longer
    // advertises an assessment it cannot administer. This assertion stays as
    // the record of why, and will fail the day someone adds the questions,
    // which is the right moment to put the tile back.
    expect(Object.keys(MENTAL_HEALTH_TESTS)).toHaveLength(10);
    expect(MENTAL_HEALTH_TESTS.dla20).toBeUndefined();
    expect(() => calculateTestScore('dla20', [{ questionId: 1, answer: 2 }])).toThrow(/Invalid test type/);

    expect(serverScoring.computeScore('dla20', [{ questionId: 1, answer: 2 }])).toBeNull();
  });

  it('the client throws on an unknown type where the server returns null', () => {
    // A small contract asymmetry worth knowing about: the same bad input is a
    // thrown exception on one side and a null on the other.
    expect(() => calculateTestScore('not-a-test', [])).toThrow();
    expect(serverScoring.computeScore('not-a-test', [])).toBeNull();
  });
});
