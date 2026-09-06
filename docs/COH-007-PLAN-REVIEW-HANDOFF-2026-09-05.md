# COH-007 — plan review handoff (pre-implementation)

## Task

- Task ID and title: **COH-007 — Completed-task archiving and archive search**
- Owner: **Claude** (plan amendment; implementation owner once cleared)
- Reviewer: **Codex** (pre-implementation review — this handoff)
- Branch: **`claude/coh-007-plan`**
- Commit to review: **`f4a0e20`** (branch tip at handoff)
- Plan under review: `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md`
- Status: **Plan amended; no implementation started.** No source, rules, index,
  or function change exists on this branch. Documentation only.

## What is being asked of you

This is the **pre-implementation review** required by the plan's own rollout
step 2 and by DEC-2026-011. Review the plan as a design, not a diff. The
question is not "is this document tidy" but **"if Claude builds exactly this,
what breaks, what leaks, and what did it fail to consider."**

## Outcome so far

The plan was written by you on 2026-09-03 at `ef11213`, on top of `69e7390`
(COH-006 gate 3), and was never merged. COH-006 has since completed — all four
gates deployed and production-verified, `main` at `2ced910`. Claude has:

1. Carried your three artifacts onto post-gate-4 `main` byte-identical
   (`bda7fe9`) rather than rebasing your branch, because AGENTS.md forbids
   touching the counterpart's branch and a rebase would have collided in
   `docs/DECISIONS.md` where your DEC-2026-016 sits at the position `main` now
   uses for gate 4's DEC-2026-015. **Your branch is untouched and is behind.**
2. Amended the plan against the shipped COH-006 state — nine amendments, each
   marked `[A-n, 2026-09-05]` in the text (`60f9aca`).
3. Obtained two owner answers, below.

## Owner decisions since your draft

**Settled — archive visibility (2026-09-05).** Archiving changes nothing about
who can see a task. A team task stays church-wide after archiving; private and
shared keep exactly their prior audience; no admin override. The alternative
reading — an archive scoped to tasks the viewer is personally attached to — was
put to the owner and **rejected**. The archive therefore runs all four
authorization arms including `team`. Recorded at product contract item 4. **Do
not reopen this**; if you think it is wrong, say so as a question, not a finding.

**Revised — DEC-2026-017, still open.** The plan's "archived tasks are read-only
until reopen" rule would block the backlink cleanup that runs when a linked
ticket or job is deleted. Investigation found **four** such cleanup paths, of
which **three are already broken in production** independently of archiving
(`useFirestore.js:758`, `:852`, `:1276`, `:1342`; all fire-and-forget, so
denials are silent). Claude first recommended a cheap two-field rules exception;
the owner challenged that, and the recommendation is now a **Firestore
`onDocumentDeleted` trigger** doing the cleanup with Admin privileges after the
delete has already been authorized — sequenced as its own small task ahead of
COH-007's rules work, so archiving keeps a total freeze with no rule exception.
**DEC-2026-017 is Proposed and unanswered.** Implementation of COH-007's rules
gate should not begin until it is answered.

## Changes

- Behavior changed: none. Documentation only.
- Files changed: `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md`,
  `docs/AI-WORKBOARD.md`, `docs/DECISIONS.md` (DEC-2026-016 carried,
  DEC-2026-017 added), `docs/backlog.md`, and this handoff.
- Data, rules, or API changes: none yet — all proposed.

## Verification

```text
git log --oneline main..claude/coh-007-plan   — 6 commits, documentation only
git diff main --numstat -- docs/DECISIONS.md  — additive only; DEC-2026-015 intact
code anchors cited in A1–A9                   — each verified to resolve to the
                                                line it claims (2026-09-05)
onDocumentDeleted availability                — verified present in the installed
                                                firebase-functions 7.2.5
```

Not run, and not applicable: lint, build, unit, rules, handler, E2E. Nothing
executable changed. **You cannot start the emulators from `codex exec`, so
nothing in this review constitutes verification of a test result.** Say so in
your findings.

Toolchain: Node v25.8.0, OpenJDK 26.0.1, Firebase CLI 15.10.0.

## Review focus

Ranked. Depth matters more than coverage — a real defect in 1–4 is worth more
than complete commentary on all of them.

1. **Does the archive read set leak or lose anything?** The archive runs the
   same four authorization arms with `archived == true`, merged by document id.
   Can any user reach an archived task they could not reach before? Can an
   authorized user *lose* an archived task they should still see — particularly
   a task reachable only through an arm that behaves differently at
   `archived == true`? The plan forbids a bare `archived == true` query for this
   reason; check the reasoning holds.
2. **A1 — the maintenance arm exclusion.** The plan now says the `maintenance`
   listener must not take `archived == false`, because maintenance documents
   never carry the field and an equality filter on a missing field matches
   nothing. Check that conclusion, and check the claimed second-order effect:
   the `own` arm stops delivering maintenance tickets the user created, which is
   asserted harmless because the `maintenance` arm returns all of them
   church-wide and `mergeWorkSources()` splits by `type`. Is there any state in
   which that is false — a maintenance document with no `type`, a partial
   listener failure, the `createWorkStore` incomplete path?
3. **The archiver's race and idempotency.** A task can be reopened between the
   query snapshot and the write. The plan requires an update-time precondition
   or a transactional re-check. Design the adversarial case as a **test**.
4. **A3 — the null-`completedAt` claim.** Every creation path writes
   `completedAt: null`, and the plan asserts Firestore's null-before-string
   ordering may make `completedAt <= cutoff` match those. It is written as a
   claim to be **measured**, not a fact. Do not resolve it by reasoning either —
   instead write the exact emulator fixture and assertion that settles it, which
   Claude will run.
5. **DEC-2026-017's trigger recommendation.** Does an `onDocumentDeleted`
   trigger introduce any exposure the rules currently prevent? It writes one
   link field with Admin privileges after an already-authorized delete. Consider
   the recursion, partial-failure, and cross-tenant cases, and whether the four
   client cleanups can be removed safely or must stay as belt-and-braces.
6. **Reopen.** The plan's transition constraints versus the deployed gate-4
   update rule. Can a client forge an archive (false→true)? Can an unauthorized
   party reopen? Does reopen interact badly with recurrence — specifically, can
   reopening produce a duplicate recurring task?
7. **Backfill and rollout gating.** The order is additive → backfill → reader →
   automation. Is that order actually safe, given that `archived == false` on the
   active queries silently drops any document the backfill missed?
8. **What the plan does not mention at all.** This is the highest-value category
   and the one a checklist review misses. Challenge the premises, not only the
   execution: is six weeks the right mechanism, is soft-flagging right, is an
   on-demand four-query archive view the right read shape at the sizes this app
   actually sees?

## Requested output

Per AGENTS.md: **findings as test cases wherever one can be written** — the
exact fixture and assertion, not a description. That matters most for items 3,
4, and 6, where you cannot execute but can design the attack.

Commit your review in the review clone on a `codex/*` branch. State the branch
name and its SHA in your final message, plus an explicit note that emulator
results were not reproduced by you.

## Reviewer Findings

- Critical:
- High:
- Medium:
- Low:
- Questions:
- Verdict: Changes requested | Approved with follow-up | Approved
