/**
 * Reads the fixture manifest written by server/scripts/e2e-stack.js.
 *
 * Specs must never invent their own accounts: registration goes through an OTP
 * handshake whose code is only ever emailed, so the stack seeds users directly
 * through Mongoose and records the ids and credentials here.
 */
import fs from 'fs';
import path from 'path';

export interface SeededUser { id: string; email: string; password: string }

export interface Fixtures {
  mongoUri: string;
  port: number;
  mailSink: string;
  adminToken: string;
  passwords: Record<string, string>;
  users: {
    patientA: SeededUser; patientB: SeededUser;
    doctorA: SeededUser;  doctorB: SeededUser;
    admin: SeededUser;    superAdmin: SeededUser;
  };
  paidSessionId: string;
}

const MANIFEST = path.resolve(process.cwd(), '../server/tmp/e2e-fixtures.json');

let cached: Fixtures | null = null;

export function fixtures(): Fixtures {
  if (cached) return cached;
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(
      `Fixture manifest missing at ${MANIFEST}. ` +
      'Start the stack with `node scripts/e2e-stack.js` from server/, or let Playwright start it.'
    );
  }
  cached = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Fixtures;
  return cached;
}

/** Emails captured instead of sent, newest last. */
export function mailSink(): Array<{ fn: string; at: string; args: unknown[] }> {
  const f = fixtures();
  if (!fs.existsSync(f.mailSink)) return [];
  return JSON.parse(fs.readFileSync(f.mailSink, 'utf8'));
}

/** The most recent 6-digit code sent to an address, or null. */
export function latestOtpFor(email: string): string | null {
  const entries = mailSink().filter(
    (e) => e.fn === 'sendOTPEmail' && String(e.args?.[0]).toLowerCase() === email.toLowerCase()
  );
  if (!entries.length) return null;
  const code = String(entries[entries.length - 1].args?.[1] ?? '');
  return /^\d{6}$/.test(code) ? code : null;
}

export const BASE_URL = 'http://localhost:5173';
export const API_URL = 'http://localhost:5001/api';
