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

### COH-001 — Core authorization threat model

- Status: Ready
- Owner: Codex
- Reviewer: Claude
- Type: Analysis and proposal only; no implementation in this phase
- Branch: `codex/coh-001-core-authorization-model`
- Likely files inspected:
  - `firestore.rules`
  - `src/useFirestore.js`
  - `src/pages/ItemsPage.jsx`
  - `src/pages/SuppliesPage.jsx`
  - `src/pages/ReservationsPage.jsx`
  - `src/pages/hubs/WorkBoard.jsx`
  - `functions/test/rules/core-collections.test.mjs`
- Objective: Define the intended member, manager, and administrator authority
  for inventory, supplies, reservations, maintenance work items, activity-log
  entries, People Access data, and work-item comments.
- Acceptance criteria:
  - Document current rule behavior and realistic direct-SDK abuse cases.
  - Propose an explicit field/action permission matrix by role.
  - Identify UI workflows that depend on currently broad permissions.
  - Separate safe rule-only changes from changes needing callable functions or
    data-model work.
  - Propose adversarial emulator tests and a staged rollout/rollback approach.
  - Make no application, rules, or test changes during this task.
- Review focus:
  - Does the proposal preserve normal volunteer and staff workflows?
  - Are church-specific approval and delegation needs represented?
  - Are the restrictions understandable enough to support operationally?
- Dependencies: Owner approval of the final permission model before any
  implementation task is opened.

## Proposed Queue

These are candidates, not assignments. Promote one only after the current task
is reviewed and file overlap is checked.

### COH-002 — Implement approved core authorization changes

- Status: Review — changes requested at `12abe7e`
- Owner: Codex
- Reviewer: Claude
- Branch: `codex/coh-002-core-authorization`
- Actual file scope: `firestore.rules`, `functions/test/rules/core-collections.test.mjs`,
  `src/useFirestore.js`, `src/App.jsx`, `src/pages/ActivityLogPage.jsx`,
  `src/pages/ItemsPage.jsx`, `src/pages/SuppliesPage.jsx`,
  `src/pages/ReservationsPage.jsx`, `src/pages/hubs/WorkBoard.jsx`,
  `scripts/setup-e2e-tenant.mjs`, `docs/DATA_MODEL.md`, `docs/CHANGELOG.md`, and
  the COH-002 handoff/workboard records.
- Scope: the four authorized workstreams in
  `docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`, plus review fixes H-1,
  M-1, L-1, and L-2 from `docs/COH-002-REVIEW-2026-08-29.md` at `12abe7e`.

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

None yet.
