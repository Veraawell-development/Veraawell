# Session rules

The business rules for lateness, absence, ending and refunds. The code that
applies them is `server/services/sessionPolicy.js` (pure functions, tested in
`server/__tests__/sessionPolicy.test.js`); attendance is recorded by
`server/services/attendance.js`.

## Decisions

| ID | Rule |
|----|------|
| D1 | **10-minute grace.** Not in the call by start + 10 min ⇒ absent. |
| D2 | **Late start.** A late patient loses the minutes (the session ends on time). A late doctor does not cost the patient any: the session ends at the doctor's first join + the booked minutes. |
| D3 | **Waiting alone.** If the doctor never came, or came and left and hasn't returned, and the patient has waited on their own for 10 minutes, the patient may **leave with a full refund** or **keep waiting**. If they wait and the doctor comes, they get their full minutes. Counted against the doctor. |
| D4 | **Nobody came** ⇒ full automatic refund; doctor not paid; counted against the doctor. |
| D5 | **Patient cancels within 4 hours** ⇒ no refund; the doctor is paid their share. |
| D6 | **Instant sessions:** the grace starts when the doctor accepts. |
| D7 | **Counters only.** Each doctor's late joins, no-shows and cancellations are counted and shown to admins. No automatic penalties. |
| D8 | **Ending early needs both to agree.** Leaving the call never ends or completes a session. |
| D10 | Rescheduling is not offered. |
| D11 | Doctors can cancel; the patient gets a full refund; counted against the doctor. |

## Outcomes

| # | What happened | Ends as | Patient's money | Doctor paid | Counted |
|---|---------------|---------|-----------------|-------------|---------|
| S1 | Both on time | completed | charged | yes | — |
| S2 | Patient late (before the end) | completed, ends on time | charged | yes | — |
| S3 | Patient never came, doctor in by T+10 | no-show (patient) | charged | yes | — |
| S4 | Doctor late ≤ 10 min | completed, full minutes | charged | yes | — |
| S5 | Doctor > 10 min late, patient takes the refund | cancelled | full refund | no | late |
| S6 | Doctor > 10 min late, patient waits, doctor joins | completed, full minutes | charged | yes | late |
| S7 | Doctor never came | no-show (doctor) | full refund, automatic | no | no-show |
| S8 | Nobody came | no-show | full refund, automatic | no | no-show |
| S9 | Someone leaves while alone | nothing ends | unchanged | — | — |
| S10 | Patient cancels > 4 h before | cancelled | full refund | no | — |
| S11 | Patient cancels ≤ 4 h before | cancelled | no refund | yes (doctor's share) | — |
| S12 | Doctor cancels | cancelled | full refund | no | cancel |
| S13 | Instant request unanswered / delay ran out | cancelled | full refund, automatic | no | — |
| S14 | Payment window closed / payment failed | checkout cancelled, slot freed | nothing charged; a late capture is refunded | — | — |
| S15 | The call failed because of us | support reviews | manual refund | — | — |
| S16 | Both agree to end early | completed | charged | yes | — |

## Edge cases

| ID | Situation | Result |
|----|-----------|--------|
| E1 | Patient absent at T+10, doctor present | Patient no-show; the doctor may leave and is still paid. |
| E2 | Patient arrives after the doctor waited and left | "Your therapist waited 10 minutes. This session counts as missed." No refund. |
| E3 | Doctor joins within the grace | Not counted late; the patient still keeps their full minutes. |
| E4 | Doctor leaves mid-session and doesn't return | After 10 minutes alone the patient gets the D3 choice. |
| E5 | Patient leaves early | The session runs to its end; completed; doctor paid. |
| E6 | Both leave early without agreeing | The call stays open until the end; completed. |
| E7 | A short drop (< 10 min) | Nothing happens. |
| E8 | Both join early | They can talk; the end doesn't change. |
| E9 | Instant: doctor accepts but doesn't join within 10 minutes | D3 applies from the accept. |
| E10 | Patient keeps waiting and the doctor never comes | Doctor no-show at the end: automatic full refund. |
| E11 | Doctor joins only after the grace, patient never comes | Patient no-show (doctor paid), and the doctor is counted late. |
| — | Both joined but were never in the call at the same time | Decided by who was there within the grace: doctor yes, patient no ⇒ patient no-show; doctor no ⇒ doctor no-show (refund); both yes ⇒ completed. |
