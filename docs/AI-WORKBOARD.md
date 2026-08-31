# ChurchOpsHub AI Workboard

This board coordinates bounded work between Codex and Claude. It does not
replace `docs/backlog.md`, which remains the canonical product backlog.

## Workflow

`Proposed` → `Ready` → `In progress` → `Review` → `Verified` → `Merged`

- A task may enter **In progress** only after it has one owner, acceptance
  criteria, a branch, and no unresolved file-scope conflict.
- The owner completes `docs/AI-HANDOFF-TEMPLATE.md` before moving a task to
  **Review**.
- The reviewer reports findings by severity. Ownership stays with the
  implementation owner unless explicitly transferred.
- Deployment and production-data changes are separate owner-approved actions;
  **Merged** does not imply **Deployed**.

## Active Tasks

### COH-006 — Enforce private and shared task visibility

- Status: Ready (**amended 2026-08-31** after Codex's pre-implementation review —
  `docs/COH-006-PREIMPLEMENTATION-REVIEW-2026-08-31.md`, verdict "plan changes
  required". All seven findings verified against the code and accepted; the three
  needing an owner call are recorded in **DEC-2026-010**.)
- Owner: Codex
- Reviewer: Claude
- Branch: `codex/coh-006-task-visibility` (branch from current `main`, which now
  carries the interim store filter and the skipped spec — see "Already landed")
- Authorized by: DEC-2026-008 (shared must be enforced), DEC-2026-009 (private is
  not enforced against an unconstrained list), DEC-2026-010 (review dispositions).
  Owner decision 2026-08-31: **one task, not staged** — the deploy is already
  staged client-then-rules as in COH-002, and the backfill is a separately
  approved migration step regardless of task boundaries. One task, four deploy
  gates: see Rollout.
- Problem: `src/useFirestore.js` subscribes to the whole `workItems` collection
  with no constraints. Measured in production: a direct `get` of another
  member's private task is denied, but the unconstrained list and `onSnapshot`
  both deliver it (`fromCache=false`). Private and shared are therefore UI-level
  only. The tenant boundary is intact. Treat the *mechanism* (disjunctive,
  content-dependent read predicate) as a hypothesis, not a measured fact — the
  deployed ruleset was never pinned (DEC-2026-009 second addendum). Verify it
  before relying on the causal story.
- Already landed on `main` (Claude, commit `9c0f862`) — do not redo, and read
  before touching the central file:
  - `src/utils/taskVisibility.js` `canSeeTask()` — the visibility predicate,
    extracted from `WorkBoard` unchanged.
  - An **interim** application of it at the store boundary in `useFirestore.js`,
    so private/shared tasks stay out of Global Search, Event Day, exports, and
    the attention panel. Not authorization. **Remove it at gate 3** so the
    constrained queries are the single enforcement path.
  - `e2e/authenticated/private-visibility-listener.spec.js` carries `test.skip`.
  - Help Centre and `CLAUDE.md` state that visibility is not yet a security
    boundary and that comments are member-readable regardless of it.
- File scope: `src/useFirestore.js` (**declared central file**),
  `src/pages/hubs/WorkBoard.jsx`, `src/utils/taskVisibility.js`,
  `firestore.rules`, `firestore.indexes.json`, a backfill script under
  `scripts/`, `functions/index.js`, `functions/lib/attention.js`,
  `functions/test/attention.test.mjs`, `functions/test/rules/`,
  `e2e/authenticated/`, `docs/DATA_MODEL.md`.
- Required work:
  1. Add `sharedWithUids` and `assigneeUids` (plain uid arrays — rules cannot
     search the existing `[{uid,name}]` object arrays). Written by **every**
     creation path: New Task modal, kanban quick-add, paste-import, recurring
     generation, templates, and reservation-created setup tasks.
  2. Backfill both fields on existing tasks and normalise missing `visibility`.
     Production migration — backup, dry run, validation queries, rollback, and
     explicit owner approval before execution. The backfill must be idempotent,
     and a delta pass must cover documents created during the transition.
  3. Replace the single unconstrained subscription with rule-compatible
     constrained queries (team / own / shared-with-me / assigned-to-me), merged
     and de-duplicated, preserving maintenance delivery from the same
     collection and collapsing to one loading-readiness signal.
  4. Update the `workItems` read rule to honour `sharedWithUids` and
     `assigneeUids`; the Help Centre states assignees always see their tasks,
     which the current rule does not honour.
  5. **Close the update-rule self-grant path (review H-1).** `firestore.rules`
     currently lets any active member update any task whose existing and
     resulting visibility are both non-private, so a member who learns a shared
     task's ID can write their own uid into either projection and then satisfy
     the new read rule. Write authorization does not imply read authorization.
     Pinning the projections against their `[{uid,name}]` sources is not
     expressible — rules cannot map over an object array. Require instead that
     the caller is **already authorized on `resource.data`** (creator, assignee,
     shared recipient, or team) before any update is allowed; self-grant then
     fails because the pre-update document does not authorize the caller.
     Document the residual: an already-authorized recipient can widen sharing.
     Adversarial rules tests for self-grant through both projection fields,
     including a direct update by a member who cannot read the task.
  6. **Gate work-item comments on parent visibility (review H-2, owner decision
     DEC-2026-010 — in scope).** `firestore.rules` lets every active member read
     and create comments under every `workItems` document, so private task
     discussion stays readable even after the parent read is fixed. Gate
     read/create/update/delete on authorization to the parent doc via a rules
     `get()` — deterministic from the `itemId` path variable, so it also holds
     for the subcollection list. Preserve the maintenance-comment workflow:
     maintenance items have no visibility model and stay member-readable.
     Direct-SDK tests proving an unauthorized member can neither read nor create
     a comment under a private/shared task. If comment author identity and
     security-sensitive timestamps are not pinned in this task, record that as an
     explicitly accepted residual.
  7. **Stop private task titles reaching the weekly attention digest (finding
     C-1, DEC-2026-010).** `gatherAttentionSignals` (`functions/index.js`) reads
     the entire `workItems` collection with the Admin SDK and passes overdue task
     titles into `buildDigestSignals` → `examples`, which is emailed to church
     admins and sent to the Claude API. Cloud Functions bypass rules, so items
     3-6 do not close this. The digest is one payload for all admins, so
     per-recipient filtering does not apply — exclude private and shared tasks
     outright. `functions/test/attention.test.mjs` pins the digest shape
     byte-for-byte and will need updating; overdue/dueThisWeek counts change.
  8. Add the Firestore indexes the new queries require, and probe them against
     production after deploy — `firebase deploy --only firestore:indexes`
     silently skips two index kinds (see CLAUDE.md Known Pitfalls).
- Rollout — four gates inside this one task (review H-3). No existing document
  carries the uid projections, so a combined writer+reader deployment would hide
  legacy shared and assigned tasks until the backfill finished, and running the
  backfill first races documents created before the deploy:
  1. Deploy the additive projection writers **and the indexes**, keeping the
     current read path.
  2. Back up → dry run → execute the idempotent backfill → validate, then a delta
     validation for documents created during the transition.
  3. Cut clients over to the constrained, merged read path only once projection
     coverage is complete, and remove the interim store filter in the same
     change. If gates 1 and 3 cannot be separate client deployments, a feature
     flag or equivalent cutover gate is required.
  4. Deploy the restrictive rules once the compatible client is live.
  Rollback must account for clients on both sides of the gate-3 cutover.
- Downstream consumers that must not regress: Global Search, Event Day,
  occurrence/ICS generation, the attention engine, Reservations' linked setup
  tasks, Timesheet's maintenance links, CSV and calendar exports, and
  `WorkBoard`'s per-detail listeners after a visibility or assignment change.
- Acceptance criteria:
  - Unauthorized members cannot self-grant access by writing either uid
    projection, proven by adversarial rules tests.
  - Parent visibility governs work-item comment reads and writes, proven by
    direct-SDK tests.
  - Private and shared task titles no longer reach the attention digest.
  - Legacy and transition-period documents stay visible to their legitimate
    creator, recipients, and assignees throughout the rollout.
  - `e2e/authenticated/private-visibility-listener.spec.js` is rewritten and
    unskipped, and it exercises the **new** query set rather than only proving
    the obsolete unconstrained query no longer returns the probe. It must
    (review M-1): assert exact expected outcomes and error codes instead of
    treating every error as non-disclosure; fail on listener timeout and assert
    the expected completion mode; assert server-backed metadata; retain the
    direct-get and cross-tenant controls; add positive cases proving team,
    creator-owned, explicitly shared, and assigned tasks ARE delivered; and add
    negative cases for private tasks and for shared tasks where the caller is not
    a recipient.
  - Emulator rules coverage for the new predicates, with the documented caveat
    that emulator list results are not containment evidence.
  - A two-account production verification, owner-authorized, covering both
    `getDocsFromServer` and `onSnapshot`.
  - The default Playwright project is green at handoff, with no skip remaining.
  - Client commits precede rules commits; lint/build/test:rules/test:unit
    recorded; SHA-pinned handoff that records the four deploy gates separately.
- Not in scope: D-2, D-5 (answered "no change"), AC-07/D-4 (closed as intended
  behaviour), and COH-005's D-3/D-7/D-8.

## Proposed Queue

### COH-005 — Remaining core authorization policy (D-3, D-7, D-8)

- Status: Proposed
- Suggested owner: Codex
- Suggested reviewer: Claude
- Authorized by: DEC-2026-007
- Scope:
  1. **D-3 supplies** — members may adjust `quantity` only, result must stay
     >= 0; `name`, `reorderPoint`, and `location` become manager/admin-only.
     Expressible in rules; no callable needed.
  2. **D-7 certifications** — loosen the UI so managers can record every access
     type (`PeopleAccessPage.jsx:249`, `:858`, `:961`). Rules already allow it.
  3. **D-8 reservations** — approve/deny restricted to manager/admin; members may
     create and edit only their own pending requests, and cannot change another
     member's. Ordinary rule change; no callable, because approval is any
     manager rather than a per-room or per-ministry lookup.
- Not in scope: D-2 and D-5 were answered "no change." D-4/AC-07 is closed as
  intended behavior (DEC-2026-006). D-6 is still under discussion.
- Acceptance criteria: adversarial emulator coverage for each rule change,
  including that a member cannot approve their own reservation or set an
  arbitrary supply quantity; lint/build/test:rules recorded; SHA-pinned handoff.

These are candidates, not assignments. Promote one only after the current task
is reviewed and file overlap is checked.

### COH-003 — Activation checklist product specification

- Status: Proposed
- Suggested owner: Claude
- Suggested reviewer: Codex
- Scope: Product flows, adaptive steps, deep links, and analytics events; no UI
  implementation until the specification is approved.

### COH-004 — Role-aware Today / Sunday Readiness concept

- Status: Proposed
- Suggested owner: Claude
- Suggested reviewer: Codex
- Scope: Reuse the attention and occurrence engines; define role-specific jobs,
  source data, and success measures before implementation.

## Completed Tasks

### COH-002 — Implement approved core authorization changes

- Status: **Complete** (2026-08-29) — merged to `main`; **rules not yet deployed**
- Owner: Codex · Reviewer: Claude
- Implementation SHA: `47ecd6d`; handoff `75dcc8a`
- Delivered: the four authorized workstreams — active-membership enforcement
  (`get('active', true)`, failing safe for legacy profiles), People Access reads
  narrowed to manager/admin with self-only access preserved for My Compliance,
  activity-log actor and server-time pinning on the `shepherdAudit` pattern, and
  removal of the four legacy `tasks`/`maintenanceTickets` rule blocks with
  `taskTemplates` and `workItems` preserved.
- Actual file scope: `firestore.rules`, `src/useFirestore.js`, `src/App.jsx`,
  `src/pages/ActivityLogPage.jsx`, `src/pages/ItemsPage.jsx`,
  `src/pages/SuppliesPage.jsx`, `src/pages/ReservationsPage.jsx`,
  `src/pages/hubs/WorkBoard.jsx`, `scripts/setup-e2e-tenant.mjs`,
  `functions/test/rules/core-collections.test.mjs`, `docs/DATA_MODEL.md`,
  `docs/CHANGELOG.md`. `SettingsPage.jsx` was not needed — My Compliance consumes
  the scoped store arrays directly.
- Review: `docs/COH-002-REVIEW-2026-08-29.md` (changes requested — H-1 silent
  audit-row loss) then `docs/COH-002-REVIEW-ROUND2-2026-08-29.md` (approved).
  Verified by 33/33 owner tests plus 18 independent adversarial probes; every
  pre-COH-001 exposure in scope re-run as a regression check and confirmed closed.
- **Still open by owner decision:** AC-07 — any active member retains broad
  maintenance update authority pending D-4. D-2/D-3/D-5/D-6/D-7/D-8 unanswered.
- **Remaining action:** the client is deployed; `firebase deploy --only
  firestore:rules` has NOT been run, so the exposures are not yet closed in
  production. Owner-gated.

### COH-001 — Core authorization threat model

- Status: **Complete** (2026-08-29)
- Owner: Codex · Reviewer: Claude
- Final target: `981054d`; merged to `main` at `45c24e1`
- Outcome: A reviewed threat model for the core collections, an authorized
  four-workstream scope for COH-002, and ten owner decisions of which D-1, D-9,
  and D-10 are answered and D-4 is deferred.
- Record: `docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`,
  `docs/COH-001-HANDOFF-2026-08-28.md`, `docs/COH-001-REVIEW-2026-08-28.md`,
  `docs/COH-001-REVIEW-ROUND2-2026-08-28.md`,
  `docs/COH-001-CONFIRMATION-2026-08-29.md`,
  `docs/COH-001-OWNER-DECISIONS.md`, `docs/COH-002-EXECUTION-PLAN.md`
- Review outcome: approved after two rounds. Round one raised two High findings
  (legacy rule blocks absent from the model; emulator list-denial assertions
  treated as evidence); round two raised two more (an inaccurate Storage claim in
  the executive summary, and a missing residual-risk statement created by the
  D-4 deferral). All were resolved.
- Note: the highest-severity finding, AC-01, was found by the owner and missed by
  the reviewer's independent baseline; the legacy-block and emulator findings ran
  the other way. Neither agent alone produced the complete picture.

