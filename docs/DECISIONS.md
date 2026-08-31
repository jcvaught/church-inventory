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

### DEC-2026-005 — Keep the activity-log `performedByName` pin; remove the client divergence point

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `docs/COH-002-REVIEW-2026-08-29.md` (H-1), COH-002
- Context: COH-002 pins `performedByName` to `userData().get('name','')`, but the
  four consuming pages send `userProfile?.name || "Unknown"`. Profiles without a
  name have every audit write silently denied, and
  `scripts/setup-e2e-tenant.mjs` creates the three E2E accounts with no `name`,
  breaking `e2e/authenticated/crud.spec.js:14`.
- Decision: Keep the pin. Fix the cause rather than the four symptoms —
  `logActivity` derives the actor name itself from a single source with no
  fallback, and the pages stop computing and passing a name string. Also give the
  E2E tenant script a `name`, and add a rules probe asserting that a name-less
  profile's realistic client payload is denied.
- Alternatives considered: Dropping the pin and relying on the `performedBy` uid
  pin alone. Rejected — every UI surface displays `performedByName`, not the uid,
  so an unpinned name lets a member write a row with a correct uid and a
  misleading display name that no reader would catch. That half-reopens AC-03,
  trading a narrow fixable failure for a permanent invisible one. Patching the
  four call sites without the refactor was also rejected: it closes today's
  trigger but leaves the class, and any future call site reintroduces a silent
  failure.
- Consequences: The audit row's display name is guaranteed to match the user
  document at write time, and there is no per-page string left to drift. The pin
  stays consistent with the existing `jobSwapRequests` precedent, so the rules
  file keeps one pattern.
- Follow-up: The stale-session case remains open and accepted —
  `useAuth.js:110` loads `userProfile` with a one-shot `getDoc`, so a name
  changed out of band breaks that session's audit writes until re-login. No UI
  path triggers it; document rather than build for it.

### DEC-2026-006 — Member-editable maintenance work is intended behavior; AC-07 is accepted, not deferred

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: COH-001 AC-07, D-4, `docs/COH-001-OWNER-DECISIONS.md`
- Context: The COH-001 threat model rated AC-07 High — any church member can
  change a maintenance work item's status, cost, assignment, completion
  chronology, and recurrence. D-4 was recorded as "deferred pending usage
  evidence," which framed it as an unanswered question.
- Decision: It is not a question. Any active member updating maintenance work is
  the intended product behavior and will not change. D-4 is closed, not
  deferred. The `assigneeUids` migration it implied is cancelled, and no
  follow-up task is needed.
- Alternatives considered: Restricting updates to assignees or manager/admin —
  rejected. In a single congregation the people doing the work are volunteers,
  and requiring elevated roles to close a ticket would break the actual
  workflow the hub exists to serve.
- Consequences: AC-07 stays open at the rules layer permanently and by
  intention. COH-002's pinning of `createdBy`, `taskNumber`, and `createdAt`
  remains, so identity and numbering are still protected — only operational
  fields are member-writable. Any future threat model should list this as
  accepted rather than re-raising it.
- Follow-up: None.

### DEC-2026-007 — Remaining core authorization policy answers

- Date: 2026-08-29
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `docs/COH-001-OWNER-DECISIONS.md` D-2/D-3/D-5/D-7/D-8,
  `docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`
- Context: Five of the six policy questions left open after COH-002.
- Decisions:
  - **D-2 — Managers keep delete on inventory.** No change. Restricting deletion
    to admins would bottleneck every removal on the single admin; the reviewer's
    recommendation of admin-only delete is rejected on that ground.
  - **D-3 — Supply changes become add/subtract.** Ordinary members may adjust
    quantity but not assign an arbitrary value, and may not edit identity fields
    (name, reorder point, location). Manager/admin unrestricted.
  - **D-5 — Private tasks stay private.** No change; admins still cannot read
    another member's private task. Confirms the existing deliberate behavior.
  - **D-7 — Managers may record every access type, certifications included.**
    The rules already permit this; the *UI* is the stricter layer and should be
    loosened to match (`PeopleAccessPage.jsx:249`, `:858`, `:961` currently gate
    certification on `isAdmin`). The reviewer's recommendation to tighten rules
    to the UI is inverted by this decision.
  - **D-8 — Managers approve reservations.** Approve/deny becomes a
    manager/admin action at the rules layer. Members may create and edit their
    own pending requests but cannot approve them or alter another member's.
- Consequences: D-2 and D-5 need no work. D-3, D-7, and D-8 define a follow-up
  implementation task. Notably D-8 is far cheaper than the threat model assumed:
  because approval is *any* manager rather than a per-ministry or per-room
  lookup, it is an ordinary rule change and needs no callable function.
- Open: D-6 (task "Shared" visibility) remains under discussion.
- Follow-up: COH-005 proposed on the workboard.

### DEC-2026-008 — "Shared" task visibility must be genuinely enforced

- Date: 2026-08-29
- Status: Accepted (implementation blocked on an open question — see below)
- Deciders: Product owner
- Related tasks/docs: COH-001 D-6 / AC-10
- Decision: A task set to `visibility: 'shared'` must be readable only by the
  people the creator specifies (plus the creator and assignees). Disclosure-only
  options were rejected; the feature should do what it says.
- Why this is not a rule change (**CORRECTED twice** — see DEC-2026-009 and its
  2026-08-31 addendum): the original premise, that Firestore rejects an
  unconstrained list query containing unreadable documents, is not what happens
  here. Nor is the first correction's broad claim that Firestore generally
  returns unreadable documents — Firebase documents queries as all-or-nothing.
  What is measured is specific to this rule's disjunctive, content-dependent
  predicate: the unconstrained query is admitted and its documents delivered,
  while a `get` and a constraint-targeted query are both denied. `src/useFirestore.js:250` subscribes to the
  whole `workItems` collection with no `where` clause, so enforcing per-document
  visibility requires restructuring how the client queries work items, not just
  editing `firestore.rules`. Storage also changes: `sharedWith` is
  `[{uid, name}]`, and rules cannot search inside an object array — a plain uid
  array is required, with a migration for existing tasks.
- Open question raised by this analysis: the same constraint already applies to
  `visibility: 'private'`, which IS rule-enforced today against the same
  unfiltered listener. Whether that is currently failing in production is
  unverified — and cannot be verified by the test suite, because the Firestore
  emulator fails open on list queries. See the COH-006 note on the workboard.
- Follow-up: verify the private-task/listener interaction against production
  before scoping COH-006.

### DEC-2026-009 — Private task visibility is not enforced on list queries in production

- Date: 2026-08-30
- Status: Accepted (finding recorded; remediation not yet scoped)
- Deciders: Product owner directed the verification; reviewer measured it
- Related tasks/docs: COH-001 AC-10, DEC-2026-008, `src/useFirestore.js:250`

**Measured against production** (`church-inventory-9615c`, `e2e-test-church`
tenant, two real accounts, Playwright + client SDK):

| Operation as a non-creator | Result |
|---|---|
| `getDoc` of another member's private task | **DENIED** |
| Unfiltered `getDocs` of `workItems` | **ALLOWED — private doc returned** |
| `getDocs` with `where('visibility','==','private')` | **DENIED** |
| Cross-tenant `getDocs` | **DENIED** |

- Finding: an unconstrained list over `workItems` returns another member's
  `visibility:'private'` task. `src/useFirestore.js:250` performs exactly that
  query, so every member's client receives every private task in their church
  and only the UI hides them. Private tasks are UI-only privacy, the same as
  `shared`.
- The tenant boundary is intact — cross-church reads remain denied. Exposure is
  within a single congregation.
- Not introduced by COH-002; the `workItems` read rule is unchanged by it.
- Contradicts `CLAUDE.md` ("visibility … no admin override — truly private") and
  the Help Center's description of Private. Both should be corrected to match
  reality until this is fixed.
- Why no test caught it: the rules emulator fails open on list queries, and
  production also returns the documents rather than erroring, so neither
  `test:rules` nor any single-document probe can see it. Only a two-account
  production list query exposes it. The product owner directed that test after
  the reviewer's static reasoning produced a confident but wrong prediction that
  the query would be rejected.
- Remediation direction (not yet scoped): the client must issue constrained
  queries the rules can prove safe — e.g. separate subscriptions for team items,
  own items, and shared-with-me items — or the data must be partitioned so
  unreadable documents are not in the queried collection. This applies equally
  to DEC-2026-008's shared-visibility work; both are the same problem.

#### DEC-2026-009 addendum (2026-08-31) — re-verified under adversarial review, and the mechanism claim narrowed

Codex reviewed the finding and accepted the leak while rejecting the general
claim about Firestore, correctly noting that Firebase documents queries as
all-or-nothing. It also identified real methodology gaps: the first probe used
`getDocs` rather than a server-forced read, never asserted
`snapshot.metadata.fromCache`, shared one Firebase app and Firestore instance
across sign-ins, did not assert the two UIDs were distinct and non-null, and
characterised `getDocs` when the application uses `onSnapshot`.

The probe was rebuilt to close every one of those and re-run against production:

| Operation as member-b vs member-a's private task | Result |
|---|---|
| `getDocFromServer` | DENIED (`permission-denied`) |
| `getDocsFromServer`, unconstrained | **ALLOWED — 1 doc, `fromCache=false`, probe INCLUDED** |
| `getDocsFromServer` with `where('visibility','==','private')` | DENIED |
| `onSnapshot`, unconstrained — the real code path | **DELIVERED — probe INCLUDED** |
| Cross-tenant `getDocsFromServer` | DENIED |

UIDs asserted distinct and non-null; a dedicated Firebase app per run; the
server-forced read reported `fromCache=false`. **The leak is confirmed and the
cache explanation is eliminated.**

**But the mechanism claim is narrowed.** This is not "Firestore returns
unreadable documents." It is specific to a disjunctive, content-dependent read
predicate (`type == 'maintenance' || !has visibility || visibility == 'team' ||
visibility == 'shared' || createdBy == uid`). The rule can be satisfied by
*some* documents in the collection, the unconstrained query is admitted on that
basis, and per-document content filtering does not then occur. Remediation
should therefore be read as "this rule shape is not safely enforceable against
an unconstrained list," not as a defect in Firestore.

Consequence for remediation: unchanged in direction. The client must issue
constrained queries whose shape the rules can prove safe, or the data must be
partitioned.

#### DEC-2026-009 second addendum (2026-08-31) — measured facts vs. mechanism hypothesis

Codex's COH-006 pre-implementation review
(`docs/COH-006-PREIMPLEMENTATION-REVIEW-2026-08-31.md`, M-4) is right that this
record still blurs two different kinds of claim. Separating them:

**Measured, in production, twice, by two independently constructed probes:**
a non-creator's unconstrained `getDocsFromServer` and `onSnapshot` over
`workItems` both deliver another member's `visibility: 'private'` task with
`fromCache=false`, while a direct `getDocFromServer` and a
`where('visibility','==','private')` query are both denied, and cross-tenant
reads are denied.

**Hypothesis, not measured:** that the cause is the disjunctive,
content-dependent shape of the read predicate. The probe never pinned the
ruleset actually deployed to `church-inventory-9615c` at the time it ran, and
this repository separately records that the COH-002 rules on `main` have not
been deployed. The explanation above is therefore inference from the rule text
in the repository, not a verified account of the deployed rule.

This changes neither the severity of the disclosure nor the remediation
direction — constrained queries are required under either explanation. It does
mean COH-006 must not treat the mechanism as established: verify the deployed
ruleset before relying on the causal story, and do not generalise this to other
collections without measuring them.

### DEC-2026-010 — COH-006 review dispositions and the interim visibility filter

- Date: 2026-08-31
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: COH-006, DEC-2026-008, DEC-2026-009,
  `docs/COH-006-PREIMPLEMENTATION-REVIEW-2026-08-31.md`

Codex reviewed the COH-006 plan before implementing it and returned "plan
changes required." All seven findings were verified against the code and all
seven were accepted. Three needed an owner decision:

1. **Comment exposure (H-2) is in scope for COH-006.** `firestore.rules`
   currently lets any active member read and create comments under every
   `workItems` document regardless of the parent task's visibility, so fixing
   only the task read rule would leave private task *discussion* readable.
   COH-006 gates comment access on authorization to the parent work item.
   Rejected alternative: ship COH-006 without it and document the residual —
   rejected because "private" would still not mean private.

2. **The interim exposure (M-3) is filtered now, not left until COH-006.**
   The unfiltered `tasks` store also feeds Global Search (`GlobalSearch.jsx`),
   Event Day (`EventDayPage.jsx`), the attention panel, and CSV/ICS export, none
   of which had a visibility predicate — only the Work board filtered its own
   list. `canSeeTask()` now lives in `src/utils/taskVisibility.js` and is applied
   at the store boundary in `useFirestore.js`. **This is not authorization** —
   the documents still reach the browser — and it is removed at COH-006's reader
   cutover so the constrained queries are the single enforcement path.

3. **The known-failing production spec (M-2) is skipped, not left red.**
   `e2e/authenticated/private-visibility-listener.spec.js` asserts the desired
   behaviour and therefore fails by design, in the default `authenticated`
   project. A permanently red suite hides real regressions, so it carries
   `test.skip` plus a note naming DEC-2026-009 and COH-006. COH-006 rewrites the
   spec (review finding M-1: every error is stringified and a listener timeout
   leaves the leak flag false, so infrastructure failure can pass green) and
   removes the skip.

**Additional finding recorded here (C-1), found while verifying the review and
not present in it.** `gatherAttentionSignals` (`functions/index.js`) reads the
entire `workItems` collection with the Admin SDK and passes overdue task titles
into the weekly attention digest (`functions/lib/attention.js` `buildDigestSignals`
→ `examples`), which is emailed to church admins and sent to the Claude API.
Cloud Functions bypass Firestore rules, so COH-006's rules and client work do not
close this path. It is opt-in per church (`config/settings.attentionDigestEnabled`),
so live exposure may currently be zero, but the promise is the same one. COH-006
excludes private and shared tasks from the digest; the digest is one payload for
all admins, so per-recipient filtering does not apply.

### DEC-2026-011 — Claude implements, Codex reviews

- Date: 2026-08-31
- Status: Accepted
- Deciders: Product owner
- Related tasks/docs: `AGENTS.md` (Agent Coordination, Direct handoff to Codex),
  `docs/AI-WORKBOARD.md`, COH-006

**Decision.** The standing division of labour between the two agents is
inverted. Claude is the implementation owner; Codex is the reviewer. Codex
reviews the plan before implementation begins and reviews the implementation
before it reaches the product owner. Individual workboard entries may still
assign otherwise, but this is the default, and COH-006 is reassigned to Claude
under it.

**Why.** Two reasons, one about capability and one about evidence.

1. Codex's non-interactive entry point (`codex exec`) defaults to a read-only
   sandbox. When it was handed COH-006 to implement on 2026-08-31 it accepted
   the plan, then stopped: it could not fast-forward its own branch, let alone
   write code. `-s workspace-write` fixes the invocation, but the episode makes
   the asymmetry plain — Claude runs continuously in a worktree with write
   access, the emulators, the Firebase CLI, and the deploy practice the product
   owner has already established, and Codex does not.
2. The review pass is where Codex has been most valuable. Its COH-006
   pre-implementation review produced seven findings, all of which survived
   verification against the code, including two the implementation plan would
   otherwise have shipped without: a self-grant path through the update rule and
   comment exposure under private tasks. Spending that capability on review of
   every plan is a better use of it than alternating implementation ownership.

**What does not change.** The reviewer still does not modify the
implementation. Consequential decisions still go in this file. Handoffs still
use `docs/AI-HANDOFF-TEMPLATE.md`. Codex still has no deploy, migration, or
production-data authorization. The direct-handoff grant remains Claude-only and
one-directional; its budget becomes one invocation per handoff, which under this
decision is normally twice per task rather than once.

**Residual risk, recorded deliberately.** One agent now writes nearly all the
code, so a blind spot in Claude's implementation is caught only by review, not by
a second implementer's independent approach. Reviews must therefore be run
against real behaviour — the reviewer verification worktree, the emulators, the
tests — rather than by reading the diff.
