# ChurchOpsHub — Backlog (single source of truth)

This is the canonical list of **open** work. Update it here (not scattered across the many plan/audit docs). Detailed specs live in the linked docs; this file is the index.

## Keystone migration (unblocks most else)
Plan: `docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md`. Decision (#7): **TWO collections** — `workItems` (tasks+maintenance merged) + jobs stays its own collection, so Phase 3 is a UI unification, not a data migration.
- **Phase 0** (shared board/recurrence primitives) — on `phase0` branch (not merged).
- **Phase 1** (contractor hours + Timesheet, `timeEntries`, `personType`/`hourlyRate`) — ✅ SHIPPED & live.
- **Phase 2** (`workItems` migration) — ✅ **CUTOVER DONE 2026-06-17: FXCC live on `workItems`** (Parts A+B per `docs/WORK-UNIFICATION-PHASE2-CUTOVER-RUNBOOK.md`; see CHANGELOG). Rollback = `set-work-flag.cjs --off --prod` (instant). **Part C remaining:** legacy `tasks`/`maintenanceTickets` kept read-only ~1 week as the rollback hatch → then delete + strip the flag/legacy branches from `useFirestore.js` + the 4 CFs. Other churches stay flag-off.
- **Phase 3** (fold Jobs in) — not started; UI/nav unification + "convert" → spawn-linked-shift (NOT a data migration).
- **Phase 4** (UI convergence: one "Work" area, six views; delete convert-features + duplicate board engines) — not started.
- **Phase 5** (pricing flatten to $15/mo) — ✅ SHIPPED standalone 2026-06-15 (0 payers → no grandfathering).

## Platform foundations (architecture spec'd; build-order phased)
- **F2 Unified People model** — resolver unifying users + tracked people + contractors + volunteers. **Minimal slice SHIPPED 2026-06-17:** pure resolver `src/lib/people.js` (`PersonRef` + `getPerson`/`listPeople`/`isEligibleFor`/`complianceStatusForTracked`, collapses the `accessPerson.userId` link, shared expiry constants); 10 unit tests incl. server-parity (`functions/test/people-resolver.test.mjs`); 3 consumers wired (`PeopleAccessPage.getExpiryStatus`; `SettingsPage` Team compliance badge + My Compliance card now resolve the user↔tracked link via `getPerson` — first production exercise of the link-collapse). **Remaining:** wire more as they need it (Timesheet contractor list, Readiness view's `requirementStatusForPerson` [needs a per-requirement API extension], work-assignment `assigneeRefs[]`, search); the next net-new feature (generalized PCO sync / event-day ops) is the intended next consumer. Server's `isAccessEligible` stays its own commonjs copy (pinned by the parity test).
- **F4 Attention engine** — ✅ **SHIPPED 2026-06-18** (`docs/FOUNDATION-F4-PLAN-2026-06-18.md`). Canonical `AttentionItem` + 8 pure collectors + shared thresholds (`src/lib/attention.js` + `attention-thresholds.json`; CJS server twin `functions/lib/attention.js`, parity-tested). Dashboard cards + the AI digest (`gatherAttentionSignals`) now both read the same collectors — no-drift achieved; both verified behavior-identical by differential tests. Cert windows reuse F2's `EXPIRY_*` (F4 = F2's 2nd consumer). **Deferred:** notification-center `notify()` wiring (waits on the F3 notification-center UI); extra signal kinds added on demand.
- **F5 Scheduled-occurrences feed** — ✅ **SHIPPED 2026-06-18** (`docs/FOUNDATION-F5-PLAN-2026-06-18.md`). Canonical `Occurrence` + 4 adapters + `getOccurrences()` (`src/lib/occurrences.js` + CJS twin `functions/lib/occurrences.js`, parity-tested). `icsCalendarFeed` + the client `.ics` exports now share one `Occurrence→VEVENT` mapping (byte-identical to the old per-type builders). Calendar logic-dedup via `src/utils/calendarGrid.js` (`monthMatrix` + `windowGroups`) — `BoardCalendar` + `JobCalendar` share it; `VolunteerHome` left as-is. Cadence enums unified into `RECURRENCE_FREQS` (in `date.js`); **Reservations gained Quarterly + Annually**. NB: recurrence math was already DRY, and COH materializes per-date docs, so `getOccurrences` is adapter+filter (not a read-time expander). **Deferred (own backlog items):** Google Calendar 2-way sync; event-day ops view; rewiring reminder senders through the aggregator.
- **F6 Search index** — `SearchableEntity` adapters + global palette (basic palette shipped; needs Work model first).
- (F3 notification/delivery layer: Tier A shipped.) Full spec: `docs/PLATFORM-FOUNDATIONS-2026-06-06.md`.

## Premium features (sequenced behind foundations)
- **Event-day ops view** — ✅ **SHIPPED 2026-06-18** (`docs/EVENT-DAY-OPS-PLAN-2026-06-18.md`). Admin/manager top-level "Event Day" tab: a `getOccurrences` consumer that cross-sources one day into Serving-today (shifts + roster + per-volunteer `shiftReadiness` compliance badge), Rooms & reservations, and Due-today — each self-gating by hub. New `src/pages/EventDayPage.jsx` + `shiftReadiness()` in `src/lib/people.js`. Day-scoped **attention strip** shipped same day (shifts-needing-volunteers / not-cleared / expiring-soon chips). **Deferred fast-follows:** print/run-sheet export; in-console editing (v1 is read/triage).
- **Google Calendar two-way sync** — ICS feed exists; 2-way deferred (needs F5).
- **AI "what needs attention this week" digest** — Claude (Haiku) over attention signals (needs F2/F3/F4).
- **Compliance serving-readiness dashboard + expiry digests** (needs F4).
- **Generalized Planning Center People sync** — beyond FXCC-only Shepherd Hub (needs F2).

## Smaller / standalone open
- **SEO internal-link rewire** for volunteer-coordinator-role-guide post (push pos 22→page 1); re-verify 2026-06-23. (`docs/SEO-REFOCUS-2026-05-26.md`)
- **Firebase billing budget alert** — Google Cloud Console setup (no code).
- **E2E owner-tab gate decision** — L9 test skipped; hardcoded owner emails in `SettingsPage.jsx`.

## Shepherd Hub deferred
- **Level-2 note encryption** — shelved/accepted-risk (only John has DB read). May reopen on SLA/compliance review. (`docs/SHEPHERD-HUB-PLAN.md`)
- **Household grouping** — PCO households not synced; v1 limitation.

## Accepted / won't-ship & known limitations
Private-task-comment Firestore-rule limitation, contractor self-logging deferral, app-level MFA, one-time PCO cleanup write-pass, push-based recurring rostering (out of scope). Documented in the source plan/audit docs — do not re-surface as "open."
