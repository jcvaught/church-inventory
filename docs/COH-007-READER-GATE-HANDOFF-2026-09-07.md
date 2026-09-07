# COH-007 reader gate — implementation handoff

## Task

- Task ID: **COH-007**, gate 4 of 5 (**reader gate**) — the cutover
- Owner: **Claude** · Reviewer: **Codex** (DEC-2026-011)
- Branch: `main` (the additive gate merged and is live; this builds on it)
- Commits: `71548d8` (sentinel + final ruleset) → `5d363cd` (the reader cutover)
- Status: **Implemented and locally verified. NOTHING DEPLOYED.** Awaiting review, then owner authorization for the rules deploy and the web deploy.

Prior gates: additive gate deployed and verified 2026-09-07
(`docs/COH-007-ADDITIVE-GATE-DEPLOY-RECEIPT-2026-09-07.md`); backfill executed
the same day, 92 tasks, 0 outstanding
(`docs/COH-007-BACKFILL-GATE-RECEIPT-2026-09-07.md`).

## Outcome

The active board's four task arms now carry `archived == false`, so archived
work leaves the always-live listeners **at the query layer** rather than being
hidden in JSX. The final ruleset ships with it: an unbackfilled task is refused
rather than tolerated.

**This is the gate where a mistake makes tasks disappear.** A task that does not
carry `archived` matches the new filter not at all — not false, absent — and
would simply stop appearing on its owner's board, with no error anywhere. The
backfill reaching zero outstanding is what makes the change safe, and the final
ruleset is what keeps it safe against a stale tab.

## Changes

- `src/useFirestore.js` — `taskQueryArms({ archived: false })`. One value.
  The maintenance arm stays hand-built and unconstrained (A1).
- `firestore.rules` — the **final** ruleset. Exactly one arm removed: the one
  treating a task carrying neither field as active. Plus a fix described below.
- `functions/test/rules/coh007-cutover-sentinel.test.mjs` (new) and
  `functions/test/rules/fixtures/transitional-archive-2026-09-07.rules` (new,
  a pinned snapshot of the deployed transitional ruleset).
- `scripts/verify-coh007-reader-gate.mjs` (new) — production acceptance.
- `functions/test/rules/coh007-archive.test.mjs` — three legacy-tolerance cases
  rewritten to assert the final behaviour; the transitional half now lives in
  the sentinel, which owns the difference.
- `functions/test/rules/coh006-visibility.test.mjs`,
  `functions/test/rules/core-collections.test.mjs` — task fixtures carry the
  archive pair, because post-cutover every task does.
- `functions/test/work-queries.test.mjs` — the deployed arm shape pinned.

## The one thing that nearly went wrong

**Tightening the archive shape almost denied every maintenance comment in every
church.** The comment gate was written in terms of "usable archive shape". Under
the transitional ruleset `absent` was one of those shapes, so maintenance
items — which carry neither field by design (A1) — passed *incidentally*.
Narrowing tasks to `active` removed that accident. The gate is now explicitly
type-aware, and the sentinel asserts a maintenance comment under both rulesets.

It is recorded here rather than quietly fixed because it is the characteristic
failure of a narrowing change: nothing warns you, the tests that would have
caught it were about a different subject, and the blast radius is a hub nobody
was thinking about.

## Verification

```text
npm run test:rules     — 112/112 (8 new in the sentinel)
npm run test:handlers  —  73/73
npm run test:unit      — 166/166
npm run lint           — 0 errors, 51 warnings (baseline)
npm run build          — clean
```

**Not run:** `scripts/verify-coh007-reader-gate.mjs`, because it asserts
behaviour that only exists once the final rules are deployed. It is this gate's
acceptance step, and it needs the owner's authorization. `npm run test:e2e` is
also unrun; its archive cases cannot fire until the automation gate.

No emulator result is a production claim. The emulator fails OPEN on list
queries, so the production probe is not optional here.

## Risk and Rollback

- **Main risk: a task that is missing, or acquires a missing, archive pair
  vanishes from its board silently.** The backfill closed the existing
  population; the final ruleset closes the stale-tab path. The delta pass
  (`--verify` immediately before deploy) is what proves the first is still
  true at deploy time rather than at backfill time.
- Second risk: the maintenance carve-out above, in the reverse direction —
  check I have not opened a hole while closing the comment one.
- Rollback: revert `firestore.rules` to the transitional ruleset and redeploy;
  revert the one-line reader change and redeploy the web. Both are independent
  and neither touches data. **Rolling back the BACKFILL is no longer safe once
  this ships** — removing the pair would make a task match neither reader.

## Review Focus

1. **The final ruleset's removal.** Is `archiveFieldsActive` now required
   everywhere it must be, and is the maintenance carve-out in
   `workItemCommentable` correct in both directions — no maintenance denial, no
   task loophole?
2. **The sentinel.** Does it actually prove the difference, and is the drift
   guard sufficient? It compares comment-stripped sources; say if that is too
   weak.
3. **The cutover ordering.** I intend to deploy rules FIRST, then the web
   bundle, on the reasoning that the currently-live bundle already writes the
   pair and its updates preserve it, so it is compatible with the final rules —
   while a pre-additive-gate tab is exactly what the final rules should start
   refusing. Confirm or correct that.
4. **What the production script does not cover.** It runs one arm (team). Say
   whether own/assigned/shared need their own departure assertions before
   cutover, or whether the shared query builder makes that redundant.

Findings as test cases wherever one can be written.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
