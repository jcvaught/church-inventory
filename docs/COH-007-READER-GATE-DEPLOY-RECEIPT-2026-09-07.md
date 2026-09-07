# COH-007 reader gate — deploy receipt, 2026-09-07

**Deployed by:** Claude, on the owner's authorization, after Codex approved.
**Project:** `church-inventory-9615c`, confirmed active and passed as
`--project` on every command.
**Review trail:** review `22cf9a4` (changes requested: H1/M1/L1/L2) → fixes
`936a402` → confirmation `c322352` (**approved with follow-up**, L3) → L3 fixed
`3f4c8d0`.

**Result: the cutover is live and verified. 24/24 production checks pass.**
The active board now filters `archived == false` at the query layer, and the
final ruleset refuses an unbackfilled task rather than tolerating one.

## An ordering slip, recorded rather than buried

The agreed and Codex-confirmed order was **rules first, then web**. It did not
happen that way. `main` auto-deploys to Vercel, so pushing the reader commit
shipped the `archived == false` bundle **ahead** of the final rules — precisely
the ordering the review warned against, because it opens a window in which a
pre-additive-gate browser tab could still create a field-absent task that the
new readers would not display.

Measured rather than assumed the moment it was noticed:
`--verify --baseline 92` reported **92 tasks, all active-shaped, 0 not
backfilled**. Nothing came through the window, and deploying the final rules
closed it.

The lesson is worth more than the incident: **"deploy A then B" is not a plan
when pushing to `main` IS deploying B.** On this repository the web ships on
push, so ordering has to be enforced by what gets pushed and when — a branch, or
a held commit — not by the order commands are typed. Filed in the workboard.

## Sequence

| Step | Result |
|---|---|
| `--verify --baseline 92` (delta pass) | 0 outstanding — the go/no-go |
| `firebase deploy --only firestore:rules` | final ruleset released |
| `verify-coh007-reader-gate.mjs` | **24/24** |
| dead-code removal + redeploy | `archiveFieldsAbsent` dropped; 112/112 rules tests; re-verified 24/24 |
| shape audit | 92 active, 42 maintenance, 0 malformed |
| archiver heartbeat | still `dryRun: true`, `eligible: 35`, `archived: 0` |

The web bundle was already live (see above).

## What the production run actually proved

Not a restatement of the emulator. The emulator fails OPEN on list queries, so
these are the assertions only production can make:

- **The cutover claim, on one live server-backed listener.** A single
  subscription was held open across the Admin SDK archive write, ignoring every
  snapshot with `metadata.fromCache === true`. It saw the task present, saw the
  archive land, and **published the removal on that same subscription** — not a
  second listener answering a second question at a second moment, which is what
  the first version of this script did and what review H1 caught. Reopen was
  then observed returning it, live, the same way.
- **Rollout step 5's authorization matrix**, two accounts across all four active
  arms with exact ids from server reads, plus the private-non-creator negative
  and the stale-recipient-on-a-private-task negative — the gate-1 H-1 shape that
  is the reason the shared arm constrains visibility as well as membership.
- **The sentinel against the deployed rules**: an unbackfilled task refused, a
  stale create refused, that task still **readable**, and absent from the board.
  Unwritable is not hidden, and both halves are now executed rather than
  asserted in a comment.

## The dead-code removal

The first rules deploy printed `Unused function: archiveFieldsAbsent`. It was
retained deliberately at the additive gate; with the final ruleset it is
admitted nowhere. Dead code in an authorization file is worth less than the
warning that finds it, so it was removed, re-tested (112/112) and redeployed,
and the production script re-run to 24/24 against the redeployed rules. The
transitional ruleset still carries it, pinned as the sentinel's fixture.

## Rollback

- **Rules:** `git checkout <transitional sha> -- firestore.rules` and redeploy.
  The pinned fixture
  `functions/test/rules/fixtures/transitional-archive-2026-09-07.rules` is the
  exact deployed transitional source (SHA-256 `3fa73a8d…`, independently
  confirmed on both sides).
- **Reader:** revert the one-value change and push.
- **The backfill is now FORWARD-ONLY.** Removing the pair from a task would make
  it match neither equality-filtered reader and vanish from its board. Undoing it
  is a migration, not a rollback.

## State after this gate

Everything is live except archiving itself. Tasks are not being archived: the
worker runs daily as a dry run and reports **35 eligible**, writing nothing, and
the Archived view is reachable and empty with copy saying archiving is not
switched on yet.

## Next — the automation gate, and the only one left

1. Flip `ARCHIVER_WRITES_ENABLED` (functions) and `ARCHIVING_ENABLED` (the
   Archived view's empty-state copy).
2. Re-check the eligible count immediately before the flip rather than trusting
   the 35 above.
3. Controlled threshold verification, then confirm archive search, detail,
   links, reopen, metrics and the scheduled heartbeat.
4. The initial run's eligible count is recorded.

This is the first gate whose effect users will actually see.
