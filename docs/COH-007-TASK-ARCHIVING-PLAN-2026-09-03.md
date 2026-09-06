# COH-007 — Completed-task archiving and archive search

**Status:** Proposed plan — **amended 2026-09-05 (Claude)** against the final
COH-006 state, `main` at `2ced910`. Awaiting Codex pre-implementation review.

**Amendments.** This document was written on top of `69e7390` (COH-006 gate 3),
before gate 4 shipped, and has since been amended twice: first against the
shipped COH-006 state (**A1–A9**), then against Codex's pre-implementation
review (`docs/COH-007-PLAN-REVIEW-2026-09-05.md`, four High and three Medium,
verdict *changes requested*) and the owner's answers to it (**A10–A16**), then
against the re-review (`docs/COH-007-PLAN-REREVIEW-2026-09-05.md` — all four High
and M1/M3 closed, M2 partial, four new findings against the amendment pass
itself) which produced **A17–A20**. Each amendment is marked
**[A-n, 2026-09-05]** where it changed the text.

**All owner questions are now answered** — DEC-2026-016 (archive after six
weeks), DEC-2026-017 (backlink cleanup moves server-side, with reciprocal
checks), DEC-2026-018 (archive reads bounded by a 12-month window), and the
canonical-visibility question at A5. Nothing in this plan is waiting on a
product decision.

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

   **[A15, 2026-09-05 — review finding M3, DEC-2026-018]** That load is
   **bounded to a 12-month window by default**, newest first, bounded per
   authorization arm, with the window stated on screen and an explicit control to
   search further back. Search covers the loaded window and the UI says so. This
   is a promise decision as much as a cost one: "search your whole archive"
   cannot later be narrowed without a visible downgrade, and silent pagination
   under unchanged copy would make a fruitless search untrustworthy. Insights
   loads only its own 90-day metric window. No tokenized search field and no
   search service in v1; both stay deferred behind a recorded latency/read
   tripwire. Measured basis: 134 work items exist across every church for the
   life of the app.
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
   **[A4, 2026-09-05 — REVISED after review finding H3]** Anchored to the code:
   `velocityData` (`src/pages/hubs/WorkBoard.jsx:1572-1586`) spans 12 weeks — 84
   days — and the `Avg/Week (90d)` tile (`:2111-2118`) spans 90; both exceed the
   42-day cutoff, so both undercount from the reader gate onward, silently and by
   a growing amount. `completedThisMonth` (`:1565`) is safe on arithmetic alone:
   the longest month is 31 days.

   My first amendment suggested feeding archives into `visibleTasks` because all
   three metrics read it. **Do not do that.** `visibleTasks` is also the source
   for `tasksByDocId`, the filters, Kanban and list rendering, selection, bulk
   actions, detail editing and linked-task behaviour, so archived rows would
   reappear on the operational board carrying action affordances the rules will
   reject. Gating the combination on `viewMode === 'insights'` does not save it
   either — switching views with archive state retained becomes a correctness
   boundary nobody will remember.

   Required: `visibleTasks` stays **active-only**. Add a separate deduplicated
   `insightTasks` = active visible tasks + authorized archived tasks loaded for
   the metric window, and compute only the 12-week and 90-day values from it.
   `completedThisMonth` stays on active tasks. Loading and error state for the
   historical metrics stays separate from the active store's completeness, so a
   failed archive load cannot present a partial history as a complete one. Per
   DEC-2026-018 the Insights archive query is bounded to its own 90-day window
   and never loads full history.

   **[A19, 2026-09-05 — re-review finding N3] The query bound must not be
   narrower than the metric it feeds.** The existing tile counts every task whose
   `completedAt.slice(0,10) >= localDateStr(now - 90d)` — a whole-date
   comparison. Bounding the query at the exact ISO instant 90 elapsed days ago
   would exclude completions earlier on that same boundary date, so active plus
   archive would undercount precisely the acceptance criterion this amendment
   exists to fix. The 12-week chart has slack inside 90 days; the
   `Avg/Week (90d)` tile has none. Take the query's lower bound from the **start
   of the metric's boundary date** under an explicit timezone contract, or query
   a conservatively earlier UTC instant and keep the client date predicate. Apply
   the same precision to the archive's "12 months" copy: state the exact included
   date range wherever the window is shown.

   **[A20, 2026-09-05 — re-review finding N4] `insightTasks` needs a temporal
   merge contract.** It joins a *live* active listener to *one-shot* archive
   reads, so dedupe by document id closes overlap but not state races. If a task
   archives after the one-shot reads settle, the live listener drops it and the
   frozen archive set never gains it — the metric silently loses history. In
   reverse, a reopened task appears in both, and if the stale archive copy wins
   the collision its old `Complete` / `completedAt` keep counting after the live
   task is back in `Backlog`. Required policy: **live active data always wins a
   collision**; all four archive arms must settle successfully before the metric
   is marked complete; a task leaving the active set during an open Insights load
   must trigger a refresh or be presented as an explicit as-of snapshot; and a
   torn or partial metric must never reuse the normal complete presentation.
   This mirrors `createWorkStore`'s settled-versus-complete distinction, and the
   same reasoning applies — a partial history that looks whole is the worst
   available failure.

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
`completedAt` is never guessed from `updatedAt` or `createdAt` — it is skipped
and counted.

**[A17, 2026-09-05 — re-review finding M2 partial] Scoped to what the query
sees.** An earlier version of this paragraph promised such tasks would also be
"surfaced in function telemetry for explicit remediation", which A12 then
contradicted. A12 is normative: the eligibility range query never returns a
document whose `completedAt` is **absent**, nor one whose malformed value sorts
outside the range, so the archiver can only guard and count the malformed values
**it was actually returned**. Population-wide data quality is explicitly not
promised here and is a separate, bounded decision.

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

**[A5, 2026-09-05 — REVISED after review finding H2] Do not re-filter the
archive through the object-array predicate.** The board filters through
`canSeeTask()` at `src/pages/hubs/WorkBoard.jsx:667`, which reads the `assignees`
/ `sharedWith` **object** arrays, while the queries and the rules read the
canonical `assigneeUids` / `sharedWithUids` **uid** arrays (DEC-2026-012).

My first amendment said to apply that predicate to the archive anyway, "for
consistency", and to record the divergence as pre-existing. Codex is right that
this is not acceptable: a task the rules lawfully authorize and Firestore
lawfully returns would be hidden by the client, which directly contradicts this
plan's own acceptance criterion that every authorized user can still see the
archived tasks they could see before. Carrying a known defect into a brand-new
reader is not the same as inheriting one.

**Owner answer (2026-09-05), resolving Codex's question 1:** "same visibility"
means the **canonical uid arrays**, not the board's stale object-array
presentation.

Required, in this order:

- The archive applies no second authorization filter. After the four
  rule-compatible queries succeed, filter only the `type == 'task'` invariant and
  merge by real document id. Firestore has already decided authorization; the
  client does not get a second vote.
- Change `canSeeTask()` to read `assigneeUids` / `sharedWithUids`, keeping a
  deliberate fallback to the object arrays only for documents predating the
  projection, and use it for the active board as well. This fixes a live defect:
  a task whose object array has gone stale is hidden from someone the rules
  authorize, on the active board, today.

**[A2, 2026-09-05] The index set, concretely.** The active and archived query
sets differ only in the `archived` value, so one set of four COLLECTION-scope
composites serves both:

| Serves | Index |
|---|---|
| `team` | `(visibility ASC, archived ASC)` |
| `own` | `(createdBy ASC, archived ASC)` |
| `assigned` | `(assigneeUids CONTAINS, archived ASC)` |
| `shared` | `(visibility ASC, sharedWithUids CONTAINS, archived ASC)` |

**[A10, 2026-09-05 — REVISED after re-review finding N2] Both index sets are
required; the longer one does not replace the shorter.** Per **DEC-2026-018**,
archive and Insights reads are bounded by a `completedAt` window, so they need
four further composites carrying `completedAt` last:
`(… , archived ASC, completedAt DESC)`.

My first version of this amendment claimed one longer set served both readers.
**Do not rely on that.** A Firestore composite index contains an entry only for
documents that have *every* indexed field, and this plan knowingly preserves a
population of tasks whose `completedAt` is absent (A3, A12 — the backfill
deliberately does not repair them). The active board applies no chronology
predicate and must keep returning those tasks. Serving it from an index whose
trailing field they lack would silently drop them from the board — the exact
class of failure COH-006 spent four gates closing.

So: **keep the four shorter A2 composites for the active arms, and add four
longer variants for the bounded archive and Insights reads** — eight in total.
Collapsing them back to four is permitted only on an exact emulator measurement
proving a shaped active task with `completedAt` *absent* is still returned, and
that measurement must be recorded. Production probes must include that shape, not
only a null-valued fixture, and must separately assert the bounded archive query
excludes it rather than showing it as a search result. Do not infer the planner
will choose index merging.

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
before implementation, using the exact fixture Codex wrote (review §M2), and
record the observed result in the handoff. The guard ships either way; what the
measurement decides is whether its skip counter is expected to be non-zero in
production.

**[A12, 2026-09-05 — review finding M2] Narrow the telemetry promise to what the
query can actually see.** The plan claimed missing and malformed completion dates
would be "skipped, counted, and surfaced". A range query cannot deliver that: a
document with **no** `completedAt` never appears in it at all, and a malformed
string sorting after the cutoff is equally absent. The daily archiver therefore
reports only `malformedReturnedByEligibilityQuery` — what its own range actually
examined — and the plan must not imply population-wide data-quality coverage.
Do not widen the daily job into an unbounded scan to preserve the original
wording. If population-wide data quality is wanted, it is a separate, bounded
audit and a separate decision.

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

**[A13, 2026-09-05 — review finding H4] The additive gate needs a transitional
rule, and the reader gate needs a strict one.** The additive gate deploys the
archive lifecycle rules *before* the backfill, when existing tasks carry neither
field. A rule written as "archived false may be edited, archived true is frozen"
using direct field access denies ordinary updates and comment writes on **every
legacy task** until the backfill reaches it — the whole board freezes mid-rollout.
A permissive default left in place afterwards is the opposite failure: a client
could delete `archived`/`archivedAt` and vanish from both equality-filtered
readers.

Two rulesets, deployed at two different gates:

- **Transitional (additive gate).** A missing pre-state defaults to active, so
  unbackfilled tasks stay fully usable. A task that already carries the fields
  may not delete or corrupt either one.
- **Final (before the reader cutover).** Both fields required on every task
  update.

Coverage must independently compare **both** `archived` and `archivedAt` against
the type-task baseline immediately before cutover — not `archived` alone. Codex's
sentinel applies: an unbackfilled task must succeed under the transitional rules
and fail under the final ones, and that failure is the cutover signal, never an
acceptable production state.

**[A14, 2026-09-05 — review finding M1] Reopen must be an exact field
allowlist.** The plan constrained the resulting values but never said the reopen
write may change *only* those values, and the deployed COH-006 rule otherwise
permits an authorized actor to edit nearly every task field. A client could
therefore atomically reopen and rename an archived task, alter its recipients, or
delete `nextRecurrenceCreatedAt` — and that last one defeats the recurrence
dedupe marker, so completing the reopened task mints a second successor.

The archived-to-active branch must use `diff().affectedKeys().hasOnly(...)` over
exactly `archived`, `archivedAt`, `status`, `completedAt`, `updatedAt`, and must
preserve `nextRecurrenceCreatedAt`. The ordinary active-to-active branch keeps
the existing COH-006 constraints unchanged, and no client branch permits
active-to-archived in either rule set.

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

**[A6, 2026-09-05 — ANSWERED] The backlink cleanup moves to the server, and
COH-007 keeps a total freeze.** The read-only-while-archived rule would have
blocked the cleanup that runs when a linked ticket or job is deleted. Four such
paths exist and **three are already broken in production**, independently of
archiving. Recorded as **DEC-2026-017**; the owner chose the server-side fix.

`archived` and `archivedAt` are therefore the only lifecycle exception — there is
**no backlink allowlist** in the archive write-lock. Archived means frozen, with
no carve-out to maintain.

**[A11, 2026-09-05 — review finding H1] The trigger is not permitted to clear a
link blindly.** My recommendation claimed a delete trigger adds no new permission
question because the delete was already authorized. That is true of the delete
and **false of the target write**. The create rule constrains no link field, so
an ordinary member can create a task naming any job in `linkedJobDocId`, delete
their own task, and have an Admin-privileged trigger clear the backlink on a job
they cannot update themselves. The same shape occurs without malice when a target
is relinked between the delete and the trigger.

The trigger task must therefore, for every direction:

- update the target **in a transaction**, clearing only when the target's
  backlink still equals the deleted document's **bare** id — `workItems` ids
  carry a `task_` / `mnt_` prefix while link fields hold bare ids, so a naive
  comparison silently never matches;
- treat a missing target or an already-null link as a successful no-op, and let
  transient failures reject so Eventarc retries — never reproduce the client's
  swallowed failures;
- accept a bare document id only, rejecting any value containing a path
  separator, and construct the target beneath the **event's** church id so a
  cross-tenant reference is structurally impossible;
- retain the existing client cleanup until the triggers are deployed and
  verified, removing it in a later gate. With reciprocal checks the overlap is
  idempotent and safe.

**[A18, 2026-09-05 — re-review finding N1] The reciprocal check alone is not
enough: routing must be pinned to the source's `type`.** A work-item's real
document id carries a `task_` / `mnt_` prefix while every link field stores the
bare suffix, so `task_x` and `mnt_x` share the bare id `x`. A member can create
`task_collision` carrying `linkedTaskDocId: 'victim'` — a field that has no
meaning on a task source — delete it, and, if the trigger follows any link field
it finds, drive a reciprocal match against a legitimate victim and clear a
backlink that had nothing to do with the deleted document. The reciprocal check
passes because the bare ids genuinely match.

The trigger must therefore route on the **trusted** `before.data().type` before
following any link field, and permit exactly these directions and no others:

| Deleted source | Field followed | Target field cleared |
|---|---|---|
| `type: 'task'` | `linkedJobDocId` | `jobListings.linkedTaskDocId` |
| `type: 'task'` | `linkedTicketDocId` | maintenance `workItems.linkedTaskDocId` |
| `type: 'task'` | `linkedReservationDocId` | `reservations.linkedSetupTaskDocId` |
| `type: 'maintenance'` | `linkedTaskDocId` | task `workItems.linkedTicketDocId` |
| job listing | `linkedTaskDocId` | task `workItems.linkedJobDocId` |

An unknown or missing `type`, and any link field that does not belong to the
source's type, must be a **no-op** — never a best-effort guess. Reservation
deletion to task is deliberately absent: DEC-2026-017 records that direction as a
pre-existing asymmetry outside this scope.

**Sequencing.** This is its own task, ahead of COH-007's rules gate, and it ships
independently because it fixes three live defects. It must be implemented,
reviewed, deployed and verified **before** COH-007's additive gate. COH-007's
rules work depends on it only in that the total freeze assumes the cleanup no
longer needs a client write path.

## Migration and rollout

This is a staged schema/read-path change, not a combined deploy.

1. **Finish COH-006.** Merge and deploy its final rules and complete its
   production verification. COH-007 touches the same central reader, rules,
   indexes, work board, and scheduled-functions file, so implementation must not
   overlap Gate 4.
2. **Plan review. — DONE 2026-09-05.** Claude amended this plan against the
   final COH-006 state (A1–A9). Codex's pre-implementation review
   (`docs/COH-007-PLAN-REVIEW-2026-09-05.md`, four High / three Medium, changes
   requested) and the owner's answers produced A10–A16. All product questions are
   answered; DEC-2026-016, -017 and -018 are accepted.

   2b. **Server-side backlink cleanup ships first — separate task.** Per
   DEC-2026-017 and A11, the `onDocumentDeleted` triggers with reciprocal
   transactional checks are their own task, deployed and verified before this
   plan's additive gate. They fix three defects that exist in production today
   and are what allows COH-007's archive freeze to be total with no allowlist.
3. **Additive gate.** Ship task writers, archive loader/UI, the **transitional**
   ruleset (A13), function code, monitoring entry, and all indexes — including
   the `completedAt` trailing field from A10 — without changing the active
   listeners or enabling production archiving. Verify the exact archive queries
   return an empty, authorized result rather than an index/rules error, and
   verify an unbackfilled legacy task and its comments remain fully usable.
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
5. **Reader gate.** After coverage and index probes pass, deploy the **final**
   ruleset (A13) and the active query constraints. Coverage must compare both
   `archived` and `archivedAt` against the type-task baseline, and the
   unbackfilled-task sentinel must fail under the final rules. Verify two accounts against team, own, assigned, shared,
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

**[A16, 2026-09-05] Codex's review carries the concrete cases; integrate them
rather than paraphrasing.** `docs/COH-007-PLAN-REVIEW-2026-09-05.md` contains
written fixtures and assertions for the forged-link/confused-deputy negative, the
reciprocal-clear positive with retry, the concurrent-relink race, the
cross-tenant link, the canonical-uid visibility case, the Insights/board
separation, the transitional-versus-final rules pair, the exact-reopen allowlist
with the recurrence-successor assertion, the archiver query/write race, and the
`completedAt <= cutoff` ordering **measurement**. Codex could not run any of
them — no emulator in its sandbox — so every one is a proposed case that Claude
integrates and runs, and none may be reported as independently verified.

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
