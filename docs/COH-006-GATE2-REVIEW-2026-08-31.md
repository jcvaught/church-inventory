# COH-006 Gate 2 Review

## Review target

- Branch: `claude/coh-006-task-visibility`
- Reviewed tip: `4b0fa6f`
- Script commit: `4bba7fe`
- Handoff: `docs/COH-006-GATE2-HANDOFF-2026-08-31.md`
- Reviewer: Codex
- Date: 2026-08-31

## Verdict

**Changes requested.** The forward transform is small, idempotent, and agrees
with the Gate-1 client and server projection policy. Normalising absent or empty
visibility to `team`, projecting both UID arrays, excluding maintenance, and
requiring the explicit production write flags are sound.

Two safety properties are not yet strong enough for a production migration:
rollback can overwrite legitimate sharing changes made after the backup, even
on documents the backfill never changed, and `--verify` is a sequential
point-in-time scan that can print “Safe to proceed” while a stale client creates
an uncovered task during or immediately after that scan. The latter is the
subtle partial-read case the total-empty guard cannot detect.

## Findings

### High — H-1: rollback restores every backed-up task unconditionally, not the writes made by this migration

The backup records all tasks (`scripts/backfill-task-visibility.cjs:131-147`),
the forward pass writes only tasks for which `plan()` returns a delta
(`:185-193`), but rollback writes the three backed-up fields to every row without
checking the current document (`:153-175`). The emulator result makes the
mismatch visible: the migration wrote 5 documents and rollback “restored” 6.

That has several unsafe consequences on a live system:

1. An already-correct task that the migration did not touch is still included
   in rollback. If a user edits its sharing after the backup, rollback replaces
   the new projections with the old ones despite there being no migration write
   to undo.
2. The same occurs on a migrated task edited after execution. Rollback restores
   only the projection fields while leaving the newer `assignees` and
   `sharedWith` object arrays intact, creating exactly the drift described in
   the handoff. That can remove a legitimate reader or preserve an obsolete one
   until another application write repairs the projection.
3. A stale-client task created after the backup can be changed by the later
   execution scan but has no rollback row, so the claim that the backfill “can
   be undone” is not complete.
4. If a backed-up task is deleted before rollback, `batch.update()` fails; after
   earlier 400-write batches have committed, that can leave a partial rollback.

Restoring only the three fields the script can change is the correct *scope* of
rollback. Blindly restoring an old value for those fields is not the expected
shape when live edits can interleave.

Required change: couple the backup to the actual forward-write manifest and
make rollback conditional. A safe design would record, for each document the
execution intends to change, both the before-image and expected migrated
after-image, then transactionally restore only when the current three fields
still equal that after-image. A mismatch or missing document should be reported
and refused, not overwritten. Execution must not migrate a document absent from
that manifest unless its before-image is added first. An operational write
freeze spanning backup, execute, verification, and any rollback is an
alternative, but it must be explicit and enforced in the runbook; the present
handoff describes a live delta pass instead.

### High — H-2: `--verify` cannot establish continuing coverage while stale writers remain admitted

For each church, `eachTask()` takes a separate `workItems` snapshot in sequence
(`:119-126`). Once a church has been scanned, a stale pre-Gate-1 client can
create a task there without projections. That document is absent from the
completed snapshot, so the scan can finish with zero outstanding and print
“Safe to proceed” (`:239-240`). A write immediately after the last snapshot has
the same result. Gate 1 reduces this race for refreshed clients but deliberately
does not reject stale-client creates; the final create-shape enforcement is
scheduled for Gate 4, after the Gate-3 reader cutover.

Therefore `--verify` is sufficient as a per-document consistency check for the
documents in its snapshots, but it is not by itself a sufficient definition of
“projection coverage is complete” at cutover. “Immediately before” narrows the
race; it does not close it.

No additional projection-field assertion is required for the current reader
semantics: exact equality with `uidsOf()` proves both list shape and membership,
and a truthy nonstandard visibility value already behaves creator/assignee-only
under `canSeeTask`, so the own/assigned listeners preserve that behavior. The
missing guarantee is population stability.

Required change: close the write race across final execute/verify and the reader
cutover. The clean options are either (a) enforce the Gate-4 task-create shape
before the final scan, accepting the already-documented stale-client reload
behavior while the transitional read rule remains live, or (b) establish an
actual write freeze that remains in force through final backfill, verification,
Gate 3, and the create-rule enforcement. A count check or a second scan alone
does not close a concurrent-create race.

### Medium — M-1: the empty-read guard is a useful smoke check, not a completeness check

Failing on zero churches or zero total tasks (`:230-237`) is correct; an empty
dataset must never authorize cutover. With the hard-coded production project ID
and an Admin SDK full query, a production query error should reject rather than
silently return a permission-filtered subset, so “a credential that can see
nothing” is not the main residual concern.

The guard still accepts any nonempty population. A wrong but populated emulator,
an unexpectedly small production scan, orphaned `workItems` below a nonexistent
parent church document, or the temporal partial scan in H-2 can all look green.
The script prints counts, but it does not compare the verified document IDs or
counts with the backup/execute manifest or another expected baseline.

Required change: after resolving H-1, make verification reconcile the exact
forward-write/backup manifest and report total church/task counts against the
operator-approved baseline. Document the parent-church assumption. This does
not replace the write-race control in H-2, but it turns nonempty-yet-incomplete
reads into a fail-closed result rather than relying on visual inspection.

### Low — L-1: the backup format cannot faithfully distinguish absent fields from stored `null`

Backup uses JSON `null` as the absent-field marker (`:139-150`), and rollback
interprets every `null` as a delete (`:166-170`). If a legacy field is actually
stored as `null`, rollback deletes it rather than restoring its exact pre-run
state. The resulting access behavior is likely equivalent for these fields, but
the handoff's exact-restoration claim is stronger than the implementation.

Use an explicit presence bit or a structured sentinel for each field. The
backup writer should also refuse to overwrite an existing backup path so a
second invocation cannot silently destroy the original rollback artifact.

## Review-focus answers

1. **Ordering:** Gate 1 before Gate 2 is the right order. The new fields are
   inert before Gate 3, and deploying writers first reduces the number of
   transition documents the backfill must repair. Reversing the order would
   leave every active client, not only stale clients, able to create new gaps.
   The remaining stale-client interval is H-2, not a reason to reverse the
   gates.
2. **Delta pass:** its field-level definition is sufficient for each task it
   observes. It is not sufficient as a cutover guarantee until writes are
   frozen or create-shape enforcement is already live, and until the observed
   population is reconciled against a trusted manifest/baseline.
3. **Rollback:** limiting rollback to the three migration-owned fields is
   correct. Reverting them unconditionally after users edit the corresponding
   source arrays is unsafe and worth guarding against. This is not ordinary
   rollback behavior because it creates a state the forward writers themselves
   would never write.
4. **Empty-read guard:** failing on zero churches or zero tasks is correct but
   only catches total emptiness. It cannot detect a plausible nonempty wrong
   target, an orphaned-parent scope gap, a count shortfall, or a task created in
   a church after that church's verification snapshot.

## Verification and limits

- Read the Gate-2 handoff at `4b0fa6f` and reviewed the complete script at
  `4bba7fe` without checking out or editing the counterpart branch.
- Compared `uidsOf()` with the Gate-1 client and Cloud Function writers and
  traced its output against the planned team/creator/assignee/shared query set
  and transitional rule.
- Reviewed the repository migration/revert guidance and the prior COH-006
  rollout findings; checked `4bba7fe^..4bba7fe` with `git diff --check` (clean).
- I did **not** run the script in any mode, start an emulator, perform a
  production read or write, deploy, or touch production data.
- The reported emulator lifecycle—dry run, verify, backup, execute, idempotent
  rerun, rollback, and final verify—**stands unreproduced by this reviewer**.
  This review is static logic and safety analysis, not independent behavioral
  reproduction.

