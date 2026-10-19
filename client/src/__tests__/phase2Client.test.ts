import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two small Phase 2 guarantees on the client:
 *  - no page promises rescheduling (it isn't offered: cancel and book again);
 *  - the instant-request ring's helpers: one shared audio context, unlocked
 *    by the doctor's first gesture, and a title flash that restores itself.
 */

describe('no page promises rescheduling', () => {
  const root = join(__dirname, '..');
  const files = ['pages', 'components'].flatMap((dir) =>
    readdirSync(join(root, dir)).filter((f) => f.endsWith('.tsx')).map((f) => join(root, dir, f)));

  it('says "reschedule" nowhere a person can read it', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*');
        if (!isComment && /reschedul/i.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('attention helpers', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('the tab title alternates and is restored when stopped', async () => {
    vi.useFakeTimers();
    const doc = { title: 'Veraawell' };
    vi.stubGlobal('document', doc);
    const { startTitleFlash } = await import('../utils/attention');
    const stop = startTitleFlash('📞 Incoming request', 1000);
    vi.advanceTimersByTime(1000);
    expect(doc.title).toBe('📞 Incoming request');
    vi.advanceTimersByTime(1000);
    expect(doc.title).toBe('Veraawell');
    vi.advanceTimersByTime(1000);
    stop();
    expect(doc.title).toBe('Veraawell');
  });

  it('one shared audio context, resumed on the first gesture, listeners removed once running', async () => {
    const listeners = new Map<string, () => void>();
    class FakeCtx {
      state: 'suspended' | 'running' | 'closed' = 'suspended';
      resume() { this.state = 'running'; return Promise.resolve(); }
    }
    vi.stubGlobal('window', {
      AudioContext: FakeCtx,
      addEventListener: (e: string, fn: () => void) => listeners.set(e, fn),
      removeEventListener: (e: string) => listeners.delete(e),
    });
    const mod = await import('../utils/attention');
    mod._resetAttention();
    expect(mod.audioIsUnlocked()).toBe(false);
    mod.installAudioUnlock();
    mod.installAudioUnlock(); // idempotent
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown', 'touchstart']);

    listeners.get('pointerdown')!();
    await Promise.resolve();
    await Promise.resolve();
    expect(mod.audioIsUnlocked()).toBe(true);
    expect(listeners.size).toBe(0);
    expect(mod.sharedAudioContext()).toBe(mod.sharedAudioContext());
  });
});
