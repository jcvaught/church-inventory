# COH-007 additive gate — production deploy receipt, 2026-09-07

**Deployed by:** Claude, on the product owner's authorization.
**Project:** `church-inventory-9615c` (ChurchOpsHub) — confirmed active before
any command and passed explicitly as `--project` on every one.
**Source:** `claude/coh-007-additive-gate` at `ac248e6`
(Codex-approved, `docs/COH-007-ADDITIVE-GATE-FINAL-2026-09-06.md`).

**Deployed:** `firestore:indexes`, then `firestore:rules`.
**NOT deployed:** Cloud Functions. `archiveCompletedTasks` and its monitor entry
are still un-deployed and require separate owner authorization (DEC-2026-014).
No production task data was written or changed.

## What was deployed

1. `firebase deploy --only firestore:indexes` — nine new composites.
2. `firebase deploy --only firestore:rules` — the **transitional** archive
   ruleset (A13). Rules were deployed *after* indexes, per the standing hazard.

## Index verification — a green deploy is not evidence

The deploy exited 0. That is the failure mode this repository has already paid
for: `firestore:indexes` exits 0 while silently creating nothing for a
COLLECTION composite whose field list matches an existing COLLECTION_GROUP index
(Known Pitfalls, Case A — five weeks of a missing production index in 2026-05).
So the live index set was read back and diffed against `firestore.indexes.json`:

```text
workItems composite indexes BEFORE : 1
workItems composite indexes AFTER  : 10
declared 10 · missing 0
```

All ten present, none silently skipped:

| Scope | Fields |
|---|---|
| COLLECTION | `visibility ASC, archived ASC` |
| COLLECTION | `createdBy ASC, archived ASC` |
| COLLECTION | `archived ASC, assigneeUids CONTAINS` |
| COLLECTION | `visibility ASC, archived ASC, sharedWithUids CONTAINS` |
| COLLECTION | `visibility ASC, archived ASC, completedAt DESC` |
| COLLECTION | `createdBy ASC, archived ASC, completedAt DESC` |
| COLLECTION | `archived ASC, assigneeUids CONTAINS, completedAt DESC` |
| COLLECTION | `visibility ASC, archived ASC, sharedWithUids CONTAINS, completedAt DESC` |
| COLLECTION_GROUP | `status ASC, archived ASC, completedAt ASC` |
| COLLECTION | `visibility ASC, sharedWithUids CONTAINS` (pre-existing) |

The declared field order — equalities first, then `array-contains`, then the
`completedAt` sort — was recorded as an assumption in the handoff and Codex
accepted it only subject to these probes. **The probes settle it: every declared
shape is live and every query is admitted.** No `gcloud` fallback was needed.

## Probes — `scripts/verify-coh007-additive-gate.mjs`, 26/26

Run as a REAL CLIENT (the Node client SDK, signed in as an ordinary member of
`e2e-test-church`), so rules and indexes are exercised exactly as a browser
exercises them. The Admin SDK would bypass the rules and prove nothing.

```text
26/26 checks passed — COH-007 additive gate: production probes PASS
```

- Four archived arms — admitted, authorized empty results, no index or rules error.
- Four bounded archived arms (12-month `completedAt` window) — admitted.
- Collection-group eligibility scan — returns `permission-denied`, not
  `failed-precondition`: the index is present and the rules correctly deny a
  client that read. Distinguishing those two codes is the whole point of the check.
- **A10** — a shaped active task with `completedAt` **absent** is still returned
  by the active board arm (this is the population the longer index would silently
  drop) and is excluded from the bounded archive query.
- **A13** — a task created with neither archive field, the stale-client shape, is
  fully usable: edit, comment, and read the comment back.
- The transitional freeze holds against six direct-client attacks: archiving a
  task, deleting the flag, forging `archivedAt`, a non-boolean discriminator, a
  half-written pair on create, and a born-archived task. All `permission-denied`.

**One false alarm, worth recording.** The first probe run failed all five bounded
checks with `failed-precondition`. That is the *same error code* a missing index
returns, and the message — "That index is currently building and cannot be used
yet" — is the only thing separating the two. `gcloud` then reported every index
`READY` while queries still rejected for roughly a minute afterwards, so the
state flag and query availability are not simultaneous. The probe now names the
building case explicitly. Mistaking it for a missing index is how a healthy
deploy gets rolled back.

## Production shape audit — `scripts/audit-coh007-archive-shape.mjs`

The residual risk in this gate was always the transitional ruleset, because the
emulator fails OPEN on list queries and a rules mistake breaks every church at
once. The emulator cannot answer whether a *real* task is in a shape the new
rules would lock, so that was measured directly:

```text
work items: 134 across 1 church
   134  absent (legacy — usable)
by type: { maintenance: 42, task: 92 }
No production work item is in a shape the transitional rules would lock.
```

Every production work item carries neither archive field, which the transitional
rules classify as legacy and leave fully usable. Zero malformed, zero
already-archived. The 92/42 task/maintenance split also confirms A1's premise:
maintenance items carry none of these fields and must never take the `archived`
filter.

Keep this script for the remaining gates. At the backfill gate it is the
independent coverage baseline and the delta pass; at the reader gate, `absent`
must be **zero** before the final ruleset deploys.

## Rollback

Lossless and one command. Nothing was written to production task data, the two
new fields are inert, no reader filters on them, and the archiver is not
deployed.

```bash
git checkout main -- firestore.rules
./node_modules/.bin/firebase deploy --only firestore:rules --project church-inventory-9615c
```

The indexes are additive and unused by any deployed reader; leaving them costs
nothing and removing them is a separate, riskier operation.

## Still requiring owner authorization

1. **Cloud Functions deploy** (DEC-2026-014) — ships `archiveCompletedTasks` as a
   dry run (`ARCHIVER_WRITES_ENABLED = false`) plus its scheduled-job monitor
   entry. It writes nothing; it makes the job observable.
2. **Backfill gate** — its own backup / dry run / counts / explicit approval /
   execute / independent coverage / delta sequence.
3. **Reader gate**, then the **automation gate**.
