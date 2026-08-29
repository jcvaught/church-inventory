# Core Authorization Threat Model (COH-001)

**Date:** 2026-08-28
**Status:** Proposed permission model; no rules, application, data, or test changes
**Owner:** Codex
**Reviewer:** Claude
**Scope:** Inventory, supplies, reservations, maintenance work items, activity
logs, People Access, and work-item comments

## Executive Summary

ChurchOpsHub's `churchId` tenant boundary is materially stronger than its
within-church authorization. The newer Jobs and Shepherd areas use server-side
authorization for sensitive transitions, but several older core collections
still treat every authenticated church member as a trusted operator.

The highest-risk findings are:

1. **Deactivation does not revoke most Firestore access.** `isMember()` checks
   authentication plus `churchId`, but not `user.active`. A signed-in account
   marked `active:false` can continue reading and, where member rules allow,
   writing church data until another mechanism disables Auth or removes/changes
   its profile. Storage already requires `active:true`, so the two layers do not
   agree.
2. **People Access confidentiality is UI-only.** Every member can read
   `accessPeople` and `accessRecords` directly, including contact, notes,
   background-check dates, certification dates, key identifiers, and custom
   compliance records. The app hides the hub from ordinary users, but rules do
   not.
3. **The activity log is immutable but not trustworthy.** Any member can create
   any payload, impersonate another actor, choose an arbitrary timestamp/action,
   and place arbitrary data in `details`. Immutability preserves forged entries
   just as effectively as legitimate ones.
4. **Member update rules allow whole-document tampering.** A member who only
   needs to check out an item, consume a supply, or update assigned work can
   directly rewrite unrelated identity, financial, ownership, status, and audit
   fields.
5. **Reservation approval and identity are not enforced.** Any member can create
   or update any reservation, including setting approval state, changing the
   requester, editing someone else's reservation, or bypassing room approver
   logic that exists only in React.
6. **Task sharing and comments overpromise privacy.** `visibility:'shared'` is
   rule-equivalent to team visibility. All members may read work-item comments,
   including comments under private tasks, and comment identity is forgeable on
   create.
7. **Legacy write paths remain live.** The deleted-data-era `tasks/` and
   `maintenanceTickets/` rule blocks still accept client writes even though the
   application now uses `workItems`. Hardening only `workItems` would leave a
   parallel path with the old permissions.

No evidence found in this review indicates a cross-church rules bypass. The
threat is an authenticated current or former member using the Firebase SDK or
REST API outside the UI. Browser devtools are sufficient; no server credentials
are required.

## Scope and Method

This analysis compares:

- authorization in `firestore.rules`;
- visible role and workflow gates in Items, Supplies, Reservations, WorkBoard,
  People Access, AppShell, and `useFirestore`;
- the documented Firestore data model; and
- existing rule-test coverage.

The analysis assumes an attacker can authenticate as a legitimate church user,
read public Firebase configuration from the web bundle, and issue arbitrary
Firestore client operations. It does not assume Firebase Admin credentials,
control of Cloud Functions, or access to another church's account.

### Assets

- Inventory identity, valuation, condition, location, and custody
- Supply quantities and adjustment history
- Room/equipment reservations and approval state
- Task and maintenance content, assignment, status, cost, photos, and comments
- People contact, key, certification, background-check, and custom compliance
  metadata
- Audit attribution and chronology
- Per-church billing entitlements and per-user hub access expectations

### Threat actors

| Actor | Capability considered |
|---|---|
| Active ordinary member | Valid Auth session and a `users/{uid}` profile in the church; arbitrary client SDK calls |
| Manager | Same, plus legitimate operational authority for selected workflows/ministry scopes |
| Deactivated former member | Existing valid Auth session with `active:false` retained in the same church profile |
| Compromised member account | Equivalent to the member's rule-layer authority, irrespective of UI navigation |
| Malicious public requester | Unauthenticated writes only to the bounded public-request surface; reviewed only where it converts into core workflows |
| Cross-tenant authenticated user | User profile points to a different `churchId`; used to verify tenant isolation remains denied |

## Current Authorization Versus Product Behavior

### Global membership and entitlements

`isMember(churchId)` requires `request.auth != null` and matching `churchId`.
It does not require `active:true`, verified email, a paid church entitlement, or
the relevant value in `allowedHubs`.

Jobs is the notable exception: it checks church subscription and user Jobs Hub
access. Other paid-hub collections generally rely on application navigation and
subscription gates. Therefore `allowedHubs` and subscription state should be
understood as presentation/entitlement controls for most legacy areas, not data
authorization.

This threat model does **not** recommend immediately adding subscription checks
to every rule. Billing enforcement, internal confidentiality, and operational
authorization are separate policies. Mixing them in one emergency change would
increase lockout risk. COH-002 should first enforce active membership and
role/data sensitivity; entitlement parity can be a separately approved task.

### Legacy task and maintenance paths

The P2 cutover deleted the legacy `tasks` and `maintenanceTickets` production
collections and removed the feature-flag rollback path, but both collection
blocks remain writable in `firestore.rules`. They no longer feed the current
application, yet a stale client or direct SDK caller can create a parallel set
of task/maintenance documents under the older, broadly permissive rules.

COH-002 must not harden `workItems` while leaving these blocks unchanged. The
preferred remediation is to delete both legacy rule blocks so unmatched paths
fall through to denial. If rollback requirements still exist outside the
documented P2 design, the alternative is identical hardening plus explicit
tests. This is owner decision D-10.

### Role/action matrix: current behavior

Legend: **R** read, **C** create, **U** update, **D** delete. Parenthetical text
describes important constraints.

| Resource | Ordinary member | Manager | Admin | Material mismatch |
|---|---|---|---|---|
| Items | R, U (all fields) | R, C, U, D | R, C, U, D | UI reserves general edit/delete largely for elevated roles, but member can rewrite every field directly |
| Supplies | R, U (all fields) | R, C, U, D | R, C, U, D | UI separates use/restock/admin editing, but rules do not |
| Activity log | R, C (arbitrary payload), no U/D | Same | Same | Actor, action, target, time, and details can be forged |
| Reservations | R, C, U (all fields), no D | R, C, U, D | R, C, U, D | UI limits approvals and coordination; rules do not pin requester or status transitions |
| Maintenance work items | R, U (all mutable fields), no C/D | R, C, U, D | R, C, U, D | `type` alone is immutable; member can change cost, creator, number, status, assignment, photos, etc. |
| Task work items | R depending on visibility; C as self; broad U for team/shared; own/admin-manager D | Same plus elevated delete | Same | Shared is team-readable; broad noncreator edits; several identity fields protected but `createdByName` and content remain mutable |
| Work-item comments | R all; C arbitrary author; own-author U/D | Same plus U/D any | Same plus U/D any | Parent visibility is ignored; author and timestamps are forgeable |
| Access people | R; no writes | R/W | R/W | Ordinary members receive sensitive records in the global store despite the hidden hub |
| Access records | R; no writes | R/W | R/W | Certification is admin-only in UI, but managers can create/update/delete any record via SDK |

“Manager” rows describe rule authority. Some UI surfaces narrow managers by
`managedMinistries`, room approver lists, or record type, but those restrictions
are not reflected in rules.

## Abuse Cases

### AC-01 — Deactivated account retains access (Critical)

**Precondition:** A user signs in, then an administrator sets the profile to
`active:false` without disabling Firebase Auth or changing/removing `churchId`.

**Direct action:** The old session reads church collections and performs any
member-allowed writes.

**Impact:** Offboarded staff or volunteers may retain inventory, reservation,
work, activity, user-directory, and People Access visibility. They may also
tamper with core records. Storage writes are denied, creating a misleading
partial revocation.

**Required policy:** Active status must be part of the common Firestore member
predicate. An operational runbook should also define whether administrators
disable Firebase Auth and revoke refresh tokens for immediate offboarding.

### AC-02 — Ordinary member extracts People Access records (High)

**Direct action:** Query `accessPeople` and `accessRecords` with the client SDK
despite having no People Access navigation.

**Impact:** Disclosure of phone/email, notes, key identifiers, completed and
expiry dates for background checks/certifications, and custom compliance data.
Even without result details, the existence and timing of records are sensitive.

**Required policy:** Only admin/manager should read these collections. If a
member needs “My Compliance,” serve a minimized self-only document or callable
response instead of granting collection-wide reads.

### AC-03 — Forge the audit trail (High)

**Direct action:** Create an activity row naming an administrator as
`performedBy`, backdate it, select a plausible action, and place misleading or
sensitive content in `details`.

**Impact:** The “immutable audit trail” and accountability exports cannot be
relied upon for incident response, insurance, custody, or personnel disputes.

**Required policy:** At minimum, rules must allowlist fields, pin UID/name to the
authenticated profile, require a server timestamp, constrain action values and
field sizes, and reject unknown keys. Higher-assurance activity should be
created atomically by trusted functions/triggers with the underlying mutation.

### AC-04 — Rewrite inventory identity or financial data (High)

**Direct action:** A member changes `itemId`, description, valuation/purchase
fields, location, status, assignee, condition, photos, or disposal-related data
using a direct update.

**Impact:** Lost custody evidence, falsified valuations, broken links/QR labels,
and misleading operational state.

**Required policy:** A member may perform only an approved checkout/return
transition on a fixed field set. General item editing remains admin/manager;
deletion policy must match the UI decision (currently admin-only in places).

### AC-05 — Inflate, erase, or corrupt supply counts (High)

**Direct action:** Set quantity to an arbitrary or negative value, change
minimums/identity/location, or rewrite restock metadata.

**Impact:** Purchasing failures, false shortages, and untrustworthy consumption
history.

**Required policy:** Use/restock must be transactional operations with positive
bounded deltas and trusted actor/time. General editing remains elevated.

### AC-06 — Self-approve or alter another person's reservation (High)

**Direct action:** Create a reservation with `status:'Approved'`, impersonate
the requester, approve an existing request, overwrite room/time/resource fields,
or cancel/edit another member's reservation.

**Impact:** Room conflicts, unauthorized equipment use, falsified ownership,
and bypass of ministry/space approvers.

**Required policy:** Create pins requester identity and begins in an allowed
initial status. Requesters may edit/cancel their own pending requests within an
allowlisted field set. Approval/denial and post-approval coordination require a
server-authorized admin/manager/approver transition.

### AC-07 — Rewrite maintenance cost, ownership, or completion history (High)

**Direct action:** Any member updates a maintenance work item, including creator,
ticket number, estimated/actual cost, assignment, status, completion timestamps,
linked assets, photos, and recurrence fields.

**Impact:** Falsified repair history and costs, broken recurrence/link behavior,
or deliberate suppression of urgent work.

**Required policy:** Define the member operator role explicitly. Assignees may
need status/checklist/comment/photo updates; ordinary unassigned members do not
need whole-document edit. Identity, cost, recurrence, linking, visibility, and
completion chronology remain manager/admin or server-controlled.

### AC-08 — Read comments under a private task (High)

**Direct action:** Query the known or discoverable `workItems/{id}/comments`
subcollection. Comment rules check only church membership, not parent task
visibility.

**Impact:** Private task titles may remain hidden while sensitive discussion,
names, mentions, or operational details leak.

**Required policy:** Comment reads and creates must perform a parent document
lookup and apply the same visibility predicate as the task. Rule read budgets
and query behavior must be validated in emulator tests.

### AC-09 — Impersonate a commenter (Medium)

**Direct action:** Create a comment with another person's `authorId` and name.
The attacker may choose their own UID with someone else's display name to retain
edit/delete authority, or another UID to frame someone with an immutable row.

**Impact:** Misattributed operational or pastoral-adjacent discussion and
unreliable notification/mention behavior.

**Required policy:** Pin author UID/name and created time on create; make author
UID and created time immutable; allowlist editable fields and cap content.

### AC-10 — “Shared with selected people” is visible to the team (High)

**Direct action:** Any church member reads `visibility:'shared'` task documents.

**Impact:** The Help/UI language creates a false confidentiality expectation.

**Required policy options:**

1. Change the data model to a rule-queryable `sharedWithUids` list and require
   creator/admin/manager/UID membership for get/list, with compatible queries;
2. route selected-sharing through a server projection; or
3. relabel `shared` as team-visible and stop promising selected-person privacy.

Option 1 needs query and migration work; it is not a safe isolated rule edit.

## Proposed Target Permission Model

The following is a product proposal for owner approval, not an implemented
policy.

### Baseline

- All church-scoped access requires authenticated, `active:true` membership in
  the same `churchId`.
- Cross-tenant access remains denied.
- Admin has general church operational authority, excluding existing
  self-consent and Shepherd private-note constraints.
- Manager has operational authority but not unrestricted personnel/privacy,
  billing, owner-only, or consent authority.
- Ordinary member authority is action-based and self/assignment-scoped, not
  whole-document editing.
- Actor UID, actor name, creation time, immutable identifiers, counters, and
  security fields are rule- or server-controlled.

### Proposed role × action matrix

| Resource/action | Member | Manager | Admin | Enforcement recommendation |
|---|---|---|---|---|
| Read inventory/supplies | Yes | Yes | Yes | Rules, active member |
| Create/general edit inventory | No | Yes | Yes | Rules with field validation |
| Delete inventory | No | Owner decision: manager or admin only | Yes | Rules aligned to UI |
| Checkout/return item | Yes | Yes | Yes | Prefer callable/transaction; rule-only possible with strict transition fields |
| Consume supply | Yes | Yes | Yes | Callable transaction recommended |
| Restock supply | Owner decision: trusted members or manager+ | Yes | Yes | Callable transaction recommended |
| Read activity | Yes, subject to sensitive detail minimization | Yes | Yes | Rules |
| Create authoritative activity | No direct arbitrary creates | No direct arbitrary creates | No direct arbitrary creates | Trigger/callable/batch plus pinned schema |
| Create reservation | Yes, as self and initially Pending | Yes; auto-approval only under approved policy | Yes | Rules for create; callable for approval |
| Edit/cancel reservation | Own Pending only | Own plus managed/approved scope | Any | Rules + callable for privileged transition |
| Approve/deny reservation | No | Managed ministry or space approver | Yes | Callable required for dynamic approver arrays/scopes |
| Read maintenance | Yes | Yes | Yes | Rules |
| Create/delete maintenance | No | Yes | Yes | Rules |
| Operate maintenance | Assigned member: status/checklist/comment/photo subset | Yes | Yes | Callable or normalized assignee UID rule model |
| Edit maintenance costs/identity/recurrence | No | Yes | Yes | Rules |
| Read private task | Creator only | Creator unless explicit admin support policy | Creator plus owner-approved admin policy | Rules; current admin cannot read private tasks |
| Read selected-shared task | Explicit recipient/creator | Same plus owner-approved support policy | Same plus owner-approved support policy | Data-model/query change |
| Read/create comments | Only if parent is readable | Only if parent is readable | Only if parent is readable | Parent lookup in rules |
| Edit/delete comment | Author; text only | Author or moderator policy | Author or moderator policy | Rules, immutable attribution |
| Read People Access | Self-minimized only, not raw collections | Yes | Yes | Deny raw member read; add self projection/callable |
| Write People Access person/key/custom record | No | Yes | Yes | Existing role rule plus field validation |
| Write certification/background-check record | No | Owner decision; UI currently makes certification admin-only | Yes | Rules must match approved policy |

### Product decisions and current owner answers

1. **D-1 — Accepted:** add `active:true` to the Firestore member predicate in
   COH-002. Auth disable plus refresh-token revocation is a follow-up task. No
   profiles have yet been deactivated in production, so this is a confirmed
   latent exposure rather than a known live offboarding incident.
2. May managers delete inventory, or should deletion remain admin-only as much
   of the UI currently suggests?
3. May ordinary trusted members restock supplies, or only consume them?
4. **D-4 — Deferred out of COH-002:** insufficient evidence exists to decide
   which maintenance fields assigned ordinary members may change. Do not guess
   and do not introduce the `assigneeUids` migration in COH-002. Track this as a
   separate task after an owner-authorized, read-only activity/role analysis.
5. May admins/managers read another creator's private task for support,
   safeguarding, or continuity? Current rules say no.
6. Is selected-person task sharing a real confidentiality feature, or should it
   be renamed as team sharing?
7. Are managers authorized for certification/background-check records, or is
   the UI's admin-only certification rule intended?
8. Should managers approve reservations only for `managedMinistries`, only when
   listed as room approvers, or both? How should a reservation with no ministry
   be delegated?
9. **D-9 — Closed:** keep all-member read access to `activityLog`; Shepherd uses
   the separate restricted `shepherdAudit` collection. Skip detail minimization
   and schema work. Fix authenticity only by pinning actor/time and bounding the
   existing payload, following the `shepherdAudit` actor-pinning pattern.
10. Delete the legacy `tasks/` and `maintenanceTickets/` rule blocks (preferred)
    or harden them identically? The collections and rollback flag are gone, but
    owner approval is still required before removing their rule surface.

## Changes by Enforcement Type

### Safe first containment: rule-focused, with compatibility checks

- Add `userData().get('active', false) == true` to the common membership
  predicate after verifying all legitimate profiles have `active:true`.
- Delete or identically harden the legacy `tasks/` and `maintenanceTickets/`
  rule blocks after D-10 is answered; add direct probes that prove neither is an
  unhardened bypass.
- Restrict raw People Access reads to admin/manager.
- Pin comment author UID, allowlist fields, cap text, and make attribution/time
  immutable.
- Add field allowlists and actor pinning to activity creates as an interim
  integrity improvement. This does not make the log atomic.
- Protect immutable maintenance identifiers and creator fields while the full
  operator model is designed.

These are “rule-focused,” not “deploy immediately.” They still require emulator
coverage, data-shape queries, and UI listener changes where newly denied global
subscriptions would otherwise produce errors.

### Requires application/query changes

- Stop the global `useFirestore` subscriptions to People Access for users who
  cannot read the hub. A rules restriction alone would generate listener errors
  and could hold global loading/error state open.
- Subscribe to sensitive collections by role and only when a consuming surface
  is active.
- Align item/supply UI actions with new action-specific permissions.
- Separate ordinary reservation edits from privileged approval transitions.
- Add a self-only compliance projection for Settings → My Compliance.

### Requires callable functions or trusted backend transitions

- Atomic checkout/return plus authoritative audit entry.
- Atomic supply consume/restock plus authoritative audit entry.
- Reservation approval/denial when authorization depends on managed ministries
  or `rooms.approverUids`.
- Immediate user offboarding if it includes Auth disable/token revocation.
- High-assurance activity creation for mutations that must be auditable.

### Requires data-model or migration work

- `sharedWithUids` (or access projection) for selected-person sharing.
- Normalized `assigneeUids` belongs to the separate post-COH-002 D-4 task if the
  eventual assigned-member policy requires it. Current nested `{uid,name}`
  object arrays are awkward to authorize.
- Self-only compliance summaries if raw access records are manager/admin-only.
- Server timestamps and schema normalization for legacy records where strict
  field/type validation would reject existing documents.

## UI and Workflow Dependencies

| Workflow | Current dependency | Risk when rules tighten | Required adaptation |
|---|---|---|---|
| App startup | `useFirestore` subscribes every user to People Access, access records, time entries, work, reservations, etc. | Denied listeners may show errors or affect loading | Role/hub-aware, on-demand subscriptions |
| Item checkout/return | Client transaction writes item, then separately creates activity | Strict general-update rule breaks it; log can be missing | Approved transition field set or callable; atomic audit |
| Supply use/restock | Client transaction changes quantity, then separately logs | Same; concurrent logic must remain atomic | Callable or tightly validated transaction |
| Reservation creation | Manager/admin auto-approval is selected in client | Rule-pinned Pending would break elevated auto-approve | Callable or separate approval step |
| Room approval | `canApproveReservation` uses role, managed ministry, and room approver UID in UI | Rules cannot safely mirror all current dynamic logic without extra reads/design | Callable authorization |
| Maintenance board | UI exposes broad operation mainly to admin/manager but members may interact with assigned work/comments | Whole-document deny could remove legitimate execution | Define assigned-member action set and normalize assignees |
| My Compliance | Settings derives self information from globally subscribed People Access data | Raw member reads must be removed | Self-only projection/callable |
| Global attention/search/event day | Shared store consumers read multiple domains | Role-aware subscription changes can create missing-data assumptions | Explicit capability/data-availability contracts |
| Private/shared task comments | CommentThread queries comments independently | Parent visibility checks may require query/rule changes | Parent-aware rule tests and error/empty handling |

## Adversarial Emulator Test Plan

Every case should include active member, manager, admin, inactive same-church
user, and cross-tenant user where applicable.

### Emulator list-denial limitation

Do **not** treat a Firestore emulator `list`-denial pass as proof that a
production query is contained. This repository has observed the emulator fail
to reproduce production list authorization faithfully. The mandatory emulator
suite therefore uses single-document `get` plus create/update/delete probes for
negative authorization. Where list containment is essential, use a
rule-readable pointer/projection subcollection pattern that makes authorized
queries structurally possible and test its document reads; otherwise mark the
list denial as requiring a separately approved real-project/staging check.

No production-project denial test may be run merely to satisfy COH-002. It
requires explicit owner authorization and must use a nonproduction project or
isolated staging data, never live customer records.

### Membership/offboarding

- Active same-church role receives its intended access.
- `active:false` user cannot read or write any church-scoped core collection.
- Missing `active` is denied after a production shape audit/migration decision.
- Cross-tenant get, create, update, and delete remain denied by emulator probes.
- Cross-tenant list containment uses the pointer/projection pattern or is
  separately verified in an owner-approved nonproduction project; an emulator
  list denial is not accepted as evidence.

### Items

- Member may perform only approved checkout/return transitions.
- Reject member changes to item ID, description, value, purchase data, photos,
  location, ministry, disposal state, and unrelated custody fields.
- Reject negative or invalid transition values and unknown keys.
- Manager/admin general edits behave according to the approved delete policy.

### Supplies

- Approved consume/restock delta succeeds transactionally.
- Reject arbitrary quantity assignment, negative quantity, identity edits,
  minimum changes, and forged restock metadata by members.
- Reject malformed numeric values and unknown keys.

### Activity

- Reject actor UID/name mismatch, client timestamp, unsupported action, unknown
  fields, excessive strings, and oversized/arbitrary details.
- Reject update/delete for every client.
- Verify authoritative function/trigger path if introduced.

### Reservations

- Member create is pinned to self and allowed initial status.
- Reject spoofed requester and member-created Approved/Denied status.
- Member may edit/cancel only own Pending reservation and only approved fields.
- Reject member edits to another request and post-approval restricted fields.
- Verify manager ministry and room-approver cases through the callable boundary.

### Work items and comments

- Reject member changes to maintenance identity, cost, creator, recurrence,
  linking, and unauthorized status/assignment fields.
- Permit only the approved assigned-member action set.
- Private task is denied to noncreator, including comment get/list/create.
- Selected-shared behavior matches the owner-approved product decision.
- Pin comment author; reject attribution/time mutation and excessive text.
- Reject creates, updates, and deletes through legacy `tasks/` and
  `maintenanceTickets/` paths after deletion, or apply the complete approved
  matrix if D-10 chooses hardening.

### People Access

- Ordinary member cannot get a known raw people/access record in emulator
  probes. Query/list containment must use the pointer/projection design or an
  owner-approved nonproduction verification; emulator list denial alone is not
  a release gate.
- Manager/admin access matches the approved record-type policy.
- Self-only compliance endpoint returns only the caller's minimized fields.
- Linked and unlinked user edge cases do not disclose another person.

## Staged Rollout and Rollback

### Stage 0 — Decide and inventory

1. Product owner answers the unresolved policy questions above. D-1 and D-9 are
   settled; D-4 is deferred into its own task and does not block COH-002.
2. Query every production user profile for missing/null `active`, role, and
   church identifiers without changing data.
3. Inventory legacy document shapes and fields before adding strict allowlists.
4. Map every client listener and write path affected by the approved policy.
5. Capture a Firestore backup and document restore verification.

### Stage 1 — Prepare dark-compatible clients

1. Make subscriptions role/capability-aware, especially People Access.
2. Add self-only compliance retrieval before removing raw member reads.
3. Introduce callables for transitions that require dynamic authorization or
   atomic audit.
4. Deploy compatible client/backend code while old rules still allow both paths.
5. Instrument callable failures and denied legacy writes.

### Stage 2 — Emulator and staging gate

1. Run the adversarial rule suite with all role/state/tenant fixtures.
2. Run relevant handler tests for every callable.
3. Exercise checkout, return, supply use/restock, reservation request/approval,
   assigned maintenance, My Compliance, comments, and offboarding in emulators.
4. Use a staging project or isolated nonproduction tenant; do not validate
   restrictive rules first against live churches.
5. Treat emulator list-denial results as non-evidence; use the documented
   pointer/projection technique or an owner-approved nonproduction check.

### Stage 3 — Rules cutover

1. Deploy during an announced low-use window.
2. Monitor Sentry permission-denied telemetry, callable errors, Auth/session
   failures, and Firestore usage.
3. Run smoke checks for admin, manager, ordinary member, and inactive user.
4. Confirm ordinary users do not receive People Access payloads.

### Stage 4 — Stabilize and remove compatibility paths

1. Hold the compatibility client until the observation window passes.
2. Remove compatibility direct writes only after traffic confirms callable
   adoption. Legacy `tasks/` and `maintenanceTickets/` rule blocks are a
   separate bypass surface governed by D-10 and must be removed or hardened at
   the COH-002 rules cutover, not left for traffic observation.
3. Update `docs/DATA_MODEL.md`, Help, privacy language, changelog, and threat
   model decisions.

### Rollback

- Rules rollback: redeploy the prior versioned rules commit only if the new
  rules incorrectly block legitimate work. A rules rollback reopens the
  documented exposure and must be time-bounded.
- Client rollback: redeploy the last compatible client. Do not roll back to a
  client that assumes raw People Access reads after restrictive rules remain.
- Callable rollback: keep callable and direct-path compatibility explicit; do
  not remove the old path until the new path is observed stable.
- Data rollback: restore only from the captured backup with owner approval;
  prefer forward correction for additive schema fields.
- Emergency containment: if former-user access is confirmed in production,
  disable affected Firebase Auth accounts/revoke tokens using an explicitly
  approved operator procedure while the common rule fix is prepared.

## Recommended Priority

1. Confirm offboarding behavior and contain any deactivated accounts with live
   Auth access.
2. Make People Access subscriptions role-aware, then restrict raw reads.
3. Establish trustworthy actor/time validation for activity and comments.
4. Harden reservations and core inventory/supply transitions.
5. Remove or harden the two legacy task/maintenance rule paths.
6. Resolve selected-person task sharing honestly in product and rules.
7. Evaluate paid-hub entitlement enforcement separately from confidentiality.
8. Scope assigned-member maintenance operations as a separate task after D-4's
   owner-authorized evidence gathering; do not include it in COH-002.

## COH-001 Boundaries

This document intentionally makes no code, rules, test, migration, deployment,
or production-data change. COH-002 must not begin until the product owner
approves the target permission model and resolves the remaining in-scope policy
questions. D-4 is deliberately deferred and cannot expand COH-002 scope.
Per the coordination decision, COH-002 blocks COH-003 and COH-004 because those
role-gated specifications should be written against the approved permission
model rather than revised after implementation.
