/**
 * Clinical records: session notes, reports, session reports, tasks.
 *
 * This is the highest-sensitivity data in the product — therapy notes,
 * diagnoses, homework assigned to a patient — and it had the weakest
 * authorization. Three distinct defects, all verified against the running
 * server:
 *
 * 1. CROSS-TENANT PHI READ. sessionReport.controller.js gated on
 *      `userId !== patientId && req.user.role !== 'doctor'`
 *    i.e. "any doctor may read this", not "the treating doctor may read this".
 *    An unrelated doctor retrieved a stranger's report titled
 *    "PHI: suicidal ideation notes". Fixed by requiring an actual
 *    doctor↔patient Session to exist (see authz/relations.js).
 *
 * 2. RECORD INJECTION. note/report/task creation verified that the doctor
 *    owned the *session*, then stored `patientId` from the REQUEST BODY. A
 *    doctor could file a fabricated clinical note against any patient id;
 *    the victim then saw it in their own record. Verified. Fixed with
 *    `derive`, which takes patientId from the authorized session and deletes
 *    the field from req.body so the handler cannot read the client's value.
 *
 * 3. DEFAULT-ALLOW LISTING. Every list handler built its filter as
 *      if (patient) ... else if (doctor) ... // no else
 *    so any other role got an unfiltered `{ patientId }` — the full chart,
 *    including notes flagged isPrivate. Reachable, because verifyToken also
 *    accepts the `adminToken` cookie. Fixed by scopes with `default: DENY`.
 *
 * Policy decision recorded explicitly: clinical records are NOT an
 * administrative artefact. Admins and super admins get DENY on every action
 * here. Previously they got everything, by omission rather than by decision.
 */

const Session = require('../../models/session');
const SessionNote = require('../../models/sessionNote');
const Report = require('../../models/report');
const SessionReport = require('../../models/sessionReport');
const Task = require('../../models/task');
const { idOf, ROLE } = require('../actor');
const { DENY } = require('../scope');
const { CODE } = require('../errors');
const { hasTreatedRelationship } = require('../relations');

const notYours = { allow: false, code: CODE.NOT_OWNER, message: 'This record does not belong to you' };
const doctorsOnly = { allow: false, code: CODE.WRONG_ROLE, message: 'Only the treating doctor can do this' };

/** The doctor must own the session the record is being attached to. */
const ownsSession = ({ actor, resource }) =>
  (actor.role === ROLE.DOCTOR && actor.id === idOf(resource.doctorId)) || doctorsOnly;

/** Loader for create actions: the session named in the request body. */
const loadSessionFromBody = (id) => Session.findById(id).select('patientId doctorId');

/**
 * Fields taken from the authorized session rather than the request body.
 * `authorize()` also deletes them from req.body, so a handler physically
 * cannot read the client's value even if someone later adds it back.
 */
const deriveFromSession = {
  patientId: (session) => session.patientId,
  sessionId: (session) => session._id
};

module.exports = {
  subject: 'ClinicalRecord',

  rules: {
    // ── creation: the doctor must own the session ─────────────────────────
    'note:create': ownsSession,
    'report:create': ownsSession,
    'task:create': ownsSession,
    'session-report:create': ownsSession,

    // ── single-record access ──────────────────────────────────────────────
    'report:mark-viewed': ({ actor, resource }) =>
      actor.id === idOf(resource.patientId) || notYours,

    'session-report:read': ({ actor, resource }) =>
      actor.id === idOf(resource.patientId) || actor.id === idOf(resource.doctorId) || notYours,

    'task:update': ({ actor, resource }) =>
      actor.id === idOf(resource.patientId) || actor.id === idOf(resource.doctorId) || notYours
  },

  ruleOptions: {
    'note:create': { locate: { from: 'body', key: 'sessionId' }, load: loadSessionFromBody, derive: deriveFromSession },
    'report:create': { locate: { from: 'body', key: 'sessionId' }, load: loadSessionFromBody, derive: deriveFromSession },
    'task:create': { locate: { from: 'body', key: 'sessionId' }, load: loadSessionFromBody, derive: deriveFromSession },
    'session-report:create': { locate: { from: 'body', key: 'sessionId' }, load: loadSessionFromBody, derive: deriveFromSession },

    'report:mark-viewed': { locate: { from: 'params', key: 'reportId' }, load: (id) => Report.findById(id) },
    'session-report:read': { locate: { from: 'params', key: 'reportId' }, load: (id) => SessionReport.findById(id) },
    'task:update': { locate: { from: 'params', key: 'taskId' }, load: (id) => Task.findById(id) }
  },

  scopes: {
    // ── session notes ─────────────────────────────────────────────────────
    'note:list-by-patient': ({ actor, params }) => {
      switch (actor.role) {
        case ROLE.PATIENT:
          // Own chart only, and never a note the doctor marked private.
          return actor.id === params.patientId ? { patientId: params.patientId, isPrivate: false } : DENY;
        case ROLE.DOCTOR:
          // Only notes this doctor authored. This also makes a separate
          // treating-relationship check unnecessary: a doctor who never
          // treated this patient authored nothing, so the scope is empty.
          return { patientId: params.patientId, doctorId: actor.id };
        default:
          return DENY;
      }
    },

    'note:list-by-session': ({ actor, params }) => {
      switch (actor.role) {
        case ROLE.PATIENT: return { sessionId: params.sessionId, patientId: actor.id, isPrivate: false };
        case ROLE.DOCTOR: return { sessionId: params.sessionId, doctorId: actor.id };
        default: return DENY;
      }
    },

    'note:list-by-doctor': ({ actor, params }) =>
      actor.role === ROLE.DOCTOR && actor.id === params.doctorId ? { doctorId: actor.id } : DENY,

    // ── doctor-authored reports ───────────────────────────────────────────
    'report:list-by-patient': ({ actor, params }) => {
      switch (actor.role) {
        case ROLE.PATIENT:
          return actor.id === params.patientId
            ? { patientId: params.patientId, isSharedWithPatient: true }
            : DENY;
        case ROLE.DOCTOR:
          return { patientId: params.patientId, doctorId: actor.id };
        default:
          return DENY;
      }
    },

    'report:list-by-doctor': ({ actor, params }) =>
      actor.role === ROLE.DOCTOR && actor.id === params.doctorId ? { doctorId: actor.id } : DENY,

    // ── session reports (the parallel legacy system) ──────────────────────
    /**
     * The C-04 fix. A patient sees their own shared reports; a doctor sees a
     * patient's reports only if a Session actually links them. Previously any
     * doctor could read any patient's reports.
     */
    'session-report:list-by-patient': async ({ actor, params }) => {
      if (actor.role === ROLE.PATIENT) {
        return actor.id === params.patientId
          ? { patientId: params.patientId, isSharedWithPatient: true }
          : DENY;
      }
      if (actor.role === ROLE.DOCTOR) {
        const treats = await hasTreatedRelationship(actor.id, params.patientId);
        return treats ? { patientId: params.patientId } : DENY;
      }
      return DENY;
    },

    // ── tasks ─────────────────────────────────────────────────────────────
    'task:list-by-patient': ({ actor, params }) => {
      switch (actor.role) {
        case ROLE.PATIENT: return actor.id === params.patientId ? { patientId: params.patientId } : DENY;
        case ROLE.DOCTOR: return { patientId: params.patientId, doctorId: actor.id };
        default: return DENY;
      }
    },

    'task:list-by-doctor': ({ actor, params }) =>
      actor.role === ROLE.DOCTOR && actor.id === params.doctorId ? { doctorId: actor.id } : DENY
  }
};
