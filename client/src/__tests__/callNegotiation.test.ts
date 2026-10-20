import { describe, it, expect, vi } from 'vitest';
import { Negotiator, DISCONNECTED_RESTART_MS, POLITE_FIRST_OFFER_MS, POLITE_REPAIR_DELAY_MS, GATHER_STALL_MS, type SignalOut } from '../call/negotiation';

/**
 * A fake RTCPeerConnection with the signalling state machine browsers follow
 * (JSEP): offers/answers, implicit rollback on an incoming offer while one of
 * ours is pending, candidates refused until there is a remote description.
 */
let seq = 0;
class FakePC {
  signalingState: RTCSignalingState = 'stable';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  candidates: (RTCIceCandidateInit | undefined)[] = [];
  config: RTCConfiguration = { iceServers: [] };
  restarts = 0;
  closed = false;
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((e: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  readonly name: string;
  constructor(name: string) { this.name = name; }

  async setLocalDescription() {
    await Promise.resolve();
    if (this.signalingState === 'have-remote-offer') {
      this.localDescription = { type: 'answer', sdp: `${this.name}-answer-${++seq}` };
      this.signalingState = 'stable';
    } else {
      this.localDescription = { type: 'offer', sdp: `${this.name}-offer-${++seq}` };
      this.signalingState = 'have-local-offer';
    }
  }

  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    await Promise.resolve();
    if (d.type === 'offer') {
      if (this.signalingState === 'have-local-offer') this.localDescription = null; // implicit rollback
      this.remoteDescription = d;
      this.signalingState = 'have-remote-offer';
    } else {
      if (this.signalingState !== 'have-local-offer') throw Object.assign(new Error('wrong state'), { name: 'InvalidStateError' });
      this.remoteDescription = d;
      this.signalingState = 'stable';
    }
  }

  async addIceCandidate(c?: RTCIceCandidateInit) {
    if (!this.remoteDescription) throw new Error('no remote description');
    this.candidates.push(c);
  }

  restartIce() { this.restarts += 1; }
  getConfiguration() { return this.config; }
  setConfiguration(c: RTCConfiguration) { this.config = c; }
  close() { this.closed = true; }

  setIce(state: RTCIceConnectionState) {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }
}

const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };

/** Two negotiators wired to each other through an async "server". */
function pair() {
  const a = new FakePC('doctor');
  const b = new FakePC('patient');
  const toB: SignalOut[] = [];
  const toA: SignalOut[] = [];
  const doctor = new Negotiator(a as unknown as RTCPeerConnection, { polite: false, send: (s) => toB.push(s) });
  const patient = new Negotiator(b as unknown as RTCPeerConnection, { polite: true, send: (s) => toA.push(s) });
  async function deliver() {
    for (let round = 0; round < 10 && (toA.length || toB.length); round++) {
      const forB = toB.splice(0);
      const forA = toA.splice(0);
      await Promise.all([...forB.map((s) => patient.receive(s)), ...forA.map((s) => doctor.receive(s))]);
      await flush();
    }
  }
  return { a, b, doctor, patient, deliver };
}

describe('perfect negotiation', () => {
  it('a plain offer/answer ends stable on both sides', async () => {
    const { a, b, doctor, deliver } = pair();
    await doctor.makeOffer();
    const offer = a.localDescription?.sdp;
    await deliver();
    expect(a.signalingState).toBe('stable');
    expect(b.signalingState).toBe('stable');
    expect(b.remoteDescription?.sdp).toBe(offer);
    expect(a.remoteDescription?.type).toBe('answer');
  });

  it('when both offer at once, the doctor (impolite) wins and both end stable', async () => {
    const { a, b, doctor, patient, deliver } = pair();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await Promise.all([doctor.makeOffer(), patient.makeOffer()]);
    expect(a.signalingState).toBe('have-local-offer');
    expect(b.signalingState).toBe('have-local-offer');
    const doctorOffer = a.localDescription?.sdp;
    await deliver();
    expect(a.signalingState).toBe('stable');
    expect(b.signalingState).toBe('stable');
    // The patient rolled back and answered the doctor's offer.
    expect(b.remoteDescription?.sdp).toBe(doctorOffer);
    expect(a.remoteDescription?.type).toBe('answer');
    warn.mockRestore();
  });

  it('either side can start: the patient offering alone works too', async () => {
    const { a, b, patient, deliver } = pair();
    await patient.makeOffer();
    await deliver();
    expect(a.signalingState).toBe('stable');
    expect(b.signalingState).toBe('stable');
    expect(a.remoteDescription?.type).toBe('offer');
  });

  it('candidates that arrive before the offer are kept and applied after it', async () => {
    const { b, patient } = pair();
    await patient.receive({ candidate: { candidate: 'c1', sdpMid: '0' } });
    await patient.receive({ candidate: { candidate: 'c2', sdpMid: '0' } });
    expect(b.candidates).toHaveLength(0);
    await patient.receive({ description: { type: 'offer', sdp: 'doctor-offer-x' } });
    expect(b.candidates.map((c) => c?.candidate)).toEqual(['c1', 'c2']);
    // An end-of-candidates marker before the offer is not queued.
    await patient.receive({ candidate: null });
    expect(b.candidates).toHaveLength(3);
  });

  it('local candidates are sent, end-of-candidates as null', () => {
    const sent: SignalOut[] = [];
    const pc = new FakePC('x');
    new Negotiator(pc as unknown as RTCPeerConnection, { polite: true, send: (s) => sent.push(s) });
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'host' }) } });
    pc.onicecandidate?.({ candidate: null });
    expect(sent).toEqual([{ candidate: { candidate: 'host' } }, { candidate: null }]);
  });

  it('a stale answer (wrong state) is ignored without throwing', async () => {
    const { patient } = pair();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(patient.receive({ description: { type: 'answer', sdp: 'old' } })).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe('repairing the connection', () => {
  function clocked(polite = false) {
    let now = 1_000_000;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const pc = new FakePC('x');
    const repairs: string[] = [];
    const sent: SignalOut[] = [];
    const n = new Negotiator(pc as unknown as RTCPeerConnection, {
      polite,
      send: (x) => sent.push(x),
      onRepair: (w) => repairs.push(w),
      now: () => now,
      setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; },
      clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    });
    const advance = (ms: number) => {
      now += ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= now).sort((x, y) => x.at - y.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        due.fn();
      }
    };
    return { pc, n, repairs, advance, timers, sent };
  }

  it('ICE failed ⇒ restartIce at once', () => {
    const { pc, repairs } = clocked();
    pc.setIce('failed');
    expect(pc.restarts).toBe(1);
    expect(repairs).toEqual(['restart']);
  });

  it('a short "disconnected" that recovers does not restart', () => {
    const { pc, advance } = clocked();
    pc.setIce('connected');
    pc.setIce('disconnected');
    advance(DISCONNECTED_RESTART_MS - 1000);
    pc.setIce('connected');
    advance(10_000);
    expect(pc.restarts).toBe(0);
  });

  it(`"disconnected" for ${DISCONNECTED_RESTART_MS / 1000} s ⇒ restart`, () => {
    const { pc, advance } = clocked();
    pc.setIce('connected');
    pc.setIce('disconnected');
    advance(DISCONNECTED_RESTART_MS);
    expect(pc.restarts).toBe(1);
  });

  it('restarts are spaced out, and the third goes relay-only', () => {
    const { pc, n, repairs, advance } = clocked();
    pc.setIce('failed');
    expect(pc.restarts).toBe(1);
    n.repair(); // too soon: waits 5 s
    expect(pc.restarts).toBe(1);
    advance(5000);
    expect(pc.restarts).toBe(2);
    n.repair();
    advance(10_000);
    expect(pc.restarts).toBe(3);
    expect(n.relayOnly).toBe(true);
    expect(pc.config.iceTransportPolicy).toBe('relay');
    expect(repairs).toEqual(['restart', 'restart', 'relay']);
  });

  it('connecting again resets the restart count', () => {
    const { pc, n, advance } = clocked();
    pc.setIce('failed');
    advance(5000);
    n.repair();
    advance(5000);
    expect(pc.restarts).toBe(2);
    pc.setIce('connected');
    advance(60_000);
    pc.setIce('failed');
    advance(60_000);
    expect(n.relayOnly).toBe(false);
  });

  it('new relay credentials keep the rest of the configuration', () => {
    const { pc, n } = clocked();
    pc.config = { iceServers: [], iceTransportPolicy: 'relay' };
    n.updateIceServers([{ urls: 'turn:x', username: 'u', credential: 'p' }]);
    expect(pc.config).toEqual({ iceServers: [{ urls: 'turn:x', username: 'u', credential: 'p' }], iceTransportPolicy: 'relay' });
  });

  it('after close nothing happens and the pc is closed', async () => {
    const { pc, n, advance } = clocked();
    pc.setIce('disconnected');
    n.close();
    advance(60_000);
    expect(pc.closed).toBe(true);
    expect(pc.restarts).toBe(0);
    await n.receive({ description: { type: 'offer', sdp: 'x' } });
    expect(pc.remoteDescription).toBeNull();
  });
});

describe('avoiding crossing offers (Chrome stops gathering after a rolled-back offer)', () => {
  function clocked(polite: boolean) {
    let now = 1_000_000;
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let nextId = 1;
    const pc = new FakePC(polite ? 'patient' : 'doctor');
    const repairs: string[] = [];
    const sent: SignalOut[] = [];
    const n = new Negotiator(pc as unknown as RTCPeerConnection, {
      polite,
      send: (x) => sent.push(x),
      onRepair: (w) => repairs.push(w),
      now: () => now,
      setTimer: (fn, ms) => { const id = nextId++; timers.push({ at: now + ms, fn, id }); return id; },
      clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    });
    const advance = async (ms: number) => {
      now += ms;
      for (;;) {
        const due = timers.filter((t) => t.at <= now).sort((x, y) => x.at - y.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        due.fn();
      }
      await flush();
    };
    return { pc, n, repairs, sent, advance };
  }

  it('the impolite side (doctor) offers at once', async () => {
    const { pc, sent } = clocked(false);
    pc.onnegotiationneeded?.();
    await flush();
    expect(sent.some((x) => x.description?.type === 'offer')).toBe(true);
  });

  it('the polite side (patient) waits for the first offer instead of making one', async () => {
    const { pc, n, sent, advance } = clocked(true);
    pc.onnegotiationneeded?.();
    await advance(POLITE_FIRST_OFFER_MS - 100);
    expect(sent.filter((x) => x.description)).toHaveLength(0);
    await n.receive({ description: { type: 'offer', sdp: 'doctor-offer' } });
    await advance(POLITE_FIRST_OFFER_MS * 2);
    // It answered, and never offered.
    expect(sent.filter((x) => x.description).map((x) => x.description!.type)).toEqual(['answer']);
  });

  it("…but offers itself if the other side's offer never comes", async () => {
    const { pc, sent, advance } = clocked(true);
    pc.onnegotiationneeded?.();
    await advance(POLITE_FIRST_OFFER_MS);
    expect(sent.filter((x) => x.description).map((x) => x.description!.type)).toEqual(['offer']);
  });

  it('after the first exchange the polite side renegotiates normally', async () => {
    const { pc, n, sent } = clocked(true);
    await n.receive({ description: { type: 'offer', sdp: 'doctor-offer' } });
    pc.onnegotiationneeded?.();
    await flush();
    expect(sent.filter((x) => x.description).map((x) => x.description!.type)).toEqual(['answer', 'offer']);
  });

  it("the polite side's repair leaves it to the other side when they restart", async () => {
    const { pc, n, advance } = clocked(true);
    await n.receive({ description: { type: 'offer', sdp: 'doctor-offer' } });
    pc.setIce('failed');
    expect(pc.restarts).toBe(0);
    await advance(POLITE_REPAIR_DELAY_MS - 500);
    await n.receive({ description: { type: 'offer', sdp: 'doctor-restart-offer' } }); // their ICE restart
    await advance(1000);
    expect(pc.restarts).toBe(0);
  });

  it('…and restarts itself if they do not', async () => {
    const { pc, n, repairs, advance } = clocked(true);
    await n.receive({ description: { type: 'offer', sdp: 'doctor-offer' } });
    pc.setIce('failed');
    await advance(POLITE_REPAIR_DELAY_MS);
    expect(pc.restarts).toBe(1);
    expect(repairs).toContain('restart');
  });

  it('a local description that never gathers a candidate is reported as stuck', async () => {
    const { pc, n, repairs, advance } = clocked(false);
    await n.makeOffer();
    pc.iceGatheringState = 'gathering';
    await advance(GATHER_STALL_MS);
    expect(repairs).toEqual(['stuck']);
  });

  it('gathering that produces candidates is not stuck', async () => {
    const { pc, n, repairs, advance } = clocked(false);
    await n.makeOffer();
    pc.iceGatheringState = 'gathering';
    pc.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'host' }) } });
    await advance(GATHER_STALL_MS * 2);
    expect(repairs).toEqual([]);
  });
});
