#!/usr/bin/env node
/**
 * Write docs/api.json from the routes the app actually mounts.
 *
 *   npm run docs:api
 *
 * Generated, never hand-edited. The previous API document was a .tex file that
 * went stale the moment the next route was added, and by the time anyone
 * looked it described an app that no longer existed. This reads Express's own
 * router stack through authz/audit.js — the same enumeration the authorization
 * ratchet uses — so it cannot describe a route that is not there, or miss one
 * that is.
 *
 * What it can state precisely: the path, the method, and who is allowed to
 * call it, because every authz middleware carries a __authz tag. What it
 * cannot infer is request and response bodies; those are marked accordingly
 * rather than guessed at.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const app = require('../app');
const { enumerateRoutes } = require('../authz/audit');

/** Group by the first two path segments, so the file reads by feature. */
function groupOf(p) {
  const parts = p.split('/').filter(Boolean); // ['api', 'admin', 'payments', ...]
  if (parts[0] !== 'api') return 'other';
  if (parts[1] === 'admin') return `admin/${parts[2] || ''}`.replace(/\/$/, '');
  return parts[1] || 'root';
}

/** Who may call this, in words, from the declared policy plus the middleware. */
function access(route) {
  if (!route.declared) return 'undeclared — see authz/UNDECLARED.js';
  const t = route.tag || {};
  switch (t.kind) {
    case 'public':
      return t.reason ? `public — ${t.reason}` : 'public';
    case 'role':
      return `role: ${(t.roles || []).join(' or ') || 'restricted'}`;
    case 'scope':
      return `scoped: ${t.action}`;
    case 'rule':
      return `policy: ${t.action}`;
    default:
      return t.kind || 'declared';
  }
}

const routes = enumerateRoutes(app)
  .filter((r) => r.path.startsWith('/api'))
  .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

const groups = {};
for (const r of routes) {
  const g = groupOf(r.path);
  (groups[g] = groups[g] || []).push({
    method: r.method,
    path: r.path,
    access: access(r)
  });
}

const doc = {
  name: 'Veraawell API',
  baseUrl: 'https://api.veraawell.com',
  generatedFrom: 'the mounted Express router — regenerate with: npm run docs:api',
  generatedAt: new Date().toISOString().slice(0, 10),
  notes: [
    'Auth: an httpOnly `token` cookie, or `Authorization: Bearer <jwt>`. Admin routes use a separate realm and a separate secret.',
    'Mutating requests (POST/PUT/PATCH/DELETE) require an `X-CSRF-Token` header; fetch the value from GET /api/csrf-token. Exempt: /api/auth/*, /api/admin/auth/*, /api/payments/webhook, /api/upload/doctor-document.',
    'Request and response bodies are not listed: they are not inferable from the router. Read the controller named on the route line.',
    '"undeclared" means the route predates the authz convention and is grandfathered in authz/UNDECLARED.js, which may only shrink. It does not mean unauthenticated.'
  ],
  routeCount: routes.length,
  groups
};

const out = path.join(__dirname, '..', 'docs', 'api.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);

const undeclared = routes.filter((r) => !r.declared).length;
console.log(`Wrote ${path.relative(process.cwd(), out)} — ${routes.length} routes in ${Object.keys(groups).length} groups (${undeclared} undeclared).`);
process.exit(0);
