# COH-007 — Completed-task archiving and archive search

**Status:** Proposed plan — **amended 2026-09-05 (Claude)** against the final
COH-006 state, `main` at `2ced910`. Awaiting Codex pre-implementation review.

**Amendments.** This document was written on top of `69e7390` (COH-006 gate 3),
before gate 4 shipped. Nine things about the deployed system are knowable now
that were not then; each is marked **[A-n, 2026-09-05]** where it changed the
text. The consequential one is **A6** — an open owner call, not a design choice
Claude may make. Amendment step 2 of Migration and rollout is therefore
complete; the pre-implementation review is the next gate.

**Priority:** High (owner request, 2026-09-03)

**Suggested owner:** Claude

**Suggested reviewer:** Codex

**Depends on:** COH-006 merged, deployed, and production-verified —
**satisfied 2026-09-03**; all four gates deployed and verified, `main` at
`2ced910` (`docs/COH-006-GATE4-DEPLOY-RECEIPT-2026-09-03.md`).

## Owner request

Automatically archive completed tasks after they have been complete for more
than six weeks, and provide a way to search and view archived tasks.

## Outcome

The normal Tasks board stays focused on current work and does not keep old
completed tasks in its always-live Firestore listeners. A member can open an
Archived Tasks view, search the archived tasks they are authorized to see, read
the full task history, and reopen a task when work resumes. Archiving is
lossless: the task document, comments, photos, links, task number, and activity
history remain in place.

Maintenance tickets are not part of COH-007. They share the `workItems`
collection but keep their current lifecycle and listener.

## Product contract

1. A task becomes eligible when all of these are true:
   - `type == 'task'`;
   - `status == 'Complete'`;
   - `archived == false`; and
   - `completedAt` is a valid ISO timestamp strictly older than 42 elapsed days.
2. A daily scheduled function archives eligible tasks. The age calculation is
   UTC elapsed time, not a church-local calendar boundary; a daily cadence makes
   the difference user-invisible while avoiding timezone-dependent retention.
3. Archiving is a soft state change on the existing document. No task, comment,
   photo, or link is moved or deleted.
4. **Archiving changes nothing about who can see a task — confirmed by the
   product owner 2026-09-05.** In plain terms: a task visible to the whole church
   is still visible to the whole church once archived; a private one is still
   visible only to its creator and assignees; a shared one still only to the
   people it was shared with. Nobody gains access because a task was archived,
   and nobody loses it. There is no admin override — an admin who could not read
   a private or shared task before archiving cannot discover it through the
   archive.

   Precisely: archived tasks retain the COH-006 authorization contract exactly,
   `canSeeWorkItem()` is unchanged, and the archive view therefore runs all four
   authorization arms — including `team` — rather than a personal subset. The
   alternative reading, an archive scoped to tasks the viewer is personally
   attached to, was **considered and rejected by the owner**: it would have made
   the church's completed history unbrowsable by anyone who was not on each
   individual task. Do not reopen this in review.
5. Archived Tasks is an on-demand Tasks Hub view, not another app-start
   subscription. Opening it loads and de-duplicates the authorized archive query
   set, then supports client-side substring search across task name,
   description, tags, and task number. Results sort by completion date newest
   first and expose the existing detail view in read-only mode.
6. `Reopen` is the supported restore operation. It returns the task to
   `Backlog`, clears `completedAt` and the archive timestamps, and makes it
   active again. Keeping a restored task `Complete` would make the next daily
   run archive it again.
7. The ordinary global command palette searches active tasks only. Archived
   search lives in the archive view, where its on-demand reads and loading/error
   state are explicit. The archive view can export its currently filtered rows
   to a separately named CSV.
8. Completed-this-month remains correct from the active set because 42 days is
   longer than a month. The 12-week velocity chart and 90-day completion metric
   must combine active tasks with authorized archived tasks loaded on demand;
   they must not silently undercount after the cutover.
   **[A4, 2026-09-05]** Anchored to the code: `velocityData`
   (`src/pages/hubs/WorkBoard.jsx:1572-1586`) spans 12 weeks — 84 days — and the
   `Avg/Week (90d)` tile (`:2111-2118`) spans 90; both exceed the 42-day cutoff,
   so both undercount from the reader gate onward, silently and by a growing
   amount. `completedThisMonth` (`:1565`) is safe on arithmetic alone: the
   longest month is 31 days. All three read `visibleTasks`, so combining archives
   means feeding that one derived array, not patching three call sites.

## Data model

Add these fields to every task document in `workItems`:

| Field | Type | Meaning |
|---|---|---|
| `archived` | boolean | `false` for active-board tasks; `true` for archived tasks |
| `archivedAt` | Firestore Timestamp or null | Server time at which automatic archiving occurred |

All task creation paths write `archived:false` and `archivedAt:null`, including
the centralized client writer and `generateRecurringTemplateTasks`. Maintenance
writers do not add the fields.

`completedAt` remains the eligibility clock and keeps its existing ISO-string
representation for this task. COH-007 does not mix a timestamp-format migration
into the archive rollout. A completed task with a missing or malformed
`completedAt` is not guessed from `updatedAt` or `createdAt`; it is skipped,
counted, and surfaced in function telemetry for explicit remediation.

## Read architecture

### Active board

Keep the maintenance listener unchanged. Add `archived == false` to each of the
four task-capable COH-006 queries:

- `visibility == 'team'` + `archived == false`;
- `createdBy == uid` + `archived == false`;
- `assigneeUids array-contains uid` + `archived == false`; and
- `visibility == 'shared'` + `sharedWithUids array-contains uid` +
  `archived == false`.

The existing per-source membership tracking remains mandatory, so an archived
task leaves the merged active store as soon as it drops out of its last active
listener.

**[A1, 2026-09-05] Five listeners, four constrained.** The deployed reader
(`src/useFirestore.js:277-285`) runs *five* queries, not four: `maintenance`,
`team`, `own`, `assigned`, `shared`. Only the four task-capable arms take
`archived == false`. The `maintenance` arm must **not** — maintenance documents
never carry the field, and an equality filter on a missing field matches nothing,
so constraining that arm would empty the maintenance board for every church.

Two second-order effects to state rather than let a reviewer rediscover:

- The `own` arm (`createdBy == uid`) currently delivers maintenance tickets the
  user created. Adding `archived == false` drops those from that arm. Harmless:
  the `maintenance` arm returns every ticket church-wide and
  `mergeWorkSources()` (`src/utils/workMerge.js`) splits the union by `type`, so
  the maintenance array is unchanged. It is a change in delivered document
  counts, not in what renders.
- The `assigned` arm is unaffected, because only `addTask` and `updateTask`
  write `assigneeUids` (`useFirestore.js:796-797`, `:818-819`); no maintenance
  writer does. That arm has always been tasks-only.

### Archived Tasks view

Run the same four authorization-shaped queries as one-shot server reads with
`archived == true`, merge them by real document id, filter defensively to
`type == 'task'`, and expose one settled/error state. Do not use an
`archived == true` query by itself: Firestore could not prove that every private
or shared result is readable.

Factor the active and archive query construction through one small builder so
their visibility arms cannot drift. Do not reuse the global live task array for
archives, and do not turn the archive into another permanent listener.

**[A5, 2026-09-05] The client predicate still runs, and can disagree with the
queries.** Gate 3 removed the interim store-boundary filter, but the board still
filters through `canSeeTask()` at `src/pages/hubs/WorkBoard.jsx:667`. That
predicate reads the `assignees` / `sharedWith` **object** arrays, while the
queries and the rules read the `assigneeUids` / `sharedWithUids` **uid** arrays,
and DEC-2026-012 deliberately does not pin the two together. A task delivered by
a uid-array arm whose object array has gone stale is therefore already hidden by
the board today. The archive view inherits this exactly: apply the same predicate
for consistency with the active board, never rely on it for authorization, and
record the divergence as pre-existing rather than introduced here. If COH-007
surfaces a real instance of it in production data, that is a separate finding
against DEC-2026-012, not a defect in archiving.

**[A2, 2026-09-05] The index set, concretely.** The active and archived query
sets differ only in the `archived` value, so one set of four COLLECTION-scope
composites serves both:

| Serves | Index |
|---|---|
| `team` | `(visibility ASC, archived ASC)` |
| `own` | `(createdBy ASC, archived ASC)` |
| `assigned` | `(assigneeUids CONTAINS, archived ASC)` |
| `shared` | `(visibility ASC, sharedWithUids CONTAINS, archived ASC)` |

**[A10, 2026-09-05] Append `completedAt` as the trailing ordered field.** Per
**DEC-2026-018**, archive and Insights reads are bounded by a `completedAt`
window rather than downloading full history, so each of the four composites above
carries `completedAt` last: `(… , archived ASC, completedAt DESC)`. Declaring it
now costs one field per index and avoids a second index build later. Review
finding M3 is what this answers.

The existing `(visibility, sharedWithUids)` COLLECTION entry in
`firestore.indexes.json` stays — it still serves nothing else, but removing it is
a separate change and not worth bundling into an authorization-sensitive rollout.

Two standing hazards apply, both already documented in `CLAUDE.md` and both
previously paid for on this repository:

- `firebase deploy --only firestore:indexes` exits 0 while silently creating
  nothing for a COLLECTION-scope composite whose field list matches an existing
  COLLECTION_GROUP index (Known Pitfalls, Case A — it cost five weeks of a
  missing production index in 2026-05). Probe each of the five exact query shapes
  against production after deploying, and fall back to
  `gcloud firestore indexes composite create` for any that are absent. A
  successful deploy is not evidence.
- Redeploy `firestore:rules` after any `firestore:indexes` deploy.

## Scheduled archiver

Add `archiveCompletedTasks`, a once-daily `onSchedule` function wrapped by
`withScheduledRun`, and add it to the scheduled-job monitor.

The collection-group query selects `status == 'Complete'`, `archived == false`,
and `completedAt <= cutoff`. Only task documents carry `archived`, but the
function still checks `type == 'task'` before writing. Declare and probe the
required COLLECTION_GROUP composite index —
`(status ASC, archived ASC, completedAt ASC)`.

**[A3, 2026-09-05] The range filter may return null-dated documents.** Every
task-creation path writes `completedAt: null` — the client writer at
`src/useFirestore.js:800` and the template generator at
`functions/index.js:3533` — and Firestore's total value ordering places null
before strings, which would make `completedAt <= '<iso cutoff>'` match every
null. A task can reach `status == 'Complete'` with a null `completedAt` through
any write path that sets status without stamping the date, so the population is
not hypothetical even though it should be small.

If that ordering behaviour holds, the handler's "skip a malformed or missing
date, count it, surface it in telemetry, and never guess it from `updatedAt` or
`createdAt`" guard is **load-bearing** — it is the only thing standing between a
never-completed-properly task and automatic archiving — rather than the
defensive nicety the original text implies.

Do not take the ordering claim on reasoning. **Measure it** against the emulator
before implementation, seeding one `Complete` task with `completedAt: null`
alongside eligible and ineligible dated ones, and record the observed result in
the handoff. The guard ships either way; what the measurement decides is whether
its skip counter is expected to be non-zero in production.

Each update writes only:

- `archived:true`;
- `archivedAt: FieldValue.serverTimestamp()`; and
- `updatedAt` using the application's existing ISO representation.

The worker must be idempotent and race-safe. A task can be reopened after the
query snapshot but before the write, so a blind batch is not acceptable. Use an
update-time precondition or a transaction that re-reads and rechecks the
eligibility predicate. A concurrent edit becomes a counted conflict and is
reconsidered on the next run. Batch successful writes below Firestore's limit.

Telemetry and logs contain counts and document paths/ids only when needed for
diagnosis; they never log task titles, descriptions, comments, or private/shared
recipient data. The heartbeat summary reports examined, archived, skipped
malformed, conflicted, and failed counts.

## Client behavior

- Add an `Archived Tasks` control to the Tasks Hub only. It opens a simple list
  view with loading, retry, empty, search, result-count, and error states.
- Reuse task cards/detail presentation where practical, but archived detail is
  read-only except for `Reopen`. Comments remain readable and are not editable
  while archived. A task must be reopened before the existing permanent-delete
  flow is available.
- Reopen is one atomic update. The UI must not optimistically insert the task
  into the active board until the active listener delivers it.
- If a reservation or job points to a task absent from the active store, its
  linked-task affordance must distinguish `archived` from `missing` when the
  current user can read it and route to the archive detail. Unauthorized linked
  tasks remain undisclosed.
- Saved active-board filters, Kanban ordering, calendar export, attention
  signals, reminders, and Global Search continue to operate on active tasks.
- Entering the admin/manager Insights view loads the authorized archive data and
  combines it with active tasks for 12-week/90-day history. It shows a clear
  failure state rather than presenting partial metrics as complete.

## Rules contract

Build on the final COH-006 predicate; do not start from the transitional rule on
`main` if COH-006 has not yet merged.

- Task creates require `archived == false` and `archivedAt == null` in addition
  to the COH-006 shape.
- Normal client updates cannot forge an archive transition.
- An authorized user may perform the one reopen transition from archived to
  active only when the resulting status is `Backlog`, `completedAt` is null,
  `archived` is false, and `archivedAt` is null. Existing immutable identity
  fields and the COH-006 pre-state authorization check still apply.
- Archived task content and comments are read-only until reopen, and archived
  task deletion is denied. Reopening restores the existing edit and
  permanent-delete authorization.
- The scheduled function uses the Admin SDK, but client rules still validate the
  archive fields and transitions so direct SDK callers cannot bypass the
  lifecycle.

**[A7, 2026-09-05] What the deployed rule already gives us.** `canSeeWorkItem()`
has no archived arm, so archiving changes nothing about *who may read* a task and
the read rule needs no edit at all. Reopen inherits every constraint the gate-4
update rule already imposes — `type` equality, the `createdBy` / `taskNumber` /
`createdAt` immutability pins, `visibility in ['team','private','shared']`, both
`is list` checks on the uid projections, and the pre-state
`canSeeWorkItem(resource.data)` authorization that is what stops a self-grant.
COH-007 therefore adds only the transition constraints on top: a client may move
`archived` true→false (landing in `Backlog` with `completedAt` and `archivedAt`
null) and never false→true.

**[A6, 2026-09-05] OPEN OWNER CALL — read-only-while-archived collides with
DEC-2026-015's first residual.** Gate 4 recorded that deleting a linked
maintenance ticket or job clears the corresponding backlink on the task through a
direct update *outside* `updateTask`, and that the write is denied when the actor
cannot read the task, leaving a stale backlink. Measured: three call sites do
this, touching two fields — `deleteTicket` (`src/useFirestore.js:758`,
`linkedTicketDocId`), `deleteJobListing` (`:1276`, `linkedJobDocId`) and
`clearLinkedTaskBackRefs` for job-series deletes (`:1342`, `linkedJobDocId`).
All three are fire-and-forget, so a denial is swallowed and shows up later as a
chip pointing at a deleted document — the same stale chip the 2026-05-12 audit
(Data #1) already found and fixed once.

The plan's rule "archived task content and comments are read-only until reopen"
extends that denial to a new case: an actor who **can** read the task would also
be blocked from clearing its backlink, purely because the task is archived. The
result is a dangling pointer to a deleted ticket, job, or reservation on an
archived task, which the linked-task affordance in Client behavior then has to
render as neither `archived` nor `missing` but broken.

Two options, and this is the owner's call, not Claude's:

1. **Carve the two fields out of the archived write-lock** — `linkedTicketDocId`
   and `linkedJobDocId` remain writable on an archived task by an actor who
   passes `canSeeWorkItem`. Cost: the write-lock is no longer "no content changes
   at all", so the rule and its tests carry an explicit two-field allowlist.
2. **Accept stale backlinks on archived tasks** — the lock stays total, and the
   archive detail view is required to degrade gracefully on a link whose target
   no longer exists. Cost: a known-wrong field on archived records, and the
   degradation has to be built and tested anyway.
3. **Move the cleanup server-side** — a callable using the Admin SDK, which
   neither the archive lock nor `canSeeWorkItem` blocks. The only option that
   also closes DEC-2026-015's original residual, and the one that decision itself
   pointed at. Cost: materially more work, a new callable to authorize and
   monitor, and scope COH-007 did not ask for.

Option 1 is the smaller lie about the data at the cost of a slightly leakier
rule; option 2 keeps the rule clean at the cost of storing something false;
option 3 fixes the underlying problem at a price COH-007 did not budget for.
`linkedReservationDocId` and `linkedItemDocId` are not in scope here — no delete
path clears them today, which is a separate pre-existing gap. Recorded as
**DEC-2026-017**; answer it before implementation begins.

## Migration and rollout

This is a staged schema/read-path change, not a combined deploy.

1. **Finish COH-006.** Merge and deploy its final rules and complete its
   production verification. COH-007 touches the same central reader, rules,
   indexes, work board, and scheduled-functions file, so implementation must not
   overlap Gate 4.
2. **Plan review. — DONE 2026-09-05.** Claude amended this plan against the
   final COH-006 state (amendments A1–A9 above; `main` at `2ced910`). The one
   consequential decision is **A6**, left open for the owner rather than settled
   by Claude. Next gate: Codex's pre-implementation review.
3. **Additive gate.** Ship task writers, archive loader/UI, rules shape,
   function code, monitoring entry, and all indexes without changing the active
   listeners or enabling production archiving. Verify the exact archive queries
   return an empty, authorized result rather than an index/rules error.
4. **Backfill gate.** Use an idempotent script to add `archived:false` and
   `archivedAt:null` to every existing `type:'task'` document. Required sequence:
   backup, dry run, counts by church/status, explicit owner execution approval,
   execute, independent coverage query, and a delta pass. Do not infer or alter
   `completedAt` in this pass.
   **[A8, 2026-09-05]** Do not invent the script's shape — follow
   `scripts/backfill-task-visibility.cjs`, which already implements exactly this
   sequence and was executed cleanly in production at COH-006 gate 2 (90 tasks
   across 6 churches, 90 applied, 0 skipped, 0 outstanding against an independent
   aggregation baseline). Reuse in particular its dry-run default, its
   `--execute --prod` guard, and its **manifest-based** rollback: it records the
   before- and after-image of every document it writes and refuses to restore one
   a user has touched since, rather than blindly reverting. Verification follows
   `scripts/verify-coh006-gate3.mjs`.
5. **Reader gate.** After coverage and index probes pass, deploy the active
   query constraints. Verify two accounts against team, own, assigned, shared,
   private-negative, stale-recipient-negative, and archived fixtures. Confirm a
   task leaving the last active query disappears without publishing a partial
   store.
6. **Automation gate.** With explicit approval to begin the production data
   mutation, deploy/enable the scheduled archiver. Run a controlled threshold
   verification, then confirm archive search, detail, links, reopen, metrics,
   and the scheduled heartbeat. The initial run's eligible count is recorded.

Rollback is lossless because documents never move. Disable/revert the scheduled
function first, then restore the prior reader if needed; the prior reader will
show archived documents as completed tasks. Archive flags may remain inert.
Changing flags in production to undo an initial run is a separate migration and
requires the same backup/dry-run/approval discipline.

## Verification

### Pure/unit coverage

- Exactly 42 days old is not archived if the contract says “more than six
  weeks”; the next representable instant is eligible.
- Incomplete, cancelled, already archived, maintenance, missing-date, malformed-
  date, and future-date records are ineligible.
- Query-source merge de-duplicates a task visible through multiple arms and
  removes it when no source remains.
- Search is case-insensitive across name, description, tags, and task number.
- Active-plus-archived insight aggregation has no duplicates and preserves the
  12-week and 90-day totals.

### Emulator rules/handler coverage

- Each active and archived query arm succeeds for its intended actor and returns
  exact expected ids; inactive and cross-tenant actors fail.
- Private non-creator, shared non-recipient, and stale-recipient cases remain
  denied in archived reads. Admin role alone does not grant access.
- Create requires the active archive shape; direct clients cannot archive a
  task, forge `archivedAt`, or edit an archived task/comment.
- Creator, assignee, shared recipient, and team-authorized member reopen cases
  follow the final COH-006 update policy; outsiders cannot reopen.
- Scheduled archiving is idempotent, preserves every non-archive field and
  subcollection, skips malformed dates, chunks safely, and loses a deliberate
  reopen/archive race rather than archiving the reopened task.

**[A8 cont., 2026-09-05] Any new listener assertion needs metadata events.** A COH-006
post-deploy review found the gate-4 probe's `onSnapshot()` oracle lacked
`{ includeMetadataChanges: true }`, which defaults to false: a backend
confirmation that changes only sync metadata raises no second callback, so a warm
cache and a dead listener are indistinguishable to the test. Any COH-007
assertion that a task *leaves* an active listener must enable metadata events, or
it can pass while broken. `scripts/verify-coh006-listener-oracle.mjs` is the
ordering-independent regression that pins this.

### UI/E2E coverage

- A task crosses the 42-day threshold, leaves the active board, appears once in
  Archived Tasks, is searchable, and opens with comments/photos intact.
- Reopen returns it to Backlog and the active board and removes it from archive
  results.
- Archive loading, no-results, permission-denied, missing-index, and retry states
  do not masquerade as an empty archive.
- Active Global Search excludes archives; archive CSV contains only the filtered
  authorized results.
- Linked reservation/job behavior and 12-week/90-day Insights totals do not
  regress.

## Acceptance criteria

- Completed tasks older than 42 days archive automatically within one scheduled
  run; younger or non-complete tasks do not.
- The active board's live reads exclude archives at the query layer, not only by
  hiding them in JSX.
- Every authorized user can search and view the archived tasks they could see
  before archiving, and no one gains access through the archive.
- Archiving preserves comments, photos, links, audit history, visibility,
  assignees, sharing, and task number.
- Reopening is race-safe and restores the task to active Backlog without a
  duplicate recurring task.
- Historical Insights remain complete for their advertised windows.
- Migration coverage is complete, every index/query is production-probed, the
  scheduled job is monitored, and lint/build/unit/rules/handler/narrow E2E
  results are recorded in a SHA-pinned handoff.

## Proposed file scope

- `src/useFirestore.js`
- `src/pages/hubs/WorkBoard.jsx`
- linked-task consumers in `src/pages/ReservationsPage.jsx` and
  `src/pages/hubs/JobsPage.jsx`
- `src/utils/taskVisibility.js` and/or a focused archive/query helper
- `src/utils/csv.js`
- `src/components/GlobalSearch.jsx` (regression assertion or explicit active-only
  contract; no archive subscription)
- `firestore.rules`
- `firestore.indexes.json`
- `functions/index.js`
- a focused pure helper under `functions/lib/`
- rules, handler, unit, and authenticated E2E tests
- an idempotent backfill/verification script under `scripts/`
- `docs/DATA_MODEL.md`, Help Centre, `src/data/whatsNew.js`, and handoff/review
  artifacts. **[A9, 2026-09-05]** These were already scoped correctly; the only
  amendment is procedural — the doc and Help Centre lines land in the **same
  commit** as the behaviour change they describe, not a tidy-up commit
  afterwards. The Help Centre currently states that task visibility is
  server-enforced (gate 4); archiving adds to that copy rather than replacing
  it.

## Explicitly out of scope

- Maintenance-ticket archiving.
- Moving archives to a second collection or deleting archived data.
- A third-party full-text search service or redesign of Foundation F6.
- Changing the six-week retention period in Settings.
- Bulk/manual archive controls for active tasks.
- Rewriting existing ISO chronology fields to Firestore Timestamps.
