# Working on this codebase

Read this before your first change. It is short, and it is mostly about four
mechanisms that will fail your build for reasons that are not obvious if you
have not met them. They exist because each one was added after something went
wrong in production.

```
cd server && npm install && npm run dev     # needs server/.env — copy example.env
cd client && npm install && npm run dev     # proxies /api to localhost:5001
```

Before pushing:

```
cd server  && npm test && npm run test:tz
cd client  && npx tsc -b && npm run build && npm run test:unit
```

**There is no CI yet**, so those commands are the only thing standing between a
mistake and production. Run them.

---

## 1. Authorization is declared on the route line

Not inside the handler. A route looks like this:

```js
router.post('/:sessionId/accept', verifyToken,
  authorize('session:accept', { load: withPartyNames }), s.acceptSession);
```

The rules live in `server/authz/policies/`. The point is that a missing check is
*visible* — `POST /:sessionId/missed` once had none, and its route line looked
exactly like its neighbours that did. Any authenticated account could cancel and
refund any session by id.

`server/authz/UNDECLARED.js` lists routes that predate this convention. **It is
a ratchet: it may only shrink.** A new route that declares nothing fails
`__tests__/authz.routeCoverage.test.js`, and adding it to the list is not the
fix.

Where a handler is self-scoped by `req.actor.id` and has no addressable
other-user resource, a role gate is the whole policy — `requireRole('doctor')`
is enough. See `server/routes/payouts.js`.

## 2. Session state moves through `applyTransition`

`server/services/sessionState.js` is a transition table over `status` ×
`paymentStatus`. `applyTransition` is the only sanctioned way to move either,
because it is a compare-and-set and it checks invariants — a refund needs a real
payment id, `refunded` needs a refund id and a non-zero amount.

Assigning the fields and calling `session.save()` bypasses all of it, and a
direct save is how a session ended up `refunded` with no refund ever issued.

`__tests__/e2e/concurrency.test.js` pins the number of call sites deliberately,
so converting another path shows up as a visible, intentional change. If that
test fails because you converted one, bump the number and name the new site.

## 3. Public responses are an allowlist

`PUBLIC_DOCTOR_FIELDS` in `server/models/doctorProfile.js` is the list of fields
that may leave through a public or patient-facing endpoint. Everything else is
invisible by default.

This matters because `GET /api/sessions/doctors` once returned the whole
document and published every therapist's commission terms and payout plumbing,
unauthenticated. Bank account numbers and signatures now live on that same
model.

**Adding a field to the schema is safe. Adding its name to that list is the
decision.** `__tests__/e2e/publicExposure.test.js` asserts no forbidden key
appears in a public response — it tests the property, not the list, so it keeps
holding as the schema grows.

## 4. Coverage is a ratchet, not a target

`__tests__/support/COVERAGE_FLOOR.json` records per-file coverage. It may only
rise. If you change a file and its coverage drops, the build fails.

```
npm run test:coverage                       # check
node scripts/check-coverage.js --update     # re-record, after a green run
```

Only re-record from a **fully green, single** run. Two coverage runs at once
write the same directory and produce confident-looking nonsense.

---

## Things that will waste your afternoon

**`client/.env` is gitignored, so the deployed build only sees what Vercel's
dashboard provides.** `VITE_RAZORPAY_KEY_ID` is the only client variable, and it
must match the server's Razorpay key — a mismatch opens checkout and then
rejects the payment. Works perfectly on localhost, fails only in production.

**`client/src/config/api.ts` hardcodes the API host off `window.location.hostname`.**
Anything that is not literally `localhost` talks to production — including every
Vercel preview deployment.

**The auth cookie domain is hardcoded `.veraawell.com`.** The API must be served
from a host under that domain or browsers silently drop every cookie and nobody
stays logged in.

**The API contract is generated, not written.** `server/docs/api.json` lists
every mounted route with the exact policy that guards it. Regenerate it after
adding or moving a route:

```
cd server && npm run docs:api
```

It is derived from Express's own router stack, so it cannot describe a route
that does not exist — but it also cannot describe request or response bodies.
For those, read the controller named on the route line.

**`server/example.env` is the authoritative environment reference**, not the
README. `render.yaml` lists every variable the server reads, including optional
ones, so a new environment cannot be provisioned with a silently missing key.

**The `/data` socket is shared app-wide.** `socket.off('event')` without a
handler reference removes *every* component's listener for that event. Always
pass the handler.

---

## Tests

42 suites, ~720 tests. `npm test` runs under `TZ=UTC`; `npm run test:tz` runs
the whole suite again under `America/Los_Angeles`, because timezone bugs here
are the kind that only appear for some users at some hours.

Some tests are **characterisation tests** — they assert current behaviour
including behaviour that is wrong, with a comment saying so. If one fails
because you fixed the thing it describes, convert it to a regression test rather
than deleting it. That is the record of why the bug existed.

Write the test that fails against the old code. A test that passes before your
fix is not testing your fix.
