# COH-006 Gate 4 Implementation Review

## Review target and evidence boundary

- Task: COH-006 — enforce private and shared task visibility, Gate 4 of 4
- Candidate reviewed: `2711ff41e311bc42821f5b60db8f782be2fdb2f3`
- Candidate branch: `origin/claude/coh-006-gate-4`
- Base: `69e7390912a46e5b17efc4c712aa2dc178104c38` (`origin/main`)
- Approved plan: `3e7aad5` on `codex/gate4-plan`
- Reviewer: Codex
- Date: 2026-09-03

The clone was clean and detached at the requested candidate before this review.
I reviewed the complete rules diff, the 32 new rules tests, all five Gate-3
queries, the current client write paths, DEC-2026-008 through DEC-2026-014, and
the prior COH-006 reviews. I did not access production, deploy, mutate data, or
run a production probe.

## Verdict

**Changes requested before Gate 4 is deployed. The rule logic that closes the
leak is approved; the release package and its regression coverage are not yet
complete.**

The final read predicate is the predicate the approved plan specified. Update
authorization is correctly evaluated from `resource.data`, and comment access
is correctly made a conjunction of parent access and the existing
author/moderator condition. I found no rule arm that restores the shared-task
leak, no role-based read/update/comment bypass, and no mismatch between the five
deployed query shapes and the final predicate.

The blockers are narrower: the new suite does not execute the five query shapes
whose compatibility is load-bearing, several explicitly required adversarial
cases were compressed or omitted, and the candidate leaves the Help Centre
publishing the pre-fix warning. I also found one current-client cleanup write
that the final update boundary will newly reject for shared tasks. None should
be fixed by loosening `canSeeWorkItem`.

## Findings

### H-1 — The rules suite does not test any of the five Gate-3 list queries

The approved plan required direct gets **and every Gate-3 list shape**. The new
file imports `collection`/`getDocs`, but work-item reads at lines 56–131 are all
`getDoc`; `getDocs` is used only for comments. Therefore the reported 75/75 run
does not establish that the final rules admit the deployed reader:

1. `type == 'maintenance'`
2. `visibility == 'team'`
3. `createdBy == uid`
4. `assigneeUids array-contains uid`
5. `visibility == 'shared'` plus `sharedWithUids array-contains uid`

Static review says each query maps exactly to one predicate arm and should be
admitted. That is not an adequate substitute here: query/rule compatibility was
the source of earlier COH-006 plan defects, and Gate 3 deliberately treats one
failed listener as an incomplete, unusable store.

Add this exact fixture/assertion shape (names may change): seed one maintenance
item, one team task, one task created by `teamMember`, one private task with
`teamMember` in `assigneeUids`, one shared task with `teamMember` in
`sharedWithUids`, and one private task carrying `teamMember` only in
`sharedWithUids`. As `teamMember`, run the five queries above and assert the
exact returned IDs are respectively:

```text
maintenance -> [mnt_1]
team        -> [task_team]
own         -> [task_own]
assigned    -> [task_assigned]
shared      -> [task_shared]
```

The private stale-recipient task must not appear in the shared result. Assert an
exact `permission-denied` for direct unauthorized operations rather than using
only `assertFails`; the approved plan called out exact codes so a missing
fixture or unrelated failure cannot satisfy the security assertion. Keep the
emulator fail-open caveat: positive list results are compatibility regression
coverage, not containment evidence.

### M-1 — The 32 tests weaken several explicit Gate-4 assertions

The core actor-split direct-get cases are good, including malformed projection
types, the missing-visibility removal, no admin override, and revocation of
comment access. The translation is nevertheless incomplete:

- Inactive and cross-tenant users are tested only against the team and assignee
  arms, not every otherwise-positive arm.
- The admin self-grant test covers only a private task and one operation per
  projection; the plan required private and shared tasks, self and third-party
  grants, through both projections.
- Authorized widening does not exercise both projections independently for the
  creator, recipient, and assignee actor classes.
- Result validation never deletes either projection or `visibility`; `null` is
  covered, but omission requires `deleteField()`.
- Comment positive list coverage is absent. The two negative list calls do not
  assert an exact error code, and the seeded collections contain only one
  comment rather than the required exact multi-document result.
- Maintenance comment creation/list, creator/recipient positive create/list,
  successful author delete, missing-parent update/delete, and several
  inactive/cross-tenant comment operations are not exercised.
- The former team member revocation case omits delete; the assignee revocation
  case supplies that assertion, but the plan intentionally required the paths
  separately.

These are test findings, not evidence that the corresponding rule branches are
wrong. The implementation owner should integrate and run the missing cases.
At minimum, add `deleteField()` denials for both projections and visibility;
exact two-comment list assertions for maintenance, team, creator, assignee, and
recipient; exact `permission-denied` comment list/create/update/delete cases for
an unlisted member and a missing parent; and the omitted widening matrix.

### M-2 — Gate 4 still publishes the pre-fix Help Centre warning and omits its required records

The candidate changes only `firestore.rules` and the new test file. At
`src/pages/HelpPage.jsx:804`, the product still says visibility is not a
security boundary, that underlying task data is sent to every member, and that
comments are readable by any member. Those statements become false when these
rules deploy. The approved Gate-4 contract also requires the DEC-2026-012
wording: anyone who can see a private or shared task may add others.

Update that Help section in the Gate-4 client release. Do not claim that the
generic activity-log row identifies who was added. Also update the final-rule
summary in `docs/DATA_MODEL.md`, the COH-006 workboard status, and provide the
SHA-pinned handoff required by `AGENTS.md`; no Gate-4 handoff exists in this
candidate. The approved ordering remains sound: close the server exposure
first, then publish the corrected client wording immediately, so the capability
is never advertised before enforcement.

### M-3 — Final preauthorization newly prevents some shared-task backlink cleanup

The current client has three best-effort direct task updates outside
`updateTask`: deleting a maintenance ticket clears `linkedTicketDocId`
(`src/useFirestore.js:751–759`), and deleting one or a series of Jobs clears
`linkedJobDocId` (`src/useFirestore.js:1269–1277`, `1334–1343`). An
admin/manager can legitimately delete the linked ticket/job without being the
creator, assignee, or recipient of the linked task. For a `shared` task that
actor's cleanup update was allowed by the transitional rule; the final rule
denies it. The rejection is swallowed by design, leaving a stale backlink.

This does **not** justify a role override in `canSeeWorkItem`: allowing an actor
who cannot read a task to update it would reopen the boundary the rule is meant
to enforce. Test the case explicitly by seeding a shared task with a backlink
and no relationship to `boss`, then asserting `boss` receives
`permission-denied` when clearing it. Resolve the client/data-integrity behavior
separately—through an authorized server operation, or record the newly enlarged
best-effort-cleanup residual with an owner-approved disposition. Private-task
cleanup already had this limitation; Gate 4 extends it to shared tasks.

## Answers to the requested review questions

### 1. Rule translation and the private-assignee widening case

The **rule implementation** discharges the planned read, update, and comment
semantics. Reusing one predicate is the right coupling. Neither update nor
comments should admit an actor the read rule does not admit; pre-state read
authorization is precisely what blocks an outsider self-grant and makes comment
revocation immediate.

The case at `coh006-visibility.test.mjs:169–170` is genuinely and deliberately
allowed. An assignee already passes `canSeeWorkItem(resource.data)` on the
private pre-state; visibility is unchanged; immutable fields survive the merged
update; both resulting projections remain lists. Adding `third` only to
`sharedWithUids` does **not** let `third` read while visibility remains
`private`. It is a dormant canonical recipient entry until an actor separately
authorized to change visibility makes the task `shared`. If the assignee adds
`third` to `assigneeUids`, `third` can read immediately at any visibility.

The **test translation** did weaken the approved matrix, as H-1/M-1 detail.

### 2. Gate-3 query compatibility

I found no incompatible shape:

| Gate-3 query | Final-rule proof arm |
|---|---|
| `type == 'maintenance'` | `d.type == 'maintenance'` |
| `visibility == 'team'` | `d.visibility == 'team'` |
| `createdBy == uid` | `d.createdBy == request.auth.uid` |
| `assigneeUids array-contains uid` | list-typed assignee membership |
| `visibility == 'shared'` + `sharedWithUids array-contains uid` | shared visibility plus list-typed recipient membership |

All five are additionally bounded by `isMember(churchId)`. The shared query's
visibility equality is essential and present. This conclusion is static review;
the missing emulator query cases must be added, and post-deploy production
verification remains the authoritative behavior check.

### 3. Current-client update compatibility

`updateTask` itself is compatible for backfilled/current documents. Firestore
evaluates its partial `updateDoc` as a complete merged
`request.resource.data`; stripping `taskNumber`, `createdBy`, and `createdAt`
from the patch preserves rather than removes them, and changing either object
array derives the corresponding UID projection. Reorder, checklist, photos,
status, bulk assignment, and linked-job writes all retain the required fields
and are made only for tasks delivered to the actor.

The exception is M-3's best-effort backlink cleanup, which can target a task by
ID learned from a linked ticket/job even when the deleting admin cannot read
that task. The denial is correct for security but is a real cleanup regression
for shared tasks and should be disclosed or redesigned.

### 4. Comment attribution residual

Recording rather than fixing comment `authorId`, `authorName`, `createdAt`, and
`updatedAt` spoofing is the correct disposition for COH-006. The accepted scope
is parent-content confidentiality; attribution integrity is a separate policy
decision. The rules comment accurately avoids claiming it is fixed. Keep the
residual in the handoff/backlog and do not describe parent gating as comment
integrity hardening.

## Reviewer verification

```text
npm run test:unit — passed, 130/130
npm run lint — passed, 0 errors and 50 existing warnings
npm run build — passed; Vite, prerender, and verify-prod-bundle clean
git diff --check 69e7390..2711ff4 — passed
npm run test:rules — not run; Firebase emulator ports cannot bind in this sandbox
production probes / final --verify --baseline 90 — not run; no production access used
```

The implementation owner's reported 75/75 emulator rules result remains
unreproduced by this reviewer. The final read-only projection verification is
still required immediately before rules deploy, followed by the approved
post-deploy two-account query, direct-read, old-client denial, and comment
matrix. I did not push this review branch.
