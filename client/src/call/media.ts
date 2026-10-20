/**
 * Getting the camera and microphone — and saying clearly what went wrong.
 *
 * The first engine asked for camera + mic before anything else, and any
 * failure (permission denied, camera busy in Zoom, no webcam, a link opened
 * inside WhatsApp) meant the person never even entered the room while the
 * other one waited forever. Now there is a ladder — the requested quality,
 * then plain camera + mic, then mic only, then nothing (join to listen) —
 * and each failure is a typed reason the pre-join screen can explain.
 * Voice sessions never ask for the camera.
 */

export type MediaErrorKind =
  | 'permission-denied'
  | 'permission-denied-system'
  | 'no-device'
  | 'device-in-use'
  | 'constraints'
  | 'insecure'
  | 'aborted'
  | 'unsupported'
  | 'unknown';

export function mapMediaError(err: unknown): MediaErrorKind {
  const e = err as { name?: string; message?: string } | null;
  const name = e?.name || '';
  const message = (e?.message || '').toLowerCase();
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return /system|by the os|by system/.test(message) ? 'permission-denied-system' : 'permission-denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-device';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'device-in-use';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'constraints';
  if (name === 'SecurityError') return 'insecure';
  if (name === 'AbortError') return 'aborted';
  if (name === 'TypeError') return 'unsupported';
  return 'unknown';
}

/** Start at 540p; the quality ladder (stats.ts) drops it on weak networks. */
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 960 },
  height: { ideal: 540 },
  frameRate: { ideal: 24, max: 30 },
  facingMode: 'user',
};
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface AcquireResult {
  stream: MediaStream | null;
  hasAudio: boolean;
  hasVideo: boolean;
  /** The first failure on the way down the ladder, if any. */
  error: MediaErrorKind | null;
}

export interface AcquireOptions {
  voice: boolean;
  wantVideo?: boolean;
  audioDeviceId?: string | null;
  videoDeviceId?: string | null;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
}

export async function acquireMedia(opts: AcquireOptions): Promise<AcquireResult> {
  const gum = opts.getUserMedia
    || (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
      ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
      : null);
  if (!gum) return { stream: null, hasAudio: false, hasVideo: false, error: typeof window !== 'undefined' && !window.isSecureContext ? 'insecure' : 'unsupported' };

  const audio: MediaTrackConstraints = { ...AUDIO_CONSTRAINTS, ...(opts.audioDeviceId ? { deviceId: { exact: opts.audioDeviceId } } : {}) };
  const video: MediaTrackConstraints = { ...VIDEO_CONSTRAINTS, ...(opts.videoDeviceId ? { deviceId: { exact: opts.videoDeviceId } } : {}) };
  const wantVideo = !opts.voice && opts.wantVideo !== false;

  const ladder: MediaStreamConstraints[] = wantVideo
    ? [{ audio, video }, { audio: true, video: true }, { audio }, { audio: true }]
    : [{ audio }, { audio: true }];

  let firstError: MediaErrorKind | null = null;
  for (const c of ladder) {
    try {
      const stream = await gum(c);
      return {
        stream,
        hasAudio: stream.getAudioTracks().length > 0,
        hasVideo: stream.getVideoTracks().length > 0,
        error: firstError,
      };
    } catch (err) {
      const kind = mapMediaError(err);
      firstError = firstError || kind;
      // Denied mic AND camera: asking again won't help.
      if (kind === 'permission-denied' || kind === 'permission-denied-system' || kind === 'insecure' || kind === 'unsupported') {
        if (!('video' in c) || c.video === false) break;
      }
    }
  }
  return { stream: null, hasAudio: false, hasVideo: false, error: firstError };
}

/** Stop every track of a stream (camera light off). */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* ended */ } });
}
