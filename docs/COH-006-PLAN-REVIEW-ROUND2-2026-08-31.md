# COH-006 Plan Review — Round 2

- Date: 2026-08-31
- Reviewer: Codex
- Target: `main` at `9c16b35`
- Task: COH-006 — Enforce private and shared task visibility
- Outcome: **Plan changes required before implementation**

## Scope reviewed

This review covers the amended COH-006 workboard entry, DEC-2026-008 through
DEC-2026-011, the interim changes in `9c0f862`, and the current task read/update,
comment, client-store, attention-digest, and regression-test paths.

The amended plan incorporates the seven first-round findings and C-1
substantively. The H-1 and H-2 mechanisms are sound for the specific bypasses
they target, and excluding private/shared tasks from the common admin digest is
the right policy. Two rollout compatibility gaps and one cache invalidation gap
still need to be made explicit before implementation starts.

## Findings

### H-1 — Gate 3's assigned-to-me query is not compatible with the rules planned to remain live until gate 4

The four-gate order says the client switches to the new team / own / shared /
assigned query set at gate 3, while the visibility rules are not deployed until
gate 4. The current repository rule at `firestore.rules:211-218` authorizes a
private task only to its creator. It does not authorize an assignee.

Therefore the new assigned-to-me listener cannot be assumed to work for a
non-creator's private assigned task during the gate-3-to-gate-4 interval. A
direct read of that shape is denied by the current rule, and the production
behavior of broader list queries cannot safely be used as a compatibility
mechanism—DEC-2026-009 deliberately limits what was measured and treats the
cause as unproved.

Required plan change: deploy a transitional additive read rule before gate 3
(it can be included in gate 1) that admits each new constrained query while
retaining compatibility with the old unconstrained client. Gate 4 can then
remove the old broad shared/list behavior. The handoff must identify the
transitional and final rulesets separately and test the gate-3 client against
the transitional rules, not only the final rules.

### H-2 — Writers are not cut over merely because the new bundle is deployed

Gate 2 backfills documents created during the transition, but an already-open
old client can continue creating tasks without `sharedWithUids` or
`assigneeUids` after the delta validation. Once gate 3 removes the unconstrained
reader, a recipient or assignee can miss such a task. Unless the final create
rule requires the normalized visibility and both projection fields, stale
clients can continue creating this shape even after gate 4.

Required plan change:

1. Make the final task-create rule require normalized `visibility`,
   `sharedWithUids`, and `assigneeUids` with the expected list types.
2. Run the final delta check immediately before the reader cutover and define
   the maximum interval between gates 2, 3, and 4.
3. State the stale-client behavior at gate 4: old task creates will be denied
   and the user must reload, rather than silently creating documents that the
   new readers cannot deliver to recipients.
4. Include a transition test for a gate-1 writer, a pre-gate-1/stale writer,
   and the gate-3 reader.

This is not a reason to add another COH task; it is a missing compatibility
condition inside the existing four gates.

### M-1 — The H-1 proposal closes outsider self-grant, but its projection-write policy remains an owner-visible residual

Requiring the caller to be authorized from `resource.data` before evaluating
an update does close the self-grant described in the first review. A member who
is absent from the old creator/assignee/shared/team predicate cannot make an
atomic update that adds their UID, because authorization is decided from the
pre-update document rather than `request.resource.data`.

It does not break ordinary editing of team tasks: every active member is
already authorized by the old document's `visibility:'team'`. It intentionally
removes the current ability of an unrelated member to update a selected-shared
task. Depending on the exact helper and retained field guards, it also permits
an existing private assignee or selected recipient to edit operational fields;
that is broader than today's private-task update rule but consistent with
making assignees legitimate collaborators.

The proposal does not, however, keep either UID projection synchronized with
its object-array display source. An already-authorized assignee or recipient
can add another UID directly and widen access without changing the visible
`assignees`/`sharedWith` array. The plan acknowledges this, but DEC-2026-010
does not record an owner disposition accepting it, and DEC-2026-008 describes
shared readers as people the creator specifies.

Before implementation, either:

- define a narrower writer policy for the security-bearing fields (for
  example, only the creator and an already-authorized manager/admin may change
  sharing, with assignment changes following an explicitly stated policy); or
- record the owner's acceptance that any already-authorized collaborator may
  widen access and that the UID arrays, not the object arrays, are canonical
  for authorization.

The pre-state authorization check should remain in either design. Adversarial
tests should separately cover an outsider, an existing recipient, an assignee,
a creator, and a team member, rather than treating all update authority as one
case.

### M-2 — Filtering new digest inputs does not invalidate this week's cached digest

C-1 is confirmed. `gatherAttentionSignals` reads every `workItems` document
with the Admin SDK, `buildDigestSignals` puts task names in `examples`, and
`buildAttentionDigest` sends those signals to Claude. The generated summary and
items are cached at `churches/{churchId}/aiDigests/current` and reused by both
the admin callable and the weekly email for the rest of the ISO week.

Excluding both private and shared tasks outright is correct. Private tasks have
no admin override, and a shared task may authorize some admins but not others;
one cached payload emailed to all admins cannot honor recipient-specific
visibility. Team and normalized legacy-team tasks may remain.

The plan must also invalidate payloads generated under the old policy. Merely
filtering `taskData` leaves an existing same-week cache eligible at
`functions/index.js:2406-2408`. Add a digest schema/policy version to the cache
eligibility check (or an equivalent code-level forced regeneration), and deploy
the digest change before any post-cutover callable/email can reuse an old
payload. No production-data edit is required for a versioned cache miss.

The function deployment should be assigned to a gate—gate 1 is the natural
additive point—and tests should prove private/shared tasks affect neither task
counts nor examples and that an old-version cache is rebuilt.

## Designs approved as written

### Parent-gated comments

The proposed H-2 design is sound. A rules `get()` of
`churches/{churchId}/workItems/{itemId}` is deterministic for both document and
subcollection-list operations because `itemId` is fixed by the comments path.
The helper can apply the same pre-existing parent authorization predicate;
`type:'maintenance'` keeps maintenance comments member-readable. A missing
parent should fail closed.

Apply the parent predicate as an additional condition to all four operations,
preserving the existing author/admin condition for update/delete. The rules
tests should exercise get/list/create/update/delete for an unauthorized task
reader, plus the positive maintenance and authorized-task cases. Comment author
and timestamp integrity may remain the explicitly documented residual already
allowed by the amended plan.

### Removing the interim store filter at gate 3

Removing `canSeeTask()` from the store boundary at the reader cutover is correct
once all of the following are true:

- projection coverage has passed, including the final delta check;
- the transitional rules admit every new query;
- every query has produced its initial snapshot before the single work-items
  loading signal resolves; and
- the merge tracks membership per query source, so a document removed from its
  last qualifying listener is removed from the merged store rather than left in
  a deduplication cache.

Keeping the old object-array filter as a second definition of visibility would
create a new drift point once the UID arrays become authoritative. The hazard is
not removal itself; it is removing it before the projection, rules, and merged-
listener conditions above hold. The per-detail document and comment listeners
must also close cleanly on permission loss after a visibility/assignment change,
as the workboard's downstream-consumer clause already anticipates.

## Required amendments before implementation

1. Add a transitional additive rules deployment before the gate-3 reader
   cutover; distinguish it from the final restrictive gate-4 ruleset.
2. Require normalized visibility and both UID projections on final task creates,
   and define the stale-client/delta timing behavior across gates 2–4.
3. Resolve or explicitly obtain owner acceptance for already-authorized users
   widening access through authoritative projection arrays.
4. Version/invalidate the weekly attention-digest cache and place the Functions
   deployment in a named gate.

With those amendments, I would approve implementation. I found no defect in the
parent-comment `get()` design or in the decision to exclude private/shared tasks
from the common admin digest.

## Verification performed

- Confirmed `main`, `origin/main`, and `claude/coh-006-task-visibility` point to
  `9c16b35`; inspected the counterpart branch log without checking it out.
- Read `AGENTS.md`, `CLAUDE.md`, the COH-006 workboard entry, DEC-2026-008 through
  DEC-2026-011, the first-round review, the data model, and the relevant
  architecture/runbook material at the target commit.
- Traced `firestore.rules`, `src/useFirestore.js`,
  `src/utils/taskVisibility.js`, WorkBoard's detail/comment listeners and update
  UI, all named task creation paths, `gatherAttentionSignals`,
  `buildAttentionDigest`, the attention parity tests, and the skipped production
  regression spec.
- Did not implement, deploy, run production tests, or touch production data.
