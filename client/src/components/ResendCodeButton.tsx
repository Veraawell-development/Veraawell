import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';

/**
 * "Resend code" for the signup OTP step.
 *
 * The OTP step had no way to ask for another code: a mistyped email, a
 * delayed or spam-filtered message, or a code past its expiry left the user
 * stuck. POST /auth/resend-signup-otp sends a fresh one for a pending signup
 * (429 when rate-limited, 400/404 when there's nothing pending) — the server's
 * message is shown as-is in each case.
 *
 * Starts cooling down immediately: a code was sent a moment ago, when the
 * user reached this step.
 */
const COOLDOWN_SECONDS = 30;

interface ResendCodeButtonProps {
  email: string;
  className?: string;
  style?: React.CSSProperties;
}

const ResendCodeButton: React.FC<ResendCodeButtonProps> = ({ email, className, style }) => {
  const [secondsLeft, setSecondsLeft] = useState(COOLDOWN_SECONDS);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const resend = async () => {
    if (!email || sending || secondsLeft > 0) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        toast.success(data.message || `A new code is on its way to ${email}.`);
        setSecondsLeft(COOLDOWN_SECONDS);
      } else if (res.status === 429) {
        toast.error(data.message || 'Too many requests. Please wait a little before asking for another code.');
        setSecondsLeft(COOLDOWN_SECONDS);
      } else {
        toast.error(data.message || 'Could not send a new code. Please sign up again.');
      }
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || secondsLeft > 0 || !email;

  return (
    <button
      type="button"
      onClick={resend}
      disabled={disabled}
      aria-live="polite"
      className={className ?? 'text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed'}
      style={style ?? { color: 'var(--teal)' }}
    >
      {sending ? 'Sending…' : secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code'}
    </button>
  );
};

export default ResendCodeButton;
