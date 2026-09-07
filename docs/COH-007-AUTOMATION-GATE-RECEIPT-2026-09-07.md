# COH-007 automation gate — receipt, 2026-09-07

**Enabled by:** Claude, on the owner's explicit approval of a measured eligible
count. **Project:** `church-inventory-9615c`.

**Result: archiving is live. 35 tasks archived, 0 failed, 0 conflicted — exactly
the set captured before the flip.** COH-007 is complete.

## Why the flip was a decision and not a leap

The archiver shipped **inert** at the additive gate and ran daily as a dry run
through two gates. By the time the switch moved, the collection-group index was
proven against production, the heartbeat was already on the scheduled-job
monitor, and the owner approved a real measured count rather than an estimate.
The only thing that changed today was a boolean.

## Captured before, so the run is undoable

`~/apps/coh007-migration/pre-automation-eligible-2026-09-07.json` — the exact 35
document paths, task numbers and completion dates.

```text
cutoff  2026-07-27T12:50Z
oldest eligible completion  2026-05-06     newest  2026-07-20  (49 days back)
```

Nothing sat on the 42-day boundary, so the first run was never going to turn on
a borderline judgement.

## The run

```text
status completed, 2055 ms, no error
dryRun false · examined 35 · eligible 35 · archived 35
conflicted 0 · failed 0 · malformedReturnedByEligibilityQuery 0 · truncated false
```

## Threshold verification — exact, not aggregate

Counts agreeing is not the same as the right documents moving, so the archived
set was compared **by document path** against the pre-flip capture:

```text
archived                     35  (expected 35)
missing from the run          0
archived UNEXPECTEDLY         0
archived without a timestamp  0
still-active Complete tasks  14   ← must NOT have moved
  threshold violations        0
  oldest still-active completion  2026-08-18  (newer than the cutoff)
active board tasks           57   (92 − 35)
maintenance                  42   untouched, none carrying archive fields
```

Fourteen Complete tasks stayed on the board, the oldest completed twenty days
ago. The 42-day rule did exactly what it says.

## Idempotency, and the rest of the verification

- **Second run: `examined: 0`, `archived: 0`.** The `archived == false` filter is
  what makes a re-run free rather than merely harmless.
- **Reader-gate acceptance re-run post-flip: 24/24.** The live server-backed
  departure oracle, rollout step 5's two-account matrix, and the sentinel all
  still pass against the deployed rules with archiving switched on.
- **Coverage unchanged:** 92 tasks, 0 unbackfilled, 0 malformed.
- All 35 archived tasks kept their task number and carry an `archivedAt` stamp.

**One property is NOT production-verified, and should not be read as if it
were.** None of the 35 tasks in this particular set had comments, photos, or
cross-hub links, so archiving's losslessness for those is covered by the handler
test (`archiving preserves every other field and its comments`) and by
inspection — not by this run. The first archived task that does carry a
discussion is worth a look.

## Kill switch

`ARCHIVER_WRITES_ENABLED = false` in `functions/index.js`, redeploy
`functions:archiveCompletedTasks`. It takes effect on the next scheduled run and
touches no data. A handler test pins that it still works, because a switch that
silently stopped working after the flip would leave no way to halt archiving
short of deleting the job.

Undoing an initial run is a **separate migration** with its own backup, dry run
and approval — the capture above is what makes that possible.

## What users see now

Completed tasks older than six weeks leave the board and appear under
**Tasks → Archived**, searchable, with full detail, read-only until reopened.
The empty-state copy that said archiving was not switched on yet is gone, and
the Help Centre section describing it is accurate for the first time.

## COH-007 is complete

| Gate | Status |
|---|---|
| Additive | deployed and verified 2026-09-07, probes 26/26 |
| Backfill | 92 tasks, 0 outstanding, A3 measured |
| Reader | deployed and verified, 24/24 |
| Automation | **live, 35 archived** |

Follow-ups carried out of the task, none blocking:

1. Remove the four client backlink cleanups (`useFirestore.js:758`, `:852`,
   `:1276`, `:1342`) once a day of real Sentry traffic on
   `area:backlink-cleanup` is clean — the last open gate from COH-008.
2. Watch the first archived task that has comments or photos, to close the
   losslessness property above against production.
3. DEC-2026-018's read-count/latency tripwire for archive search is recorded but
   not instrumented; `ARCHIVE_ARM_LIMIT = 500` per arm is a runaway guard, not a
   page, and cannot bind at the current population.
