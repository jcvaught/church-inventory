# ChurchOpsHub Agent Guide

This file contains the shared operating rules for every coding agent working in
this repository. Read it before planning, reviewing, or changing the project.
Claude-specific repository context remains in `CLAUDE.md`.

## Start Here

Before beginning work, read:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/AI-WORKBOARD.md`
4. The task's linked specification and relevant architecture documents

`docs/backlog.md` remains the canonical product backlog. The AI workboard only
tracks agent ownership, handoffs, and review status for selected tasks.

## Product and Architecture Invariants

- ChurchOpsHub is a multi-tenant church-operations platform. Never weaken the
  `churchId` tenant boundary.
- Firestore rules and Cloud Functions are security boundaries. UI hiding and
  client-side filtering are not authorization.
- Inventory and supplies are permanently included in the free product. The
  current paid offering is one ChurchOpsHub plan: $15/month or $150/year.
- `workItems` is the canonical Tasks + Maintenance collection. Jobs remains in
  `jobListings`.
- Per-user `allowedHubs` controls user access independently from church billing.
- Jobs roster writes must remain server-controlled through Cloud Functions.
- Shepherd Hub data is need-to-know pastoral information. Preserve its elder
  custom-claim gates, owner-only administration, private-note ownership, and
  audit requirements.
- SMS consent fields are self-managed. An administrator must never opt another
  person into messaging.
- Do not expose test accounts, credentials, private notes, medical information,
  compliance details, or volunteer roster data on public surfaces.

## Agent Coordination

- One task has one implementation owner and, when practical, a different
  reviewer.
- Work only on the task assigned to you in `docs/AI-WORKBOARD.md`.
- Use a dedicated branch and worktree. Do not edit another agent's active
  branch or worktree.
- Before editing, inspect `git status`, the current branch, and the task's
  declared file scope.
- If another active task touches the same central file, stop and coordinate the
  sequence. Pay particular attention to `App.jsx`, `useFirestore.js`,
  `functions/index.js`, `firestore.rules`, and `storage.rules`.
- The implementation owner writes code and verification. The reviewer reports
  findings and should not modify the implementation unless ownership is
  explicitly transferred.
- Record consequential decisions in `docs/DECISIONS.md`; do not leave durable
  product or architecture decisions only in chat.
- Complete a handoff using `docs/AI-HANDOFF-TEMPLATE.md` before review.

### Reviewer verification worktree

A reviewer may create a **temporary detached worktree at the handoff SHA** to run
tests against the work under review:

```bash
git worktree add --detach /tmp/<task>-review <handoff-sha>
cd /tmp/<task>-review && npm run test:rules   # lint/build as the change warrants
cd - && git worktree remove --force /tmp/<task>-review
```

This is a read-only checkout, not an edit to the counterpart's branch or
worktree. It must never be pushed or committed to, and must be removed when the
review ends. Reuse an existing `node_modules` by symlink rather than installing a
second copy.

Reviewing a change that alters application code, rules, or tests without
executing it is a weaker review than the change warrants, and security work in
particular must be verified against real behavior rather than read.

### Counterpart branch check

Both agents work in separate worktrees off one repository and share its object
store, so each can read the other's work without checking out a branch or
entering the other's worktree.

At the start of any task, and again after delivering or receiving a handoff,
check the counterpart's branch for new commits:

```bash
git log --oneline -5 <counterpart-branch>   # what is new
git show <sha>:<path>                        # read a file at a commit
git diff main...<counterpart-branch>         # what the branch changed
```

Claude works on `claude/work`. Codex works on the task branch named in
`docs/AI-WORKBOARD.md`. Write one commit per message to the counterpart so "the
newest commit" is unambiguous. Never check out, edit, or commit to the
counterpart's branch.

## Safety and Production Boundaries

- Never deploy, modify production data, run a production migration, change
  Firebase/Google Cloud/Vercel/Stripe/Brevo/Twilio/Planning Center settings, or
  rotate credentials without explicit owner approval.
- Prefer the Firebase emulators for data and rules work. Treat the documented
  production E2E tenant as production access and use it only when the task and
  owner authorization specifically require it.
- Do not print, commit, copy, or summarize secret values. In particular,
  `scripts/serviceAccountKey.json` and function environment files are sensitive.
- Preserve unrelated user changes in a dirty worktree. Do not reset, discard,
  or overwrite them.
- Migrations require a backup, dry run, validation queries, rollback procedure,
  and explicit execution approval.

## Implementation Standards

- Make the smallest coherent change that satisfies the approved acceptance
  criteria. Avoid opportunistic refactors in feature or security fixes.
- Reuse shared domain modules and existing primitives before creating parallel
  implementations.
- Use server timestamps for security-sensitive chronology and audit events when
  changing those paths. Preserve local-date semantics for church calendar dates.
- Maintain accessible names, keyboard behavior, focus handling, contrast, and
  mobile touch targets.
- Add or update plain-language help and `src/data/whatsNew.js` when a
  user-visible change requires it, following existing documentation conventions.
- Keep `docs/DATA_MODEL.md`, business rules, migration notes, and code comments
  aligned with behavior.

## Verification and Definition of Done

Choose verification proportional to the change, and record exact commands and
results in the handoff.

- Frontend changes: lint affected code and run a production build.
- Pure domain logic: add or update Node unit tests and run `npm run test:unit`.
- Firestore or Storage authorization: add adversarial allow/deny coverage and
  run `npm run test:rules`.
- Cloud Function handlers: add handler integration coverage and run
  `npm run test:handlers`.
- Critical user workflows: run the narrowest relevant Playwright specs; do not
  run production E2E tests without the required authorization and environment.
- Security changes must test direct SDK/API behavior, not merely hidden UI.

A task is not complete until its acceptance criteria are met, relevant tests
pass, documentation is current, the handoff is written, and known limitations
are disclosed. Only the product owner decides when to merge or deploy, with one
standing exception below.

### Documentation merge exception (Claude only)

Claude may merge and push **documentation-only** changes to `main` without
asking. This is a Claude-specific grant; Codex has no equivalent permission and
should not infer one.

It covers `.md` files and nothing else. Before any such merge, verify the change
introduces no code:

```bash
git diff --stat <base> HEAD -- firestore.rules storage.rules src/ functions/ \
  scripts/ e2e/ package.json
```

Empty output is the precondition. If that command prints anything, the merge is
not documentation-only and requires the product owner. Merging code, rules,
tests, or configuration to `main`, and every production deploy, remain the
product owner's decision.

