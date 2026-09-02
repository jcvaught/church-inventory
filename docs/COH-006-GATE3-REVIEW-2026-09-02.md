# COH-006 Gate 3 Review — reader cutover

## Review target and production status

- Branch reviewed: `origin/claude/coh-006-gate-3`
- Reviewed commit: `0af52a4`
- Base: `c2c419a` (`origin/main`)
- Reviewer: Codex
- Date: 2026-09-02
- Production status supplied for this review: Gate 1 is deployed (client,
  indexes, functions, transitional rules, and the early task-create shape).
  The `visibility + sharedWithUids` composite index was probed and is present.
  Gate 2 has not been executed and still requires the product owner's explicit
  approval under DEC-2026-014.

## Verdict

**Changes requested. Do not deploy Gate 3.**

The five query shapes are the planned shapes and, after a complete Gate-2
backfill, preserve the existing visibility predicate. The per-source map and
full-union rebuild correctly remove a document after it leaves its last source.
However, the code marks the work-items subscription ready when a query errors,
without that query ever producing an initial snapshot. That is a partial store,
not satisfaction of the cutover condition. The WorkBoard detail-document
listener also still has no error callback, so revocation does not close its open
detail cleanly.

Independently of those code findings, the unexecuted Gate-2 backfill is a hard
deployment blocker. This commit would hide legitimate legacy tasks immediately
if production were only partially projected.

## Findings

### High — H-1: a failed query is counted as an initial snapshot, allowing a partial store to finish loading

`src/useFirestore.js:269-271` says readiness waits until every work listener has
produced its first snapshot. The success callback does that, but the error
callback also calls `workReady(key)` (`src/useFirestore.js:290-306`). A Firestore
listener error callback is terminal; in particular, a missing-index
`failed-precondition` or a rules `permission-denied` will not later fill that
source. The source remains its initially empty map, the work slot calls
`checkDone()`, and the rest of the application renders without every task that
only that source should deliver. The global handling is a dismissible toast
(`src/App.jsx:929-935`), not a fail-closed loading state.

This means the third filter-removal condition is asserted, not met. “Every
listener settled” is not equivalent to “every listener produced an initial
snapshot.” The production index probe lowers one cause of failure but does not
change the invariant.

Required change: model successful initial snapshots separately from terminal
failure. Do not publish a successfully loaded work store unless all five sources
have supplied a snapshot. A terminal failure should put the work reader into an
explicit fail-closed error state; it must not silently treat that source as an
empty result. Also clear source data if an already-populated listener becomes
terminal, so a failed source cannot retain stale documents indefinitely.

Proposed failing test (hook/coordinator test):

1. Fixture: `uid = memberB`; register the five listeners; deliver empty initial
   snapshots for `maintenance`, `team`, `own`, and `assigned`; invoke the
   `shared` error callback with `{ code: 'failed-precondition', message:
   'The query requires an index' }`.
2. Assertions: the work reader is not marked successfully ready; a blocking
   error is exposed; `tasks` is not represented as a complete empty result.
3. Second fixture: let `shared` first return `task_shared`, then invoke its
   terminal error callback.
4. Assertions: the reader becomes failed and does not keep presenting
   `task_shared` as current authoritative data.

The pure `mergeWorkSources` tests cannot exercise this because they begin after
listener orchestration and error handling.

### Medium — M-1: losing document access leaves the WorkBoard detail listener without a clean close path

The task-detail `onSnapshot` has a next callback but no error callback
(`src/pages/hubs/WorkBoard.jsx:773-802`). Its `!snap.exists()` branch handles a
delete, not a rules revocation. When a creator removes the viewing user's last
assignment from a private task, the constrained collection source correctly
drops the task, but the open document listener is denied. It cannot call the
delete branch, close the modal, clear its stale detail, or explain that access
was removed. The comments listener swallows its own error and only clears its
loading flag (`src/pages/hubs/WorkBoard.jsx:757-771`).

Nothing in `0af52a4` makes this fail noisily on purpose or close cleanly; the
commit does not change these listeners. This was an explicit downstream case in
the COH-006 workboard and remains unmet.

Required change: give the detail listener an error callback. On
`permission-denied`, close the detail, clear comments/remote state, and show a
plain access-removed message. Other listener failures should use the existing
error-reporting path rather than being left to the SDK's unhandled callback
behavior. The collection-union removal can also close an open detail once its
ID is absent, but it should not be the only error path.

Proposed failing test (two-user component/integration case):

1. Fixture: `memberA` creates a private task assigned only to `memberB`;
   `memberB` opens its detail and comments; `memberA` updates both `assignees`
   and `assigneeUids` to remove `memberB`.
2. Assertions for `memberB`: the card leaves the board; the detail modal closes;
   comments and the stale detail are no longer rendered; an “access removed”
   message appears; there is no uncaught/page error. Run the same case for a
   shared task after the restrictive Gate-4 rules are installed.

### Medium — M-2: the exact five Gate-3 queries are not covered against the transitional rules

The Gate-1 rules tests prove the assignee arm with direct document reads, but
`0af52a4` adds no rules test that opens the exact five query shapes. Static
inspection says the deployed transitional rule admits all five: maintenance,
team, owner, and assigned each match a read-rule arm, while the shared query is
a subset of the transitional rule's member-readable `shared` arm. That is still
an assertion until the query shapes are executed against the transitional
ruleset, which the rollout explicitly requires.

Proposed rules test fixture and assertions:

- Seed one maintenance item; one team task; one private task created by
  `memberB`; one private task assigned to `memberB` through `assigneeUids`; and
  one shared task containing `memberB` in `sharedWithUids`.
- As `memberB`, call `getDocs()` with each exact query from
  `src/useFirestore.js:274-281` and assert that all five queries succeed.
- Assert the expected positive IDs where useful, but retain the repository's
  documented caveat: emulator list results do not prove negative containment.
  The owner-authorized two-account production verification remains responsible
  for exact allow/deny containment.

## Answers to the review questions

### 1. The four conditions for removing the interim filter

They are not all met.

1. **Projection coverage:** not met yet. This is operational rather than code in
   `0af52a4`, and Gate 2 has not run. It must include the approved baseline and
   final zero-outstanding delta verification.
2. **Transitional rules admit every query:** the deployed rule and query shapes
   agree by static inspection, and the required composite index is reported
   present. The exact query suite in M-2 still needs to be run.
3. **All initial snapshots precede readiness:** not met. H-1 counts an error as
   though it were a snapshot.
4. **Per-source membership/removal:** met. `workBySource` replaces each source's
   complete membership and `mergeWorkSources` rebuilds the union. The removal,
   overlap, and still-visible-through-another-source unit cases pass.

Thus this is not “three met and the fourth merely asserted”: one external
precondition is outstanding, one implementation condition is false, one is
sound but needs the planned rules-query execution, and membership is met.

### 2. States that deliver less than the user should see

With a complete, verified backfill, the five listeners match the intended
predicate:

- A task with no `visibility` is legacy-team under `canSeeTask`, but it will not
  match the new team query. Therefore it is under-delivered to ordinary team
  members (and possibly recipients/assignees if its projections are also
  absent). This is exactly why any such document must block cutover.
- A task with a nonempty value outside `team/private/shared` was already visible
  only to its creator or assignees under `canSeeTask`; `own` and `assigned`
  preserve that behavior. Gate 1 prevents new invalid values on create.
- A maintenance item carrying any `visibility` value still matches
  `type == 'maintenance'`. If it overlaps another listener it is deduplicated
  and remains in the maintenance array, so the extra field does not hide it.
- Missing `assigneeUids` or `sharedWithUids` under-delivers the corresponding
  assignee or shared recipient unless another source also authorizes them.

Therefore a partially complete backfill is not degraded-but-safe deployment;
it is an immediate legitimate-data loss for the affected readers.

### 3. Per-detail listeners after access changes

The merged collection reader removes the card when its last qualifying source
drops it. The separate detail-document listener does not close cleanly on
permission loss because it lacks an error callback. See M-1.

### 4. Exact deploy ordering and partial-backfill behavior

Before `0af52a4` reaches production, all of the following must be true:

1. Gate 1 remains fully deployed; confirm the production project target and
   the probed composite index. This status is reported complete.
2. The product owner explicitly approves the production-data mutation.
3. Take the required backup and preserve the write-ahead manifest/rollback
   artifacts; run the production dry run against the intended project.
4. Execute the idempotent Gate-2 backfill, resolve every skipped/refused row,
   and rerun as needed.
5. Run `--verify` with the operator-approved task-count baseline immediately
   before cutover; require the expected population and zero outstanding
   visibility/projection discrepancies. Gate 1's deployed create-shape rule is
   what closes the concurrent-create race identified in the Gate-2 review.
6. Execute and pass the exact transitional-rules query tests in M-2. Record the
   owner's production verification separately where authorization requires it.
7. Fix H-1 and M-1, then rerun unit, lint, build, and the relevant narrow client
   test. Re-review the revised Gate-3 stage before deployment.
8. Deploy the Gate-3 client while leaving the transitional rules in place.
   Restrictive read/update/comment rules remain Gate 4 and follow only after the
   compatible Gate-3 client is live.

If the backfill is partial, team tasks with missing visibility and private/shared
tasks with missing recipient projections disappear from legitimate users at
cutover. The create-shape rule prevents new gaps but does not repair legacy
ones. Gate 3 therefore must not deploy on partial coverage.

Rollback planning must continue to support clients on both sides of Gate 3: if
the reader cutover is rolled back before Gate 4, the already-deployed
transitional rule still admits the old unconstrained client. Do not deploy the
restrictive Gate-4 rules until Gate 3 is live and verified.

## Verification and limits

- `npm run test:unit` — passed: 124/124.
- `npm run lint` — passed with 0 errors and 50 existing warnings.
- `npm run build` — passed, including prerender and `verify-prod-bundle`.
- `git diff --check 0af52a4^..0af52a4` — passed.
- Reviewed the complete three-file diff, the deployed transitional rules, the
  Gate-2 migration/verification behavior, the prior Gate-2 review, the COH-006
  workboard entry, relevant decisions, and WorkBoard's detail/comment listeners.
- I did **not** run `npm run test:rules`: this sandbox cannot bind the Firebase
  emulator ports. Any rules result reported by the implementation owner remains
  unreproduced by this reviewer.
- I did not deploy, run the Gate-2 script, read or modify production data, or
  perform the owner-authorized two-account production verification.
