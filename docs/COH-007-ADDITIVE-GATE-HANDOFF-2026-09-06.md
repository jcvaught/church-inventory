# COH-007 additive gate — implementation handoff

## Task

- Task ID and title: **COH-007 — Completed-task archiving and archive search**, gate 3 of 4 (the **additive gate**)
- Owner: **Claude** · Reviewer: **Codex** (DEC-2026-011)
- Branch: `claude/coh-007-additive-gate`, from `main` at `6dbc6c6`
- Commits: `a7d490d` (writers, rules, indexes) → `e4230c3` (reader, archive view, Insights) → `d62e92b` (archiver, inert)
- Status: **Implemented and locally verified. Nothing deployed.** Awaiting Codex implementation review, then owner authorization for the rules/index deploy and the production probes.

Normative spec: `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md` (amendments A1–A20),
cleared for implementation by three Codex passes ending at `876645d`.
Prerequisite COH-008 is deployed and verified (`docs/COH-008-HANDOFF-2026-09-06.md`).

## Outcome

The archive lifecycle's write surface, rules, indexes, reader, UI and scheduled
job all exist, and **not one reader changed shape**. No query filters on
`archived`, no task is archived, the daily job writes nothing, and the board
behaves exactly as it did yesterday. What is new and user-visible is a
**Tasks → Archived** view that is reachable, correct, and — by design at this
gate — always empty, with copy that says so rather than promising archiving that
is not yet running.

Two live defects are fixed on the way past, neither of which needed archiving to
be a defect:

- `canSeeTask()` filtered on the `[{uid, name}]` presentation arrays while
  DEC-2026-012 made `assigneeUids` / `sharedWithUids` authoritative. A task
  whose object array had gone stale was hidden **on the active board** from
  someone the rules authorize. It now reads the canonical arrays, falling back to
  the object arrays only where the projection is genuinely absent.
- A linked task missing from the active store was described as deleted. It now
  distinguishes active, archived, and deleted — and stays silent for a task the
  viewer cannot read.

## Changes

**Behavior changed**

- Every new task carries `archived: false` / `archivedAt: null`. Maintenance
  tickets deliberately do not (A1).
- Tasks Hub gains an **Archived** view: bounded search over the four
  authorization arms, stated window, read-only detail, Reopen, CSV export.
- Insights computes its 12-week chart and 90-day tile from a new `insightTasks`
  array (active + archived-for-the-window) and presents that history as an
  explicit as-of snapshot; a partial load never reuses the complete presentation.
- `archiveCompletedTasks` runs daily at 3am Central as a **dry run**.

**Files changed**

- `src/useFirestore.js` — archive fields on `addTask`; active listeners built from the shared arm builder; `loadArchivedTasks`; `reopenTask`
- `src/utils/workQueries.js` (new) — `taskQueryArms`, `mergeArchiveArms`, `mergeInsightTasks`
- `src/utils/taskVisibility.js` — canonical uid arrays
- `src/components/board/ArchivedTasks.jsx` (new), `src/components/board/LinkedTaskRef.jsx` (new)
- `src/components/comments/CommentThread.jsx` — `readOnly`
- `src/pages/hubs/WorkBoard.jsx` — Archived view mode, `insightTasks`, honesty band
- `src/pages/ReservationsPage.jsx`, `src/pages/hubs/JobsPage.jsx` — `LinkedTaskRef`
- `src/utils/csv.js` — `filename` option; `src/components/GlobalSearch.jsx` — active-only contract
- `firestore.rules`, `firestore.indexes.json`
- `functions/lib/archiveEligibility.js` (new), `functions/index.js`
- Tests: `functions/test/rules/coh007-archive.test.mjs`, `functions/test/handlers/archiveCompletedTasks.test.mjs`, `functions/test/work-queries.test.mjs`, `functions/test/archive-eligibility.test.mjs`, additions to `functions/test/task-visibility.test.mjs`

**Data, rules, or API changes**

- Two new task fields, both additive; no document moves or deletes.
- **Transitional** ruleset (A13): a missing pre-state defaults to active so
  unbackfilled tasks stay usable; a shaped task cannot delete, corrupt or forge
  either field; no client may drive `archived` false → true; reopen is an exact
  `affectedKeys().hasOnly(['archived','archivedAt','status','completedAt','updatedAt'])`
  allowlist (A14); archived tasks are read-only, undeletable, and their comments
  readable but frozen, with no backlink carve-out.
- Nine indexes: four short COLLECTION composites for the active arms, four longer
  ones carrying `completedAt` for the bounded reads, one COLLECTION_GROUP for
  the archiver. **Eight, not four** (A10 / N2): a composite holds an entry only
  for documents carrying every indexed field, and this plan keeps tasks whose
  `completedAt` is absent, which the active board must keep returning.

**Documentation changed** — `docs/DATA_MODEL.md`, `src/pages/HelpPage.jsx`
(new "Archived tasks" section), `CLAUDE.md` (test inventory). All in the same
commit as the behaviour they describe (A9). No `whatsNew.js` entry yet: the
user-visible behaviour is archiving, which starts at the automation gate.

## Decisions and Assumptions

- Applied: DEC-2026-011, -014, -016, -017, -018, and the owner's 2026-09-05
  canonical-visibility answer. Amendments A1–A20.
- **New decisions requiring owner confirmation: none.**
- Assumptions, each recorded in code rather than left implicit:
  1. Index field order is written equalities-first, then `array-contains`, then
     the `completedAt` sort — which is the shape the existing deployed
     `(visibility, sharedWithUids)` composite already uses. A2's table presented
     two of them in a different order. This is a mechanical matching detail that
     a production probe settles, and every one of the nine shapes gets probed.
  2. The archiver ships enabled-but-dry rather than unwired, so the monitor sees
     it and the owner gets a real eligible-count before approving any write.
  3. `ARCHIVING_ENABLED = false` in `ArchivedTasks.jsx` keeps the empty-state
     copy honest until the automation gate.

## Verification

```text
npm run test:rules     — 101/101 pass (12 new in coh007-archive.test.mjs)
npm run test:handlers  —  72/72 pass (11 new in archiveCompletedTasks.test.mjs)
npm run test:unit      — 152/152 pass (22 new across 3 files)
npm run lint           — 0 errors, 51 warnings (baseline 50; +1 is the
                         reopenTask logActivity exhaustive-dep, matching the
                         ~10 intentional ones already in useFirestore.js)
npm run build          — clean, 29 chunks, 0 jsxDEV
```

**Not run, and why:**

- `npm run test:e2e` — the suite runs against the production `e2e-test-church`
  tenant, and the rules and indexes this gate depends on are not deployed. The
  plan's E2E cases (a task crossing the threshold, leaving the board, appearing
  in the archive, reopening) also cannot fire before the automation gate. They
  belong to the reader and automation gates.
- Production index and query probes — nothing is deployed. These are the
  gate's own acceptance step and need owner authorization.
- No emulator result here is a production claim. See the measurement below.

**THE A3 MEASUREMENT CAME BACK AGAINST THE PLAN.** A3 predicted that Firestore's
total value ordering would make `completedAt <= '<iso cutoff>'` also match every
`null`, which would have made the skip-malformed guard the only thing standing
between a never-properly-completed task and automatic archiving. Executed
against the emulator with Codex's exact fixture, the range returns
`['boundary', 'eligible']` — **neither the null-valued nor the missing-field
document**. On that evidence the guard is defensive rather than load-bearing and
its counter is expected to be zero for nulls. The guard ships anyway, exactly as
A3 says it should; what the measurement decides is the expected counter. **This
is an emulator result. The first production dry run re-measures it and is the
authority.**

## Risk and Rollback

- **Main risk: the transitional ruleset.** It is the one thing here that can
  break the live board, and it breaks it for every church at once. The failure
  mode it exists to prevent — direct field access denying every edit on every
  unbackfilled task — is covered by the first test in
  `coh007-archive.test.mjs`, but the emulator fails OPEN on list queries, so a
  production smoke test on a real church's board is still required after deploy.
- Second risk: the index deploy. `firebase deploy --only firestore:indexes`
  exits 0 while silently creating nothing for a COLLECTION composite whose field
  list matches an existing COLLECTION_GROUP index — five weeks of a missing
  production index in 2026-05. Probe all nine shapes; a green deploy is not
  evidence. Redeploy `firestore:rules` afterwards.
- Compatibility: a browser tab still running the pre-COH-007 bundle keeps
  working. It creates tasks without the pair (tolerated on purpose — the final
  ruleset requires them) and its board queries are unchanged.
- Rollback: revert the rules to `main`'s and redeploy. The indexes are additive
  and inert; the two new fields are inert; the archiver writes nothing. Nothing
  needs undoing in data.
- **Production actions still requiring approval:** the `firestore:rules` +
  `firestore:indexes` deploy, the Cloud Functions deploy (DEC-2026-014), and
  every subsequent gate.

## Known Limitations

- The Archived view is always empty until the automation gate. Deliberate.
- The archived-vs-deleted distinction in `LinkedTaskRef` cannot fire until the
  reader gate, since nothing leaves the active store before then.
- Archive reads are bounded by `completedAt`, so an archived task with a
  malformed or absent completion date would not appear in a bounded search. It
  also cannot be archived in the first place, so the set is empty by
  construction — but the reader gate's coverage should confirm that rather than
  inherit the reasoning.
- `ARCHIVE_ARM_LIMIT = 500` per arm is a runaway guard, not a page. At the
  measured population (134 work items across every church for the life of the
  app) it cannot bind; a church that approached it would silently truncate, and
  the tripwire DEC-2026-018 asks for is not instrumented yet.

## Review Focus

Where independent scrutiny is worth most, roughly in order:

1. **The transitional ruleset**, as an attacker and as an ordinary user on an
   unbackfilled task. Specifically: can any write reach `archived: true`? Can a
   reopen smuggle anything past `hasOnly`? Does any predicate error rather than
   fail closed on a malformed `archived` value? Is there a shape where a legacy
   task's ordinary edit is denied?
2. **The compatibility matrix from your re-review** (transitional × final ×
   stale/new client). The final ruleset is not written yet — if you think its
   shape should be pinned by a test now so the cutover sentinel is unambiguous,
   say so and write the case.
3. **`mergeInsightTasks` live-wins** and the as-of presentation. Is there a
   sequence where a metric is presented as complete while it is not?
4. **The archive reader's failure taxonomy**: can any real failure still render
   as an empty archive?
5. **The A3 measurement.** If you believe production ordering differs from the
   emulator's, say what would settle it — the production dry run is scheduled to
   re-measure it.

Findings as test cases wherever one can be written: the fixture and the
assertion. I integrate and run them.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
