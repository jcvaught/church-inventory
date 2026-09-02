# COH-006 Gate 3 verification plan and stage record

## Status and scope

- Date: 2026-09-02
- Reviewer: Codex
- Review branch: `codex/gate3-verification`
- Gate-2 fix reviewed: `c9c8e5c`
- Gate-3 fix reviewed: `0d34fe9`
- Production project: `church-inventory-9615c`
- Production probe tenant: `e2e-test-church`
- Production state at review: gates 1 and 2 are live; gate 3 is not deployed;
  gate 4 is not deployed, so the transitional work-item rules remain live.

This document records the missed Gate-2 review, reviews both supplied stages,
and specifies the owner-authorized two-account production probe required before
the Gate-3 reader cutover. It is a plan only. Codex did not deploy, mutate
production, execute the probe, or run the migration.

## Process breach

Gate 2's final review requested changes to the migration's intent-before-commit
window. Claude implemented the fix in `c9c8e5c`, but did not send that new stage
to Codex before executing the migration in production. The product owner had
approved the production execution; the breach was the omitted review required
by the owner's review-every-stage directive. This retrospective review cannot
restore the missed pre-execution gate or turn the production run into a
reviewed-before-use run.

The error is procedural and consequential: migration safety code first received
independent review only after it had already changed live data. The corrective
practice is mechanical: any change made in response to a stage review is a new
reviewable stage, and execution waits for that re-review even when the owner has
already approved execution in principle.

## Stage 1: retrospective review of `c9c8e5c` and the live Gate-2 run

### Production outcome supplied by the implementation owner

- Independent aggregation baseline: 90 tasks.
- Dry run: 90 tasks; 90 needed projections; 0 needed visibility normalisation.
- Backup: 90 rows.
- Execute: 90 applied; 0 skipped.
- Verification with baseline 90: 0 outstanding.
- Field-by-field comparison with `assignees` and `sharedWith`: 0 projection
  mismatches.
- Resulting visibility distribution: 80 shared, 6 private, 4 team; 17 shared
  tasks have no recipients.

The 17 shared tasks with no recipients are not a migration mismatch: their
empty `sharedWithUids` arrays faithfully project empty `sharedWith` arrays. Gate
3 will still deliver them to their creators through the `createdBy` query, but
not to other members through the shared query.

### Independent static and artifact checks

`c9c8e5c` now makes each attempt perform a fresh read, calculate exact before
and after images, fsync the intent, and conditionally apply the transaction only
when the transaction read matches that before-image. A stale attempt loops and
journals a new numbered intent. A crash after the Firestore commit but before an
`applied` line remains recoverable from the already-durable intent. Test hooks
are validated and refused unless the run targets an emulator without `--prod`.

The production manifest was inspected structurally without printing document
IDs, UIDs, or field values. It contains:

```text
manifest-header  1
intent           90
applied          90
superseded        0
complete          1  (6 churches, 90 scanned, 90 applied, 0 skipped)
```

Every one of the 90 documents has one intent followed by one applied record.
There are no retries, no superseded attempts, and no document whose final
journal state is non-applied. This corroborates the supplied `90 applied, 0
skipped` result and is important to the finding below: the unsafe branch did not
occur in the production execution.

### High — H-1: rollback treats a superseded, known-uncommitted intent as authoritative

The reusable rollback parser retains the last `intent` for each document but
ignores both `superseded` and `applied` status records. The comment that every
earlier attempt was superseded and did not apply does not make the *last* intent
an applied write. This sequence is possible:

1. Attempt 1 journals before-image `B` and after-image `A`.
2. A client independently changes the document from `B` to exactly `A` before
   the transaction read.
3. The transaction detects a stale before-image, writes nothing, and journals
   `superseded`.
4. The retry's fresh read is already current, so it journals no new intent and
   returns `already-current`.
5. Rollback sees the last intent, sees that the document equals `A`, and restores
   `B`, undoing the client's write even though the migration never committed.

Required correction before this script is reused for another production
execution: key journal state by document and attempt. Ignore an intent followed
by `superseded`; retain an intent followed by `applied`; and also retain a final
intent with neither status because that is the crash-after-commit ambiguity that
must be resolved by conditional comparison. Do not infer application from “last
intent for the document.”

Exact failing emulator case for the implementation owner:

- Seed a task whose three migration-owned fields are image `B` and whose source
  arrays cause image `A`.
- Pause after the intent is durable but before the transaction read, then make a
  client/Admin fixture write the exact image `A`.
- Assert the attempt writes `superseded`, the next fresh read returns
  `already-current`, and the completed manifest contains no `applied` record for
  that document.
- Run rollback.
- Expected: zero restored for that document and image `A` remains.
- Current false behavior: rollback restores image `B`.

This is a real defect in `c9c8e5c`, but it did not affect the completed live run:
the production manifest has no superseded, skipped, retried, or indeterminate
attempt. Conditional rollback of that specific manifest has one unambiguous
applied intent per document. Do not reuse the script for another execute until
H-1 is fixed and tested.

### Low — L-1: the home-grown canonical encoding is not exact for every Firestore value

Canonical comparison fixed the observed object-identity bug for malformed maps,
but it is not a one-to-one encoding of all values. For example,
`JSON.stringify(NaN)` and `JSON.stringify(null)` are both `"null"`; array
joining can also collapse unsupported `undefined` elements. Firestore normally
rejects `undefined`, and the live projections were ordinary arrays, so this is
not evidence of a production mismatch. It does mean the code's “exact image”
claim is broader than the comparator.

Before reuse, replace the serializer with a tested deep value comparison that
preserves Firestore scalar types, and add at least `NaN` versus `null`, nested
maps with different key insertion order, arrays, timestamps, and document
references to its unit fixtures. The test must assert equal snapshots compare
equal and distinct Firestore values never compare equal.

### Stage-1 verdict

**Changes requested before reuse; no live repair indicated by the reviewed
artifact.** The production manifest proves that H-1's superseded-intent branch
did not occur in the 90-document execution, and the supplied baseline,
zero-outstanding verification, and field comparison give no evidence that live
documents need remediation. The skipped pre-execution review remains a process
breach and the emulator results remain unreproduced by Codex.

## Stage 2: review of Gate-3 fixes at `0d34fe9`

### H-1 fixture disposition

The five supplied `createWorkStore` fixtures pass and none passes unexpectedly.
The coordinator now distinguishes:

- `settled`: every listener delivered or failed, which ends the spinner; and
- `complete`: every listener delivered and none failed, which is the condition
  for an authoritative result.

A failed source drops its documents and exposes `workItemsError`. This correctly
fixes the coordinator-level bug where a failure was indistinguishable from an
initial empty snapshot.

### High — H-2: partial arrays are still published globally as though loading completed

The intended invariant is not enforced at the consumer boundary. On every
snapshot or failure, `publishWork()` calls `setTasks(state.tasks)` and
`setMaintenanceTickets(state.maintenance)`. When all sources have either
delivered or failed, it calls the global `checkDone()` even if `complete` is
false. `WorkBoard` renders an explicit warning, but the other consumers of
`store.tasks` and `store.maintenanceTickets` do not receive a completeness gate
and can render, search, export, or otherwise rely on the partial arrays.

This leaves the original false-answer problem outside WorkBoard. A failed
`shared` listener can still make Global Search, Event Day, calendar/CSV exports,
and other downstream consumers behave as though no shared-only tasks exist.
`workItemsError` is an exposed diagnostic; it is not yet a fail-closed global
state.

Required change: make incomplete work data impossible to consume as an
authoritative loaded result. One coherent shape is a separate work-reader state
(`loading | complete | failed`) consumed at the application boundary, with a
blocking/retryable failure state for task-dependent surfaces. If partial data is
intentionally retained for recovery or diagnostics, it must not flow through
the same loaded `tasks`/`maintenanceTickets` contract used by downstream
features. A warning on WorkBoard alone is insufficient.

Exact failing integration case for the implementation owner:

- Seed one task delivered only by the `shared` source and one team task.
- Deliver successful initial snapshots for maintenance, team, own, and assigned;
  invoke the shared listener's terminal `failed-precondition` callback.
- Assert the top-level loading shell terminates in an explicit failed work-data
  state, not the normal loaded state.
- Open or invoke Global Search, Event Day, and the task CSV/calendar export paths.
- Expected: each is blocked or explicitly marked unavailable because work data
  is incomplete; none may report a normal result containing only the team task.
- Current false behavior: the global store publishes the team-only array and
  only WorkBoard names the failed source.

### M-1 disposition

Satisfied by inspection. The detail document listener now handles terminal
errors, closes the modal, clears remote state, and distinguishes
`permission-denied` as removed access. The comments listener clears its array
on error instead of retaining comments it can no longer confirm. The supplied
two-user behavioral result remains the implementation owner's verification;
Codex did not reproduce the production or emulator listener transition.

### Stage-2 verdict

**Changes requested. Do not deploy Gate 3 yet.** The original five coordinator
fixtures and the detail-listener correction are sound, but H-2 still lets the
rest of the application consume a partial work store as a completed load. The
production query probe below should be implemented now, but executed only when
the implementation owner and product owner place it in the rollout sequence;
passing it does not waive H-2.

## Two-account production probe against the transitional rules

### Is `e2e-test-church` the right tenant?

Yes. Its current zero-task state is an asset: each query can assert equality
against its entire server result rather than searching for a probe ID among
unrelated documents. Use it only during an exclusive E2E window. Make a
server-side Admin SDK count of `workItems` a hard precondition and require zero;
if it is not zero, abort without deleting anything. Do not adapt the assertions
to tolerate unexpected documents and do not use a customer church.

If the tenant cannot be kept exclusive, stop and establish a dedicated probe
tenant whose two authenticated users have user documents in that same tenant.
Do not temporarily move either E2E user's `churchId`: that would change their
authorization state and could race other production tests.

### Accounts and isolation

Use the existing E2E Member A and Member B accounts. Resolve both UIDs through
the Admin SDK, require both to be nonempty and distinct, and assert both user
documents are active members of `e2e-test-church` before seeding.

Create a separate named Firebase app, Auth instance, Firestore instance, and
in-memory cache for each account. Sign each account in normally. Assert the
authenticated UID equals the Admin-resolved expected UID. Never share an Auth or
Firestore instance between the accounts, and do not use the Admin SDK for any
evidence read.

### Fixture documents

Use one run-specific prefix such as `task_ZZCOH006G3_<runId>_` for task document
IDs and `mnt_ZZCOH006G3_<runId>_` for maintenance. Give every document an
`[E2E]` name, valid `createdAt`, `taskNumber`, and all fields required by the
Gate-1 create shape. Seed with Admin SDK in one batch only after the zero-count
precondition succeeds.

| Suffix | Type / visibility | Creator | `assigneeUids` | `sharedWithUids` | Purpose |
|---|---|---|---|---|---|
| `maintenance` | maintenance | Admin | absent | absent | maintenance query only |
| `team` | task / team | Admin | `[]` | `[]` | church-wide team query |
| `private-a` | task / private | A | `[]` | `[]` | A owner-only positive; B negative |
| `private-b` | task / private | B | `[]` | `[]` | B owner-only positive; A negative |
| `private-a-assigned-b` | task / private | A | `[B]` | `[]` | B assigned positive |
| `private-b-assigned-a` | task / private | B | `[A]` | `[]` | A assigned positive |
| `shared-a-to-b` | task / shared | A | `[]` | `[B]` | B shared positive; A owner positive |
| `shared-b-to-a` | task / shared | B | `[]` | `[A]` | A shared positive; B owner positive |
| `private-a-stale-b` | task / private | A | `[]` | `[B]` | proves shared query also needs visibility |
| `private-b-stale-a` | task / private | B | `[]` | `[A]` | symmetric stale-recipient control |
| `team-overlap` | task / team | A | `[B]` | `[B]` | team + A owner + B assigned, but not shared |
| `shared-overlap` | task / shared | A | `[B]` | `[B]` | A owner + B assigned + B shared dedupe case |

The object arrays must match their UID projections except in the two explicitly
named stale-recipient controls, where `sharedWith` and `sharedWithUids` both
carry the named recipient. That is a legitimate post-edit shape under the
current application and is exactly why the shared query has two clauses.

### The exact five queries and expected IDs

Construct these exact collection-scoped queries over
`churches/e2e-test-church/workItems` for each signed-in UID:

```js
query(workRef, where('type', '==', 'maintenance'))
query(workRef, where('visibility', '==', 'team'))
query(workRef, where('createdBy', '==', uid))
query(workRef, where('assigneeUids', 'array-contains', uid))
query(workRef,
  where('visibility', '==', 'shared'),
  where('sharedWithUids', 'array-contains', uid))
```

For brevity the table uses the suffixes above; the implementation must compare
full document IDs including the run prefix.

| Account | Query source | Exact expected suffix set |
|---|---|---|
| A | maintenance | `maintenance` |
| A | team | `team`, `team-overlap` |
| A | own | `private-a`, `private-a-assigned-b`, `shared-a-to-b`, `private-a-stale-b`, `team-overlap`, `shared-overlap` |
| A | assigned | `private-b-assigned-a` |
| A | shared | `shared-b-to-a` |
| B | maintenance | `maintenance` |
| B | team | `team`, `team-overlap` |
| B | own | `private-b`, `private-b-assigned-a`, `shared-b-to-a`, `private-b-stale-a` |
| B | assigned | `private-a-assigned-b`, `team-overlap`, `shared-overlap` |
| B | shared | `shared-a-to-b`, `shared-overlap` |

The asymmetric counts are intentional and catch accidental account reuse. The
shared expectations deliberately exclude both stale private-recipient fixtures
and `team-overlap`, even though their `sharedWithUids` arrays contain the reader.

### `getDocsFromServer` assertions

For every one of the ten account/query pairs:

1. Call `getDocsFromServer()` and require it to resolve. A rejection is a test
   failure; assert and print the exact Firebase code, especially
   `permission-denied` and `failed-precondition`.
2. Require `snapshot.metadata.fromCache === false`.
3. Compare the sorted full result-ID array for exact equality with the table.
   Do not use `arrayContaining`, a size-only assertion, or “expected ID is
   present.” Those all allow an unauthorized extra document to produce a false
   green.
4. Assert every returned document belongs to `e2e-test-church` and carries the
   current run prefix. Because zero tasks was a precondition, any other result is
   contamination or a tenant-boundary failure and must fail the run.

### `onSnapshot` assertions

Repeat all ten account/query pairs with `onSnapshot()` against the same exact
queries. Each listener gets its own 15-second deadline.

- Ignore cache-only callbacks while waiting, but record them for diagnostics.
- Pass only on the first callback with `snapshot.metadata.fromCache === false`
  whose sorted full ID set exactly equals the table.
- A terminal error fails with its exact code; it is not an empty result.
- A timeout fails. It must never resolve as “no leak observed.”
- Always unsubscribe in `finally`, including error and timeout paths.
- Require all ten listeners to reach a server-backed exact snapshot. Do not let
  `Promise.allSettled()` turn rejected listeners into a successful overall run.

After the per-source checks, merge the five server-backed source maps using the
same `createWorkStore`/`mergeWorkSources` behavior as Gate 3. Assert `complete`
is true, each account's union equals the mathematical union of its five table
rows, `maintenance` appears once, and both `team-overlap` and `shared-overlap`
appear once despite matching multiple sources. This checks the handoff between
query correctness and the reader's deduplication; it does not replace the
per-source equalities.

### Direct-read and tenant controls

These controls prevent a green query matrix from being misread as broader
authorization proof:

- As A, `getDocFromServer(private-a)` succeeds and
  `getDocFromServer(private-b)` fails with exactly `permission-denied`.
- As B, the symmetric pair succeeds/fails exactly the same way.
- A can directly read `private-b-assigned-a`; B can directly read
  `private-a-assigned-b` under the transitional assignee arm.
- B's direct read of `private-a-stale-b` and A's direct read of
  `private-b-stale-a` both fail with exactly `permission-denied`.
- Each account's `getDocsFromServer()` against a workItems path in a different
  church fails with exactly `permission-denied`. Use a known non-E2E church path
  only as a read target; do not seed or enumerate it.

Do not execute an unconstrained list as an acceptance assertion: it is already
known to leak under the transitional rules. If it is run as a characterization
control, it must be labelled **expected exposure before Gate 4**, and the probe
must not fail merely because the known exposure is observed.

### Composite-index proof

There are two distinct assertions:

1. **Client execution gate.** Both accounts' shared `getDocsFromServer` and
   server-backed `onSnapshot` must succeed with exact result sets. A missing
   required composite is not allowed to “fall back” to a collection scan in the
   client SDK; Firestore terminates the query with `failed-precondition`. Thus
   these four successful executions prove that a usable index serves the exact
   production query shape under the transitional rules.
2. **Physical-plan gate.** Using the repository's Admin/server Firestore SDK
   solely for query planning, run the same two-clause shared query with
   `explain({ analyze: true })`. Assert `planSummary.indexesUsed` is nonempty and
   contains a COLLECTION-scope `workItems` index whose properties name both
   `visibility` as ascending/equality-capable and `sharedWithUids` as
   `ARRAY_CONTAINS` (plus the normal `__name__` suffix if reported). Record the
   returned plan summary in the verification handoff, with UIDs and document
   contents redacted.

Do not hard-code the entire display string before observing the SDK's structured
shape; field names and modes are the load-bearing assertions. Fail if the plan
lists only single-field indexes, only `__name__`, the wrong query scope, or no
index. Admin Query Explain bypasses rules, so it proves physical index selection
only; the two authenticated client accounts prove rules/query compatibility.

If Query Explain is unavailable at execution time, that is not permission to
claim the physical index was identified. Record the limitation and use the
Firebase console/CLI index inventory as a separate presence check. Successful
client execution still proves a usable index exists, but not the identity of
the index chosen.

### Cleanup and evidence

Wrap setup and all reads in `try/finally`. Delete only the twelve exact fixture
references created by the current run; never purge the collection or delete by
a broad prefix query. After deletion, use an Admin aggregation count and require
`workItems == 0`, matching the precondition. If cleanup is incomplete, report
the exact fixture IDs to the product owner without deleting unrelated data.

The verification handoff must record:

- gate-1 deployed SHA/ruleset and gate-3 candidate SHA;
- production project and E2E tenant;
- both authenticated UIDs in redacted/distinct form, not raw UID values;
- all ten `getDocsFromServer` exact-set results;
- all ten server-backed `onSnapshot` exact-set results and absence of timeouts;
- the Query Explain `indexesUsed` field summary;
- direct-read and cross-tenant control results with exact error codes;
- pre- and post-run Admin counts of zero; and
- cleanup result.

### What a pass establishes

A complete pass establishes, at that time and against the deployed transitional
rules and production indexes, that:

- each of Gate 3's exact five query shapes executes for both members;
- each query returns exactly the fixture documents selected by its constraints;
- both one-shot server reads and the real listener mechanism produce
  server-backed results;
- the shared query excludes private/team documents carrying stale recipient
  projections;
- source overlaps deduplicate correctly when merged; and
- a production composite index with the required fields is selected, if the
  Query Explain physical-plan gate also passes.

### What a pass cannot establish before Gate 4

It does **not** establish that private/shared visibility is yet a security
boundary. Under the transitional rule, every active member can directly read a
shared task, and the already-measured unconstrained list behavior can deliver
private tasks. Therefore the reported production distribution still means 80 of
90 shared tasks are broadly member-readable until Gate 4; this probe does not
reduce or certify away that exposure.

It also does not establish:

- the final Gate-4 restrictive read/update/comment rules;
- resistance to self-grant through projection updates;
- parent-visibility enforcement for comments;
- confidentiality in any customer tenant or correctness of all 90 migrated
  documents beyond the separately reported Gate-2 checks;
- Gate 3's global incomplete-source behavior (Stage-2 H-2);
- the deployed UI bundle, because Gate 3 is not yet deployed when this
  transitional-rules probe runs; or
- continuing correctness after any rules, index, query, or data change.

After H-2 is fixed and Gate 3 is deployed, run the narrow deployed-UI smoke and
the unskipped production E2E spec. After Gate 4 is deployed, rerun the relevant
two-account negative cases against the final rules; only that later result can
support the private/shared authorization claim.

## Reviewer verification and limits

- `git diff --check c9c8e5c^..c9c8e5c` — passed.
- `git diff --check d5c1e7d..0d34fe9` — passed.
- Production manifest — structural counts inspected; document IDs, UIDs, and
  values were not printed.
- Emulator-backed migration, Firestore-rules, and listener-transition results —
  not reproduced. Codex's sandbox cannot bind the Firebase emulator ports.
- Production probe — specified here but not executed.
- No deploy, production mutation, migration, rollback, push, or external-system
  change was performed by Codex.
