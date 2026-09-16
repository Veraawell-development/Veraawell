/**
 * The only sanctioned way to change Session.status / Session.paymentStatus.
 *
 * Replaces the `findById -> mutate -> save()` pattern used at every mutation
 * site. That pattern is a read-modify-write, and for money it is racy in a way
 * that matters: `verifyPayment` (fired by the patient's browser) and the
 * `payment.captured` webhook arrive at almost the same moment in production.
 * Both read `paymentStatus !== 'paid'`, both pass, both save — so the booking
 * confirmation email is sent twice and `session:booked` is emitted twice.
 *
 * The fix generalises the idiom models/doctorAvailability.js bookSlot() already
 * gets right: put the expected pre-state in the FILTER, the new state in the
 * update, and treat a null result as "someone else won the race" rather than
 * as success.
 */

const { planTransition, guardFilter, assertInvariants, EVENT, ACTOR } = require('./sessionState');
const { NotFoundError, AppError } = require('../utils/errors');
const { createLogger } = require('../utils/logger');

const logger = createLogger('SESSION-TRANSITION');

class ConcurrentModificationError extends AppError {
  constructor(message = 'This session was changed by another request. Please retry.') {
    super(message, 409);
    this.code = 'CONCURRENT_MODIFICATION';
  }
}

/**
 * Apply a lifecycle event atomically.
 *
 * @param {object|string} sessionOrId  a loaded document or an id
 * @param {object} args
 * @param {string} args.event   EVENT.*
 * @param {string} args.actor   ACTOR.*
 * @param {object} [args.payload]     paymentId, refundId, refundAmount, ...
 * @param {object} [args.extraSet]    non-lifecycle fields to write in the same op
 * @param {object} [args.extraFilter] extra preconditions
 * @returns {Promise<{session:object, changed:boolean, noopReason?:string,
 *                    from?:object, to?:object}>}
 * @throws {IllegalTransitionError|InvariantViolationError|NotFoundError|ConcurrentModificationError}
 */
async function applyTransition(sessionOrId, {
  event, actor, payload = {}, extraSet = {}, extraFilter = {},
  now = new Date(), maxRetries = 3
} = {}) {
  const Session = require('../models/session');

  // A Mongoose ObjectId has a SELF-REFERENTIAL `_id` getter, so the obvious
  // `sessionOrId._id ? document : id` test is true for a bare ObjectId and
  // this used to take the document branch — using the id itself as the
  // session. Every field then reads undefined and the first thing to notice
  // is planTransition rejecting a status of "undefined", far from the cause.
  // It only ever worked because the one existing caller passed a document.
  //
  // Detect the id case explicitly instead: a string, or a BSON ObjectId.
  const isId = typeof sessionOrId === 'string'
    || (sessionOrId && sessionOrId._bsontype === 'ObjectId');
  const id = isId ? sessionOrId : (sessionOrId && sessionOrId._id);

  let session = isId ? await Session.findById(id) : sessionOrId;
  if (!session) throw new NotFoundError('Session');

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const plan = planTransition({ session, event, actor, now, payload });

    if (plan.kind === 'noop') {
      return { session, changed: false, noopReason: plan.reason };
    }

    const $set = { ...plan.set, ...extraSet };

    // Validate the POST-image before touching the database, so an invariant
    // violation is a rejected write rather than a corrupted row that some
    // later reader has to cope with.
    const current = typeof session.toObject === 'function' ? session.toObject() : session;
    assertInvariants({ ...current, ...$set });

    const updated = await Session.findOneAndUpdate(
      { _id: id, ...guardFilter(plan), ...extraFilter },
      { $set },
      { new: true }
    );

    if (updated) {
      logger.info('session transition', {
        sessionId: String(id).substring(0, 8),
        event,
        actor,
        from: plan.from,
        to: { status: updated.status, paymentStatus: updated.paymentStatus }
      });

      // Money has just left the platform. If this session's earnings were
      // already paid out to the doctor, the platform is now short and must
      // reclaim that share from their next payout.
      //
      // Hooked here rather than at the four refund call sites for the same
      // reason the transition table lives here: the fifth call site would not
      // have remembered. And keyed on the POST-STATE rather than the event,
      // because three different table rows converge on `refunded`
      // (REFUND_SUCCEEDED, and REFUND_OBSERVED from either paid or
      // refund_pending) — hooking events would mean three hooks and a fourth
      // one missed when a row is added.
      if (updated.paymentStatus === 'refunded' && plan.from.paymentStatus !== 'refunded') {
        try {
          await require('./payoutLedger').onSessionRefunded(updated);
        } catch (err) {
          // Never rethrow: the transition is already committed, and failing
          // here would report a completed refund as an error to the patient.
          // reconcileClawbacks() is idempotent and repairs a miss.
          logger.error('clawback hook failed; the reconciliation sweep will retry', {
            sessionId: String(id).substring(0, 8),
            error: err.message
          });
        }
      }

      return {
        session: updated,
        changed: true,
        from: plan.from,
        to: { status: updated.status, paymentStatus: updated.paymentStatus }
      };
    }

    // Lost the compare-and-set. Reload and re-plan: if the winner already
    // reached the state we wanted, the next iteration collapses into a benign
    // no-op, which is exactly right for a duplicate request.
    session = await Session.findById(id);
    if (!session) throw new NotFoundError('Session');
  }

  throw new ConcurrentModificationError();
}

/** Non-throwing form, for sweeps that must not abort on one bad row. */
async function tryTransition(sessionOrId, args) {
  try {
    return await applyTransition(sessionOrId, args);
  } catch (err) {
    logger.warn('transition rejected', {
      sessionId: String((sessionOrId && sessionOrId._id) || sessionOrId).substring(0, 8),
      event: args && args.event,
      error: err.message
    });
    return { session: null, changed: false, error: err };
  }
}

module.exports = { applyTransition, tryTransition, ConcurrentModificationError, EVENT, ACTOR };
