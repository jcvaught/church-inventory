# COH-006 Gate 4 Post-deployment Review

## Review target and evidence boundary

- Task: COH-006 — enforce private and shared task visibility, Gate 4 of 4
- Reviewed tree: `22d39fb800108a8dec35fae457d09d80949eb448`
  (`origin/main`, detached when the review began)
- Previously approved package: `f4c890d`; handoff: `ef15bb2`; package review:
  `f5e1dbe`
- Post-approval commits examined: `f26a199`, `bcb0fc2`, `a9b7ffc`, `cdbea51`,
  and merge `22d39fb`
- Reviewer: Codex
- Date: 2026-09-05

I reviewed the complete production-probe control flow, fixture/query sets,
direct-read and comment assertions, mutation ordering, merge expectations,
cleanup, the six new handoff rules, the workboard close-out, and the prior
Gate-4 reviews and decisions. I did not access production, rerun the production
probe, deploy, merge, mutate data, or push.

## Verdict

**Changes requested to the permanent probe and close-out records. No live
rollback or production-data repair is indicated by this review.**

The `admin-private` fixture and its allow/deny assertions are valid, and the
reported passing listener snapshots remain positive evidence: a delivered
snapshot with `fromCache === false` is server-backed. The fixture does not,
however, repair the general listener oracle. The root cause recorded in the
script and workboard is incomplete: the SDK can contact the server and suppress
the resulting callback when only snapshot metadata changes. The probe must opt
in to metadata events instead of manufacturing a cache miss.

## Findings

### Medium — M-1: `admin-private` masks metadata-event suppression rather than fixing the listener oracle

`onSnapshot()` is called without `{ includeMetadataChanges: true }`. In the
installed Firebase 12.13.0 SDK, that option defaults to false. The SDK removes
metadata-only document changes and raises a later event for a sync-state change
only when `includeMetadataChanges` is true. Therefore this observed sequence is
expected:

1. a prior query or `getDocsFromServer()` puts every matching document in the
   local cache;
2. the listener raises an initial `fromCache === true` snapshot;
3. the backend confirms the same result set, changing only sync metadata; and
4. the default listener suppresses that second user callback.

The timeout does **not** establish that “the SDK never needed a server
round-trip,” that the one-shot read “poisons” the listener, or that a Listen
stream did not establish. Those statements at
`scripts/verify-coh006-gate3.mjs:94-98` and `:189-196`, and the matching
workboard explanation, overstate what the callback trace proves.

`admin-private` happens to make ADMIN's `own` server result differ from the
cached subset under the probe's current ordering. That produces a document
change and therefore a callback even with metadata events disabled. It is not
ordering-independent: if `admin-private` is cached first, or if a future refactor
warms the exact `own` result before listening, the same false timeout returns.
The fixture should remain because it is a useful creator positive and symmetric
private-task negative; it should not carry responsibility for transport
observation.

Required correction:

```js
un = onSnapshot(q, { includeMetadataChanges: true },
  (snap) => {
    if (snap.metadata.fromCache) { cacheCallbacks++; return; }
    clearTimeout(t); un();
    resolve({
      state: 'server', ids: snap.docs.map((d) => d.id), cacheCallbacks,
    });
  },
  (err) => {
    clearTimeout(t); un();
    resolve({ state: 'error', code: err.code, cacheCallbacks });
  });
```

Then revise both causal comments and the workboard: cached equality can suppress
the observable server-confirmation callback when metadata events are excluded;
it is not evidence that the SDK skipped the server.

Exact runnable regression for the implementation owner (emulator or the next
owner-authorized probe run):

1. Use one authenticated ADMIN Firestore instance. Seed only a team task created
   by ADMIN for the two relevant queries; `team` and `own` must both return that
   exact ID.
2. Attach `team`, wait for its exact server-backed snapshot, and unsubscribe.
3. Attach `own` with `{ includeMetadataChanges: true }`; ignore and count cache
   callbacks, then require an exact `fromCache === false` snapshot before the
   deadline.
4. Call `getDocsFromServer(own)`, then repeat step 3 for the identical query and
   require the same server-backed exact result.
5. Keep `admin-private` in the full security matrix, but do not include it in
   this instrumentation regression. The case must pass because metadata-only
   server confirmation is observable, not because a new document forces a data
   event.

This is a false-negative/test-reliability defect, not evidence of a false green
in the completed run. All fifteen reported listeners ultimately produced a
`fromCache === false` callback with exact IDs after `bcb0fc2`.

### Medium — M-2: the canonical workboard simultaneously says Gate 4 is deployed and not deployed

The COH-006 entry opens with `COMPLETE — all four gates deployed`, and the next
paragraph records the executed deployment. Inside the historical trail it still
says, in present tense, `Gate 4 is implemented, reviewed, fixed, and re-reviewed;
it is NOT deployed`. This is a direct contradiction in the coordination source
agents are required to trust.

Replace that sentence with a historical transition such as “Before the
owner-authorized deployment, Gate 4 reached the following reviewed release
state,” then retain the SHA trail. A simple repository guard can prevent this
specific stale-state regression:

```sh
node - <<'NODE'
const fs = require('node:fs');
const text = fs.readFileSync('docs/AI-WORKBOARD.md', 'utf8');
const section = text.split('### COH-006')[1].split('\n### ')[0];
const normalized = section.replace(/\s+/g, ' ');
if (/Status: \*\*COMPLETE/.test(section) && /Gate 4 .*NOT deployed/.test(normalized)) {
  throw new Error('COH-006 is simultaneously complete/deployed and NOT deployed');
}
NODE
```

### Medium — M-3: the committed deployment receipt is narrative-only and overstates source identity

The repository records the deployment claims only in `AI-WORKBOARD.md` and
commit messages. It does not preserve the exact targeting/deploy/verification
commands, their exit results, the probe summary, a deployed-source hash or exact
comparison, or an immutable association between the Vercel deployment and the
published Git SHA. A second reviewer can inspect the claims but cannot reproduce
their proof from the committed artifacts.

In particular, “confirmed by reading the deployed source back” is stronger than
the recorded evidence “11 `hasAny`, 9 `canSeeWorkItem`.” Equal token counts are
not source equality. Record the full prior ruleset ID already known
(`bd3e029f-a2db-4faf-8f45-3e3d685b808c`), the exact commands and sanitized
results, and either an exact normalized comparison or cryptographic hashes of
the local and Rules-API sources. Record the Vercel deployment's Git commit/ref
association as well as `READY`. Preserve a sanitized exact probe summary rather
than only “0 failures.” If those outputs were not retained, say that plainly;
do not recreate evidence with another production run under this review.

This finding says the receipt is not independently auditable; it does not say
the reported deployment facts are false. The implementation owner's production
results remain unreproduced by Codex.

## Answers to the requested questions

1. **Is `bcb0fc2` correct and sufficient?** The fixture and expected IDs are
   correct, but the repair is not sufficient for arbitrary cache/order state.
   Enable metadata changes as in M-1. Keep the fixture for security coverage.
2. **Do the controls assert what they claim?** Yes. ADMIN's own private task is
   directly allowed; A and B each require exact `permission-denied`. The task
   matches none of A/B's five queries, adds once to ADMIN's merged union, has no
   comments, does not affect the shared-index query, and is included in the
   per-parent recursive cleanup. No existing A/B expected set or post-revocation
   path is perturbed.
3. **Is the cache-subset diagnosis right?** It explains why the local cache could
   answer the initial snapshot, but not why no server-backed callback was
   observed. The missing `includeMetadataChanges` option explains that observation
   without inferring that the server was skipped. The same correction applies to
   the earlier one-shot-before-listener diagnosis.
4. **Are the six `AGENTS.md` rules faithful?** Yes. They preserve reviewer,
   caller, publication, checkpoint, recovery, and pre-invocation requirements
   nearly verbatim, retain the one-way/no-network limits, and add no authority.
5. **What deploy evidence is unproven or overstated?** M-3. Nothing inspected
   contradicts the report, but the repository does not independently prove the
   baseline run, rules deployment/readback, full probe, Vercel SHA association,
   or browser smoke. Source-marker counts do not prove exact source equality.
6. **Runnable cases:** M-1 and M-2 include exact cases above. There is no new
   authorization-matrix case required for `admin-private`; its existing
   allow/deny cases are well formed.

## Reviewer verification

```text
git status --short --branch — clean detached tree at start
git diff --check ef15bb2..22d39fb — passed
node --check scripts/verify-coh006-gate3.mjs — passed
npm run test:unit — passed, 130/130
npm run lint — passed, 0 errors and 50 existing warnings
npm run test:rules — not run; Firebase emulator ports cannot bind in this sandbox
production probe/deploy/readback/Vercel/browser smoke — not run or accessed
```

The installed SDK contract was inspected locally at Firebase 12.13.0:
`SnapshotListenOptions.includeMetadataChanges` defaults to false, and the SDK's
`QueryListener.shouldRaiseEvent()` emits a sync-state-only event only when that
option is true. No production result is independently reproduced by this
review.
