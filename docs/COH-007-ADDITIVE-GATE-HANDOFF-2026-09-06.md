# COH-007 additive gate — implementation handoff

## Task

- Task ID and title: **COH-007 — Completed-task archiving and archive search**, gate 3 of 4 (the **additive gate**)
- Owner: **Claude** · Reviewer: **Codex** (DEC-2026-011)
- Branch: `claude/coh-007-additive-gate`, from `main` at `6dbc6c6`
- Commits: `a7d490d` (writers, rules, indexes) → `e4230c3` (reader, archive view, Insights) → `d62e92b` (archiver, inert) → `5d2ac1b` (handoff) → `1a89784` (Codex review) → `94ee913` (fixes) → `9e2abdb` (docs) → `18619a5` (Codex re-review) → second-pass fixes
- Status: **Implemented, reviewed three times, and fixed. Nothing deployed.** Pass 1: two High / three Medium — all resolved. Pass 2: one High / one Medium on the H2 fix — both resolved. Pass 3: one High / one Medium, again on the H2 lineage — both resolved, with no regression found anywhere else. Awaiting a fourth (confirmation) pass, then owner authorization for the rules/index deploy and the production probes.

Normative spec: `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md` (amendments A1–A20),
cleared for implementation by three Codex passes ending at `876645d`.
Prerequisite COH-008 is deployed and verified (`docs/COH-008-HANDOFF-2026-09-06.md`).

## Review outcome (2026-09-06)

Codex reviewed at `5d2ac1b`: **changes requested**, two High and three Medium,
no Critical. Every finding was accepted and fixed; the written cases were
integrated and run.

- **H1 — malformed archive state failed OPEN for comments and delete.**
  Correct, and the sharper half is delete, which cannot be undone.
  `itemIsArchived()` asked only `archived == true` and read every other value as
  active. Content updates were in fact denied — they must also satisfy the
  active shape — but the comment and delete rules consulted the discriminator
  alone, so a task carrying `archived: 'true'`, `archived: 1`, or a half-written
  pair stayed commentable and permanently deletable. The rules now recognise
  exactly three shapes — **absent** (legacy), **active** (`archived` boolean
  false with `archivedAt` null), **frozen** (`archived` boolean true) — and
  anything else permits nothing at all, while reads are never withheld. Fixing
  only the write rules would have created a second hazard, so **create was
  tightened too**: it now requires both fields or neither, because a document
  created with a half-written pair would have been locked on arrival.
- **H2 — the Insights as-of snapshot changed after its stated instant.**
  Correct, and it is the half of A20's race that precedence cannot reach.
  `mergeInsightTasks` live-wins closes the reopen direction; a task *archived*
  after the read is dropped by the live listeners and was never in the frozen
  result, so it falls out of the join while the label still claims a complete
  history. Only noticing it can fix that, so the load now records which tasks
  were active when it settled and `insightHistoryStale()` reports a torn
  history, which no longer uses the complete presentation. Extracted as a pure
  function rather than tested through a renderer, since the property is the
  point and this suite has no component harness.
- **M1 — calendar-impossible dates passed the ISO guard.** Correct:
  `Date.parse('2026-02-30T…')` normalizes into March rather than failing. The
  guard now round-trips the parsed instant back to its calendar date.
- **M2 — transaction retries overcounted the telemetry.** Correct: Firestore may
  invoke a transaction callback more than once, so counting inside it turned one
  committed archive into two in the daily heartbeat. The callback now returns an
  outcome and the counters move after it resolves; a `_setArchiveTransactionRunner`
  seam makes the retry executable.
- **M3 — an archived-comment listener failure rendered as an empty discussion.**
  Correct, and it is the one false-empty the reader still had. The detail view
  now shows an explicit comments error with a retry.
- **Q1 — pin the final-ruleset sentinel.** Accepted, and scheduled as the
  reader gate's first commit per the review's own verdict ("before the reader
  cutover"), not done here: it needs the final ruleset, which this gate must not
  deploy.
- **Q2 — my production-measurement claim was wrong.** See the corrected
  paragraph under Verification.
- **Q3, Q4** — index order accepted as a deployable assumption subject to the
  probes already planned; reader taxonomy accepted apart from M3.

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

After both review passes:

```text
npm run test:rules     — 104/104 pass (15 new in coh007-archive.test.mjs)
npm run test:handlers  —  73/73 pass (12 new in archiveCompletedTasks.test.mjs)
npm run test:unit      — 165/165 pass (35 new across 4 files)
npm run lint           — 0 errors, 51 warnings (baseline 50; +1 is the
                         reopenTask logActivity exhaustive-dep, matching the
                         ~10 intentional ones already in useFirestore.js)
npm run build          — clean, 29 chunks, 0 jsxDEV
```

Codex independently ran `test:unit` (152/152 at `5d2ac1b`, 157/157 at
`9e2abdb`, 162/162 at `f562c7d`), `lint` and `build` in its clone. It **cannot bind the emulator ports**, so the rules and handler
results above are **unreproduced by a second party** — that limitation is
standing, not incidental to this task.

**Not run, and why:**

- `npm run test:e2e` — the suite runs against the production `e2e-test-church`
  tenant, and the rules and indexes this gate depends on are not deployed. The
  plan's E2E cases (a task crossing the threshold, leaving the board, appearing
  in the archive, reopening) also cannot fire before the automation gate. They
  belong to the reader and automation gates.
- Production index and query probes — nothing is deployed. These are the
  gate's own acceptance step and need owner authorization.
- The A3 production baseline (review Q2) — it is vacuous until the backfill
  gate, for the reason recorded below.
- No emulator result here is a production claim. See the measurement below.

**THE A3 MEASUREMENT CAME BACK AGAINST THE PLAN.** A3 predicted that Firestore's
total value ordering would make `completedAt <= '<iso cutoff>'` also match every
`null`, which would have made the skip-malformed guard the only thing standing
between a never-properly-completed task and automatic archiving. Executed
against the emulator with Codex's exact fixture, the range returns
`['boundary', 'eligible']` — **neither the null-valued nor the missing-field
document**. On that evidence the guard is defensive rather than load-bearing and
its counter is expected to be zero for nulls. The guard ships anyway, exactly as
A3 says it should; what the measurement decides is the expected counter. This is
an emulator result, and the emulator is not production.

**Correction, per review Q2 — my first version of this paragraph claimed the
production dry run would re-measure it. It would not.** The dry run's
eligibility query can only report what it returned, and a zero malformed count
cannot distinguish "production excludes nulls from the range" from "there were
no complete, unarchived, null-dated tasks to find." Measuring it needs an
independent baseline: separately read the population matching
`status == 'Complete'` **and** `archived == false` **and** `completedAt == null`,
then compare those known document ids against the range query's result. If the
baseline is empty, the production question is **unmeasured**, not resolved, and
must be recorded that way. No write need be enabled for either query.

A second timing constraint follows from the rollout and is worth stating rather
than discovering. **Corrected again after re-review:** it is *not* literally true
that no production document carries `archived` before the backfill — from the
moment this gate deploys, every newly created client task and every generated
recurring task carries `archived: false`. What is true is narrower and is the
part that matters: **the pre-existing population whose null-ordering behaviour is
in question does not enter the `archived == false` query until the backfill
shapes it.** A pre-backfill run can therefore measure only newly shaped
documents, which are exactly the ones written correctly, and cannot settle the
question for legacy data. The measurement belongs to the **backfill gate**.

Note also that the baseline query tests explicit `completedAt == null` only.
Missing-field documents are a separate population and no equality-to-null query
can reach them.

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

## Re-review outcome (2026-09-06, second pass)

Codex re-reviewed at `9e2abdb`
(`docs/COH-007-ADDITIVE-GATE-REREVIEW-2026-09-06.md`): **changes requested**,
one High and one Medium, both on the H2 fix. Original **H1, M1, M2 and M3 are
CLOSED**; the three-shape rules model and the create tightening were explicitly
approved, including the finding that no supported client generation writes only
one archive field. Both new findings are fixed:

- **H1 (second pass) — the H2 fix captured its baseline after the race had
  already happened.** Right, and it is the original contract failure in a
  narrower window rather than a cosmetic edge. The caller copied the active set
  only when the four archive reads *settled*, so this ordering slipped through:
  an arm snapshots without `x` → the worker archives `x` and the live listeners
  drop it → the read settles, by which point `x` is in neither half and was
  never recorded. The predicate cannot detect an id its caller never supplies.
  The baseline now covers the **interval**, not the instant:
  `createInsightHistoryLoad()` opens before the first read and absorbs every
  active set observed until settlement. The unit case encodes the ordering
  `active [x] → archive snapshot [] → active [] → settlement`, which the
  previous test did not.
- **M1 (second pass) — staleness watched the whole board, not the figures.**
  Right, and the cost is false warnings: deleting an old Backlog task with no
  date in either window left `velocityData` and the 90-day average byte-for-byte
  unchanged yet flipped the presentation to "out of date". A steady drip of
  those teaches people to ignore the real one. `contributesToHistory()` now
  narrows the watched set to tasks whose `completedAt` or `createdAt` falls
  inside the earliest boundary either metric uses.
- **Q1** — the final-ruleset sentinel stays the reader gate's first commit,
  confirmed; it must pass against an explicitly pinned final rules source before
  the cutover proceeds.
- **Q2** — the two-query comparison is confirmed as the right measurement, with
  one qualification of mine corrected a second time. See Verification.

## Confirmation-pass outcome (2026-09-06, third pass)

Codex confirmed at `f562c7d`
(`docs/COH-007-ADDITIVE-GATE-CONFIRMATION-2026-09-06.md`): **changes
requested**, one High and one Medium, both again on the H2 lineage. It confirmed
the interval coordinator encodes the right invariant, that no departure changing
either figure is excluded, and that the amendment introduced **no rules,
archiver, handler or archive-reader regression** in untouched code. Both
findings are fixed:

- **H1 (third pass) — a superseded read could clear the current coordinator.**
  Right, and it is a real production ordering rather than React scheduling
  trivia: enter Insights and start load A; leave before A settles; re-enter and
  start B; A settles late and its `.then()` cleared the shared ref
  unconditionally, detaching B. Every observation after that saw a null ref, so
  a task appearing and leaving during B's read went unrecorded and B's torn
  history was presented as complete. Checking `cancelled` does not help — the
  question is ownership, not cancellation. A generation may now retire the slot
  **only while the slot still holds it**, and that rule lives in one place
  (`createInsightHistoryCoordinator`) so it can be asserted directly.
- **M1 (third pass) — the created side still watched the wrong floor.** Right:
  `historyBoundaryDate()` returned the earlier of the two, which is the 90-day
  completion floor, and then applied it to `createdAt` as well. The chart counts
  creations only from its own later start — 2026-06-08 versus 2026-06-21 on the
  reviewed date — so a Backlog task created in that thirteen-day gap was tracked
  while contributing to neither figure. The two floors are now separate.

Codex noted its H1 case needs a component harness this suite does not have. The
ownership rule was therefore extracted into a pure coordinator and asserted in
the form it requires — A settling after B is installed, then an observation
routed to B — so what is tested is the rule itself rather than React's effect
scheduling. That is a deliberate substitution and worth naming as one.

## Original Review Focus (first pass)

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
