/**
 * One normalized description of "who is making this request".
 *
 * The problem this solves: there are two authentication realms, and handlers
 * have to know which one they are running under in order to find the caller's
 * id. `verifyToken` sets `req.user`; `verifyAdminToken` sets `req.admin`.
 * Handlers that guess wrong simply crash — controllers/review.controller.js
 * reads `req.user._id` on routes mounted behind `verifyAdminToken`, so every
 * call to the admin review-moderation endpoints throws a TypeError and 500s.
 * That is not a typo; it is what happens when the correct accessor depends on
 * context the handler cannot see.
 *
 * After this module, handlers read `req.actor.id` and it is correct in both
 * realms. The wrong accessor stops existing.
 *
 * Shape compatibility matters here: the existing jest harness stubs auth with
 * a plain object literal (`req.user = { _id, role }` — see
 * __tests__/cancelSession.idempotency.test.js), while production attaches a
 * full hydrated Mongoose document. normalizeActor accepts either, so policies
 * can be exercised in a fast no-DB test and in the real request path without
 * behaving differently.
 */

const ROLE = Object.freeze({
  PATIENT: 'patient',
  DOCTOR: 'doctor',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  ANONYMOUS: 'anonymous'
});

/** Which credential the request presented. Not the same thing as the role. */
const CHANNEL = Object.freeze({
  USER: 'user',        // `token` cookie / Bearer, verified with JWT_SECRET
  ADMIN: 'admin',      // `adminToken` cookie, verified with ADMIN_JWT_SECRET
  SOCKET: 'socket',
  SYSTEM: 'system',    // schedulers, migrations — bypasses nothing, just labels
  ANONYMOUS: 'anonymous'
});

const ANONYMOUS_ACTOR = Object.freeze({
  id: null,
  role: ROLE.ANONYMOUS,
  status: 'active',
  channel: CHANNEL.ANONYMOUS,
  isAdmin: false,
  isSuperAdmin: false,
  isAuthenticated: false
});

/**
 * @param {object|null} source  a Mongoose User document OR a plain { _id, role }
 * @param {string} channel      CHANNEL.*
 * @returns {Readonly<object>} the normalized actor
 */
function normalizeActor(source, channel = CHANNEL.USER) {
  if (!source) return ANONYMOUS_ACTOR;

  const raw = typeof source.toObject === 'function' ? source.toObject() : source;
  const id = raw._id != null ? String(raw._id) : (raw.id != null ? String(raw.id) : null);
  const role = raw.role || ROLE.PATIENT;
  // A plain-object test fixture has no `status`; treating absent as active
  // keeps those fixtures working. Real requests can never reach here
  // suspended, because authenticate() rejects them before this point.
  const status = raw.status || 'active';

  return Object.freeze({
    id,
    role,
    status,
    channel,
    isAdmin: role === ROLE.ADMIN || role === ROLE.SUPER_ADMIN,
    isSuperAdmin: role === ROLE.SUPER_ADMIN,
    isAuthenticated: id != null
  });
}

/**
 * Resolve the actor for a request.
 *
 * Precedence is deliberate: an admin-realm credential produces an admin
 * actor even if a user-realm one is also present. A request carrying both
 * should be judged by the stronger credential, not by whichever middleware
 * happened to run first.
 */
function actorFromRequest(req) {
  if (!req) return ANONYMOUS_ACTOR;
  if (req.actor) return req.actor;
  if (req.admin) return normalizeActor(req.admin, CHANNEL.ADMIN);
  if (req.user) return normalizeActor(req.user, CHANNEL.USER);
  return ANONYMOUS_ACTOR;
}

/** Actor for background work (schedulers, migrations). Carries no privileges. */
function systemActor() {
  return Object.freeze({
    id: null,
    role: 'system',
    status: 'active',
    channel: CHANNEL.SYSTEM,
    isAdmin: false,
    isSuperAdmin: false,
    isAuthenticated: false
  });
}

/** Normalize an id-ish value (ObjectId | populated doc | string) to a string. */
function idOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (value._id != null) return String(value._id);
  return String(value);
}

module.exports = {
  ROLE,
  CHANNEL,
  ANONYMOUS_ACTOR,
  normalizeActor,
  actorFromRequest,
  systemActor,
  idOf
};
