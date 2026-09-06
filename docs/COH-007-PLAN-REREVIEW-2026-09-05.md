# COH-007 archiving plan re-review — 2026-09-05

**Reviewed:** `docs/COH-007-PLAN-REVIEW-2026-09-05.md`, amendments A10–A16
in `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md`, and DEC-2026-016,
DEC-2026-017, and DEC-2026-018 at repository commit
`518dc0b8c81b3fcf9c04dfe956d0c71f8a151a4a`.

**Stage:** Re-review of the amended design. No COH-007 implementation exists at
this SHA.

**Verdict:** **Changes requested.** The amendments materially repair all four
original High findings and two of the three Medium findings. M2 is only
partially closed because the old population-wide telemetry promise remains in
the data-model contract. More importantly, the amendment pass introduces three
implementation-blocking correctness/security ambiguities: the reciprocal
delete trigger is not explicitly type-discriminated despite colliding bare IDs,
the bounded Insights query can be narrower than the metric it feeds, and A10's
single longer index set may exclude active legacy documents that lack
`completedAt`. The separate `insightTasks` state also needs a defined
cross-source snapshot policy so a scheduled archive or reopen cannot silently
change a metric through merge order or a one-shot/live race.

I did not start the Firebase emulators and verified no test result. Every test
below is a proposed case for Claude to integrate and run.

## Disposition of the original findings

### H1 — Closed in principle; one new trigger-routing defect remains

A11 lines 417–445 withdraw the blind Admin update and require, for every
direction, a transaction, a reciprocal backlink comparison against the deleted
document's bare ID, same-church path construction, idempotent no-ops, retryable
failures, and staged client-cleanup removal. Rollout step 2b lines 461–465 makes
that a separately shipped prerequisite. DEC-2026-017 lines 794–809 records the
owner's acceptance and expressly rejects the blind alternative. Those changes
close the confused-deputy defect identified in H1.

This is a changed design, not a restatement. However, A11 does not expressly say
that a deleted `workItems` document is routed by its trusted `type` before any
link field is followed. That omission creates the new N1 finding below.

### H2 — Closed, subject to pinning fallback semantics

A5 lines 195–223 now says that the archive applies no second authorization
filter, filters only the `type == 'task'` invariant, and changes `canSeeTask()`
to use the canonical `assigneeUids` / `sharedWithUids`. This directly reverses
the prior proposal to carry the object-array predicate into the archive. The
owner's canonical-UID answer is recorded at lines 209–211.

At this SHA `canSeeTask()` has only one production consumer,
`WorkBoard.jsx:667`; changing its primary fields does not break a second caller.
All current task writers and the completed COH-006 backfill supply the canonical
arrays. A genuine pre-projection document cannot be recovered by the board
fallback if Firestore's canonical-array query/rule never returns it, so the
fallback is a presentation compatibility guard, not an authorization or
migration substitute. The only safe interpretation is fallback on field
**absence**, never merely on an empty canonical array:

```js
test('canSeeTask falls back only when the canonical projection is absent', () => {
  const staleObject = [{ uid:'old-recipient' }];
  assert.equal(canSeeTask({ visibility:'shared', sharedWith:staleObject },
    'old-recipient'), true); // genuine pre-projection document
  assert.equal(canSeeTask({ visibility:'shared', sharedWithUids:[],
    sharedWith:staleObject }, 'old-recipient'), false); // canonical empty wins
});
```

Repeat for `assigneeUids` / `assignees`, and retain the canonical-positive / stale
object-negative cases from the first review.

### H3 — Closed for operational-board separation; snapshot completeness remains

The revised A4 lines 103–126 explicitly forbids adding archives to
`visibleTasks`, keeps that array active-only, creates a deduplicated
`insightTasks`, limits its consumers to the 12-week velocity and 90-day value,
and separates historical loading/error state from active-store completeness.
That is the design change H3 required and prevents archived rows from reaching
Kanban, list, selection, detail editing, or bulk actions.

The amendment does not yet define precedence or refresh behavior when a live
active source is combined with one-shot archive sources. N4 below is a new
completeness problem in the replacement design; it does not reopen the rejected
`visibleTasks` join.

### H4 — Closed

A13 lines 358–380 specifies a transitional ruleset at the additive gate, a
strict final ruleset before reader cutover, two-field coverage against the task
baseline, and the deliberately unbackfilled sentinel. Rollout lines 466–492
place the transitional rules before backfill and the final rules before/with the
reader cutover. This changes the transition contract rather than repeating H4.

There is no obvious unprotected authorization window. Transitional rules must
already deny forged archive transitions and freeze shaped archived tasks; final
rules tighten missing-field handling before equality-filtered readers become
authoritative. Old clients under final rules may receive archived documents
through their old queries but cannot mutate them, while the new query client is
compatible with either ruleset. The implementation handoff should still execute
this compatibility matrix rather than infer it:

```js
test('both rollout rulesets protect both client generations', async () => {
  // staleClient uses the pre-COH-007 query/write shapes;
  // newClient uses archived==false readers and shaped writes.
  await deployRules('transitional');
  await assertSucceeds(staleClient.edit(legacyActiveTask));
  await assertFails(staleClient.edit(shapedArchivedTask));
  await assertSucceeds(newClient.edit(shapedActiveTask));

  await deployRules('final');
  await assertFails(staleClient.edit(legacyActiveTask)); // cutover sentinel
  await assertFails(staleClient.edit(shapedArchivedTask));
  await assertSucceeds(newClient.edit(shapedActiveTask));
});
```

### M1 — Closed

A14 lines 382–394 requires
`diff().affectedKeys().hasOnly(['archived','archivedAt','status','completedAt',
'updatedAt'])`, preserves `nextRecurrenceCreatedAt`, leaves active-to-active
under COH-006, and denies every client active-to-archived branch. A16 lines
541–550 requires integration of the exact smuggled-edit and duplicate-successor
tests from the first review.

### M2 — Partially closed

A12 lines 291–300 correctly narrows worker telemetry to
`malformedReturnedByEligibilityQuery`, rejects an unbounded daily audit, and
makes population-wide data quality a separate decision. A3 retains the required
emulator measurement, and A16 requires its exact fixture.

But the earlier data-model contract at lines 141–145 still says every completed
task with a missing or malformed `completedAt` "is skipped, counted, and
surfaced in function telemetry." A12 itself says the plan must not imply that.
The amendment therefore leaves two contradictory requirements in the same plan.
Delete or qualify lines 143–145 so they promise only that returned malformed
values are guarded and counted; missing/out-of-range malformed values are unseen.

### M3 — Closed

A10 lines 236–241 adds the ordered `completedAt` dimension required for bounded
queries. A15 lines 80–90 and DEC-2026-018 lines 867–888 choose a 12-month
default archive window with explicit widening and honest loaded-window copy,
give Insights its own 90-day bound, and defer search indexing/service behind a
latency/read tripwire. This is one of the alternatives M3 requested and removes
the unbounded-read promise. The measured 134-work-item basis makes that choice
proportionate. N2 concerns the exact index realization, not the product decision.

## New findings introduced or exposed by A10–A16

### High — N1: reciprocal checks are still exploitable unless work-item trigger routing is type-pinned

A11 says "for every direction" but never maps allowed source types and fields.
That matters because a work-item real ID includes its type prefix while every
link stores the bare suffix. A direct client can choose `task_x` while an
unrelated legitimate maintenance ticket `mnt_x` already exists. If the generic
work-item delete trigger follows `linkedTaskDocId` on any deleted work item, an
attacker can make the reciprocal check pass against a victim task whose
`linkedTicketDocId == 'x'`, then delete `task_x`; the trigger clears a legitimate
ticket backlink even though the deleted source was not that ticket.

The prerequisite trigger plan must route on `before.data().type` and permit
exactly these directions:

- deleted `type:'task'`: `linkedJobDocId -> job.linkedTaskDocId`,
  `linkedTicketDocId -> maintenance.linkedTaskDocId`, and
  `linkedReservationDocId -> reservation.linkedSetupTaskDocId`;
- deleted `type:'maintenance'`: `linkedTaskDocId -> task.linkedTicketDocId`;
- deleted job: `linkedTaskDocId -> task.linkedJobDocId`.

Unknown/missing types and fields that do not belong to that source type must be
no-ops. Reservation deletion to task is not accidentally missing here:
DEC-2026-017 lines 766–771 explicitly records that pre-existing asymmetric
direction as out of scope.

```js
test('task and maintenance documents with the same bare id cannot impersonate each other', async () => {
  await seed('churches/c/workItems/mnt_collision', {
    type: 'maintenance', linkedTaskDocId: 'victim'
  });
  await seed('churches/c/workItems/task_victim', {
    type: 'task', linkedTicketDocId: 'collision'
  });
  await seed('churches/c/workItems/task_collision', {
    type: 'task', linkedTaskDocId: 'victim' // invalid direction on this source type
  });

  await deleteAndInvoke('churches/c/workItems/task_collision');
  assert.equal((await get('churches/c/workItems/task_victim')).linkedTicketDocId,
    'collision');

  await deleteAndInvoke('churches/c/workItems/mnt_collision');
  assert.equal((await get('churches/c/workItems/task_victim')).linkedTicketDocId,
    null);
});
```

DEC-2026-017 also retains stale prose at lines 694–705 saying there is "no new
permission question," its old trigger shape at lines 780–792 saying there is no
new authorization surface, and lines 832–835 saying the decision is Proposed
and implementation must not begin. Those statements directly contradict the
Accepted decision at lines 794–809. Remove or mark the superseded passages; a
security prerequisite should not require implementers to guess which paragraph
is normative. The workboard likewise retains the obsolete "Blocking open
decision" at lines 360–365 after recording acceptance at lines 345–354.

### High — N2: A10's longer indexes may silently omit active tasks with missing `completedAt`

A10 says one four-index set with `completedAt` trailing serves both active and
archive reads. The bounded archive/Insights query must order/range on
`completedAt`, so excluding a document with that field missing is correct there.
The active board has no such chronology predicate and must still return an
otherwise valid active task with missing `completedAt`; the plan explicitly
acknowledges that population at A3/A12 and the backfill deliberately does not
repair it.

Do not assume a prefix scan of `(authorization fields, archived, completedAt)`
will return documents that have no entry for the trailing field, or that the
planner will choose index merging instead. Preserve the shorter A2 indexes for
active reads and add the longer A10 variants for bounded reads, unless an exact
emulator measurement proves the single-set claim. Production probes must include
a shaped active task with `completedAt` absent, not only normal null-valued
fixtures.

```js
test('active authorization arms retain a shaped task with completedAt absent', async () => {
  await seedTask('missing-date', {
    type:'task', visibility:'team', archived:false, archivedAt:null
    // completedAt deliberately absent
  });
  const ids = await runExactActiveTeamQuery();
  assert.deepEqual(ids, ['missing-date']);
});
```

Repeat for `own`, `assigned`, and `shared`. Separately assert that the bounded
archive query excludes the same malformed shape rather than presenting it as a
search result.

### Medium — N3: the 90-day query bound can be narrower than the advertised 90-day metric

The current metric derives a local date 90 days ago and counts every task whose
`completedAt.slice(0, 10) >= thatDate`. If A15 implements the query bound as the
exact ISO instant 90 elapsed days ago, completions earlier on that boundary date
are excluded by Firestore even though the metric counts them. Active plus archive
then silently undercounts exactly the acceptance criterion A4 is meant to fix.
The 12-week chart has several days of buffer inside 90 days; the `Avg/Week (90d)`
tile does not.

Define the query lower bound from the start of the metric's advertised boundary
date (with an explicit timezone contract), or query a conservative earlier UTC
instant and retain the existing client date predicate. Apply the same precision
to the archive's "12 months" copy: state the exact included date range when the
window is shown.

```js
test('Insights query contains every completion the 90-day metric counts', async () => {
  // Clock is 2026-09-05T15:00:00 in the church/UI timezone. The metric's
  // boundary date is 2026-06-07.
  await seedArchived('boundary-morning', {
    completedAt:'2026-06-07T08:00:00.000Z'
  });
  const queried = await loadInsightArchives({ now:'2026-09-05T15:00:00.000Z' });
  assert.equal(metricWouldCount('boundary-morning'), true);
  assert.equal(queried.some(t => t._docId === 'boundary-morning'), true);
});
```

### Medium — N4: `insightTasks` has no temporal merge contract across live and one-shot sources

Deduplication by document ID closes ordinary overlap but not state races. If an
active task archives after the one-shot archive reads settle, the live listener
removes it and the frozen archive set never gains it, so the metric silently
drops until the view reloads. In the reverse direction, a reopened task can be
present in both sets; if stale archive data wins the map collision, its old
`Complete`/`completedAt` values continue to count after the live task is
`Backlog` with `completedAt:null`.

The plan must define a coherent load-cycle policy. At minimum, current active
data must win collisions, all four archive arms must settle successfully before
metrics are marked complete, and a task leaving active during an open Insights
load must trigger a refresh or remain in an explicit as-of snapshot. A partial
or temporally torn metric must never reuse the normal complete presentation.

```js
test('live reopened state wins over stale archive state in insightTasks', () => {
  const staleArchive = [{ _realDocId:'task_x', status:'Complete', archived:true,
    completedAt:'2026-08-01T00:00:00.000Z' }];
  const liveActive = [{ _realDocId:'task_x', status:'Backlog', archived:false,
    completedAt:null }];
  const merged = mergeInsightTasks(liveActive, staleArchive);
  assert.deepEqual(merged, liveActive);
});

test('daily archive during an open Insights load cannot silently drop history', async () => {
  await openInsightsAndSettle(); // task_x is active and included
  await runArchiverFor('task_x');
  await waitForActiveListenerRemoval('task_x');
  await expectInsightStateToSettle();
  assert.equal(insightMetricIncludes('task_x'), true);
  assert.equal(insightState().complete, true);
});

test('one failed archive arm never publishes a complete historical metric', async () => {
  archiveArm('team').resolve([]);
  archiveArm('own').resolve([]);
  archiveArm('assigned').reject({ code:'failed-precondition' });
  archiveArm('shared').resolve([]);
  await expectInsightStateToSettle();
  assert.equal(insightState().complete, false);
  assert.equal(insightState().error.code, 'failed-precondition');
  expect(avgWeek90d()).not.toHaveNormalMetricPresentation();
});
```

## What must be settled before implementation

Before implementation starts:

1. Amend A11/DEC-2026-017 to type-pin the exact reciprocal direction map, and
   remove the superseded security/decision prose. The separate trigger task must
   then be implemented, reviewed, deployed, and verified before COH-007's
   additive gate, as the accepted sequencing already requires.
2. Resolve N2 by keeping separate active and bounded-query indexes or by first
   recording the exact missing-field measurement. Do not put the active-board
   cutover behind an unmeasured index assumption.
3. Define the 90-day lower-bound semantics from N3 and the temporal merge policy
   from N4. Both determine whether the advertised historical metrics are
   complete, not merely how the code is organized.
4. Remove the contradictory population-wide telemetry sentence and specify that
   canonical-array fallback occurs only when the canonical field is absent.

The owner has no remaining product-policy choice. The archive visibility,
reciprocal-trigger requirement, 12-month default, explicit widening, 90-day
Insights bound, and no-search-service v1 choice are all settled. During
implementation Claude may choose component boundaries, loading visuals, exact
widen-control presentation, batching size below platform limits, and copy style,
provided the accepted contracts and tests above remain true.

## Review boundary

I reviewed the amended plan against the pinned `canSeeTask()` consumer, the five
COH-006 query sources and merge/error coordinator, current WorkBoard metrics,
link cleanup call sites and prefix helpers, and the three accepted decision
records. I did not fetch, push, deploy, modify production data, start emulators,
or verify any claimed test result.
