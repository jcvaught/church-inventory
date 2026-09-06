# COH-008 implementation re-review — 2026-09-06

**Reviewed:** fix commit `b3a378b6879962b4c191a3d64e441d9d1743fb1d`
against implementation commit `e1a71461c2085695f967ea644a5123f3cbaf7ad5`,
plus the complete current backlink-trigger block in `functions/index.js` and
`functions/test/handlers/backlinkCleanup.test.mjs`.

**Verdict: APPROVED WITH FOLLOW-UP.** H1, H2, and the substantive parts of M1
are closed. I found no remaining confused-deputy, cross-tenant, type-collision,
or retry-classification path around the three defenses. The removed executed
transaction-race test is acceptable: with the emulator's pessimistic lock, that
construction tests slowly and ambiguously, while the production callback is
visibly passed to `runTransaction` and performs the fresh read, kind check,
reciprocity check, and update together. One test comment still claims the
removed race test exists “below”; that inaccurate claim must be corrected before
the release package is put to the owner, but it does not reopen M1's behavior.

I ran no Firebase emulator, lint, build, unit-test, or other verification
command. I verified **no test result**. Claude's reported 62/62 handler tests,
zero-error lint, and clean build remain unreproduced by this review.

## Prior findings

### H1 — Closed: source type is bound to exactly one ID namespace

The new extractor no longer accepts either prefix and then trusts `type`. It
selects one prefix from the expected kind and rejects every mismatch:

```js
const WORK_ID_PREFIX = { task: 'task_', maintenance: 'mnt_' };
function bareWorkItemId(docId, expectedKind) {
  const prefix = WORK_ID_PREFIX[expectedKind];
  if (!prefix || typeof docId !== 'string' || !docId.startsWith(prefix)) return null;
  const bare = docId.slice(prefix.length);
  return bare.length ? bare : null;
}
```

`runBacklinkCleanup` supplies the discriminator selected from the deleted
snapshot and fails the entire invocation closed when the prefix disagrees:

```js
const bareSourceId = sourceKind === 'jobListing' ? docId : bareWorkItemId(docId, sourceKind);
if (!bareSourceId) {
  console.warn(`${jobName}: id shape does not match source kind, ignoring`, { churchId, docId, sourceKind });
  return;
}
```

Therefore a rule-valid `type:'task'` source at `mnt_victim` cannot reduce to
`victim` and impersonate `task_victim`; the symmetric maintenance-at-`task_*`
shape also fails before any link field is followed. The new handler case covers
both mismatches. H1 is closed.

### H2 — Closed: every work-item target is pinned to its own stored type

All three directions whose targets are in `workItems` now declare their expected
kind:

```js
{ sourceField: 'linkedTicketDocId', targetPath: (c, id) => `churches/${c}/workItems/mnt_${id}`, targetField: 'linkedTaskDocId', targetKind: 'maintenance' }
{ sourceField: 'linkedTaskDocId', targetPath: (c, id) => `churches/${c}/workItems/task_${id}`, targetField: 'linkedTicketDocId', targetKind: 'task' }
{ sourceField: 'linkedTaskDocId', targetPath: (c, id) => `churches/${c}/workItems/task_${id}`, targetField: 'linkedJobDocId', targetKind: 'task' }
```

The transaction reads that target's data and rejects an unexpected or absent
type before inspecting reciprocity or scheduling a write:

```js
if (direction.targetKind && snap.get('type') !== direction.targetKind) return 'target-kind-mismatch';
const current = snap.get(direction.targetField);
if (current === null || current === undefined) return 'already-clear';
if (current !== bareSourceId) return 'not-reciprocal';
tx.update(ref, { [direction.targetField]: null });
```

Job and reservation targets need no data-level kind because their distinct
collection paths are constructed by the allowlist. The new test exercises both
an opposite-kind target and a typeless target. H2 is closed.

### M1 — Closed on behavior; one inaccurate comment remains

The old relink test is correctly renamed to “a target already pointing
elsewhere is not cleared (reciprocity negative).” It now claims only the
behavior it actually exercises. The hook between `tx.get(ref)` and the checks
provides deterministic failures for the module's retry split. The transient
case forces numeric gRPC 14, asserts rejection after the other directions make
partial progress, resets the hook, redelivers, and asserts completion. The
permanent case forces numeric gRPC 7, asserts normal return, preserves the failed
direction, and proves a later direction still completes.

That closes the missing transient/permanent/partial-progress/redelivery
coverage. The hook runs inside `runTransaction`, so the forced errors also
exercise the outer classification at the same boundary used by Firestore
transaction failures.

There is one stale statement at
`functions/test/handlers/backlinkCleanup.test.mjs:63-65`:

```js
// The real transaction proof is
// 'a relink racing the cleanup wins' below, which mutates the target inside
// the transaction window.
```

No such test remains below, and lines 192-205 correctly say it is deliberately
not tested. Replace the stale three lines with, for example:

```js
// The transactional wrapper is verified by inspection; the note below records
// why an executed emulator race was removed.
```

This is a documentation/test-claim correction, not a missing security defense.

## Attack of the three defenses

I found no path around their composition:

1. **Source routing and namespace binding.** The trigger derives `sourceKind`
   only from the deleted work item's `type`, follows only that kind's fixed map,
   and then requires the corresponding `task_` or `mnt_` prefix. Unknown types,
   missing types, malformed prefixes, empty suffixes, and opposite prefixes are
   invocation-level no-ops. A job source is already discriminated by the
   platform-selected `jobListings/{docId}` trigger path.
2. **Target kind and reciprocity.** Work-item targets must expose the expected
   stored `type`. Every target, including jobs and reservations, is updated only
   when the allowlisted backlink field equals the deleted source's bare ID.
   Missing, already-cleared, wrong-kind, and non-reciprocal targets are no-ops.
   The check and `tx.update` are in one transaction callback.
3. **Tenant and path confinement.** `isBareDocId` accepts only a non-empty
   string of at most 1,500 characters with no `/`, excluding `.` and `..`.
   Every target builder prefixes that one segment with
   `churches/${event.params.churchId}/...`. The linked document cannot choose a
   church or collection, percent-encoded slashes remain literal document-ID
   characters, and the source bare ID is used only for equality, not path
   construction. The event's `churchId` and `docId` are platform path params,
   not deleted-document fields. Event-church construction therefore still
   holds.

The source work-item suffix is not separately passed through `isBareDocId`, but
that does not open a path: a Firestore document ID from `{docId}` is already one
path segment, and the suffix is used only as a backlink comparison value. A job
source's ID is likewise used only for equality. Conversely, every deleted-data
link value that is interpolated into a target path is passed through
`isBareDocId` first.

The `_setBacklinkHook` / `_resetBacklinkHook` seam is an exported mutable
process-global. It deserves explicit scrutiny, but it is not a callable Cloud
Function: unlike the two trigger exports it carries no Firebase endpoint
metadata, and no HTTP, callable, or event route can invoke it. Production code
never sets it. A future in-process caller could affect concurrent invocations,
so it should remain test-only by convention and must not acquire a production
call site; under the current module there is no external or data-driven path to
mutate it. This mirrors the existing `_setClock` seam and is not a deployment
blocker.

## Removed transaction-conflict test

I accept the removal and Claude's reasoning. The attempted emulator test puts an
external write behind the transaction's pessimistic read lock while awaiting
that write from inside the lock holder. Its eventual retry is slow and does not
give the crisp conflict observation the test name promises. The production
property splits cleanly into module behavior and platform behavior: this module
places a fresh target read, type/reciprocity decisions, and update in the same
`runTransaction` callback; Firestore's documented transaction retry/atomicity
semantics are the platform guarantee. The reciprocity negative exercises the
module decision, and inspection establishes the wrapper.

A cheap non-deadlocking fake can simulate a discarded first attempt and a
rerun, but it would mock the very retry/commit semantics at issue. It is
therefore optional, not a release gate. If the owner wants that narrow callback
regression, this is the exact handler test to add (it performs no emulator
write and restores the shared method in `finally`):

```js
test('a discarded transaction attempt rechecks reciprocity before commit', async () => {
  const funcs = await loadFunctions();
  const firestore = db();
  const realRunTransaction = firestore.runTransaction;
  let attempt = 0;
  const committedWrites = [];

  firestore.runTransaction = async function fakeRunTransaction(updateFn) {
    attempt += 1;
    const writes = [];
    const visibleBacklink = attempt === 1 ? 'gone' : 'replacement';
    const tx = {
      get: async (ref) => {
        assert.equal(ref.path, `churches/${CHURCH}/jobListings/job-race`);
        return {
          exists: true,
          get: (field) => {
            assert.equal(field, 'linkedTaskDocId');
            return visibleBacklink;
          },
        };
      },
      update: (ref, patch) => writes.push({ path: ref.path, patch }),
    };

    const result = await updateFn(tx);
    if (attempt === 1) {
      assert.deepEqual(writes, [{
        path: `churches/${CHURCH}/jobListings/job-race`,
        patch: { linkedTaskDocId: null },
      }]);
      // Simulate Firestore discarding the conflicted attempt and rerunning it.
      return this.runTransaction(updateFn);
    }
    committedWrites.push(...writes);
    return result;
  };

  try {
    await funcs.cleanupWorkItemBacklinks.run(deletedEvent(CHURCH, 'task_gone', {
      type: 'task', linkedJobDocId: 'job-race',
    }));
  } finally {
    firestore.runTransaction = realRunTransaction;
  }

  assert.equal(attempt, 2);
  assert.deepEqual(committedWrites, []);
});
```

This proves only that this callback re-evaluates the second snapshot and does
not schedule the stale clear; it intentionally does not pretend to independently
prove Firestore's transaction machinery.

## Before asking the owner to authorize deployment

1. Correct the stale test comment above. No new transaction-race test is
   required for approval.
2. Claude must write the missing COH-008 handoff using
   `docs/AI-HANDOFF-TEMPLATE.md`, including the exact implementation SHA,
   commands/results it ran, rollback, project-targeting check, the fact that
   Codex reproduced none of the results, and the production verification plan
   for both triggers while all four client cleanups remain in place.
3. Claude must fetch this exact review commit from the local review clone,
   publish the named review branch without editing the review, and update the
   COH-008 workboard checkpoint with implementation SHA, review SHA/path,
   publication state, verdict, and next owner/action. The pinned workboard still
   says “Ready to implement,” so it is not a truthful release checkpoint yet.
4. After the comment correction and release artifacts are committed, Claude
   should ensure its recorded `npm run test:handlers`, `npm run lint`, and
   `npm run build` results still apply to the exact candidate. A documentation-
   only correction does not require another Codex re-review. Only then should
   the owner be asked for the Cloud Functions deployment authorization required
   by DEC-2026-014.

After authorization, Claude—not Codex—must verify Firebase project targeting,
deploy the two reviewed functions, and verify both triggers in production before
the later gate removes any client cleanup. No production action is authorized by
this review.
