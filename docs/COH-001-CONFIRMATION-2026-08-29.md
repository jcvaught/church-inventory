# COH-001 — Reviewer Confirmation

**Reviewer:** Claude
**Final target:** `981054d` — "Finalize COH-002 scope from owner decisions"
**Date:** 2026-08-29

## Confirmed complete

Verified against `981054d`:

- **R2-1 resolved.** Executive summary item 1 now states that Storage requires
  `active:true` for writes only and that its read rule omits active status, so a
  deactivated session retains read access at both layers. Accurate.
- **R2-2 resolved.** D-4 now carries an explicit residual-risk statement: until
  the deferred task lands, AC-07 remains substantially open and any active member
  retains broad maintenance update authority.
- **D-10 incorporated precisely,** including the four-block enumeration and the
  non-contiguity hazard. The added test — confirm `taskTemplates` and `workItems`
  behavior are unchanged after the noncontiguous deletion — is the right guard.
- **Scope is closed and correctly bounded.** The four authorized workstreams
  match the reviewed model; D-2/D-3/D-5/D-6/D-7/D-8 are excluded rather than
  pending, and D-4 cannot expand scope.

COH-001 is complete from the reviewer's side. No further review round is needed
on this deliverable.

## One item that did not reach the final target

`981054d` was committed at 07:50:13 on 2026-08-29. The D-1 addendum at `3dda1f0`
landed at 07:50:44 — 31 seconds later, and it was never relayed. This is a
sequencing gap on the reviewer's side, not an omission by the owner.

**What it changes.** Workstream 1 currently specifies:

```
Add `userData().get('active', false) == true` to the common membership predicate
after verifying all legitimate profiles have `active:true`.
```

The addendum establishes, from code and git history rather than production
access, that no user document has ever been created without `active: true` — the
field was introduced in the first commit that ever touched `useAuth.js`, one day
after the repo root, and the pre-rebrand code had no `users` collection at all.
No Cloud Function, script, or admin UI path creates user documents.

It recommends `userData().get('active', true) == true` instead. Deactivation
always writes an explicit `active: false` (`SettingsPage.jsx:1062`) and
reactivation writes `true` (`:1065`, `:1083`); the field is never deleted. So
defaulting a *missing* field to active does not weaken the control — a
deactivated user is denied identically — while a legacy or hand-created document
keeps working instead of being locked out of the entire application.

**Why it matters before implementation.** As written, workstream 1 fails closed
on any document missing the field, which makes the Stage 0 production query
load-bearing and gates COH-002 on owner authorization for production access that
has not been granted. Inverting the default makes the change fail safe and
reduces that query to an optional sanity check.

**Requested:** fold `3dda1f0` into workstream 1 and downgrade Stage 0 step 2 from
prerequisite to optional confirmation. This is a scope refinement inside an
already-authorized workstream, not an expansion.

## Status

Standing by for the COH-002 implementation handoff. No application code, rules,
tests, Codex-branch files, or governance files were modified by the reviewer at
any point in COH-001.
