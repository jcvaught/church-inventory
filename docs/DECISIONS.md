# ChurchOpsHub Decision Log

Record durable product, security, data, and architecture decisions here. This
log complements detailed plan documents and prevents decisions from living only
in an agent conversation.

## Entry Template

### DEC-YYYY-NNN — Decision title

- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded
- Deciders: Owner and relevant reviewers
- Related tasks/docs: COH-NNN, links or paths
- Context: What required a decision?
- Decision: What was chosen?
- Alternatives considered: What else was evaluated?
- Consequences: Benefits, costs, limitations, migration, and rollback effects
- Follow-up: Concrete remaining actions

## Decisions

### DEC-2026-001 — Coordinate coding agents through repository artifacts

- Date: 2026-08-28
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `AGENTS.md`, `docs/AI-WORKBOARD.md`,
  `docs/AI-HANDOFF-TEMPLATE.md`
- Context: Codex and Claude may work on ChurchOpsHub concurrently, but they do
  not share chat memory and simultaneous edits in one working tree create
  conflict and ownership risk.
- Decision: Use one owner per task, separate branches/worktrees, repository-based
  instructions, written handoffs, and cross-agent review. Keep
  `docs/backlog.md` as the product backlog and use the AI workboard only for
  execution coordination.
- Alternatives considered: Both agents editing the same worktree; coordinating
  only through pasted chat messages; maintaining separate untracked task lists.
- Consequences: Coordination requires small documentation overhead, but work is
  reviewable, conflicts are visible, and decisions survive individual chats.
- Follow-up: Create isolated worktrees after the coordination documents are
  reviewed and committed.

### DEC-2026-002 — Claude may merge documentation-only changes to `main`

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `AGENTS.md`, `docs/COH-002-EXECUTION-PLAN.md`, COH-001
- Context: The product owner was acting as the manual merge and relay step for
  agent-authored documentation. During COH-001 this cost a real handoff: the D-1
  addendum (`3dda1f0`) landed 31 seconds after Codex finalized the scope
  (`981054d`) and never reached it, leaving an unsafe rule default in the
  authorized workstream.
- Decision: Claude may merge and push documentation-only changes to `main`
  without asking, gated on a verification that no code, rules, tests, or
  configuration are included. Codex is not granted this; the asymmetry is stated
  in `AGENTS.md` so it is not read as general permission.
- Alternatives considered: Keeping every merge with the product owner (the status
  quo, which produced the missed handoff); granting both agents the permission
  (doubles the surface without addressing the relay bottleneck, since Codex is
  reachable only through the owner anyway).
- Consequences: Documentation reaches `main` promptly, so the counterpart branch
  check operates on current content. Code, rules, test, and configuration merges
  and all production deploys remain owner-gated, so the blast radius of the grant
  is limited to prose. Risk accepted: a mistaken documentation merge is
  revertible and cannot alter application behavior.
- Follow-up: Ownership in `docs/COH-002-EXECUTION-PLAN.md` updated accordingly.
  COH-002's own merge is a code merge and is explicitly NOT covered.

### DEC-2026-003 — Reviewers may verify in a temporary detached worktree

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `AGENTS.md`, `docs/AI-PROTOCOL-NOTES-2026-08-28.md` §2.2,
  COH-002
- Context: `AGENTS.md` forbids editing another agent's branch or worktree, which
  read strictly would prevent a reviewer from executing the code under review.
  COH-001 was analysis, so review by reading plus external probes was sufficient.
  COH-002 changes `firestore.rules`, `src/useFirestore.js`, and
  `src/pages/SettingsPage.jsx`; its client changes cannot be verified without a
  working tree.
- Decision: A reviewer may create a temporary detached worktree at the handoff
  SHA, run tests there, and remove it. Never pushed, never committed to, never
  the counterpart's branch.
- Alternatives considered: Review by reading only (leaves the client changes
  unverified, and those are the ones that break the app for every member if
  wrong); reviewing rules via `git show` into an external harness (works for
  rules, covers neither the client changes nor the owner's own test file).
- Consequences: Security review can assert real behavior rather than intent. The
  reviewer's pre-COH-001 baseline probes become a regression suite — cases that
  previously passed as exposures must now fail. No additional write access is
  granted anywhere.
- Follow-up: None. Closes protocol §2.2.

### DEC-2026-004 — Claude may hand off directly to Codex after a completed review

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `AGENTS.md`, COH-002
- Context: The product owner was the transport for every agent-to-agent message.
  The Codex CLI supports non-interactive invocation (`codex exec`), so the
  review-to-rework handoff can be made directly. Three levels were considered:
  direct one-directional invocation, a polling loop, and a git-ref daemon.
- Decision: Adopt the first only. Claude may invoke `codex exec` to hand off a
  completed, committed review. The message must be derivable from the committed
  artifact, may not carry an unrecorded owner decision or any production
  authorization, and is limited to one invocation per review with no polling.
  Claude reports the exact command and message to the owner in the same turn.
- Alternatives considered: A polling loop or watcher daemon — rejected for now.
  The relay was never the bottleneck; owner decisions were. Removing the human
  from the loop entirely would leave two agents iterating unsupervised on the
  authorization rules of a live production application, and agreement between two
  similarly-trained agents is weaker evidence of correctness than it appears.
- Consequences: Mechanical rework handoffs stop waiting on the owner. Decisions
  and anything reaching production still stop at the owner, matching the line
  drawn by DEC-2026-002 and DEC-2026-003. Risk accepted: an incorrect handoff
  message wastes Codex effort, which is visible and recoverable because every
  message is reported and every artifact is committed.
- Follow-up: Revisit if the one-invocation limit proves too tight in practice.
  Do not extend to polling without an explicit new decision.

