# Google Calendar Sync — Plan (2026-06-24)

**Goal:** Turn the slow, one-way ICS feed into a **real-time push** of reservations into a church's
Google Calendar via the Calendar API — so a booking appears in GCal *seconds* after it's made, not
hours later. Direct follow-on to the room-calendar initiative (Phases 0–6 + room-scoped inventory).

## Decisions (owner, 2026-06-24)

| Fork | Decision | Implication |
|---|---|---|
| **Direction** | **Start one-way (COH→GCal), design for two-way** | Ship real-time push now; COH is source of truth. Lay the data hooks (`gcalEventId` mapping, calendar/channel slots) so GCal→COH writeback is additive later, not a rewrite. |
| **Calendar model** | **One church calendar** | An admin connects ONE Google account (OAuth); COH creates + syncs a dedicated calendar in it. Others view/subscribe to that calendar. Simplest token surface. |
| **Entity scope** | **Reservations only** (first cut) | Rooms are the calendar-shaped data and the direct continuation. Jobs/maintenance can be added later (the ICS feed already carries them; the API mapping reuses the same F5 adapters). |

**Positioning:** unchanged from the room calendar — COH is the **booking system of record**. The API
sync just makes the GCal mirror *instant* instead of *eventually-consistent*. The existing
`icsCalendarFeed` **stays** as the no-auth fallback for Apple Calendar / Outlook / churches that don't
connect Google.

---

## ⚠️ The one big non-code gate: Google OAuth app verification

A public, multi-church SaaS that writes to users' Google Calendars uses a **sensitive** OAuth scope.
Google requires **OAuth consent-screen verification** before arbitrary Google accounts can grant it
(app name, logo, domain ownership, scope justification, demo video; review takes days–weeks).

- **While in "Testing" mode** the app works *without* verification for a small allowlist of users
  (≤100). So **FXCC can use this immediately** by adding their Google account as a test user — we can
  build and ship the whole thing for FXCC before any verification.
- **Rolling out to all churches** requires publishing the consent screen + passing verification.
- **Scope choice minimizes blast radius:** use **`https://www.googleapis.com/auth/calendar.app.created`**
  (least privilege — the app can only create and manage calendars *it* created; it can never see the
  user's existing calendars/events). This is the smallest scope that still lets us create the dedicated
  "ChurchOpsHub" calendar and write events to it, and it gives the gentlest consent prompt. It is still
  a sensitive scope for verification purposes, but it avoids the **restricted**-scope security
  assessment that the full `calendar` scope can trigger. Confirm the live classification in Cloud
  Console when adding the scope (the console labels each scope non-sensitive/sensitive/restricted).

**Action implied:** Phase 0 is Google Cloud Console work (OAuth client + consent screen + enable
Calendar API). Build/ship for FXCC under Testing mode; treat full verification as a separate
go-to-market gate before opening it to all churches.

---

## Architecture (aligned with COH conventions)

- **Dependency-free `fetch`, no SDK.** COH already calls Brevo, Twilio, and Claude with bare `fetch`
  and no client libraries (see CLAUDE.md). Do the same for Google: OAuth token exchange/refresh via
  `POST https://oauth2.googleapis.com/token`, calendar/event ops via the Calendar REST API
  (`https://www.googleapis.com/calendar/v3/...`). **Do NOT add `googleapis`** (heavy dep, cold-start
  cost, breaks the established pattern).
- **Push is a Firestore trigger, not a client call.** An `onDocumentWritten` trigger on
  `churches/{cid}/reservations/{rid}` is the right substrate: it catches *every* write path (manual,
  auto-approve, recurring series, server-side cancels) and is exactly where inbound 2-way reconciliation
  would later hang. Client never talks to Google directly.
- **Reuse the F5 reservation mapping.** `functions/lib/occurrences.js` already turns a reservation into
  the canonical `Occurrence` (title, location=roomName, timed-vs-all-day, terminal-status skips). Build
  the Google **event resource** from that same `Occurrence` so the API event and the ICS VEVENT never
  drift. Add an `occurrenceToGcalEvent(occ, tz)` next to `occurrenceToVEvent`.
- **Mapping field = forward-compat for 2-way.** Store `gcalEventId` on each reservation after
  `events.insert`. Updates → `events.patch`; cancel/deny/delete → `events.delete`. This id map is also
  how a future watch-channel reconciles an inbound GCal change back to its COH doc.
- **Timezone:** use `config/settings.timeZone` (default America/Chicago), same source the scheduled
  sends already use.

### New/changed surfaces
- **Config doc** `churches/{cid}/config/gcalSync` (rules: **CF/Admin-SDK only, client read denied** —
  it holds the refresh token). Fields: `connected`, `connectedByEmail`, `calendarId`,
  `refreshToken` (sensitive — locked doc v1; note encryption-at-rest as a hardening follow-up),
  `scope`, `connectedAt`, `lastError`, plus unused-in-v1 slots for 2-way (`channelId`, `resourceId`,
  `channelExpiration`, `syncToken`).
- **Cloud Functions:**
  - `gcalAuthStart` (onCall, admin) → returns the Google consent URL (state = churchId, signed).
  - `gcalAuthCallback` (onRequest, public) → exchanges `code` → refresh token; creates the dedicated
    calendar (`calendars.insert` "ChurchOpsHub — <church>"); writes `config/gcalSync`; backfills
    existing upcoming reservations.
  - `gcalDisconnect` (onCall, admin) → revoke token + delete the synced calendar (or just unlink) +
    clear config.
  - `onReservationWriteSyncGcal` (Firestore trigger) → upsert/delete the GCal event; writes back
    `gcalEventId`. Idempotent; skips churches without `config/gcalSync.connected`.
  - Shared `functions/lib/gcal.js` — token refresh, REST helpers, `occurrenceToGcalEvent`.
- **Settings → Calendar Feed card:** add a **"Connect Google Calendar"** block (admin) showing
  connected status / connected account / Disconnect, sitting above the existing ICS feed (which stays).

---

## Phases

### Phase 0 — Google Cloud setup (console, no app code) — *needs owner*
Enable Calendar API; create an **OAuth 2.0 Web client** (authorized redirect = the `gcalAuthCallback`
URL); configure the consent screen with the `calendar.app.created` scope; add FXCC's Google account as
a **test user** (so it works pre-verification). Store client id/secret in `functions/.env`
(`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`).

### Phase 1 — Connect / disconnect flow
`gcalAuthStart` + `gcalAuthCallback` + `gcalDisconnect`; `config/gcalSync` doc + locked rules; Settings
UI block with status. Creates the dedicated calendar on connect. **Probe the onRequest callback for the
Gen-2 `allUsers` invoker strip** (CLAUDE.md pitfall) after deploy.

### Phase 2 — Push engine (the core)
`functions/lib/gcal.js` (token refresh + REST + `occurrenceToGcalEvent`); the reservations Firestore
trigger doing insert/patch/delete with `gcalEventId` write-back; backfill on connect. Honor
terminal-status skips (denied/cancelled → delete from GCal). Timezone-aware. Recurring series = N
individual events (COH already materializes per-date docs — matches F5; do NOT use GCal RRULE in v1).

### Phase 3 — Hardening + UX honesty
Token-refresh failure → mark `connected:false` + `lastError` + Sentry + a Settings banner ("Reconnect
Google Calendar"). Backoff on 429/5xx; idempotent upserts. Update Help + What's New: the feed is now
**instant** for connected churches (vs the "polls every few hours" note we just shipped — that stays
true for the ICS path). `whatsNew.js` benefit-first entry.

### Phase 4 — (FUTURE, not now) Two-way
Watch channel (`events.watch`) → push webhook → reconcile inbound changes by `gcalEventId`; sync-token
incremental pulls; channel renewal cron; conflict policy (COH-wins vs last-writer-wins). All additive on
the Phase-1 config slots + the `gcalEventId` map — no rewrite. Revisit only if staff actually manage
bookings from inside Google Calendar.

---

## Testing
- **Unit (pure):** `occurrenceToGcalEvent` — timed vs all-day, location/summary/description, terminal
  skips, timezone. Sits beside the existing F5 occurrence tests.
- **Emulator/manual:** Cloud Functions aren't emulated locally (they hit real Google), so test the
  trigger + OAuth against the `e2e-test-church` tenant or FXCC in Testing mode. Verify: connect →
  calendar created; create a reservation → event appears in GCal within seconds; edit → event moves;
  cancel → event removed; disconnect → token revoked.
- **Build/lint:** clean before every push (0-error baseline).

## Known pitfalls to respect
- **OAuth verification gate** (above) — the real rollout blocker; build under Testing mode first.
- **Gen-2 `allUsers` invoker strip** on `gcalAuthCallback` (onRequest) — curl-probe after deploy.
- **Refresh-token storage** is sensitive — locked Firestore doc v1; encryption-at-rest is a follow-up.
- **Dependency-free fetch** — do not pull in `googleapis` (breaks the codebase pattern + cold starts).
- **Keep the ICS feed** — it's the no-auth path for Apple/Outlook + unconnected churches.
- **Don't drift the mapping** — build GCal events from the F5 `Occurrence`, same as the VEVENTs.

## Suggested sequencing
Phase 0 (owner, console) → 1 (connect) → 2 (push) → 3 (harden) is the shippable one-way release for
FXCC. Verification + all-church rollout, and Phase 4 two-way, are separate later gates.
