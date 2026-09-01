/**
 * In-memory-only holder for the auth token used as a fallback alongside the
 * httpOnly session cookie.
 *
 * Why this exists: the backend deliberately issues the session as an
 * httpOnly cookie (server/config/auth.js) specifically so that JavaScript on
 * the page — including an attacker's injected script in an XSS scenario —
 * cannot read the session token via document.cookie. Storing the same token
 * in localStorage defeats that protection entirely: any script on the page
 * can call `localStorage.getItem('token')` and exfiltrate it, which is
 * exactly what httpOnly exists to prevent, and localStorage previously held
 * this token indefinitely, refreshed on every auth check.
 *
 * The token is still needed in a few places even though the cookie usually
 * suffices: Socket.IO handshakes read it from `auth.token`, and Safari's
 * Intelligent Tracking Prevention can block the cross-site cookie entirely
 * (the frontend and API are on different domains — see App.tsx's OAuth
 * callback fallback), so a request may need to fall back to an explicit
 * token. This module gives every consumer that value without persisting it:
 * a plain module-level variable is not attached to `window`/`localStorage`,
 * so it isn't reachable by a simple injected `<script>` payload the way
 * localStorage is — it requires code actually executing inside this
 * bundle's module scope, a meaningfully higher bar. The real cost is that it
 * doesn't survive a page refresh; for a normal (non-ITP) session the httpOnly
 * cookie alone carries auth across a refresh, and AuthContext's checkAuth()
 * repopulates this from the server's response on every load. Only the rare
 * cookie-blocked case needs to re-authenticate after a hard refresh, which
 * is the correct behavior when there's no way to persist auth safely without
 * reintroducing the XSS-readable-storage problem this fix removes.
 */

let currentToken: string | null = null;

export function getAuthToken(): string | null {
  return currentToken;
}

export function setAuthTokenInMemory(token: string | null): void {
  currentToken = token;
}
