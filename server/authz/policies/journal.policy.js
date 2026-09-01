/**
 * Journal — a patient's private wellness diary.
 *
 * The strictest resource in the product: owner-only, with no doctor and no
 * admin read path. The existing controller checks were already correct (owner
 * comparison on every action), so this policy preserves that behaviour and
 * moves the statement of it onto the route line, where it is visible and
 * auditable rather than being three separate `if` statements.
 *
 * Note: models/journal.js declares an `isPrivate` field that nothing reads or
 * writes. Either it is dead (delete it) or a doctor-sharing feature that was
 * never wired. Leaving it undecided is how a field like this eventually gets
 * used as though it means something. Flagged for removal.
 */

const Journal = require('../../models/journal');
const { idOf, ROLE } = require('../actor');
const { DENY } = require('../scope');
const { CODE } = require('../errors');

const notYours = { allow: false, code: CODE.NOT_OWNER, message: 'This journal entry is not yours' };
const isOwner = ({ actor, resource }) => actor.id === idOf(resource.patientId) || notYours;

module.exports = {
  subject: 'Journal',
  locate: { from: 'params', key: 'journalId' },
  load: (id) => Journal.findById(id),

  rules: {
    'journal:update': isOwner,
    'journal:delete': isOwner
  },

  scopes: {
    'journal:list-own': ({ actor, params }) =>
      actor.role === ROLE.PATIENT && actor.id === params.patientId
        ? { patientId: actor.id }
        : DENY
  }
};
