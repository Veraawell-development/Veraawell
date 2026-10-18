/**
 * Runtime switches for the sessions overhaul.
 *
 * Each one turns a large behaviour change on or off without a code change, so
 * a problem found in production can be rolled back by editing an environment
 * variable in Render rather than by reverting a merge. They are read at call
 * time, never cached at module load, so tests can flip them per test and a
 * restart picks up a new value.
 *
 *   SESSION_RULES   'v2' (the new grace / outcome rules) | 'v1' (the sweep as
 *                   it was before them). See docs/SESSION_RULES.md.
 *   VIDEO_PROVIDER  'livekit' | 'legacy'. LiveKit is only ever used when its
 *                   three credentials are present as well; without them every
 *                   call stays on the legacy stack whatever this says.
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET  the LiveKit Cloud project.
 */

const SESSION_RULE_VERSIONS = Object.freeze(['v1', 'v2']);
const VIDEO_PROVIDERS = Object.freeze(['legacy', 'livekit']);

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

/** The LiveKit Cloud project, and whether it is fully configured. */
function livekitConfig() {
  const url = String(process.env.LIVEKIT_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  return { enabled: !!(url && apiKey && apiSecret), url, apiKey, apiSecret };
}

/**
 * The call stack new calls should use. 'livekit' only when asked for AND
 * configured: a half-configured LiveKit would hand out tokens nobody can use.
 */
function videoProvider() {
  const wanted = readChoice('VIDEO_PROVIDER', VIDEO_PROVIDERS, 'legacy');
  if (wanted === 'livekit' && !livekitConfig().enabled) return 'legacy';
  return wanted;
}

module.exports = {
  SESSION_RULE_VERSIONS,
  VIDEO_PROVIDERS,
  sessionRulesVersion,
  livekitConfig,
  videoProvider
};
