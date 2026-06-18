# Foundation 5 — Scheduled-Occurrences Feed — Implementation Plan (2026-06-18)

**Spec:** `docs/PLATFORM-FOUNDATIONS-2026-06-06.md` §Foundation 5 + §Cross-environment code sharing + §Build order (item 5).
**Goal:** one canonical `Occurrence` contract + per-source adapters + a single `getOccurrences()` aggregator, so the calendar views, the ICS/Google-Calendar feed, "this week" surfaces, reminders, and the future event-day ops view all read *one* shape of "a dated thing" instead of each re-deriving it per collection.

F5 follows the proven F2/F4 pattern: a pure ESM lib (`src/lib/`) + a CJS server twin (`functions/lib/`) pinned by a parity test sharing fixtures. Prerequisites are in place (recurrence math already DRY; F4 shipped same day). It is decoupled from the Phase-2 legacy-strip soak (2026-06-24).

---

## The recon surprise — what F5 is *actually* consolidating

The backlog one-liner ("canonical `Occurrence` + `getOccurrences()`; **kill duplicate recurrence impls**") is half-stale:

- **Recurrence math is ALREADY consolidated.** `src/utils/date.js` (`advanceOnce`/`calculateNextDue`/`generateRecurrenceDates`, month-end clamp correct) + its parity-tested CJS twin `functions/lib/recurrence.js` already killed the `setMonth` footgun. The CLAUDE.md warning naming "inlined math in MaintenancePage/ReservationsPage" is stale — every call site routes through the shared util. **Nothing to do here.**
- **COH materializes recurrence into per-date docs.** Shift series (`addJobListingSeries`), reservation series (`generateRecurrenceDates` → one `reservations` doc per date), and task/maintenance recurrence (spawn-next-on-completion) all write **one doc per occurrence date**. So `getOccurrences` is a pure **adapter + range-filter over already-dated docs** — *not* a read-time recurrence expander. (The spec's "expands recurrence via the shared util" is aspirational for a push-based model COH explicitly rejected; documented here so nobody "adds the missing expansion.")

So the real, present duplication F5 removes:

1. **No canonical `Occurrence` shape** — every dated thing is read per-collection with its own field (`eventDate` / `scheduledDate` / `dueDate`), all `YYYY-MM-DD` strings.
2. **ICS builders are twinned but per-record-shape** — client `src/utils/ical.js` knows tasks+jobs; server `functions/lib/ics.js` knows jobs+reservations+maintenance. No single `Occurrence → VEVENT` mapping; each type has a bespoke builder. (Also a real divergence: the client job export includes a `Pay:` line the server feed omits.)
3. **`JobCalendar` (JobsPage) is a hand-rolled near-duplicate** of the shared `BoardCalendar` (Tasks+Maintenance) — it predates the `dateField`/`renderChip` seams that already make `BoardCalendar` generic.
4. **"Overdue / This Week / Next 30 / Later" windowing is triplicated** — `BoardCalendar`, `JobCalendar`, `VolunteerHome` each recompute `today` / `+7` / `+30`.
5. **Cadence enums forked 3 ways** — `boardUI.jsx` `RECURRENCE_OPTIONS`, `JobsPage.jsx`'s own copy, and inline `<option>`s in `ReservationsPage.jsx` (the last missing quarterly + annually).

---

## The contract

```
Occurrence = {
  id,            // stable: `${sourceType}:${sourceId}`
  sourceType,    // 'reservation' | 'shift' | 'work' | 'maintenance_due'
  sourceId,      // source doc id
  title,         // normalized SUMMARY (eventName/title/name → title)
  start,         // YYYY-MM-DD — the placement date (what calendars bucket on)
  startTime,     // 'HH:MM' or null  (null ⇒ all-day)
  end,           // YYYY-MM-DD or null (multi-day all-day span end, e.g. reservation returnDate)
  endTime,       // 'HH:MM' or null
  allDay,        // boolean (= startTime == null)
  location,      // string or null
  link,          // deep-link query/path into the app, or null
  // render/feed-support extras (beyond the minimal spec shape, needed by ICS + ops view):
  description,   // pre-joined DESCRIPTION body string or null (adapter builds it, incl. per-consumer bits)
  priority,      // numeric iCal PRIORITY (1/5/9) or null — only `work` (tasks) sets it today
  uid,           // the identifier part of the ICS UID (human number ?? docId)
  status,        // source status (for callers that color/skip; adapters apply the terminal skips)
}
```

- `sourceType 'work'` = scheduled/due **tasks**; `'maintenance_due'` = maintenance ticket due-dates. The four types map 1:1 to the four ICS UID domains (`@churchopshub-tasks/-jobs/-reservations/-maintenance`).
- Each domain contributes a **pure adapter** `Xto Occurrences(records, opts) → Occurrence[]`. One `getOccurrences(ctx, opts) → Occurrence[]` runs all hub-relevant adapters, filters to a range.
- `ctx` = already-subscribed arrays (client) or freshly-`.get()`'d snapshots (server) — adapters operate on plain arrays, they do **not** fetch (mirrors the F2/F4 contract).
- **Terminal-status skip lives in the adapters**, matching today's ICS feed exactly: shifts skip `cancelled`, reservations skip `denied`, maintenance skip `Complete`/`Cancelled`, **tasks skip nothing** (the client task export currently exports completed-with-due-date tasks too — preserved).

## Cross-environment decision

Identical to F4's blessed hybrid: **two thin twins pinned by a parity test sharing fixtures.**
- `src/lib/occurrences.js` (ESM) and `functions/lib/occurrences.js` (CJS) — adapters + `getOccurrences` + the `Occurrence → VEVENT` / `buildCalendar` builders.
- The ICS string primitives (`escICS`/`dateToICS`/`addOneDay`/`timeToICS`) move into `occurrences.js` (one owner per side); `src/utils/ical.js` imports them rather than keeping its third copy.
- No shared JSON needed (unlike F4) — there are no cross-env *numeric thresholds* here, only the date logic, and that's covered by the parity test. (The cadence-option **labels** unify in Phase D into the existing `boardUI.jsx` list, a client-only concern.)

## File layout

```
src/lib/occurrences.js              ← Occurrence shape, adapters, getOccurrences, Occurrence→VEVENT + buildCalendar (ESM, pure)
functions/lib/occurrences.js        ← CJS twin (server ICS feed + future reminder/ops consumers)
functions/test/occurrences.test.mjs ← unit + parity suite (shared fixtures; client≡server; ICS byte-parity vs legacy)
```
`functions/lib/ics.js` is absorbed into the twin (its per-type builders become the `Occurrence → VEVENT` mapping); `src/utils/ical.js` shrinks to adapter→build→download wrappers.

## Adapter mapping (legacy builder → canonical, byte-parity preserved)

| Adapter | sourceType | Legacy source | Parity notes |
|---|---|---|---|
| `reservationsToOccurrences` | `reservation` | `ics.js reservationEventLines` | all-day; `end = returnDate ?? eventDate`; title `eventName ?? purpose`; desc `purpose(≠name)/Ministry/Status`; skip `denied` |
| `shiftsToOccurrences` | `shift` | `ics.js jobEventLines` + client `exportJobsICS` | timed-or-all-day + `+1h` fallback; desc always has `n/m spots filled`; **`opts.includePay`** adds the client-only `Pay:` line; skip `cancelled` |
| `maintenanceToOccurrences` | `maintenance_due` | `ics.js maintenanceEventLines` | all-day; title `name`; desc `description/Priority/Status`; skip `Complete`/`Cancelled` |
| `tasksToOccurrences` | `work` | client `exportTasksICS` | all-day; `priority` → iCal 1/9/5; desc `description` only; **no status skip** |

## Phases (build-order spec item 5; ICS-feed-first like F4 was dashboard-first)

- **Phase A** — `src/lib/occurrences.js`: contract + 4 adapters + `getOccurrences` + `Occurrence→VEVENT`/`buildCalendar`; unit tests in `functions/test/occurrences.test.mjs`. No UI change. JSON-free; verify it bundles in Vite (`build`) and loads in Node (`test:unit`).
- **Phase B** — `functions/lib/occurrences.js` CJS twin; refactor `icsCalendarFeed` to **fetch (same cutoff query) → adapt → buildCalendar** (replacing the 3 `ics.js` builders). Parity test: client≡server `getOccurrences`/VEVENT over shared fixtures **and** ICS output **byte-identical** to the legacy `ics.js` builders across a fixture battery (the no-regression gate). Deploy `icsCalendarFeed`; re-probe invoker IAM (onRequest webhook — see CLAUDE.md Gen-2 strip pitfall).
- **Phase C** — client consumers. (C1) `src/utils/ical.js` `exportTasksICS`/`exportJobsICS` rebuilt on the shared adapters + `Occurrence→VEVENT` (client passes `includePay:true`); downloaded `.ics` byte-identical to today (one benign convergence: a title-less shift now summarizes as "Shift" not blank). (C2) **Revised after recon:** `JobCalendar` has legitimately diverged from `BoardCalendar` (collapsible mobile groups, accessible expand/collapse buttons, full-spots amber highlight, `status==='open'` overdue predicate). A full component merge would regress Jobs or balloon `BoardCalendar` across 3 live calendars — and the Occurrence contract is for the *cross-source feed*, not single-hub calendars (which need raw domain objects for their chrome). So instead dedup the genuinely-shared **logic** into a pure, unit-tested `src/utils/calendarGrid.js` (`monthMatrix` + `windowGroups` with an injectable overdue predicate) and refactor `BoardCalendar` + `JobCalendar` (+ the `VolunteerHome` windowing) onto it, each keeping its own chrome. **Strict behavior parity** on live calendar surfaces — gets a verify pass.
- **Phase D** — make `boardUI.jsx` `RECURRENCE_OPTIONS` the single cadence list; `JobsPage` + `ReservationsPage` import it (Reservations gains quarterly + annually). Docs: CHANGELOG, backlog F5→shipped, this plan closed, `whatsNew.js` entry (the new Reservations recurrence options **are** user-visible), de-stale the CLAUDE.md `setMonth`/recurrence note.

## Out of scope for F5

- **Google Calendar two-way sync** — F5 produces the read feed; 2-way is its own backlog item.
- **Event-day ops view** — a consumer of `getOccurrences`, built later.
- **Read-time recurrence expansion** — COH materializes per-date docs; do not add it.
- **Notification/reminder senders onto `getOccurrences`** — the senders already work off the materialized docs; rewiring them through the aggregator is a later optional cleanup, not a foundation requirement.

## Status

- [x] **Phase A** — contract + adapters + getOccurrences + VEVENT builder + unit tests (2026-06-18). `src/lib/occurrences.js` (4 adapters + `getOccurrences` + `occurrenceToVEvent`/`buildCalendar`, pure ESM). `functions/test/occurrences.test.mjs` (12 tests) asserts the new VEVENT mapping reproduces the legacy `functions/lib/ics.js` per-type builders byte-for-byte. test:unit 43/43, build clean.
- [x] **Phase B** — CJS twin + icsCalendarFeed refactor + parity tests + deploy (2026-06-18). `functions/lib/occurrences.js` (CJS twin). `icsCalendarFeed` rebuilt as fetch (same cutoff query) → adapt → `buildCalendar` (the 3 `ics.js` per-type builder call-sites removed; `ics.js` retained as the golden byte-parity reference for the test only). Parity test: client≡server `getOccurrences`/VEVENT/`buildCalendar` over shared fixtures (incl. includePay + range) **and** server twin ≡ legacy `ics.js`. test:unit 45/45. Deployed `icsCalendarFeed`; invoker IAM re-probed (no-param GET → 400 function-message, not GFE 403 = intact). No church has a `feedToken` set, so no live feed consumer exists today (byte-identical output anyway).
- [x] **Phase C** — client ICS exports + calendar logic-dedup (2026-06-18). (C1) `src/utils/ical.js` `exportTasksICS`/`exportJobsICS` now build VEVENTs via the shared adapters + `occurrenceToVEvent` (client `includePay:true`); kept the distinct client VCALENDAR wrapper. One benign convergence: title-less shift → "Shift" not blank. (C2) extracted `src/utils/calendarGrid.js` (`monthMatrix` + `windowGroups` w/ injectable overdue predicate); refactored `BoardCalendar` (Tasks/Maintenance) + `JobCalendar` (Jobs) onto it, each keeping its own chrome. `VolunteerHome` left as-is (its "next shift / open this week" shape isn't the 4-bucket windowing). `functions/test/calendar-grid.test.mjs` (4 tests). test:unit 49/49, lint 0-err (added 0 warnings), build clean. **Browser verify pass** (e2e-test-church, real job): Jobs calendar desktop grid + chip ✓, mobile collapsible groups + bucketing + collapse toggle ✓, 0 console errors.
- [ ] **Phase D** — cadence-enum unification + docs.
