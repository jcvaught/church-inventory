# Jobs Hub audit — verification plan (E2E + UAT)

_Created 2026-05-22. Follow-up to the audit-backlog remediation — see
`docs/CHANGELOG.md` (2026-05-22) and `docs/JOBS-HUB-AUDIT-2026-05-22.md`._

## Why this exists

The 10 Medium + 9 Low audit backlog shipped and the existing E2E suite stayed
green (40/1/0) — that proves the core flows didn't regress, and the waiver
Modal is covered (the 3 `compliance.spec.js` waiver tests were rewritten for
it). But **most of the 19 fixes have no test that proves the new behavior
works.** This plan closes that gap in two parts:

- **Part 1 — E2E tests to add** (deterministic; security boundaries especially).
- **Part 2 — UAT manual checklist** (visual / SMS / background-job items that
  can't be meaningfully automated).

Status: **NOT STARTED.** Execute Part 1 (write the tests), then run Part 2.

---

## E2E harness facts (for whoever implements Part 1)

- Playwright, in `e2e/`. Runs against **production** — there is no Firebase
  emulator. Tests clean up after themselves via `purgeE2EArtifacts()` (deletes
  any job/announcement/accessPeople doc whose title starts with `[E2E]`).
- Helpers in `e2e/admin-helpers.js` (`createJob`, `createAccessPerson`,
  `getJobSignups`, `seedSignup`, `e2eTitle`, `uids`, `daysFromNowStr`, …).
- Three roles via fixtures (`e2e/firebase-fixtures.js`): `adminPage`,
  `memberAPage`, `memberBPage`.
- Run: `E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e`.
- **Rule-rejection technique:** Admin SDK bypasses rules, so a rule test must
  do a *client-SDK* write as an authenticated browser user. Use
  `page.evaluate(...)` to run an `addDoc`/`updateDoc` against the app's
  already-initialized Firebase (`window`-exposed `db`, or import within the
  evaluate) and assert the promise rejects with `permission-denied`. Check
  whether a helper for this already exists before hand-rolling it; if the app
  doesn't expose `db` on `window`, add a tiny dev-only hook or drive the write
  through a page that already does it.

---

## Part 1 — E2E tests to add

Target ~8 tests. Put rule-rejection tests in a new
`e2e/authenticated/audit-rules.spec.js`; UI assertions can extend existing
spec files.

### T1 — M7: `jobAnnouncements` identity fields are immutable
- As **admin**, create an announcement (UI or `createJob`-style helper).
- Client-SDK `updateDoc` that changes `createdBy` → **expect `permission-denied`**.
- Control: a normal edit (change `title`/`body` only) → **succeeds**.

### T2 — L6: `publicRequests` create is bounded
- Unauthenticated client-SDK `addDoc` to `churches/{cid}/publicRequests` with:
  (a) an extra/disallowed key, (b) `itemDescription` > 2000 chars, (c) missing
  `name` → **each expect rejection**.
- Control: a valid submission via `PublicRequestPage` → **succeeds** (there may
  already be coverage — confirm; if not, add one happy-path check).

### T3 — L4: `jobSwapRequests` create is pinned
- As **member A**, client-SDK `addDoc` to `jobSwapRequests` with:
  (a) `name` ≠ the member's real user-doc name, (b) `note` > 1000 chars,
  (c) an extra key → **each expect rejection**.
- Control: the normal swap-request flow via the UI already passes
  (`edge-cases.spec.js` "Member can create a swap request") — no new control
  needed, just confirm it still passes.

### T4 — M10: `getPublicJobs` truncates free text
- Seed a job with a `description` > 280 chars and `location` > 160 chars.
- Load `PublicJobsPage` (`?jobs=…`) or call the `getPublicJobs` callable.
- **Assert** the returned `description` is truncated and ends with `…`; same
  for `location`. Can extend `e2e/authenticated/public-board.spec.js`.

### T5 — M13: `requiredAccessTypes` badge shows on the job card
- Seed a job with `requiredAccessTypes: ['background_check']`.
- On the Job Board, **assert** the job card shows a "Background Check required"
  badge (🔒).

### T6 — M13: status badge is capitalized in the schedule
- Seed an `open` job. Open the **Schedule** tab.
- **Assert** the status pill text is "Open" (capitalized), not "open" — guards
  the `JobStatusBadge` reuse in `DesktopScheduleRow`.

### T7 — M9: destructive actions are grouped in a "Danger zone"
- As **admin**, open a recurring job's detail.
- **Assert** a "Danger zone" label is present and the Delete / Delete This +
  Future / Delete Series buttons sit in that group (separate from Edit).

### T8 — L9: recurring setup previews the actual dates
- Open the **Post Job** modal, tick **Recurring series**, pick a frequency and
  a series end date.
- **Assert** the preview lists real dates (e.g. matches a date pattern), not
  only the "This will create N jobs" count.

### T9 (optional, lower priority) — L9: email-suppression tab renders
- Owner-only. As the owner account, Settings → owner panel → **Email** tab →
  click **Load** → **assert** the suppressions list (or "No suppressed
  addresses") renders without error.

> Not worth automating: M2 (separate SMS stamp), M6 (twilioInbound STOP/START),
> M12 (scheduled scan), L1/L2/L3 — webhook/scheduled/infra code. Covered by
> Part 2 + the one-time probes already done (webhook IAM curl-probed).

After adding tests: `npm run lint` (0 errors) and run the full suite —
expect **40 + new** passed. Update `docs/CHANGELOG.md`.

---

## Part 2 — UAT manual checklist

Run on a real device where noted. Tick each; note anything off.

### Visual / accessibility
- [ ] **M8 contrast** — open a page with muted text (empty states,
  placeholders, calendar off-month days, leaderboard footnotes). The light-gray
  text should look clearly readable (it was darkened `#8B93A1`→`#6B7280`).
- [ ] **M9 destructive buttons** — on a phone (or a narrow window), open a
  recurring job's detail as admin. Delete / Delete This+Future / Delete Series
  sit in a separate **"Danger zone"** row, not next to Edit — hard to mis-tap.
- [ ] **M13 clarity** — job detail shows a readable time (e.g. "2:30 PM", not
  "14:30"); status badges read "Open/Closed/Completed/Cancelled" and a hover
  explains each; a job card with a required credential shows a 🔒 badge.
- [ ] **L7 PWA icon** — install the app on an Android phone; the icon is not
  cropped or badly letterboxed (icons were regenerated full-bleed).
- [ ] **L8 touch** — with a screen reader / VoiceOver, the 🔁 recurring chip
  and the export/print buttons announce a meaningful label.

### Waiver & sharing
- [ ] **L9 waiver Modal** — sign up for a job that requires a waiver. A proper
  window shows the full waiver text; "Agree & Sign Up" is disabled until the
  "I have read and agree" checkbox is ticked; Cancel = no signup.
- [ ] **M10 PII warnings** — posting a job shows the "title/description/
  location are public" note under the description; clicking **Share Board**
  shows a confirm warning before the link copies.

### SMS (needs real phones)
- [ ] **M6 — opted-in user** — from a phone that previously enabled SMS
  reminders: text **STOP** → reminders stop; text **START** → reminders resume.
- [ ] **M6 — never-opted-in user (the real test)** — from a phone/account that
  has **never** turned on SMS reminders, text **START** → it must **NOT**
  enable reminders (no `smsConsentAt` ⇒ ignored). This is the recycled/family-
  number protection.
- [ ] **M2** — the morning after a job, confirm signed-up users got the
  reminder once on each channel (no duplicate texts). Cross-check function logs
  for separate `lastReminderSentDate` / `lastSmsReminderSentDate` stamps.

### Background jobs (ops spot-check, not UAT)
- [ ] **M12** — after `sendTaskDueReminders` next runs (Mon 8am Central), check
  Cloud Function logs: no errors, scan bounded (90-day floor + limit).
- [ ] **L1/L3** — `closePastJobs` and `sendJobCancelledEmails` logs look clean
  on their next runs.

### Owner tool
- [ ] **L9 email suppressions** — Settings → owner panel → **Email** tab →
  Load. Suppressed addresses list; "Re-subscribe" flips one to Active (only do
  this with the recipient's consent).

---

## On completion

When Part 1 is written and Part 2 is run clean, delete this file (or mark it
DONE at the top) and note it in `docs/CHANGELOG.md`. The audit itself
(`JOBS-HUB-AUDIT-2026-05-22.md`) is already closed — this is verification
hardening on top.
