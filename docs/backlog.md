# ChurchOpsHub — Backlog (single source of truth)

This is the canonical list of **open** work. Update it here (not scattered across the many plan/audit docs). Detailed specs live in the linked docs; this file is the index.

## Keystone migration (unblocks most else)
Plan: `docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md`. Decision (#7): **TWO collections** — `workItems` (tasks+maintenance merged) + jobs stays its own collection, so Phase 3 is a UI unification, not a data migration.
- **Phase 0** (shared board/recurrence primitives) — on `phase0` branch (not merged).
- **Phase 1** (contractor hours + Timesheet, `timeEntries`, `personType`/`hourlyRate`) — ✅ SHIPPED & live.
- **Phase 2** (`workItems` migration) — steps 1–2 DONE on `phase2-readpath` (dark, flag-gated read-path; CF sites routed; `workItems.type` immutable). Branch **rescued/current with main 2026-06-17** (merge verified: lint/build/test:unit/test:rules green). Backfill **rehearsed against a real FXCC copy in the emulator** (dry-run/execute/verify all clean, orphan safety-net proven). **Next: execute the cutover** per `docs/WORK-UNIFICATION-PHASE2-CUTOVER-RUNBOOK.md` (Part A dark/safe now; Part B = Thursday window; Tasks first).
- **Phase 3** (fold Jobs in) — not started; UI/nav unification + "convert" → spawn-linked-shift (NOT a data migration).
- **Phase 4** (UI convergence: one "Work" area, six views; delete convert-features + duplicate board engines) — not started.
- **Phase 5** (pricing flatten to $15/mo) — ✅ SHIPPED standalone 2026-06-15 (0 payers → no grandfathering).

## Platform foundations (architecture spec'd; build-order phased)
- **F2 Unified People model** — resolver unifying users + tracked people + contractors + volunteers.
- **F4 Attention engine** — canonical `AttentionItem` + collectors + shared thresholds.
- **F5 Scheduled-occurrences feed** — canonical `Occurrence` + `getOccurrences()`; kill duplicate recurrence impls.
- **F6 Search index** — `SearchableEntity` adapters + global palette (basic palette shipped; needs Work model first).
- (F3 notification/delivery layer: Tier A shipped.) Full spec: `docs/PLATFORM-FOUNDATIONS-2026-06-06.md`.

## Premium features (sequenced behind foundations)
- **Event-day ops view** — single-screen Sunday/event console (needs F1/F2/F5).
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
