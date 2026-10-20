/* eslint-disable @typescript-eslint/no-explicit-any -- socket payloads come from our own server and are read field by field */
/**
 * The call, in the browser (engine v2). Talks to the server's `call:*`
 * signalling (server/services/call/callService.js), owns the camera/mic, the
 * one RTCPeerConnection per pairing (negotiation.ts), quality (stats.ts) and
 * the call statistics. React reads it through useCall (getSnapshot/subscribe).
 *
 * The rules that make it reliable:
 *  - The connection lives for the whole call. A socket drop does NOT touch
 *    it — the media keeps flowing browser to browser; on reconnect we simply
 *    re-join (same page instance ⇒ same pairing) and repair ICE if needed.
 *    Signals produced while the socket is away are held and sent after.
 *  - "Connected" means media is actually arriving, not that a track object
 *    exists.
 *  - Each pairing of the two pages has an epoch; anything from an older one
 *    is ignored; a new pairing (the other person refreshed) builds a fresh
 *    connection.
 *  - Taking too long is shown ("stalled") with a Rejoin; the engine itself
 *    rebuilds the pairing once when ICE repair gives up.
 *  - Every failure ends in a state the screen can explain, with a way out.
 */

import { io, type Socket } from 'socket.io-client';
import { Negotiator, type SignalOut } from './negotiation';
import { acquireMedia, stopStream, type MediaErrorKind } from './media';
import { sampleStats, QualityLadder, applyQuality, type CallStats, type QualityLevel } from './stats';
import { describeClient } from './browser';

export const CALL_PROTOCOL = 2;
/** Media down this long ⇒ "still trying" with a Rejoin button (it keeps trying). */
export const STALLED_AFTER_MS = 20_000;
/** First connection taking this long ⇒ an extra ICE restart. */
export const CONNECT_REPAIR_MS = 15_000;
const STATS_EVERY_MS = 2000;
const TELEMETRY_EVERY_MS = 60_000;
const JOIN_RETRIES = 3;
const OUT_QUEUE_MAX = 200;

export type CallPhase =
  | 'idle' | 'preparing' | 'prejoin' | 'joining' | 'waiting' | 'connecting'
  | 'connected' | 'reconnecting' | 'failed' | 'ended';

export interface PeerInfo {
  present: boolean;
  connection: 'connected' | 'reconnecting' | 'absent';
  role?: 'patient' | 'doctor';
  media: { audio: boolean; video: boolean };
}

export interface CallSnapshot {
  phase: CallPhase;
  failure: { code: string; message: string } | null;
  mediaError: MediaErrorKind | null;
  local: MediaStream | null;
  localAudio: boolean;
  localVideo: boolean;
  remote: MediaStream | null;
  peer: PeerInfo;
  signalling: 'online' | 'offline';
  serverRestarting: boolean;
  superseded: boolean;
  /** Connecting/reconnecting is taking longer than it should. */
  stalled: boolean;
  relayAvailable: boolean | null;
  quality: QualityLevel;
  stats: CallStats | null;
  endsAt: Date | null;
  serverOffsetMs: number;
  pendingAccept: boolean;
  role: 'patient' | 'doctor' | null;
  reconnects: number;
}

export interface CallEngineOptions {
  sessionId: string;
  voice: boolean;
  socketUrl: string;
  apiBase: string;
  /** Read on every (re)connect: the in-memory token may be refreshed. */
  getToken?: () => string | null | undefined;
  fetchImpl?: typeof fetch;
  /** Tests: a socket factory instead of socket.io-client. */
  socketFactory?: (url: string, opts: Record<string, unknown>) => Socket;
}

type Listener = () => void;
type RoomHandler = (payload: any) => void;

/** Events from the room the page handles itself (rules, ending, tools). */
const ROOM_EVENTS = ['session-time-up', 'session-ended', 'request-end-session', 'confirm-end-session', 'end-session-error',
  'session:status-update', 'session:cancelled', 'call:prep-data', 'call:peer-outdated', 'error'];

function newInstanceId(): string {
  try { return crypto.randomUUID(); } catch { return `i-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

const NO_PEER: PeerInfo = { present: false, connection: 'absent', media: { audio: true, video: true } };

export class CallEngine {
  private readonly opts: CallEngineOptions;
  private snap: CallSnapshot;
  private listeners = new Set<Listener>();
  private roomHandlers = new Map<string, Set<RoomHandler>>();
  private socket: Socket | null = null;
  private negotiator: Negotiator | null = null;
  private epoch: number | null = null;
  private preSignals: { epoch: number; signal: SignalOut }[] = [];
  private outQueue: { epoch: number; signal: SignalOut }[] = [];
  private instanceId = newInstanceId();
  private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private iceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private connectRepairTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTotals: any = null;
  private ladder = new QualityLadder();
  private events: { type: string; at: string; data?: Record<string, unknown> }[] = [];
  private joinStartedAt = 0;
  /** When this pairing's connection was created (both people in). */
  private pairedAt = 0;
  private joined = false;
  private joining = false;
  private disposed = false;
  private autoRejoined = false;
  private heartbeatMs = 15_000;
  /** Signals sent / received, for the debug hook and call statistics. */
  private counts = { sentDesc: 0, sentCand: 0, recvDesc: 0, recvCand: 0, queued: 0 };
  private onPageHide = () => { void this.flushTelemetry(); };

  constructor(opts: CallEngineOptions) {
    this.opts = opts;
    this.snap = {
      phase: 'idle', failure: null, mediaError: null, local: null, localAudio: false, localVideo: false,
      remote: null, peer: NO_PEER, signalling: 'offline', serverRestarting: false, superseded: false, stalled: false,
      relayAvailable: null, quality: 0, stats: null, endsAt: null, serverOffsetMs: 0, pendingAccept: false, role: null, reconnects: 0,
    };
  }

  /* ───────────── React plumbing ───────────── */

  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  private set(patch: Partial<CallSnapshot>) {
    if (this.disposed && patch.phase !== 'ended') return;
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Room events the page still handles itself (end-by-agreement, time up…). */
  onRoomEvent(event: string, fn: RoomHandler): () => void {
    if (!this.roomHandlers.has(event)) this.roomHandlers.set(event, new Set());
    this.roomHandlers.get(event)!.add(fn);
    return () => { this.roomHandlers.get(event)?.delete(fn); };
  }
  private emitRoom(event: string, payload: any) {
    this.roomHandlers.get(event)?.forEach((fn) => { try { fn(payload); } catch (e) { console.warn('[call] room handler', e); } });
  }

  private note(type: string, data?: Record<string, unknown>) {
    if (this.events.length < 200) this.events.push({ type, at: new Date().toISOString(), data });
  }

  /** For tests and the debug hook. */
  get debug() {
    return { epoch: this.epoch, instanceId: this.instanceId, joined: this.joined, pc: this.negotiator?.pc ?? null, relayOnly: this.negotiator?.relayOnly ?? false, counts: { ...this.counts },
      /** What a failed connection triggers (tests). */
      repair: () => this.negotiator?.repair() };
  }

  /* ───────────── media ───────────── */

  /** Ask for camera/mic (never the camera for voice). Never throws. */
  async prepare({ wantVideo = true }: { wantVideo?: boolean } = {}): Promise<void> {
    if (this.disposed) return;
    const inCall = this.joined || this.joining;
    if (!inCall) this.set({ phase: 'preparing' });
    const previous = this.snap.local;
    const result = await acquireMedia({ voice: this.opts.voice, wantVideo });
    if (this.disposed) { stopStream(result.stream); return; }
    // A problem only if something asked for is missing; a step down the
    // ladder that still got camera and mic (Safari refusing 540p) is not.
    const wantedVideo = !this.opts.voice && wantVideo;
    if (result.error && (!result.hasAudio || (wantedVideo && !result.hasVideo))) this.note('media-error', { detail: result.error });
    else if (result.error) this.note('media-fallback', { detail: result.error });
    // Mid-call retry with nothing better: keep what we had.
    if (inCall && !result.stream && previous) { this.set({ mediaError: result.error }); return; }
    if (previous && previous !== result.stream) stopStream(previous);
    this.set({
      phase: inCall ? this.snap.phase : 'prejoin',
      local: result.stream,
      localAudio: result.hasAudio,
      localVideo: result.hasVideo,
      mediaError: result.error,
    });
    if (this.negotiator && result.stream) this.attachLocalTracks(this.negotiator.pc, result.stream);
    this.sendMediaState();
  }

  setMic(on: boolean) {
    this.snap.local?.getAudioTracks().forEach((t) => { t.enabled = on; });
    this.set({ localAudio: on && !!this.snap.local?.getAudioTracks().length });
    this.sendMediaState();
  }

  setCamera(on: boolean) {
    this.snap.local?.getVideoTracks().forEach((t) => { t.enabled = on; });
    this.set({ localVideo: on && !!this.snap.local?.getVideoTracks().length });
    this.sendMediaState();
  }

  private sendMediaState() {
    if (!this.socket?.connected || !this.joined) return;
    this.socket.emit('call:media-state', { sessionId: this.opts.sessionId, audio: this.snap.localAudio, video: this.snap.localVideo });
  }

  /** The patient's optional check-in, shown to the therapist. */
  sendPrepData(tags: string[]) {
    if (!this.socket?.connected || !this.joined) return;
    this.socket.emit('call:prep-data', { sessionId: this.opts.sessionId, tags: tags.slice(0, 20) });
  }

  /* ───────────── joining ───────────── */

  async join(): Promise<void> {
    if (this.disposed || this.socket) return;
    this.joinStartedAt = Date.now();
    this.set({ phase: 'joining', failure: null });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.onPageHide);
    await this.fetchIceServers();
    if (this.disposed) return;
    this.connectSocket();
  }

  private async fetchIceServers() {
    try {
      const f = this.opts.fetchImpl || fetch;
      const res = await f(`${this.opts.apiBase}/sessions/${this.opts.sessionId}/ice-servers`, { credentials: 'include' });
      if (!res.ok) {
        if (this.snap.relayAvailable === null) this.set({ relayAvailable: false });
        return;
      }
      const body = await res.json();
      if (Array.isArray(body.iceServers) && body.iceServers.length) this.iceServers = body.iceServers;
      this.set({ relayAvailable: !!body.relayAvailable });
      if (this.negotiator) this.negotiator.updateIceServers(this.iceServers);
      // Relay logins expire: refresh at 80% of their life.
      if (this.iceRefreshTimer) clearTimeout(this.iceRefreshTimer);
      const ttl = Math.max(60, Number(body.ttlSeconds) || 3600);
      if (!this.disposed) this.iceRefreshTimer = setTimeout(() => { void this.fetchIceServers(); }, ttl * 800);
    } catch (err) {
      console.warn('[call] could not get relay servers', err);
    }
  }

  private connectSocket() {
    const options = {
      auth: (cb: (data: object) => void) => {
        const token = this.opts.getToken?.();
        cb({ ...(token ? { token } : {}), callProtocol: CALL_PROTOCOL });
      },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      // Its own connection, not the /data socket's Manager.
      forceNew: true,
    };
    const socket = this.opts.socketFactory ? this.opts.socketFactory(this.opts.socketUrl, options) : io(this.opts.socketUrl, options);
    this.socket = socket;

    socket.on('connect', () => {
      this.set({ signalling: 'online', serverRestarting: false });
      void this.sendJoin();
    });
    socket.on('disconnect', (reason) => {
      this.joined = false;
      this.set({ signalling: 'offline' });
      if (this.disposed || this.snap.superseded || reason === 'io client disconnect') return;
      this.note('signalling-lost', { reason });
      // The server closed it (restart): socket.io won't retry that by itself.
      if (reason === 'io server disconnect') {
        setTimeout(() => { if (!socket.connected && this.socket === socket && !this.disposed) socket.connect(); }, 1000 + Math.random() * 2000);
      }
    });
    socket.on('connect_error', (err: any) => {
      this.set({ signalling: 'offline' });
      const msg = String(err?.message || '');
      if (/Authentication|No token/i.test(msg)) {
        this.fail('AUTH', 'Your sign-in has expired. Please sign in again.');
        return;
      }
      // Turned away by the server's middleware (busy, restarting): socket.io
      // won't retry that by itself.
      if (err?.data?.retryable && !this.disposed) {
        setTimeout(() => { if (!socket.connected && this.socket === socket && !this.disposed) socket.connect(); }, 1500 + Math.random() * 1500);
      }
    });

    socket.on('call:peer', (m: any) => this.onPeer(m));
    socket.on('call:peer-left', () => this.onPeerLeft());
    socket.on('call:signal', (m: any) => this.onSignal(m));
    socket.on('call:media', (m: any) => this.set({ peer: { ...this.snap.peer, media: { audio: !!m.audio, video: !!m.video } } }));
    socket.on('call:superseded', () => this.onSuperseded());
    socket.on('call:server-restarting', () => { this.set({ serverRestarting: true }); this.note('server-restart'); });
    socket.on('call:please-refresh', () => this.fail('PROTOCOL_OUTDATED', 'Veraawell has been updated. Please refresh this page.'));
    socket.on('timer-sync', (m: any) => {
      if (m?.endsAt && m?.serverNow) {
        const endsAt = new Date(m.endsAt);
        this.set({
          endsAt: this.snap.endsAt && this.snap.endsAt.getTime() === endsAt.getTime() ? this.snap.endsAt : endsAt,
          serverOffsetMs: new Date(m.serverNow).getTime() - Date.now(),
          pendingAccept: false,
        });
      }
    });
    for (const ev of ROOM_EVENTS) {
      socket.on(ev, (payload: any) => {
        if (ev === 'session-ended') this.closePeer();
        this.emitRoom(ev, payload);
      });
    }
  }

  private async sendJoin(attempt = 0): Promise<void> {
    const socket = this.socket;
    if (!socket || this.disposed || !socket.connected) return;
    this.joining = true;
    this.note('join-attempt');
    let ack: any;
    try {
      const client = describeClient(typeof navigator !== 'undefined' ? navigator.userAgent : '');
      ack = await socket.timeout(10_000).emitWithAck('call:join', {
        sessionId: this.opts.sessionId, protocol: CALL_PROTOCOL, instanceId: this.instanceId,
        client: { browser: client.browser, os: client.os, appVersion: (import.meta as any).env?.VITE_APP_VERSION || 'web' },
      });
    } catch {
      this.joining = false;
      if (attempt < JOIN_RETRIES && socket.connected && this.socket === socket) return this.sendJoin(attempt + 1);
      return; // the next connect will try again
    }
    this.joining = false;
    if (this.socket !== socket || this.disposed) return;
    if (!ack?.ok) {
      if (ack?.retryable && attempt < JOIN_RETRIES) {
        setTimeout(() => { if (this.socket === socket) void this.sendJoin(attempt + 1); }, 2000 * (attempt + 1));
        return;
      }
      if (ack?.retryable) {
        // e.g. not open yet: keep the screen, try again later.
        this.set({ failure: { code: ack.code, message: ack.message } });
        setTimeout(() => { if (this.socket === socket && !this.joined) void this.sendJoin(0); }, 15_000);
        return;
      }
      this.fail(ack?.code || 'JOIN_FAILED', ack?.message || 'Could not join the call.');
      return;
    }
    this.joined = true;
    this.heartbeatMs = ack.heartbeatMs || this.heartbeatMs;
    this.set({
      role: ack.self.role,
      failure: null,
      endsAt: ack.endsAt ? new Date(ack.endsAt) : this.snap.endsAt,
      serverOffsetMs: ack.serverNow ? new Date(ack.serverNow).getTime() - Date.now() : this.snap.serverOffsetMs,
      pendingAccept: !!ack.pendingAccept,
      peer: this.peerFrom(ack.peer),
    });
    this.sendMediaState();
    this.startLoops();

    const sameEpoch = this.epoch === ack.epoch;
    if (!sameEpoch) {
      this.epoch = ack.epoch;
      this.closePeer();
    }
    if (ack.peer?.present) {
      if (!this.negotiator) this.ensurePeer();
      else {
        this.flushOutQueue();
        const ice = this.negotiator.pc.iceConnectionState;
        if (ice !== 'connected' && ice !== 'completed') this.negotiator.repair();
      }
    } else {
      this.closePeer();
      this.set({ phase: 'waiting', remote: null, stalled: false });
    }
  }

  private peerFrom(p: any): PeerInfo {
    if (!p || !p.present) return NO_PEER;
    return { present: true, connection: p.connection || 'connected', role: p.role, media: p.media || { audio: true, video: true } };
  }

  /* ───────────── the other person ───────────── */

  private onPeer(m: any) {
    const peer = this.peerFrom(m);
    this.set({ peer });
    if (m.connection === 'reconnecting') return; // keep the connection; they're coming back
    if (typeof m.epoch === 'number' && m.epoch !== this.epoch) {
      this.epoch = m.epoch;
      this.closePeer();
    }
    if (peer.present && !this.negotiator && this.joined) this.ensurePeer();
  }

  private onPeerLeft() {
    this.closePeer();
    this.note('peer-left');
    this.set({ peer: NO_PEER, remote: null, phase: 'waiting', stalled: false });
  }

  private onSignal(m: any) {
    if (typeof m.epoch !== 'number' || this.epoch === null) return;
    if (m.epoch < this.epoch) return; // an older pairing
    if (m.epoch > this.epoch) { this.epoch = m.epoch; this.closePeer(); }
    const signal: SignalOut = m.description !== undefined ? { description: m.description } : { candidate: m.candidate };
    if (signal.description) this.counts.recvDesc += 1; else this.counts.recvCand += 1;
    if (!this.negotiator) {
      if (this.preSignals.length < 100) this.preSignals.push({ epoch: m.epoch, signal });
      if (this.joined) this.ensurePeer();
      return;
    }
    void this.negotiator.receive(signal);
  }

  private onSuperseded() {
    this.note('superseded');
    this.closePeer();
    this.stopLoops();
    // The other tab needs the camera (phones allow one user of it).
    stopStream(this.snap.local);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined = false;
    this.set({
      superseded: true, phase: 'ended', local: null, localAudio: false, localVideo: false, remote: null,
      failure: { code: 'SUPERSEDED', message: 'This call is now open in another tab or device.' },
    });
  }

  /* ───────────── the peer connection ───────────── */

  private ensurePeer() {
    if (this.negotiator || this.epoch === null || !this.snap.role || this.disposed) return;
    const epoch = this.epoch;
    this.pairedAt = Date.now();
    // Tests (dev builds only) can force the relay to prove it works end to end.
    const forceRelay = (import.meta.env.DEV || import.meta.env.VITE_E2E) && typeof window !== 'undefined' && !!(window as any).__vwForceRelay;
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, ...(forceRelay ? { iceTransportPolicy: 'relay' as const } : {}) });
    const remote = new MediaStream();
    pc.ontrack = ({ track }) => {
      if (this.negotiator?.pc !== pc) return;
      remote.getTracks().filter((t) => t.kind === track.kind).forEach((t) => remote.removeTrack(t));
      remote.addTrack(track);
      this.set({ remote: new MediaStream(remote.getTracks()) });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && this.negotiator?.pc === pc) this.negotiator.repair();
    };
    this.negotiator = new Negotiator(pc, {
      polite: this.snap.role === 'patient',
      send: (signal) => this.sendSignal(epoch, signal),
      onIceState: (state) => this.onIceState(state),
      onRepair: (what) => {
        this.note(what === 'relay' ? 'relay-escalation' : what === 'gave-up' ? 'ice-gave-up' : what === 'stuck' ? 'ice-stuck' : 'ice-restart');
        if (what === 'gave-up') this.onGaveUp();
        if (what === 'stuck') this.onStuck();
      },
    });
    if (this.snap.local) this.attachLocalTracks(pc, this.snap.local);
    // Even with no camera/mic, ask to receive the other person.
    if (!pc.getTransceivers().some((t) => t.receiver.track?.kind === 'audio')) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (!this.opts.voice && !pc.getTransceivers().some((t) => t.receiver.track?.kind === 'video')) pc.addTransceiver('video', { direction: 'recvonly' });
    this.set({ remote: null, phase: this.snap.phase === 'ended' || this.snap.phase === 'failed' ? this.snap.phase : 'connecting', stalled: false });
    this.armConnectWatch();
    // Signals that arrived before this connection existed.
    const queued = this.preSignals.filter((x) => x.epoch === epoch);
    this.preSignals = [];
    for (const q of queued) void this.negotiator.receive(q.signal);
    this.flushOutQueue();
  }

  private attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream) {
    for (const track of stream.getTracks()) {
      if (this.opts.voice && track.kind === 'video') continue;
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) { if (sender.track !== track) void sender.replaceTrack(track); continue; }
      // A receive-only transceiver of the same kind (no camera earlier): send on it.
      const idle = pc.getTransceivers().find((t) => !t.sender.track && t.receiver.track?.kind === track.kind && t.direction !== 'stopped');
      if (idle) {
        idle.direction = 'sendrecv';
        void idle.sender.replaceTrack(track);
        try { idle.sender.setStreams?.(stream); } catch { /* optional */ }
      } else {
        pc.addTrack(track, stream);
      }
    }
    // Voice first: Opus at the front where the browser lets us choose.
    try {
      const caps = (RTCRtpReceiver as any).getCapabilities?.('audio');
      if (caps?.codecs) {
        const opus = caps.codecs.filter((c: any) => /opus/i.test(c.mimeType));
        const rest = caps.codecs.filter((c: any) => !/opus/i.test(c.mimeType));
        pc.getTransceivers().filter((t) => t.sender.track?.kind === 'audio').forEach((t) => (t as any).setCodecPreferences?.([...opus, ...rest]));
      }
    } catch { /* not supported here */ }
  }

  private sendSignal(epoch: number, signal: SignalOut) {
    const socket = this.socket;
    if (!socket?.connected || !this.joined || this.epoch !== epoch) {
      // Held for when we're back (dropped if the pairing changes meanwhile).
      if (this.outQueue.length < OUT_QUEUE_MAX) this.outQueue.push({ epoch, signal });
      this.counts.queued += 1;
      return;
    }
    if (signal.description) this.counts.sentDesc += 1; else this.counts.sentCand += 1;
    socket.timeout(10_000).emitWithAck('call:signal', { sessionId: this.opts.sessionId, epoch, ...signal })
      .then((ack: any) => {
        if (ack && ack.ok === false && ack.code !== 'STALE_EPOCH') console.warn('[call] signal refused', ack.code, ack.message);
        if (ack?.code === 'STALE_EPOCH' && typeof ack.epoch === 'number' && ack.epoch !== this.epoch) {
          this.epoch = ack.epoch;
          this.closePeer();
          if (this.snap.peer.present) this.ensurePeer();
        }
      })
      .catch(() => { /* timed out: ICE repair covers it */ });
  }

  private flushOutQueue() {
    const queued = this.outQueue;
    this.outQueue = [];
    for (const q of queued) if (q.epoch === this.epoch) this.sendSignal(q.epoch, q.signal);
  }

  private onIceState(state: RTCIceConnectionState) {
    if (state === 'connected' || state === 'completed') {
      this.clearStall();
      if (this.snap.phase === 'reconnecting') {
        this.note('reconnected');
        this.set({ phase: 'connected', reconnects: this.snap.reconnects + 1, stalled: false });
      }
      return;
    }
    if ((state === 'disconnected' || state === 'failed') && this.snap.phase === 'connected') {
      this.set({ phase: 'reconnecting' });
      this.note('reconnecting');
      if (!this.stallTimer) this.stallTimer = setTimeout(() => { this.stallTimer = null; this.set({ stalled: true }); }, STALLED_AFTER_MS);
    }
  }

  /** First connection: an extra restart if slow, and "stalled" after a while. */
  private armConnectWatch() {
    this.clearStall();
    this.connectRepairTimer = setTimeout(() => {
      this.connectRepairTimer = null;
      if (this.snap.phase === 'connecting') { this.note('slow-connect'); this.negotiator?.repair(); }
    }, CONNECT_REPAIR_MS);
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.snap.phase === 'connecting') this.set({ stalled: true });
    }, STALLED_AFTER_MS + CONNECT_REPAIR_MS);
  }

  private clearStall() {
    if (this.stallTimer) { clearTimeout(this.stallTimer); this.stallTimer = null; }
    if (this.connectRepairTimer) { clearTimeout(this.connectRepairTimer); this.connectRepairTimer = null; }
  }

  /**
   * The browser stopped gathering for this connection (a Chrome bug after a
   * rolled-back offer): only a new connection helps. Rebuild the pairing — at
   * most every 20 s, so a real "no network" doesn't loop.
   */
  private lastStuckRebuildAt = 0;
  private onStuck() {
    if (Date.now() - this.lastStuckRebuildAt < 20_000) return;
    this.lastStuckRebuildAt = Date.now();
    void this.rejoin();
  }

  /** ICE repair ran out: rebuild the pairing once by ourselves, then ask. */
  private onGaveUp() {
    if (!this.autoRejoined) {
      this.autoRejoined = true;
      void this.rejoin();
      return;
    }
    this.set({ stalled: true });
  }

  private closePeer() {
    this.negotiator?.close();
    this.negotiator = null;
    this.statsTotals = null;
    this.clearStall();
    this.outQueue = this.outQueue.filter((q) => q.epoch === this.epoch);
  }

  /* ───────────── loops: stats, quality, heartbeat, telemetry ───────────── */

  private startLoops() {
    if (!this.statsTimer) this.statsTimer = setInterval(() => { void this.tickStats(); }, STATS_EVERY_MS);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatMs);
    if (!this.telemetryTimer) this.telemetryTimer = setInterval(() => { void this.flushTelemetry(); }, TELEMETRY_EVERY_MS);
  }

  private stopLoops() {
    for (const t of [this.statsTimer, this.heartbeatTimer, this.telemetryTimer]) if (t) clearInterval(t);
    this.statsTimer = this.heartbeatTimer = this.telemetryTimer = null;
    for (const t of [this.iceRefreshTimer]) if (t) clearTimeout(t);
    this.iceRefreshTimer = null;
    this.clearStall();
  }

  private async tickStats() {
    const n = this.negotiator;
    if (!n) return;
    try {
      const { stats, totals } = await sampleStats(n.pc, this.statsTotals);
      if (this.negotiator !== n) return;
      this.statsTotals = totals;
      const patch: Partial<CallSnapshot> = { stats };
      const ice = n.pc.iceConnectionState;
      const mediaIn = stats.audioFlowing || stats.videoFlowing;
      if ((this.snap.phase === 'connecting' || this.snap.phase === 'reconnecting') && (ice === 'connected' || ice === 'completed') && mediaIn) {
        if (this.snap.phase === 'connecting') {
          // Measured from when both were in — not from Join, which counted
          // the time spent waiting for the other person.
          this.note('connected', { timeToConnectMs: Date.now() - (this.pairedAt || this.joinStartedAt), sinceJoinMs: Date.now() - this.joinStartedAt, candidateType: stats.candidateType });
          void this.flushTelemetry();
        }
        patch.phase = 'connected';
        patch.stalled = false;
        this.clearStall();
      }
      if (!this.opts.voice && this.snap.localVideo) {
        const before = this.ladder.level;
        const level = this.ladder.next(stats);
        if (level !== before) {
          this.note('quality', { level });
          const sender = n.pc.getSenders().find((s) => s.track?.kind === 'video');
          void applyQuality(sender, level);
        }
        patch.quality = level;
      }
      this.set(patch);
    } catch { /* closed meanwhile */ }
  }

  private sendHeartbeat() {
    const s = this.snap.stats;
    if (!this.socket?.connected || !this.joined) return;
    this.socket.emit('call:media-health', {
      sessionId: this.opts.sessionId,
      audioFlowing: !!s?.audioFlowing,
      videoFlowing: !!s?.videoFlowing,
      candidateType: s?.candidateType ?? null,
      rtt: s?.rttMs ?? null,
      loss: Math.max(s?.audioLossPct ?? 0, s?.videoLossPct ?? 0),
      iceState: this.negotiator?.pc.iceConnectionState || null,
    });
  }

  private async flushTelemetry() {
    if (!this.events.length) return;
    const events = this.events.splice(0, 20);
    try {
      const f = this.opts.fetchImpl || fetch;
      const client = describeClient(typeof navigator !== 'undefined' ? navigator.userAgent : '');
      await f(`${this.opts.apiBase}/sessions/${this.opts.sessionId}/call-events`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, client, mode: this.opts.voice ? 'voice' : 'video' }),
      });
    } catch { /* statistics are best effort */ }
  }

  /* ───────────── ending ───────────── */

  private fail(code: string, message: string) {
    this.note('failed', { reason: code });
    this.set({ phase: 'failed', failure: { code, message } });
    void this.flushTelemetry();
  }

  /** Start over after "still trying" or "opened elsewhere": a new pairing. */
  async rejoin(): Promise<void> {
    if (this.disposed) return;
    this.note('rejoin');
    this.closePeer();
    this.preSignals = [];
    this.outQueue = [];
    this.instanceId = newInstanceId();
    this.set({ superseded: false, failure: null, stalled: false });
    if (!this.snap.local) await this.prepare();
    if (this.socket?.connected) {
      this.set({ phase: 'joining' });
      await this.sendJoin();
      return;
    }
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined = false;
    await this.join();
  }

  /**
   * Done with this page's call (left, finished, navigated away). Tells the
   * server we left on purpose — a refresh or a closed tab never gets here, so
   * those keep the grace period and rejoin silently.
   */
  dispose({ leave = true }: { leave?: boolean } = {}) {
    if (this.disposed) return;
    if (leave && this.joined && this.socket?.connected) {
      this.note('left');
      this.socket.emit('call:leave', { sessionId: this.opts.sessionId, reason: 'user' });
    }
    void this.flushTelemetry();
    this.disposed = true;
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.onPageHide);
    this.stopLoops();
    this.negotiator?.close();
    this.negotiator = null;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined = false;
    stopStream(this.snap.local);
    this.set({ phase: 'ended', local: null, remote: null });
  }
}
