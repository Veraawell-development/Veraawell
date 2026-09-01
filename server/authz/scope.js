/**
 * Authorization expressed as a query constraint, for list endpoints.
 *
 * The bug class this removes: every list handler built its Mongo filter with
 * a chain of role checks and no final `else`. For example
 * controllers/note.controller.js getNotesByPatient:
 *
 *     let query = { patientId };
 *     if (userRole === 'patient') query.isPrivate = false;
 *     else if (userRole === 'doctor') query.doctorId = userId;
 *     // no else
 *
 * Any role that is neither — an admin, or an admin-realm token, which
 * verifyToken currently accepts because it falls back to the `adminToken`
 * cookie — falls through to an unconstrained `{ patientId }` and receives the
 * patient's entire chart, private clinical notes included. The same shape
 * appears in report, task and session listing.
 *
 * The fix is not "remember to add an else". It is to stop letting handlers
 * build filters at all: a scope function returns either a filter fragment or
 * DENY, the switch has a `default: return DENY`, and the controller just
 * runs `Model.find(req.authz.scope)`.
 */

const { ForbiddenError, CODE } = require('./errors');

/**
 * Sentinel meaning "this actor may not list this resource at all".
 *
 * A Symbol rather than null/{}/undefined precisely because it cannot be
 * spread into a query by accident: `{ ...DENY }` throws, and
 * `Model.find(DENY)` throws, instead of silently becoming `find({})` and
 * returning every document in the collection. A denial must never be able to
 * degrade into "no filter".
 */
const DENY = Symbol('authz.DENY');

function isDeny(scope) {
  return scope === DENY;
}

/**
 * Merge non-authorization query terms (pagination, ?status=) into a scope.
 *
 * Throws if the caller tries to set a key the scope already pinned. That is
 * the regression that reintroduces the leak: a later edit adding
 * `{ patientId: req.query.patientId }` on top of a scope that pinned
 * `patientId` would silently hand over another patient's records. Failing
 * loudly at development time is the point.
 *
 * @param {object|symbol} scope  from a policy's scopes table
 * @param {object} extra         caller-supplied, non-authorization terms
 */
function sealedFilter(scope, extra = {}) {
  if (isDeny(scope)) {
    throw new ForbiddenError(CODE.NO_SCOPE, 'You do not have access to these records');
  }
  if (!scope || typeof scope !== 'object') {
    throw new Error('authz: scope must be an object or DENY');
  }
  for (const key of Object.keys(extra)) {
    if (key in scope) {
      throw new Error(
        `authz: refusing to let a caller override the pinned filter key "${key}" — ` +
        'that key is what constrains this query to the current actor'
      );
    }
  }
  return { ...scope, ...extra };
}

module.exports = { DENY, isDeny, sealedFilter };
