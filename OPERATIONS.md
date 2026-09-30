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
2. They have set a price (their own Settings → Pricing)
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

Razorpay can reject or fail a refund. The session is left as `refund_failed` and
**nobody is chased automatically** — it needs a person. Check Super Admin →
Revenue for failed refunds and retry, or refund from the Razorpay dashboard
directly. See Known Issues: there are three of these outstanding.

---

## Instant sessions

A patient can book a therapist who is online right now. The therapist gets a
ring on their dashboard and has **2 minutes** to accept before the session is
cancelled and the patient refunded automatically.

If the therapist's browser was not open, the request is not lost — it appears
when they next open the dashboard, as long as it is still within the window.
A missed request only counts against a therapist's record if it actually
reached them.

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

## Known issues

Written down rather than remembered. None of these are new; all are things a
person has to decide about.

**Three refunds are stuck, ₹1,500 total.** From July 2026, all with a real
payment id and no refund id — the Razorpay call failed and nothing retried.
The patients have not had their money back. Retry them or refund in the
Razorpay dashboard.

**39 of 52 historical paid sessions have no commission split recorded.** They
predate the split logic, so the ledger has nothing to pay from and they cannot
be included in a payout. If money is genuinely owed on them it must be settled
by hand.

**Razorpay is in test mode.** See above.

**Render is on the free plan.** The server sleeps after ~15 minutes idle, so the
first visitor waits 30–60 seconds — and while it is asleep the scheduled jobs do
not run: session reminders, no-show refunds, instant-request expiry, and
clawback reconciliation all pause. Move to a paid plan before real traffic.

**Render does not auto-deploy.** Pushing to `main` deploys the frontend but not
the backend, so the two can end up on different versions. Deploy the server
manually from the Render dashboard, or turn Auto-Deploy on there.

**DLA-20 is not built.** The assessment is accepted by the API but has no
questions on the client, so it cannot be taken. The tile that used to advertise
it has been removed.

**Two known defects in the payment path**, neither currently causing harm but
both worth fixing: the payment-verify and webhook handlers can both process the
same payment and send two confirmation emails; and the auto-cancel path records
a refund without a refund id, which bypasses a consistency check the rest of the
system relies on.
