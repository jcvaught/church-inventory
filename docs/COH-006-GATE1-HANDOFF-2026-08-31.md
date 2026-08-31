# COH-006 Gate 1 Handoff

## Task

- Task ID and title: COH-006 — Enforce private and shared task visibility (gate 1 of 4)
- Owner: Claude (DEC-2026-011)
- Reviewer: Codex
- Branch: `claude/coh-006-task-visibility`
- Commit(s): `ae7b04f` (projection writers), `c01bb7f` (plan amendments +
  DEC-2026-012), `2ca5e84` (digest fix + transitional read rule). Branch base is
  `main` at `9c16b35`; `d604c32` on that branch carries your round-2 review.
- Status: gate 1 code-complete, **not deployed**

## Outcome

Every task-creation and task-update path now writes `assigneeUids` and
`sharedWithUids` beside the `[{uid,name}]` arrays. Nothing reads them yet.

Two live behaviours do change on deploy, both additive:

1. An assignee can read a task they are assigned to, including a private task
   they did not create. The Help Centre has always promised this; the rule did
   not honour it.
2. The weekly attention digest no longer names private or shared tasks, and a
   digest cached under the old policy is rebuilt rather than served for the rest
   of the ISO week.

## Changes

- **Behavior changed:** as above. No change to what the Work board displays, to
  who may create or update a task, or to the unconstrained subscription — the
  reader cutover is gate 3.
- **Files/components changed:** `src/utils/taskVisibility.js` (`uidsOf`),
  `src/useFirestore.js` (`addTask`, `updateTask`), `functions/index.js`
  (`uidProjection`, `gatherAttentionSignals`, `buildAttentionDigest`),
  `functions/lib/attention.js` (`digestVisibleTasks`, `isDigestCacheUsable`,
  `DIGEST_POLICY_VERSION`), `firestore.rules` (transitional read arm),
  `src/pages/HelpPage.jsx`.
- **Data, rules, or API changes:** two new task fields, both additive and
  currently unread. One additive rule arm. One new cached-payload field,
  `policyVersion`, on `aiDigests/current`. No migration in this gate.
- **Documentation changed:** `docs/DATA_MODEL.md` (both representations and
  which is authoritative), `docs/AI-WORKBOARD.md` (four gates, index
  expectation), `docs/DECISIONS.md` (DEC-2026-012), Help Centre.

## Decisions and Assumptions

- **Approved decisions applied:** DEC-2026-010 (comments in scope, interim
  filter, skipped spec), DEC-2026-011 (Claude implements, Codex reviews),
  DEC-2026-012 (any authorized person may widen access — so the update rule will
  keep its pre-state check but will not pin the projections to their object
  arrays, and the uid arrays are canonical).
- **New decisions requiring owner confirmation:** none in this gate.
- **Assumptions made:** legacy tasks with no `visibility` field are team tasks —
  applied in `digestVisibleTasks` and matching `canSeeTask` and the existing
  rule arm. The gate-2 backfill normalises the field so this assumption stops
  being load-bearing.

## Verification

```text
npm run test:rules  — 38 pass, 0 fail (5 new: assignee arm, non-assignee denied,
                      admin has no override, legacy doc with no projection,
                      empty array grants nobody, tenant boundary held)
npm run test:unit   — 118 pass, 0 fail (10 in task-visibility.test.mjs,
                      6 in digest-visibility.test.mjs, attention parity intact)
npm run lint        — 0 errors, 50 pre-existing warnings
npm run build       — vite build clean; verify-prod-bundle ✓ 28 chunks, 0 jsxDEV
```

Not run, and why:
- **Production E2E.** The one production spec is still skipped; it asserts the
  gate-4 end state and would fail against gate 1 by design. Unskipped and
  rewritten at gate 4.
- **Index probe.** Nothing queries the new fields until gate 3, so there is
  nothing to probe yet. The workboard records the expectation (single-constraint
  queries, no composite index required) explicitly as unverified.
- **`npm run test:handlers`.** No callable handler changed shape; the digest
  changes are covered by the unit tests above.

## Risk and Rollback

- **Main risks:** (a) a creation path that does not funnel through `addTask`
  would write a task with no projections — I traced all of them to `addTask` and
  the one server-side generator, and that is the claim most worth checking; (b)
  the digest cache version bump costs one extra Claude call per church, once;
  (c) the new rule arm widens reads to assignees, intentionally.
- **Compatibility or migration concerns:** none in this gate. Old clients keep
  working; they simply create tasks without the projections, which is what gate 2
  backfills and gate 4's create rule finally forbids.
- **Rollback procedure:** revert the three commits and redeploy. The two new
  fields can stay on the documents harmlessly — nothing reads them. If only the
  rule needs reverting, the previous read block is one arm shorter.
- **Production actions still requiring approval:** the gate-1 deploy itself
  (Vercel client, `firestore:rules`, `firestore:indexes`, functions), and every
  later gate. Nothing has been deployed.

## Known Limitations

- Private and shared tasks still reach every member's browser. Gate 1 changes
  nothing about that; the interim store filter keeps them off screen.
- Task comments remain member-readable regardless of the parent's visibility
  until gate 4.
- `DIGEST_POLICY_VERSION` must be deployed before any post-cutover callable or
  email can serve an old payload — i.e. with the rest of gate 1, not after.

## Review Focus

1. **Completeness of the writer set.** Is there a task-creation or
   assignee/sharing-mutation path that does not go through `addTask`/`updateTask`
   in `src/useFirestore.js` or the recurring-template generator in
   `functions/index.js`? A missed path is a task the gate-3 readers cannot
   deliver to its recipients.
2. **The transitional rule arm.** `'assigneeUids' in resource.data &&
   request.auth.uid in resource.data.assigneeUids` — is it exactly the predicate
   the planned gate-3 `array-contains` query needs, does the guard behave on a
   document where the field is absent or not a list, and does it widen anything
   beyond assignees?
3. **The digest.** Does `digestVisibleTasks` sit early enough in
   `gatherAttentionSignals` that no private task name reaches `examples`, counts,
   or the Claude prompt by another route (`buildAttentionDigest`, the weekly
   email, the admin callable)? Is versioning the cache sufficient, or is there a
   path that serves an unversioned payload?
4. **`uidsOf` semantics.** Dedup + sort + drop-missing. Anything that would make
   a projection disagree with its object array in a way gate 4 would then
   enforce.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
