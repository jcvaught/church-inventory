# COH-006 Gate 4 Re-review

## Review target and evidence boundary

- Task: COH-006 — enforce private and shared task visibility, Gate 4 of 4
- Candidate reviewed: `05a9dc8b29d8e2cc480eef52855144c2d641f949`
- Prior candidate: `2711ff41e311bc42821f5b60db8f782be2fdb2f3`
- Prior review: `285d204` (`docs/COH-006-GATE4-REVIEW-2026-09-03.md`)
- Candidate branch: `origin/claude/coh-006-gate-4`
- Base: `69e7390912a46e5b17efc4c712aa2dc178104c38` (`origin/main`)
- Reviewer: Codex
- Date: 2026-09-03

The clone was clean and detached at the requested candidate before this review.
I reviewed the addressed diff, the complete final predicate and write rules, the
five Gate-3 client query shapes, the expanded rules matrix, the production probe,
the durable E2E regression, the Help Centre change, DEC-2026-015, and rollback to
the transitional rules. I did not access production, deploy, mutate data, or run
a production probe.

## Verdict

**The restrictive rule implementation is approved. Changes are still requested
to the release package and deployment sequence before Gate 4 is called complete.**

The production-breaking incompatibility found while addressing H-1 was real:
the final rule in `2711ff4` could reject the deployed `array-contains` listeners.
Replacing the guarded `in` expressions with `hasAny([request.auth.uid])` is the
right repair. It admits the two required query shapes without making a malformed
projection an authorization source. Defaulting the five reads is also safe and
prevents an absent field irrelevant to the successful arm from poisoning the
whole predicate.

H-1, M-1, and M-3 from the prior review are substantively discharged. M-2 is
only partly discharged: the Help Centre and `CLAUDE.md` are corrected, and
DEC-2026-015 records both residuals, but the requested final-rule summary in
`docs/DATA_MODEL.md`, current Gate status in `docs/AI-WORKBOARD.md`, and
SHA-pinned Gate-4 handoff are still absent. More importantly, `05a9dc8` contains
a user-visible Help Centre change, so the proposed rules-only rollout would not
publish one of Gate 4's required changes.

## Findings

### Medium — M-1: the proposed rules-only deployment omits the Gate-4 client artifact

`05a9dc8` changes `src/pages/HelpPage.jsx` from the pre-fix warning to the final
server-enforcement and DEC-2026-012 wording. That change is required by the
workboard and by the prior review. It is not already live in Gate 3, whose deployed
SHA is the `69e7390` base.

Deploy the final rules first, then publish the client/docs commit immediately.
That preserves the approved truth-ordering: the product never advertises server
enforcement before it exists, and it does not leave the live Help Centre claiming
that every member still receives private data after enforcement is active. If
merging to `main` is what triggers Vercel, the operational plan needs to account
for that ordering explicitly; “firestore:rules only” is not the complete Gate-4
deployment.

### Medium — M-2: the Gate-4 handoff and two requested repository records are absent

The prior review requested a SHA-pinned handoff plus updates to
`docs/DATA_MODEL.md` and `docs/AI-WORKBOARD.md`. The candidate adds none of the
three. The workboard still says Gate 3 is not deployed and Gate 4 is not started,
which is materially stale operational state. `docs/DATA_MODEL.md` documents the
projection schema but not the final read/update/comment boundary or its lack of
an admin override.

Write the handoff before deployment, including the exact 90/90/zero fresh
verification, the reported 90 rules / 130 unit / lint / build results, the
unreproduced-emulator caveat, both accepted residuals, exact deployment order,
post-deploy checks, and rollback. Bring the two standing records current in the
same release package.

### Low — L-1: the new five-query emulator test does not assert its stated exact ID sets

The compatibility test catches the defect that matters: each deployed query must
be admitted. It does not implement the exact-ID assertion requested in H-1. It
reduces each result to `ALLOWED (size)`, and the `createdBy == creator` fixture in
particular matches several seeded tasks because `task()` defaults every task's
creator to `creator`.

This is not a reason to change the rule or delay the restrictive boundary after
M-1/M-2 are resolved. The production probe and durable E2E regression carry the
authoritative exact-set checks. Still, make the emulator fixture match the prior
test case (distinct creators, sorted returned IDs asserted per query), so a wrong
query or fixture cannot pass merely because it returned some allowed result. Keep
the caveat that emulator exact sets do not prove production containment.

## Answers to the requested questions

### 1. Does `05a9dc8` discharge the prior review?

It discharges the security-rule findings and the adversarial matrix. It does not
fully discharge the release-package finding: the handoff, data-model summary,
workboard update, and deployment of the Help Centre change remain. The rules are
approved; the Gate-4 release is not yet complete.

### 2. Is `hasAny` sound, and is defaulting safe?

Yes, for this predicate and these Firestore-storable shapes.

`hasAny` is a method on the Rules `List` type. For a list receiver,
`field.hasAny([uid])` is true exactly when the list contains that UID, the same
membership accepted by `field is list && uid in field`. A map, string, null,
number, timestamp, or other non-list receiver does not acquire membership
semantics; the method call errors and that membership arm fails. A missing field
becomes `[]`, which returns false. Firestore documents cannot store a Rules `Set`,
so there is no alternate persisted collection shape hiding between those cases.
Neither form validates that every list element is a string, but neither did the
old `is list` guard; exact typed UID membership means non-string elements do not
grant access. Create and task-update rules continue to require both projections
to be lists.

The qualification is that “fails closed” applies to the malformed **membership
arm**, not necessarily to the entire document. A creator can still read their
own task with a malformed projection, and a `team` task remains team-readable,
because a different, intended arm independently authorizes it. The malformed map
itself never grants access, and task updates cannot preserve that bad shape.

The defaults do not turn any absent or malformed field into a positive value:

- missing `type`, `visibility`, or `createdBy` becomes `''`, matching no valid
  type/visibility value and no authenticated Firebase UID;
- missing projection fields become empty lists, whose `hasAny([uid])` is false;
- present malformed projections still error on `hasAny` and do not grant;
- `canSeeWorkItem` is reached from rules that first require `isMember(churchId)`,
  so unauthenticated and cross-tenant callers remain denied.

Defaulting does deliberately let a later valid arm work when an earlier,
irrelevant field is absent. For example, a legacy document missing `type` is
still readable by its valid `createdBy` actor. That is a widening relative to
the old expression's evaluation error, but not a widening of the authorization
policy: the caller must satisfy one of the same positive arms. In particular,
missing `visibility` cannot activate the shared-recipient arm because that arm
still requires exact equality with `'shared'`.

This conclusion agrees with the Firebase Rules type reference: `hasAny` exists
on `List`, while `Map.get(key, default)` returns the stored value unchanged when
present and uses the default only when absent. It also respects Firestore's
all-or-nothing query model; the production observation remains more probative
than static reasoning for query compatibility.

References:

- <https://firebase.google.com/docs/reference/rules/rules.List>
- <https://firebase.google.com/docs/reference/rules/rules.Map>
- <https://firebase.google.com/docs/firestore/security/rules-query>

### 3. Deployment sequence and post-deploy assertions

The fresh read-only backfill verification immediately before deploy is correct:
use the independently established baseline of 90 and require exactly 90 observed,
zero outstanding, and no unexplained population drift. Also verify Firebase
project targeting and record the currently deployed ruleset before changing it.

Then:

1. Deploy `firestore:rules` from the pinned final candidate.
2. Confirm the deployed ruleset is the intended final source/version.
3. Immediately run a minimal canary using the real Gate-3 client shapes. At
   minimum, require the assigned and shared `getDocsFromServer` queries to
   succeed; these are the two shapes the original guard broke. Do not wait for
   the full probe before checking whether the live board's load-bearing listeners
   can establish.
4. Run the complete two-account production probe against the final rules, then
   the permanent E2E regression/default relevant project. Require all five query
   shapes for both one-shot reads and server-backed listeners, exact sets, no
   timeout, merge completeness, direct stale-recipient denial, cross-tenant
   denial, and clean fixture removal.
5. Add an authenticated **admin-with-no-relationship** pass. The current
   `verify-coh006-gate3.mjs` signs in only member A and member B; it resolves the
   admin UID only to create a team fixture. It therefore does not establish the
   no-admin-override control after deploy. For that admin, assert direct
   `permission-denied` on unrelated private and shared tasks and assert the exact
   five-query union contains only documents independently authorized by team,
   creator, assignment, or explicit sharing—not every private/shared fixture.
6. Assert an unconstrained old-client collection query receives exact
   `permission-denied`. This is the rollback/order tripwire requested in the
   Gate-3 final review and is not presently in the production probe.
7. Exercise comments against the deployed final rules: authorized creator,
   assignee, and recipient positive get/list/create; unlisted member and unrelated
   admin exact `permission-denied` for get/list/create; and at least one
   post-revocation denial. The current production probe does not test comments.
8. Publish the `05a9dc8` Help Centre client change after enforcement, then smoke
   the deployed Help text. Finish the handoff/workboard/data-model records.

Items 5–7 cannot establish the final rule before it is deployed; emulator tests
are pre-deploy regression evidence, not evidence of the production ruleset. The
existing exact query assertions can and should be prepared before deploy, but
their final-rules result is necessarily post-deploy evidence.

### 4. Is rollback to the transitional rules data-compatible?

Yes. Gate 4 changes authorization, Help copy, and documentation; it introduces no
new document shape or production-data mutation. Every client write admitted by
the final task-update rule is compatible with the transitional rule's required
immutable fields and visibility semantics. Final comment writes are a subset of
what the transitional comment rule admits. The Gate-1 create-shape rule is the
same in both rulesets. Rolling back therefore loosens access but does not encounter
a state written only under the final rules that it cannot interpret.

The rollback's cost is confidentiality, not data incompatibility: restoring the
transitional rules reopens broad shared-task and comment access and the measured
legacy list exposure. Keep the Gate-3 constrained client live. Do not roll the
client back to the old unconstrained reader unless transitional rules have been
restored first. If the Help Centre final wording has already deployed, roll that
copy back promptly with the rules so the product does not claim enforcement that
is no longer active.

## Reviewer verification

```text
git diff --check 2711ff4..05a9dc8 — failed: one extra blank line at EOF in
  functions/test/rules/coh006-visibility.test.mjs (cosmetic)
npm run test:unit — passed, 130/130
npm run lint — passed, 0 errors and 50 existing warnings
npm run build — passed; Vite, prerender, and verify-prod-bundle clean
npm run test:rules — not run; Firebase emulator ports cannot bind in this sandbox
production verification / probes / E2E — not run; no production access used
```

The implementation owner's reported 90/90 rules result remains unreproduced by
this reviewer. No deploy, production mutation, migration, push, or
external-system change was performed.
