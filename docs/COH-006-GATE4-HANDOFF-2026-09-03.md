# COH-006 Gate 4 — Implementation Handoff

## Task

- Task ID and title: COH-006 — enforce private and shared task visibility, gate 4 of 4
- Owner: Claude (DEC-2026-011)
- Reviewer: Codex
- Branch: `claude/coh-006-gate-4`
- Commits:
  - `2711ff4` — the restrictive rules
  - `05a9dc8` — fixes for the first review, including the `hasAny` repair
  - **`f4c890d` — the release package, and the SHA under review (R)**
- Status: **Ready for completed-package review. Not deployed.** The deploy gate
  is reserved for the product owner.

Prior review trail, all published on `origin/codex/gate4-rereview`:

| Artifact | SHA | Verdict |
|---|---|---|
| `docs/COH-006-GATE4-REVIEW-2026-09-03.md` | `285d204` | Changes requested |
| `docs/COH-006-GATE4-REREVIEW-2026-09-03.md` | `c3fe8a6` | Rules approved; release package incomplete |
| `docs/COH-006-GATE4-RELEASE-PACKAGE-PLAN-REVIEW-2026-09-03.md` | `ccefde2` | Changes requested to sequence and scope |

## Outcome

Task visibility is a server-enforced authorization boundary rather than a
client-side choice. `canSeeWorkItem()` is the single predicate for the read rule,
for update's pre-state authorization, and for comment gating. The arm that
admitted any member to `visibility == 'shared'` is gone — it is why 80 of the 90
tasks then in the live church were readable by anyone with an SDK. Comments
inherit their parent's visibility. There is no admin override anywhere.

Nothing in this package is deployed. It is the reviewable release tree.

## Changes

- **Behavior changed:** private and shared tasks, and their comments, are denied
  to actors with no creator/assignee/recipient/team relationship, including
  admins. The Help Centre no longer advertises the pre-fix behaviour.
- **Files/components changed:** `firestore.rules`;
  `functions/test/rules/coh006-visibility.test.mjs`;
  `scripts/verify-coh006-gate3.mjs`; `src/pages/HelpPage.jsx`; `CLAUDE.md`;
  `docs/DECISIONS.md`; `docs/DATA_MODEL.md`; `docs/AI-WORKBOARD.md`.
- **Data, rules, or API changes:** rules only. **No document shape changes and no
  production data mutation** are introduced by gate 4.
- **Documentation changed:** `DATA_MODEL.md` now records the final
  read/update/comment boundary and the absence of an admin override.
  `AI-WORKBOARD.md` was three gates stale and now carries the real gate 4 trail
  with every review SHA; COH-007 is queued as Proposed, blocked on this task.

### What `f4c890d` adds over `05a9dc8`

**L-1.** The five-query emulator test asserted `ALLOWED (size)`, and `task()`
defaults every fixture's creator to `creator`, so the `createdBy` arm passed on
any non-empty result. It now seeds six fixtures with distinct intentional
creators and asserts exact sorted ID sets per query. Confirmed meaningful by
deliberate break: pointing `task_noise` at `creator` fails the new assertion
(`own` returns two ids where one is expected) and would have passed the old one.

**The three absent production controls**, written but deliberately **not run**:

- *Admin with no relationship* — `EXPECT.ADMIN` plus five direct controls.
  `own` is `['team']` because the team fixture is `createdBy` ADMIN; `assigned`
  and `shared` are empty. This is the no-role-override proof the probe lacked.
- *Old-client tripwire* — the unconstrained collection read must return exact
  `permission-denied` for A, B and ADMIN. A timeout or unknown error fails.
- *Comments matrix* — creator, assignee and recipient positives with exact
  get/list/create sets; unlisted and unrelated-admin negatives; and the
  post-revocation case (Admin SDK strips B from both assignee projections, then
  B's get, list and create must each be exactly `permission-denied`). Client SDK
  for every assertion.

**Cleanup**, which had to change with them: deleting a parent does not delete its
subcollections, so the parent-only batch would have orphaned every seeded and
probe-created comment in the production tenant. Now `recursiveDelete` per fixture
parent, with the absence of orphans asserted rather than assumed.

## Decisions and Assumptions

- **Approved decisions applied:** DEC-2026-008, DEC-2026-009, DEC-2026-010,
  DEC-2026-012, DEC-2026-014, DEC-2026-015.
- **New decisions requiring owner confirmation:** none introduced by this
  package. One item needs the owner's operational confirmation rather than a new
  policy: whether merging R/H to `main` is the Vercel production trigger, which
  fixes where the Help Centre publish lands in the deploy order.
- **Assumptions made:** none load-bearing. The baseline discrepancy below is
  reported as measured, not reconciled by assumption.

## Verification

All results produced from **R = `f4c890d`**, in
`/Users/johnvaught/apps/church-inventory-claude`.

```text
npm run test:rules  — passed, 90/90, 0 failed
npm run test:unit   — passed, 130/130, 0 failed
npm run lint        — passed, 0 errors, existing warnings only
npm run build       — Vite clean; verify-prod-bundle clean (28 JS chunks, 0 jsxDEV)
                      prerender-static failed every page — the DOCUMENTED symlinked
                      node_modules artifact (AGENTS.md), which reproduces on
                      unmodified main and is NOT evidence about this change
git diff --check    — no output, exit 0 (the 2711ff4..05a9dc8 EOF blank line is fixed)
deliberate-break    — L-1 fixture fails when task_noise shares `creator`; the
                      previous size-only assertion passed that same break
```

Read-only production backfill verification, run from the primary clone because
`scripts/serviceAccountKey.json` is gitignored and absent from the worktree:

```text
node scripts/backfill-task-visibility.cjs --verify --baseline 90
UTC 2026-09-03T23:30:02Z → PRODUCTION (church-inventory-9615c)

Total across 6 church(es): 92 task(s), 0 outstanding.
  no visibility 0, assigneeUids drift 0, sharedWithUids drift 0, not a list 0
⛔ Expected 90 task(s) from --baseline, scanned 92. Population does not match.
```

**The baseline check fails, and the failure is population drift, not data
drift.** Every observed task is consistent — 0 outstanding across all six
churches. The two extra documents are in the live church
(`6cksNI9Uv8h0jXptdTESnXTXFgF3-church`) and were created 2026-09-03 at 13:20:25Z
and 13:23:08Z, both `private`, both with correct projections. They are organic
user activity since the 2026-09-02 gate 2 backfill, and their consistency is
positive evidence that the deployed gate 1 writers work.

**The baseline of 90 is a stale point-in-time count and must be re-established
immediately before deploy.** Per the re-review, this package-time result cannot
later be presented as the pre-deploy check.

**Not run, and why:**

- `npm run test:rules` remains **unreproduced by the reviewer** — Codex cannot
  bind emulator ports from `codex exec` (`EPERM` on 4400/4500/8080/9150/9199).
  The 90/90 result above is the implementation owner's alone.
- The production probe, including the three controls added here, is **not run —
  awaiting the deployment stage.**
- No deploy, no merge, no mutating production operation was performed.

Toolchain: Node v25.8.0, Firebase CLI 15.10.0.

## Risk and Rollback

- **Main risks:** the rules are the authorization boundary; a defect either
  reopens the leak or denies legitimate reads. The `hasAny` repair in `05a9dc8`
  is the sharp edge — the earlier `is list`-guarded `in` was *rejected* for the
  deployed `array-contains` listeners and would have broken the live board on
  deploy. Found by running the client's five query shapes, not by reading them.
- **Compatibility or migration concerns:** none. Gate 4 changes authorization,
  Help copy and documentation; it introduces no new document shape and no data
  mutation.
- **Rollback procedure:** restore the transitional rules. Data-compatible in both
  directions — every write admitted by the final task-update rule satisfies the
  transitional rule, and final comment writes are a subset of what it admits. The
  cost is confidentiality, not compatibility. Keep the gate 3 constrained client
  live; do not roll the client back to the unconstrained reader unless
  transitional rules are restored first. If the Help Centre wording has already
  shipped, roll that copy back with the rules so the product does not claim
  enforcement that is no longer active.
- **Production actions still requiring approval:** all of them — the rules
  deploy, the probe run, and the merge to `main`.

### Deployment order (operative, not authorized by this handoff)

1. Verify Firebase project targeting and record the currently deployed ruleset.
2. Re-run `--verify` against a **re-established** baseline; require zero
   outstanding and no unexplained drift.
3. Deploy `firestore:rules` from R.
4. Confirm the deployed ruleset is the intended version.
5. Canary immediately: the assigned and shared `getDocsFromServer` shapes — the
   two the original guard broke — before waiting on the full probe.
6. Run the complete probe, including the three controls added in R.
7. Merge R/H to `main`, which triggers Vercel; wait for the deployment to
   succeed. `05a9dc8` carries a user-visible Help Centre change, so a
   rules-only rollout would enforce privacy while the live site still tells
   members that every member receives their private data. The client publish is
   part of gate 4, not a follow-up.
8. Smoke the deployed Help text.

## Known Limitations

- **Residual 1 — backlink cleanup, newly narrowed (DEC-2026-015).** Deleting a
  maintenance ticket or job clears the linked task's backlink through a direct
  update outside `updateTask`. An admin may legitimately delete a linked ticket
  without being the task's creator, assignee or recipient; under the final rule
  that cleanup is denied and the client swallows the rejection, leaving a stale
  backlink. The denial is correct — an actor who cannot read a task must not
  write it — and a role override would reopen the boundary. Private tasks already
  had this limitation; gate 4 extends it to shared. A rules test pins the
  behaviour. A proper fix needs an authorized server operation: separate task.
- **Residual 2 — comment attribution (DEC-2026-015).** `authorId`, `authorName`,
  `createdAt` and `updatedAt` on comments remain unpinned, so an authorized
  member can forge attribution on a comment they create. Parent gating does not
  address this. **Must not be described as fixed.**
- The emulator fails open on list queries, so emulator exact-ID sets prove the
  rule admits a query shape, not that production contains the results.
  Containment is the production probe's job.

## Review Focus

- Whether `f4c890d` discharges L-1 and the M-2 records as the re-review intended,
  and whether the three new probe controls assert what they claim. The comments
  matrix and its `recursiveDelete` cleanup are the newest and least-exercised
  code here.
- The post-revocation case specifically: it mutates a fixture mid-run through the
  Admin SDK while member B is signed in. Confirm the ordering cannot corrupt
  ADMIN's later expectations — `EXPECT.ADMIN` does not include
  `private-a-assigned-b`, but that reasoning deserves a second reader.
- The baseline drift disposition: is "92 observed, 0 outstanding, +2 explained
  and consistent" the right call for a package-time check, given the baseline
  must be re-established before deploy anyway?
- Findings as runnable test cases wherever one can be written — the fixture and
  the assertion. Claude integrates and runs them.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
