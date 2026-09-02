# COH-006 Gate 2 Runbook — the backfill

Gate 1 is deployed. This is the step that needs the product owner's explicit
execution approval (DEC-2026-014: Claude deploys code, the owner approves
anything that mutates production data). Nothing below has been run.

## What it changes

Every `workItems` document with `type: 'task'`, in every church:

- `visibility` — written as `'team'` only where it is absent or empty. Existing
  values are never altered.
- `assigneeUids`, `sharedWithUids` — plain uid arrays projected from `assignees`
  and `sharedWith`.

Maintenance items are untouched. `sharedWith` and `assignees` themselves are
never rewritten, including stale `sharedWith` on a private task: that shape is
inert, because the gate-3 shared listener also constrains `visibility == 'shared'`.

## Before you approve

The backfill only matters if gate 1 is fully live, because gate 1's create rule
is what stops new unprojected tasks appearing behind the scan:

- [x] client deployed — `/version.json` matches `main`
- [x] indexes deployed and the composite probed present
- [ ] functions deployed
- [ ] rules deployed (transitional read arm + create shape)

## The sequence

Every command runs from `/Users/johnvaught/apps/church-inventory`. Production
requires **both** `--execute` and `--prod`; the script also refuses to start if
`scripts/serviceAccountKey.json` is not for `church-inventory-9615c`.

```bash
# 1. Dry run — reads only, changes nothing. Note the task count it reports.
node scripts/backfill-task-visibility.cjs

# 2. Backup — the full pre-migration snapshot, kept for audit and manual repair.
node scripts/backfill-task-visibility.cjs --backup coh006-backup-$(date +%Y%m%d-%H%M).json

# 3. Execute. The manifest is the ONLY thing that makes this undoable — keep it.
node scripts/backfill-task-visibility.cjs --execute --prod \
  --manifest coh006-manifest-$(date +%Y%m%d-%H%M).json

# 4. Verify, with an independently established baseline (see below).
node scripts/backfill-task-visibility.cjs --verify --baseline <count>
```

Rollback, if it comes to that:

```bash
node scripts/backfill-task-visibility.cjs --rollback <manifest> --execute --prod
```

It restores a document only where the three fields still hold exactly what the
migration wrote, refuses anything edited since, and **exits non-zero if any row
is refused** — a partial rollback must not read as a completed one.

## The baseline is the part that needs a human

`--baseline` compares the scanned task count against a number you supply. That
is a real check only if the number comes from somewhere other than this
scanner — the Firebase console's document count, or the backup file's `count`
field. Copying the count from step 1's own output back into step 4 proves
nothing (gate-2 review M-1). Record the source, the value, and the time in the
handoff.

It remains a count check, not identity reconciliation: equal counts could in
principle hide one missing and one unexpected document. That residual is
accepted for this gate, given the project guard, the orphan-tolerant
enumeration, the create-shape rule already live, and the full backup retained.

## What can go wrong, and what happens

- **Interrupted mid-run.** The manifest is a write-ahead journal, fsynced before
  each change commits, so every committed write is recoverable. Rollback reports
  `RUN DID NOT COMPLETE` and still restores. Re-running is safe and idempotent.
- **A user edits a task during the run.** The document's attempt re-reads and
  re-plans against their data, so the projections match what they wrote. No row
  is left behind.
- **A stale browser tab.** Its task *creates* are already denied by gate 1's rule
  until it reloads — deliberate, DEC-2026-013. Its *updates* can still write an
  object array without moving the projection; the verify pass catches that if it
  happens before cutover.

## After it passes

`--verify` reporting zero outstanding is the precondition for gate 3, not proof
on its own. Gate 3 must not deploy until this has run and verified, or the
constrained readers will hide every task that still lacks projections.
