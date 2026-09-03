# COH-006 Gate 4 Completed-Package Review

## Review target and evidence boundary

- Task: COH-006 — enforce private and shared task visibility, Gate 4 of 4
- Release candidate reviewed: `f4c890d08134a727f7514d266ef8d6c77dff12ec` (R)
- Handoff reviewed: `ef15bb234bf4f495786fae7b78af2afa3c24155c` (H)
- Candidate branch: `origin/claude/coh-006-gate-4`
- Base: `69e7390912a46e5b17efc4c712aa2dc178104c38` (`origin/main`)
- Prior reviews: `285d204`, `c3fe8a6`, and `ccefde2`
- Reviewer: Codex
- Date: 2026-09-03

The clone was clean and detached at H when this review began. I reviewed the
release-package diff, the final rules and rules-test context approved in the
prior reviews, the complete production probe, the handoff, the updated data
model and workboard, and the applicable decisions. I did not access production,
run the production probe, deploy, merge, mutate data, or push a branch.

## Verdict

**Approved for the owner-reserved deployment gate. No code or record changes
are requested.**

R discharges L-1 and the remaining M-2 release-package records without weakening
the earlier approved rule semantics or test matrix. The three new production
controls assert their stated claims, and their fixture mutations and cleanup are
ordered coherently. The package-time baseline mismatch does not block this
package: all 92 observed tasks have correct projections, and the two-count
increase is explained by identified, correctly projected documents created
after the 90-document baseline. It is not, however, a passing baseline check and
cannot satisfy the immediate pre-deploy gate. The baseline must be independently
re-established and verification rerun immediately before deployment, as the
handoff already requires.

The restrictive rules themselves remain approved from the prior re-review. This
approval does not verify their deployed behavior or authorize any production
action.

## Findings

- Critical: none.
- High: none.
- Medium: none.
- Low: none.

There is no additional runnable test case for Claude to integrate from this
review. The remaining unexecuted cases are already present in R and belong to
the authorized deployment-stage production probe.

## Review answers

### 1. L-1 and the M-2 records

L-1 now has one intentional result per deployed query and exact sorted-ID
assertions. In particular, `task_noise` is not accidentally creator-owned, so
the creator query can no longer pass merely because it returned a non-empty
set. The maintenance, team, creator, assignee, and shared query fixtures each
exercise the intended proof arm, and the shared query retains both constraints.
The reported deliberate-break result is a meaningful mutation check.

The data-model record states the final shared/private/maintenance boundary, the
pre-state update rule, comment inheritance, absence of an admin override, and
both accepted DEC-2026-015 residuals. The workboard records the actual Gate 4
trail and keeps COH-007 Proposed and blocked rather than implying it was
reviewed. H is pinned to R and distinguishes completed package verification from
deployment-stage verification. I found no weakened item.

### 2. The three production controls and cleanup

The admin control proves absence of a role override without pretending ADMIN
has no legitimate access at all: its exact query sets admit maintenance, team,
and creator arms only; five direct reads separately deny unrelated private and
shared tasks.

The old-client tripwire runs for A, B, and ADMIN and accepts only the exact
`permission-denied` code. An allowed result or any unrelated error increments
the probe failure count.

The comments matrix uses the client SDK for every get, list, and create under
test. It distinguishes creator, assignee, and recipient positives; asserts exact
comment ID sets before and after creation; and requires exact
`permission-denied` for an unlisted member, an unrelated admin on both private
and shared parents, and the revoked assignee. Admin SDK use is limited to
fixture setup, the deliberate revocation, and cleanup.

Cleanup uses `recursiveDelete()` on every fixture parent, so seeded and
client-created subcollection documents are included. The subsequent
run-prefix-filtered collection-group assertion checks that comments were not
orphaned, and the existing zero-item assertion checks the parent collection.
This is materially stronger than the former parent-only batch cleanup.

### 3. Post-revocation ordering

The mutation is safe for the later expectations. B completes all five listener
sets, all five server query sets, the merged-store assertion, direct reads, and
the old-client tripwire before the Admin SDK removes B from
`private-a-assigned-b`. The ensuing comment operations consult the current
server-side parent through the rule's `get()`, so B's authenticated client or
earlier reads do not preserve authorization.

ADMIN runs afterward, but `EXPECT.ADMIN.assigned` is already empty and no ADMIN
direct or comment positive expects `private-a-assigned-b`. The later physical
plan query uses B's shared-recipient fixture, `shared-a-to-b`, which the
assignee revocation does not modify. Cleanup deletes the mutated parent just as
it deletes the others. I found no ordering corruption.

### 4. The 92/90 package-time result

“92 observed, 0 outstanding, +2 explained and consistent” is the correct
package-time disposition, with the handoff's explicit label that the baseline
check failed. A population baseline is point-in-time evidence; organic creates
after the backfill make 90 stale without indicating projection drift. The two
new documents were individually identified, post-date the baseline, and carry
correct projections, while the complete scan reports zero outstanding across
all six churches.

This result would block deployment if it were presented as the required
immediate pre-deploy verification. It does not block review of the package that
contains no deployment or data mutation. At the deployment gate, re-establish
the population baseline immediately before the read-only verification and
require both exact population agreement and zero projection drift; unexplained
drift or any outstanding document blocks the rules deploy.

## Reviewer verification

```text
npm run test:unit — passed, 130/130
npm run lint — passed, 0 errors and 50 existing warnings
npm run build — passed; Vite, prerender-blog, prerender-static, and
                verify-prod-bundle clean (28 JS chunks, 0 jsxDEV)
node --check scripts/verify-coh006-gate3.mjs — passed
git diff --check 69e7390..f4c890d — passed
npm run test:rules — not run; Firebase emulator ports cannot bind in this sandbox
production baseline verification — not rerun; no production access used
production probe / deploy / merge — not run
```

The implementation owner's reported `npm run test:rules` result (90/90) remains
unreproduced by this reviewer. The implementation owner's 92-observed,
zero-outstanding production result was reviewed as a recorded artifact, not
independently reproduced. This clone's real dependency install allowed the full
build, including prerender-static, to pass; therefore the handoff's separately
documented symlink failure was not reproduced here and is not a release finding.

## Required deployment-stage gates (not performed or authorized here)

Follow H's operative sequence. Before deploying, verify project targeting,
record the deployed ruleset, establish a current independent population
baseline, and rerun the read-only projection verification. After the rules
deploy, run the assigned/shared canary and the complete reviewed probe,
including the Admin, old-client, comment-revocation, and cleanup assertions.
Publish the corrected Help Centre through the recorded `main`/Vercel path and
verify that deployment before calling Gate 4 complete. Any failed security
assertion or incomplete cleanup blocks completion and invokes the documented
rollback.
