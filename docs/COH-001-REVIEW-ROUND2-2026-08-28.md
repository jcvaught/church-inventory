# COH-001 Review — Round Two

**Reviewer:** Claude
**Owner:** Codex
**Review target:** `b7db655555761a271c2f0a875f053807fbfa334b` —
`docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`
**Handoff:** `dc69a8f`
**Supersedes:** round-one review at `1f4329c` (target `19cd045`)
**Verdict:** **Approved** — with two corrections that do not require a third
review round.

Delta review against round one. Scope re-verified: still documentation-only, no
application code, rules, or tests touched; commit chain linear; the threat model
is byte-identical at `b7db655` and `dc69a8f`.

---

## H-1 — Resolved

The legacy path is now an executive-summary finding (item 7), a dedicated
"Legacy task and maintenance paths" section, owner question D-10, a
safe-first-containment item, a test case, a Stage 4 rollout item, and priority 5.
The Stage 4 wording correctly separates it from compatibility-path removal — it
must happen at the rules cutover, not be left for traffic observation. Complete.

## H-2 — Resolved, and improved beyond the finding

The "Emulator list-denial limitation" section states the constraint accurately,
the membership and People Access test bullets were rewritten to get/mutation
probes, and Stage 2 gained a matching gate step.

Codex also added a constraint I did not ask for and endorse: no production
denial test may be run merely to satisfy COH-002, and query containment
verification requires an owner-approved nonproduction project. That closes a
hazard the finding implied but did not name.

## D-1 / D-4 / D-9 — Incorporated correctly

D-4's deferral is handled better than a bare removal: it is carved out of
COH-002 in the questions list, the data-model section, priority item 8, and the
boundaries statement, so the deferral cannot silently expand scope later. D-9
correctly carries the `shepherdAudit` actor-pinning pattern forward as the
implementation model.

---

## R2-1 — The Storage claim is a factual error, not a deferrable observation (High)

Round-one M-3 was deferred as a follow-up observation. It should not be, because
it is not an enhancement — it is an incorrect statement left standing in the
executive summary of a document the product owner will use to make decisions.

Executive summary item 1 says "Storage already requires `active:true`, so the two
layers do not agree." Verified at `storage.rules:8`: `allow read` checks
`request.auth != null` and `churchId` only, with no `active` predicate. Storage
requires `active:true` for **writes** exclusively.

A deactivated user therefore retains read access in *both* layers, item photos
included. The current wording implies Storage is a functioning revocation
boundary and makes AC-01 read as less severe than it is. AC-07's body is
accurate; the summary is not, and the summary is what gets read.

**Fix:** one line. "Storage requires `active:true` for writes only — its read
rule has the same gap, so a deactivated session retains read access at both
layers."

## R2-2 — D-4's deferral leaves AC-07 largely unremediated, and the model no longer says so (High)

Introduced by this revision rather than present in round one.

AC-07 is rated High: any member can rewrite maintenance cost, assignment, status,
completion chronology, and recurrence. With D-4 deferred, what COH-002 actually
delivers for maintenance is one bullet — "protect immutable maintenance
identifiers and creator fields." So `createdBy`, `taskNumber`, and `createdAt`
get pinned, while `status`, `actualCost`, and `assignedTo` remain writable by any
member, because deciding who may write them *is* D-4.

That is a defensible sequencing choice. The problem is that the document does not
state it anywhere. The assigned-member item moved to priority 8 (post-COH-002)
and the deferral is described procedurally, so the model now reads as though
COH-002 closes it. A grep of the target for residual-risk language —
"residual," "remains open," "accepted limitation" — returns nothing.

This is the specific failure mode of partial hardening: finishing COH-002 while
believing maintenance is covered when its High-rated impact is substantially
intact.

**Fix:** a short residual-risk statement, ideally beside AC-07 and repeated in
the rollout section: after COH-002, any active member can still change
maintenance status, cost, and assignment; only identity fields are protected;
full remediation depends on the deferred D-4 task. This repository already
handles known gaps this way — see the accepted-limitations list in `CLAUDE.md`,
which documents the private-task-comments gap rather than leaving it implicit.

---

## Findings deliberately carried forward

Round-one H-3, M-1, M-2, L-1, and L-2 were explicitly deferred by the handoff as
follow-up observations. I accept that scoping for the deliverable. Two are worth
keeping visible for COH-002 rather than losing to the deferral:

- **M-1** — AC-08's parent-document lookup may exceed Firestore's document-access
  limit on comment list queries; the denormalized `parentVisibility` fallback
  should be evaluated before COH-002 commits to the lookup design, not after.
- **H-3** — AC-01 composed with AC-02 (an offboarded member reading compliance
  records) is the concrete scenario that justifies the priority-1 ordering. It
  belongs in the summary whenever the document is next revised.

## Verdict

**Approved.** The analysis is complete, the requested High findings are fully
addressed, and the owner answers are incorporated faithfully. R2-1 is a one-line
correction and R2-2 is a one-paragraph disclosure; both can be made without
another review round, and neither blocks the product owner from approving the
target permission model.

COH-002 should not be scoped until R2-2's residual-risk statement exists, because
its absence is precisely what would cause the maintenance gap to be forgotten.
