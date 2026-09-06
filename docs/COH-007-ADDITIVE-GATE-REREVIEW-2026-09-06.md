# COH-007 additive gate implementation re-review — 2026-09-06

**Reviewed:** amendment commit `94ee913` and handoff/workboard update `9e2abdb`,
at `9e2abdb0a1590ca58413bd41f461fbe9ede94823`, against the first-pass review
`docs/COH-007-ADDITIVE-GATE-REVIEW-2026-09-06.md` at `1a89784` and the
normative plan `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md` (A1–A20).

**Stage:** additive-gate implementation re-review. Nothing was deployed or
tested against production.

**Verdict:** **Changes requested.** Original H1 and M1–M3 are closed. Original
H2 is only partially closed: `insightHistoryStale()` correctly detects a
departure after its baseline is captured, but the caller captures that baseline
only after the asynchronous archive reads finish. A task can therefore leave
after an archive arm reads it as active but before promise settlement, remain
absent from both halves, and still receive the complete presentation. The same
amendment also tracks every visible task rather than only tasks that contribute
to the advertised historical figures, so unrelated departures produce false
staleness.

## Verification constraints and results

I cannot bind the Firebase emulator ports in this sandbox. I therefore did
**not** run `npm run test:rules` or `npm run test:handlers`, and **NO rules or
handler result is independently verified**. Claude's reported `104/104` rules
and `73/73` handler results remain unreproduced by a second party. The rules and
handler cases integrated from the first review were inspected but not executed
here.

```text
npm run test:unit — PASS, 157/157
npm run lint      — PASS, 0 errors and 51 warnings
npm run build     — PASS, 29 JS chunks, 0 jsxDEV; prerender and verify-prod-bundle passed
npm run test:rules — NOT RUN; sandbox cannot bind emulator ports
npm run test:handlers — NOT RUN; sandbox cannot bind emulator ports
```

Environment observed: Node `v25.8.0`, Firebase CLI `15.10.0`. This shell could
not locate a Java runtime, which is an additional local obstacle to starting the
emulators.

## First-pass finding disposition

- **H1 — CLOSED.** The rules now recognize the intended three states. Legacy is
  exactly neither archive field; active is exactly boolean `archived:false` plus
  present-null `archivedAt`; frozen is boolean `archived:true`, deliberately
  regardless of the timestamp's shape. Every other pre-state fails closed for
  task updates, task deletion, and comment writes. Reads remain governed solely
  by the COH-006 visibility predicate.
- **H2 — PARTIAL.** The predicate is correct for the baseline it receives, but
  the caller does not capture a sound baseline for the interval occupied by the
  archive reads. See High H1 and Medium M1 below.
- **M1 — CLOSED.** The parser now rejects calendar overflow by round-tripping
  the parsed UTC calendar date, while retaining valid leap days and supported
  fractional-second forms. The integrated pure cases pass.
- **M2 — CLOSED.** The transaction callback returns an outcome and telemetry is
  incremented only after the transaction runner resolves. A retried callback can
  no longer increment the committed count twice; the integrated handler case
  exercises the retry through the new seam, although its reported pass cannot be
  independently reproduced here.
- **M3 — CLOSED.** An archived-comment listener error now has an explicit error
  presentation and retry path, and `CommentThread` (including its empty state) is
  not rendered while that error is present.

The H1 rules transition table admits exactly the requested client moves:
legacy→legacy, legacy→active, active→active, and frozen→the exact reopen. It
admits no active→legacy, active/legacy→frozen, frozen→ordinary edit, or malformed
pre-state write. `archiveStateUsable()` is used only on task creation, task
deletion, and parent-gated comment writes; update uses
`archiveTransitionAllowed()`, and reads do not consult archive shape. Its use on
comments also preserves maintenance behavior because a normal maintenance item
has the legacy/neither-fields shape.

The create tightening is right for this transitional ruleset. The current
client writer and server template generator write both fields, while every
supported stale client generation after COH-006 writes neither. All client task
creation surfaces found in the repository route through the centralized
`addTask()` writer; the other production creation path is the Admin SDK template
generator. I found no supported generation that writes only one archive field.
Allowing both or neither therefore preserves the stale-client contract while
preventing a newly created task from being locked on arrival.

## Reviewer Findings

### Critical

None.

### High

#### H1 — the H2 fix captures its baseline after the race has already happened

`WorkBoard.jsx:1605-1615` keeps a ref synchronized to the current active set,
starts four asynchronous one-shot archive reads, and copies the ref only when
their combined promise resolves. That does not establish the claimed load
instant. Consider this permitted ordering:

1. `x` is active when Insights starts loading.
2. An archive arm reads before `x` is archived, so its frozen result does not
   contain `x`.
3. The scheduled worker archives `x`; the live active listeners remove it.
4. `loadArchivedTasks()` settles. `visibleIdsRef.current` is now empty, so
   `activeIdsAtLoad` never records `x`.
5. Both `insightHistoryStale()` and the merged figures omit `x`, while the UI
   renders “History including archived tasks, as of …”.

The predicate cannot detect an id its caller never supplies. The current unit
case begins with `activeIdsAtLoad = new Set(['x'])`, so it proves only the
post-settlement half of the sequence and does not reproduce the caller's timing
bug. This is the original High contract failure in a narrower window, not a new
cosmetic edge: the join can still be presented as complete while describing
neither side of the archive transition.

Track the relevant active ids observed for the whole in-flight interval (at
minimum capture before the read begins and retain departures until settlement),
or freeze a coherent active half. Capturing only at settlement is insufficient.

Exact state-sequence case to add, through an extracted coordinator or the
narrowest available component harness:

```js
test('a departure while archive reads are in flight invalidates the settled history', async () => {
  const x = {
    _docId: 'x', type: 'task', status: 'Complete', archived: false,
    completedAt: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
  };
  const archive = deferred();
  const history = beginInsightHistory({ activeTasks: [x], archivePromise: archive.promise });

  // The archive query has taken its snapshot without x, but has not yet
  // settled. The live side then observes the archive transition.
  history.observeActive([]);
  archive.resolve({ items: [], complete: true, failures: [], loadedAt: '2026-09-06T12:00:00.000Z' });

  const settled = await history.result;
  assert.equal(settled.stale, true);
  assert.notEqual(settled.presentation.kind, 'complete');
});
```

If the fix stays entirely in pure helpers, the fixture still must encode the
ordering `active [x] → archive snapshot [] → active [] → settlement`; supplying
`Set(['x'])` directly after settlement does not test the failure.

### Medium

#### M1 — staleness watches unrelated board rows, not the historical metrics

`activeIdsAtLoad` contains every `visibleTasks` id, while the two advertised
figures depend only on recent `createdAt` and `completedAt` values. Consequently,
deleting or losing visibility to an old Backlog task with no date in either
metric window makes `insightHistoryStale()` true even though `velocityData` and
the 90-day average are byte-for-byte unchanged. Routine board cleanup or an
authorization-arm change can therefore replace a valid complete presentation
with “out of date” until the user refreshes.

This does not make the complete state literally unreachable: additions and
ordinary edits do not trigger it, and a task reappearing in either half clears
it. It is nevertheless broader than the honesty condition and will generate
false warnings on active boards. Track only ids whose departure could change
the 12-week created/completed chart or the 90-day completion metric (using the
same date boundaries as those computations), while preserving H1's in-flight
coverage.

Exact presentation case:

```js
test('departure of a non-contributing task does not invalidate historical figures', async () => {
  const oldBacklog = {
    _docId: 'old', type: 'task', status: 'Backlog',
    createdAt: '2024-01-01T00:00:00.000Z', completedAt: null,
  };
  const before = historicalFigures({ activeTasks: [oldBacklog], archivedTasks: [] });
  const history = settledInsightHistory({ activeTasks: [oldBacklog], archivedTasks: [] });
  history.observeActive([]);

  assert.deepEqual(historicalFigures({ activeTasks: [], archivedTasks: [] }), before);
  assert.equal(history.stale, false);
  assert.equal(history.presentation.kind, 'complete');
});
```

### Low

None.

### Questions

#### Q1 — final-ruleset sentinel timing

Scheduling the sentinel as the reader gate's first commit is acceptable and
matches the first review's “at latest” boundary. The additive gate must deploy
only the transitional rules. The sentinel must be committed and pass against an
explicitly pinned final rules source before the final rules or
`archived == false` reader cutover is allowed to proceed; it need not move into
this amendment.

#### Q2 — production null-ordering measurement

The independent comparison is the right measurement: read the ids satisfying
`status == 'Complete'`, `archived == false`, and explicit
`completedAt == null`, then compare those ids with the range query's result. A
non-empty baseline establishes whether explicit nulls enter the range; an empty
baseline leaves the question unmeasured. Missing-field documents are a separate
population and cannot be tested by an equality-to-null query.

The conclusion that the meaningful legacy-population measurement belongs to
the backfill gate is also right, but the handoff's absolute premise needs one
qualification. After the additive gate deploys, newly created client and
template-generated tasks **do** carry `archived:false` before the backfill runs.
Thus it is not literally true that no production document carries `archived`
until backfill, or that both queries must match nothing. What is true is that the
pre-existing population whose null-ordering behavior matters does not enter the
`archived == false` query until the backfill shapes it. A pre-backfill result can
measure only newly shaped documents and cannot settle the production question
for legacy data. Record that narrower reasoning in the next handoff/runbook.

## Verdict

**Changes requested.** The three-shape rules model, create tightening, date
validation, retry-safe telemetry, and archived-comment error state are approved.
Close High H1 by making the Insights detector cover departures during the
archive-read interval, and narrow its watched population enough to close Medium
M1 without false invalidation. Integrate and run the written state-sequence
cases. The final-ruleset sentinel may remain the reader gate's first commit. The
two-query A3 measurement belongs to the backfill gate for legacy data, with the
pre-backfill-new-writer qualification above.
