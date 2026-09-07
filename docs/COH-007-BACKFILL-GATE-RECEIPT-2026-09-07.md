# COH-007 backfill gate — receipt, 2026-09-07

**Executed by:** Claude, on the product owner's explicit authorization after
reviewing the dry-run counts.
**Project:** `church-inventory-9615c` — the script refuses to run if
`serviceAccountKey.json` targets any other of the five projects on the account.
**Script:** `scripts/backfill-task-archive.cjs` (`b7aaeef`).

**Result: 92 tasks written, 0 skipped, 0 malformed, 0 outstanding.**
Nothing else changed. No task moved, changed status, or was deleted, and the
change is invisible to users.

## Sequence

Each step is a separate command, and the execute step was the owner's call.

| Step | Result |
|---|---|
| `--backup` | 92 tasks across 6 churches → `~/apps/coh007-migration/coh007-backup-2026-09-07.json` |
| `--verify` (before) | 92 outstanding — every task missing the pair, 0 malformed |
| dry run | 92 to write; Complete 49, In Progress 14, Planning 13, Backlog 8, On Hold 7, Cancelled 1 |
| `--execute --prod --manifest` | **92 applied, 0 skipped** |
| `--verify --baseline 92` | **0 outstanding** — green |
| `audit-coh007-archive-shape.mjs` | independent second tool: 92 active, 42 maintenance absent |
| `--measure-a3` | **measured** — see below |
| archiver dry run | **35 eligible**, 0 malformed, still writing nothing |

Rollback manifest: `~/apps/coh007-migration/manifest-2026-09-07.jsonl`.

## Proved on the emulator before production

The parts that only matter when something goes wrong were exercised first,
because a migration's rollback path is exactly the code nobody tests:

- dry run 2 of 4 → execute 2 applied → verify green against `--baseline` →
  re-run 0 (idempotent);
- an already-archived task kept **both** its flag and its timestamp;
- a maintenance item still carried no archive fields (A1, in both directions —
  `--verify` fails if a maintenance item ever acquires them);
- rollback restored both documents; and, with a document deliberately changed
  after the run, rollback restored one, **refused the other by name, and exited
  incomplete** rather than clobbering the later write.

## Coverage, checked twice by different tools

`--verify --baseline 92` reports 0 outstanding. It refuses to print a green
light on an empty read or on a population that disagrees with the baseline —
both otherwise look identical to a clean pass while actually meaning "wrong
project" or "partial read".

`scripts/audit-coh007-archive-shape.mjs`, written for the additive gate and not
derived from the backfill, agrees independently: **92 active, 42 absent, 0
malformed, 0 frozen.**

**Reading that audit correctly matters, and an earlier note of mine got it
wrong.** Its 42 `absent` are the **maintenance items**, which must never carry
the pair (A1). The reader-gate go/no-go is therefore
`backfill-task-archive.cjs --verify` reaching **0 outstanding**, which counts
tasks only — *not* the raw audit's `absent` count reaching zero. The earlier
phrasing would have blocked the reader gate forever on a condition that must
never be true.

## The A3 measurement — MEASURED, and the hypothesis stays refuted

This is the first moment the question was answerable: before the backfill the
archiver's `archived == false` filter matched nothing, so any result was vacuous
by construction.

```text
explicit completedAt == null : 2 document(s)
completedAt <= "2026-09-07T12:00:23.110Z" : 47 document(s)
of the null-dated baseline, 0/2 appear in the range result.
```

**The baseline is non-empty, so this is a real answer rather than an absence of
one** — which is precisely the distinction Codex's Q2 correction insisted on.
Production **excludes** explicitly-null completions from the range filter,
matching the emulator and refuting A3's original hypothesis for a second time.

Consequence, unchanged from the additive gate: the archiver's skip-malformed
guard is **defensive, not load-bearing**, and its null counter is expected to
stay at zero. The guard ships regardless — what the measurement decided was the
expected counter, never whether to guard.

Missing-field documents remain a separate population that no equality-to-null
query can reach. They are invisible to the archiver by construction (A12), and
that is recorded as a known limit rather than quietly implied to be covered.

## The number the automation gate needs

With the pair now present, the archiver's dry run examines real documents for
the first time:

```text
dryRun: true, examined: 35, eligible: 35, archived: 0,
malformed: 0, conflicted: 0, failed: 0, truncated: false,
cutoff: "2026-07-27T12:00:46.893Z"
```

**35 tasks would be archived on the first real run** — completed more than six
weeks ago, out of 49 Complete tasks total. `malformed: 0` is consistent with the
measurement above: the two null-dated tasks never enter the range at all.

That count is what the automation gate asks the owner to approve, and it should
be re-checked immediately before the flip rather than assumed still current.

## Rollback

```bash
node scripts/backfill-task-archive.cjs --rollback \
  ~/apps/coh007-migration/manifest-2026-09-07.jsonl --execute --prod
```

Conditional and transactional: a document is restored only while it still holds
exactly what this run wrote. Anything a person has edited since is named and
refused, and the command exits non-zero rather than reporting a clean rollback.

**This becomes unsafe once the reader gate ships** — removing the pair from a
task would make it match neither equality-filtered reader and disappear from its
board. After cutover, undoing this is a forward migration, not a rollback.

## Next

1. **Reader gate.** Its FIRST commit is Q1's final-ruleset sentinel. Re-run
   `--verify --baseline <count>` immediately before cutover as the delta pass;
   the final ruleset ships **with** the reader change, not before it.
2. **Automation gate.** Flip `ARCHIVER_WRITES_ENABLED` and `ARCHIVING_ENABLED`,
   with a controlled threshold verification against the eligible count above.
