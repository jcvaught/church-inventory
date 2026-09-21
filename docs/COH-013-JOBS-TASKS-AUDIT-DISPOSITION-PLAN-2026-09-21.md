# COH-013 — Jobs + Tasks hub audit: disposition and fixes

- Date: 2026-09-21
- Owner: Product owner (John)
- Implementation: Claude (DEC-2026-011)
- Reviewer: Codex (audit 2026-09-21 on the cheap profile; plan review before implementation)
- Status: **rev 3 (2026-09-21) — round 2 SHIP WITH FIXES; all fixes folded
  in.** Round 2 caught: D.1 evaluated `todayStr` outside the transaction
  callback (stale across retries/midnight); D.2 passed a `Set` to an `in`
  query and captured `requiredTypes`/`todayS` pre-transaction; A.2 used
  `exists()` on a reference and claimed "no rollback path" against
  `AGENTS.md:346`; the C overview still misstated `jobSignUp`; B.2 needed a
  uid filter before `getAll`; D.2 needed an explicit attempt bound; A.4 needed
  owner approval. See "Review history".
- Prior: rev 2 — round 1 REWORK folded in. Round 1 caught: C.1 cited a branch that does
  not exist (`jobSignUp` already gates `effectiveHasHub`, `:3569`); B.2's
  owner attribution re-creates the orphan the moment that owner is offboarded;
  D.2 was underspecified against a helper that takes whole-church arrays; plus
  five gaps (A.2 scan scoping, A.1 `bulkWriter.close()`, D.1 midnight race,
  C.2 self-withdraw, B.1 maintenance path). See "Review history".
- Prior: rev 1 — draft.
- Base commit: `34d15eb` (2026-09-21)
- Related: `docs/backlog.md` "Priority order" (DEC-2026-020, FXCC-first frame);
  COH-006 (work-item visibility); COH-007 (archiving); COH-011 (offboarding);
  COH-012 Part C (audit-log atomicity — reservation approval leg overlaps
  nothing here)

---

## Summary

Codex audited the Jobs and Tasks hubs read-only (3 bugs, 5 gaps, 5
suggestions; full output kept out of the repo). Every finding was then checked
against the code, and the ones that could be measured were measured against
FXCC production data. This plan ships **four parts** in exposure order and
re-files the rest. It builds nothing speculative: under DEC-2026-020, features
are hypotheses until FXCC asks.

| Part | Finding | Verified | FXCC exposure (measured 2026-09-21) | Size |
|---|---|---|---|---|
| A | Deleting a job orphans its `signups` / `waitlist` subcollections | yes | **474 of 551 signups, 1,176 of 1,177 waitlist docs are orphans** — all E2E residue (uids `fake-uid-N`, names "Member A Test"/"Filler N", 2026-05-22 → 06-09); no real volunteer's data | S+S |
| B | Recurring tasks: generated private tasks invisible to everyone; completion successor drops `ministry`, hours, links | yes | **zero** — 96 FXCC tasks, none with `recurrence`, 0 templates, 0 completion chains | M |
| C | Managers scoped out of Jobs via `allowedHubs` can still mutate via callables + rules | yes (narrowed to managers; admins bypass `allowedHubs` by design, `functions/index.js:1226`) | **unmeasured** — the users-collection query was denied this session; needs the owner to run it or accept the fix on principle | S |
| D | `jobSignUp` accepts a signup for a past shift until the cron closes it; waitlist eligibility checked outside the promotion transaction | yes | zero past-but-open jobs today (6 open, 44 completed) | S |

Not built (see Part E): drag-reorder last-write-wins, swap-request validation
(0 swap requests at FXCC), and Codex's five suggestions.

---

## Part A — job deletion cascade

### A.1 Cascade in the existing deletion trigger

`cleanupJobListingBacklinks` (`functions/index.js:1600`, `onDocumentDeleted`,
`retry: true`) already fires on every job delete and already owns the
"clean up what the client cannot" role. Extend it: after `runBacklinkCleanup`,
list `jobListings/{docId}/signups` and `/waitlist` and delete every doc with
a `bulkWriter`, **`await writer.close()` before returning** (the pattern at
`functions/index.js:4367-4369` — without the close the trigger reports
success before the deletes land). Firestore keeps subcollections alive after
the parent document is deleted — that is the whole reason the orphans exist —
so the listing inside the trigger sees them. Both subcollections are
Cloud-Functions-only writes (`firestore.rules:520-527`), so the Admin SDK is
the only place this can live — do **not** add a client-side recursive delete.

Error handling: `writer.onWriteError` retries up to 3 times then lets the
error propagate, so a partial failure fails the trigger and `retry: true`
re-runs it. Idempotent by construction (deleting an already-deleted doc is a
no-op), so the retry is safe.

This covers every deletion path: single delete (`useFirestore.js:1401`),
series delete (`useFirestore.js:1498`), and any future Admin-side delete — the
trigger sees all of them. No client change.

### A.2 One-off cleanup of the existing orphans

A checked-in script `functions/scripts/cleanup-orphaned-job-subdocs.mjs`
(Admin SDK, `--project church-inventory-9615c` pinned per
`feedback_firebase_project`):

1. Collection-group scan of `signups` and `waitlist`. **The Admin SDK cannot
   ancestor-scope a collection group**, so the scan is global and the script
   filters each doc by path prefix `churches/{churchId}/jobListings/` in
   code, discarding anything else (the shepherd and reservation trees have
   no `signups`/`waitlist` collections today, but the filter is what makes
   that irrelevant). Totals are small (551 + 1,177 across all churches), so
   a full scan is fine. (The measurement that produced the numbers in the
   Summary used the REST `runQuery` with `parent` + `allDescendants`, which
   *is* ancestor-scoped — the script must not assume the SDK matches.)
2. For each doc, resolve the parent job reference and check it in batches
   (`db.getAll(...refs)`, ≤ 500 per call; each returned `DocumentSnapshot`
   exposes `.exists` as a **property** — the Admin SDK has no `exists()` on a
   reference).
3. `--dry-run` (default) prints counts per church and the first 10 paths; the
   expected FXCC numbers are **474 / 1,176**. Any material deviation from those
   numbers aborts — the script must be re-measured, not run.
4. `--apply` first writes every doomed doc, with its full path and fields, to
   `functions/scripts/out/orphans-<churchId>-<timestamp>.json` — **that file
   is the backup and the rollback** (a companion `--restore <file>` re-creates
   them verbatim). Only then deletes via `bulkWriter` (`await close()`), then
   re-runs the scan and asserts 0.

This is a production data mutation, so per `AGENTS.md:346` and `:429-432` it
is **owner-executed**: Claude writes and tests the script; John runs
`--dry-run`, approves, runs `--apply`. Run FXCC first (the only church with
data), then the other five (measured 0 jobs each, so the scan should be empty
— confirm, don't assume). Validation query = the post-apply scan (0) plus a
count of *live* signups/waitlist (77 / 1) unchanged. Receipt:
`docs/COH-013-ORPHAN-CLEANUP-RECEIPT-2026-09-21.md` with before/after counts
and the backup file name.

### A.3 Tests

- `functions/test/handlers/jobDeletionCascade.test.mjs` — seed a job with two
  signups and three waitlist docs, delete it, invoke the handler, assert both
  subcollections empty and the existing backlink assertion still holds. Run
  the handler twice; second run is a no-op.
- Scan script has a `--dry-run` unit test against the emulator: seeds one
  orphan and one live signup, asserts it reports exactly the orphan.

### A.4 Deploy + verify

Deploy `cleanupJobListingBacklinks` only (`--force`, it carries
`retry: true`). Verify in production by creating a throwaway job in the e2e
tenant (`e2e-test-church`, 0 jobs — the tenant the E2E suite already mutates
and purges), signing up via the callable, deleting the job, and confirming
the subcollection is gone (REST `runQuery`, not the emulator — per
`feedback_measure_infra_claims`). Give the fresh trigger a warm-up delete
first — a newly deployed trigger does not fire immediately (CLAUDE.md
pitfall, measured 2026-09-06). This mutates production Firestore, even if
only the test tenant, so it runs with the owner's explicit go-ahead, and the
throwaway job is purged afterwards with `purgeE2EArtifacts()`.

Rollback: redeploy prior function code. The cleanup script's rollback is its
backup file (A.2 step 4).

---

## Part B — recurrence: one clone shape, one owner

Two creation paths make a task's "next cycle", and they disagree with each
other and with `addTask`:

- server `generateRecurringTemplateTasks` (`functions/index.js:3885-3919`)
- client `createNextRecurringTask` (`src/pages/hubs/WorkBoard.jsx:984-1010`)

### B.1 Shared `nextCycleFields(source)` helper

Add `src/lib/taskCycle.js` with a CJS twin `functions/lib/taskCycle.js`,
parity-tested the way `recurrence.js` and `occurrences.js` already are. It
takes a task-shaped object (a template or a completed task) and returns the
fields the successor carries:

| carried as-is | reset |
|---|---|
| `name`, `description`, `priority`, `tags`, `recurrence`, `assignees`, `notes`, `visibility`, `sharedWith`, `ministry`, `estimatedHours`, `linkedItemDocId`, `linkedTicketDocId` | `checklist` (all `done:false`), `photos: []`, `completedAt: null`, `actualHours: null`, `status: 'Backlog'`, `archived:false`, `archivedAt:null` |

`dueDate` is supplied by the caller (the two paths compute it differently:
`calculateNextDue(source.dueDate, …)` vs today). `linkedJobDocId` is **not**
carried — a job link is per-occurrence.

**Maintenance.** The client path `createNextRecurringTask` serves both board
types (`WorkBoard.jsx:996-1005` has an `isMaint` branch carrying
`linkedItem*`, `vendorId`/`vendorName`, `estimatedCost`, resetting
`actualCost`). The helper takes `type` and returns the maintenance column
set for `'maintenance'` — the existing branch, verbatim, so that path is
behaviour-preserving — and the task column set above for `'task'`. The
server generator only ever produces tasks (`type: 'task'` is hard-coded,
`functions/index.js:3888`), so it calls the helper with `'task'`. One helper,
two shapes, no third caller.

Both callers replace their inline literals with the helper + their own
`dueDate`/attribution. The uid projections (`assigneeUids`, `sharedWithUids`)
stay where they are (`addTask` and the generator's transaction) — they are the
COH-006 twin pair and must not move.

### B.2 Owner of a generated task

The generator stamps `createdBy: 'system'`, so a `private` template with no
assignee — and `getEmptyTask()` defaults new tasks to `private`
(`WorkBoard.jsx:586`) — spawns a task no uid can read: `canSeeWorkItem`
(`firestore.rules:63-70`) has no admin arm, so not even an admin can find or
delete it. A `shared` template is nearly as bad: `handleSaveTemplateSubmit`
(`WorkBoard.jsx:1518-1528`) saves `visibility` but not `sharedWith`, so the
generated task is `shared` with nobody.

Fix, in this order:

1. Templates carry their owner already (`addTaskTemplate` stamps
   `createdBy`/`createdByName`, `useFirestore.js:1023-1028`). The generator
   uses `createdBy: template.createdBy`, `createdByName: template.createdByName`,
   and adds `autoGenerated: true` for attribution. Nothing in `src/` keys on
   `createdBy === 'system'` (grep verified 2026-09-21), so the UI badge is a
   new, optional read of `autoGenerated`.
2. `handleSaveTemplateSubmit` also saves `sharedWith` (from
   `detailEdits.sharedWith ?? showDetail?.sharedWith ?? []`).
3. Server-side invariant as the last line of defence — and the part that
   round 1 showed step 1 alone does not give. A template owner who has since
   been deactivated (COH-011) or deleted still satisfies "has a `createdBy`
   uid" but can no longer read anything, so the generated task would again be
   unreachable. Before the transaction, when the computed task has
   `visibility != 'team'`, compute the **viewer set** =
   `{createdBy} ∪ assigneeUids ∪ (visibility == 'shared' ? sharedWithUids : ∅)`
   **dropping any entry that is not a non-empty string** (a template with no
   `createdBy` contributes nothing; a malformed assignee must not produce an
   invalid `users/undefined` path and crash `getAll`), then `getAll` the
   surviving `users/{uid}` docs (bounded: assignees + sharedWith are short
   lists). An empty viewer set is the "no live viewer" case below. If **no** viewer is an active member of this church
   (`churchId` matches and `active !== false`, the same predicate
   `assertActiveCaller` uses), **force `visibility: 'team'`** and log a
   Sentry warning tagged `area: 'recurrence', reason: 'orphan-averted'` with
   the template id. Rules cannot express this (they do not run for the Admin
   SDK), and "at least one live viewer" is the actual invariant, not "has an
   owner field".

   The same failure exists for *hand-made* private tasks whose creator is
   later deactivated — those become unreachable today, independent of
   recurrence. That is an offboarding gap, not a recurrence one; re-filed in
   Part E rather than solved here.

### B.3 Tests

- `functions/test/lib/taskCycle.parity.test.mjs` — ESM and CJS twins produce
  identical output on the same fixture (mirror the recurrence parity test).
- `functions/test/handlers/generateRecurringTemplateTasks.test.mjs` — a
  private, unassigned template with an active owner `u1` yields a task with
  `createdBy: 'u1'`; the same template with `u1` deactivated (`active:false`)
  yields `visibility: 'team'` plus the Sentry warning; the same with `u1`
  deactivated but an active assignee `u2` keeps `private` (u2 is a viewer);
  a template with no `createdBy` at all yields `team`; `ministry` /
  `estimatedHours` / links survive.
- `functions/test/rules/coh006-visibility.test.mjs` — add one case: a
  generated private task is readable by its template owner and by nobody
  else. (Rules already pass; this pins the contract the generator now meets.)
- Client: a small vitest for `nextCycleFields` covering the carried/reset
  table above.

### B.4 Deploy

`generateRecurringTemplateTasks` only. No rules change. No backfill — there
is nothing to backfill (0 recurring tasks, 0 templates, all churches).

---

## Part C — `allowedHubs` on Jobs mutations

`effectiveHasHub(user,'jobs')` (`functions/index.js:1224`) is the server's
one predicate for "this member may use Jobs". It is applied to every Jobs
*notification* path (`:1999`, `:3056`, `:3111`, `:3234`) and to **one** of
the four mutation callables, `jobSignUp` (`:3569`) — the other three lack it. Rules mirror it for reads (`canUseJobsHub`,
`firestore.rules:235`) but not for `update`/`delete` on `jobListings`
(`:504-518`), which gate on `isChurchAdminOrManager` alone.

Admins bypass `allowedHubs` on purpose (line 1226) — this part is about
**managers** scoped to other hubs.

### C.1 Callables

Round 1 correction: `jobSignUp` **already** gates every caller with
`effectiveHasHub(caller,'jobs')` (`functions/index.js:3569`) and has no
on-behalf branch — it is the model, not a target. Three callables lack the
gate:

- `jobWithdraw` (`:3643-3659`) — checks membership and, for `targetUid !==
  callerUid`, role. Add `effectiveHasHub` on the **on-behalf** branch only.
  **Self-withdrawal stays ungated on purpose:** a member whose Jobs access
  was removed *after* signing up must still be able to take their name off
  the roster, otherwise the only remedy is an admin removing them by hand.
  Withdrawing is cleanup, not use of the hub. (Codex round 1 flagged this as
  a gap; it is a decision, recorded here.) The inline promotion that
  self-withdraw triggers (`:3681-3693`) runs as the server, promotes someone
  *else*, and needs no caller gate.
- `jobSetAttendance` and `promoteFromWaitlist` — after the existing role
  check, add `if (!effectiveHasHub(callerSnap.data(), 'jobs')) throw new
  HttpsError('permission-denied', 'No Jobs Hub access.')` with the same
  message `jobSignUp` uses.

Volunteers (`allowedHubs: ['jobs']`, `roleHelpers.js:27-33`) pass
`effectiveHasHub` by definition; a legacy profile with no `allowedHubs`
array passes too (line 1227). Nothing here can lock out a volunteer. Test
both shapes explicitly.

### C.2 Rules

`jobListings` `update` and `delete`: `isChurchAdminOrManager(churchId) &&
canUseJobsHub(churchId)`. `create` already requires `jobsHubActive`; add the
same conjunct there for symmetry. Rules test: a manager with
`allowedHubs: ['tasks']` can neither update nor delete a job; a manager with
`allowedHubs: null` (legacy full access) still can; an admin with
`allowedHubs: ['tasks']` still can (the admin bypass is the contract, not a
bug — record it in the test name).

### C.3 Measure before deploy

Run the FXCC users tally (role × allowedHubs × active) that was denied this
session. If no manager is scoped out of Jobs, this ships as a defence-in-depth
change with a note; if one is, that person's existing jobs-side actions are
the thing to check before the rules deploy locks them out mid-flow.

Deploy: the four callables + `firestore:rules`. Per
`feedback_index_deploy_rules`, no index deploy is involved, so no re-deploy
ordering concern.

---

## Part D — two small server guards

### D.1 Past-shift signup

`jobSignUp` (`functions/index.js:3576-3615`) checks `status === 'open'` only.
Add the date check **inside the signup transaction callback**, against the
job doc the transaction just read, with `todayStr` **computed inside the
callback too** (church-local via `getChurchTimeZone` + `localPartsFor`, the
same pair the cron uses). Transactions retry by re-running the callback, so
anything computed outside it is stale on retry and across a church-local
midnight — round 2's point. If `job.scheduledDate < todayStr`, throw
`failed-precondition` with the message the UI already shows for past dates
(`JobsPage.jsx:1139-1145`). Zero exposure today; closes the gap between a
shift passing and the hourly cron marking it.

### D.2 Waitlist eligibility inside the transaction

`promoteWaitlistForJob` (`functions/index.js:3438`) loads the **whole
church's** `accessPeople` and `accessRecords` (`:3450-3451`), picks the first
eligible waitlister (`:3461-3465`), then opens a transaction that re-checks
only existence and capacity (`:3471-3489`). `isAccessEligible` (`:3423-3432`)
is a pure function over those arrays, so it can't be called "inside the
transaction" on a fresh read without re-reading the church — which is what
round 1 rightly refused.

Bounded design: keep the pre-selection as the *candidate* step (cheap, uses
the arrays already loaded). Inside the transaction, for **that one
candidate** only:

1. Read `requiredTypes` from the job doc **the transaction just read**
   (`job.requiredAccessTypes`), and compute `todayS` inside the callback —
   not from the pre-selection's captured values, which can be stale if the
   job's requirements change between selection and commit.
2. `t.get(accessPeople.where('userId','==',uid))` — the candidate's linked
   people (in practice 0–2 docs). Build `linkedIds` as an **array** of doc
   ids. **If it is empty, the candidate is ineligible — skip without
   issuing the second query**, because `in` requires a non-empty array and
   `isAccessEligible` returns false for no linked people anyway.
3. `t.get(accessRecords.where('personId','in',linkedIds))` — their records
   (`in` is capped at 30 ids; a person linked to more than 30 tracked
   records is not a shape the app produces — `people.js` collapses to one;
   slice to 30 defensively).
4. Call `isAccessEligible(uid, requiredTypes, freshPeople, freshRecords,
   todayS)` on those two small arrays — same pure function, narrower inputs.
   If `requiredTypes` is empty, steps 2–3 are skipped entirely (the function
   short-circuits to `true`).

If it fails, the transaction returns a `skip` signal; the outer loop marks
that uid ineligible, re-selects from the already-loaded waitlist excluding
it, and tries again. The loop is bounded **explicitly** by
`MAX_PROMOTION_ATTEMPTS = 10` (a named constant beside `WAITLIST_CAP`), not
by the waitlist length — legacy waitlists can exceed the cap. Hitting the
bound logs a Sentry warning (`area: 'jobs', reason: 'promotion-attempts-exhausted'`)
and returns null; the next withdrawal or manual promote retries. Two extra
transactional queries per attempt; no whole-collection read inside the
transaction. Admin SDK transactions accept queries (`t.get(query)`), so this
is standard.

Test: seed a job with `requiredAccessTypes`, two waitlisters both eligible;
between the handler's pre-selection and the transaction (inject via the
existing test seam or a fake `db`), expire candidate 1's record; assert
candidate 2 is promoted and candidate 1 remains on the waitlist.

Deploy: `jobSignUp`, `jobWithdraw` (inline promotion, `:3685`), and
`promoteFromWaitlist` (`:3751`) — the three callers of
`promoteWaitlistForJob` as of `34d15eb`; no scheduled function calls it.
Re-grep before deploy.

---

## Part E — re-filed, not built

| Codex item | Disposition | Where |
|---|---|---|
| Drag-reorder last-write-wins, unaudited (`WorkBoard.jsx:1465-1477`) | **Ask FXCC.** ~8 staff; a collision needs two people reordering the same column at the same moment. A server callable (Codex suggestion 5) is M-sized for an unobserved problem. | backlog #11 |
| Swap requests unvalidated against job/signup; duplicates allowed (`firestore.rules:548-560`) | **Backlog, low.** 0 swap requests at FXCC lifetime. Note the fix shape (rules `exists()` on the signup) so it is a 30-minute item when it matters. | backlog "Smaller / standalone" |
| Suggestion 1 — "My shifts" shows waitlisted + promotion state | **Ask FXCC.** Plausible, unmeasured. | backlog #11 |
| Suggestion 4 — "next available shift" CTA on `VolunteerHome` | **Ask FXCC.** Recruiting-flow hypothesis. | backlog #11 |
| Suggestion 2, 3 | Shipped here as D.1 and B. | — |
| **Found by round 1:** a hand-made `private` task whose creator is later deactivated becomes unreadable by everyone (`firestore.rules:63-70` has no admin arm; COH-011 deactivation does not reassign or re-scope tasks) | **Backlog, under #3 / offboarding.** Not recurrence-specific. Fix shape: `setMemberActive` (the callable that already owns deactivation) flips that member's `private` unassigned tasks to `team` or reassigns them — an owner decision on which. Measure first: count FXCC tasks with `visibility:'private'`, empty `assigneeUids`, and an inactive `createdBy`. | backlog #3 |

---

## Order, gates, and receipts

A → C → B → D. A first because it is the only part with data behind it
(even if that data is test residue); C next because it is a permissions
gap with a measurement still owed; B and D are latent.

Each part is its own commit (or two: code, then deploy receipt), verified in
production before the next starts, matching COH-007's gate discipline. One
Codex post-ship review after the last part, not one per part — COH-012
showed the per-part loop drifts into owner decisions
(`feedback_repeated_findings_change_method`).

Docs updated in the same commit as each behaviour change
(`feedback_doc_with_behavior_change`): `docs/backlog.md` (add COH-013 row;
re-file Part E items), `CLAUDE.md` function inventory if a new function or
script is added, `functions/scripts/README` for A.2.

## Review history

- **Round 1 (2026-09-21, gpt-5.6-luna @ medium, 86k tokens) — REWORK.**
  Three blockers, five gaps, all verified against the code and folded into
  rev 2: C.1 named a `jobSignUp` on-behalf branch that does not exist (it
  already gates `effectiveHasHub`); B.2's owner attribution fails once the
  owner is offboarded → replaced by the live-viewer invariant (B.2 step 3);
  D.2 could not be done "inside the transaction" against whole-church arrays
  → bounded per-candidate queries. Gaps: A.2 Admin-SDK collection groups
  are global (filter by path); A.1 `await writer.close()`; D.1 compare
  inside the transaction; C.2 self-withdraw (decided: stays ungated, see
  C.1); B.1 maintenance branch (helper takes `type`). One round-1 finding
  was not a defect in this plan but a real adjacent gap — the offboarded
  creator of a hand-made private task — re-filed in Part E.

- **Round 2 (2026-09-21, gpt-5.6-luna @ medium, 84k tokens) — SHIP WITH
  FIXES.** Five blockers, three gaps, all verified, all folded into rev 3:
  D.1 `todayStr` moved inside the transaction callback; D.2 `in` takes an
  array (empty → skip), `requiredTypes`/`todayS` read inside the callback,
  explicit `MAX_PROMOTION_ATTEMPTS`; A.2 `.exists` property via `getAll`,
  backup JSON file as the rollback, owner-executed per `AGENTS.md:346`;
  A.4 owner go-ahead + warm-up delete; C overview corrected; B.2 uid filter
  before `getAll`. No round-2 finding touched Part B's live-viewer invariant
  or the D.2 query shape beyond the `Set`→array fix — those two were the
  explicit asks and both held.

## Open questions for the owner

1. **Part C measurement** — run the users tally, or accept C on principle?
2. **B.2 attribution** — a generated task now shows the template owner as
   creator, with an "auto-generated" badge. Prefer that over the current
   "Auto-generated" pseudo-user? (The pseudo-user is what makes the task
   unreachable; there is no way to keep it *and* fix the bug.)
3. **A.2 scope** — the cleanup deletes test residue only. Should the E2E
   suite's teardown also be fixed so it stops producing it? (Out of scope
   here; separate item if yes.)
