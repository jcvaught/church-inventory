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
| **ChurchOpsHub** (paid) | *Everything else*: Work (tasks + maintenance + contractor + shifts), People Access, Insights, Accountability — unlimited or generous users | **$15/mo flat** (LOCKED 2026-06-06) — or **$150/yr** |

- **Kills:** per-hub à-la-carte, the Team seat tiers (just include generous/unlimited users), and the Coordination Hub as a SKU (fold bundles into Inventory, move the email toggle into the notification-preferences surface).
- **$15 LOCKED (2026-06-06).** Down from the $29 all-in — a clean "we simplified *and* dropped the price" story, under $20, still ~85% under eSPACE's cheapest single module ($99/mo). Adoption-first while the product matures.
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

## 8.5 Production cutover safety — Tasks AND Jobs are in ACTIVE daily use

⚠️ **Hard constraint (owner, 2026-06-06):** multiple staff (incl. John) use Tasks daily, and the Jobs Hub has live shifts with real volunteers signed up. The migration **cannot lose or corrupt in-progress work, and cannot interrupt a volunteer's upcoming shift / its reminders.** The data-migrating phases (P2, P3) run in a **scheduled maintenance window — Thursday evening** — never ad-hoc.

### The cutover pattern (per migrating phase: backfill → verify → flip)

1. **Backfill while the old collection still serves the app.** Run the idempotent Admin SDK migration to copy `tasks`/`jobListings` → `workItems`. The app keeps reading the *old* collections — users see no change. Verify counts + spot-check records.
2. **Maintenance window (Thursday evening).** Flip the app into **read-only/maintenance mode** (see the meantime work — this banner/toggle gets built first, as safe prep). A short, friendly banner: *"ChurchOpsHub is updating — back in ~20 minutes. Finish your current edit and we'll be right back."*
3. **Re-run the idempotent migration** to capture any writes that landed between backfill and the window (catches the last-minute task edit).
4. **Verify** (counts match, numbering counters carried over, signups/waitlist subcollections intact, no orphans).
5. **Flip the UI read path** to `workItems` in one deploy. Lift maintenance mode.
6. **Old collections kept read-only for one full release** as a rollback escape hatch. Delete only after a clean week.

### Rules specific to this app

- **Do Tasks and Jobs on SEPARATE Thursdays.** Tasks first — it's internal/lower-stakes. Jobs second, once Tasks has run clean for a week — it's external (volunteers) and higher-stakes.
- **Pick the Jobs window with the reminder crons in mind.** `sendJobReminders` (church-local 8am), `sendNewJobsDigest` (local noon), and `closePastJobs` (2am Central) run on schedules; the window must **not** be near a shift date and **not** overlap those fire times. A Thursday evening is clear of all three. Confirm no shift is scheduled for the migration evening / next morning before flipping.
- **Numbering counters (`maxTaskNumber`, `maxJobNumber`, etc.) must migrate** so post-cutover items don't collide with existing `TSK-`/`JOB-` numbers.
- **Signups/waitlist subcollections and `acknowledgedWaiverAt` must carry over verbatim** — a volunteer who already signed up and accepted the waiver must stay signed up, with their reminder still queued.
- **E2E green before the window and again after the flip.** The suite already covers Tasks/Maintenance/Jobs heavily — extend it to assert the migrated shape, don't rewrite.
- **Index gotcha:** every new `workItems` query needs its composite/collection-group indexes built *before* the flip (the `missingIndex:true` Sentry tag is the backstop). Build + prod-probe them during backfill, not in the window.

### What is SAFE to ship outside a window (no data migration)

Everything in the "meantime" list (§13) is **purely additive** — new collections (`timeEntries`), new read-only surfaces (search, notifications, calendar feed), or isolated fixes (Insights ceiling). None of it restructures `tasks`/`jobListings`, so it ships on the normal cadence with no maintenance window. Only P2/P3/P5 need the Thursday-evening treatment.

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

## 11. Open decisions

1. ~~**Flat price**~~ — **RESOLVED 2026-06-06: $15/mo flat (or $150/yr).**
2. **Does Inventory stay free, or does the free tier shrink/grow?** (Recommend: stays free, generous user cap — it's the wedge + the SEO winner.) — still open, lean stays free.
3. **Shift numbering:** keep `JOB-###` for continuity, or re-prefix to `SHF-###`? (Recommend: keep `JOB-` to avoid breaking references; just relabel "Jobs" → "Shifts/Volunteer" in UI.) — still open.
4. ~~**Keep SMS?**~~ — **RESOLVED 2026-06-06: KEEP.** Shifts/volunteer reminders are now a core, broadly-used surface, so the A2P burden is justified.
5. **Subtasks:** keep or cut? (Depends on whether FXCC actually uses them.) — still open.
6. **Contractor self-logging:** can a linked contractor log their own hours (admin approves), or admin-only entry? (Recommend: support both; default admin-entry.) — still open.

---

## 12. Relationship to the broader "premier app" roadmap

This plan is the **foundation** — it consolidates the sprawling middle of the product so the differentiators land cleanly. After (or alongside) it, the strategy review's premier-making features apply, on top of the unified base:

- **Unified notification center + push + install prompt** (reuse Court Climber's FCM) — the Coordination email toggle's new home.
- **Global search** across items, people, work, contractors.
- **Integration story** (Google Calendar subscribe; Planning Center People sync) — the real answer to "yet another tool."
- **Deepen the compliance wedge** (background-check integration; serving-readiness dashboard) — now reinforced because compliance gates *all* work, not just Jobs.
- **AI "what needs attention this week"** (reuse MasteryHelp's Claude pattern) — overdue work, expiring certs, low stock, unfilled shifts, contractor hours vs. budget.

**Reuse from the portfolio (don't build from scratch):**
- Court Climber's **FCM push + 3-channel (in-app/push/email) announcements** → the notification center (#4).
- Court Climber's **"Game Day" single-screen ops console** → an optional **event-day ops view** in Work: one screen showing every shift, setup task, and assignment for a given Sunday/event, with live status — a natural extension of the unified Work model and a strong differentiator.
- MasteryHelp's **Claude API integration pattern** → the AI "what needs attention" digest.
- The shared **Stripe customer-portal** pattern (already in COH via `createPortalSession`).

The unified Work model makes every one of those *cheaper* to build, because there's one work surface to search, notify on, sync, gate, and summarize — instead of three.

---

## 13. "Meantime" work — safe to ship NOW, no maintenance window

While the risky unification (P2/P3) waits for its Thursday-evening windows, all of the following are **purely additive** and touch live Tasks/Jobs data only by reading it — so they ship on the normal cadence. Ordered by value × safety.

### Tier A — start now
1. ✅ **SHIPPED 2026-06-06 — App-wide maintenance/announcement banner.** Global owner-controlled `appConfig/banner` doc → `GlobalBanner` in the shell + owner control in Settings. Dark by default; maintenance (red/non-dismissible) + announcement (teal/dismissible). The cutover safety-net. See CHANGELOG 2026-06-06.
2. ✅ **SHIPPED 2026-06-06 — Contractor hours / Timesheet (Phase 1).** People Access `personType`+`hourlyRate`; new `timeEntries` collection + CRUD; Timesheet view (log hours → cost from rate, group by person + date range, approve, CSV). Admin/manager-only. Additive, no migration. See CHANGELOG 2026-06-06. *(Deferred follow-ups: contractor self-logging; auto-sum a time entry into a linked maintenance ticket's `actualCost`.)*
3. ✅ **SHIPPED 2026-06-06 — Global search / command palette (Cmd/Ctrl+K).** Read-only omnisearch across items, people, tasks, maintenance, jobs, supplies, reservations; jumps to the right area. Frontend-only, no index. See CHANGELOG 2026-06-06.
4. **Notification center + push (FCM) + PWA install prompt.** Reuse Court Climber's FCM. New in-app inbox + a single notification-preferences page (the future home of the Coordination email toggle). Additive; reads existing events. High "feels premier" payoff. **⚠️ External dependency:** web push needs an FCM **VAPID / Web Push certificate key** from the Firebase console — the in-app inbox + prefs can be built without it; push delivery can't.

### Tier B — strong, slightly more scoped
5. **Fix the Insights 100-entry activityLog ceiling** + **emailed weekly Insights digest.** First the correctness bug (analytics silently lose history past 100 actions; touches only Insights). Then ship a weekly emailed digest (low-stock, warranty-expiring, utilization) — the data is already computed in-app, it just never leaves; pairs naturally with the notification surface (#4).
6. **Google Calendar subscribe (live ICS feed).** Read-only feed URL for reservations/jobs/maintenance so they appear in the church's calendar automatically. First, safe step of the integration story.
7. **Compliance: serving-readiness dashboard + proactive expiry digests.** Additive to People Access; deepens the stickiest wedge.

### Tier C — decoupled / can wait
8. **Pricing flatten to $15** is *technically* independent of the Work migration (it touches `config/subscription` + billing gates, not Tasks/Jobs data) and could ship on its own with grandfathering — but it reads cleaner *paired* with unification ("one product, one price"). Recommend doing it in P5 unless there's a reason to drop the price sooner.
9. **AI "what needs attention this week."** Bigger; has a natural home inside the notification/digest surface (#4), so sequence it after that.
10. **Planning Center People sync.** Larger integration; defer until after the calendar feed proves the integration appetite.

**Recommended immediate order:** #1 (maintenance banner) → #2 (contractor hours) → #3 (search) → #4 (notifications/push). That delivers John's contractor need, builds the cutover safety net, and lands two premier-feel features — all before the first migration window.
