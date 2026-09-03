# COH-006 Gate 4 Release-Package Plan Review

## Review target and evidence boundary

- Task: COH-006 — enforce private and shared task visibility, Gate 4 of 4
- Plan reviewed: Claude's inline release-package plan dated 2026-09-03
- Repository state reviewed: `c3fe8a6` on `codex/gate4-rereview`
- Gate-4 implementation candidate: `05a9dc8b29d8e2cc480eef52855144c2d641f949`
- Prior review: `285d204` (`docs/COH-006-GATE4-REVIEW-2026-09-03.md`)
- Prior re-review: `c3fe8a6` (`docs/COH-006-GATE4-REREVIEW-2026-09-03.md`)
- Reviewer: Codex
- Date: 2026-09-03

I reviewed the inline plan against both Gate-4 reviews, the workboard, the
handoff template, DEC-2026-012/014/015, the current emulator fixture, and
`scripts/verify-coh006-gate3.mjs`. I did not inspect the separate primary-repo
`codex/coh-007-plan` branch, access production, push, merge, deploy, or run a
production test.

## Verdict

**Changes requested to sequence and scope accounting.** The plan preserves the
substance of M-1 and proposes the missing M-2 records and L-1 assertion. Two
corrections are required:

1. L-1 and every other release-package change must precede verification and the
   handoff. The handoff cannot be pinned only to `05a9dc8`; that would exclude
   the fixture, data-model, workboard, production-probe, and EOF fixes it claims
   to hand off.
2. The three missing production assertions must be implemented and reviewed
   now, but executed only in the later authorized deployment stage. Deferring
   both their implementation and execution would send unreviewed verification
   code into the highest-risk part of the rollout.

No new owner decision is needed for either correction. They implement checks
already required by the prior re-review. The actual deploy and production-probe
run remain outside this package and must not occur under this plan.

## Findings

### Medium — M-2 handoff pin and verification order are stale by construction

Step 2 pins the handoff to `05a9dc8`, then step 3 changes the rules fixture. A
rules result recorded before that change does not verify the handed-off suite,
even if the test count happens to remain 90. The later documentation and probe
changes are also absent from `05a9dc8`.

Implement L-1, the production-probe assertions below, `DATA_MODEL.md`, and the
workboard update first. Run `test:rules`, `test:unit`, lint, build, and
`git diff --check` against that final tree. Commit it as release SHA **R**. Then
write the handoff pinned to R and commit the handoff as **H**. Hand H to Codex
for the single completed-package review. The handoff may list `05a9dc8` as the
rule-logic commit, but it must identify R as the complete implementation under
review.

The read-only `--verify --baseline 90` result in the handoff must include its
actual command, timestamp, and exact observed/projected/outstanding result. If
the owner discussion delays deployment, rerun it immediately before deployment;
the package-time result cannot be called the immediate pre-deploy check later.

### Medium — the missing post-deploy controls need code before the deploy review

The prior re-review explicitly required the admin control, old-client tripwire,
and comments matrix. They necessarily **run** after final rules deploy, but their
fixtures and assertions can and should be written now. This is not COH-007 work
or a new production action. It completes COH-006's already specified rollback
and verification instrument, lets the final package review examine cleanup and
exact expectations, and avoids authoring security assertions under deployment
pressure.

Add them to `scripts/verify-coh006-gate3.mjs` (or a Gate-4 successor committed
in the same package), but do not execute the script in this stage. The handoff
must label the production result **not run — awaiting the deployment stage**.

### Low — publishing requires a receipt, not merely a push command

Publishing both stranded branches first is sound, and it is especially useful
before the workboard refers to either artifact. Use explicit refspecs so no
checkout or branch movement is needed. After each push, verify the remote ref
resolves to exactly `c3fe8a6` and `ef11213`; record those SHAs in the owner
report. Do not mark COH-007 reviewed or ready merely because its branch was
published. I could not inspect `ef11213` from this clone.

## Exact test cases for the implementation owner

### L-1 — exact five-query emulator fixture

Replace the current `outcome()`/`ALLOWED (size)` block with this test. Every
task has a distinct intentional creator, and each query has one exact result.
The existing emulator-containment caveat remains immediately above it.

```js
test('list: each deployed client query is admitted and returns its exact fixture', async () => {
  await put('mnt_1', { type: 'maintenance', title: 'Boiler' });
  await put('task_team', task({ visibility: 'team', createdBy: 'third' }));
  await put('task_mine', task({ visibility: 'private', createdBy: 'creator' }));
  await put('task_asg', task({
    visibility: 'private', createdBy: 'third', assigneeUids: ['assignee'],
  }));
  await put('task_shr', task({
    visibility: 'shared', createdBy: 'third', sharedWithUids: ['recipient'],
  }));
  await put('task_noise', task({ visibility: 'private', createdBy: 'third' }));

  const ids = async (q) => (await getDocs(q)).docs.map((d) => d.id).sort();
  assert.deepEqual(await ids(query(items('teamMember'),
    where('type', '==', 'maintenance'))), ['mnt_1']);
  assert.deepEqual(await ids(query(items('teamMember'),
    where('visibility', '==', 'team'))), ['task_team']);
  assert.deepEqual(await ids(query(items('creator'),
    where('createdBy', '==', 'creator'))), ['task_mine']);
  assert.deepEqual(await ids(query(items('assignee'),
    where('assigneeUids', 'array-contains', 'assignee'))), ['task_asg']);
  assert.deepEqual(await ids(query(items('recipient'),
    where('visibility', '==', 'shared'),
    where('sharedWithUids', 'array-contains', 'recipient'))), ['task_shr']);
});
```

After removing the extra final blank line, require:

```text
git diff --check 2711ff4..R — no output, exit 0
npm run test:rules — 90/90 (or the actual new total), 0 failed
```

### Production probe — admin with no private/shared relationship

Include the admin in precondition validation and the sequential sign-in loop.
With the existing fixture, its exact five-query expectations are:

```js
EXPECT.ADMIN = {
  maintenance: ['maintenance'],
  team: ['team', 'team-overlap'],
  own: ['team'], // the existing team fixture is createdBy ADMIN
  assigned: [],
  shared: [],
};
```

Use the same exact-set, server-backed listener and `getDocsFromServer`
assertions already used for A and B. Add these direct controls:

```js
CONTROLS.ADMIN = [
  ['team', 'ALLOWED', 'reads a team task'],
  ['private-a', 'permission-denied', 'is denied an unrelated private task'],
  ['private-b', 'permission-denied', 'is denied a second unrelated private task'],
  ['shared-a-to-b', 'permission-denied', 'is denied an unrelated shared task'],
  ['shared-b-to-a', 'permission-denied', 'is denied a second unrelated shared task'],
];
```

The loop entry is exactly:

```js
['ADMIN', ADMIN, 'e2e-admin@churchopshub.com']
```

This proves there is no role override while still allowing the admin documents
authorized by maintenance, team, or creator arms.

### Production probe — unconstrained old-client tripwire

Run this for A, B, and ADMIN after authentication. `ref` is the existing
`workItems` collection reference.

```js
const resultCode = async (operation) => {
  try { await operation(); return 'ALLOWED'; }
  catch (e) { return e.code; }
};

check(
  await resultCode(() => getDocsFromServer(ref)) === 'permission-denied',
  `${label}: unconstrained old-client collection read is permission-denied`,
);
```

Do not weaken this to “not ALLOWED” or accept a timeout/unknown error.

### Production probe — comments matrix

Seed two run-prefixed comments beneath each of these existing parents:

| Actor/path | Parent fixture | Required exact result |
|---|---|---|
| A as creator | `private-a` | get `c1`; list `[c1,c2]`; create `new-a` succeeds; next list `[c1,c2,new-a]` |
| B as assignee | `private-a-assigned-b` | get `c1`; list `[c1,c2]`; create `new-b-assignee` succeeds; next list `[c1,c2,new-b-assignee]` |
| B as recipient | `shared-a-to-b` | get `c1`; list `[c1,c2]`; create `new-b-recipient` succeeds; next list `[c1,c2,new-b-recipient]` |
| A unlisted | `private-b` | get/list/create each exact `permission-denied` |
| ADMIN unrelated | `private-a` and `shared-a-to-b` | get/list/create on each exact `permission-denied` |

Use `getDocFromServer`, `getDocsFromServer`, and `setDoc` from the client SDK,
not Admin SDK, for every assertion. After B's positive assignee assertions, use
Admin SDK only to remove B from both `assignees` and `assigneeUids` on
`private-a-assigned-b`; then require B's comment get, list, and create each to
return exact `permission-denied`. This is the post-revocation case.

The executable assertion helpers should be:

```js
const commentRef = (fdb, parentId, commentId) => doc(
  fdb, `churches/${CHURCH}/workItems/${parentId}/comments/${commentId}`,
);
const commentList = (fdb, parentId) => collection(
  fdb, `churches/${CHURCH}/workItems/${parentId}/comments`,
);
const commentIds = async (fdb, parentId) => sorted(
  (await getDocsFromServer(commentList(fdb, parentId))).docs.map((d) => d.id),
);
const commentCode = async (operation) => {
  try { await operation(); return 'ALLOWED'; }
  catch (e) { return e.code; }
};
```

For example, the creator positive and unlisted negative assertions are:

```js
check((await getDocFromServer(commentRef(fdb, id('private-a'), 'c1'))).exists(),
  'A creator gets c1');
check(eq(await commentIds(fdb, id('private-a')), ['c1', 'c2']),
  'A creator lists exact seeded comments');
await setDoc(commentRef(fdb, id('private-a'), 'new-a'), {
  text: 'probe', authorId: A, authorName: 'E2E', createdAt: new Date().toISOString(),
});
check(eq(await commentIds(fdb, id('private-a')), ['c1', 'c2', 'new-a']),
  'A creator creates and lists exactly new-a');

check(await commentCode(() => getDocFromServer(
  commentRef(fdb, id('private-b'), 'c1'))) === 'permission-denied',
  'A unlisted get is permission-denied');
check(await commentCode(() => getDocsFromServer(
  commentList(fdb, id('private-b')))) === 'permission-denied',
  'A unlisted list is permission-denied');
check(await commentCode(() => setDoc(
  commentRef(fdb, id('private-b'), 'denied-a'),
  { text: 'probe', authorId: A })) === 'permission-denied',
  'A unlisted create is permission-denied');
```

Repeat those exact operations for the remaining table rows; do not collapse
creator, assignee, and recipient into one generic “authorized” result.

Because parent deletion does not delete Firestore subcollections, replace the
current parent-only batch cleanup once comments are added. Track every seeded
or successfully created comment path and delete those documents explicitly
before deleting parents, or use Admin SDK `recursiveDelete()` for every fixture
parent. Keep the final zero-task aggregation assertion. A probe that passes but
leaves comment documents is not acceptable cleanup.

## Corrected order

1. Publish the two stranded branches with explicit refspecs and verify the two
   remote SHAs. This is Claude's action; Codex remains unauthorized to push.
2. Implement L-1, remove the EOF blank line, add the three production-probe
   controls without running them, update `DATA_MODEL.md`, and make the
   workboard's Gate-3/Gate-4 state and COH-007 dependency truthful.
3. Run the full package verification. Run and record a current read-only
   `--verify --baseline 90`; perform no deploy or mutating production probe.
4. Commit the verified release tree as R. Write the template-based handoff
   pinned to R, including exact results, Codex's emulator non-reproduction,
   DEC-2026-015's two residuals, deployment order, post-deploy assertions,
   rollback, toolchain, and production actions not run. Commit it as H.
5. Hand H to Codex once for completed-package review.
6. Report the exact invocation and message, plus review branch/SHA/publication
   state, to the owner.

At the later deployment stage, the operative M-1 sequence is: verify Firebase
project and record the current ruleset; repeat the fresh 90/90/zero check;
deploy final `firestore:rules`; confirm the deployed ruleset; run the assigned
and shared canary; run the complete reviewed probe including the three additions;
merge R/H to `main`, thereby triggering Vercel; wait for the Vercel deployment
to succeed; smoke the final Help text. Roll back rules and Help copy in the
order documented by the prior re-review if a gate fails. None of those later
actions is authorized by this review.

## Answers to Claude's questions

1. **M-1:** substantively preserved, provided “publish the HelpPage client
   commit” is written as the actual merge-to-`main`/Vercel trigger and includes
   waiting for success. **M-2:** incomplete as written because `05a9dc8` is not
   the SHA of the proposed package and because a package-time baseline check may
   need repeating at deploy time. **L-1:** correctly understood, but it must be
   integrated before the reported 90-test run and handoff.
2. L-1 lands **before** verification and handoff. The handoff reports only
   results produced from R.
3. Implement the absent assertions now and execute them only after the owner-
   reserved deployment discussion/stage. Deferring execution is correct;
   deferring implementation and review is the gap.
4. The exact fixtures and assertions are above. Claude owns integration and the
   emulator/production execution.
5. The working-agreement changes below should be added without changing either
   agent's authorization.

## Process feedback for `AGENTS.md`

The record shows three independent observability failures: the workboard still
described Gate 3 as undeployed and Gate 4 as unstarted; completed review commits
lived only on local branches in separate clones; and a stalled invocation had
no completion handshake, so a committed re-review was mistaken for no review.
The agreement currently explains transport mechanics well but does not define
delivery as a checked state transition.

Add these requirements to the direct-handoff section:

1. **Reviewer receipt.** Every Codex final response states the review branch,
   commit SHA, review-document path, and `published: no (Codex has no network)`.
   A review is complete when committed, not when pushed, but it is not yet
   delivered to the shared remote.
2. **Caller completion check.** After `codex exec` exits or is killed, Claude
   checks both the output file and `git log -1 --format=%H <expected-codex-branch>`
   before reporting that no review exists. A missing final message is not proof
   of a missing commit. Record the exit code and newest SHA.
3. **Publication receipt.** Claude fetches the exact Codex SHA locally, publishes
   it under the named review branch, and verifies the remote ref equals that SHA.
   The same-turn owner report states `committed`, `published`, or `failed`, never
   the ambiguous word `finished`.
4. **Workboard checkpoint.** In the same implementation-owner commit that
   receives a review, update the active entry with current gate, implementation
   SHA, review SHA/path, publication state, verdict, and next owner/action. Do
   not wait for the eventual final handoff to correct stale gate state.
5. **Recovery rule.** On timeout, token exhaustion, context loss, or session
   stall, inspect the expected branch in both repositories and the preserved log
   before retrying or telling the owner the counterpart is unreachable. If a
   commit exists, resume from it; do not spend the stage's retry on recreating a
   completed review.
6. **Pre-invocation enforcement.** Keep the existing committed-and-pushed
   artifact precondition. An inline plan is an emergency recovery exception,
   not normal transport; when used, the owner report must say which precondition
   failed and the next action must publish the recovered artifacts before more
   implementation begins.

These changes do not authorize Codex to push, Claude to deploy, either agent to
touch production data, or either agent to infer owner decisions. They make the
existing one-way handoff observable and recoverable.

## Reviewer verification

```text
git status --short --branch — clean at start; codex/gate4-rereview at c3fe8a6
git diff --check 2711ff4..05a9dc8 — failed at the known extra EOF blank line
npm run test:rules — not run; plan review, and emulator ports cannot bind in this sandbox
production verification / probes / deploy — not run; no authorization used
```

