/**
 * Authorization layer — public API.
 *
 * Replaces roughly 40 hand-written ownership checks spread across 161 HTTP
 * endpoints and 16 socket events. Those checks were written in at least three
 * different idioms, and four of them were simply missing, which is the
 * expected outcome at that count: a rule enforced by 40 independent copies is
 * a rule that will have exceptions.
 *
 * Usage on a route:
 *   router.post('/:sessionId/cancel',
 *     verifyToken,
 *     validateObjectIdParam('sessionId'),
 *     authorize('session:cancel'),
 *     s.cancelSession);
 *
 * The handler then reads `req.authz.resource` (already loaded, already
 * authorized) and `req.actor.id` (correct in both auth realms).
 *
 * On a list route:
 *   router.get('/notes/patient/:patientId',
 *     verifyToken,
 *     validateObjectIdParam('patientId'),
 *     withScope('note:list-by-patient'),
 *     noteController.getNotesByPatient);
 *
 * ...and the handler runs `SessionNote.find(req.authz.scope)`.
 */

const registry = require('./registry');

// Register every policy exactly once, at require time, so an unknown action
// name is a boot-time error rather than a runtime 500.
registry.loadPolicies();

const { authorize, withScope, publicRoute, requireRole, requireSuperAdmin } = require('./authorize');
const { can, assertCan } = require('./can');
const { DENY, isDeny, sealedFilter } = require('./scope');
const { ForbiddenError, CATEGORY, CODE } = require('./errors');
const { normalizeActor, actorFromRequest, systemActor, idOf, ROLE, CHANNEL } = require('./actor');

module.exports = {
  // route middleware
  authorize,
  withScope,
  publicRoute,
  requireRole,
  requireSuperAdmin,
  // non-HTTP callers (sockets, schedulers)
  can,
  assertCan,
  // scopes
  DENY,
  isDeny,
  sealedFilter,
  // actors
  normalizeActor,
  actorFromRequest,
  systemActor,
  idOf,
  ROLE,
  CHANNEL,
  // errors
  ForbiddenError,
  CATEGORY,
  CODE,
  // introspection (audit + tests)
  registry
};
