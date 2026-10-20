import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import type { MediaErrorKind } from '../../call/media';
import { permissionHelp } from '../../call/permissionHelp';
import { androidChromeIntent, detectInAppBrowser, isAndroid } from '../../call/browser';

/** Live microphone level, 0–1, for the meter. */
function useMicLevel(stream: MediaStream | null, active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !active || !stream.getAudioTracks().length) { setLevel(0); return; }
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext | null = null;
    let raf = 0;
    try {
      ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* no meter, no problem */ }
    return () => { cancelAnimationFrame(raf); void ctx?.close().catch(() => {}); };
  }, [stream, active]);
  return level;
}

interface Props {
  voice: boolean;
  local: MediaStream | null;
  hasAudio: boolean;
  hasVideo: boolean;
  mediaError: MediaErrorKind | null;
  preparing: boolean;
  title: string;
  subtitle?: string;
  onRetry: () => void;
  onJoin: () => void;
  onBack: () => void;
}

/**
 * Before the call: see yourself, check the mic moves, fix permissions — then
 * Join. The Join tap also lets iPhones play the other person's sound.
 */
const PreJoin: React.FC<Props> = ({ voice, local, hasAudio, hasVideo, mediaError, preparing, title, subtitle, onRetry, onJoin, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const level = useMicLevel(local, hasAudio);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const help = permissionHelp(mediaError, ua, voice);
  const inApp = detectInAppBrowser(ua);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = hasVideo ? local : null;
    if (hasVideo) el.play().catch(() => {});
  }, [local, hasVideo]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success('Link copied — paste it in Chrome or Safari.'); }
    catch { toast('Copy the address from the top of this screen.'); }
  };

  const joinLabel = hasAudio ? 'Join now' : 'Join without microphone';

  return (
    <div className="fixed inset-0 z-[120] bg-[#09090B] flex items-center justify-center p-4 overflow-y-auto" data-testid="prejoin">
      <div className="w-full max-w-md bg-[#18181B] border border-white/10 rounded-3xl p-6 shadow-2xl text-white">
        <h1 className="text-xl font-semibold tracking-wide">{title}</h1>
        {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}

        {!voice && (
          <div className="mt-5 relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" aria-label="Your camera preview" />
            {!hasVideo && (
              <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                {preparing ? 'Starting your camera…' : 'Camera off'}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3" aria-label="Microphone level">
          <svg className={`w-5 h-5 ${hasAudio ? 'text-teal-400' : 'text-red-400'}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
          </svg>
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-teal-400 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <span className="text-xs text-white/50 w-28 text-right">{preparing ? 'Checking…' : hasAudio ? 'Say something' : 'No microphone'}</span>
        </div>

        {help && (
          <div role="alert" className="mt-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4">
            <p className="text-amber-300 font-medium text-sm">{help.title}</p>
            <ol className="mt-2 space-y-1 text-white/70 text-sm list-decimal list-inside">
              {help.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              {inApp && isAndroid(ua) && (
                <a href={androidChromeIntent(window.location.href)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm">Open in Chrome</a>
              )}
              {inApp && <button onClick={() => { void copyLink(); }} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm">Copy link</button>}
              {!inApp && <button onClick={onRetry} disabled={preparing} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-sm disabled:opacity-50">Try again</button>}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={onJoin}
            disabled={preparing}
            className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            {preparing ? 'Getting ready…' : joinLabel}
          </button>
          {!hasAudio && !preparing && (
            <p className="text-white/50 text-xs text-center">You'll hear the other person; they won't hear you until your microphone works.</p>
          )}
          <button onClick={onBack} className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm">
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreJoin;
