# COH-001 — Owner Decisions Needed

Ten decisions block COH-002 scoping. Nine come from the threat model; D-10 was
added by the review. Answer in the **Decision** line under each; Codex and Claude
both read this file. Ratified answers should land in `docs/DECISIONS.md`.

Every "Current" line below was verified against `firestore.rules` at `464772f`
by direct emulator probe or by reading the rule, not inferred from docs.

---

## D-1 — Does `active:false` revoke access?

**Current:** No. `isMember()` checks auth + `churchId` only. A deactivated
profile with a live session keeps reading and writing church data — measured: it
can read compliance records, write the activity log, and approve reservations.
Storage blocks *writes* for inactive users but still allows *reads*.

**Tradeoff:** Adding the check is the single highest-value rule change and costs
almost nothing. But rules alone don't end a live session — a valid token still
works against Storage reads and any callable that doesn't re-check. Full
revocation needs Auth disable + token revoke in the offboarding workflow.

**Recommendation:** Both, in that order. Add `active` to the member predicate
first (cheap, immediate, closes the Firestore path), then add Auth-disable to the
admin offboarding action as a follow-up task.

**Owner answer (2026-08-28):** No one has been deactivated in production yet,
but it can happen.

**Status:** Confirmed latent, not a live exposure. The fix stays in COH-002 —
it is cheap and it must be in place *before* the first real offboarding, not
after — but it no longer justifies emergency handling ahead of the other work.

**Decision:** Accepted as recommended — add `active` to the member predicate in
COH-002; Auth disable + token revoke as a follow-up task.

---

## D-2 — May managers delete inventory items?

**Current:** Yes — rules give managers create *and* delete on `items`. The UI
describes the manager capability as "add/edit/**retire**."

**Tradeoff:** Hard delete destroys custody history, QR/label links, and activity
provenance. "Retire/Disposed" is a status and preserves all of it. Managers
almost certainly don't need hard delete for day-to-day work.

**Recommendation:** Admin-only delete; managers retire. Low disruption — this is
already how the UI frames it.

**Decision:**

---

## D-3 — May ordinary members restock supplies, or only consume?

**Current:** Any member can set `quantity` to any value, including negative, and
can rewrite name, reorder point, and location at the same time.

**Tradeoff:** Framing this as "who may restock" is the wrong axis. In a small
church the person who buys the coffee is usually a volunteer, so restricting
restock to managers breaks a real workflow. The actual problem is *arbitrary
assignment* rather than *bounded change*.

**Recommendation:** Let members do both, but as bounded deltas through a callable
(`+n` / `-n`, non-negative result) instead of whole-field assignment. That keeps
the volunteer workflow intact and kills the abuse case outright. Identity fields
(name, reorder point, location) become manager+.

**Decision:**

---

## D-4 — What may an *assigned* member change on a maintenance item?

**Current:** Any member can change every field on any maintenance work item —
cost, assignment, status, creator, ticket number, recurrence.

**Tradeoff:** Assignees genuinely need to work their tickets. But assignees are
stored as `{uid, name}` object arrays, which Firestore rules cannot query — so
enforcing "assignee may do X" in rules requires a normalized `assigneeUids`
array, i.e. migration work. Until that exists, the only rule-expressible options
are "any member" (today) or "manager/admin only" (may be too restrictive if
volunteers currently close their own tickets).

**Recommendation:** Target state — assignee may change status, checklist,
comments, photos, actual hours; never cost, assignment, identity, or recurrence.
Non-assignees get read + comment. Accept that this needs the `assigneeUids`
migration, and treat it as the one item in COH-002 that carries data-model work.

**Owner answer (2026-08-28):** Not enough evidence to decide yet.

**Status:** Deferred, deliberately. This is the only item carrying a data-model
migration, so it sequences last regardless. Do not guess it — an interim
manager-only rule would silently break volunteers if they do close their own
tickets, and an interim any-member rule leaves the exposure open.

**How to settle it with data:** query `activityLog` for
`action in ['mark_repair','mark_repaired']`, group by `performedBy`, and
cross-reference each uid's role in `users`. If closures are all admin/manager,
the interim manager-only rule is safe. Read-only aggregate on the production
church; needs owner authorization before running.

**Decision:** Deferred — carve D-4 out of COH-002 scope into its own task.

---

## D-5 — May an admin read another person's private task?

**Current:** No. Private tasks are readable only by their creator — admins
included. `CLAUDE.md` documents this as deliberate: "no admin override — truly
private."

**Tradeoff:** Safeguarding and continuity arguments exist (someone leaves
mid-project). But this is a promise already made to users, and quietly reversing
it is worse than never having made it.

**Recommendation:** No change. Handle continuity by reassigning tasks during
offboarding, not by granting admin read. If you ever do want an override, it
should be announced and logged, not silent.

**Decision:**

---

## D-6 — Is "shared with selected people" a real privacy feature?

**Current:** No. `visibility:'shared'` is rule-equivalent to `'team'` — every
church member can read it. The UI implies selected-person confidentiality.

**Tradeoff:** Making it real needs a rule-queryable `sharedWithUids` array plus
query and migration work — weeks, for a feature with no evidence of demand.
Renaming it costs one UI string and closes the false promise today.

**Recommendation:** Rename to team-visible now. Build real selected-sharing only
if someone actually asks for it. This is the cheapest honest fix in the whole
list.

**Decision:**

---

## D-7 — May managers write certification and background-check records?

**Current:** Rules let managers write *all* `accessRecords` types. The UI
restricts certification to admins only (`PeopleAccessPage.jsx:249`, `:961`).

**Tradeoff:** None meaningful — this is rules being looser than the intent the UI
already encodes.

**Recommendation:** Match rules to the UI. Certification and background checks
admin-only; keys and custom compliance records manager+. Zero user-visible
change.

**Decision:**

---

## D-8 — Who approves reservations, and for what scope?

**Current:** Nobody is enforced. Any member can approve their own reservation or
deny someone else's. The UI's `canApproveReservation` uses role +
`managedMinistries` + `rooms.approverUids`.

**Tradeoff:** Rules can't evaluate dynamic approver arrays without extra document
reads, so mirroring the UI logic needs a callable. This is the most complex item
in the list. Also: in a church with no manager assigned, a strict rule could
leave nobody able to approve anything.

**Recommendation:** Callable that mirrors the existing UI logic — manager may
approve for their managed ministries *or* where listed in `rooms.approverUids`;
admin may approve anything. Reservations with no ministry default to admin.
Confirm at least one admin is always reachable before cutover.

**Decision:**

---

## D-9 — Who reads activity-log detail, and does `details` need a schema?

**Current:** Every member reads the whole log. `details` is free-form and any
member can forge `performedBy`, the timestamp, and the action.

**Tradeoff:** The forgery problem is separate from the readability problem and
should be fixed regardless. Readability only becomes an issue if `details` ever
carries PII or pastoral content. Requiring "minimization" implies a schema change
to `details` that isn't currently scoped as data-model work.

**Recommendation:** Keep all-member read — inventory custody is legitimately
shared information and the log is a transparency feature. Fix authenticity
instead: pin actor and server timestamp, allowlist fields, cap sizes. Skip
minimization unless you know of sensitive content in `details`.

**Owner answer (2026-08-28):** No — except Shepherd Hub.

**Verified:** Shepherd Hub does not write to `activityLog` at all. Its logging
goes to a separate `shepherdAudit` collection with far tighter rules
(`firestore.rules:468`): read is owner-only — *elders cannot even read it* —
create requires elder/owner, and update/delete are denied outright. The 27
distinct `logActivity` actions in `src/` are all inventory, supplies, tasks,
reservations, and jobs operations. No pastoral content reaches the general log.

**Status:** The concern is already structurally handled. No minimization work
needed; the readability half of this question is closed.

**Reusable pattern for AC-03:** `shepherdAudit` already pins
`request.resource.data.actorUid == request.auth.uid` on create — exactly the
actor-pinning the general `activityLog` lacks. COH-002 should copy this rule
shape rather than design a new one.

**Decision:** Keep all-member read on `activityLog`. Skip minimization. Fix
authenticity only, following the `shepherdAudit` pattern.

---

## D-10 — Delete or harden the legacy `tasks/` and `maintenanceTickets/` rule blocks?

**Current:** Both blocks are still live in `firestore.rules` and still accept
writes (measured), though the collections were deleted in the P2 cutover and the
hook reads `workItems` only. They are absent from the threat model entirely.

**Tradeoff:** Keeping them leaves a parallel path with the full pre-COH-001
permission set — harden `workItems` alone and this is a way around it. The only
argument for keeping them is rollback, but P2's rollback was the feature flag,
and that flag was stripped in Part C, so it no longer exists.

**Recommendation:** Delete both blocks in COH-002. Removes ~45 lines of rule
surface and one whole class of bypass.

**Decision:**
