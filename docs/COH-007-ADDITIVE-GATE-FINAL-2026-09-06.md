# COH-007 additive gate final confirmation — 2026-09-06

**Reviewed:** final fix commit `4a98171` and documentation correction commit
`f6a2e206e48c78abafdc4bd05a6131c20e20cee3`, against the third-pass review
`docs/COH-007-ADDITIVE-GATE-CONFIRMATION-2026-09-06.md` at `ccb8600` and the
updated `docs/COH-007-ADDITIVE-GATE-HANDOFF-2026-09-06.md`.

**Stage:** fourth and final confirmation of the COH-007 additive gate. Nothing
was deployed or tested against production.

**Verdict:** **Approved with follow-up.** The third-pass High and Medium are
closed. The coordinator's identity-ownership rule is correct and completely
wired in `WorkBoard.jsx`; testing the extracted coordinator is acceptable here
and no component-harness coverage is required for this gate. The completion and
creation boundaries now match the two advertised Insights computations. No
rules, archiver, handler, or archive-reader behavior was destabilized across the
four passes. The sole follow-up is a non-blocking handoff citation typo recorded
under Low.

## Verification constraints and results

I cannot bind the Firebase emulator ports in this sandbox. I therefore did
**not** run `npm run test:rules` or `npm run test:handlers`, and **NO rules or
handler result is independently verified**. Claude's reported rerun at
`f562c7d` — `104/104` rules and `73/73` handlers — remains unreproduced by a
second party. The third-pass fix touched only `src/utils/workQueries.js`,
`src/pages/hubs/WorkBoard.jsx`, their unit tests, and documentation; `f6a2e20`
then changed only a workboard citation.

```text
npm run test:unit — PASS, 165/165
npm run lint      — PASS, 0 errors and 51 warnings
npm run build     — PASS, 29 JS chunks, 0 jsxDEV; prerender and verify-prod-bundle passed
npm run test:rules — NOT RUN; sandbox cannot bind emulator ports
npm run test:handlers — NOT RUN; sandbox cannot bind emulator ports
```

Environment observed: Node `v25.8.0`, Firebase CLI `15.10.0`. This shell also
could not locate a Java runtime. Firebase CLI printed its version, followed by
an update-check warning because its user-level config store is outside this
sandbox; that did not affect the requested verification commands.

## Third-pass finding disposition

- **H1 — CLOSED.** `createInsightHistoryCoordinator()` owns one current load by
  identity. `begin(load)` installs that exact generation; `observe(tasks)`
  forwards only to the current generation; and `release(load)` clears the slot
  only when `current === load`. `WorkBoard.jsx` uses that coordinator at every
  relevant edge: the Insights effect calls `begin(...)` before
  `loadArchivedTasks()`, the earlier `visibleTasks` effect calls `observe(...)`,
  and both asynchronous settlement and effect cleanup call `release(load)`.
  Thus cleanup or late settlement from A cannot detach B.

  The integrated pure test encodes the required production ordering: A is
  released, B is installed, A releases late, an observation is routed to B,
  the observed task leaves, and B settles. It proves both identity ownership
  and the observation route. A component harness would mainly repeat the three
  direct method calls visible in the effect; this repository has no such
  harness, and there is no additional React-specific branch or adapter between
  the effects and the tested coordinator. Testing the extracted rule is
  therefore acceptable for this gate. No React wiring coverage remains
  required.

- **M1 — CLOSED.** `contributesToHistory()` now accepts independent
  `completionBoundaryDate` and `creationBoundaryDate` values. `WorkBoard.jsx`
  derives the completion floor exactly as the `Avg/Week (90d)` tile does:
  subtract 90 days, convert with `localDateStr`, and compare whole dates
  inclusively. It derives the creation floor exactly as the first bucket in
  `velocityData` does: subtract `now.getDay() + 77` days to reach the first
  Sunday, convert with `localDateStr`, and compare inclusively. Completions are
  watched from the earlier 90-day floor, which covers both the tile and every
  completion bucket in the chart.

  The integrated cases include the requested 2026-06-10 creation between the
  2026-06-08 completion floor and 2026-06-21 creation floor, inclusive
  assertions for both boundaries, and a completion in that same gap which still
  contributes. The watched set now excludes only departures that change
  neither advertised figure.

## Reviewer Findings

### Critical

None.

### High

None.

### Medium

None.

### Low

#### L1 — the handoff's third-pass sentence cites the reviewed fix as the review

Under “Confirmation-pass outcome (2026-09-06, third pass),” the handoff says
“Codex confirmed at `f562c7d`.” That SHA is the second-pass fix which Codex
reviewed. The confirmation review itself is `ccb8600`, as the corrected
workboard trail at `f6a2e20` now states. This is an audit-trail typo only; it
does not change the implementation, verification, rollout, or verdict. Correct
the handoff sentence when this review is received.

### Questions

None. The extracted coordinator test is accepted; no component-harness test is
needed for the additive gate.

## Cross-pass stability

The third-pass amendment did not touch `firestore.rules`,
`firestore.indexes.json`, `functions/index.js`,
`functions/lib/archiveEligibility.js`, `src/useFirestore.js`, or
`src/components/board/ArchivedTasks.jsx`. Inspection of the current versions and
the earlier review amendments found no regression in the approved three-state
archive rules, retry-safe archiver telemetry and dry-run posture, four-arm
archive reader and failure taxonomy, or archived-comment error presentation.
The first- and second-pass dispositions on those surfaces remain closed,
subject to the explicit emulator limitation above.

The remaining backfill, reader, and automation gates retain their own planned
reviews. Q1's final-ruleset sentinel remains correctly scheduled as the reader
gate's first commit; it is not a condition on this additive-gate approval.

## Verdict

**Approved with follow-up.** No code, rules, handler, reader, archiver, or test
change is required before the additive gate proceeds to the product owner for
deployment authorization. Correct only the handoff's `f562c7d`/`ccb8600`
citation when receiving this review. Rules and handler results are not
independently verified because this sandbox cannot bind the emulator ports.
