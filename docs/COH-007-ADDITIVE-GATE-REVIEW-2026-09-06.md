# COH-007 additive gate implementation review — 2026-09-06

**Reviewed:** commits `a7d490d`, `e4230c3`, `d62e92b`, and `5d2ac1b` at
`5d2ac1b384c90732cedd3083a769ca69bccc3b64`, against `main` at `6dbc6c6`
and the normative plan in `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md`
(A1–A20).

**Stage:** additive-gate implementation review. Nothing was deployed or tested
against production.

**Verdict:** **Changes requested.** The four archive query arms, canonical-UID
visibility correction, reopen allowlist, ordinary arm-failure taxonomy, dry-run
default, and index inventory are directionally sound. Two plan contracts are
not met: malformed archive state fails open for comment/delete operations, and
the Insights presentation calls a changing live/frozen join an as-of snapshot
even after it ceases to represent that instant.

## Verification constraints and results

I cannot bind the Firebase emulator ports in this sandbox. I therefore did **not**
run `npm run test:rules` or `npm run test:handlers`, and **no rules or handler
test result in this review is independently verified**. Claude's reported
`101/101` rules and `72/72` handler results remain unreproduced by a second
party. Every emulator case below is a written case for Claude to integrate and
run, not a claimed result.

```text
npm run test:unit — PASS, 152/152
npm run lint      — PASS, 0 errors and 51 warnings
npm run build     — PASS, 29 JS chunks, 0 jsxDEV; prerender and verify-prod-bundle passed
npm run test:rules — NOT RUN; sandbox cannot bind emulator ports
npm run test:handlers — NOT RUN; sandbox cannot bind emulator ports
```

Environment observed: Node `v25.8.0`, Firebase CLI `15.10.0`. This shell could
not locate a Java runtime, which is an additional local obstacle to starting the
emulators.

## Reviewer Findings

### Critical

None.

### High

#### H1 — malformed archive state fails open for comment writes and deletion

`itemIsArchived(d)` is implemented as `d.get('archived', false) == true`
(`firestore.rules:88`). Every value other than the boolean `true` is therefore
classified as active. `activeArchiveShapeHeld()` prevents most content updates
from preserving a malformed value, but the comment and delete rules consult only
`itemIsArchived()`. A task carrying `archived: 'true'`, `archived: 1`, or a
malformed pair such as `archived:false` plus a non-null `archivedAt` permits
comment writes and, for its creator/admin, permanent deletion. That is not a
fail-closed malformed state.

The direct-SDK attack does **not** let a member create or update a valid task to
`archived:true`; those paths are correctly denied. It does show that an Admin
SDK/import/migration defect, or pre-existing malformed document, loses the
archive freeze precisely where the handoff asks the predicate to fail closed.
The transitional exception should recognize exactly two active shapes: neither
field present (legacy), or `archived` present as boolean `false` with
`archivedAt:null`. A present malformed or partial pair should be locked for
updates, comments, and deletes. Boolean `true` should stay frozen even if its
timestamp is malformed, so it can still be repaired only through the exact
reopen transition.

Exact rules case to add to `functions/test/rules/coh007-archive.test.mjs`:

```js
test('malformed archive discriminators fail closed for content, comments and delete', async () => {
  const malformed = [
    ['string-true',  { archived: 'true', archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['number-one',   { archived: 1, archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['false-stamped',{ archived: false, archivedAt: new Date('2026-08-12T00:00:00.000Z') }],
    ['partial',      { archived: false }],
  ];
  for (const [id, shape] of malformed) {
    await put(`task_${id}`, legacy({ visibility: 'private', ...shape }));
    await seed(P(`workItems/task_${id}/comments/c1`), {
      text: 'before', authorId: 'creator', authorName: 'Creator', createdAt: 'then',
    });
    await assertFails(updateDoc(ref('creator', id), { name: 'edited', updatedAt: 'now' }));
    await assertFails(addDoc(collection(as('creator'), P(`workItems/task_${id}/comments`)), {
      text: 'after', authorId: 'creator', authorName: 'Creator', createdAt: 'now',
    }));
    await assertFails(updateDoc(doc(as('creator'), P(`workItems/task_${id}/comments/c1`)), { text: 'edited' }));
    await assertFails(deleteDoc(ref('creator', id)));
    await assertFails(deleteDoc(ref('boss', id)));
  }
});
```

Keep the existing exact legacy fixture with **both fields absent** succeeding;
that is the compatibility boundary and prevents a fail-closed repair from
freezing the live unbackfilled board.

#### H2 — the Insights “as-of” snapshot changes after its stated instant

`mergeInsightTasks()` correctly makes live active data win a collision, closing
the reopen direction of A20. It does not close the archive direction. After a
successful one-shot archive read, `visibleTasks` remains live. If task `x` is
archived at T1, the active listeners drop it while the frozen archive result from
T0 does not gain it. `insightTasks` then loses `x`, but `insightArchive.complete`
remains true and the UI continues to say “History including archived tasks, as
of T0” (`WorkBoard.jsx:2180-2183`). The figures no longer describe T0 (where `x`
was active and included) or T1 (where `x` is archived and should be included).
An incomplete metric is therefore presented with the normal complete
presentation.

This is the exact forward race A20 required the implementation to solve by
refreshing or by presenting a genuine snapshot. Either detect a live task's
departure and invalidate/refresh the archive result, or freeze the active half
at the same snapshot boundary. The current label alone does not make a live
array immutable.

Exact state/UI case:

```js
test('a task archiving after Insights loads cannot disappear under a complete as-of label', async () => {
  const x = {
    _docId: 'x', type: 'task', status: 'Complete', archived: false,
    completedAt: '2026-08-01T00:00:00.000Z',
  };
  renderInsights({ activeTasks: [x], archiveResult: {
    items: [], complete: true, failures: [], loadedAt: '2026-09-06T12:00:00.000Z',
  }});
  expect(historyStatus()).toEqual({ kind: 'complete', asOf: '2026-09-06T12:00:00.000Z' });
  expect(completedIdsIn90DayMetric()).toContain('x');

  // The server archives x after the one-shot read. The live active source drops
  // it; the frozen archive source is still the successful T0 result.
  rerenderInsights({ activeTasks: [], sameArchiveResult: true });

  // Either policy permitted by A20 is acceptable, but the current combination
  // (complete + x absent) is not.
  assert.ok(
    historyStatus().kind !== 'complete'
      || completedIdsIn90DayMetric().includes('x'),
    'a complete T0 snapshot must retain x, otherwise the history must invalidate/refresh',
  );
});
```

The existing pure “live wins” case should remain; it correctly covers the
opposite, reopen-after-read race.

### Medium

#### M1 — impossible calendar dates pass the “valid ISO timestamp” guard

`isUsableCompletedAt()` combines a shape regex with `Date.parse()`. JavaScript
normalizes some impossible dates instead of returning `NaN`; for example,
`Date.parse('2026-02-30T00:00:00.000Z')` resolves into March. The helper therefore
returns true and the worker can archive a task whose `completedAt` is not a valid
calendar timestamp, contrary to product contract 1 and the helper's own comment.
Validate by round-tripping the parsed UTC instant to the canonical components,
or use a parser that rejects calendar overflow.

Exact pure case for `functions/test/archive-eligibility.test.mjs`:

```js
test('calendar-impossible ISO-looking completion dates are malformed', () => {
  for (const value of [
    '2026-02-30T00:00:00.000Z',
    '2025-02-29T00:00:00.000Z',
    '2026-04-31T23:59:59.999Z',
  ]) {
    assert.equal(isUsableCompletedAt(value), false, value);
    assert.deepEqual(verdict({ completedAt: value }), {
      eligible: false,
      reason: 'malformed-completed-at',
    });
  }
});
```

#### M2 — transaction retries can overcount archived/conflicted telemetry

`summary.archived++` and `summary.conflicted++` occur inside the Firestore
transaction callback (`functions/index.js:3898-3908`). Firestore may invoke that
callback more than once. A retry after `t.update()` increments `archived` once
per attempt even though only one commit occurs; an ultimately failed commit can
also leave both `archived` and `failed` incremented. Conflict counts have the
same retry sensitivity. That makes the scheduled heartbeat unreliable at the
automation gate. Return an outcome from the callback and increment summary
counters only after `runTransaction()` resolves.

Exact handler case (use a transaction test double that invokes its callback
twice before resolving one committed write, so this does not depend on timing):

```js
test('a retried transaction counts one committed archive exactly once', async () => {
  await put('retry', task({ completedAt: '2026-01-01T00:00:00.000Z' }));
  const funcs = await loadFunctions();
  funcs._setArchiveTransactionRunner(async callback => {
    await callback(fakeTransaction({ forceRetryAfterCallback: true }));
    return callback(fakeTransaction({ commit: true }));
  });
  let summary;
  try { summary = await run(funcs, { writesEnabled: true }); }
  finally { funcs._resetArchiveTransactionRunner(); }
  assert.equal((await get('retry')).archived, true);
  assert.equal(summary.archived, 1);
  assert.equal(summary.conflicted, 0);
  assert.equal(summary.failed, 0);
});
```

The fixture seam can instead be a focused unit around an extracted
`archiveCandidate(ref)`; the essential assertion is one committed document →
exactly one `archived` count despite two callback executions.

#### M3 — an archived comment-read failure renders as an empty discussion

The archive **list** does not turn an ordinary Firestore arm failure into the
“Nothing archived yet” state: every arm is caught, named, and makes
`complete:false`. That part passes review. The archived-detail reader does still
erase its comments and clear the spinner on every listener error without an
error state (`ArchivedTasks.jsx:73-85`). A permission, network, or query failure
there is indistinguishable from a task with no discussion, despite the archive
promise that comments/history remain intact. Preserve an explicit comments
error and retry state.

Exact component case:

```js
test('an archived-comment listener error never renders an empty discussion', async () => {
  renderArchivedDetail({ task: archivedTaskWithKnownCommentCount(1) });
  failCommentListener({ code: 'permission-denied' });
  expect(screen.getByText(/comments could not be loaded/i)).toBeVisible();
  expect(screen.getByRole('button', { name: /retry comments/i })).toBeVisible();
  expect(emptyCommentState()).not.toBeVisible();
});
```

### Low

None.

### Questions

#### Q1 — pin the final ruleset sentinel before the reader gate

Yes. The final ruleset should be represented by an executable test now (or, at
latest, as the first reader-gate commit), because “unbackfilled succeeds under
transitional and fails under final” is the cutover sentinel. Prose cannot prove
that both fields, rather than only `archived`, are required. This is not a reason
to deploy final rules in the additive gate.

Use the same seeded documents against two explicitly supplied rules sources:

```js
test('the cutover sentinel distinguishes transitional from final archive rules', async () => {
  for (const [rules, legacyShouldSucceed] of [
    [TRANSITIONAL_RULES, true],
    [FINAL_RULES, false],
  ]) {
    const e = await environmentWithRules(rules);
    await seedIn(e, 'task_legacy', legacy());                 // neither field
    await seedIn(e, 'task_missing_at', { ...active(), archivedAt: deleteFieldFromFixture() });
    await seedIn(e, 'task_missing_flag', without(active(), 'archived'));
    await seedIn(e, 'task_shaped', active());

    await expectRule(updateName(e, 'task_legacy')).toBe(legacyShouldSucceed ? 'allowed' : 'denied');
    await assertFails(updateName(e, 'task_missing_at'));
    await assertFails(updateName(e, 'task_missing_flag'));
    await assertSucceeds(updateName(e, 'task_shaped'));
    await assertSucceeds(addComment(e, 'task_shaped'));
  }
});
```

The final fixture must also make stale creates without both fields fail. Keep it
SHA-pinned with the reader-gate implementation so the sentinel cannot silently
continue exercising transitional rules.

#### Q2 — A3 measurement

I accept `['boundary', 'eligible']` as the emulator result for the exact fixture.
It is stronger evidence than the plan's inference from total value ordering, and
the guard must remain regardless. The expected null counter may therefore be
zero in the emulator.

One wording/probe correction is needed: the first production dry run does not by
itself “remeasure” null exclusion. Its eligibility query can only report what it
returned; zero malformed results cannot distinguish “production excludes null”
from “there were no complete, active, null-dated documents.” The production
probe should independently count/read the population matching
`status == 'Complete'`, `archived == false`, and `completedAt == null`, then
compare those known IDs with the range result. If that baseline is empty, record
the production question as unmeasured rather than resolved. No write needs to be
enabled, and this does not justify removing the defensive validator.

#### Q3 — index field order

I accept the declared equality-first, array-membership, then `completedAt`
ordering as a deployable assumption, not as verified fact. It is consistent with
the already-deployed `(visibility, sharedWithUids)` equality/array shape and with
Firestore's guidance that equality fields prefix the scan while the ordered
range field follows. A manual index may contain only one array field, which each
of these does. The four short and four long COLLECTION indexes remain separately
necessary because a document missing `completedAt` has no entry in the longer
index.

No source-only argument settles the exact planner match for all nine declarations.
Keep the handoff's required production probes for each exact query, including an
active task with `completedAt` absent and the bounded reader excluding it. A
successful index deploy alone is not acceptance.

#### Q4 — archive reader empty-state taxonomy

For the four top-level archive arms, no ordinary Firestore failure renders as an
empty archive: `complete:false` suppresses the empty state and names the failed
arms. An unexpected exception after those reads (for example in merge/presentation)
has no outer catch and can leave the view loading rather than empty; that is a
robustness gap but not a false empty answer. The concrete false-empty remaining
case is the archived comment subreader in M3.

## Verdict

**Changes requested.** Resolve H1 and H2 before the additive gate is handed to
the owner for deployment. Integrate and run the written rules/handler cases,
including M1/M2 where the implementation changes. M3 may be resolved in the
same pass or explicitly scheduled before archive data can exist, but it should
not reach the automation gate unchanged. Pin the final-rule sentinel before the
reader cutover. The A3 guard stays; correct the production-measurement claim and
retain the independent production probe. The index order is acceptable only
subject to the already-planned exact production probes.
