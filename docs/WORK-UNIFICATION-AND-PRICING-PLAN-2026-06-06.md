# ChurchOpsHub — Work Unification & Pricing Simplification Plan

**Drafted:** 2026-06-06
**Status:** PLAN — not yet started. Open decisions at the bottom need owner sign-off before Phase 2.
**Owner:** John (jvaught@fxcc.org)

This plan does three things, in order of conviction:

1. **Unify Tasks + Maintenance + Jobs into one "Work" model** — because they are the same thing wearing three costumes. Roll **contractor labor + hours tracking** into it.
2. **Collapse the 8-hub à-la-carte pricing matrix into one simple plan**, and lower the price for now.
3. **Set up the codebase** so the broader "premier app" features (notifications, search, integrations, AI) land on a clean foundation instead of a pile of near-duplicate hubs.

It is written to be executed in phases, smallest-risk-first, with the contractor-hours feature deliberately sequenced early because it's a real, present FXCC need.

---

## 1. The core idea: there is only "Work"

Today COH models the work a church does as three separate, ~80%-duplicated hubs:

| Hub | What it really is |
|---|---|
| **Tasks** ($7) | Internal work, assigned to a person, tracked on a kanban |
| **Maintenance** ($7) | Internal work, assigned to a person, tracked on a kanban — but tied to a *thing* (an asset), often recurring, sometimes done by a vendor |
| **Jobs** ($7) | Work that's *posted for sign-up* instead of assigned — teen jobs, volunteer shifts, event/work-day crews |

These differ on only **three axes**, none of which justifies a separate app:

- **Category** — is it a general task, asset maintenance, or a sign-up shift? (drives which fields show)
- **Assignment mode** — is a specific person *assigned* (push), or is it *open* for people to claim (pull)?
- **Labor type** — who does it: **staff/member**, **volunteer**, or **contractor** (paid, hours tracked)?

> **The unifying insight:** "We need volunteers to repaint the nursery Saturday" and "Repaint the nursery" and "Pay the contractor to repaint the nursery" are the *same work item* with a different assignment mode and labor type. They should be one record you can flip between modes — not three records in three hubs that you manually "convert" between (the current `convert→Task`/`convert→Job`/`convert→Ticket` web, which can be deleted entirely under this model).

### What unification buys us

- **Half the board code.** `MaintenancePage.jsx` (~85KB) and `TasksPage.jsx` (~165KB) are near-identical engines (kanban / list / calendar / numbering / recurrence / assignees / checklists / comments). One shared engine ≈ half the maintenance burden, and that recovered capacity funds the premier features.
- **The convert-features disappear.** No more `linkedJobDocId` / `linkedTaskDocId` / `linkedTicketDocId` backref web. You change a record's `category` or `assignmentMode` instead of spawning a linked copy.
- **Compliance reuse everywhere.** The Jobs Hub's server-enforced `requiredAccessTypes` gate (checks a volunteer's background-check/cert records before they can sign up) becomes available to *any* work item — including maintenance done by volunteers. Strong safeguarding story.
- **Contractor hours have a home** (see §3).
- **One product story:** *"All the work your church needs done — staff tasks, asset maintenance, volunteer shifts, and contractor hours — in one place."*

---

## 2. Unified data model

### 2.1 The `workItems` collection

Replace `tasks` and `maintenanceTickets` (and, in Phase 3, `jobListings`) with one collection: `churches/{churchId}/workItems/{id}`.

**Common fields (all work):**
- `category`: `'task' | 'maintenance' | 'shift'` — primary discriminator; default `'task'`
- `assignmentMode`: `'assigned' | 'open'` — push vs. pull. (`task`/`maintenance` default `assigned`; `shift` defaults `open`, but a shift *can* be `assigned` and a task *can* be `open`.)
- `number`: human-friendly, prefix by category — `TSK-###` / `MNT-###` / `SHF-###` (keep per-category prefixes so nothing feels renamed; one `maxNumber` counter per prefix)
- `title`, `description`, `status` (todo / in-progress / done + maybe scheduled/blocked), `priority`, `tags[]`
- `dueDate?`, `scheduledDate?`, `scheduledTime?`, `location?`, `ministry?`
- `assigneeUids[]` (when `assignmentMode === 'assigned'`)
- `checklist[]`, `photos[]`, `recurrence?` (shared util — see §6)
- `comments` subcollection (shared)
- audit: `createdBy`, `createdAt`, `updatedAt`

**Maintenance-only fields (when `category === 'maintenance'`):**
- `itemId?` (link to an inventory item), `vendorId?`, `estimatedCost?`, `actualCost?` (can now be auto-summed from linked contractor time entries — see §3)

**Shift-only fields (when `category === 'shift'`):** everything Jobs has today —
- `capacity`, `signupCount`, `waitlistCount`, `signups`/`waitlist` per-uid subcollections (server-write only, unchanged), `requiredAccessTypes[]`, waiver/consent fields, `pay?` (optional — teen jobs have it, volunteer shifts don't), `publicBoard` eligibility, attendance tracking, swap/replacement requests, reminder settings

**Labor type** is expressed through *who's assigned / who signs up* plus the time-entry layer (§3) — not a hard field on the work item, so it stays flexible (a shift can mix volunteers and a contractor).

### 2.2 Numbering & migration

- Migrate `tasks` → `workItems` with `category:'task'`, preserving `TSK-###`.
- Migrate `maintenanceTickets` → `workItems` with `category:'maintenance'`, preserving `MNT-###`.
- Phase 3: migrate `jobListings` → `workItems` with `category:'shift'`, preserving `JOB-###` (or re-prefix to `SHF-###` — see open decisions).
- Comments subcollections move with their parents; signups/waitlist subcollections move with shifts.
- Migration is an **Admin SDK script** (`scripts/migrate-work-unification.cjs`), run per-tenant, idempotent, with a dry-run mode. Keep the old collections read-only for one release as a rollback safety net before deleting.

---

## 3. Contractor & labor time tracking (sequenced EARLY — real FXCC need)

John has a contractor working ~10 hrs/week whose hours need better tracking. This is the feature that makes "time tracking" worth keeping — scoped to **labor/payroll**, not per-task Jira hours.

### 3.1 Contractors are tracked people

Reuse the **People Access** `trackedPeople` model (people who aren't necessarily app users):
- Add `personType: 'staff' | 'volunteer' | 'contractor' | 'member'` (default `'member'`)
- Contractors get `hourlyRate`, optional `defaultMinistry`, contact info
- Contractors can *still* carry compliance records (background check, certs) — same hub, one record per person. (A contractor with kids-area access still needs a background check; this is a feature, not a coincidence.)

### 3.2 Time entries

New collection `churches/{churchId}/timeEntries/{id}`:
```
{
  personId, personName,        // the contractor (or staff/volunteer)
  date,                        // YYYY-MM-DD (use localDateStr — UTC footgun)
  hours,                       // number
  description,
  workItemId?, workItemNumber?,// optional link to the work it was for
  ministry?,
  billable,                   // bool
  rate,                       // snapshot of hourlyRate at entry time
  cost,                       // hours * rate (derived, stored for reporting)
  status,                     // 'logged' | 'approved' | 'rejected'
  approvedBy?, approvedAt?,
  createdBy, createdAt
}
```

### 3.3 Entry & approval flows

- **Quick log** from a contractor's profile, from the new Timesheet view, or from a **"Log time" button on any work item** (auto-fills `workItemId` + `ministry`).
- Optional: a contractor with a linked user account logs *their own* hours; admin/manager **approves**. Or admin logs on the contractor's behalf. (Reuses People Access's existing link-person↔user-account pattern.)
- Approval is lightweight: admin/manager flips `logged → approved`.

### 3.4 Timesheet view

- Filter by **person + date range** (this week / last week / month / custom); default view = **"this week, by person"** (the 10-hr/week use case).
- Group by person, by work item, or by ministry. Totals: **hours + cost.**
- Approve/reject inline; CSV export; printable timesheet.
- Optional **monthly hour budget** per contractor → budget-vs-actual; feeds the future AI weekly digest ("contractor logged 11 hrs this week, 3 over budget").

### 3.5 Synergies (why this belongs in the unified model)

- A time entry linked to a **maintenance** work item auto-populates that ticket's `actualCost` (labor) — closing the loop between "fix the HVAC" and "what did the HVAC fix cost."
- Contractor hours/cost flow into **Insights** (financial reporting) and the safeguarding picture in **People Access**.
- This can ship on the **current** Tasks/Maintenance before full unification (log time against today's tickets/tasks), so John gets contractor tracking *fast* — see Phase 1.

---

## 4. Volunteer shifts: folding Jobs Hub into Work

"Combine Job Hub with volunteer tasks, which is basically Maint" → exactly. Under the unified model, the Jobs Hub becomes the `category:'shift'` (open-assignment) face of Work, and it generalizes from "teen jobs" to **all sign-up labor**: teen paid jobs, volunteer work days, event setup/teardown crews, serving slots.

- **Mode toggle replaces convert.** A maintenance item ("Repaint the nursery") can be *opened as a shift* for N volunteers by flipping `assignmentMode: assigned → open` and setting `capacity`. One record. The old `convert→Job` feature is deleted.
- **Compliance carries over.** `requiredAccessTypes` gating (already server-enforced in Jobs) now guards any open shift — so "you must have a current background check to sign up for nursery teardown" works everywhere.
- **Everything Jobs has is preserved:** server-side sign-up/waitlist/capacity enforcement, auto-promotion, waiver/consent, public no-login board (`?jobs=` → becomes `?shifts=` or kept for compatibility), attendance, swap requests, reminder emails (+ SMS, see open decisions), volunteer-only app shell, ICS export.
- **Pay becomes optional** (`pay?`): teen jobs set it, volunteer shifts don't. Same record shape.

> **Honest scope note (carried from the strategy review):** this is still a *sign-up* (pull) model, which is the right niche for ad-hoc/event/teen/work-crew labor. It is **not** push-based recurring volunteer rostering (assign named people to Sunday roles months out, with availability blackouts + auto-scheduling + family grouping) — that's Planning Center Services / Ministry Scheduler Pro territory and a separate, much larger build. Unifying the model *enables* growing toward that later (an `assigned` shift is already a roster slot), but it is explicitly **out of scope for this plan.** Decide later.

---

## 5. Views on the unified Work area

One "Work" area, several views (a church only sees the slices it uses — no contractor ⇒ no Timesheet; no volunteers ⇒ no Open Shifts):

1. **Board (Kanban)** — assigned work (tasks + maintenance + contractor jobs), columns by status, filter by category/ministry/assignee/location.
2. **Calendar** — scheduled work + shifts (month grid + mobile list).
3. **Open Shifts** — the volunteer-facing pull board (today's Jobs Board) + the public no-login board.
4. **Schedule / Roster** — who's doing what (today's Jobs Schedule).
5. **Timesheet** — contractor/labor hours + cost (new, §3).
6. **Insights** — velocity + the merged maintenance/jobs/labor reporting (and fix the 100-entry activityLog ceiling while we're here — see §9).

---

## 6. Shared primitives to extract (prep work, invisible to users)

- **Board engine** — one Kanban/List/Calendar + card + column + numbering component, parameterized by category. Used by all of Work.
- **Recurrence util** — recurrence is currently re-implemented 3–4× (Reservations, Maintenance, Tasks, Jobs), each carrying the documented `setMonth` month-end footgun. One tested `nextOccurrence()` util, used everywhere.
- **Comments subcollection** primitive (already similar across hubs — consolidate).

---

## 7. Pricing simplification

### 7.1 The problem with today's pricing

8 hubs à la carte ($5–$9 each) + a $29 all-in bundle + Team seat tiers ($9/$19) = a 9+ SKU matrix for a tiny, price-sensitive, consolidation-weary market. The research is blunt: churches resent pricing complexity and default to all-in. The per-hub matrix suppresses conversion more than it captures revenue. And once unification lands, "hubs" barely exist as separable products anyway.

### 7.2 Proposed: two lines, flat

| Tier | What | Price |
|---|---|---|
| **Free** | Inventory (items, supplies, reservations) — the "stuff is free" promise, forever | **$0** |
| **ChurchOpsHub** (paid) | *Everything else*: Work (tasks + maintenance + contractor + shifts), People Access, Insights, Accountability — unlimited or generous users | **~$19/mo flat** (recommend; was $29 all-in) — or **$190/yr** |

- **Kills:** per-hub à-la-carte, the Team seat tiers (just include generous/unlimited users), and the Coordination Hub as a SKU (fold bundles into Inventory, move the email toggle into the notification-preferences surface).
- **Why $19:** a clean "we simplified *and* dropped the price" story, psychologically under $20, still ~80% under eSPACE's cheapest single module ($99/mo). $15 is the more aggressive adoption play; $29→$19 is the more conservative one. **Owner's call** — see open decisions.
- This is framed as **launch-phase pricing to grow the base** while the unified product and premier features mature; revisit once they land.

### 7.3 Billing schema & access-control change

- `config/subscription` collapses from per-hub booleans + `maxUsers` tiers to `plan: 'free' | 'pro'` (+ user cap if any).
- `useSubscription.hasHub(x)` collapses to `isPro()`. `UpgradeGate` becomes a single gate.
- **Decouple `allowedHubs` from billing.** It currently does double duty (billing gate *and* per-user access). After flat pricing, billing doesn't need it — but **keep `allowedHubs` for per-user access control** (the volunteer-only shell still needs "this user only sees Shifts"). Just stop reading it in billing logic.
- **Grandfathering:** existing à-la-carte subscribers migrate to `pro`. Anyone currently paying *more* than the new flat price drops to it (goodwill); the existing `grandfathered: true` mechanism covers edge cases. 90-day trial unchanged. Document the migration in `docs/BUSINESS_MODEL.md`.

---

## 8. Phased delivery plan

Smallest-risk-first. Each phase ships independently and leaves the app working.

### Phase 0 — Shared primitives (internal, no UX change)
Extract the shared board engine + recurrence util (§6). Ship behind the existing Maintenance/Tasks UIs unchanged. De-risks everything after and immediately cuts duplicate code. **No data migration, no rules change.**

### Phase 1 — Contractor hours / time tracking (ships value FAST)
`trackedPeople.personType` + `hourlyRate`; `timeEntries` collection + rules + indexes; "Log time" on existing tasks/tickets + a standalone Timesheet view; approval + cost rollup + CSV. Lands John's contractor tracking **without waiting for full unification.** Link-to-maintenance `actualCost` auto-sum included.

### Phase 2 — Unify Tasks + Maintenance into `workItems`
Introduce `workItems` with `category`. Migrate `tasks` + `maintenanceTickets` (Admin SDK script, dry-run + idempotent). New rules + indexes (probe in prod — `firebase deploy --only firestore:indexes` silently skips two index kinds). Old collections kept read-only one release for rollback. UI: one Work board with category filter; Maintenance/Tasks nav entries point at it.

### Phase 3 — Fold Jobs/volunteer shifts into Work
Migrate `jobListings` (+ signups/waitlist) → `workItems` `category:'shift'`, preserving sign-up/waitlist/compliance/public-board/SMS/attendance/swaps. `assignmentMode` toggle replaces the convert features. Public board route compatibility-aliased.

### Phase 4 — UI convergence + retire hub boundaries
One "Work" area with the six views (§5). Remove separate hub navigation. Delete the convert-features and their backref fields. Delete the now-dead duplicate board files.

### Phase 5 — Pricing simplification
Flatten `config/subscription` to `plan`, collapse `hasHub`→`isPro`, decouple `allowedHubs` from billing, retire Coordination as a SKU, migrate + grandfather existing subscribers, update Stripe products, update `docs/BUSINESS_MODEL.md` + LandingPage pricing copy.

### Adjacent cleanups to fold in along the way
- **Fix the Insights 100-entry activityLog ceiling** (paid analytics silently lose history — do this in/near Phase 2).
- Retire **Coordination Hub** (Phase 5): bundles → Inventory, email toggle → notification prefs.
- Drop **Jira-grade task extras** that aren't labor (task *dependencies* `blockedBy`; keep time-tracking now that it's contractor payroll, keep subtasks only if used).

---

## 9. What this lets us delete

- One of the two ~80%-duplicate board engines (Maintenance/Tasks).
- The `convert→Job`/`convert→Task`/`convert→Ticket` feature + its `linked*DocId` backrefs.
- Task dependencies (`blockedBy`).
- Coordination Hub as a SKU.
- The per-hub billing matrix + Team seat tiers + most of `hasHub`/`allowedHubs`-in-billing logic.
- 2–3 redundant recurrence implementations.

---

## 10. Risks & mitigations

- **Big refactor of three mature, audited hubs with live data + E2E.** → Phased, dry-run migrations, old collections kept read-only one release, E2E updated per phase (the suite already covers Jobs/Maintenance/Tasks heavily — extend, don't rewrite).
- **Firestore index gaps ship silently** (documented: `firebase deploy --only firestore:indexes` skips COLLECTION-scope composites + COLLECTION_GROUP field overrides). → Prod-probe every new query; the `missingIndex:true` Sentry tag is the backstop.
- **Pricing migration angering existing payers.** → Nobody pays *more*; over-payers drop to flat; grandfather edge cases; clear comms.
- **Scope creep into push-based volunteer rostering.** → Explicitly out of scope (§4); the unified model *enables* it later without committing to it now.
- **The "yet another tool" market headwind** is unchanged by this plan — it's addressed by the *integration* work in the broader roadmap, not here.

---

## 11. Open decisions (need owner sign-off)

1. **Flat price:** $19/mo (recommended, conservative) vs. $15/mo (aggressive adoption) vs. other. Annual discount? (lean: ~2 months free → $190/yr)
2. **Does Inventory stay free, or does the free tier shrink/grow?** (Recommend: stays free, generous user cap — it's the wedge + the SEO winner.)
3. **Shift numbering:** keep `JOB-###` for continuity, or re-prefix to `SHF-###`? (Recommend: keep `JOB-` to avoid breaking references; just relabel "Jobs" → "Shifts/Volunteer" in UI.)
4. **Keep SMS?** Big A2P compliance burden. Recommend **keep** *only because* shifts/volunteer reminders are now a core, broadly-used surface (not just a teen board) — the burden is finally justified. Confirm.
5. **Subtasks:** keep or cut? (Depends on whether FXCC actually uses them.)
6. **Contractor self-logging:** can a linked contractor log their own hours (admin approves), or admin-only entry? (Recommend: support both; default admin-entry.)

---

## 12. Relationship to the broader "premier app" roadmap

This plan is the **foundation** — it consolidates the sprawling middle of the product so the differentiators land cleanly. After (or alongside) it, the strategy review's premier-making features apply, on top of the unified base:

- **Unified notification center + push + install prompt** (reuse Court Climber's FCM) — the Coordination email toggle's new home.
- **Global search** across items, people, work, contractors.
- **Integration story** (Google Calendar subscribe; Planning Center People sync) — the real answer to "yet another tool."
- **Deepen the compliance wedge** (background-check integration; serving-readiness dashboard) — now reinforced because compliance gates *all* work, not just Jobs.
- **AI "what needs attention this week"** (reuse MasteryHelp's Claude pattern) — overdue work, expiring certs, low stock, unfilled shifts, contractor hours vs. budget.

The unified Work model makes every one of those *cheaper* to build, because there's one work surface to search, notify on, sync, gate, and summarize — instead of three.
