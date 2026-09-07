# COH-007 additive gate — production deploy receipt, 2026-09-07

**Deployed by:** Claude, on the product owner's authorization.
**Project:** `church-inventory-9615c` (ChurchOpsHub) — confirmed active before
any command and passed explicitly as `--project` on every one.
**Source:** `claude/coh-007-additive-gate` at `ac248e6`
(Codex-approved, `docs/COH-007-ADDITIVE-GATE-FINAL-2026-09-06.md`).

**Deployed, in three authorized steps:** `firestore:indexes` → `firestore:rules`
→ (second authorization) merge to `main` for the Vercel web deploy, and the
Cloud Functions deploy. **No production task data was written or changed.**
The archiver is live but writing nothing: `ARCHIVER_WRITES_ENABLED = false`.

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

## Web deploy — `main` at `e5ed2ec`

Merged and pushed on the owner's second authorization; Vercel production
deployment `dpl_Co9pBEtonngNWe178JTgEYSzQxee` **READY**. This is the moment the
client half went live: the Archived tab (reachable, always empty, with copy
saying archiving is not switched on yet), the `canSeeTask` canonical-uid fix,
`insightTasks`, `LinkedTaskRef`, and the writers that stamp
`archived`/`archivedAt` on every new task.

Merging also brings `main` back in step with the deployed rules. Left unmerged,
the next deploy from `main` would have silently reverted them — which is the
kind of regression nobody attributes correctly weeks later.

The writers are the part with a real deadline: they must be live **before** the
backfill, or tasks created after it would lack the pair and the coverage
baseline would go stale the moment it was taken.

## Cloud Functions — `archiveCompletedTasks` + `monitorScheduledJobs`

Deployed with `--only functions:archiveCompletedTasks,functions:monitorScheduledJobs`,
deliberately scoped. A blanket `--only functions` would have redeployed every
HTTP function, and gen-2 deploys can strip the `allUsers` invoker binding and
produce a silent 403 — a hazard this repository has already paid for. Both
functions here are `onSchedule`, so that hazard does not apply to them, and
nothing else was touched.

```text
functions[archiveCompletedTasks(us-central1)]  Successful create operation.
functions[monitorScheduledJobs(us-central1)]   Successful update operation.
Cloud Scheduler: firebase-schedule-archiveCompletedTasks-us-central1
                 0 3 * * * (America/Chicago) — ENABLED
```

### The first production dry run — triggered, not waited for

```text
status      : completed        durationMs : 1308
lastError   : null
lastSummary : { dryRun: true, examined: 0, eligible: 0, archived: 0,
                conflicted: 0, failed: 0, truncated: false,
                malformedReturnedByEligibilityQuery: 0,
                skippedTooRecent: 0, skippedOther: 0,
                cutoff: "2026-07-27T11:42:14.830Z" }
```

Three things this establishes, and one it deliberately does not.

- The function runs, the COLLECTION_GROUP eligibility index serves it from the
  Admin SDK, and the heartbeat lands — so `monitorScheduledJobs` has a
  `finishedAt` and will not alert.
- The dry-run posture is real: `dryRun: true`, `archived: 0`, no writes.
- **`examined: 0` empirically confirms Codex's Q2 correction.** The eligibility
  query filters `archived == false`, and no pre-existing production document
  carries the field at all, so the query matches nothing. A pre-backfill run is
  vacuous **by construction**, exactly as reasoned — now measured rather than
  argued.
- What it does NOT establish is the A3 null-ordering question. A zero malformed
  count here distinguishes nothing, because the query examined nothing. That
  measurement needs the backfill's independent `completedAt == null` baseline
  compared by document id, and it belongs to the backfill gate.

## Still requiring owner authorization

1. **Backfill gate** — its own backup / dry run / counts / explicit approval /
   execute / independent coverage / delta sequence.
   `scripts/audit-coh007-archive-shape.mjs` is the independent baseline, and the
   A3 measurement belongs here.
2. **Reader gate** — its FIRST commit is Q1's final-ruleset sentinel, and no
   TASK may be unbackfilled before the final rules deploy. The go/no-go is
   `backfill-task-archive.cjs --verify` reaching 0 outstanding, which counts
   tasks only — **not** the shape audit's raw `absent` total, which legitimately
   stays at 42 because maintenance items must never carry the pair (A1).
   Corrected here after the backfill gate; the original phrasing would have
   blocked the reader gate on a condition that must never be true.
3. **Automation gate** — flip `ARCHIVER_WRITES_ENABLED` and
   `ARCHIVING_ENABLED`, with a controlled threshold verification.
