/**
 * The permission table: every `resource:action` the app supports, in one place.
 *
 * Policies are registered eagerly at require time and looked up by name, so a
 * typo in `authorize('sesion:cancel')` fails at BOOT with a list of valid
 * actions, not at 3am when a patient tries to cancel.
 */

const { ForbiddenError, CODE } = require('./errors');

/** action -> { subject, rule, locate, load, derive } */
const rules = new Map();
/** action -> { subject, scope } */
const scopes = new Map();

/**
 * @param {object} policy
 * @param {string} policy.subject          e.g. 'Session'
 * @param {object} [policy.locate]         { from: 'params'|'body'|'query', key: string }
 * @param {function} [policy.load]         (id) => Promise<doc|null>
 * @param {object} [policy.rules]          action -> ({actor, resource, req}) => boolean
 * @param {object} [policy.ruleOptions]    action -> { locate?, load?, derive?, resourceless? }
 * @param {object} [policy.scopes]         action -> ({actor, params, query, req}) => filter|DENY
 */
function register(policy) {
  const { subject, rules: ruleMap = {}, scopes: scopeMap = {}, ruleOptions = {} } = policy;
  if (!subject) throw new Error('authz: policy is missing `subject`');

  for (const [action, rule] of Object.entries(ruleMap)) {
    if (rules.has(action)) throw new Error(`authz: duplicate rule for action "${action}"`);
    if (typeof rule !== 'function') throw new Error(`authz: rule for "${action}" must be a function`);
    rules.set(action, {
      subject,
      rule,
      locate: (ruleOptions[action] && ruleOptions[action].locate) || policy.locate || null,
      load: (ruleOptions[action] && ruleOptions[action].load) || policy.load || null,
      derive: (ruleOptions[action] && ruleOptions[action].derive) || null,
      // A resourceless action is one whose answer needs no document — e.g.
      // 'session:book' depends only on the actor's role.
      resourceless: !!(ruleOptions[action] && ruleOptions[action].resourceless)
    });
  }

  for (const [action, scope] of Object.entries(scopeMap)) {
    if (scopes.has(action)) throw new Error(`authz: duplicate scope for action "${action}"`);
    if (typeof scope !== 'function') throw new Error(`authz: scope for "${action}" must be a function`);
    scopes.set(action, { subject, scope });
  }
}

/**
 * Policies must be registered before the first lookup, whatever the entry
 * point. Loading them only from authz/index.js was not enough: authz/socket.js
 * requires ./can directly, so the socket namespaces reached an empty registry
 * and every policy-mode event failed with "unknown action" — which surfaced to
 * the client as a generic internal error rather than a denial.
 *
 * Lazy rather than at module load, because the policy modules require Mongoose
 * models and this module is itself required by them transitively in some
 * orders. Policy files never require the registry, so there is no cycle.
 */
let loaded = false;
function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  loadPolicies();
}

function getRule(action) {
  ensureLoaded();
  const entry = rules.get(action);
  if (!entry) {
    throw new Error(
      `authz: unknown action "${action}". Registered actions: ${[...rules.keys()].sort().join(', ')}`
    );
  }
  return entry;
}

function getScope(action) {
  ensureLoaded();
  const entry = scopes.get(action);
  if (!entry) {
    throw new Error(
      `authz: unknown scope action "${action}". Registered scopes: ${[...scopes.keys()].sort().join(', ')}`
    );
  }
  return entry;
}

function hasRule(action) { ensureLoaded(); return rules.has(action); }
function hasScope(action) { ensureLoaded(); return scopes.has(action); }
function listActions() { ensureLoaded(); return [...rules.keys()].sort(); }
function listScopes() { ensureLoaded(); return [...scopes.keys()].sort(); }

/**
 * Evaluate a rule. A rule may return a boolean, or an object
 * `{ allow: false, code, message }` when the specific reason matters to the
 * caller (e.g. "not a participant" vs "wrong role").
 *
 * Async because some rules are relationship checks that must hit the database
 * — "is this doctor treating this patient?" cannot be answered from the
 * request alone. Sync rules still work: `await` on a non-promise is a no-op.
 */
async function evaluate(entry, context) {
  const verdict = await entry.rule(context);
  if (verdict === true) return { allowed: true };
  if (verdict === false || verdict == null) {
    return { allowed: false, error: new ForbiddenError(CODE.FORBIDDEN) };
  }
  if (typeof verdict === 'object' && verdict.allow === true) return { allowed: true };
  return {
    allowed: false,
    error: new ForbiddenError(
      (verdict && verdict.code) || CODE.FORBIDDEN,
      (verdict && verdict.message) || undefined
    )
  };
}

/** Load every policy module. Called once from authz/index.js. */
function loadPolicies() {
  loaded = true;
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, 'policies');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).sort()) {
    if (file.endsWith('.policy.js')) register(require(path.join(dir, file)));
  }
}

module.exports = {
  register, ensureLoaded, getRule, getScope, hasRule, hasScope,
  listActions, listScopes, evaluate, loadPolicies,
  _rules: rules, _scopes: scopes
};
