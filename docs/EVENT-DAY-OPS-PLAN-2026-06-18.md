# Event-Day Ops View — Implementation Plan (2026-06-18)

**Spec:** `docs/PLATFORM-FOUNDATIONS-2026-06-06.md` consumer matrix — "Event-day ops view" (Work ● People ● Occurrences ● Attention ○). The first premium feature built on top of the just-shipped foundations (F2 People resolver, F4 Attention, F5 Scheduled-Occurrences).
**Goal:** a single-screen, admin/manager console for one day — cross-sources everything happening that day (volunteer shifts + who's serving + their compliance readiness, room reservations, due/scheduled work + maintenance) so ops staff stop bouncing between the Jobs schedule, Reservations, and the work boards.

This is a **consumer** of the foundations, not new infrastructure: `getOccurrences` is the cross-source spine, `getPerson`/`isEligibleFor` (F2) give per-volunteer readiness, and the hub-gating mirrors the F4 per-collector self-suppression pattern.

---

## Design (settled with the user 2026-06-18)

- **Entry point:** a top-level **"Event Day" tab** (desktop label "Event Day", mobile "Event" 🗓️), shown only to **admins/managers** in the standard (non-volunteer) shell. Not a paid hub — it spans jobs/reservations/maintenance/people_access, so it lives as a first-class console, not a HubsPage card. The render branch is gated by the same admin/manager condition.
- **Day navigator:** defaults to **today**; prev/next-day arrows, "Today", a one-tap **"Sunday"** (the upcoming Sunday, = today if today is Sunday), and a native date input.
- **Sections (each self-suppresses by hub — no all-or-nothing `UpgradeGate`):**
  1. **Serving today** *(needs `jobs`; readiness needs `people_access`)* — each shift that day (time/location/spots), and under it the **roster** with a per-person readiness badge: ✓ cleared / ⚠ expiring soon / ✗ not eligible for *that shift's* `requiredAccessTypes`.
  2. **Rooms & reservations** *(free base — always shown)* — spaces in use that day, event name, ministry, status.
  3. **Due today** *(`maintenance`/`tasks`, each gated)* — work + maintenance with a due date that day.
- **Reservations are part of the free Inventory base**, so the tab is meaningful for any admin/manager even with no paid hubs; the other sections appear as their hubs activate.

## How it's built on the foundations

- **F5 spine:** `getOccurrences({reservations, jobListings, tasks, maintenance}, { range: { start: day, end: day } })` → one `Occurrence[]` across all four source types for the day. Sections split it by `sourceType` (`shift`/`reservation`/`work`/`maintenance_due`). The adapters already skip terminal statuses (cancelled/denied/Complete), which is exactly right for "what's actually happening today." Shift occurrences join back to the raw `jobListings` doc by `sourceId` for `requiredAccessTypes` + the roster path.
- **Roster reads (the hard part):** there is NO church-wide `collectionGroup('signups')` subscription that rules allow (the wildcard collection-group rule only grants `uid==me`). The rule-allowed path for an admin/manager is the **church-scoped** `churches/{id}/jobListings/{jobId}/signups` (passes `canSeeJobRoster` → `isChurchAdminOrManager`). So the view does **N bounded per-shift `getDocs`** (one per today's shift with `signupCount>0`) — reusing JobsPage's existing card-roster pattern (`JobsPage.jsx` ~818–841). Signup docs already carry `name` + `uid`.
- **F2 readiness:** per signed-up uid → `getPerson(makeRef('user', uid), { users, accessPeople, accessRecords, today: day })` for name + `complianceStatus`, then `isEligibleFor(person, job.requiredAccessTypes, accessRecords, day)` for the shift-specific flag. Reuses the same logic as the People Access Readiness view — no re-derivation.
- **Gating:** `hasHub(...)` per section (admin/manager sees all church hubs, so `hasHub` suffices).

## Phases

- **Phase 1** — `src/pages/EventDayPage.jsx` scaffold + the "Event Day" tab in `App.jsx` (desktop + mobile, gated render branch) + day navigator + the three cross-source sections from `getOccurrences`, with the **shift list as summaries only** (roster deferred to Phase 2). Build + browser verify.
- **Phase 2** — roster reads for today's shifts + per-person compliance readiness badges under each shift (the centerpiece). Build + browser verify with a real shift + signup + compliance record.
- **Phase 3** — docs (CHANGELOG, backlog → shipped, `whatsNew.js`, CLAUDE.md layout/tab) + final build/lint/test + verify. Commit + push.

## Out of scope for v1 (deferred)

- **Attention strip** (F4 — unfilled-today, expired-comp-serving-today) — fast follow once v1 lands.
- **Print / "run sheet" export** of the day.
- **Editing from the console** (sign someone up, mark attendance) — v1 is read/triage; deep-links to the Jobs hub cover actions.
- **Volunteer-facing version** — this is an ops console; volunteers keep `VolunteerHome`.

## Status

- [ ] **Phase 1** — scaffold + tab + day nav + cross-source sections (summary).
- [ ] **Phase 2** — roster + compliance readiness.
- [ ] **Phase 3** — docs + final verify.
