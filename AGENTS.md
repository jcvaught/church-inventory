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
- **Standing division of labour (owner decision 2026-08-31, DEC-2026-011):
  Claude implements, Codex reviews.** Codex reviews the plan before
  implementation starts, and reviews the implementation before it is handed to
  the product owner. Claude writes the code, the tests, and the verification.
  This is the default for new tasks; the workboard entry still names the owner
  and reviewer for each task, and the owner may assign otherwise.
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
- **Reviewers write test cases, not just prose.** Where a finding can be
  expressed as a failing test, the reviewer should write the case — the exact
  fixture and assertion — and the implementation owner integrates and runs it.
  The separation holds: the reviewer proposes tests and never edits
  implementation code, and the owner remains responsible for the suite passing.
  This matters most where the reviewer cannot execute: Codex cannot start the
  emulators from `codex exec`, so an adversarial rules case it writes is worth
  more than the same case described in a paragraph, and it puts an independent
  mind on the attack surface rather than only on the diff. Every review handoff
  should ask for this explicitly.
- Record consequential decisions in `docs/DECISIONS.md`; do not leave durable
  product or architecture decisions only in chat.
- Complete a handoff using `docs/AI-HANDOFF-TEMPLATE.md` before review.

### Direct handoff to Codex (Claude only, one direction)

Claude may invoke Codex directly to hand off a completed review, instead of
routing the message through the product owner:

```bash
codex exec -s workspace-write \
  -c 'sandbox_workspace_write.writable_roots=["/Users/johnvaught/apps/church-inventory-review/.git"]' \
  -C /Users/johnvaught/apps/church-inventory-review "<message>" \
  < /dev/null > <logfile> 2>&1
```

**`< /dev/null` is mandatory, and its absence is silent.** When stdin is not a
terminal, `codex exec` waits to read the prompt from it — even though the prompt
was passed as an argument — and blocks forever. It prints one line,
`Reading additional input from stdin...`, and then does nothing. Two reviews
were lost to this on 2026-09-01: one sat for fifty minutes having never started
work, and the failure looked exactly like a slow or hanging review.

**Redirect to a file; never pipe to `tail`.** `... | tail -30` buffers the whole
stream and emits nothing if the process is killed, so the one diagnostic line
above is discarded precisely when it is needed. Codex writes progress to
**stderr** and only the final answer to **stdout**, so `2>&1` into a file is
what preserves the trace. `-o <file>` also persists the final message on its
own, and `--json` streams JSONL events if a run needs closer watching.

A killed run exits **143** (SIGTERM) or **137** (SIGKILL); the Bash tool's own
timeout caps at ten minutes, which is shorter than a full review, so long
reviews belong in a background task rather than a foreground call.

`-s workspace-write` is required. `codex exec` defaults to a read-only sandbox,
in which Codex cannot write its review, commit it, or even fast-forward its own
branch — it will report the workspace as read-only and stop without changing
anything (observed 2026-08-31).

### The review clone

Codex reviews in **`/Users/johnvaught/apps/church-inventory-review`**, a full
clone with its own `.git`, not a linked worktree. The old worktree could not
commit at all: a linked worktree's Git metadata lives under the primary repo's
`.git/worktrees/`, outside the sandbox, so `index.lock` creation failed and
Claude had to copy the review file out by hand.

Codex has **no network access** under `-s workspace-write`, so it can neither
fetch nor push. That is deliberate, and it shapes the flow:

1. **Claude prepares the clone at the exact SHA to review**, before invoking:
   ```bash
   git -C /Users/johnvaught/apps/church-inventory-review fetch --all --prune
   git -C /Users/johnvaught/apps/church-inventory-review checkout <sha>
   ```
   This also pins what was reviewed, rather than trusting a moving branch.
2. **Codex commits its review in the clone**, on a `codex/*` branch. Its Git
   identity there is `Codex <jcvaught@gmail.com>`, so authorship is unambiguous
   in the log.

   The `writable_roots` flag above is what makes this work, and it is not
   optional. `-s workspace-write` excludes `.git` from writes even when the
   repository IS the workspace — an undocumented default, and the opposite of
   what both agents predicted. A clone alone fails identically to the old
   worktree:
   ```text
   fatal: cannot lock ref 'refs/heads/codex/env-check':
   unable to create directory for .git/refs/heads/codex/env-check
   ```
   Naming that one `.git` directory as a writable root is a narrow grant: it
   permits Codex to write refs and objects in the review clone and nothing else.
   It does not grant network, so it still cannot push. Verified 2026-09-01 by
   probe: commit `e693f14`, authored `Codex <jcvaught@gmail.com>`, fetched into
   the implementation worktree by local path with authorship intact.
3. **Claude fetches that branch from the clone by local path** — no GitHub write
   is involved, and nothing is copied by hand:
   ```bash
   git fetch /Users/johnvaught/apps/church-inventory-review <codex-branch>
   git cherry-pick FETCH_HEAD    # or merge, per the task
   ```

Claude must not edit the content of a review it brings across. Codex is not
authorized to push to GitHub; a writable clone makes pushing possible, and the
product owner has deliberately not granted it.

Keep production credentials out of the clone. `scripts/serviceAccountKey.json`
is gitignored, so a fresh clone does not contain it — preserve that on purpose,
not by luck. A reviewer needs none of it.

### What Codex still cannot do

`npm run test:rules` and `test:handlers` need the Firebase emulators, and the
sandbox refuses to bind local sockets (`EPERM` on 4400/4500/8080/9150/9199).
This is a network-sandbox policy; the clone does not change it. The narrow fix
is a custom permission profile extending `:workspace` with
`permissions.<name>.network.enabled` and `permissions.<name>.network.allow_local_binding`
(verified against the Codex config reference; do not combine a custom profile
with `sandbox_mode`). It is narrower than `--dangerously-bypass-approvals-and-sandbox`
but still permits more local and private networking than those five ports, so
enabling it is the product owner's call and has not been made.

Until it is: **a Codex review is never verification of a test result.** It must
say so, and Claude must report emulator results as unreproduced by a second
party. `npm run test:unit`, `npm run lint`, and `npm run build` DO run in the
clone, which has real `npm ci` installs at the root and in `functions/` (not a
symlinked `node_modules`: tooling writes caches beneath it, and an external tree
can drift from the clone's lockfile).

Toolchain in use as of 2026-09-01 — record it in handoffs, because environment
difference is the usual explanation when one party reproduces a failure and the
other cannot: Node v25.8.0, OpenJDK 26.0.1, Firebase CLI 15.10.0.

`codex exec resume --last` may be used to preserve Codex's session context, but
the message must be written so a cold session would also succeed — always cite
the commit SHA and path of the artifact it refers to.

**Preconditions.** The referenced artifact must already be committed and pushed,
so Codex can read it independently. The message must be fully derivable from that
artifact: a pointer plus a mechanical instruction, nothing that is not already
written down.

**The message may not contain:**

- any product or policy decision the product owner has not already recorded in
  `docs/DECISIONS.md` or `docs/COH-001-OWNER-DECISIONS.md`;
- any expansion of an authorized task scope;
- any authorization to merge, deploy, run production tests, or touch production
  data.

If the next step requires a decision that is not already recorded, Claude stops
and asks the product owner. Handing an unanswered question to Codex to break a
deadlock is exactly what this grant does not permit.

**Limits.** One invocation per stage. **Owner directive 2026-08-31: send Codex
every stage.** A stage is a plan ready for review, an implementation ready for
review, a re-review after Claude has applied findings, a migration script before
it is run, or each gate of a multi-gate rollout. The earlier "normally twice per
task" ceiling is lifted: a second set of eyes at each stage has repeatedly caught
things a single review at the end would not, and an extra review costs little
against shipping an authorization defect.

A stage means work that has reached a reviewable state — it builds, its tests
pass, and a handoff describes it. Do not invoke Codex mid-stage, on work that
does not yet run, or to think out loud.

The anti-loop rules are unchanged, and they are what keep this from becoming an
autonomous agent loop: no polling, no scheduled invocation, no re-invoking to
chase a response. One invocation per stage, after which Claude either acts on
what came back or reports to the product owner. If Codex fails for an
environmental reason (a read-only sandbox, a lock file, a missing dependency),
Claude fixes the invocation and may retry that same stage once; it does not
re-send a stage to get a different answer. Claude reports the exact command and
message to the product owner in the same turn, so every agent-to-agent message
stays visible.

This is Claude-only and one-directional. Codex has no reciprocal grant.

### Reviewer verification worktree

A reviewer may create a **temporary detached worktree at the handoff SHA** to run
tests against the work under review:

```bash
git worktree add --detach /tmp/<task>-review <handoff-sha>
cd /tmp/<task>-review && npm run test:rules   # lint/build as the change warrants
cd - && git worktree remove --force /tmp/<task>-review
```

Codex cannot run `npm run test:rules` or `test:handlers` from `codex exec`: its
sandbox refuses to bind local sockets, so the Firebase emulators fail to start
(`EPERM` on 4400/4500/8080/9150/9199, observed 2026-08-31). It can run
`test:unit` and `lint`. A Codex review must therefore say plainly that it could
not reproduce a rules run rather than implying it verified one, and the
implementation owner's rules results stand unreproduced.

This is a read-only checkout, not an edit to the counterpart's branch or
worktree. It must never be pushed or committed to, and must be removed when the
review ends. Reuse an existing `node_modules` by symlink rather than installing a
second copy.

Known artifact of that symlink: `npm run build` completes and
`verify-prod-bundle` passes, but the `prerender-static` postbuild step fails
every page with "Invalid hook call" / `Cannot read properties of null (reading
'useState')`, because React resolves through the symlink to a second copy. This
reproduces on unmodified `main`, so it is not evidence about the change under
review. Judge such a build by the Vite output and `verify-prod-bundle`, or
re-run it in the primary worktree.

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

Under DEC-2026-011 Claude works on the task branch named in
`docs/AI-WORKBOARD.md` (or `claude/work` for unassigned work), and Codex works on
a `codex/<task>-review` branch carrying only its review documents. Write one
commit per message to the counterpart so "the newest commit" is unambiguous.
Never check out, edit, or commit to the counterpart's branch — including
fast-forwarding it. If the counterpart's branch is behind, say so in the handoff
and let it reconcile its own branch.

## Safety and Production Boundaries

- Codex must never deploy, modify production data, run a production migration,
  change
  Firebase/Google Cloud/Vercel/Stripe/Brevo/Twilio/Planning Center settings, or
  rotate credentials without explicit owner approval. Claude follows the
  product owner's established operational practice for this repository, which
  includes running Firebase deploys; it does not need per-deploy approval, and
  still verifies project targeting first. Neither agent touches billing,
  Stripe, Twilio, Brevo, or Planning Center settings without explicit approval.
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

