/**
 * Enumerate every mounted route and report which ones declare no
 * authorization.
 *
 * This is the durable half of the authorization work. Fixing the four missing
 * checks was necessary but not sufficient: nothing stopped the fifth from
 * being written, and nothing would have noticed. `POST /sessions/:id/missed`
 * shipped with no ownership check and its route declaration looked exactly
 * like the neighbouring routes that had one.
 *
 * Because every middleware from authz/authorize.js carries a `__authz` tag,
 * the set of undeclared routes is computable from Express's own router stack.
 * A test asserts that set never grows (see __tests__/authz.routeCoverage.test.js),
 * so adding a route without stating its policy fails CI rather than shipping.
 */

/**
 * Express stores a mounted router's prefix as a RegExp. Recover the literal
 * prefix so output reads as real paths rather than regex source.
 */
function prefixFromLayer(layer) {
  if (layer.path) return layer.path;
  const src = layer.regexp && layer.regexp.source;
  if (!src) return '';
  if (src === '^\\/?(?=\\/|$)') return '';           // app-level mount
  const literal = src
    .replace('^', '')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\\\//g, '/')
    .replace(/\$$/, '');
  return literal.startsWith('/') ? literal : `/${literal}`;
}

/** Does any handler on this route carry an authz tag? */
function routeDeclaration(route) {
  for (const layer of route.stack || []) {
    const tag = layer.handle && layer.handle.__authz;
    if (tag) return tag;
  }
  return null;
}

/**
 * @param {import('express').Application} app
 * @returns {Array<{method:string, path:string, declared:boolean, kind:string|null, reason:string|null}>}
 */
function enumerateRoutes(app) {
  const found = [];

  function walk(stack, prefix) {
    for (const layer of stack || []) {
      if (layer.route) {
        const tag = routeDeclaration(layer.route);
        const methods = Object.keys(layer.route.methods || {})
          .filter((m) => m !== '_all')
          .map((m) => m.toUpperCase());
        for (const method of methods) {
          found.push({
            method,
            path: `${prefix}${layer.route.path}`.replace(/\/{2,}/g, '/') || '/',
            declared: !!tag,
            kind: tag ? tag.kind : null,
            reason: tag && tag.reason ? tag.reason : null,
            // The whole tag, for callers that want the action or role names
            // rather than just the kind — scripts/generate-api-doc.js. Added
            // alongside the fields above rather than replacing them, so the
            // ratchet tests that read `declared`/`kind` are untouched.
            tag: tag || null
          });
        }
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, `${prefix}${prefixFromLayer(layer)}`);
      }
    }
  }

  const root = app._router || (app.router && app.router.stack ? app.router : null);
  walk(root ? root.stack : [], '');
  return found;
}

/** `['POST /api/sessions/:sessionId/missed', ...]` for routes with no policy. */
function enumerateUndeclaredRoutes(app) {
  return enumerateRoutes(app)
    .filter((r) => !r.declared)
    .map((r) => `${r.method} ${r.path}`)
    .sort();
}

/** Human-readable coverage summary, for a boot log or a script. */
function coverageSummary(app) {
  const routes = enumerateRoutes(app);
  const declared = routes.filter((r) => r.declared);
  const byKind = declared.reduce((acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1;
    return acc;
  }, {});
  return {
    total: routes.length,
    declared: declared.length,
    undeclared: routes.length - declared.length,
    byKind
  };
}

module.exports = { enumerateRoutes, enumerateUndeclaredRoutes, coverageSummary };
