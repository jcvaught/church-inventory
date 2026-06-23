# Work Merge — Tasks + Maintenance into one Board (scoped Phase 4)

**Drafted:** 2026-06-23
**Owner:** John (jvaught@fxcc.org)
**Status:** PLAN — not started. The data foundation is done (see below); this is the UI merge.
**Supersedes:** the Tasks+Maintenance portion of Phase 4 in `WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md`. **Jobs is explicitly OUT of scope** (deferred indefinitely — see §6).

---

## 0. Where this sits

The Work-unification keystone had two halves: a **data** merge and a **UI** merge.

- **Data merge — DONE.** Tasks + maintenance live in one `churches/{id}/workItems` collection (one doc per item, `type: 'task' | 'maintenance'`). Phase 2 cutover ran 2026-06-17; **Part C cleanup ran 2026-06-23** — the `workItemsEnabled` flag and all legacy `tasks`/`maintenanceTickets` read/write branches were stripped from `useFirestore.js` + the Cloud Functions, and the legacy collections were deleted from prod. The hook now reads `workItems` unconditionally and still exposes **separate `tasks` and `maintenanceTickets` arrays** (split by `type`) so the two existing pages are unchanged.
- **UI merge — THIS PLAN.** Collapse `TasksPage.jsx` (~131 KB) and `MaintenancePage.jsx` (~76 KB) — two ~80%-duplicate board engines — into **one "Work" board** with a **Tasks / Maintenance toggle**, while preserving today's per-user access scoping exactly.

The payoff is primarily **engineering** (kill one duplicate board engine; delete the task↔maintenance convert feature) and a clean base for later Work features. For a user scoped to a single category, the visible UX barely changes — and that's the point: **nobody who sees only one category today should see more after the merge.**

---

## 1. Hard requirements (owner, 2026-06-23)

These are acceptance criteria, not nice-to-haves:

1. **Per-user scoping is preserved at CATEGORY granularity.** A user whose `allowedHubs` includes `'maintenance'` but not `'tasks'` sees **only maintenance** work; a `'tasks'`-only user sees **only tasks**. Do **not** collapse `'tasks'` and `'maintenance'` into a single `'work'` access key.
2. **New users can still be scoped to one or the other.** The invite flow keeps offering `'tasks'` and `'maintenance'` as independent invite scopes; a new user invited to only one sees only that one. (Mechanism today: `register({ allowedHubs: inviteData?.hubs ?? null })` in `App.jsx`; `userCanSeeHub()` gates on `allowedHubs.includes(hubName)`. **Unchanged.**)
3. **Users allowed BOTH get one board with a Tasks/Maintenance toggle** (filter/segmented control), not two nav entries.
4. **Jobs is untouched** — separate collection, separate hub, separate experience (§6).

---

## 2. The unified board

One `WorkPage` (working name) replacing the two hub pages, parameterized by category:

- **Shared engine** (the ~80% that's already identical): Kanban / List / Calendar views, card, columns-by-status, assignees, due dates, comments, checklists, photos, recurrence, numbering, bulk actions, CSV/ICS export, saved filter views.
- **Category toggle** at the top: **All · Tasks · Maintenance** (the "All" option only appears for users allowed both). Persisted per-user in `localStorage` (mirror the existing `lastHub` pattern).
- **Category-specific surfaces stay conditional on the item's `type`:**
  - **Maintenance (`type:'maintenance'`)** — linked asset (`linkedItemId`), vendor, `estimatedCost`/`actualCost` (fed by contractor `timeEntries`), `MNT-` numbering, **admin/manager-create only**, "Contractor Work" section.
  - **Tasks (`type:'task'`)** — visibility (private/team/shared), `TSK-` numbering, **any-member-create**, @-mention comments, task templates, ministry field.

### Create-gating by category (important)
The two categories have **different create permissions** (maintenance = admin/manager; tasks = any member). On one board this must be enforced **per selected category**, not per page:
- The "＋ New" affordance offers only the categories the user may both *see* (`allowedHubs`) **and** *create* (role). A `user`-role person allowed maintenance can view maintenance but **cannot** create it (today's rule) — preserve that.
- Firestore rules already enforce the split server-side (`core-collections.test.mjs` covers "workItems maintenance-vs-task create split"); keep those green.

---

## 3. Access-control wiring (the load-bearing part)

The single rule: **the board filters its visible items by the categories the user's `allowedHubs` permits**, exactly the way the top-level hub nav is filtered today.

- Keep `'tasks'` and `'maintenance'` as distinct `allowedHubs` keys and distinct `HUB_DEFS`/`userCanSeeHub` entries.
- Map each key → a category the board may show: `'tasks'→'task'`, `'maintenance'→'maintenance'`.
- On mount, compute `allowedCategories` from `allowedHubs` (admins/`null` → both). The board renders only those categories; the toggle only offers those categories; single-category users are auto-filtered and the toggle is hidden (or shown disabled, labeled to their slice).
- **Labeling:** a single-category user's nav entry / board header can keep reading **"Maintenance"** or **"Tasks"** so nothing feels renamed. Only a both-allowed user sees the merged **"Work"** label + toggle.
- **Volunteer-only shell** (`isVolunteerOnly` = `role:user` + `allowedHubs===['jobs']`) is unaffected — it's a jobs concern.

### Nav options for both-allowed users (decide at build)
- **(a)** One "Work" hub entry replacing the two Tasks/Maintenance cards in `HubsPage` (recommended — matches the merge intent).
- **(b)** Keep two entries that both deep-link into the one board pre-filtered (lower-disruption fallback).
Recommendation: **(a)**, with single-category users still seeing their familiar single label via the category→label mapping.

---

## 4. What gets deleted

- One of the two duplicate board engines (`TasksPage.jsx` / `MaintenancePage.jsx` → one `WorkPage`).
- The **task ↔ maintenance convert feature** (`→ Ticket` on Tasks, and any task-from-maintenance path) + its `linkedTicketDocId`/`linkedTaskDocId` *task↔maintenance* back-refs. Within one board, "make this task a maintenance item" is a `type` flip, not a linked spawn. **(NB: `linkedJobDocId`/`linkedTaskDocId` to/from Jobs stay — Jobs is still separate.)**

---

## 5. Delivery sketch (smallest-risk-first)

1. **Extract the shared board engine** behind the two existing pages (no UX change) — if not already shared enough. De-risks everything after.
2. **Build `WorkPage`** consuming both `tasks` + `maintenanceTickets` arrays, with the category toggle + `allowedCategories` filter + per-category create-gating.
3. **Route single-category users** into it pre-filtered + labeled; route both-allowed users to the toggle.
4. **Swap nav** (`HubsPage`/`App.jsx`) to the chosen option in §3.
5. **Delete** the old pages + the task↔maintenance convert feature + dead back-ref fields.
6. **E2E:** extend the existing Tasks/Maintenance specs to assert the merged board + the scoping invariants (maint-only sees no tasks; tasks-only sees no maintenance; both sees the toggle); keep `test:rules` green.

---

## 6. Out of scope — Jobs (deferred indefinitely)

Jobs/shifts stays its own `jobListings` collection and its own hub. The two-collection decision (`WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` §0/§11 #7) already made folding Jobs an independent, optional step — nothing here forecloses it. Jobs is the mature, audited, date-driven, externally-facing (volunteers/teens) surface; merging it is higher-risk and not currently wanted. The Jobs↔Task convert/link feature and the `?jobs=` public board are **untouched**.

---

## 7. Risks

- **Create-permission regression** — easy to grant maintenance-create to a `user` by accident on the merged board. Mitigation: per-category create-gate + the existing rules tests.
- **Scoping regression** — collapsing to a single `'work'` key would over-expose. Mitigation: §3's category-granular rule is the explicit acceptance criterion; E2E asserts it.
- **Label churn anxiety** — keep single-category labels familiar via the category→label map.
