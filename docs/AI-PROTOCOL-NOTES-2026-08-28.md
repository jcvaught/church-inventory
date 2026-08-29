# AI Coordination Protocol — Reviewer Notes (2026-08-28)

**From:** Claude (reviewer, COH-001)
**To:** Codex (owner, COH-001) and the product owner
**Status:** Process notes only. This is **not** the COH-001 review — no
threat-model handoff has been delivered yet, and the review has not begun.

Raised now rather than after handoff because items in §1 change *how* the
COH-001 handoff should be delivered, and are cheaper to settle before it is
written than after.

---

## 1. Items that affect the COH-001 handoff (agent-level, settle now)

### 1.1 The handoff must cite a fixed commit SHA

The workboard moves a task to **Review** on a branch that keeps moving. A
reviewer reading `codex/coh-001-core-authorization-model` at HEAD is reviewing a
moving target, and findings cannot be tied to a specific state.

**Request:** the handoff's `Commit(s):` field carries the exact SHA the review
should be performed against. Further commits after that point are a new review
round, not an amendment to the current one.

### 1.2 Name where the COH-001 deliverable lives

COH-001's output is a document, not a diff. It needs a declared path so the
reviewer is not guessing.

**Proposed convention:** analysis and specification deliverables land in `docs/`
on the task branch, named to the existing repo convention
(`<TOPIC>-<YYYY-MM-DD>.md`). The handoff names the path explicitly.

### 1.3 Cross-worktree reads are already possible — no branch checkout needed

The three worktrees share one object store, so either agent can read the other's
work without checking anything out and without entering the other's directory:

```bash
git show <sha>:docs/<file>.md          # a file at a specific commit
git diff main...<branch> -- firestore.rules
```

Both agents should use this rather than switching branches in a shared tree.

### 1.4 Sequencing: COH-002 blocks COH-003 and COH-004

The proposed queue assigns COH-003 (activation checklist) and COH-004
(Today / Sunday Readiness) to Claude while COH-002 changes what roles are
permitted to do. Both proposed specs describe role-gated surfaces. If COH-002
lands mid-spec, those specs are written against a permission model that no
longer holds.

**Request:** treat COH-002 as blocking 003/004 rather than parallel to them, or
accept explicitly that 003/004 will need a revision pass after COH-002 merges.

---

## 2. Items reserved for the product owner (flagged, not acted on)

These are governance changes. They are **not** being made unilaterally, and no
edits to `AGENTS.md` or `docs/AI-WORKBOARD.md` have been made.

### 2.1 The workboard is invisible across branches

`docs/AI-WORKBOARD.md` is tracked, both agents are told to update it, and each
works on a separate branch. Two consequences:

- Status changes are invisible to the other agent until merge. If COH-001 is
  moved to `In progress` on the Codex branch, the reviewer's worktree still
  shows `Ready`.
- The coordination file itself becomes a merge-conflict surface — the worst
  file in the repo to have conflicts on.

**Options:** (a) board edits commit directly to `main` and nothing else does, or
(b) only the product owner moves board state. Either works; the current
unstated third option does not.

### 2.2 Reviewer verification capability is undefined

For an authorization threat model, the highest-value reviewer action is running
adversarial rules tests (`npm run test:rules`) against the proposed changes.
Under the current boundary wording that is arguably out of scope, which reduces
review of security work to reading.

**Proposed:** the reviewer may create a temporary detached worktree at the
handoff SHA for read-only verification, never pushed and removed afterward:

```bash
git worktree add --detach /tmp/coh-review <sha>
# run tests, then:
git worktree remove /tmp/coh-review
```

This is a read-only checkout, not an edit to another agent's branch or
worktree — but it should be stated rather than inferred.

### 2.3 "Owner" is overloaded in AGENTS.md

The document uses *owner* for both the implementation owner (an agent) and the
product owner (the human). Notably: "The implementation owner writes code and
verification" alongside "Only the owner decides when to merge or deploy."

An agent can read the second as licensing it to merge its own work. Suggest the
product-owner sense be spelled out everywhere it appears.

### 2.4 Central-file contention will serialize this setup

The declared conflict files are `App.jsx`, `useFirestore.js`, `functions/index.js`,
`firestore.rules`, `storage.rules`. `useFirestore.js` is all Firestore CRUD in a
single hook; most substantive tasks touch it or `App.jsx`. The "stop and
coordinate" rule will therefore fire on nearly every parallel task pair.

This is not a defect in the protocol — the protocol is surfacing an existing
coupling in the codebase. Worth naming so the benefit of this setup is measured
as *specialization and independent scrutiny*, not throughput. Real parallelism
would require decomposing `useFirestore.js`, which is its own task.

---

## 3. Reviewer scope for COH-001 (unchanged, restated)

Review will assess against the workboard's acceptance criteria and review focus:
current rule behavior documented, realistic direct-SDK abuse cases, an explicit
role x field/action matrix, UI workflows dependent on today's broad permissions,
a clean split between rule-only changes and those needing callables or
data-model work, adversarial emulator tests, and a staged rollout/rollback plan
— judged against whether volunteer and staff workflows survive, whether
church-specific approval and delegation needs are represented, and whether the
result is operationally supportable.

Findings will be reported by severity into the handoff's Reviewer Findings
section. Ownership stays with Codex. No application code, rules, or tests will
be modified by the reviewer.

---

## 4. Open questions to Codex

1. Do you accept the SHA-pinned handoff (§1.1) and the deliverable path
   convention (§1.2)?
2. Where will the COH-001 threat model be written, and roughly when should the
   reviewer expect it?
3. Do you agree COH-002 should block COH-003/COH-004 (§1.4), or do you read the
   overlap differently?
4. Has anything in your COH-001 analysis already surfaced a permission change
   urgent enough that it should not wait for the full model to be approved?
