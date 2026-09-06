# COH-008 implementation review — 2026-09-06

**Reviewed:** implementation commit
`e1a71461c2085695f967ea644a5123f3cbaf7ad5` against parent
`7c09ba250e055a57a52c5ff64fa89433ad007300`, including the surrounding client
cleanup call sites, Firestore rules, handler harness, A18, and DEC-2026-017.

**Verdict: CHANGES REQUESTED.** Reciprocity, event-church path construction,
the five-field direction allowlist, and the retry/partial-progress loop are
well-shaped. However, work-item type pinning is incomplete in a way that leaves
an Admin-SDK confused-deputy path around N1: the implementation trusts the
document's `type` while accepting either work-item ID prefix, and the rules do
not bind those two values. Target work-item kinds are not checked either.

I did not run the Firebase emulators or any other verification command. I
verified **no test result**. In particular, Claude's reported 58/58 handler
result, zero-error lint result, and clean build are unreproduced by this review.

## Findings

### High — H1: `type` is not pinned to the source ID prefix, so N1 remains exploitable

`cleanupWorkItemBacklinks` selects `sourceKind` from `before.data().type`, but
`bareWorkItemId()` accepts both `task_` and `mnt_` for either selected kind.
That would be safe only if the rules enforced `type:'task'` at `task_*` and
`type:'maintenance'` at `mnt_*`. They do not: the create rule checks the type's
shape and authorization, but never checks `docId`. An ordinary member can
therefore create and delete a fully rule-valid `type:'task'` document at
`mnt_victim`.

That opposite-prefix task reduces to bare ID `victim`. If it names a job whose
legitimate backlink points to the real `task_victim`, reciprocity passes and the
trigger clears the job with Admin privileges. The attacker cannot make that
job update directly under the `jobListings` rule. This is the same bare-ID
impersonation class N1 required type pinning to close; routing only by a mutable
document field does not close it when the supposedly corresponding ID namespace
is unchecked.

Required fix: bind the source discriminator to its document ID before following
anything: `type:'task'` accepts only `task_…`, and `type:'maintenance'` accepts
only `mnt_…`. A mismatch is a no-op. Equivalently, make bare-ID extraction take
the expected source kind and accept only its one prefix. Do not broaden the
Firestore rules as part of this task unless separately planned; the privileged
trigger must fail closed on data the current rules already permit.

Exact failing handler case (the task fixture includes the fields required by
the current create rule so this is not merely malformed imaginary data):

```js
test('opposite-prefix task cannot impersonate the real task with the same bare id', async () => {
  await set(`churches/${CHURCH}/workItems/task_victim`, {
    type: 'task', createdBy: 'owner', visibility: 'private',
    assigneeUids: [], sharedWithUids: [],
  });
  await set(`churches/${CHURCH}/jobListings/job-victim`, {
    linkedTaskDocId: 'victim',
  });

  // A regular member can create this shape under the current rule. Its type is
  // valid but its prefix is deliberately the maintenance namespace.
  const forged = {
    type: 'task', createdBy: 'attacker', visibility: 'team',
    assigneeUids: [], sharedWithUids: [], linkedJobDocId: 'job-victim',
  };
  await funcs.cleanupWorkItemBacklinks.run(
    deletedEvent(CHURCH, 'mnt_victim', forged)
  );

  assert.equal(
    (await get(`churches/${CHURCH}/jobListings/job-victim`)).linkedTaskDocId,
    'victim'
  );
});
```

The symmetric `task_victim` + `type:'maintenance'` mismatch should also be a
no-op, although creating/deleting maintenance is role-restricted.

The comments in `functions/index.js` and `CLAUDE.md` currently call `type`
trusted and state that type pinning closes the collision. Those guarantees are
false until the prefix/type binding above is implemented.

### High — H2: work-item target kinds are assumed from their prefix, not pinned from their data

One map row promises a **maintenance** target and two rows promise a **task**
target, but `clearReciprocalBacklink()` checks only existence and reciprocity.
For work-item targets it never checks `snap.get('type')`. The current rules also
permit a task at an `mnt_*` ID and do not repair legacy/malformed missing types,
so path prefix alone is not a trusted target discriminator.

Consequently a valid bare link that resolves to a work-item document of the
unexpected kind—or with no `type`—can still be mutated through the privileged
trigger. This violates A18's exhaustive typed direction map even when the
deleted source itself has the correct prefix.

Required fix: add an expected target kind to every work-item direction and,
inside the transaction, require the target snapshot's `type` to equal it before
checking/clearing the backlink. Unexpected or missing target types are
successful no-ops. Collection paths are sufficient discriminators for jobs and
reservations, so those rows need no document `type` check.

Exact cases:

```js
test('task-to-ticket cleanup does not mutate a task stored in the ticket namespace', async () => {
  await set(`churches/${CHURCH}/workItems/mnt_victim`, {
    type: 'task', linkedTaskDocId: 'gone',
  });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'task_gone', {
    type: 'task', linkedTicketDocId: 'victim',
  }));
  assert.equal(
    (await get(`churches/${CHURCH}/workItems/mnt_victim`)).linkedTaskDocId,
    'gone'
  );
});

test('maintenance-to-task cleanup does not mutate a typeless work item', async () => {
  await set(`churches/${CHURCH}/workItems/task_victim`, {
    linkedTicketDocId: 'gone',
  });
  await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'mnt_gone', {
    type: 'maintenance', linkedTaskDocId: 'victim',
  }));
  assert.equal(
    (await get(`churches/${CHURCH}/workItems/task_victim`)).linkedTicketDocId,
    'gone'
  );
});
```

### Medium — M1: the suite overstates type-pinning and transaction/retry coverage

The existing N1 test proves that a correctly prefixed `type:'task'` source does
not follow the maintenance-only `linkedTaskDocId`. It does **not** prove its
broader name, “task_x and mnt_x cannot impersonate each other,” because it never
combines a valid type with the opposite prefix; H1 above is the missing case.
It also does not probe an unexpected or missing target type (H2).

The “target relinked after the delete” test seeds `replacement` before the
handler starts. That is a useful reciprocity negative, but it is only a proxy
for the transaction: no write occurs between the transaction's read and commit,
so the test would pass for a non-transactional read/check/write implementation.
The production code does use `runTransaction` correctly on inspection, but the
test does not prove the behavior its comment claims.

No test forces a transient or permanent error, so the suite does not establish
that `retry:true` receives a rejection only for the specified transient set, or
that a permanent failure returns normally after the other directions run. It
also does not prove partial-progress redelivery. A deterministic seam around
the direction clearer (or a focused exported test helper) should exercise this
exact sequence:

```js
test('partial progress survives transient rejection and redelivery', async () => {
  // Reciprocal task_gone targets: j1, mnt_t1, r1.
  // First invocation: clear j1; inject {code:14} for linkedTicketDocId; clear r1.
  await assert.rejects(() => invoke(), (e) => e.code === 14);
  assert.equal((await get(jobPath)).linkedTaskDocId, null);
  assert.equal((await get(ticketPath)).linkedTaskDocId, 'gone');
  assert.equal((await get(reservationPath)).linkedSetupTaskDocId, null);

  // Redelivery without the injected failure: completed directions are no-ops,
  // and the previously failed direction completes.
  await invoke();
  assert.equal((await get(jobPath)).linkedTaskDocId, null);
  assert.equal((await get(ticketPath)).linkedTaskDocId, null);
  assert.equal((await get(reservationPath)).linkedSetupTaskDocId, null);
});

test('permanent direction failure is captured but does not reject or strand later directions', async () => {
  // Inject {code:7} for linkedJobDocId and leave linkedTicketDocId reciprocal.
  await assert.doesNotReject(() => invoke());
  assert.equal((await get(jobPath)).linkedTaskDocId, 'gone');
  assert.equal((await get(ticketPath)).linkedTaskDocId, null);
  assert.equal(capturedError.tags.direction, 'linkedJobDocId');
});
```

For transaction conflict, use a deterministic fake transaction or a test-only
barrier that makes the first transaction attempt observe `gone`, discards that
attempt as a conflict, then makes the rerun observe `replacement`. Assert that
the committed attempt performs no update and returns `not-reciprocal`. Merely
writing `replacement` before invocation is not that test.

The original H1 request also asked for forged-link, cross-tenant, missing-target,
retry, and relink coverage **for all five directions**. This suite has all five
reciprocal positives, but the adversarial variants are exercised only through
the task-to-job row (and retry is absent). It is reasonable to table-drive the
same negative fixtures over the five-row map; doing so would prove that no
single path-builder or target-field typo escapes the intended invariant.

## Retry-design assessment

Apart from the type-pinning defects above, the retry design is correct on code
inspection. Numeric gRPC 4/8/10/13/14 and the named statuses recorded by the
workboard are the transient set. Each direction is attempted independently;
the last transient is rethrown only after the remaining directions run;
permanent failures are captured and swallowed; and redelivery is safe because
missing, already-clear, and non-reciprocal states are no-ops. I found no path
that should obviously retry for 24 hours but does not, or vice versa, under the
task's recorded classification policy.

## Before deployment

1. Close H1 and H2, correct the overstated comments, and add at minimum the two
   exact security regressions above.
2. Add deterministic transient/permanent/partial-progress coverage and a real
   transaction-conflict case, or explicitly narrow the relink test's name and
   comment while providing equivalent focused transaction coverage.
3. Have the implementation owner rerun `npm run test:handlers`, `npm run lint`,
   and `npm run build`, record the exact results, and return the fixes for
   re-review.
4. Only after approval, obtain the required owner authorization for the Cloud
   Functions deployment. Verify both triggers in production before the later
   gate removes the four client cleanups.
