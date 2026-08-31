# COH-006 Pre-Implementation Review

- Date: 2026-08-31
- Reviewer: Codex
- Target: `main` at `2c5dad4`
- Task: COH-006 — Enforce private and shared task visibility
- Outcome: **Plan changes required before implementation**

## Scope reviewed

This review covers Claude's production characterization and remediation plan in:

- `docs/DECISIONS.md` (DEC-2026-008 and DEC-2026-009)
- `docs/AI-WORKBOARD.md` (COH-006)
- `e2e/authenticated/private-visibility-listener.spec.js`
- the current `workItems` read, update, and comment rules
- the task subscription and its downstream consumers

The production evidence establishes that another church member currently
receives a private task through the application's unconstrained `workItems`
listener. The strengthened probe materially improves the evidence: it uses a
dedicated Firebase app, server-forced reads, distinct-UID assertions, cache
metadata, an `onSnapshot` arm matching the real application path, and a
cross-tenant control. The tenant boundary remained intact in that probe.

The findings below do not dispute the observed disclosure. They identify gaps
that would leave COH-006 incomplete or make its rollout unsafe.

## Findings

### H-1 — Shared visibility remains bypassable through the update rule

`firestore.rules:227-243` permits any active church member to update a task
whose existing and resulting visibility are both non-private. That includes a
`visibility: 'shared'` task, whether or not the caller is its creator,
assignee, or selected recipient.

COH-006 proposes making `sharedWithUids` and `assigneeUids` authoritative for
reads, but its required rule work mentions only the read rule. If the current
update predicate remains, a member who learns a shared task's document ID can
write their own UID into either projection and then satisfy the new read rule.
Firestore write authorization does not implicitly require read authorization.

Required plan change:

1. Define who may change `visibility`, `sharedWith`, `sharedWithUids`,
   `assignees`, and `assigneeUids`.
2. Prevent a caller who is not already authorized for the task from granting
   themselves access through an update.
3. Pin or validate the UID projections so they cannot drift from their source
   object arrays in security-relevant ways.
4. Add adversarial rules tests for self-grant attempts through both projection
   fields, including direct update by a member who cannot read the task.

Without this change, the acceptance criterion that shared visibility is
"genuinely enforced" is not met.

### H-2 — Work-item comments ignore parent visibility

`firestore.rules:253-257` allows every active church member to read and create
comments under every `workItems` document. A member who knows or discovers a
private/shared task ID can read its comment text and add comments even after
the parent task read is fixed.

This residual exposure was already identified as AC-08 in
`docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`, but comments are absent
from COH-006's required work and acceptance criteria.

Required plan change:

1. Gate comment read/create/update/delete on authorization to the parent task,
   while preserving the existing maintenance-comment workflow.
2. Pin comment author identity and security-sensitive timestamps if comment
   hardening is included, or explicitly record those integrity issues as a
   separate accepted residual risk.
3. Add direct SDK tests proving an unauthorized member cannot read or create a
   comment under a private/shared task.

If the owner does not want comments included in COH-006, the task must state
that private/shared task comments remain member-readable and therefore that
COH-006 does not provide complete content privacy.

### H-3 — The proposed client/backfill/rules order has a data-visibility gap

Existing tasks do not have `sharedWithUids` or `assigneeUids`. A client bundle
that both starts writing projections and replaces the current subscription
with projection-based queries will omit legacy shared/assigned tasks until the
backfill completes. Running the backfill before that combined deployment also
has a race: tasks created between the migration and deployment still lack the
new projections.

"One task, not staged" may reasonably mean one tracked work item, but the
production rollout still needs compatibility phases. A safe sequence is:

1. Deploy additive writers for both projections and the required indexes while
   retaining the current read path.
2. Back up, dry-run, execute, and validate an idempotent backfill, then perform
   a delta validation for documents created during the transition.
3. Switch clients to the constrained, merged read path only after projection
   coverage is complete.
4. Deploy the restrictive rules after the compatible client is live.

A feature flag or equivalent cutover gate is needed if steps 1 and 3 cannot be
separate client deployments. The rollback plan must also account for clients
on both sides of the read-path cutover.

### M-1 — The production regression test can pass on infrastructure failure

In `e2e/authenticated/private-visibility-listener.spec.js:44-79`, exceptions
from the direct read or list query are converted to strings, a listener timeout
leaves `snapLeaked` false, and the final assertions check only that the two leak
flags are false. Authentication, network, project-targeting, timeout, or other
unexpected failures can therefore produce a green result without proving the
desired authorization behavior.

Required test changes:

- assert exact expected outcomes and error codes rather than treating every
  error as non-disclosure;
- fail on listener timeout and assert the expected listener completion mode;
- assert server-backed metadata where applicable;
- retain the direct-get and cross-tenant controls;
- add positive cases proving that team, creator-owned, explicitly shared, and
  assigned tasks are delivered by the new constrained queries;
- add negative cases for non-recipient shared tasks as well as private tasks.

The permanent regression should exercise the new application query set, not
only verify that the obsolete unconstrained query no longer returns the probe.

### M-2 — An intentionally failing production E2E test is now on `main`

Commit `651fe55` said the characterization test would remain on `claude/work`
pending a decision because a desired-behavior assertion would fail until the
leak was fixed. Merge `04ec6cf` brought the test onto `main`, and commit
`21375df` converted it to an intentional failure. The normal authenticated
Playwright project collects `authenticated/**/*.spec.js`, so the repository's
full E2E baseline is knowingly red until COH-006 lands.

Required disposition: either land the completed fix with the regression,
temporarily quarantine the test with an explicit issue/task reference, or
provide a separate opt-in production-security project. Do not leave an
unexplained expected failure in the default suite.

### M-3 — The interim Help text understates current exposure

`src/pages/HelpPage.jsx` now says private tasks are hidden from other people's
task lists. The Work board does filter its own list, but the unfiltered store
array is also consumed by Global Search, Event Day, the attention engine, and
other downstream surfaces without their own visibility predicate. A private
task's name, description, or due information may therefore appear outside the
Work board before COH-006 is deployed.

Required disposition: use explicit interim wording that private/shared
visibility is not currently an authorization boundary, or add a central
compatibility filter immediately. After COH-006, update Help text to describe
the actual enforced creator/shared/assignee behavior.

### M-4 — The exact Firestore mechanism is not established by the probe

The rebuilt test establishes the production outcome, but DEC-2026-009 goes
further by attributing it to the current disjunctive, content-dependent rule
shape. The repository also records that COH-002 rules on `main` have not been
deployed. Without pinning or otherwise verifying the production ruleset used
by the test, the causal explanation remains an inference.

This does not lower the severity of the disclosure or change the remediation
direction. The decision record should distinguish the measured facts from the
mechanism hypothesis unless the deployed ruleset is independently verified.

## Acceptance-criteria amendments

Before COH-006 moves to implementation, add these explicit criteria:

- unauthorized members cannot self-grant access by changing either UID
  projection;
- parent visibility governs work-item comment reads and writes, or the comment
  exposure is explicitly accepted and documented;
- legacy and transition-period documents remain visible to their legitimate
  creator, recipients, and assignees throughout rollout;
- the production regression fails on timeout, auth failure, wrong project, or
  unexpected error and proves both authorized delivery and unauthorized
  exclusion;
- the default test suite is green at handoff;
- the deployment handoff records separate writer, backfill, reader, index, and
  rules gates, even if they remain under one COH task.

## Verification performed

- Confirmed `main` and `claude/work` both point to `2c5dad4` and are clean.
- Reviewed the full diffs for `c24d3b8`, `651fe55`, `469bbcd`, `21375df`,
  `fe76845`, and `2c5dad4`.
- Traced the unconstrained subscription and downstream consumers.
- Traced task creation/update paths, the current `workItems` rules, and comment
  rules.
- Ran `node --check e2e/authenticated/private-visibility-listener.spec.js`
  successfully.
- Did not run production E2E, modify production data, deploy, or change the
  implementation.
