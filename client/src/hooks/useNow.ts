import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `everyMs` while `active`. For screens
 * whose meaning changes with the clock — a refund preview that must flip at
 * the 4-hour mark while the panel is open, a Cancel button that must go once
 * the session starts.
 */
export function useNow(everyMs = 15_000, active = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs, active]);
  return now;
}
