# COH-007 plan confirmation — 2026-09-05

**Reviewed:** the COH-007 plan, DEC-2026-017, and the COH-007 workboard entry at
`b9001ba4b392a7504b0d040e7e32cccdd76fe7ef`.

**Verdict: IMPLEMENTATION-READY.** This was a narrow confirmation pass. I did
not run tests and verified no test results.

## Finding closure

- **M2 — closed.** A17 says the archiver can count only malformed values **“it
  was actually returned”** and that population-wide quality is not promised
  (plan lines 179–186). A12 names the scoped counter
  `malformedReturnedByEligibilityQuery` and expressly excludes absent and
  out-of-range values (lines 349–358).
- **N1 — closed.** A18 requires routing on trusted `before.data().type`, declares
  unknown/missing types and wrong-source fields no-ops, and gives the complete
  five-row map (lines 500–524): task→job, task→maintenance,
  task→reservation, maintenance→task, and job→task. This defeats the
  `task_x`/`mnt_x` bare-id collision because a task cannot follow
  `linkedTaskDocId` and maintenance cannot follow task-only fields before the
  reciprocal check. The job row needs no `type`: it is handled by the separate
  `jobListings/{docId}` delete trigger, so the trusted collection path supplies
  the source discriminator.
- **N2 — closed.** Revised A10 says **“keep the four shorter A2 composites ...
  and add four longer variants”**, eight total, and requires an absent-field
  production probe (lines 277–299). Active documents lacking `completedAt` are
  no longer dependent on the bounded-reader indexes.
- **N3 — closed.** A19 requires the lower bound from the **start of the metric's
  boundary date**, or a conservatively earlier UTC instant followed by the
  existing client date predicate; it also requires an explicit timezone
  contract (lines 131–142). Either permitted implementation contains the whole
  advertised boundary date.
- **N4 — closed.** A20 requires live-active collision precedence, successful
  settlement of all four archive arms before completeness, refresh or an
  explicit as-of snapshot when a task leaves active, and non-normal presentation
  for torn/partial data (lines 144–158).

## Consistency and regression check

No superseded or contradictory normative prose remains that would make an
implementer choose between competing requirements. DEC-2026-017 retains the old
authorization claim only as history and labels it **“false”** / **“WRONG”** while
pointing to the binding safeguarded decision (decision lines 704–709 and
784–811). Its status is Accepted and its tail is Answered (lines 839–842). The
workboard's former blocking decision is gone; its remaining “Awaiting
re-review” is inside the dated A10–A16 history and is immediately followed by
the completed re-review disposition (workboard lines 345–372). The plan's
top-level review status describes this confirmation gate, not an unresolved
design choice.

A17–A20 introduce no new error found in this pass. Their allowed implementation
choices preserve the required invariants rather than leaving product or security
policy unsettled.

Nothing remains to amend before implementation. The separately scoped,
type-pinned backlink-trigger prerequisite must still be implemented, reviewed,
deployed, and verified before COH-007's additive gate, as the plan already
requires; that is sequencing, not a plan blocker.
