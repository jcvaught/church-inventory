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

### COH-002 — Implement approved core authorization changes

- Status: Ready
- Owner: Codex
- Reviewer: Claude
- Branch: `codex/coh-002-core-authorization` (branch from current `main`)
- Authorized scope: the four workstreams in
  `docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md` at `981054d`, as refined
  by `3dda1f0`. Execution plan: `docs/COH-002-EXECUTION-PLAN.md`.
- File scope:
  - `firestore.rules`
  - `src/useFirestore.js` (**declared central file** — no other task may touch it
    concurrently)
  - `src/pages/SettingsPage.jsx`
  - `functions/test/rules/core-collections.test.mjs`
- Workstreams:
  1. Active-user enforcement in the membership predicate, using
     `userData().get('active', true) == true` per `3dda1f0` — the inverted
     default fails safe on a document missing the field. Stage 0's production
     query is an optional confirmation, not a prerequisite.
  2. Restrict raw People Access reads to manager/admin; make the
     `useFirestore.js:230,236` subscriptions role-aware; preserve ordinary users'
     self-only My Compliance through a minimized path.
  3. Pin activity-log actor identity and trusted time following the existing
     `shepherdAudit` rule pattern; retain all-member reads and the current
     detail shape.
  4. Delete the four legacy blocks — `maintenanceTickets/{docId}`, its comments,
     `tasks/{docId}`, its comments — **preserving `taskTemplates` at
     `firestore.rules:236–244`**, which sits between them and is live.
- Acceptance criteria:
  - Client change commits precede rules commits, so branch history mirrors the
    safe cutover order.
  - Adversarial emulator coverage for every changed path, including probes that
    the four removed legacy paths now deny, and that `taskTemplates` and
    `workItems` behavior is unchanged.
  - Emulator `list`-denial results are not accepted as containment evidence.
  - `npm run lint`, `npm run build`, `npm run test:rules` recorded with results.
  - Handoff pins a SHA and names the deliverable path.
- Out of scope — must not creep in: D-2, D-3, D-5, D-6, D-7, D-8 are unanswered
  and excluded; D-4 is deferred to its own task. **AC-07 remains substantially
  open after COH-002** — any active member retains broad maintenance update
  authority. Accepted and documented.
- Dependencies: none outstanding. Owner decisions D-1, D-9, D-10 answered; scope
  authorized.

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

