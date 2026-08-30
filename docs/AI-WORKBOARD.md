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

None active.

## Proposed Queue

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

