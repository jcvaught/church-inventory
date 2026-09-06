# COH-007 pre-implementation plan review — 2026-09-05

**Reviewed:** `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md` and the
handoff at repository commit `d4bc55967ea17cbcdc9e77ab95036d3751af89b2`

**Stage:** Design review. No COH-007 implementation exists at this SHA.

**Verdict:** **Changes requested.** The four authorization-shaped archive
queries are the right security shape, and A1's maintenance exclusion is correct,
but the plan is not implementation-ready. In particular, the recommended delete
trigger would create a new Admin-privileged write path from untrusted link fields,
the archive UI is instructed to discard documents authorized by the canonical
UID arrays, and the proposed Insights data flow risks putting archived tasks back
into the operational board.

I did not run the Firebase emulators and verified no test result. All emulator
and handler cases below are proposed cases for Claude to integrate and run.

## Findings

### High — H1: the delete-trigger recommendation is a confused deputy unless every clear is reciprocal

DEC-2026-017 says an `onDocumentDeleted` trigger introduces no new permission
question because the delete was already authorized. That premise is false for
the *target update*. The existing task rules do not constrain
`linkedJobDocId`, `linkedTicketDocId`, or `linkedReservationDocId`, and an
ordinary member may create and delete their own task. A member can therefore
create a task whose `linkedJobDocId` names an unrelated job and delete it. A
blind Admin-SDK trigger would clear that job's `linkedTaskDocId`, even though
the member cannot update the job under `firestore.rules`.

The same race exists without malice: a target can be relinked after the source
delete but before the trigger runs. A blind clear destroys the newer link.
Using `churchId` from the event prevents a normal cross-tenant reference, but
that must be structural: accept a bare document ID only, reject IDs containing
path separators, and construct the target beneath the event church. Recall that
link fields contain bare IDs while the deleted `workItems` ID is prefixed with
`task_` or `mnt_`.

Required design change: make each target update a transaction which reads the
target and clears only if its backlink equals the deleted source's **bare** ID.
Missing targets and already-null links are successful no-ops. Let transient
failures reject the invocation so Eventarc retries; do not reproduce the
client's swallowed failures. Keep the client cleanup until the triggers are
deployed and verified, then remove it in a later gate. With reciprocal checks,
overlap is safe and idempotent.

Exact handler cases:

```js
test('deleted task cannot clear an unrelated job through a forged link', async () => {
  // churchA/jobListings/job-victim points to task-legit.
  // Deleted churchA/workItems/task_attack says linkedJobDocId: 'job-victim'.
  await invokeWorkItemDeleted('churchA', 'task_attack', {
    type: 'task', linkedJobDocId: 'job-victim'
  });
  assert.equal((await get('churches/churchA/jobListings/job-victim')).linkedTaskDocId,
    'legit');
});

test('deleted task clears only a reciprocal job backlink and is idempotent', async () => {
  // Target points to bare id 'gone'; event id is prefixed 'task_gone'.
  await seed('churches/churchA/jobListings/job-1', { linkedTaskDocId: 'gone' });
  const event = deleted('churchA', 'task_gone', { type: 'task', linkedJobDocId: 'job-1' });
  await invoke(event);
  await invoke(event); // at-least-once delivery
  assert.equal((await get('churches/churchA/jobListings/job-1')).linkedTaskDocId, null);
});

test('concurrent relink wins over delayed delete cleanup', async () => {
  // Event says deleted task_gone linked to job-1. Before the trigger transaction
  // commits, job-1 is changed to linkedTaskDocId:'replacement'.
  await invokeWithBeforeTransactionCommit(event, async () =>
    update('churches/churchA/jobListings/job-1', { linkedTaskDocId: 'replacement' }));
  assert.equal((await get('churches/churchA/jobListings/job-1')).linkedTaskDocId,
    'replacement');
});

test('delete cleanup never follows a link outside the event church', async () => {
  await seed('churches/churchB/jobListings/job-1', { linkedTaskDocId: 'gone' });
  await invokeWorkItemDeleted('churchA', 'task_gone', {
    type: 'task', linkedJobDocId: 'churches/churchB/jobListings/job-1'
  });
  assert.equal((await get('churches/churchB/jobListings/job-1')).linkedTaskDocId,
    'gone');
});
```

Run the reciprocal positive, forged-link negative, retry, concurrent-relink,
missing-target, and cross-tenant cases for all directions: task to job/ticket/
reservation, ticket to task, and job to task.

### High — H2: A5 deliberately loses authorized archived tasks

The plan says the archive must apply `canSeeTask()` for consistency. That
predicate reads the `assignees` and `sharedWith` object arrays, while
DEC-2026-012 declares `assigneeUids` and `sharedWithUids` canonical for
authorization. Consequently an archive query can lawfully return a task and the
UI will hide it. Calling this pre-existing does not satisfy COH-007's acceptance
criterion that every authorized user can see the archived tasks they could see
before archiving; the plan explicitly carries the defect into a new reader.

Required design change: after the rule-compatible queries succeed, filter only
the `type == 'task'` invariant. Preferably change the shared client predicate to
mirror the canonical UID arrays (with a deliberate legacy fallback if still
needed) for both active and archive views. Do not treat an object-array predicate
as a second authorization decision after Firestore has authorized and delivered
the document.

Exact pure/query case:

```js
test('canonical assignee remains visible when presentation array is stale', () => {
  const task = {
    _docId: 'x', type: 'task', visibility: 'private', createdBy: 'creator',
    assigneeUids: ['assignee'], assignees: [], archived: true,
  };
  assert.equal(canSeeTask(task, 'assignee'), true);
});

test('archive merge retains every document returned by an authorized arm', async () => {
  // Seed the task above; run the archived assigned arm as `assignee`.
  const result = await loadArchive('assignee');
  assert.deepEqual(result.items.map(x => x._docId), ['x']);
});
```

Add the equivalent stale `sharedWith`/canonical `sharedWithUids` case. An
unrelated member must still receive `permission-denied` on a direct get and the
archive result must remain empty.

### High — H3: `visibleTasks` is the wrong join point for historical Insights

A4 says archives should be fed into `visibleTasks` because all three metrics
currently read it. But `visibleTasks` is also the source for `tasksByDocId`,
filters, Kanban/list rendering, selection, bulk actions, detail editing, and
linked-task behavior. Combining archives there can put completed archived rows
back on the active board and expose action affordances that rules will reject.
If the combination is conditional on `viewMode === 'insights'`, switching views
and retained archive state still becomes a subtle correctness boundary.

Required design change: keep `visibleTasks` active-only. Introduce a deduplicated
`insightTasks = active visible tasks + authorized loaded archives`, and compute
only the 12-week velocity and 90-day values from it. `completedThisMonth` stays
on active tasks by the accepted 42-day arithmetic. Loading/error state for
historical metrics must remain separate from the active store's completeness.

Exact UI case:

```js
test('loading Insights history never adds archives to an operational view', async () => {
  // Active fixture: task_active. Archive fixture: task_old.
  await openInsightsAndWaitForArchive();
  expect(metric('Completed in last 90 days')).toInclude('task_old');
  await switchView('Kanban');
  expect(card('task_active')).toBeVisible();
  expect(card('task_old')).not.toExist();
  expect(selectableTaskIds()).toEqual(['task_active']);
});
```

### High — H4: the additive rules gate has no legacy-state transition contract

The additive gate deploys archive lifecycle rules before the backfill, while
existing tasks have neither archive field. A straightforward implementation of
"archived false may be edited; archived true is frozen" using direct field
access will deny ordinary updates and comment writes on every legacy task until
backfill reaches it. Conversely, a permissive default that remains after the
backfill may allow a client to delete `archived`/`archivedAt` and disappear from
both equality-filtered readers. The plan protects concurrent creates but does
not define this update transition.

Required design change: specify a transitional rule at the additive gate and a
strict post-coverage rule before the reader cutover. The transitional rule must
default a missing pre-state to active without allowing a current-shaped task to
delete or corrupt either field. The final rule must require both fields on every
task update. Coverage must independently compare both `archived` and
`archivedAt` against the type-task baseline immediately before cutover.

Exact rules cases against the additive ruleset:

```js
test('additive rules keep an unbackfilled task and its comments usable', async () => {
  await seedLegacyTask('task_old', { createdBy: 'creator', visibility: 'private' });
  await assertSucceeds(updateDoc(asCreator('task_old'), { name: 'edited' }));
  await assertSucceeds(addComment(asCreator('task_old'), 'still active'));
});

test('a shaped active task cannot delete or corrupt archive state', async () => {
  await seedTask('task_new', { archived: false, archivedAt: null });
  await assertFails(updateDoc(asCreator('task_new'), { archived: deleteField() }));
  await assertFails(updateDoc(asCreator('task_new'), { archivedAt: deleteField() }));
  await assertFails(updateDoc(asCreator('task_new'), { archived: false, archivedAt: serverTimestamp() }));
});
```

Run the first case against the transitional rules and require it to fail under
the final rules if the document is deliberately left unbackfilled; that failure
is the cutover sentinel, not acceptable production state.

### Medium — M1: a reopen update needs an affected-field allowlist

The plan constrains the resulting lifecycle values, but does not say that the
reopen write may change *only* those values. The deployed COH-006 rule otherwise
allows an authorized actor to edit almost all task fields. A direct client can
therefore atomically reopen and rename an archived task, alter its recipients,
or delete `nextRecurrenceCreatedAt`. The last mutation defeats the existing
recurrence dedupe marker: completing the reopened task can create another next
occurrence.

Required design change: the archived-to-active branch must use
`diff().affectedKeys().hasOnly(...)` for `archived`, `archivedAt`, `status`,
`completedAt`, and `updatedAt`. Preserve `nextRecurrenceCreatedAt`. The ordinary
active-to-active branch stays under the existing COH-006 constraints, and no
client branch permits active-to-archived.

Exact rules and recurrence cases:

```js
test('reopen is exact and cannot smuggle a content or recurrence-marker edit', async () => {
  await seedArchivedRecurring('task_old', {
    nextRecurrenceCreatedAt: '2026-07-01T00:00:00.000Z'
  });
  const lifecycle = {
    archived: false, archivedAt: null, status: 'Backlog', completedAt: null,
    updatedAt: '2026-09-05T12:00:00.000Z'
  };
  await assertSucceeds(updateDoc(asAuthorized('task_old'), lifecycle));
  await resetFixture();
  await assertFails(updateDoc(asAuthorized('task_old'), { ...lifecycle, name: 'rewritten' }));
  await assertFails(updateDoc(asAuthorized('task_old'), {
    ...lifecycle, nextRecurrenceCreatedAt: deleteField()
  }));
});

test('reopening and re-completing a recurring task does not create a second successor', async () => {
  // Source is archived with nextRecurrenceCreatedAt set; one successor exists.
  await reopen('task_old');
  await completeThroughTheSupportedClientPath('task_old');
  assert.equal(await countSuccessorsOf('task_old'), 1);
});
```

Repeat the valid/invalid reopen matrix for creator, assignee, shared recipient,
team member, unauthorized same-church member, admin-without-visibility, inactive
member, and cross-tenant member. Assert direct active `false -> true`, forged
`archivedAt`, archived comment mutation, and archived delete all return exactly
`permission-denied`.

### Medium — M2: the eligibility query cannot deliver the promised malformed/missing telemetry

The query only examines documents having a `completedAt` value that falls in
its range. A missing field is absent from the query. A malformed string sorting
after the ISO cutoff is absent too. Other Firestore value types may enter or
miss the range according to cross-type ordering. Therefore "missing or malformed
is skipped, counted, and surfaced" cannot be true for the full population with
this query alone. At most, the worker can report malformed values returned by
the range query.

Required design change: either narrow the telemetry promise to
`malformedReturnedByEligibilityQuery`, or add a separate, deliberately bounded
data-quality audit. Do not turn the daily archiver into an unbounded scan merely
to preserve the wording.

The following emulator measurement must be committed before handler
implementation. Its expected `['eligible', 'null-date']` result is the plan's
null-ordering hypothesis, not a result I verified; if it fails, record the
observed exact IDs and update the design before writing the handler.

```js
test('MEASUREMENT: completedAt <= ISO cutoff membership includes null iff claimed', async () => {
  const cutoff = '2026-07-25T00:00:00.000Z';
  await seedWork('eligible',  { type:'task', status:'Complete', archived:false,
    completedAt:'2026-07-24T23:59:59.999Z' });
  await seedWork('boundary',  { type:'task', status:'Complete', archived:false,
    completedAt:cutoff });
  await seedWork('future',    { type:'task', status:'Complete', archived:false,
    completedAt:'2026-07-25T00:00:00.001Z' });
  await seedWork('null-date', { type:'task', status:'Complete', archived:false,
    completedAt:null });
  await seedWork('missing',   { type:'task', status:'Complete', archived:false });

  const snap = await admin.collectionGroup('workItems')
    .where('status', '==', 'Complete')
    .where('archived', '==', false)
    .where('completedAt', '<=', cutoff).get();
  assert.deepEqual(snap.docs.map(d => d.id).sort(),
    ['boundary', 'eligible', 'null-date']);
});
```

The handler must separately reject the equality boundary because eligibility is
strictly older. Add `bad-low: '!'`, `bad-high: 'not-an-iso-date'`, an old
Firestore Timestamp, a number, and a missing field; assert the worker never
archives any of them and that telemetry claims only what the query actually
examined.

### Medium — M3: the archive read cost grows without bound and duplicates reads

The design removes old tasks from five live listeners but replaces that with
four unbounded reads whenever Archive or Insights opens. A task matching team,
own, and assigned arms is billed/read more than once before client dedupe, and
the archive grows forever. Client-side substring search across the entire
history makes pagination impossible without changing search semantics.

This is not an immediate scale blocker at the measured COH-006 population (92
tasks across six churches), so soft flags remain a proportionate storage model.
It is nevertheless a missing product/architecture limit, not merely an
implementation detail. Before implementation, choose and record one of:

- explicitly accept full-history download for v1 with read-count/latency
  telemetry and a threshold that triggers redesign;
- bound the initial archive and load older pages, while documenting that search
  covers loaded pages only; or
- add a server-side/search-index path whose authorization projection is kept in
  step with DEC-2026-012.

Do not claim that on-demand alone bounds this cost.

## Required acceptance tests already implied by the plan

These are not additional findings, but they must be concrete in the
implementation handoff.

### Archiver query/write race

```js
test('a status reopen between query and write wins over archiving', async () => {
  await seedWork('race', {
    type:'task', status:'Complete', archived:false, archivedAt:null,
    completedAt:'2026-07-01T00:00:00.000Z'
  });
  const run = archiveWithHook({
    now:'2026-09-05T00:00:00.000Z',
    afterQueryBeforeWrite: () => admin.doc(workPath('race')).update({
      status:'Backlog', completedAt:null, updatedAt:'2026-09-05T00:00:01.000Z'
    })
  });
  const summary = await run;
  assert.deepEqual(pick(await getWork('race'),
    ['status','completedAt','archived','archivedAt']), {
      status:'Backlog', completedAt:null, archived:false, archivedAt:null
    });
  assert.equal(summary.archived, 0);
  assert.equal(summary.conflicted, 1);
});
```

The test hook must pause after the collection-group snapshot but before the
preconditioned update/transaction read. A blind batch must fail this case.

### A1 maintenance/source behavior

```js
test('active archive constraint never applies to maintenance', () => {
  const store = createWorkStore(['maintenance','team','own','assigned','shared']);
  store.snapshot('maintenance', mapOf(['mnt_1', { type:'maintenance' }]));
  store.snapshot('team', new Map());
  store.snapshot('own', new Map()); // archived==false excludes missing field
  store.snapshot('assigned', new Map());
  store.snapshot('shared', new Map());
  assert.deepEqual(store.read().maintenance.map(x => x._docId), ['mnt_1']);
});

test('a failed maintenance arm cannot publish a partial maintenance answer', () => {
  const store = settledStoreExcept('maintenance');
  store.fail('maintenance', 'failed-precondition');
  assert.equal(store.read().complete, false);
  assert.deepEqual(store.read().maintenance, []);
});
```

An untyped document is already discarded by `mergeWorkSources()` regardless of
which source returned it. A1 therefore creates no new visible loss for that
malformed case. The maintenance arm must remain unconstrained as planned.

### Archive authorization set

For each of `team`, `own`, `assigned`, and `shared`, seed one archived positive,
one active negative, and one archived task belonging only to another arm. Run
each exact production query as its intended member, assert exact IDs, then merge
all four and assert one copy per real document ID. Also assert exact
`permission-denied` for a bare `archived == true` query, an inactive member, and
a cross-tenant member. Use server reads; an empty cache is not evidence of an
empty authorized archive.

## Questions for the owner

1. Archive visibility itself is settled and is not a finding here. The
   unresolved question is narrower: does "same visibility" mean the canonical
   UID-array authorization established by DEC-2026-012 (recommended), or the
   current board's known-stale object-array presentation bug? H2 assumes the
   canonical contract governs.
2. For DEC-2026-017, is the owner willing to approve the trigger only with
   reciprocal transactional checks and staged removal of client cleanup? A
   blind post-delete Admin update should not be an available option.
3. Is full-history client download an explicitly accepted v1 scale limit, and
   if so, at what observed read-count or latency should archive search be
   redesigned?

## Review boundary

I reviewed the plan against the pinned code, including the five work-item
listeners and task writers in `src/useFirestore.js`, per-source merge behavior,
the current object-array visibility predicate, `WorkBoard` recurrence and
Insights paths, final COH-006 rules, current indexes, scheduled-function
infrastructure, and DEC-2026-012/015/016/017. I did not fetch, push, deploy,
modify production data, or start emulators.
