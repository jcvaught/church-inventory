# COH-007 additive gate implementation confirmation — 2026-09-06

**Reviewed:** second-pass fix commit `f562c7d91b3254be1b27c0039bb32975c426814d`,
against the first review at `1a89784`, the re-review at `96aa947`, and
`docs/COH-007-ADDITIVE-GATE-HANDOFF-2026-09-06.md` (including “Re-review
outcome (2026-09-06, second pass)”).

**Stage:** third-pass confirmation of the COH-007 additive gate. Nothing was
deployed or tested against production.

**Verdict:** **Changes requested.** The interval coordinator itself encodes the
right invariant, and no departure that changes either advertised figure is
excluded by `contributesToHistory()`. The component wiring can nevertheless
detach the current coordinator when a superseded archive read resolves, so a
real ordering can still drop an id that appears during the current read. The
created-date half also uses the earlier 90-day completion boundary rather than
the later 12-week creation boundary, leaving a smaller version of the false
staleness from the re-review.

## Verification constraints and results

I cannot bind the Firebase emulator ports in this sandbox. I therefore did
**not** run `npm run test:rules` or `npm run test:handlers`, and **NO rules or
handler result is independently verified**. Claude's reported rerun at
`f562c7d` — `104/104` rules and `73/73` handlers — remains unreproduced by a
second party.

```text
npm run test:unit — PASS, 162/162
npm run lint      — PASS, 0 errors and 51 warnings
npm run build     — PASS, 29 JS chunks, 0 jsxDEV; prerender and verify-prod-bundle passed
npm run test:rules — NOT RUN; sandbox cannot bind emulator ports
npm run test:handlers — NOT RUN; sandbox cannot bind emulator ports
```

Environment observed: Node `v25.8.0`, Firebase CLI `15.10.0`. This shell also
could not locate a Java runtime.

## Second-pass finding disposition

- **H1 — PARTIAL.** `createInsightHistoryLoad()` opens before
  `loadArchivedTasks()` and accumulates every contributing active set supplied
  to `observeActive()` until `settle()`. The integrated pure test now encodes
  the requested `active [x] -> archive snapshot [] -> active [] -> settlement`
  ordering, and that helper-level sequence is sound. React's same-commit effect
  order also does not lose an id that is active when the load starts: the
  `visibleTasks` effect is declared first, so it updates `visibleTasksRef`
  before the Insights effect creates the load; if `visibleTasks` did not change,
  the ref already holds the last committed set. The remaining component-level
  ownership race is High H1 below.
- **M1 — PARTIAL.** The watched set is much narrower and it cannot omit a task
  whose departure changes either figure: every 90-day completion is at or after
  the selected floor, and every creation in the 12-week chart is later still.
  The created side is nevertheless still wider than the chart and can produce a
  false warning. See Medium M1.
- **Q2 correction — CLOSED.** The handoff now states the narrower true claim.
  New client-created and template-generated tasks carry `archived:false` from
  this gate onward, while the legacy population does not enter an
  `archived == false` measurement until the backfill shapes it. It also correctly
  separates explicit-null documents from missing-field documents.

## Reviewer Findings

### Critical

None.

### High

#### H1 — a superseded read can clear the current interval coordinator

`WorkBoard.jsx:1633` installs a particular load in the shared
`historyLoadRef`, but both that effect's cleanup and its asynchronous completion
clear the ref unconditionally (`:1635`, `:1641`). Cancellation prevents the old
result from being displayed; it does not prevent the old promise from clearing
a newer load's coordinator. This is a real production ordering, independent of
whether React runs the two declared effects in order:

1. Enter Insights and start load A.
2. Leave Insights before A settles; A is marked cancelled.
3. Re-enter Insights and start load B. `historyLoadRef.current` now points to B.
4. A settles late. Its `.then()` executes `historyLoadRef.current = null` even
   though A is cancelled, detaching B.
5. A contributing task `y` appears in the live active set while B remains in
   flight. The earlier `visibleTasks` effect runs, but optional chaining sees a
   null ref, so B never records `y`.
6. B's archive arms have snapshotted without `y`; `y` leaves the active set;
   B settles empty. Its baseline omits `y`, `insightHistoryStale()` is false,
   and the UI presents a complete history that contains `y` in neither half.

The same ownership rule applies to cleanup: an effect generation should clear
the shared ref only if the ref still points to that generation's `load`. Merely
checking `cancelled` around the state setters is insufficient.

Exact component/coordinator case for Claude to integrate:

```js
test('a cancelled load settling late cannot detach the current history load', async () => {
  // Start A, leave Insights, and re-enter to start B.
  const a = deferredArchiveRead();
  const b = deferredArchiveRead();
  const board = renderInsightsWithArchiveReads([a.promise, b.promise], []);
  board.leaveInsights();
  board.enterInsights();

  // A is cancelled but settles after B became current.
  a.resolve(completeArchive([]));
  await flushPromises();

  const y = recentCompletedTask('y');
  board.publishActive([y]);
  board.publishActive([]);
  b.resolve(completeArchive([]));
  await board.settled();

  assert.equal(board.historyPresentation(), 'out-of-date');
  assert.equal(board.activeIdsAtLoad().has('y'), true);
});
```

An extracted generation-aware ref coordinator is also a valid test seam, but
the assertion must include A settling after B is installed and an observation
routed to B afterward. The new pure helper tests do not exercise that wiring.

### Medium

#### M1 — the created side still watches dates outside the 12-week chart

`historyBoundaryDate()` computes both boundaries but returns only the earlier
one (`WorkBoard.jsx:1606-1613`), which is the 90-day completion floor.
`contributesToHistory()` then applies that same floor to both `completedAt` and
`createdAt` (`workQueries.js:99-104`). The tile uses only completions from the
90-day floor (`WorkBoard.jsx:2255-2266`), while the chart counts creations only
from its own later start (`:1666-1678`).

On 2026-09-06, for example, the completion floor is 2026-06-08 and the chart
starts 2026-06-21. A Backlog task created 2026-06-10 with no completion date is
tracked even though it contributes to neither figure. If it leaves the active
set, both figures remain byte-for-byte unchanged but the history becomes “out
of date”. Thus the amendment does **not** narrow too far — there is no missed
departure that changes `velocityData` or the 90-day average — but the re-review's
false-warning finding is not fully closed.

Exact unit case for Claude to integrate, using separate completion and creation
boundaries in the repaired API:

```js
test('a creation between the 90-day floor and the 12-week chart start is not tracked', () => {
  const task = {
    _docId: 'outside-created-window', type: 'task', status: 'Backlog',
    createdAt: '2026-06-10T12:00:00.000Z', completedAt: null,
  };
  assert.equal(contributesToHistory(task, {
    completionBoundaryDate: '2026-06-08',
    creationBoundaryDate: '2026-06-21',
  }), false);
});
```

Retain boundary-inclusive assertions for both fields: a completion on the
90-day boundary and a creation on the chart-start boundary both contribute.

### Low

None.

### Questions

None requiring an owner decision.

The amendment did not change `firestore.rules`, `firestore.indexes.json`, the
archiver or handler code, `useFirestore`'s archive query reader, the Archived
Tasks component, or comment handling. I found no new destabilization in those
surfaces. The earlier three-shape rules/create conclusion, date parsing,
retry-safe archiver telemetry, and archived-comment error disposition therefore
remain closed by inspection, subject to the explicit emulator limitation above.

## Verdict

**Changes requested.** Close High H1 with generation-aware ownership of
`historyLoadRef` and add the overlapping-load sequence test. Close Medium M1 by
using the 90-day boundary only for `completedAt` and the actual 12-week chart
start for `createdAt`, with the June 8 / June 21 gap case above. The Q2 handoff
correction is accurate, and the amendment introduced no rules, archiver,
handler, or archive-reader regression in the untouched code.
