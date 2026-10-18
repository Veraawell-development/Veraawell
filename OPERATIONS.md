# Running Veraawell

Everything the platform needs a person to do, and the things that are known to
be broken or unfinished. For how the code is organised, see `README.md`; for the
rules a developer has to work within, see `CONTRIBUTING.md`.

---

## Making a therapist bookable

A therapist appears in the public directory only when **all four** of these are
true. If someone is missing from the site, this is the checklist — in practice
it is almost always the last one.

1. Their application is approved (Super Admin → Pending Doctors)
2. They have set a price (their own Settings → Pricing). A price of 0 means
   "not offered": that length/mode is hidden and cannot be booked
3. **An admin has approved their bank details** (below)
4. **They have published dates on their calendar that have not passed**

### Approving bank details

Super Admin → **Bank Details** → review → Approve.

This is the step that makes them bookable, and it is deliberately a human
decision: it is where money will be sent. **Check the account holder's name
matches the therapist.** This screen is the one place the full account number is
shown — everywhere else it is masked.

If they change their bank details later, approval is revoked automatically and
they stop being bookable until an admin approves again. That is intentional.

---

## Paying therapists — the weekly run

Money from a patient lands wholly in the platform's Razorpay account. The
therapist's share is paid separately, by bank transfer, once a week. Nothing
moves money automatically; every transfer is made by a person.

**Cycle:** Monday–Sunday, paid the following **Tuesday** — which gives
Razorpay's ~T+2 settlement time to land before you pay out.

### Each Tuesday

Super Admin → **Weekly Payouts**

1. **Generate drafts.** Creates one payout per therapist for the closed week.
2. **Review.** Each row shows sessions, gross, commission, adjustments, net
   payable, and the bank account. A therapist flagged **Not approved** has no
   approved bank details — resolve that before paying them.
3. **Lock.** Fixes the amount. Until a payout is locked its figures can still
   move; after locking they cannot.
4. **Make the transfer yourself**, from your bank, to the account shown.
5. **Mark Paid** and enter the **UTR** from your bank. The therapist then sees
   the payment in their own history.

A therapist's dashboard figure and the payout figure come from the same
definition of a payable session, so they should always agree. If they do not,
that is a bug worth reporting, not a rounding difference.

### What counts as payable

Paid, not refunded, the session happened (`completed` or `no-show`), **and the
therapist attended**. A patient who did not turn up still pays the therapist. A
therapist who did not turn up does not get paid, and the patient is refunded
automatically.

### Commission

Currently **20%** platform / 80% therapist, set in Super Admin. It can be
overridden per therapist. The split is calculated and frozen onto each session
when it is booked, so changing the rate never alters past sessions.

---

## Refunds

Patients are refunded automatically according to the published policy:

| When | Refund |
|---|---|
| Cancelled more than 4 hours before | 100% |
| Cancelled within 4 hours | nothing |
| Therapist cancels | 100%, always |
| Therapist does not show up | 100%, automatic |

Admins can also refund manually (Super Admin → Revenue).

### Clawbacks

If a session is refunded **after** it has already been paid out to the
therapist, the platform is out of pocket. The system raises a negative
adjustment automatically and nets it off that therapist's **next** payout. You
do not need to do anything.

If their next week's earnings do not cover it, the remainder carries forward
again, week after week, until it is settled. The Weekly Payouts screen shows a
banner for anyone carrying a balance who has no sessions that week.

### When a refund fails

Razorpay can reject a refund. The session is left as `refund_failed`, with
Razorpay's reason recorded on it, and **nobody is chased automatically** — it
needs a person. Super Admin → Revenue lists failed refunds with the reason;
retry from there, or refund from the Razorpay dashboard directly — the
`refund.processed` webhook then records it and clears the failed state.

A refund interrupted mid-flight (a crash or deploy between asking Razorpay and
recording the answer) is resolved by the hourly job: it asks Razorpay whether
the refund happened before sending anything, so it cannot refund twice.

### Refunds made outside the app

A refund issued from the Razorpay dashboard is picked up by the webhook. If the
booking was still upcoming, it is cancelled and its slot freed — a refunded
booking cannot stay live.

### Payments that arrive late or twice

- A checkout unpaid after 20 minutes is expired and its slot released. Before
  expiring it, the system asks Razorpay; a payment it finds is confirmed
  instead.
- A payment captured *after* the checkout expired is refunded automatically
  (the slot may already be someone else's). The patient is told to rebook.
- A second payment against an already-paid booking is refunded automatically.
- **Check that Razorpay is set to auto-capture payments** (Dashboard →
  Settings → Payment capture). An authorised-but-uncaptured payment is
  reversed by Razorpay after a few days.

---

## Instant sessions

A patient can book a therapist who is online right now. The therapist gets a
ring on their dashboard and has **2 minutes from payment** to accept before the
session is cancelled and the patient refunded automatically.

If the therapist answers "join in N minutes" (at most 15), the deadline moves
to that time plus 3 minutes; the patient is notified. The patient may withdraw
an unanswered request at any time for a full refund.

If the therapist's browser was not open, the request is not lost — it appears
when they next open the dashboard, as long as it is still within the window.
A missed request only counts against a therapist's record if it actually
reached them and its window ran out — not when the patient withdrew early.

---

## Lateness, no-shows and ending a session

The rules are in [docs/SESSION_RULES.md](docs/SESSION_RULES.md). What the
system does on its own:

- **Ending.** A session ends when its time is up, or early when both people
  agree (one asks, the other says yes). Leaving the call never ends it; either
  person can rejoin until the end time.
- **10-minute grace.** If the therapist hasn't joined 10 minutes after the
  start — or joined, left, and the patient has waited on their own for 10
  minutes — the patient sees **Leave & get a full refund** or **Keep
  waiting**. Taking the refund cancels the session, refunds in full and counts
  a *late* against the therapist.
- **A late therapist** doesn't cost the patient minutes: the session ends at
  the therapist's join time + the booked length.
- **10 minutes after the end**, each session is decided: completed (both were
  in the call together), or a no-show. A therapist who never came, or nobody
  coming, refunds the patient in full automatically and counts a *no-show*
  against the therapist. A patient who never came is not refunded, and the
  therapist is paid.
- **A patient cancelling within 4 hours** gets no refund, and the therapist is
  paid their share in the weekly payout.
- **Counters** (late / no-show / cancelled) appear under each doctor in
  Admin → Doctors → All. Nothing happens automatically because of them.

**Rollback switch.** Setting `SESSION_RULES=v1` in Render (Environment) and
redeploying brings back the old end-of-session sweep (no refund when nobody
came, no late counters). Sessions already decided keep their result. The
ending and timer fixes stay either way.

---

## Going live with real payments

**Razorpay is in TEST mode.** The site works end to end, but a real card will be
declined and no money moves. To take real payments:

1. Complete Razorpay KYC and business activation
2. Add your settlement bank account in Razorpay
3. Put the **live** key pair into Render's environment
   (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)
4. Put the same **live** key id into Vercel as `VITE_RAZORPAY_KEY_ID`
   — it must match the server's key, or checkout opens and then rejects the
   payment
5. Create a **live** webhook in Razorpay pointed at
   `https://api.veraawell.com/api/payments/webhook`, events `payment.captured`,
   `payment.failed`, `refund.processed`, and put its secret into Render as
   `RAZORPAY_WEBHOOK_SECRET` — test and live webhooks have different secrets
6. Redeploy both

No code change is needed.

---

## Reviews

A patient's review of a session they completed is public straight away. Super
Admin can hide one by flagging or rejecting it. Platform (testimonial) reviews
still need an admin's approval before they appear.

---

## Deploying this release (October 2026)

Order matters, because Vercel deploys the client from `main` automatically and
Render does not deploy the server on its own:

1. Deploy the **server** on Render first (new server works with the old client).
2. Run the one-off cleanup that moves login sessions out of the bookings
   collection — dry run, then apply:
   `MONGO_URI=<production uri> node server/migrations/splitLoginSessions.js`
   then the same with `--apply`. Nobody is logged out by it.
3. Merge to `main` so Vercel deploys the **client**.
4. `EMAIL_USER`/`EMAIL_PASS` are no longer used (admin emails go through
   Resend); `/api/admin/auth/setup` now needs `INITIAL_ADMIN_PASSWORD` set.

---

## Known issues

Written down rather than remembered. None of these are new; all are things a
person has to decide about.

**Three refunds are stuck, ₹1,500 total.** From July 2026, all with a real
payment id and no refund id — the Razorpay call failed and nothing retried.
The patients have not had their money back. Retry them from Super Admin →
Revenue, or refund in the Razorpay dashboard (the webhook will then mark them
refunded). Their failure reason was never stored; new failures record one.

**39 of 52 historical paid sessions have no commission split recorded.** They
predate the split logic, so the ledger has nothing to pay from and they cannot
be included in a payout. If money is genuinely owed on them it must be settled
by hand.

**Razorpay is in test mode.** See above.

**Render is on the free plan.** The server sleeps after ~15 minutes idle, so the
first visitor waits 30–60 seconds — and while it is asleep the scheduled jobs do
not run: session reminders, no-show refunds, instant-request expiry, and
clawback reconciliation all pause. `.github/workflows/keepalive.yml` pings it
every 10 minutes as a stopgap (it only fits the free hours if this is the
workspace's only free service). Move to a paid plan before real traffic, then
delete that workflow.

**Both sides auto-deploy from `main`** — Vercel (client) and Render (server),
so a merge ships both within minutes. Merge only a green PR. CI
(`.github/workflows/ci.yml`) runs on every push and pull request — deploy only
a green commit.

**Secrets from the old committed `server/.env` must be rotated.** That file was
in git history from July 2025 to February 2026, and the JWT, session and admin
secrets, the Google client secret and the email password still had those
values. Rotating `JWT_SECRET`/`ADMIN_JWT_SECRET` logs everyone out once.

**DLA-20 is not built.** It has no questions on the client, and the API now
refuses submissions for it.

**Sessions refunded by the old instant-request code have no refund id.**
Before October 2026 an unanswered instant request was marked `refunded`
without recording Razorpay's refund id (and unpaid ones were marked refunded
too). New ones go through the normal refund path. The old rows are historical;
check them against the Razorpay dashboard if a patient queries one.
