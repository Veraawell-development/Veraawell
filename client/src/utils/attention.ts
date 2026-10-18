/**
 * Getting a doctor's attention for an incoming instant request.
 *
 * Browsers block audio until the person has interacted with the page, so a
 * ring that creates its own AudioContext when the request arrives is often
 * silent — the doctor's dashboard may have been open, untouched, for an hour.
 * The fix is the usual one: create one shared context and resume it on the
 * doctor's first click or key press, long before any request arrives; the
 * ring then plays through that already-allowed context.
 *
 * The tab title flash is the signal that needs no permission at all.
 */

type AudioCtor = typeof AudioContext;

let shared: AudioContext | null = null;
let unlockInstalled = false;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  return (window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) || null;
}

/** The one context the ring plays through (created on first use). */
export function sharedAudioContext(): AudioContext | null {
  if (shared && shared.state !== 'closed') return shared;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    shared = new Ctor();
  } catch {
    shared = null;
  }
  return shared;
}

/**
 * Resume the shared context on the first click / key press / touch. Safe to
 * call more than once; the listeners remove themselves once audio runs.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const unlock = () => {
    const ctx = sharedAudioContext();
    if (!ctx) return;
    ctx.resume()
      .then(() => {
        if (ctx.state === 'running') events.forEach((e) => window.removeEventListener(e, unlock));
      })
      .catch(() => { /* try again on the next gesture */ });
  };
  events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
}

/** Can a sound be heard right now? */
export function audioIsUnlocked(): boolean {
  return !!shared && shared.state === 'running';
}

/** One two-tone beep through the shared context. */
export function beep(ctx: AudioContext): void {
  if (ctx.state === 'closed') return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(660, ctx.currentTime + 0.2);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.45);
}

/**
 * Alternate the tab title with `text` once a second; returns a function that
 * stops and restores the original title.
 */
export function startTitleFlash(text: string, intervalMs = 1000): () => void {
  const original = document.title;
  let on = false;
  const id = setInterval(() => {
    on = !on;
    document.title = on ? text : original;
  }, intervalMs);
  return () => {
    clearInterval(id);
    document.title = original;
  };
}

/** Tests only. */
export function _resetAttention(): void {
  shared = null;
  unlockInstalled = false;
}
