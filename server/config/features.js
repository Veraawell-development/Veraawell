/**
 * Runtime switches for the sessions overhaul.
 *
 * Each one turns a large behaviour change on or off without a code change, so
 * a problem found in production can be rolled back by editing an environment
 * variable in Render rather than by reverting a merge. They are read at call
 * time, never cached at module load, so tests can flip them per test and a
 * restart picks up a new value.
 *
 *   SESSION_RULES  'v2' (the new grace / outcome rules) | 'v1' (the sweep as
 *                  it was before them). See docs/SESSION_RULES.md.
 *
 * (VIDEO_PROVIDER / LIVEKIT_* are gone: calls stay browser-to-browser;
 * LiveKit was dropped on 2026-10-19. CALL_ENGINE, the new call engine's
 * rollback switch, went with the old engine in the Phase 3 cleanup.)
 */

const SESSION_RULE_VERSIONS = Object.freeze(['v1', 'v2']);

/**
 * The session rules in docs/SESSION_RULES.md (lateness, absence, outcomes,
 * refunds) are on. SESSION_RULES=v1 in the environment brings back the old
 * end-of-session sweep — a rollback, kept for one release.
 */
const DEFAULT_SESSION_RULES = 'v2';

function readChoice(name, allowed, fallback) {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

/** Which session rules decide grace and final outcomes. */
function sessionRulesVersion() {
  return readChoice('SESSION_RULES', SESSION_RULE_VERSIONS, DEFAULT_SESSION_RULES);
}

module.exports = {
  SESSION_RULE_VERSIONS,
  sessionRulesVersion
};
