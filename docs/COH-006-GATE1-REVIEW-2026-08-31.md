# COH-006 Gate 1 Implementation Review

## Review target

- Branch: `claude/coh-006-task-visibility`
- Reviewed tip: `b222240`
- Base: `9c16b35`
- Implementation commits: `ae7b04f`, `c01bb7f`, `2ca5e84`
- Handoff: `docs/COH-006-GATE1-HANDOFF-2026-08-31.md` at `b222240`
- Reviewer: Codex
- Date: 2026-08-31

## Verdict

**Changes requested.** The projection writers and digest fix are sound, and I
found no omitted live task-creation path. Gate 1 is not ready to deploy as
handed off because the planned shared-recipient query is not compatible with
the transitional rule unless it also constrains `visibility == 'shared'`.
That invalidates the recorded single-constraint/index expectation and the claim
that the transitional rule already admits every Gate-3 query. There is also one
premature Help Centre promise and one low-severity type-hardening gap.

## Findings

### High — H-1: the shared-recipient listener needs a visibility constraint, changing the index plan

The workboard plans a single-constraint listener:

```js
where('sharedWithUids', 'array-contains', uid)
```

and says no composite index is expected (`docs/AI-WORKBOARD.md:129-139`). The
Gate-1 transitional rule, however, has no `sharedWithUids` authorization arm. It
admits shared tasks because `resource.data.visibility == 'shared'`
(`firestore.rules:228-234`). A query constrained only by `sharedWithUids` does
not prove that predicate: it can match a private task whose canonical
`sharedWithUids` contains the caller, while `canSeeTask()` deliberately grants a
shared recipient only when `visibility === 'shared'`
(`src/utils/taskVisibility.js:15-24`). Firestore evaluates a query against its
potential result set; it is not sufficient that supported UI writers normally
clear `sharedWith` when changing away from Shared.

This means the planned listener is not a safely rule-compatible Gate-3 query.
The compatible shape is at least:

```js
query(
  workItemsRef,
  where('visibility', '==', 'shared'),
  where('sharedWithUids', 'array-contains', uid),
)
```

That is no longer a single-constraint query. The index expectation must be
re-evaluated, and the safest Gate-1 rollout is to declare the corresponding
collection-scope composite index (`visibility` ascending plus
`sharedWithUids` array-contains) and retain the planned post-deploy probe.
Firebase documents automatic single-field indexing, but recommends a composite
index when an array-membership clause is combined with additional clauses:
<https://firebase.google.com/docs/firestore/query-data/index-overview#use_index_merging>.

Do not solve this by making `sharedWithUids` authorize a private task
independently of visibility unless the owner deliberately changes the product
semantics. The accepted predicate still says Private is creator plus assignees,
while Shared additionally admits selected recipients.

Required change:

1. Amend the Gate-3 shared query to include `visibility == 'shared'`.
2. Add/provision the matching index in Gate 1 (or demonstrate with an emulator
   and the authorized production probe that index merging is intentionally
   sufficient), and update the workboard's index statement.
3. Add a transition test proving that this exact two-constraint listener is
   admitted by the transitional rules and excludes a private document carrying
   the caller in `sharedWithUids`.

### Medium — M-1: Gate 1 publishes a sharing capability that does not exist until the final gate

`src/pages/HelpPage.jsx:804` says any viewer of a private or shared task can add
other people. At Gate 1, the UI still exposes visibility/share controls only to
the creator or an admin/manager (`src/pages/hubs/WorkBoard.jsx:1761-1762` and
`:2314-2317`). The transitional update rule also still rejects a private
assignee's update because its pre-state visibility is private and the assignee
is not the creator (`firestore.rules:241-260`).

DEC-2026-012 approves this collaboration policy for the final state, but its own
wording begins, “Once `assigneeUids` and `sharedWithUids` become authoritative.”
They are not authoritative in Gate 1. Remove or future-qualify this sentence in
Gate 1, then publish the definitive wording when the Gate-4 UI and rule behavior
actually support it. At that later gate, verify that the activity-log event is
specific enough to substantiate “records it”; the current `updateTask` log is a
generic `update_task` event without the added recipient in its details.

### Low — L-1: the transitional assignee arm does not require a list

The rule guard at `firestore.rules:234` checks only that `assigneeUids` exists
before applying `uid in assigneeUids`. In Firestore Rules, `in` also tests map
keys. A malformed map such as `{ memberB: true }` can therefore authorize a
direct get even though the planned `array-contains` listener cannot deliver that
document. String or numeric malformed values fail closed through rule evaluation,
but a map does not.

The supported writers create lists, and Gate 4 is already planned to enforce
list types on create, so this is not an outsider self-grant. It is still a
transitional mismatch between direct-get and query authorization. Add
`resource.data.assigneeUids is list` to the arm and add absent, empty-list, and
malformed-map coverage.

## Requested challenges

### 1. Writer completeness

The claim is supported for live product behavior. I traced these creation paths:

- New Task modal -> `addItem` adapter -> `addTask`
- completion-triggered recurrence -> `addItem` adapter -> `addTask`
- paste import -> `addTask`
- Kanban quick add -> `addTask`
- template use -> pre-fills the New Task form -> `addTask`
- reservation-created setup task -> `addTask`
- Job-to-Task conversion -> `addTask`
- scheduled recurring-template generation -> the single Admin SDK transaction
  in `generateRecurringTemplateTasks`

`addTask` derives both projections at `src/useFirestore.js:731-743`, and
`updateTask` re-derives a projection whenever its corresponding object array is
present at `src/useFirestore.js:756-769`. The scheduled generator derives both
at `functions/index.js:3513-3532`. Direct task updates outside `updateTask`
change only unrelated fields (`sortOrder`, link back-references, reminder
stamps, and recurrence markers); none mutates assignees or sharing.

Two repository utilities write `workItems` directly: the already-completed Work
unification migration and `scripts/seed-emulator.mjs`. Neither is a live product
creation path. The current emulator seed creates only `visibility:'team'` tasks,
so Gate 3's team listener will still deliver them despite missing projections.
It would nevertheless be useful to update that seed when Gate 3 lands so local
fixtures model the final schema.

No missing live writer was found that would silently strand a legitimate
recipient at Gate 3.

### 2. Query/index expectation

The expectation is wrong as currently written. Four proposed listeners are
genuinely single-constraint (`type == 'maintenance'`, `visibility == 'team'`,
`createdBy == uid`, and `assigneeUids array-contains uid`). The
shared-recipient listener needs both `visibility == 'shared'` and
`sharedWithUids array-contains uid` to match the accepted visibility predicate
and to be provably safe under the transitional rule. Treat it as a compound
query and provision/probe its index before Gate 3.

## Other reviewed areas

- **Digest filtering:** sound. `gatherAttentionSignals` filters task input
  before `buildDigestSignals`; counts, examples, the Claude prompt, the cached
  payload, the admin callable, and the weekly email all flow through that one
  path. No separate cache reader was found. Both empty and non-empty payloads
  carry `DIGEST_POLICY_VERSION`, and an unversioned/old-version same-week cache
  misses.
- **Projection semantics:** dedupe, sort, and missing-entry behavior are
  consistent between the client and server implementations for supported UI
  data. `uidsOf()` accepts any truthy non-string `uid`, despite the documented
  `string[]` shape; current selectors supply Firestore UID strings, and Gate 4's
  rule validation should make the list shape explicit.
- **Tenant boundary:** the additive assignee rule remains inside
  `isMember(churchId)`. The new arm does not cross churches.

## Verification

- `npm run test:unit` against an archive export of exactly `b222240`: **118 pass,
  0 fail**.
- `npm run test:rules` against the same export: **not executed**. Firebase Emulator
  Suite startup failed before tests because this managed sandbox forbids local
  socket binding (`EPERM` on ports 4400, 4500, 8080, 9150, and 9199). This is an
  environment limitation, not a failing assertion. The handoff reports the
  implementation owner's run as **38 pass, 0 fail**, but I could not independently
  reproduce it here.
- No production E2E, deploy, production read, or production write was performed.

