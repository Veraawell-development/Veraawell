/* eslint-disable @typescript-eslint/no-explicit-any -- getStats() entries differ by browser; each field is checked before use */
/**
 * How the call is doing, from RTCPeerConnection.getStats(): which route it
 * took (direct, via the router, or through the relay), round-trip time,
 * packet loss for audio AND video, and whether media is actually arriving.
 *
 * Works on Safari too: Safari has no transport `iceState` and (since 16.2)
 * no candidate-pair round-trip time, so RTT and loss come from
 * `remote-inbound-rtp`, which every browser has.
 *
 * The quality ladder starts at 540p and steps down on a weak link — 360p,
 * then 180p, then video paused so the voice stays clear — and back up when
 * the link recovers (slow down quickly, recover slowly).
 */

export type CandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | null;

export interface CallStats {
  candidateType: CandidateType;
  rttMs: number | null;
  audioLossPct: number | null;
  videoLossPct: number | null;
  /** Bytes received since the previous sample. */
  audioBytesIn: number;
  videoBytesIn: number;
  audioFlowing: boolean;
  videoFlowing: boolean;
}

interface Totals { audio: number; video: number; lostA: number; recvA: number; lostV: number; recvV: number }

/** Read one sample; `prev` is the totals returned last time. */
export async function sampleStats(pc: RTCPeerConnection, prev: Totals | null): Promise<{ stats: CallStats; totals: Totals }> {
  const report = await pc.getStats();
  const byId = new Map<string, any>();
  report.forEach((s: any) => byId.set(s.id, s));

  // The selected route: transport.selectedCandidatePairId, else the
  // nominated succeeded pair, else Firefox's `selected` flag.
  let pair: any = null;
  report.forEach((s: any) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = byId.get(s.selectedCandidatePairId); });
  if (!pair) report.forEach((s: any) => { if (!pair && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
  if (!pair) report.forEach((s: any) => { if (!pair && s.type === 'candidate-pair' && s.selected) pair = s; });
  const local = pair ? byId.get(pair.localCandidateId) : null;
  const remote = pair ? byId.get(pair.remoteCandidateId) : null;
  const types = [local?.candidateType, remote?.candidateType];
  const candidateType: CandidateType = types.includes('relay') ? 'relay' : (local?.candidateType ?? null);

  const totals: Totals = { audio: 0, video: 0, lostA: 0, recvA: 0, lostV: 0, recvV: 0 };
  let rtt: number | null = typeof pair?.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : null;
  report.forEach((s: any) => {
    if (s.type === 'inbound-rtp') {
      const kind = s.kind || s.mediaType;
      if (kind === 'audio') { totals.audio += s.bytesReceived || 0; totals.lostA += s.packetsLost || 0; totals.recvA += s.packetsReceived || 0; }
      if (kind === 'video') { totals.video += s.bytesReceived || 0; totals.lostV += s.packetsLost || 0; totals.recvV += s.packetsReceived || 0; }
    }
    if (s.type === 'remote-inbound-rtp' && rtt === null && typeof s.roundTripTime === 'number') rtt = s.roundTripTime * 1000;
  });

  const d = (a: number, b: number | undefined) => Math.max(0, a - (b || 0));
  const lossPct = (lost: number, recv: number) => (lost + recv > 0 ? Math.round((lost / (lost + recv)) * 1000) / 10 : null);
  const audioBytesIn = d(totals.audio, prev?.audio);
  const videoBytesIn = d(totals.video, prev?.video);
  return {
    totals,
    stats: {
      candidateType,
      rttMs: rtt === null ? null : Math.round(rtt),
      audioLossPct: lossPct(d(totals.lostA, prev?.lostA), d(totals.recvA, prev?.recvA)),
      videoLossPct: lossPct(d(totals.lostV, prev?.lostV), d(totals.recvV, prev?.recvV)),
      audioBytesIn,
      videoBytesIn,
      audioFlowing: audioBytesIn > 0,
      videoFlowing: videoBytesIn > 0,
    },
  };
}

/** 0 = 540p · 1 = 360p · 2 = 180p · 3 = video paused (audio only). */
export type QualityLevel = 0 | 1 | 2 | 3;

export const LADDER: { maxBitrate: number; scaleResolutionDownBy: number; maxFramerate: number; active: boolean }[] = [
  { maxBitrate: 800_000, scaleResolutionDownBy: 1, maxFramerate: 24, active: true },
  { maxBitrate: 450_000, scaleResolutionDownBy: 1.5, maxFramerate: 15, active: true },
  { maxBitrate: 200_000, scaleResolutionDownBy: 3, maxFramerate: 12, active: true },
  { maxBitrate: 100_000, scaleResolutionDownBy: 3, maxFramerate: 8, active: false },
];

/** Is this sample a bad one for the link (what the OTHER side receives is in remote-inbound loss / RTT). */
export function isBadSample(s: Pick<CallStats, 'rttMs' | 'audioLossPct' | 'videoLossPct'>): boolean {
  return (s.rttMs !== null && s.rttMs > 600) || (s.audioLossPct ?? 0) > 8 || (s.videoLossPct ?? 0) > 10;
}
export function isGoodSample(s: Pick<CallStats, 'rttMs' | 'audioLossPct' | 'videoLossPct'>): boolean {
  return (s.rttMs === null || s.rttMs < 300) && (s.audioLossPct ?? 0) < 2 && (s.videoLossPct ?? 0) < 3;
}

/** Step down after 3 bad samples in a row, up after 5 good ones. */
export class QualityLadder {
  level: QualityLevel = 0;
  private bad = 0;
  private good = 0;
  private readonly floor: QualityLevel;
  constructor(floor: QualityLevel = 3) { this.floor = floor; }
  next(s: Pick<CallStats, 'rttMs' | 'audioLossPct' | 'videoLossPct'>): QualityLevel {
    if (isBadSample(s)) { this.bad += 1; this.good = 0; } else if (isGoodSample(s)) { this.good += 1; this.bad = 0; } else { this.bad = 0; this.good = 0; }
    if (this.bad >= 3 && this.level < this.floor) { this.level = (this.level + 1) as QualityLevel; this.bad = 0; }
    if (this.good >= 5 && this.level > 0) { this.level = (this.level - 1) as QualityLevel; this.good = 0; }
    return this.level;
  }
}

/** Apply a level to the video sender: change only what's needed, pass the rest back. */
export async function applyQuality(sender: RTCRtpSender | null | undefined, level: QualityLevel): Promise<void> {
  if (!sender || !sender.track || typeof sender.getParameters !== 'function') return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) return;
  const step = LADDER[level];
  params.encodings[0].maxBitrate = step.maxBitrate;
  params.encodings[0].scaleResolutionDownBy = step.scaleResolutionDownBy;
  params.encodings[0].maxFramerate = step.maxFramerate;
  params.encodings[0].active = step.active;
  try {
    await sender.setParameters(params);
  } catch (err) {
    console.warn('[call] could not change video quality', err);
  }
}
