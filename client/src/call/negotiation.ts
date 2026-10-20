/**
 * One RTCPeerConnection, negotiated the "perfect negotiation" way (MDN:
 * WebRTC_API/Perfect_negotiation): either side may offer at any time; when
 * both do at once, the polite side (the patient) yields and the impolite side
 * (the doctor) wins. `setLocalDescription()` with no arguments, implicit
 * rollback, and ICE candidates queued until the remote description is set.
 *
 * What it replaces: only the doctor could offer, only after a "patient-ready"
 * message; any reconnect tore the connection down and built a new one; the
 * patient never recovered on its own; candidates for an old connection were
 * replayed into a new one. Here a connection lives for the whole call and is
 * repaired in place: `restartIce()` on failure, and after two failed restarts
 * a switch to relay-only (setConfiguration + restartIce, as the spec needs).
 *
 * Crossing offers are avoided where we can, because Chrome has a bug there:
 * when the polite side rolls its offer back while it is still gathering
 * network candidates, that connection never gathers again (no candidates,
 * ICE stuck at "new" — found by the two-browser tests). So the first offer
 * comes from the impolite side only (the polite side offers itself only if
 * none arrives within POLITE_FIRST_OFFER_MS), the polite side gives the
 * other a moment to restart ICE before doing it itself, and a connection
 * that stops gathering is reported as 'stuck' so the call rebuilds it.
 *
 * Framework-free and DOM-free, so it can be unit tested with a fake
 * RTCPeerConnection (src/__tests__/callNegotiation.test.ts).
 */

export interface SignalOut {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

export interface NegotiatorOptions {
  polite: boolean;
  send: (signal: SignalOut) => void;
  /** Called as the connection is repaired; 'stuck' = rebuild it (see above). */
  onRepair?: (what: 'restart' | 'relay' | 'gave-up' | 'stuck') => void;
  /** Called when the ICE state changes (for the UI / telemetry). */
  onIceState?: (state: RTCIceConnectionState) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/** After this long "disconnected", try an ICE restart. */
export const DISCONNECTED_RESTART_MS = 4000;
/** Restarts are spaced out like this; after the 2nd fails, go relay-only. */
export const RESTART_BACKOFF_MS = [0, 5000, 10000, 15000];
/** The polite side waits this long for the other side's first offer. */
export const POLITE_FIRST_OFFER_MS = 3000;
/** …and this long for the other side to restart ICE before it does. */
export const POLITE_REPAIR_DELAY_MS = 2500;
/** A local description with no candidate after this long = stuck. */
export const GATHER_STALL_MS = 6000;

export class Negotiator {
  readonly pc: RTCPeerConnection;
  private readonly opts: NegotiatorOptions;
  private makingOffer = false;
  private ignoreOffer = false;
  private isSettingRemoteAnswerPending = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private restarts = 0;
  private lastRestartAt = 0;
  private disconnectedTimer: unknown = null;
  private closed = false;
  /** A remote description has been applied at least once. */
  private negotiated = false;
  private firstOfferTimer: unknown = null;
  private politeRepairTimer: unknown = null;
  private gatherTimer: unknown = null;
  private candidatesSinceLocal = 0;
  private lastRemoteOfferAt = 0;
  relayOnly = false;

  constructor(pc: RTCPeerConnection, opts: NegotiatorOptions) {
    this.pc = pc;
    this.opts = opts;
    pc.onnegotiationneeded = () => this.onNegotiationNeeded();
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.candidatesSinceLocal += 1;
      // `null` = end of candidates; sent as such.
      this.opts.send({ candidate: candidate ? candidate.toJSON() : null });
    };
    pc.oniceconnectionstatechange = () => this.onIceState();
  }

  private get timer() {
    return {
      set: this.opts.setTimer || ((fn: () => void, ms: number) => setTimeout(fn, ms)),
      clear: this.opts.clearTimer || ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>)),
      now: this.opts.now || (() => Date.now()),
    };
  }

  private onNegotiationNeeded() {
    if (this.closed) return;
    if (this.opts.polite && !this.negotiated) {
      // Let the other side open; offer ourselves only if it doesn't.
      if (!this.firstOfferTimer) {
        const { set } = this.timer;
        this.firstOfferTimer = set(() => {
          this.firstOfferTimer = null;
          if (!this.negotiated && !this.closed && this.pc.signalingState === 'stable') void this.makeOffer();
        }, POLITE_FIRST_OFFER_MS);
      }
      return;
    }
    void this.makeOffer();
  }

  /** Watch that a fresh local description actually gathers candidates. */
  private watchGathering() {
    const { set, clear } = this.timer;
    if (this.gatherTimer) clear(this.gatherTimer);
    this.candidatesSinceLocal = 0;
    this.gatherTimer = set(() => {
      this.gatherTimer = null;
      if (this.closed || this.candidatesSinceLocal > 0) return;
      if (this.pc.iceGatheringState === 'complete') return;
      const ice = this.pc.iceConnectionState;
      if (ice === 'connected' || ice === 'completed') return;
      this.opts.onRepair?.('stuck');
    }, GATHER_STALL_MS);
  }

  private sendLocal() {
    const d = this.pc.localDescription;
    if (!d) return;
    this.opts.send({ description: d.toJSON ? d.toJSON() : d });
    this.watchGathering();
  }

  async makeOffer(): Promise<void> {
    if (this.closed) return;
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.sendLocal();
    } catch (err) {
      // An offer can fail when a remote offer raced in; perfect negotiation
      // resolves that through the incoming side.
      console.warn('[call] could not make an offer', err);
    } finally {
      this.makingOffer = false;
    }
  }

  /** An offer, answer or candidate from the other person. */
  async receive({ description, candidate }: SignalOut): Promise<void> {
    if (this.closed) return;
    try {
      if (description) {
        const readyForOffer = !this.makingOffer
          && (this.pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
        const offerCollision = description.type === 'offer' && !readyForOffer;
        this.ignoreOffer = !this.opts.polite && offerCollision;
        if (this.ignoreOffer) return;

        this.isSettingRemoteAnswerPending = description.type === 'answer';
        if (description.type === 'offer') this.lastRemoteOfferAt = this.timer.now();
        await this.pc.setRemoteDescription(description); // implicit rollback on collision (polite side)
        this.isSettingRemoteAnswerPending = false;
        this.negotiated = true;
        if (this.firstOfferTimer) { this.timer.clear(this.firstOfferTimer); this.firstOfferTimer = null; }
        await this.drainCandidates();
        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          this.sendLocal();
        }
      } else if (candidate !== undefined) {
        if (!this.pc.remoteDescription) {
          if (candidate) this.pendingCandidates.push(candidate);
          return;
        }
        await this.addCandidate(candidate);
      }
    } catch (err) {
      if (!this.ignoreOffer) console.warn('[call] could not apply a signal', err);
    }
  }

  private async addCandidate(candidate: RTCIceCandidateInit | null) {
    try {
      await this.pc.addIceCandidate(candidate === null ? undefined : candidate);
    } catch (err) {
      // Candidates for an offer we ignored are expected to fail.
      if (!this.ignoreOffer) console.warn('[call] could not add a candidate', err);
    }
  }

  private async drainCandidates() {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) await this.addCandidate(c);
  }

  private onIceState() {
    if (this.closed) return;
    const state = this.pc.iceConnectionState;
    this.opts.onIceState?.(state);
    const { set, clear } = this.timer;
    if (state === 'connected' || state === 'completed') {
      if (this.disconnectedTimer) { clear(this.disconnectedTimer); this.disconnectedTimer = null; }
      this.restarts = 0;
      return;
    }
    if (state === 'failed') {
      if (this.disconnectedTimer) { clear(this.disconnectedTimer); this.disconnectedTimer = null; }
      this.repair();
    } else if (state === 'disconnected' && !this.disconnectedTimer) {
      this.disconnectedTimer = set(() => {
        this.disconnectedTimer = null;
        if (this.pc.iceConnectionState === 'disconnected') this.repair();
      }, DISCONNECTED_RESTART_MS);
    }
  }

  /**
   * Restart ICE, spaced out; after two failures, relay only. The polite side
   * first gives the other side a moment to do it (their restart offer then
   * repairs both, without crossing offers).
   */
  repair(): void {
    if (this.closed) return;
    const { set, now } = this.timer;
    if (this.opts.polite && this.negotiated) {
      if (this.politeRepairTimer) return;
      const askedAt = now();
      this.politeRepairTimer = set(() => {
        this.politeRepairTimer = null;
        if (this.closed) return;
        const ice = this.pc.iceConnectionState;
        if (ice === 'connected' || ice === 'completed') return;
        if (this.lastRemoteOfferAt > askedAt) return; // they restarted
        this.doRepair();
      }, POLITE_REPAIR_DELAY_MS);
      return;
    }
    this.doRepair();
  }

  private doRepair(): void {
    if (this.closed) return;
    const { set, now } = this.timer;
    const wait = RESTART_BACKOFF_MS[Math.min(this.restarts, RESTART_BACKOFF_MS.length - 1)];
    const due = this.lastRestartAt + wait - now();
    if (due > 0) {
      set(() => this.doRepair(), due);
      return;
    }
    this.restarts += 1;
    this.lastRestartAt = now();
    if (this.restarts > 2 && !this.relayOnly) {
      this.relayOnly = true;
      try {
        const config = this.pc.getConfiguration();
        this.pc.setConfiguration({ ...config, iceTransportPolicy: 'relay' });
        this.opts.onRepair?.('relay');
      } catch (err) {
        console.warn('[call] relay-only not supported here', err);
      }
    } else if (this.restarts > RESTART_BACKOFF_MS.length + 1) {
      this.opts.onRepair?.('gave-up');
      return;
    } else {
      this.opts.onRepair?.('restart');
    }
    // The impolite side drives the restart offer; the polite side asks for
    // one too — perfect negotiation sorts out a collision.
    this.pc.restartIce();
  }

  /** New relay credentials mid-call (they expire). */
  updateIceServers(iceServers: RTCIceServer[]): void {
    try {
      const config = this.pc.getConfiguration();
      this.pc.setConfiguration({ ...config, iceServers });
    } catch (err) {
      console.warn('[call] could not update ICE servers', err);
    }
  }

  close(): void {
    this.closed = true;
    const { clear } = this.timer;
    for (const t of [this.disconnectedTimer, this.firstOfferTimer, this.politeRepairTimer, this.gatherTimer]) if (t) clear(t);
    this.pc.onnegotiationneeded = null;
    this.pc.onicecandidate = null;
    this.pc.oniceconnectionstatechange = null;
    try { this.pc.close(); } catch { /* already closed */ }
  }
}
