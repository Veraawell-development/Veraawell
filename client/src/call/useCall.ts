import { useEffect, useState, useSyncExternalStore } from 'react';
import { CallEngine, type CallSnapshot } from './CallEngine';

const IDLE = { phase: 'idle' } as CallSnapshot;
const noopSubscribe = () => () => {};
const idleSnapshot = () => IDLE;

/**
 * The call engine for one session, as React state. Created in an effect and
 * disposed in its cleanup, so React StrictMode's mount → unmount → mount
 * gets a fresh engine instead of a disposed one; nothing connects until the
 * page calls prepare()/join().
 */
export function useCall(opts: {
  sessionId: string | undefined;
  voice: boolean;
  enabled: boolean;
  socketUrl: string;
  apiBase: string;
  getToken?: () => string | null | undefined;
}) {
  const [engine, setEngine] = useState<CallEngine | null>(null);
  const { sessionId, voice, enabled, socketUrl, apiBase, getToken } = opts;
  useEffect(() => {
    if (!enabled || !sessionId) return;
    const e = new CallEngine({ sessionId, voice, socketUrl, apiBase, getToken });
    setEngine(e);
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) (window as unknown as { __vwCall?: CallEngine }).__vwCall = e;
    return () => {
      e.dispose();
      setEngine((cur) => (cur === e ? null : cur));
    };
    // getToken is read on each connect; a new function identity must not rebuild the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId, voice, socketUrl, apiBase]);
  const call = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getSnapshot : idleSnapshot);
  return { engine, call };
}
