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

