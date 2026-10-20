/**
 * Razorpay's checkout script, ready to use — or a clear reason why not.
 *
 * index.html loads https://checkout.razorpay.com/v1/checkout.js, but a slow
 * network, an ad-blocker or a strict in-app browser can leave
 * `window.Razorpay` undefined, and `new window.Razorpay(...)` then threw
 * "is not a constructor" after the booking had already been created and its
 * slot held. The booking page now waits for this BEFORE creating the order.
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
export const RAZORPAY_LOAD_TIMEOUT_MS = 12_000;
export const RAZORPAY_UNAVAILABLE_MESSAGE =
  "We couldn't open the payment window. Check your internet connection (or turn off an ad-blocker for this site) and try again.";

type RazorpayWindow = Window & { Razorpay?: unknown };

export function loadRazorpay(timeoutMs = RAZORPAY_LOAD_TIMEOUT_MS): Promise<void> {
  const w = window as RazorpayWindow;
  if (typeof w.Razorpay === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok && typeof w.Razorpay === 'function') resolve();
      else reject(new Error(RAZORPAY_UNAVAILABLE_MESSAGE));
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    // index.html's tag either failed or is still loading — there's no telling
    // which from here, and a failed tag never fires again. A fresh tag covers
    // both: loading the script twice only redefines window.Razorpay.
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', () => finish(true));
    script.addEventListener('error', () => finish(false));
    document.head.appendChild(script);
  });
}

/**
 * What closing the payment window did, from POST /sessions/:id/abandon-checkout
 * (null when that request failed). The server asks Razorpay before giving the
 * slot back, so "free again" is only said when it actually was freed — it
 * used to be said whatever happened, including when the request failed.
 *
 *   freed       the checkout is cancelled and the time can be booked again
 *   booked      a payment had in fact gone through: the session stands
 *   processing  a payment is authorised but not yet captured — wait for it
 *   unknown     we couldn't tell (gateway or network down); the minute-by-
 *               minute sweep settles it
 */
export function abandonResult(result: { outcome?: string; status?: string } | null | undefined): 'freed' | 'booked' | 'processing' | 'unknown' {
  const outcome = result?.outcome;
  if (!outcome) return 'unknown';
  if (outcome === 'expired') return 'freed';
  if (outcome.startsWith('captured')) return 'booked';
  if (outcome === 'awaiting-capture') return 'processing';
  if (outcome === 'not-pending') {
    if (result?.status === 'cancelled') return 'freed';
    if (result?.status === 'scheduled' || result?.status === 'active') return 'booked';
  }
  return 'unknown';
}

/**
 * Where a booking's payment stands, from the session the server returns —
 * used while the page waits for a payment the browser couldn't verify.
 */
export function paymentOutcome(session: { status?: string; paymentStatus?: string } | null | undefined): 'paid' | 'failed' | 'pending' {
  if (!session) return 'pending';
  if (session.paymentStatus === 'paid' || session.paymentStatus === 'not_required') {
    return session.status === 'cancelled' ? 'failed' : 'paid';
  }
  if (session.status === 'cancelled' || session.paymentStatus === 'failed') return 'failed';
  return 'pending';
}
