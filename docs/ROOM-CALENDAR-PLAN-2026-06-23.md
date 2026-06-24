# Room & Calendar Scheduling — Plan (2026-06-23)

**Goal:** Turn COH Reservations from a *date-only equipment/room request list* into a true
**room-scheduling calendar** that beats Google Calendar at the things GCal can't do
(conflict-proof booking, resource model, setup/teardown buffers, approval-or-instant-book),
while **continuing to feed Google Calendar** so FXCC members can look in *either* place.

**Positioning decision (owner, 2026-06-23):** COH is the **booking system of record**;
Google Calendar is a **read-only mirror** fed by the existing ICS feed. Members may live in
either surface. We do *not* try to out-calendar Google Calendar's grid/mobile/notifications —
we own the booking intelligence underneath and publish the result to GCal.

---

## ▶ STATUS (updated 2026-06-24) — read this first

The per-phase detail below is the **original spec**. This block is **what actually shipped** + where
it diverged. Prereq: the **Hub Restructure** (`docs/HUB-RESTRUCTURE-PLAN-2026-06-23.md`, commit
`089f373`) ran first — Reservations is now a free **hub** (Hubs → Reservations Hub), not a top-tab.

| Phase | Status | Commit | Notes / deviations |
|---|---|---|---|
| **0** — times through the pipeline | ✅ shipped | `f287df2` | `reservationsToOccurrences` (both twins) emits timed VEVENTs; date-only stays byte-parity |
| **1** — timed booking + time-aware conflicts | ✅ shipped | `f287df2` | pure `src/utils/reservationConflict.js` (`findRoomConflict`/`effectiveWindow`) |
| **Spaces best-practices** (extra) | ✅ shipped | `1eed963` | attendance+capacity warning, per-space approvers, blackout dates, weekly blocked hours, room photo, day-of contact. `roomUnavailability()` hard-blocks bookings in blackout/blocked windows |
| **2** — month calendar view | ✅ shipped | `e9b863b` | `ReservationCalendar`: List\|Calendar toggle, month grid color-by-room + legend, mobile `windowGroups`, room/ministry filters. Day detail = **inline expand** (chips open the reservation), not a separate timeline panel |
| **3a** — buffers UI + per-room color | ✅ shipped | `075c809` | tucked-away "+ Add setup/teardown time"; room defaults pre-fill; color swatch picker (calendar reads `room.color`) |
| **3b** — series editing | ✅ shipped | `acb0b2f` | Delivered as **cancel-with-scope** (Just this one / This & future / Entire series), NOT field-editing (no single-edit flow exists to extend). **NO gcloud index needed** — reservations are fully subscribed, so `seriesCancelTargets()` filters in-memory + batches by docId |
| **ICS feed fix** | ✅ shipped | `0d374b5` | feed excluded `'denied'` lowercase only → real `'Denied'`/`'Cancelled'` leaked into GCal; now case-insensitive, excludes both |
| **4** — auto-approve / instant-book | ✅ shipped | `0d374b5` | church `reservationAutoApprove` (admin/mgr/approver → Approved on create) + per-space `bookingPolicy:'open'` (anyone). Conflicts+availability still enforced. `addReservation` honors `res.status` |
| **5** — one-click "Add to Google Calendar" | ✅ shipped | _this session_ | Settings → Calendar Feed: **Add to Google Calendar** button (`calendar.google.com/calendar/r?cid=<webcal-encoded feed URL>`) beside copy-URL + honest in-app note on GCal's slow (hours) ICS refresh. **Optional per-room `?room=<roomDocId>` feed DONE** — `icsCalendarFeed` filters reservations to one room (reservations-only, room-titled calendar) and the Manage Spaces editor surfaces a per-space "Add to Google Calendar" + copy link. Timed VEVENTs already carry room in `LOCATION` (Phase 0). HelpPage "Calendar feed" accordion + `whatsNew.js` updated |
| **6** — cross-hub moat | ⬜ queued | — | book room → hold equipment → auto-create setup task. **Prereq: equipment is NOT tied to rooms** — converge `rooms` ↔ `settings.locations` (two parallel place-models, latent debt) |

**Test/verification baseline:** 77 pure unit tests (`npm run test:unit` — `reservation-conflict.test.mjs`
+ `occurrences.test.mjs`); every phase smoke-tested via Firebase emulator + Playwright. Build + lint clean.
All changes additive — **no Firestore rule or migration changes** across the whole effort.

**Live recall:** memory `project_coh_room_calendar` (in `~/.claude/.../memory/`) holds the same status
+ the equipment-not-tied-to-rooms Phase-6 prereq. CHANGELOG has dated entries per phase.

---

## Why this is mostly assembly, not new construction

The expensive infrastructure already exists and is parity-tested:

| Capability | Already built | Where |
|---|---|---|
| **Timed ICS/VEVENT output** | ✅ Shifts already emit `DTSTART:<time>`/`DTEND:<time>` | `src/lib/occurrences.js` `occurrenceToVEvent` + `timeToICS` |
| **Public calendar feed** | ✅ `icsCalendarFeed` serves reservations to any GCal/Apple/Outlook subscriber | `functions/index.js` |
| **Calendar grid primitives** | ✅ `monthMatrix` + `windowGroups` (used by Jobs/Work calendars) | `src/utils/calendarGrid.js` |
| **Series recurrence (materialized per-date docs)** | ✅ + the shared `generateRecurrenceDates` engine | `src/utils/date.js`, ReservationsPage |
| **Request → Approve/Deny + email + notify** | ✅ live today | `ReservationsPage.jsx` |
| **Date-overlap conflict detection** | ✅ live today (needs to become *time*-aware) | `ReservationsPage.jsx` `handleAdd` |
| **Rooms as resources** (name/capacity/location/amenities/active) | ✅ `rooms` collection + Settings → Spaces | `useFirestore.js`, DATA_MODEL |
| **Additive fields are free** | ✅ write path spreads `...res`; rule is `isMember` (no key allowlist) | `useFirestore.js:521`, `firestore.rules:182` |

The single biggest reason reservations look "all-day" in GCal today is one line:
`reservationsToOccurrences` hardcodes `allDay: true, startTime: null`. Populate those and the
existing VEVENT builder produces real timed events automatically.

---

## The four real gaps (what this plan closes)

1. **No times.** `eventDate`/`returnDate` are dates. Can't book the hall 9a–12p *and* 6p–9p
   same day; conflict check is date-granular and would falsely collide them. **Foundation.**
2. **No visual calendar in-app.** Reservations is a vertical card list. People want a
   month/week grid, color-coded by room.
3. **No setup/teardown buffers.** PCO Calendar's headline feature and the #1 real-world
   conflict source ("clear the room 30 min before the next event").
4. **Approval is mandatory + manual.** Every booking is Pending until a human approves —
   the bureaucracy complaint. Trusted leaders should be able to instant-book (still
   conflict-checked).

---

## Scope decisions (lock these before building)

- **Times are a ROOM feature.** Equipment reservations stay date-range (checkout→return over
  days). The form already branches on `resourceType`; time inputs appear only in the room branch.
- **Single-day timed vs. multi-day all-day.** If `eventDate === returnDate` (or no returnDate),
  the booking is timed (start/end time). If it spans multiple days (lock-in, camp), it's treated
  as an all-day span — same as today. Keeps the model and conflict math simple and matches reality.
- **Buffers are internal/conflict-only.** The ICS event published to GCal = the *actual* event
  time (what people attend). Setup/teardown shrink availability for conflict detection and show
  in-app, but don't bloat the public calendar event.
- **One-way feed only (COH → GCal).** True two-way Google Calendar sync (OAuth, GCal API) stays
  the separate, already-parked backlog item. "Feed Google Calendar" = the ICS subscribe path.
- **Color by room** (assigned palette + per-room override), not by ministry. Filters cover ministry.

---

## Data model changes

### `reservations` (room bookings — additive, backward-compatible)
| Field | Type | Notes |
|---|---|---|
| `startTime` | `"HH:MM"` 24h, nullable | null ⇒ all-day (matches shift pattern: `allDay = !startTime`) |
| `endTime` | `"HH:MM"` 24h, nullable | |
| `setupMinutes` | int, default `0` | buffer before; prefilled from room default |
| `teardownMinutes` | int, default `0` | buffer after |

No `allDay` column — infer from `startTime` presence (consistent with `occurrences.js`).
Existing date-only docs have `startTime` undefined ⇒ render exactly as today. **No migration.**

### `rooms` (resource config — additive)
| Field | Type | Notes |
|---|---|---|
| `color` | hex string, nullable | calendar color; falls back to palette-by-index |
| `defaultSetupMinutes` / `defaultTeardownMinutes` | int, default `0` | prefill booking buffers |
| `bookingPolicy` | `'request'` \| `'open'`, default `'request'` | `'open'` ⇒ managers/admins auto-approve |

### `config/settings` (church-level — additive)
| Field | Type | Notes |
|---|---|---|
| `reservationAutoApprove` | bool, default `false` | admins/managers' room bookings skip Pending → Approved (conflict still enforced) |

**No Firestore rule changes** (rule is `isMember` for read/create/update; additive fields pass).
**No write-function changes** (`addReservation`/`updateReservation` spread `...res`/`updates`).

---

## Phased implementation

### Phase 0 — Foundation: time-through-the-pipeline (no visible UI yet)
1. **`src/lib/occurrences.js` `reservationsToOccurrences`** — populate `startTime`/`endTime`;
   set `allDay = !r.startTime`; pass `end: r.returnDate || null`. Mirror the shift adapter exactly.
2. **`functions/lib/occurrences.js`** (CJS server twin) — identical change.
3. **`functions/test/occurrences.test.mjs`** — add timed-reservation fixtures; keep client≡server
   + the byte-parity assertions green. (All-day reservations must still byte-match the legacy feed.)
4. **`docs/DATA_MODEL.md`** — document the new reservation/room/settings fields in the same commit.

*Exit:* a reservation with times, written by hand, shows as a timed event in the GCal feed.
Everything else behaves exactly as before.

### Phase 1 — Times in the booking form + time-aware conflicts
1. **New Reservation modal (room branch):** add **Start time / End time** inputs + an **All day**
   toggle (checked ⇒ clears times, current behavior). Validate end > start.
2. **Time-aware conflict detection** — replace the date-overlap check in `handleAdd` with a pure
   helper `roomConflict(candidate, existing)`:
   - All-day on a shared date ⇒ conflict (blocks the room that day).
   - Both timed, same single day ⇒ overlap of **effective** windows
     `[start − setupMinutes, end + teardownMinutes]`.
   - Multi-day spans ⇒ all-day date-overlap (today's logic).
   - Apply to both the single booking *and* every occurrence of a recurring series (already looped).
3. **Display times** on cards + detail modal; "all day" when none.
4. **Extract `roomConflict` + buffer math to a pure module** (`src/utils/reservationConflict.js`)
   with unit tests — this is the load-bearing correctness piece.

*Use `localDateStr` (never `toISOString`) and the shared recurrence engine — see Known Pitfalls.*

### Phase 2 — Calendar view
1. **List | Calendar toggle** on `ReservationsPage` (mirror JobsPage's view tabs).
2. **Month grid** via `monthMatrix`, bookings color-coded by room, room legend, filters
   (room / ministry / status). Click a day ⇒ day detail = chronological timeline of that day's
   bookings (with buffer bands shown lighter).
3. **Mobile:** `windowGroups` grouped list (This Week / Next 30 / Later), as Jobs does.
4. *(Stretch, Phase 2.5)* **Week view with time rows** (room columns) — the gold-standard room
   schedule. Month grid is the MVP; defer the time-grid unless leaders ask.

### Phase 3 — Setup/teardown buffers UI + room defaults + series editing
1. **Buffer inputs** in the booking form, prefilled from the room's `defaultSetup/Teardown`.
2. **Settings → Spaces (room manager):** add `color`, `defaultSetupMinutes`,
   `defaultTeardownMinutes`, `bookingPolicy` editors.
3. **Series editing parity with Jobs Hub:** edit *this* / *this-and-future* / *all*, and
   skip/cancel a single occurrence. Reuse the Jobs pattern **and** pre-create the
   `(recurrenceGroupId, eventDate)` **COLLECTION-scope** composite index via `gcloud` — see the
   Known Pitfall about `firebase deploy` silently skipping COLLECTION-scope composites.

### Phase 4 — Auto-approve / kill the bureaucracy
1. `config/settings.reservationAutoApprove` (admin toggle) **and/or** per-room
   `bookingPolicy: 'open'`.
2. When the booker is admin/manager *and* policy permits, write `status: 'Approved'` directly
   (still run conflict detection first). Regular members keep the request → approve flow.
3. Notify relevant managers of an auto-approved booking (FYI, not action-required).

### Phase 5 — Google Calendar feed polish (the "either location" promise)
1. **Settings → Calendar Feed:** add a one-click **"Add to Google Calendar"** subscribe link
   (`https://calendar.google.com/calendar/r?cid=<webcal-encoded feed URL>`) alongside copy-URL.
2. Reservation VEVENTs already carry room in `LOCATION` + title; confirm the timed output renders
   well in GCal/Apple.
3. *(Optional)* per-room feed via a `?room=<id>` query param on `icsCalendarFeed` so a ministry
   can subscribe to just their room.
4. **Honest UX note** (Help + What's New): Google polls subscribed ICS feeds slowly (often
   several hours, occasionally up to ~24h). For instant reflection, members use COH directly;
   GCal is the eventually-consistent mirror. (Faster/2-way = the parked GCal-API project.)
5. **`whatsNew.js`** benefit-first entry + **HelpPage** section.

### Phase 6 — Cross-hub integration (the real moat — optional follow-up)
The booking can know what the *event* needs — something neither GCal nor PCO ties together:
- From a room booking: **"reserve equipment for this event"** (link an inventory checkout for the
  date) and **"create a setup task"** (Work board, due that morning) with linked backrefs.
- "Book the gym → hold the projector → setup task auto-created" as one flow.
This is its own scoped follow-up after the core lands; flagged here so the schema stays compatible.

---

## Testing

- **Unit (pure):** `reservationConflict.js` — all-day blocks, timed overlap, buffer-extended
  overlap, multi-day spans, recurring-series occurrences. Buffer arithmetic edge cases (midnight
  rollover, end==start).
- **Parity:** `functions/test/occurrences.test.mjs` — timed reservation client≡server + ICS
  byte-parity; all-day reservations still byte-match the legacy feed.
- **E2E (Playwright):** book a room with times; second overlapping booking is rejected with the
  conflict message; non-overlapping same-day booking succeeds; calendar view renders the booking
  on the right day; auto-approve path lands `Approved`.
- **Rules:** `npm run test:rules` unchanged (additive fields; no rule change) — confirm still green.
- **Build/lint:** `npm run build` + `npm run lint` (0-error baseline) before every push.

---

## Index considerations

- **Calendar month/week views need NO new index** — `reservations` is fully subscribed in
  `useFirestore` and filtered client-side.
- **Series editing** (`recurrenceGroupId, eventDate`) needs a **COLLECTION-scope** composite.
  `firebase deploy --only firestore:indexes` *silently skips* COLLECTION-scope composites when a
  COLLECTION_GROUP index shares the field list — create via `gcloud` and **probe the query in
  prod** after deploy (see Known Pitfalls). Phase 3 only.

---

## Known pitfalls to respect (from CLAUDE.md)

- **`toISOString()` off-by-one** in US timezones → always `localDateStr`.
- **`setMonth()` month-end rollover** → use the shared `advanceOnce`/`generateRecurrenceDates`
  engine, never inline month math.
- **`mangle:false` / TDZ** → declare all `useState`/derived values *before* any `useEffect` that
  references them; don't shadow imports.
- **Keep the `occurrences.js` client/server twins in lockstep** — the parity test enforces it.
- **COLLECTION-scope index skip** for series queries (Phase 3).
- **GCal ICS refresh latency** is environmental, not a bug — document it, don't chase it.

---

## Suggested build order / sequencing

Phase 0 → 1 → 2 are the coherent first release ("our Reservations is now better than our Google
Calendar"). 3 → 4 → 5 round it out. 6 is the differentiator and a separate follow-up.

A natural first shippable cut = **Phase 0 + 1 + the month-grid half of Phase 2**: times,
time-aware conflicts, and a color-coded month calendar that still feeds Google Calendar with real
timed events. That alone delivers the headline promise.
