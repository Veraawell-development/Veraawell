/**
 * Session permissions.
 *
 * Replaces four hand-written party checks that had drifted into three
 * different idioms, plus one that was missing entirely:
 *
 *   cancelSession    session.patientId.toString() !== userId
 *   completeSession  session.patientId?._id?.toString() !== userId
 *   getSessionById   session.patientId?._id?.toString() || session.patientId?.toString()
 *   missedSession    (nothing)
 *
 * The idioms differed because each handler fetched with a different
 * `.populate()` shape, so each needed a different way to reach the id. The
 * loader below normalizes that once and `idOf` handles both shapes, so the
 * predicates can be written once and read plainly.
 */

const Session = require('../../models/session');
const { idOf, ROLE } = require('../actor');
const { DENY } = require('../scope');
const { CODE } = require('../errors');

const patientOf = (s) => idOf(s.patientId);
const doctorOf = (s) => idOf(s.doctorId);

const isPatient = (actor, s) => !!actor.id && actor.id === patientOf(s);
const isDoctor = (actor, s) => !!actor.id && actor.id === doctorOf(s);
const isParty = (actor, s) => isPatient(actor, s) || isDoctor(actor, s);

const notParticipant = {
  allow: false,
  code: CODE.NOT_PARTICIPANT,
  message: 'You are not a participant in this session'
};

module.exports = {
  subject: 'Session',
  locate: { from: 'params', key: 'sessionId' },
  load: (id) => Session.findById(id),

  rules: {
    'session:read': ({ actor, resource }) => isParty(actor, resource) || notParticipant,
    'session:join': ({ actor, resource }) => isParty(actor, resource) || notParticipant,
    'session:cancel': ({ actor, resource }) => isParty(actor, resource) || notParticipant,
    'session:complete': ({ actor, resource }) => isParty(actor, resource) || notParticipant,

    // Doctor-side controls on the immediate ring/answer flow.
    'session:accept': ({ actor, resource }) =>
      (actor.role === ROLE.DOCTOR && isDoctor(actor, resource)) || notParticipant,
    'session:delay': ({ actor, resource }) =>
      (actor.role === ROLE.DOCTOR && isDoctor(actor, resource)) || notParticipant,

    /**
     * "The doctor never answered" — cancels the session and refunds the patient.
     *
     * This previously had NO authorization check of any kind. Verified against
     * the running server: an unrelated authenticated account cancelled a
     * stranger's paid session and triggered its refund (HTTP 200, status
     * 'cancelled', paymentStatus 'refunded'), and incremented the doctor's
     * cancellation counter, which feeds a reputation warning at 3.
     *
     * Only the patient may declare their own doctor a no-show. The doctor has
     * accept/delay for their side, and the scheduler sweep handles the case
     * where the patient closes the tab.
     */
    'session:mark-missed': ({ actor, resource }) =>
      isPatient(actor, resource) || {
        allow: false,
        code: CODE.NOT_PARTICIPANT,
        message: 'Only the patient of this session can report it as missed'
      },

    // Live-call surface. Used by the socket registrar for state-changing
    // events; high-frequency signaling uses the cheaper room-membership check.
    'session:signal': ({ actor, resource }) => isParty(actor, resource) || notParticipant,
    'session:end-call': ({ actor, resource }) => isParty(actor, resource) || notParticipant,

    // Resourceless: depends only on who is asking.
    'session:book': ({ actor }) =>
      actor.role === ROLE.PATIENT || {
        allow: false, code: CODE.WRONG_ROLE, message: 'Only patients can book sessions'
      },

    'session:read-emergency-contact': ({ actor, resource }) =>
      (actor.role === ROLE.DOCTOR && isDoctor(actor, resource)) || notParticipant
  },

  ruleOptions: {
    'session:book': { resourceless: true }
  },

  scopes: {
    /**
     * "My sessions" for the eight list endpoints that each rebuilt this
     * expression inline as `role === 'patient' ? {patientId} : {doctorId}` —
     * a form in which an admin-realm token silently became `{doctorId: <admin>}`.
     * Neither admins nor anonymous callers have a "my sessions" list.
     */
    'session:list-own': ({ actor }) => {
      switch (actor.role) {
        case ROLE.PATIENT: return { patientId: actor.id };
        case ROLE.DOCTOR: return { doctorId: actor.id };
        default: return DENY;
      }
    }
  }
};
