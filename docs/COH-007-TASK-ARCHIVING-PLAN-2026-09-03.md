# COH-007 — Completed-task archiving and archive search

**Status:** Proposed plan

**Priority:** High (owner request, 2026-09-03)

**Suggested owner:** Claude

**Suggested reviewer:** Codex

**Depends on:** COH-006 merged, deployed, and production-verified

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
4. Archived tasks retain the COH-006 authorization contract exactly. There is
   no admin visibility override: a person who could not read a private or shared
   task before archiving cannot discover it through the archive.
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

### Archived Tasks view

Run the same four authorization-shaped queries as one-shot server reads with
`archived == true`, merge them by real document id, filter defensively to
`type == 'task'`, and expose one settled/error state. Do not use an
`archived == true` query by itself: Firestore could not prove that every private
or shared result is readable.

Factor the active and archive query construction through one small builder so
their visibility arms cannot drift. Do not reuse the global live task array for
archives, and do not turn the archive into another permanent listener.

Firestore may require composites for the added equality constraint, especially
the array-contains arms. Declare every required COLLECTION-scope index in
`firestore.indexes.json`, then probe the exact active and archived query shapes
against production before cutting over. Do not infer index availability from a
successful Firebase CLI deploy.

## Scheduled archiver

Add `archiveCompletedTasks`, a once-daily `onSchedule` function wrapped by
`withScheduledRun`, and add it to the scheduled-job monitor.

The collection-group query selects `status == 'Complete'`, `archived == false`,
and `completedAt <= cutoff`. Only task documents carry `archived`, but the
function still checks `type == 'task'` before writing. Declare and probe the
required COLLECTION_GROUP composite index.

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

## Migration and rollout

This is a staged schema/read-path change, not a combined deploy.

1. **Finish COH-006.** Merge and deploy its final rules and complete its
   production verification. COH-007 touches the same central reader, rules,
   indexes, work board, and scheduled-functions file, so implementation must not
   overlap Gate 4.
2. **Plan review.** Claude reviews/amends this plan against the final COH-006
   state, records any consequential decision, then hands the plan to Codex for
   the required pre-implementation review.
3. **Additive gate.** Ship task writers, archive loader/UI, rules shape,
   function code, monitoring entry, and all indexes without changing the active
   listeners or enabling production archiving. Verify the exact archive queries
   return an empty, authorized result rather than an index/rules error.
4. **Backfill gate.** Use an idempotent script to add `archived:false` and
   `archivedAt:null` to every existing `type:'task'` document. Required sequence:
   backup, dry run, counts by church/status, explicit owner execution approval,
   execute, independent coverage query, and a delta pass. Do not infer or alter
   `completedAt` in this pass.
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
  artifacts

## Explicitly out of scope

- Maintenance-ticket archiving.
- Moving archives to a second collection or deleting archived data.
- A third-party full-text search service or redesign of Foundation F6.
- Changing the six-week retention period in Settings.
- Bulk/manual archive controls for active tasks.
- Rewriting existing ISO chronology fields to Firestore Timestamps.
