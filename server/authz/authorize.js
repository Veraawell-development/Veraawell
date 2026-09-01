/**
 * Route-level authorization middleware.
 *
 * Why this shape rather than a `can()` helper called inside handlers: a helper
 * you call is a helper you can forget, and forgetting is invisible in review
 * because the route line looks identical either way. POST
 * /api/sessions/:id/missed had no ownership check at all — any authenticated
 * user could cancel and refund any session — and nothing about the route
 * declaration hinted that a check was missing.
 *
 * Declaring the policy on the route line makes the permission visible where
 * the endpoint is defined, and — because the middleware is tagged — makes the
 * set of undeclared routes enumerable from the Express router stack. See
 * authz/audit.js. That is what turns "don't forget" into a failing test.
 *
 * A second job: the middleware loads the resource once and hands it to the
 * handler as `req.authz.resource`. Handlers previously re-fetched, and the
 * comparison idiom drifted between copies — `session.patientId.toString()` in
 * cancelSession vs `session.patientId?._id?.toString()` in completeSession,
 * because the two fetched with different populate shapes. One loader, one
 * shape, one comparison.
 */

const { actorFromRequest } = require('./actor');
const { getRule, getScope, evaluate } = require('./registry');
const { isDeny } = require('./scope');
const { ForbiddenError, CODE } = require('./errors');
const { NotFoundError } = require('../utils/errors');

function readId(req, locate) {
  if (!locate) return undefined;
  const container = locate.from === 'body' ? req.body
    : locate.from === 'query' ? req.query
      : req.params;
  return container ? container[locate.key] : undefined;
}

/**
 * @param {string} action e.g. 'session:cancel'
 * @param {object} [opts]
 * @param {'params'|'body'|'query'} [opts.from] override where the id is read from
 * @param {string} [opts.key] override the id field name
 * @param {function} [opts.load] override the loader (e.g. to add .populate())
 * @returns {import('express').RequestHandler}
 */
function authorize(action, opts = {}) {
  // Validate the action name at require time, not at request time.
  const entry = getRule(action);

  const middleware = async function authorizeMiddleware(req, res, next) {
    try {
      const actor = actorFromRequest(req);
      req.actor = actor;

      let resource = null;

      if (!entry.resourceless) {
        const locate = opts.from || opts.key
          ? { from: opts.from || (entry.locate && entry.locate.from) || 'params',
            key: opts.key || (entry.locate && entry.locate.key) }
          : entry.locate;

        const id = readId(req, locate);
        if (!id) {
          return next(new ForbiddenError(CODE.MISSING_SUBJECT, 'Missing the identifier of the record to act on'));
        }

        const load = opts.load || entry.load;
        if (!load) throw new Error(`authz: action "${action}" needs a resource but has no loader`);

        resource = await load(id, req);
        // 404 before 403, matching every existing handler (they all throw
        // NotFoundError before their ownership check), so no client-visible
        // behaviour changes as routes are converted.
        if (!resource) return next(new NotFoundError(entry.subject));
      }

      const verdict = await evaluate(entry, { actor, resource, req });
      if (!verdict.allowed) return next(verdict.error);

      req.authz = { actor, action, subject: entry.subject, resource, derived: {} };

      // Fields the handler MUST take from the authorized resource rather than
      // from the request body. Deleting them from req.body is the load-bearing
      // part: it converts "the developer must remember not to trust the body"
      // into "the body no longer contains the field". This is what closes the
      // note/task/report `patientId` injection, where a doctor could file a
      // clinical note against an unrelated patient by putting their id in the
      // request body.
      if (entry.derive && resource) {
        for (const [field, pick] of Object.entries(entry.derive)) {
          req.authz.derived[field] = pick(resource);
          if (req.body && field in req.body) delete req.body[field];
        }
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };

  middleware.__authz = { kind: 'rule', action, subject: entry.subject };
  return middleware;
}

/**
 * List-endpoint counterpart. Resolves the actor's query constraint and puts it
 * on `req.authz.scope`; the handler runs `Model.find(req.authz.scope)` and
 * never sees a role string.
 */
function withScope(action) {
  const entry = getScope(action);

  const middleware = async function withScopeMiddleware(req, res, next) {
    try {
      const actor = actorFromRequest(req);
      req.actor = actor;

      // Awaited: some scopes are relationship checks that query the database.
      const scope = await entry.scope({ actor, params: req.params || {}, query: req.query || {}, req });
      if (isDeny(scope)) {
        return next(new ForbiddenError(CODE.NO_SCOPE, 'You do not have access to these records'));
      }

      req.authz = { ...(req.authz || {}), actor, action, subject: entry.subject, scope };
      return next();
    } catch (err) {
      return next(err);
    }
  };

  middleware.__authz = { kind: 'scope', action, subject: entry.subject };
  return middleware;
}

/**
 * Explicit declaration that a route is intentionally reachable without
 * authorization. The `reason` is required so that the audit output reads as a
 * decision rather than an omission — "public" and "nobody added a check yet"
 * must not look the same.
 */
function publicRoute(reason) {
  if (!reason) throw new Error('authz: publicRoute() requires a reason');
  const middleware = function publicRouteMiddleware(req, res, next) {
    req.actor = actorFromRequest(req);
    next();
  };
  middleware.__authz = { kind: 'public', reason };
  return middleware;
}

/**
 * Role gate for actions whose answer depends only on the actor.
 * Replaces the ~20 inline `if (req.user.role !== 'doctor') throw ...` checks
 * scattered through the controllers, moving them onto the route line where
 * they are visible alongside the rest of the route's policy.
 */
function requireRole(...roles) {
  const middleware = function requireRoleMiddleware(req, res, next) {
    const actor = actorFromRequest(req);
    req.actor = actor;
    if (!actor.isAuthenticated || !roles.includes(actor.role)) {
      return next(new ForbiddenError(CODE.WRONG_ROLE, `This action is restricted to: ${roles.join(', ')}`));
    }
    next();
  };
  middleware.__authz = { kind: 'role', roles };
  return middleware;
}

/** Admin tier gate. Use after verifyAdminToken. */
function requireSuperAdmin() {
  const middleware = function requireSuperAdminMiddleware(req, res, next) {
    const actor = actorFromRequest(req);
    req.actor = actor;
    if (!actor.isSuperAdmin) {
      return next(new ForbiddenError(CODE.TIER_REQUIRED, 'Super admin privileges required'));
    }
    next();
  };
  middleware.__authz = { kind: 'role', roles: ['super_admin'] };
  return middleware;
}

module.exports = { authorize, withScope, publicRoute, requireRole, requireSuperAdmin };
