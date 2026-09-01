/**
 * The same policy table, for callers that are not an Express route.
 *
 * Socket.IO has no per-event middleware, and background jobs have no request
 * at all. Without this, those surfaces would need their own copy of the rules
 * — which is exactly how the video namespace ended up with no authorization on
 * 13 of its 16 events while the REST routes had (inconsistent) checks.
 *
 * One rule table, three transports.
 */

const { getRule, evaluate } = require('./registry');
const { NotFoundError } = require('../utils/errors');
const { ForbiddenError, CODE } = require('./errors');

/**
 * @param {object} actor            from normalizeActor()
 * @param {string} action           e.g. 'session:end-call'
 * @param {object|string} [subject] a loaded document, or an id to load
 * @returns {Promise<{allowed:boolean, resource:object|null, error?:Error}>}
 */
async function can(actor, action, subject = null) {
  const entry = getRule(action);

  let resource = null;
  if (!entry.resourceless) {
    if (subject == null) {
      return { allowed: false, resource: null, error: new ForbiddenError(CODE.MISSING_SUBJECT) };
    }
    const isId = typeof subject === 'string' || (subject && subject._bsontype === 'ObjectId');
    if (isId) {
      if (!entry.load) throw new Error(`authz: action "${action}" needs a loader to resolve an id`);
      resource = await entry.load(String(subject));
      if (!resource) return { allowed: false, resource: null, error: new NotFoundError(entry.subject) };
    } else {
      resource = subject;
    }
  }

  const verdict = await evaluate(entry, { actor, resource, req: null });
  return { allowed: verdict.allowed, resource, error: verdict.error };
}

/** Throwing form. Returns the loaded resource so the caller need not refetch. */
async function assertCan(actor, action, subject = null) {
  const result = await can(actor, action, subject);
  if (!result.allowed) throw result.error;
  return result.resource;
}

module.exports = { can, assertCan };
