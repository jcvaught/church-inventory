# ChurchOpsHub — Platform Foundations & Architecture Contracts

**Drafted:** 2026-06-06
**Status:** ARCHITECTURE SPEC — defines the shared "sockets" that premier features plug into. Build features *against* these contracts; do not reinvent them per-feature.
**Companion docs:** `WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` (the migration), `LOCAL-TESTING-AND-REVERT-2026-06-06.md` (how to build/test/revert safely).

---

## Why this doc exists

The premier features (notifications, global search, AI "what needs attention," calendar/integration, deepened compliance, emailed digests) **overlap heavily**. If each is built in isolation against whatever exists the day we start it, we'll reinvent the same plumbing four times and recreate the fragmentation we're deleting from Tasks/Maintenance/Jobs — just at the *platform* layer instead of the *data* layer.

The fix is not to build everything at once (the live data forbids it). The fix is to **design the cross-cutting seams once, as contracts**, and then deliver features incrementally against those contracts. The coherence lives in the shared substrate, not in simultaneous delivery.

Almost all the overlap collapses onto **six foundations**. Build these as the platform; everything else is a UI or a consumer on top.

---

## The consumer matrix (the whole point)

Which feature depends on which foundation. Read it as: *"to ship the row, the checked foundations must already exist (or be designed forward-compatibly)."*

| Feature ↓ / Foundation → | 1 Work | 2 People | 3 Notify | 4 Attention | 5 Occurrences | 6 Search |
|---|---|---|---|---|---|---|
| Work board (tasks+maint) | ● | ● | ○ | | ○ | |
| Contractor hours / Timesheet | ○(link) | ● | | ○ | | |
| Volunteer shifts | ● | ● | ● | | ● | |
| People Access / compliance | | ● | ● | ● | | |
| **Notification center** | | ● | ● | ● | | |
| **Global search** | ● | ● | | | | ● |
| **AI "what needs attention"** | ● | ● | ● | ● | ○ | |
| **Emailed Insights digest** | | | ● | ● | | |
| Dashboard cards | ○ | | | ● | ● | |
| Calendar view | ● | | | | ● | |
| **Google Calendar / ICS feed** | | | | | ● | |
| Maintenance / shift reminders | ● | ● | ● | | ● | |
| Low-stock / warranty alerts | | | ● | ● | | |
| Event-day ops view | ● | ● | | ○ | ● | |

● = hard dependency, ○ = soft/optional. **Foundations 3 (Notify) and 4 (Attention) are the highest-fan-in** — 7 and 6 consumers — which is exactly why building them once is the difference between coherence and re-fragmentation.

---

## Foundation 1 — The Work model (`workItems`)

**Canonical contract** (full spec in the migration plan §2): one `churches/{churchId}/workItems/{id}` collection with `category` (task | maintenance | shift), `assignmentMode` (assigned | open), category-specific fields, a `comments` subcollection, and (for shifts) `signups`/`waitlist` subcollections. Numbering is per-category-prefixed (`TSK-`/`MNT-`/`SHF-`).

**Producers:** the Work board, the shift composer, recurrence expansion.
**Consumers:** board, timesheet (links), search, notifications, attention engine, calendar, occurrences, event-day ops view.

This is the data spine. Everything below references a work item by id, or a person, or a date — never a hub.

---

## Foundation 2 — The People model

**The seam:** a human in a church can be an **app user** (`users/{uid}`, has auth + role + `allowedHubs`), a **tracked person** (`trackedPeople/{id}` in People Access — may have no login, carries compliance/key records), a **contractor** (tracked person + `hourlyRate`), and/or a **volunteer** (a user who signs up for shifts). Today these are separate shapes referenced inconsistently. Contractor hours, compliance gating, work assignment, shift sign-ups, and search all need to point at "a person" uniformly.

**Contract — `PersonRef` + resolver:**
- A `PersonRef` is the shared reference shape used *everywhere* a human is referenced:
  ```
  PersonRef = { kind: 'user' | 'tracked', id, displayName }
  ```
- A resolver `getPerson(churchId, ref) → Person` returns a uniform view regardless of backing store:
  ```
  Person = {
    ref,                      // PersonRef
    displayName,
    roles: Set<'admin'|'manager'|'member'|'volunteer'|'contractor'|'staff'>,
    linkedUserId?,            // if a tracked person is linked to a user account
    hourlyRate?,              // contractors
    contact?,                 // email/phone
    complianceStatus?,        // { ok, expiringSoon[], missing[] } — from People Access
  }
  ```
- **The user↔tracked link is canonical.** People Access already links a tracked person to a user account; that link means "same human." The resolver collapses a linked pair into one `Person` so a contractor who's also a user, or a volunteer who's also tracked for compliance, is *one* logical person — never double-counted.

**Backing stores stay as they are** (`users` for auth, `trackedPeople` for non-users). We are **not** merging the collections — we're adding the reference shape + resolver layer so features stop hand-rolling "is this a user or a tracked person?" logic.

**Producers:** People Access (tracked people, links, compliance), auth (users).
**Consumers:** contractor time entries (`personId` is a `PersonRef`), work assignment (`assigneeRefs[]`), shift sign-ups, compliance gating, search, attention engine (whose certs expire), event-day ops view.

---

## Foundation 3 — Notification, delivery & preferences layer

**The seam (highest fan-in):** today notifications are scattered — the Coordination `enabled` boolean gates some emails; Jobs/Tasks/maintenance each have their own per-CF opt-ins and scheduled senders; SMS lives only in Jobs; there is **no in-app inbox and no push.** Seven+ features need to send something. They must all go through one layer or we get seven preference models and seven Brevo/Twilio call sites.

**Contract — one `notify()` service (Cloud Functions side):**
```
notify({
  churchId,
  recipients,        // PersonRef[] (resolver knows their channels + prefs)
  type,              // a registered EventType (see registry)
  title, body,
  link,              // deep-link into the app
  data?,             // type-specific payload
})
```
`notify()` resolves each recipient's preferences for `type`, then fans out to the enabled channels. **Every sender in the app routes through this** — `sendJobReminders`, `sendTicketAssignedEmail`, `sendTaskMentionEmail`, compliance-expiry alerts, low-stock alerts, the AI digest, the emailed Insights digest. The Brevo (email), Twilio (SMS), FCM (push), and in-app-write plumbing — plus `emailSuppressions` and the `withScheduledRun` heartbeat — all live *inside* the layer.

**Channels:**
- **In-app inbox** → write `churches/{churchId}/notifications/{id}` = `{ recipientUid, type, title, body, link, read:false, createdAt }`. The notification-center UI is just a live query on this with a per-user unread count.
- **Push** → FCM (reuse Court Climber's setup; tokens on `users/{uid}.fcmTokens[]`).
- **Email** → Brevo (existing `sendViaBrevo`).
- **SMS** → Twilio A2P Messaging Service (existing, KEEP per decision).

**Preferences — one model:** `users/{uid}.notificationPrefs` = `{ [eventType]: { inApp, push, email, sms } }` with sensible per-type defaults. **One preferences page** edits this (it absorbs the retired Coordination email toggle). Defaults: in-app on for everything; email on for assignments/reminders/digests; SMS on only for shift reminders (opt-in, A2P); push on once granted.

**EventType registry — the canonical list** (one source of truth, drives prefs UI + defaults):
```
work.assigned · work.due_soon · work.overdue · work.comment_mention
shift.reminder · shift.signup · shift.waitlist_promoted · shift.cancelled · shift.swap_requested
compliance.expiring · compliance.expired · key.outstanding
inventory.low_stock · inventory.warranty_expiring · reservation.decided · reservation.pending
contractor.over_budget
digest.weekly · digest.insights
```

**Producers:** every domain that needs to tell a human something.
**Consumers:** notification center, preferences page, push, email, SMS — all UIs/channels over the one layer.

---

## Foundation 4 — The Attention engine

**The seam:** "what needs attention" (overdue work, expiring certs, outstanding keys, low stock, warranty expiring, unfilled shifts, pending reservations, contractor over budget) is computed today only as ad-hoc dashboard cards. The notification center, the AI weekly digest, and the emailed Insights digest all need the *same* list. If each recomputes "is this overdue/expiring/low?", they drift.

**Contract — a canonical `AttentionItem` + collectors:**
```
AttentionItem = {
  id, kind,            // 'work_overdue' | 'cert_expiring' | 'key_outstanding'
                       // | 'low_stock' | 'warranty_expiring' | 'shift_unfilled'
                       // | 'reservation_pending' | 'contractor_over_budget' | ...
  severity,            // 'info' | 'warning' | 'critical'
  title, link,
  dueDate?, count?,    // e.g. "3 items low" or "cert expires 2026-07-01"
  subjectRef?,         // PersonRef / itemId / workItemId
}
```
- Each domain contributes a **pure collector** `collectX(churchId, data) → AttentionItem[]`. A single `computeAttention(churchId, opts) → AttentionItem[]` aggregates all collectors.
- **Thresholds live in ONE shared config** (`attentionThresholds`: due-soon window, cert-expiring window, low-stock %, budget overage %). Both the dashboard and the digests read the same config, so even if computation runs in two places they can't drift. This shared-config rule is the no-drift guarantee.

**Where it runs (cross-environment note — read Foundation §"Sharing"):** the dashboard recomputes client-side from already-subscribed data; the digests/notifications recompute server-side in a scheduled CF. The *collector logic* should be the shared pure functions; if full code-sharing across `src/`↔`functions/` proves impractical, the **thresholds config must still be shared** and the two impls covered by the same test fixtures.

**Producers:** every domain (work, compliance, inventory, shifts, contractor budget).
**Consumers:** dashboard cards, notification center (urgent items → `notify()`), AI weekly digest, emailed Insights digest.

---

## Foundation 5 — The Scheduled-Occurrences feed

**The seam:** reservations, shifts, scheduled/due work, and maintenance due-dates are all "dated things." The calendar view, the Google Calendar/ICS feed, the dashboard "this week," and reminders all need them — currently each reads its own collection with its own date logic, and recurrence is re-implemented per hub.

**Contract — a canonical `Occurrence` + aggregator:**
```
Occurrence = {
  id, sourceType,      // 'reservation' | 'shift' | 'work' | 'maintenance_due'
  sourceId, title,
  start, end?, allDay,
  location?, link,
}
getOccurrences(churchId, range) → Occurrence[]   // expands recurrence via the shared util
```
Recurrence expansion uses the **one shared `nextOccurrence()` util** (Foundation prep, migration plan §6) — killing the 3–4 duplicated `setMonth`-footgun implementations.

**Producers:** reservations, shifts, scheduled work.
**Consumers:** calendar view, ICS/Google Calendar subscribe feed, dashboard "this week," reminder senders, event-day ops view.

---

## Foundation 6 — The Search index (lighter, downstream)

**Contract — a `SearchableEntity` shape + per-domain adapters:**
```
SearchableEntity = { id, type, title, subtitle, keywords[], link }
```
Each domain provides an adapter mapping its records → `SearchableEntity[]`. For small-church scale, build the index **client-side over the already-subscribed collections** (no new maintained index collection, no extra Firestore cost). Global search / command palette is a UI over the merged adapter output. Downstream of Foundations 1 + 2 (search is much simpler once Work is unified).

---

## Cross-environment code sharing (a real constraint — decide once)

COH today **duplicates logic** between `src/` (Vite/ESM, browser) and `functions/` (Node/CJS) — e.g. recurrence exists in both. Foundations 3 (notify) and 4 (attention) span client and server, so this constraint is now load-bearing.

**Recommendation:** establish a small **shared contracts module** that both sides import — the EventType registry, `attentionThresholds`, the `AttentionItem`/`Occurrence`/`PersonRef` shapes, and pure helpers (collectors, recurrence). Pick the lightest mechanism that works for both build systems (a plain `.js` module with no env-specific imports, referenced from both trees; verify it bundles in Vite *and* loads in the Functions Node runtime — MasteryHelp's `functions/lib/` pattern is the closest precedent). Where true code-sharing is impractical, the **shared *constants/config* are non-negotiable** and the two behavior impls must share test fixtures. **Do not let thresholds or the event registry exist in two hand-maintained copies** — that's the drift this whole doc is meant to prevent.

---

## Build order & dependencies

Foundations are designed up front (this doc) but **built just-in-time, lightest-dependency-first**, so we never block urgent work:

1. **Work model** — already the migration plan's core (Phases 2–3).
2. **People model (minimal slice first):** the `trackedPeople.personType` + `hourlyRate` extension that **contractor hours** needs ships now and is forward-compatible with the fuller `PersonRef`/resolver. The resolver + roles layer lands when the second consumer (compliance gating / search) needs it. → contractor hours is **not blocked** on the full people model.
3. **Notification + delivery layer** — build before the notification center / AI digest / emailed digests (its 3 biggest consumers). The in-app inbox + prefs page are the first UIs on it.
4. **Attention engine** — build alongside the notification layer (they're co-consumed); dashboard cards refactor onto it first, then digests.
5. **Scheduled-occurrences feed** — before the calendar view + Google Calendar feed.
6. **Search** — after Work unification (Phase 2+), since it's simplest over unified work.

**Nothing here forces simultaneity.** It forces *order*: a foundation lands before its consumers. That's what makes incremental delivery cohere instead of fragment.

---

## Non-goals (avoid big-design-up-front)

We design up front only the seams that **3+ confirmed features share** (the six above). We deliberately do **not** pre-build:
- A generic plugin/extension system.
- Push-based recurring volunteer rostering (explicitly out of scope — migration plan §4).
- A unified "everything" search backend (client-side over live data is enough at church scale).
- Abstractions for features we haven't committed to.

Cosmetic overlaps (shared button styles, similar list views) are left to emerge and refactored cheaply when they actually collide. The goal is a coherent *platform*, not a speculative framework.
