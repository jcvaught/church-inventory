# COH-007 reader gate — implementation review

**Reviewed:** `97297672ddf5eb97e4c63cb874582983e7750ab2`, including reader-gate
commits `71548d8` and `5d363cd`, against additive-gate base `e5ed2ec`.

**Stage:** reader-gate implementation review. Nothing in this review was
deployed or run against production.

## Critical

None.

## High

### H1 — the production oracle does not observe a departure on one live, server-confirmed listener

`scripts/verify-coh007-reader-gate.mjs:87-99` calls `waitForArm()` once to see
the active fixture, and `waitForArm()` immediately unsubscribes when that
predicate becomes true. The script then archives the task and creates a **new**
listener to see that the id is absent. That proves two query states at different
times; it does not prove that an already-live active-board listener publishes a
removal when the task leaves its last arm, which is the claim at the top of the
script and the explicit rollout-step-5 acceptance condition.

There is a second oracle weakness in `waitForArm()` itself
(`scripts/verify-coh007-reader-gate.mjs:53-61`): it accepts a predicate on any
snapshot, including `snap.metadata.fromCache == true`. Merely enabling
`includeMetadataChanges` does not make a callback server-backed. In particular,
an absence predicate can resolve on an initially empty cached view before the
server admits and answers the query. The COH-006 regression this script cites
gets this right: `verify-coh006-listener-oracle.mjs` ignores cache callbacks and
resolves only when `fromCache` is false.

This must be fixed before the production acceptance run. Keep one active-arm
subscription open across the Admin SDK archive, require a server-backed
snapshot containing the fixture before the write, then require a later
server-backed snapshot from that **same subscription** without the fixture.
The archived-arm/reopen direction should use the same server-backed rule.

Exact state-machine case for the implementation owner to integrate into the
production script (factoring the observer is fine):

```js
const watchArm = (q, id, timeoutMs = 20000) => {
  const waiters = [];
  let lastServerIds;
  let failure;
  const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.fromCache) return;
    lastServerIds = snap.docs.map((d) => d.id);
    for (const wake of waiters.splice(0)) wake();
  }, (err) => {
    failure = err;
    for (const wake of waiters.splice(0)) wake();
  });
  const until = async (present) => {
    const deadline = Date.now() + timeoutMs;
    while (!failure && !(lastServerIds && lastServerIds.includes(id) === present)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`timed out waiting for ${present ? 'presence' : 'departure'}`);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('listener timeout')), remaining);
        waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    }
    if (failure) throw failure;
  };
  return { until, close: un };
};

const activeWatch = watchArm(activeTeam, ACTIVE_ID);
try {
  await activeWatch.until(true);       // server-backed presence
  await adminArchiveFixture();
  await activeWatch.until(false);      // same listener, server-backed removal
} finally {
  activeWatch.close();
}
```

The pure `createWorkStore` suite already proves last-source removal and the
no-partial-publication contract. This production case needs to prove the part
only production can: the deployed query/listener actually emits the removal.

## Medium

### M1 — the production acceptance script is narrower than rollout step 5

The normative plan requires two accounts against `team`, `own`, `assigned`,
`shared`, private-negative, stale-recipient-negative, and archived fixtures.
`scripts/verify-coh007-reader-gate.mjs` signs in one account and exercises only
the team arm. It therefore cannot be the complete production acceptance named
in the handoff.

The four arms do **not** each need a duplicate archive/departure/reopen
state-machine. `taskQueryArms()` is shared, and the pure tests pin that every
active arm receives `archived == false`; one correct live-departure oracle is
enough for the archive-discriminator transition itself. But the shared builder
does not make the rollout's authorization and exact-result matrix redundant.
Add a second signed-in account and server-backed exact-id assertions for all
four active arms plus the two negative fixtures. This can be a one-shot
`getDocsFromServer()` matrix around the single live team-arm transition.

Concrete fixture/assertion matrix:

```js
// member-a: creator of own; assignee; shared recipient
// member-b: unrelated negative actor and stale recipient on a private task
const expectedA = {
  team:     [TEAM_ID],
  own:      [OWN_ID],
  assigned: [ASSIGNED_ID],
  shared:   [SHARED_ID],
};
// For every arm, getDocsFromServer(query) and compare only this run's prefixed ids.
// Assert member-b's private and stale-recipient shaped queries are denied or omit
// the protected ids exactly as the deployed COH-006 production oracle specifies.
// After archiving one fixture, assert it is absent from its active arm and present
// in the corresponding archived arm.
```

Reusing the exact two-account fixture layout from the COH-006 production probe
is preferable to inventing another visibility oracle.

## Low

### L1 — source inequality is not a provenance guard for the pinned rules fixture

The sentinel's behavioral assertions are good: the same legacy edit, comment,
and create succeed under transitional and fail under final, while shaped active,
archived/reopen, and maintenance behavior stays aligned. I also independently
compared the fixture body byte-for-byte with
`e5ed2ec:firestore.rules`; it matches the deployed transitional source.

The comment-stripped inequality assertion at
`functions/test/rules/coh007-cutover-sentinel.test.mjs:77-81` is nevertheless
too weak for the job its comment assigns it. It proves only that *some*
non-comment source difference exists. A transitional fixture replaced by a
later source carrying an unrelated semantic difference can pass that guard.
The behavior cases would catch many such drifts, which is why this is Low, but
they do not authenticate the fixture as the deployed artifact.

Pin the fixture body to the deployed-source digest instead. The current body
(fixture after its 13-line fixture header) has SHA-256
`3fa73a8d32a6d184a5ae842b90ab288a87b66bd6ec2d482fafeac987a9953aeb`.
An exact digest check plus the existing side-by-side behavior cases proves both
provenance and the intended difference. Keep a focused structural assertion on
the intended expressions if readable diagnostics are desired; do not use
general inequality as the drift guard.

### L2 — the production script says the legacy fixture remains readable but does not test a read

At `scripts/verify-coh007-reader-gate.mjs:138-140`, the comment says the
unbackfilled fixture must remain readable, but the assertion only proves that it
is absent from the `archived == false` team query. Add a direct client
`getDoc()` assertion after the denied update. This is not a rules defect—the
single-document emulator cases and inspection show reads remain governed by
`canSeeWorkItem()`—but the production claim should be executable.

## Questions

### (a) Final ruleset and maintenance carve-out

Approved by inspection, subject to the emulator limitation below. The final
ruleset removes legacy usability from both ordinary task updates and task
comment/delete gates: create calls `archiveFieldsActive()`, task updates call
`archiveTransitionAllowed()` whose non-frozen arm requires active→active, and
task delete calls the now-active-only `archiveStateUsable()`.

`workItemCommentable()` is correct in both directions. Stored
`type == 'maintenance'` preserves maintenance comments without imposing archive
fields. A task cannot exploit that arm: task updates pin post-state type to
pre-state type, ordinary members cannot create maintenance items, and archived
task comments are already denied in the archive suite. The existing COH-006
case explicitly denies task→maintenance. No rule read path was weakened.

The final/transitional semantic diff is the intended one: legacy is removed
from usable/update/create task paths, and the additional type-aware comment
carve-out preserves A1. The frozen definition deliberately treats boolean
`archived:true` as frozen regardless of timestamp shape, consistent with the
already-reviewed fail-closed model.

### (b) Sentinel

Yes, its behavior matrix proves the transitional/final cutover difference. No,
the general source-inequality check is not a sufficient drift/provenance guard;
use the exact deployed-source digest described in L1.

### (c) Deploy ordering

Rules first, then web, is correct—and safer than the reverse. The currently
live additive-gate bundle creates the pair and preserves it on updates, so it is
compatible with final rules. Deploying the web first would expose
`archived == false` readers while a pre-additive tab could still create a
field-absent task under transitional rules, making it immediately invisible.
The required `--verify --baseline 92` delta pass belongs immediately before the
final-rules deploy; final rules then close the writer race before the reader
bundle moves.

### (d) One departure arm

One live departure arm is sufficient for the shared archive-filter mechanism,
provided H1 is fixed. Duplicating the entire lifecycle over own/assigned/shared
would add little because the builder and unit tests pin the same final
constraint on all four. The other arms still need the server-backed exact-set
and two-account authorization checks required by rollout step 5, as M1 states.

## Verification

Run in this clone at `9729767`:

```text
npm run test:unit — PASS, 166/166
npm run lint      — PASS, 0 errors / 51 warnings (reported baseline)
npm run build     — PASS, Vite build + prerender + verify-prod-bundle clean
git diff --check  — PASS
```

I cannot bind the Firebase emulator ports in this environment. Therefore
`npm run test:rules` and `npm run test:handlers` were **not run**, and **no rules
or handler result is independently verified**. Claude reports 112/112 rules and
73/73 handler tests at this SHA; those results remain unreproduced by a second
party.

The production verification script was not run because this gate is not live
and running it would exercise production state.

## Verdict

**Changes requested.** The rules cutover, reader construction, maintenance
carve-out, and deploy order are sound by inspection. Before deployment, make
the production listener oracle observe a server-backed removal on the same live
subscription (H1), and complete the rollout-step-5 two-account arm/negative
matrix (M1). L1 and L2 are small but should be folded into the same verification
hardening pass.
