# COH-006 Gate 4 — Deployment Receipt

Written to answer Codex post-deploy review **M-3**: the deployment claims lived
only in commit messages and `AI-WORKBOARD.md`, so a second reviewer could read
them but not reproduce their proof. Where evidence was not retained at the time,
this says so rather than recreating it with another production run.

- Deployed by: Claude, on the product owner's explicit authorization
  ("Please deploy", 2026-09-03)
- Project: `church-inventory-9615c` (ChurchOpsHub production)
- Release SHA R: `f4c890d` · Handoff H: `ef15bb2` · Probe fix: `bcb0fc2`
- Pre-deploy approval: Codex `f5e1dbe`, approved with no findings

## 1. Project targeting

The Firebase CLI's active project was **`courtclimber`**, not ChurchOpsHub,
despite `.firebaserc` naming `church-inventory-9615c` as default. Every command
therefore passed `--project church-inventory-9615c` explicitly.

```text
firebase use                      → courtclimber          ← NOT the target
cat .firebaserc                   → default: church-inventory-9615c
serviceAccountKey.json project_id → church-inventory-9615c
```

## 2. Ruleset before and after — exact, by hash

Prior release, recorded before any change:

```text
projects/church-inventory-9615c/rulesets/bd3e029f-a2db-4faf-8f45-3e3d685b808c
updateTime 2026-09-02T11:26:37.707609Z          (the Gate 3 deploy)
```

Deploy command and result:

```text
firebase deploy --only firestore:rules --project church-inventory-9615c
  ✔ cloud.firestore: rules file firestore.rules compiled successfully
  ✔ firestore: released rules firestore.rules to cloud.firestore
  ✔ Deploy complete!                            2026-09-03T23:39:39Z
```

Deployed ruleset, read back from the Firebase Rules API and compared to the
local file by SHA-256 rather than by marker counts:

```text
ruleset          db4736ab-3747-47f4-9fe1-07ec92878ba8
updateTime       2026-09-03T23:39:42.675557Z
deployed sha256  517f1b01437102265dc4792acb8ab960d24d79abc16b982155a3d9ff7194401d
local    sha256  517f1b01437102265dc4792acb8ab960d24d79abc16b982155a3d9ff7194401d
bytes            38727 / 38727
EXACT MATCH      true
```

The `local` side is `firestore.rules` at R (`f4c890d`), unchanged since. Anyone
with read access can reproduce this comparison; it supersedes the earlier
"11 `hasAny`, 9 `canSeeWorkItem`" claim, which was a token count and **not**
source identity.

## 3. Pre-deploy data gate

Baseline re-established independently by per-church aggregation `count()`, not
by reusing the stale 90 or by trusting the verifier's own scan:

```text
UTC 2026-09-03T23:38:52Z
  6cksNI9Uv8h0jXptdTESnXTXFgF3-church: 92
  (five other churches: 0 tasks each)
INDEPENDENT BASELINE (aggregation count): 92

UTC 2026-09-03T23:39:17Z
node scripts/backfill-task-visibility.cjs --verify --baseline 92
  Total across 6 church(es): 92 task(s), 0 outstanding.
  ✅ Every task this scan observed is fully projected.
```

The package-time run against the stale `--baseline 90` had failed at 92
observed / 0 outstanding. The +2 were two tasks created in the live church on
2026-09-03 at 13:20:25Z and 13:23:08Z, both `private`, both correctly projected
— organic activity since the 2026-09-02 backfill.

## 4. Canary, immediately after deploy

All five deployed client query shapes, `getDocsFromServer`, signed in as member
A against the empty e2e tenant. The `assigned` and `shared` arms are the two the
pre-`hasAny` guard would have rejected.

```text
✓ assigned ADMITTED   ✓ shared ADMITTED   ✓ team ADMITTED
✓ own ADMITTED        ✓ maintenance ADMITTED
✅ CANARY PASSED — all five deployed shapes admitted
```

## 5. Full production probe

`scripts/verify-coh006-gate3.mjs`, two members plus admin, against the deployed
final rules.

**First run FAILED**, 1 assertion: ADMIN `own` listener timeout. Diagnosed at
the time as a cache-subset problem and fixed with the `admin-private` fixture
(`bcb0fc2`); **that diagnosis was wrong** — see Codex M-1 (`0f41b46`) and the
correction in §7.

**Second run PASSED**, 0 failures — 26 assertions including all five query
shapes by listener and one-shot for each of A, B and ADMIN with exact sorted ID
sets; merge completeness and de-duplication; the admin-with-no-relationship
control; the unconstrained old-client tripwire (exact `permission-denied` for A,
B and ADMIN); the comments matrix with post-revocation denial; the COLLECTION
composite index plan assertion; and cleanup.

```text
✓ cleanup: no probe comments orphaned (0 remain of 3 created)
✓ cleanup: e2e-test-church is empty again (0 remain)
✅ PROBE PASSED
```

Full stdout was captured to a session scratch log, which is **not retained in
the repository**. Only the summary above is preserved. Future probe runs should
tee to a committed sanitized artifact.

## 6. Client publish

```text
merge to main            a9b7ffc  (--no-ff, from claude/coh-006-gate-4)
close-out merge          22d39fb
Vercel production        dpl_6LX91hZMgWMoJf1BGpyFz7MHbk5s
  state                  READY
  target                 production
  githubCommitSha        a9b7ffc4c41da995619ab6a6dbc276b44e92bd3f
  githubCommitRef        main
```

Help Centre smoked in a real browser, because the accordion bodies are neither
in the prerendered HTML nor in any chunk reachable from the entry bundle — an
HTTP fetch cannot verify this copy, and an earlier attempt to do so was
inconclusive in a way that initially read as a failed deploy.

```text
hasNew ("administrators are no exception")  true
hasOld ("not a security boundary yet")      false
```

Console during that check: one deprecated-meta warning and one
`securetoken.googleapis.com` 400 from an unauthenticated token refresh. Neither
relates to Firestore rules or to Gate 4.

## 7. Correction issued after this deployment

Codex post-deploy review `0f41b46`
(`docs/COH-006-GATE4-POSTDEPLOY-REVIEW-2026-09-05.md`) found that the ADMIN
`own` listener timeout in §5 was **not** evidence that the SDK skipped a server
round-trip. `onSnapshot()` was called without `{ includeMetadataChanges: true }`,
which defaults to false in Firebase 12.13.0; a backend confirmation that changes
only sync metadata then raises no second callback. A warm cache and a dead
listener were indistinguishable to the probe.

Confirmed empirically by `scripts/verify-coh006-listener-oracle.mjs`: with
metadata events enabled both listeners are server-backed after one cache
callback; with them disabled both time out while the one-shot read succeeds in
either case.

This is a **false-negative / test-reliability** defect. It does not put any
result in §4 or §5 in doubt — every reported listener ultimately produced a
`fromCache === false` snapshot with exact IDs — and it does not affect the
deployed rules, which are unchanged and hash-verified in §2.
