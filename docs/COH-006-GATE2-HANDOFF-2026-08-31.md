# COH-006 Gate 2 Handoff — the backfill, before it is run

## Task

- Task ID and title: COH-006 — Enforce private and shared task visibility (gate 2 of 4)
- Owner: Claude
- Reviewer: Codex
- Branch: `claude/coh-006-task-visibility`
- Commit(s): `4bba7fe` (the script). Gate 1 is `ae7b04f`, `2ca5e84`, `0247791`,
  with your re-review's symlink finding fixed after that.
- Status: written and exercised against the emulator. **Not run against
  production. Nothing deployed.**

## Outcome

`scripts/backfill-task-visibility.cjs` brings existing task documents up to the
shape gate 3's queries and gate 4's rule require, and can be undone.

## Changes

- **Behavior changed:** none in the app. This is a script; running it is a
  separate, owner-triggered action.
- **Files/components changed:** one new file, `scripts/backfill-task-visibility.cjs`.
- **Data, rules, or API changes:** when executed, it writes `visibility` (only
  where absent or empty), `assigneeUids`, and `sharedWithUids` on task documents
  in `workItems`. Maintenance items are excluded.
- **Documentation changed:** none beyond the script's own header; the workboard
  already describes gate 2.

## What it does, and what it deliberately does not

1. **`visibility` normalisation.** Absent or empty becomes `'team'`. Every
   reader already treats a missing field as team — `canSeeTask`, the rule's
   `!keys().hasAny(['visibility'])` arm, `digestVisibleTasks` — so this writes
   down what the app already believes. It is required because gate 3's team
   listener is an equality filter, and a missing field does not match one.
2. **Projections.** `uidsOf` here is the same dedupe / drop-missing / sort policy
   as `src/utils/taskVisibility.js` and `uidProjection` in `functions/index.js`.
   A disagreement would show up as permanent churn in `--verify`.
3. **It does not clear stale `sharedWith` on private tasks.** That shape is inert
   now that gate 3's shared listener also constrains `visibility == 'shared'`
   (your gate-1 H-1). Rewriting user-visible data the app does not need
   rewritten is out of scope for a security backfill.

## Safety design

- Dry run is the default. Production requires **both** `--execute` and `--prod`,
  so an `--execute` that forgot `FIRESTORE_EMULATOR_HOST` refuses rather than
  silently migrating production — the same guard as
  `migrate-work-unification.cjs`.
- The service-account key's `project_id` is checked against
  `church-inventory-9615c` before a document is read. Five Firebase projects
  share one Google account.
- `--backup <file>` captures the pre-migration value of exactly the three fields
  the script can change, with `null` meaning "the field was absent".
- `--rollback <file>` restores them, deleting fields that were absent. It refuses
  a backup taken against a different target than the one it is pointed at.
- `--verify` is the gate before the reader cutover, and is also the delta pass:
  it reports documents with no `visibility`, either projection disagreeing with
  its source array, or a projection that is not a list.

## Verification

Against the Firestore emulator, with a fixture covering a legacy doc with no
`visibility`, an empty-string `visibility`, a private task carrying a stale
`sharedWith`, a shared task with a duplicate recipient, an already-projected
doc, a malformed map projection, and a maintenance item:

```text
dry run   — 6 tasks, 5 to write (the already-correct doc untouched)
verify    — 5 outstanding (no visibility 2, assigneeUids drift 5,
            sharedWithUids drift 5, not a list 1), exit 1
backup    — 6 rows captured
execute   — 5 written
verify    — 0 outstanding, green
re-run    — 0 written (idempotent)
rollback  — 6 restored; verify returns to exactly 5 outstanding
```

The maintenance item was excluded throughout.

One thing that exercise caught: against an **empty** emulator, `--verify`
reported "0 outstanding — safe to proceed". A wrong project, a wrong emulator, or
a credential that can see nothing all produce that same output, and this report
is the gate on removing the old reader. `--verify` now fails on an empty read
instead.

Not run: anything against production.

## Risk and Rollback

- **Main risks:** (a) the script's `uidsOf` drifting from the two writers'; (b) a
  write during the run producing a document the pass did not see — which is what
  the delta `--verify` immediately before cutover is for; (c) `visibility`
  normalisation touching a document whose empty-string value meant something
  other than "team" — I do not believe any writer produces that intentionally.
- **Rollback procedure:** `--rollback <backup file> --execute --prod`, proven on
  the emulator to restore the exact pre-migration state.
- **Production actions still requiring approval:** the entire gate — backup,
  execute, and verify — plus the gate-1 deploy that must precede it.

## Review Focus

1. **Ordering.** The plan runs gate 1 (writers) before gate 2 (backfill). Is
   there a window in that order where a document ends up worse off than if the
   order were reversed?
2. **The delta pass.** Is `--verify` a sufficient definition of "projection
   coverage is complete", or does it need to assert something it currently does
   not? It reads every task in every church, which is also its cost.
3. **The rollback's honesty.** It restores only the three fields it can change.
   If the backfill ran, then users edited tasks, then rollback ran, sharing edits
   made in between would be reverted in the projections but not in the object
   arrays. Is that worth guarding, or is it the expected shape of a rollback?
4. **The empty-read guard.** Is failing on `0 churches or 0 tasks` the right
   check, or is there a subtler partial-read failure that would still look green?

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
