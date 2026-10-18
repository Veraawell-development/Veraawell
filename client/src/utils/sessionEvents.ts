/**
 * "The API just turned this browser's session away."
 *
 * Raised by the fetch interceptor (csrfFetchInterceptor.ts) on any 401 from
 * the user API, and heard by AuthContext, which asks the server whether the
 * session is still good and, if it is not, signs the browser out cleanly.
 *
 * Without it a session that ended mid-use — the 30-day token ran out, the
 * password was changed on another device, the account was suspended — left
 * the app looking signed in while every request failed, until the person
 * happened to reload. A 401 is only a prompt to re-check, never a sign-out by
 * itself: some endpoints use it for an answer about the request.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionRejected(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportSessionRejected(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener's failure must not break the request that reported it.
    }
  });
}
