# ChurchOpsHub — Backlog (single source of truth)

This is the canonical list of **open** work. Update it here (not scattered across the many plan/audit docs). Detailed specs live in the linked docs; this file is the index.

## Keystone migration (unblocks most else)
Plan: `docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md`. Decision (#7): **TWO collections** — `workItems` (tasks+maintenance merged) + jobs stays its own collection. **Jobs merge (old Phase 3) is now DEFERRED INDEFINITELY (owner 2026-06-23);** the remaining Work step is the Tasks+Maintenance **UI** merge (rescoped Phase 4).
- **Phase 0** (shared board/recurrence primitives) — on `phase0` branch (not merged).
- **Phase 1** (contractor hours + Timesheet, `timeEntries`, `personType`/`hourlyRate`) — ✅ SHIPPED & live.
- **Phase 2** (`workItems` migration) — ✅ **FULLY COMPLETE.** Cutover 2026-06-17 (FXCC); **Part C done 2026-06-23** — flag + legacy read/write branches stripped from `useFirestore.js` + the CFs (icsCalendarFeed, sendTaskDueReminders, gatherAttentionSignals, generateRecurringTemplateTasks); legacy `tasks`/`maintenanceTickets` collections **deleted from prod** (verified mirrored first; other 3 churches were empty). Hook reads `workItems`-only; rollback now = redeploy prior code (the flip flag is gone). See CHANGELOG.
- **Phase 3** (fold Jobs in) — ⛔ **DEFERRED INDEFINITELY** (owner 2026-06-23). Jobs stays its own `jobListings` collection/hub. Two-collection decision already made this optional; revisit later if ever.
- **Phase 4** — ✅ **v1 SHIPPED 2026-06-23.** One **Work** card + Tasks/Maintenance toggle (`src/pages/WorkPage.jsx`) for both-access users; single-category users keep their own card; `allowedHubs` scoping preserved at category granularity (E2E-verified on prod, `e2e/authenticated/work-merge.spec.js`). Jobs untouched. **Carried debt:** v1 *wraps* TasksPage/MaintenancePage — the duplicate-board-engine dedup + the task↔maintenance **convert-feature deletion** are NOT done (do when next in the board engine). Plan: `docs/WORK-MERGE-TASKS-MAINTENANCE-PLAN-2026-06-23.md`.
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
- **Generalized Planning Center People sync** — beyond FXCC-only Shepherd Hub (needs F2). **PARKED 2026-06-18 pending shepherd feedback** — their real PCO usage shapes the two open forks: (1) per-church creds = paste a PCO Personal Access Token (reuses `shepherd.js` Basic-auth client, ~2-3d) vs full OAuth Connect button (~1-2wk); (2) sync scope = a selected PCO List vs entire active congregation vs active+membership filter. Lands synced people as `accessPeople` (read-only, names/email/phone/status only — no pastoral/medical), `pcoId`-keyed upsert + email auto-link to `users`. Reuse the `shepherd.js` PCO client / paging / >50%-stale safety valve.

## Smaller / standalone open
- **SEO internal-link rewire** for volunteer-coordinator-role-guide post (push pos 22→page 1); re-verify 2026-06-23. (`docs/SEO-REFOCUS-2026-05-26.md`)
- **Firebase billing budget alert** — Google Cloud Console setup (no code).
- **E2E owner-tab gate decision** — L9 test skipped; hardcoded owner emails in `SettingsPage.jsx`.

## Shepherd Hub deferred
- **Level-2 note encryption** — shelved/accepted-risk (only John has DB read). May reopen on SLA/compliance review. (`docs/SHEPHERD-HUB-PLAN.md`)
- **Household grouping** — PCO households not synced; v1 limitation.

## Accepted / won't-ship & known limitations
Private-task-comment Firestore-rule limitation, contractor self-logging deferral, app-level MFA, one-time PCO cleanup write-pass, push-based recurring rostering (out of scope). Documented in the source plan/audit docs — do not re-surface as "open."
