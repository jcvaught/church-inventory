# CHANGELOG.md

Archive of completed phases, resolved checklist items, and fixed issues. Moved here from CLAUDE.md to keep active guidance concise.

---

## 2026-06-10 — Shepherd Hub Phase 3: the hub UI (full #3 + roster management)

The elders' working surface. FXCC-only; gated to `isElder || FXCC admin` as a
standalone top-level **Shepherd** tab (not a paid hub). `src/pages/hubs/ShepherdHubPage.jsx`.

- **Roster → Firestore config (foundation):** elder roster moved out of hardcoded
  files into `config/shepherdRoster` (`functions/lib/roster.js`: DEFAULT_ROSTER +
  buildNormalizer + rosterElderEmails). Single source for the claim grant, the
  sync's name-matching, and the roster UI. `shepherd.js` + `claimElderRole` +
  `set-elder-claims.cjs` all read it (DEFAULT fallback). Parity re-verified.
- **Read-only directory + "View as elder":** My Flock / All Congregation /
  Needs Reassignment views; name search + status/assignment filters; person
  detail (contact, pastoral fields incl. strengths/gifts, medical notes, elder
  chips); coverage strip. Admins (no flock) get a **View as [elder]** picker to
  preview any elder's flock before elders log in.
- **Pastoral notes + audit:** private note (owner-uid only) + shared care thread
  (any elder, author-owned) as subcollections with their own rules; `shepherdAudit`
  append-only log of views/edits/reassigns. `logShepherdAudit` helper.
- **Elder Assigned editor + PCO write-back:** `setElderAssignment` callable
  (authorizes via the `req.auth.token.elder` claim or FXCC admin) writes a CLEAN
  canonical value ("Surname"/"Surname/Surname") via `setPcoElderAssignment`
  (find/create FieldDatum 261343 → PATCH/POST → read-back verify), recomputes the
  derived index, updates the cache doc, and audits. Multi-select editor in the
  person detail. **This is also the orphan-cleanup mechanism.**
- **Orphaned worklist:** the "Needs Reassignment" tab surfaces the ~140 active
  people assigned only to former elders, one click into the reassign editor.
- **Roster-management UI (admin):** `RosterManager` edits `config/shepherdRoster`
  — add/remove/edit elders (name, surname, sign-in emails, PCO match patterns,
  active/sabbatical) + former-elder list. "Save & re-sync" applies match/active
  changes immediately via `refreshShepherdPeople`.
- **Rules:** all Shepherd reads/writes gated to `isElder()` or **`isShepherdAdmin()`**
  — the latter is John's email only (`OWNER_EMAILS`), NOT any church admin
  (pastoral data is need-to-know; tightened 2026-06-10). UI tab + `setElderAssignment`
  / `refreshShepherdPeople` callables mirror this (elders via claim, else
  John-only). Verified: another FXCC admin is denied; John + elders allowed.
- **Verified live:** directory queries; notes privacy (owner-only, no forging,
  non-elder locked out); **full write-back through the live callable** (Watkins →
  Watkins/Reiman landed in PCO + cache + audit, then restored); admin roster
  write allowed / non-admin denied. Build + lint clean throughout.

---

## 2026-06-10 — Shepherd Hub Phase 2: elder custom-claim gate

The access gate for Shepherd Hub. Elder status is a **server-set custom auth claim** (`elder: true`), not a Firestore-doc role. No hub UI yet (P3).

- **`functions/lib/elders.js`** (NEW): the `ELDER_EMAILS` allow-list (single source of truth) — all 8 FXCC elders sign in via `@fxcc.org` Google Workspace (Steve Watkins has two addresses, both listed). `isElderEmail(email)` compares lowercased.
- **`claimElderRole`** (onCall): self-correcting grant/revoke. Looks up the caller's email; sets `elder:true` if allow-listed, clears it otherwise (preserving any other claims). Removing an email + redeploy revokes on that elder's next sign-in; `scripts/set-elder-claims.cjs` does it immediately. Provider-agnostic (keys off the verified email).
- **Client (`src/useAuth.js`):** on sign-in, **FXCC members only** (gated on `churchId === SHEPHERD_CHURCH_ID` so no other church hits the callable) invoke `claimElderRole`, force-refresh the ID token when the claim changed (so rules see it), and expose `isElder` from the hook. Reset on sign-out.
- **Rules:** `isElder()` helper (`request.auth.token.elder == true`, no `get()`); `shepherdPeople` + `config/shepherdSync` reads relaxed from admin-only (P1 lock) to **`isElder() || isChurchAdmin`** (admin retained for support; Level-1 model already accepts admin readability of this PCO-sourced data). Writes still `false` (CF-only).
- **`scripts/set-elder-claims.cjs`** (NEW): out-of-band force-sync — grants to allow-listed accounts that exist, revokes stale claims; dry-run by default, `--apply` to write. Reports elders with no Auth account yet (auto-grant on first sign-in).
- **MFA:** enforced at the **Google Workspace** level (FXCC can require 2-step verification org-wide in the Workspace admin console) rather than in-app — Firebase-level MFA (TOTP/SMS second factor) would require the Identity Platform upgrade, deferred. The `claimElderRole` callable approach also deliberately avoids that upgrade (a `beforeSignIn` blocking function would have needed it).
- **Verified:** `claimElderRole` IAM probe = 401 JSON (invoker intact). Allow-list script resolves all 8 (none have COH accounts yet → auto-grant pending). **End-to-end rule test:** a neutral non-FXCC, non-admin identity is `permission-denied` on `shepherdPeople` without the claim and **READ ALLOWED with `elder:true`** — isolating the claim as the boundary. Client build + lint clean.

**Still needed before P3:** the 8 elders each sign into COH once (joins them to FXCC + auto-grants the claim). Pastoral: who covers Bingham's flock during sabbatical.

---

## 2026-06-10 — Shepherd Hub Phase 1: PCO → Firestore read-sync

First build phase of **Shepherd Hub** (elders-only congregation view; full spec `docs/SHEPHERD-HUB-PLAN.md`). P1 is the read-only sync only — no UI, no pastoral notes, no elder auth-gate (P2/P3). FXCC-only for now (`SHEPHERD_CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church'`).

- **`functions/lib/shepherd.js`** (NEW): pure PCO client + normalization + sync orchestrator (mirrors the `lib/ics.js` pattern; `index.js` injects `db`/`FieldValue`/secret values). Paginates `GET /people?include=field_data,emails,phone_numbers,addresses` (~40 pages), resolves the 6 pastoral field-definition ids **by name** (the nested `/field_definitions/{id}/field_data` route 404s), and writes a minimized, elder-indexed doc per person. Elder normalization (`CURRENT`/`PATTERNS`/`mapSegment`) ported verbatim from the `.scratch/pco-coverage.mjs` probe.
- **Data model** `churches/{id}/shepherdPeople/{pcoPersonId}`: identity + status (`status`/`inactivatedAt` for the "no-longer-attends" filter) + emails/phones/addresses + `medicalNotes` + `pastoral{elderAssigned(raw), dateBaptized, growthGroupMember, discipleship, strengths[], gifts[]}` + derived `elderKeys[]`/`orphaned`/`hasAssignment` + `syncGeneration`. **Full congregation** stored (~3,993), not just the assigned. Plus a product-facing `config/shepherdSync` status doc (last run, counts, per-elder load, unmapped values, field-def map).
- **Field-name reconciliation (vs. the spec's wishlist):** PCO has no single "Service Areas" field (the ministry selects are unpopulated → dropped); "Strengths & Gifts" is two `checkboxes` fields — **Strengths** and **Gifts, Interests, & Abilities** — which arrive as one FieldDatum row per checked value, so they're accumulated into `strengths[]`/`gifts[]`. The 4 single-value fields (Elder Assigned, Date Baptized, Growth Group Member, Discipleship) map 1:1.
- **`syncShepherdPeople`** (onSchedule, nightly 2am Central, `withScheduledRun`, registered in `SCHEDULED_JOB_REGISTRY` daily/10min) + **`refreshShepherdPeople`** (onCall, on-demand; P1 gate = OWNER_EMAILS or FXCC admin). Both bind the `PCO_APP_ID`/`PCO_SECRET` secrets. Writes via `bulkWriter` (full overwrite, not merge — auto-drops retired fields); delete-missing pass on stale `syncGeneration` with a **>50%-of-prior abort valve** so a partial PCO fetch can't nuke the cache; hard guard that throws if the "Elder Assigned" field def is missing (schema-drift).
- **Secrets:** `PCO_APP_ID`/`PCO_SECRET` set in Secret Manager (PAT from the gitignored `.scratch/pco.env`).
- **Rules:** `shepherdPeople` + `config/shepherdSync` are **admin-read, no-client-write** (Admin SDK / CF only; tightens to an elder custom-claim in P2). Holds `medicalNotes` (Level-1 caveat per spec).
- **Indexes:** 3 `shepherdPeople` COLLECTION composites — `elderKeys`(array-contains)+`name`, `status`+`name`, `hasAssignment`+`name`. `firebase deploy --only firestore:indexes` silently skipped all three (the documented foot-gun); created via `gcloud … --query-scope=COLLECTION`.
- **Verified live (3 sync runs):** 3,993 stored · 981 assigned · 140 orphaned · 0 unmapped · per-elder load exactly matches the plan snapshot (Watkins 171, Reiman 154, Bingham 153, Boyd 97, Bell 89, Reed 89, Mills 62, Cesone 60). All 3 indexed queries serve (watkins flock 171; active 1,797; unassigned 3,012). Idempotent (`deleted:0` on re-run). Callable IAM probe = 401 JSON (invoker intact). Skipped fields (SOS, FSM, G6, all background-check/training fields, `passed_background_check`) confirmed never stored.

## 2026-06-07 — Removed subtasks + task dependencies from Tasks Hub

Owner decision ("too much information") and a Work-unification §9 cleanup, landed early as a self-contained removal (independent of the migration). Frontend-only — no rules/functions/deploy. Existing task docs keep their `parentTaskId`/`blockedBy` fields (forward-only; nothing reads/writes them now).

- **TasksPage.jsx:** deleted the `BlockedByInput` component; the Parent Task `<select>` + Blocked By field from both the new-task and detail modals; the subtask card badge (`↳ N/M`), the ⛔ "Blocked by" card badge, and the parent-name line on `TaskCard`; the list-view nested subtree render + `subtaskDocIds` top-level filter; the Kanban subtask/parent/depth props; the `tasksByParent` / `subtaskDocIds` / `depthByDocId` derived memos; the blocked-complete soft warnings in `handleUpdateTask` / `handleDrop` / `handleBulkStatusChange`; the subtask-cascade + `blockedBy` array-remove cleanup in `handleDeleteTask`; the parent-link + Subtasks list in the detail modal; the `parentTaskId`/`blockedBy` fields from `getEmptyTask`, the dirty-check, `openDetail`, and the recurring-task clone. Dropped now-unused imports (`getDocs`, `where`, `arrayRemove`).
- **JobsPage.jsx:** dropped `parentTaskId`/`blockedBy` from the → Task convert payload.
- **HelpPage.jsx:** removed the Subtasks and "Task dependencies (Blocked By)" accordions + the two field-list lines. lint 0-err, build clean.

## 2026-06-07 — AI "What needs attention this week" digest (in-app panel + weekly email)

Premier feature pulled forward ahead of the Work migration. Reads across every hub's existing signals and uses Claude (Haiku) to write a short prioritized briefing. **Admin-only** (the contractor-payment line is financial). Prerequisite: `ANTHROPIC_API_KEY` in `functions/.env` (loads at deploy).

- **Signal gather** (`gatherAttentionSignals`): per church, hub-gated — overdue/due-soon tasks (`tasks` hub), maintenance (`maintenance`), expiring/expired compliance within 30d (`people_access`), low stock (`quantity ≤ minQuantity`) + warranty-expiring items (Inventory base, always on), unfilled upcoming shifts (`jobs`), and contractor upcoming scheduled work + hours logged (7d) + outstanding payments (approved-unpaid) (`people_access`). Each block contributes counts + a few example strings.
- **Claude call** (`callClaude`): dependency-free Node-22 `fetch` to `/v1/messages`, model `claude-haiku-4-5-20251001`, `x-api-key` + `anthropic-version: 2023-06-01` (mirrors `sendViaBrevo`'s no-SDK style — COH does not add the Anthropic SDK). Asks for minified JSON `{summary, items:[{priority,text}]}`; parse is fence-tolerant (`indexOf('{')`/`lastIndexOf('}')` slice). Verified live: 200, ~733 tokens ≈ $0.002/generation.
- **Weekly cache** (`buildAttentionDigest`): one generation per church per ISO-week (`isoWeekKey`) in `churches/{id}/aiDigests/current`; repeat views + the email reuse it. Empty weeks short-circuit to a "nothing needs attention" payload (no Claude call, no email).
- **`getAttentionDigest`** (onCall, admin-only, `wrapCall`): powers the in-app panel; returns cached or regenerates on `{refresh:true}`. IAM probe-verified (401 JSON).
- **`sendWeeklyAttentionDigest`** (onSchedule, hourly, church-local **Monday 8am**; opt-in `config/settings.attentionDigestEnabled`): emails admins, reuses the weekly cache, skips empty weeks. Registered in `SCHEDULED_JOB_REGISTRY`.
- **Client:** `src/components/AttentionPanel.jsx` on the Dashboard (admin-only) — calls the callable on mount, renders summary + priority-tagged items + a Refresh button + "updated … refreshes weekly". Third digest toggle (always-shown, admin) in Settings → Church Settings.
- No firestore.rules change — `aiDigests` is written by the CF via Admin SDK and read only through the callable (clients never touch the collection). lint 0-err, build clean.

## 2026-06-07 — Contractor scheduling + payments (timesheet lifecycle + maintenance link)

Phase-1 follow-on to the contractor Timesheet, and the data foundation for the AI "what needs attention" digest. Frontend-only — reuses the existing `timeEntries` collection + admin/manager rules (no rules/functions deploy).

- **Timesheet lifecycle (`Scheduled → Logged → Approved → Paid`)** — `src/pages/hubs/Timesheet.jsx`. A time entry can now start as **Scheduled** (planned future work, optional `estHours`, `hours/cost: 0`), convert to **Logged** in place via "Log actuals" (sets real hours + cost), then **Approve** → **Mark Paid** (`status:'paid'` + `paidDate`). New surfaces: an **Upcoming Work** card (all scheduled entries, oldest-first, past-dated flagged "needs logging"), an **Awaiting Payment** summary stat (sum of `approved`-but-not-`paid` cost, not range-bound), and 4-state badges. "Schedule Work" button alongside "Log Time"; modal handles log/schedule/convert modes.
- **Maintenance → Schedule Contractor** — `src/pages/hubs/MaintenancePage.jsx`. A ticket's detail modal has a **Contractor Work** section: lists any linked entries (derived from `timeEntries.linkedTicketId === ticket._docId` — no backref field to keep in sync) and a **+ Schedule Contractor** button (admin/manager, when a `personType:'contractor'` exists) → mini-modal (contractor + date prefilled from due date + est. hours) creates a linked **scheduled** entry with `linkedTicketId` + description `"<ticketNumber>: <name>"`.
- **Cost rollup** — when a ticket-linked entry is logged in the Timesheet, `rollUpToTicket` adds its cost to the ticket's `actualCost` **once** (guarded by a `rolledUp` flag so re-logging won't double-add; deleting a rolled-up entry backs the cost out). Closes the deferred Phase-1 follow-up.
- New `timeEntries` fields: `status` adds `'scheduled'|'paid'`, plus `estHours`, `paidDate`, `linkedTicketId`, `rolledUp`. All covered by the existing admin/manager write rule. lint 0-err, build clean.

## 2026-06-07 — Tier B "meantime" features (Insights digest · ICS feed · Serving readiness)

Three additive, read-only features from the Work-Unification plan §13 (no schema migration, no maintenance window). Shipped + deployed together.

- **Insights ceiling fix (5a):** `InsightsPage` computed utilization/ministry/seasonal/supply-burn from the live `activityLog` array, which is capped at `.limit(100)` for read-cost — silently truncating analytics on churches with >100 lifetime actions. New `loadActivityLogSince(sinceTimestamp, {batchSize,maxEntries})` in `useFirestore.js` (paged one-shot `getDocs`, sibling to `loadOlderActivityLog`); Insights fetches the trailing **12 months** on mount and computes from that (`analyticsLog = windowLog ?? activityLog`, falls back to the capped array while loading). The 100-row live subscription is untouched. Caption added: "Usage analytics computed from the last 12 months."
- **Weekly Insights digest (5b):** `sendWeeklyInsightsDigest` onSchedule (hourly; gates on church-local **Monday 8am** via `getChurchTimeZone`/`localPartsFor`, same pattern as `sendTaskDueReminders`). Recomputes warranty-expiring items, supplies running low (90-day burn), and most-used items server-side; emails admins via `sendEmailSafe`. **Opt-in** `config/settings.insightsDigestEnabled`; empty digests skipped. Registered in `SCHEDULED_JOB_REGISTRY` (hourly).
- **ICS calendar feed (6):** `icsCalendarFeed` onRequest (`cors:true, invoker:'public'`) — subscribable `text/calendar` of jobs + reservations + maintenance. Auth = rotatable per-church token on `config/settings.feedToken`; each type hub-gated via `subHasHub` (reservations always allowed — Inventory base); 60s in-process cache; reads bounded to a 90-day-back window. Pure VEVENT builder in **`functions/lib/ics.js`** (server twin of `src/utils/ical.js` — keep in sync). Settings → **Calendar Feed** card (generate/copy/rotate URL). Verified end-to-end against `e2e-test-church`: valid token → 200 VCALENDAR, wrong token → 403, no-params → 400; allUsers invoker IAM intact post-deploy.
- **Serving-readiness dashboard (7a):** new **Readiness** tab in `PeopleAccessPage`. By-requirement cross-tab (clear / renewing / expired / no-record across active people; "Required for shifts" badge from upcoming jobs' `requiredAccessTypes`) + 90-day expiry timeline. Reuses the existing `getExpiryStatus` buckets; mirrors the server's `isAccessEligible` reduction (a non-expired record = valid). No schema change.
- **Weekly compliance digest (7b):** `sendWeeklyComplianceDigest` onSchedule (same Monday-8am-local skeleton). For People-Access-active churches with `config/settings.complianceDigestEnabled`, emails admins the access records expired (within 90d) or expiring within 30 days, grouped by person. Empty digests skipped; registered in the monitor.

Both digest toggles live in **Settings → Church Settings** as independent opt-in switches (default OFF), each gated on its hub (`insights` / `people_access`). No firestore.rules change — admin/manager already write `config/settings`. lint 0 errors, build clean, functions syntax-checked.

## 2026-06-07 — User-facing "What's New" log

A persistent, browsable release-notes surface for users — distinct from this (technical) CHANGELOG. `src/data/whatsNew.js` holds newest-first `{date,tag,title,body}` entries (tag: New/Improved/Fixed), written benefit-first in plain language. `src/components/WhatsNew.jsx` renders `WhatsNewModal` (via the Modal primitive) + exports `getUnseenCount`/`markWhatsNewSeen` (unseen = entries newer than the `coh_whatsnew_seen` localStorage stamp; read at render time, no forced login modal). Surfaced as a **"What's New" item in the account dropdown** with a teal unseen-count badge; opening marks all seen and clears the dot. Seeded with the last 4 shipments (notifications, search, timesheet, banner). **New doc-ritual step (noted in CLAUDE.md): every user-visible change gets a whatsNew.js entry** so it stays fresh. Frontend-only — no rules/functions/index/deploy. lint 0 errors, build clean.

## 2026-06-07 — Notification center + web push + PWA install (Foundation 3)

The load-bearing notification layer (Platform Foundations §3) + push (§13 #4). Email behavior is **unchanged** — this only ADDS in-app + push channels alongside the existing per-event email CFs.

- **Server:** `deliverNotification(churchId, uids, {type,title,body,link})` helper (in-app inbox write + FCM push per each user's `notificationPrefs[type]`, both default on; invalid push tokens pruned; never throws). New `notify` onCall (member-validated) for client producers. `promoteFromWaitlist` now also delivers a `shift_waitlist_promoted` notification. New import `firebase-admin/messaging`.
- **In-app inbox:** `churches/{churchId}/notifications` (rules: recipient reads/updates/deletes own; **create is Admin-SDK-only** — clients never write). `useNotifications` hook + `NotificationBell` in the header (unread badge, mark-read / mark-all-read, click routes via the global-search nav descriptor). Composite index `notifications (recipientUid ASC, createdAt DESC)`.
- **Web push (FCM):** `public/firebase-messaging-sw.js` (background handler, registered with dedicated scope `/firebase-push/` so it never clobbers the PWA `/sw.js`), `src/utils/push.js` (`enablePush` permission + `getToken` + store on `users/{uid}.fcmTokens`), public **VAPID key** in `src/firebase.js`.
- **Preferences:** per-event In-app/Push toggles + "Enable push on this device" in Settings → Notifications (`users/{uid}.notificationPrefs`).
- **PWA install:** `InstallPrompt` (Android/desktop `beforeinstallprompt`; iOS Share→Add-to-Home-Screen hint, required for iOS web push), 30-day dismiss.
- **Producers (in-app + push, independent of the church email toggle):** maintenance ticket assigned · task assigned · task @mention · reservation approved/denied · waitlist promotion. Event types: `ticket_assigned` · `task_assigned` · `task_mention` · `reservation_decided` · `shift_waitlist_promoted`.
- **Ship:** lint 0 errors (47 baseline warnings) · build clean (0 jsxDEV) · deployed `firestore:indexes,firestore:rules` then `functions:notify,functions:promoteFromWaitlist` (both curl-probed **401 JSON** = IAM intact). **`firebase deploy` silently skipped the notifications composite index** (documented Case-A gotcha — only jobListings indexes existed after) → created via `gcloud firestore indexes composite create`. Deferred fast-follows: low-stock / compliance-expiring admin alerts (need scheduled checks); foreground in-app toast on push receipt.

## 2026-06-06 — App-wide banner + Contractor Timesheet (premier-app groundwork)

First two builds off the strategy plan (`docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` §13 "meantime" items #1–#2). Both purely additive — no maintenance window needed.

- **App-wide maintenance/announcement banner** — global `appConfig/banner` doc (new top-level collection; owner-only write, any-signed-in-user read) drives a site-wide banner via `useGlobalBanner` + `GlobalBanner` in the app shell (after the accent bar). Owner controls it at **Settings → owner panel → Banner tab**: type `maintenance` (red, non-dismissible — for update windows) or `info` (teal, dismissible, re-shows on a new `updatedAt`). **Dark by default** (no doc = nothing shows). This is the cutover safety-net from `docs/LOCAL-TESTING-AND-REVERT-2026-06-06.md`. New files: `src/hooks/useGlobalBanner.js`, `src/components/GlobalBanner.jsx`. Rule added for `/appConfig/{docId}`.
- **Contractor hours / Timesheet** (Work-unification Phase 1) — People Access tracked people gain `personType` (`member`/`volunteer`/`staff`/`contractor`) + `hourlyRate` (shown in the add/edit person modal). New `timeEntries` collection + CRUD in `useFirestore` (subscription count 20→21). New **Timesheet** view in the People Access hub (`src/pages/hubs/Timesheet.jsx`): log hours against a person, auto-compute cost from their rate, group by person for a date range (default This Week), approve/unapprove, delete (inline confirm), CSV export. Filters client-side (single-field `orderBy('date')`, auto-indexed — **no composite index**). Payroll-sensitive → `timeEntries` rule is admin/manager-only (contractor self-logging deferred).
- **Global search / command palette** (§13 #3) — `src/components/GlobalSearch.jsx`. Header 🔍 button + **Cmd/Ctrl+K**; read-only omnisearch across items, people, tasks, maintenance, jobs, supplies, reservations — over collections the store already subscribes to (no extra reads, no index). Arrow/Enter keyboard nav; results jump to the right area (items deep-open via the existing `scannedItemId` path; others switch tab/open hub). Hub-gated types hidden when the user can't see that hub. Frontend-only — no rules/deploy.
- **Ship:** lint 0 errors (47 pre-existing warnings, none new) · build clean (verify-prod-bundle 0 jsxDEV) · `firebase deploy --only firestore:rules` for the banner + timesheet collections (search needed none) · frontend auto-deploys via Vercel. All additive; old data untouched.

## 2026-06-05 — E2E test emails no longer hit Brevo (budget + reputation)

The E2E suite signs in as `e2e-admin@churchopshub.com` / `e2e-member-a@…` / `e2e-member-b@…` — addresses with no real mailbox. Any flow that emails them (welcome, member-join notify, reminders, etc.) soft-bounces, burning the shared free Brevo budget (300/day across all 4 apps) and dinging sender reputation. `sendEmailSafe` now drops recipients matching `^e2e…@churchopshub.com` *before* the Brevo call (a new `isTestRecipient`, bucketed alongside the existing suppression list), so an all-test send is a clean no-op that never touches Brevo. Domain-scoped → a real church member with an "e2e…" address on their own provider is unaffected (verified: fxcc.org / gmail / icloud all pass through). Deployed all 30 functions; post-deploy probed the 3 webhooks (stripeWebhook 400, emailEventWebhook 401, twilioInbound 403-with-`invalid signature`-log) — all reached, invoker IAM intact. Part of a cross-app sweep (CourtClimber + RepCrew got equivalent guards; MasteryHelp needs none — it has no Brevo sender).

## 2026-06-05 — Per-church timezones for scheduled reminders/digests

Scheduled user-facing sends were all hard-coded to `America/Chicago`, so an Eastern church saw the morning reminders at 9am, the new-jobs digest at 1pm, and the Monday task digest at 9am (everything an hour late). Made the send hour respect each church's own timezone.

- **New church setting `config/settings.timeZone`** (IANA string, default `America/Chicago`). Set in **Settings → Church Settings** (admin only; new `<select>` with the 7 US zones, writes via `updateSettings`). Existing `config/settings` rules already allow admin/manager writes — no rules change.
- **`functions/index.js`** — `sendJobReminders` (8am), `sendNewJobsDigest` (noon), and `sendTaskDueReminders` (Mon 8am) changed from once-daily crons to **`schedule: '0 * * * *'` (hourly)**. Each now resolves the owning church's timezone (`getChurchTimeZone`, cached per run) and **only acts on a church when its local hour — and weekday, for the weekly digest — matches the target** (`localPartsFor`). "Today" / the week window / idempotency stamps are computed **per church** in-loop, not once at the top. Collection-group queries widened to a ±1-day (reminders/digest) or [−91,+7]-day (task digest) **UTC** window (`utcYmdOffset` / `ymdAddDays`) so they cover "today" in every US zone; the exact church-local date match happens in the loop. Reuses existing `(status, scheduledDate)` + `tasks.dueDate` indexes — no new indexes.
- **Idempotency preserved:** reminder stamps (`lastReminderSentDate` / `lastSmsReminderSentDate`) and the digest's `newJobsDigestSent` now key off the church-local date; an hourly run is a no-op for every hour except the church's target.
- **`SCHEDULED_JOB_REGISTRY`** — those three moved to `cadence: 'hourly'` (new `CADENCE_STALE_MS.hourly = 3h`); `sendNewJobsDigest` added to the monitor (was previously unmonitored). `closePastJobs` / `processTrialExpirations` / `generateRecurringTemplateTasks` stay daily Central (not timezone-sensitive).
- **Data:** Fairfax Church of Christ (`6cksNI9Uv8h0jXptdTESnXTXFgF3-church`) set to `America/New_York`.
- `node --check` + `npm run build` clean; eslint 0 errors (baseline warnings only).

## 2026-06-05 — "Update available — Reload" prompt (stop manual refreshes after deploys)

Users (and volunteers) were having to manually hard-refresh to pick up new deploys — a tab left open keeps running the old bundle. Added a proactive update prompt. **Why polling, not the service worker:** `public/sw.js` is byte-stable across deploys, so the browser never sees a "new" SW and `updatefound` never fires — a polled build id is the only reliable signal.

- **`vite.config.js`** — a stable per-deploy `BUILD_ID` (`VERCEL_GIT_COMMIT_SHA` on Vercel, timestamp locally), baked into the bundle via `define: { __BUILD_ID__ }` AND emitted to `dist/version.json` via a tiny `emit-version-json` Rollup plugin (`this.emitFile`). Same value both places.
- **`src/version.js`** — exports `BUILD_ID` (the id this tab was built with; `'dev'` fallback).
- **`src/hooks/useVersionCheck.js`** — polls `/version.json` (`cache:'no-store'`, `?ts=` cache-bust) every 5 min + on focus/visibilitychange; flags `updateAvailable` when the live id differs. No-ops in dev / on fetch failure. `reload()` nudges `serviceWorker.update()` then `location.reload()` (belt-and-suspenders; the SW is already network-first). Dismiss hides until an *even newer* build ships.
- **`src/components/UpdateBanner.jsx`** — non-blocking fixed bottom-corner card ("Update available — Reload / Later"); mobile position clears the bottom nav. Mounted once in `main.jsx`'s main-app branch (overlays every state; kept out of the anonymous `?jobs=` render path).
- Complements the existing stale-chunk auto-heal (`importWithRetry` + `ChunkErrorBoundary`): that catches the *breakage* case (old tab loads a missing chunk); this is the *proactive* nudge for a working old tab.
- Note: this deploy's own users won't see a banner for *this* release (they lack the polling code until they load it) — it takes effect from the next deploy onward.
- `npm run build` clean (`dist/version.json` emitted, build id baked into the bundle); eslint 0 errors.

## 2026-06-05 — Jobs Hub: new-shift SMS digest (separate opt-in)

New feature: a once-daily **noon Central** SMS digest telling volunteers when new shifts are posted at their church, so they can sign up. Built on a **separate** opt-in from the existing morning shift-reminder SMS (distinct consent category — required before sending, since the originally-registered consent covers reminders only).

- **`functions/index.js` — `sendNewJobsDigest`** (`onSchedule '0 12 * * *' America/Chicago`, wrapped in `withScheduledRun`). Reuses the existing `(status, scheduledDate)` collection-group index: query open + `scheduledDate >= today`, group by church, skip already-announced. Recipients = that church's users with `phone` + **`smsNewJobsEnabled === true`** + active + `effectiveHasHub('jobs')` (two equality filters → zigzag merge, no new index). Per-church gating clones `sendJobReminders` (`subHasHub('jobs')` + `config/notifications.enabled`). Body is **link-free and number-free** to honor the A2P registration flags (`has_embedded_links:false`, `has_embedded_phone:false`): `"ChurchOpsHub: N new volunteer shift(s) is/are open at {churchName}. Open the app to view and claim a spot. Reply STOP to opt out."` (church name is per-church from `churches/{id}.churchName`, fallback `"your church"`). Idempotency: each announced job stamped `newJobsDigestSent`, stamped only when ≥1 send succeeds (total outage retries next run); no-recipient churches stamp anyway so a later opt-in never gets a backlog blast.
- **`useFirestore.js`** — `newJobsDigestSent` added to the server-field strip in `updateJobListing` + `updateJobListingSeries` so a job edit can't reset the announce stamp.
- **`firestore.rules`** — admin self-update branch now also pins `smsNewJobsEnabled` (an admin can't opt another user in — TCPA, mirrors the existing `phone`/`smsRemindersEnabled` pins). Self-update already allowed it (blocklist).
- **`SettingsPage.jsx`** — second checkbox **"New-shift alerts"** beside "Shift reminders" (renamed from "Enable SMS reminders"); both gated on verified email + saved phone; `smsNewJobsEnabled` wired through state/sync + all three save/remove paths.
- **Consent copy (carrier-cited)** updated everywhere for the second category + frequency 1–5 → **1–7/week**: `PublicSMSProgramPage.jsx` (heading, intro, opt-in screenshot with two boxes, "what messages" reframed off the now-false "no messages for shifts you didn't sign up for" absolute → "no marketing/promotional messages," added a third sample message, exact-disclosure box, opt-in/stop steps), Terms §7, Privacy §6 + §3, Help center accordion, aria-label.
- **A2P:** no campaign change needed — the registered use case is **Low Volume Mixed** (`CYO5934`), which already covers notifications; the registration cites `/sms-program` as the authoritative disclosure, so updating that page (+ Terms/Privacy) is the load-bearing compliance step. Campaign description/samples are display-only on a VERIFIED campaign (not edited).
- **`scripts/prime-newjobs-digest.cjs`** — one-shot run at deploy: stamps every currently-open upcoming job `newJobsDigestSent:true` so the existing backlog is never announced, regardless of when the first volunteer opts in.
- `npm run build` clean (prerender + verify-bundle pass); `node --check functions/index.js` clean; eslint 0 errors.
- **Rollout:** deploy `firestore:rules` → `node scripts/prime-newjobs-digest.cjs` → deploy `functions:sendNewJobsDigest` → push frontend. `onSchedule` (no invoker-IAM concern). Verify via the `scheduledJobRuns/sendNewJobsDigest` heartbeat after the first noon run.

## 2026-06-01 — Email migrated SendGrid → Brevo (code; deploy pending domain auth)

SendGrid ended its perpetual free tier — post-trial the "Free" plan is **0 emails/month**, so the shared SendGrid account (used by all four apps) can't send at all (`/v3/user/credits` → `total:0`; sends fail "Maximum credits exceeded"). Decision: migrate everything to **Brevo** (free 300/day, shared account). Cross-app effort tracked in `~/apps/echo-scripture/docs/backlog.md`; Echo + RepCrew + Court Climber already swapped.

- **`functions/index.js`:** new `sendViaBrevo(msg)` helper (Brevo transactional REST API, Node 22 global `fetch`, no SDK) that maps the existing SendGrid-shaped `{to,from,replyTo,subject,html,text}` message to Brevo's payload. `sendEmailSafe` now wraps `sendViaBrevo` instead of `sgMail.send` — so **every email function is migrated by this one swap** (welcome, job reminders/announcements/cancellations, task reminders/mentions, waitlist promotion, trial expirations, the new `notifyAdminsOfNewMember`, etc.). `initSendGrid()` → `emailConfigured()` (checks `BREVO_API_KEY`) at all ~13 guard sites. Dropped `@sendgrid/mail`. The suppression list (`emailSuppressions` + `isEmailSuppressed`) is unchanged and still applies; only the *feed* into it changes.
- **Bounce/spam suppression (done same day):** replaced `sendgridEventWebhook` with **`emailEventWebhook`** (onRequest) — parses Brevo's transactional event payload (`hard_bounce`/`spam`/`unsubscribed`/`invalid_email`/`blocked` → `emailSuppressions/{email}`), guarded by `?token=<BREVO_WEBHOOK_SECRET>` (auto-generated into `functions/.env`). Deployed + invoker-probed (401 reached, not 403) + end-to-end tested (POST a fake `hard_bounce` → 200 → suppression doc written → cleaned up). Old `sendgridEventWebhook` deleted. **Owed (John, Brevo dashboard):** Transactional → Settings → Webhook → add `https://us-central1-church-inventory-9615c.cloudfunctions.net/emailEventWebhook?token=<secret>` (secret is in `functions/.env`) and enable those events. Until then Brevo's own internal suppression still protects hard-bounces.
- `node --check` clean; `npm run lint` 0 errors (47 pre-existing src warnings).
- **Owed to deploy:** authenticate `churchopshub.com` in Brevo (Vercel DNS integration) + add the shared `BREVO_API_KEY` to `functions/.env`, then deploy the email functions. `FROM` stays `noreply@churchopshub.com`.

## 2026-06-01 — New-member onboarding: scoped default hubs + admin notification

Triggered by a real report: Jobs-Hub volunteers (Reid Gulick, Liam Gough) were showing up in the **Tasks Hub assignee picker**. Root cause (verified against live data + code): they had **no `allowedHubs` field**, which the system treats as "all hubs" (full access) — the default for anyone who signs up with just the church code (a non-invite signup). `useAuth.register`/`registerWithGoogle` omitted `allowedHubs` when none was passed (`"null means inherit all church hubs"`), so new members silently appeared in **every** hub's picker until an admin restricted them. Two fixes:

- **Scoped default (`src/useAuth.js`):** new `DEFAULT_MEMBER_HUBS = ['jobs', 'maintenance']`. Both signup paths now write `allowedHubs: allowedHubs ?? DEFAULT_MEMBER_HUBS` instead of omitting the field — so a plain church-code signup starts as **Job + Maintenance** (Inventory is the always-free base hub, available regardless of `allowedHubs`; `['jobs','maintenance']` is NOT the narrow `['jobs']` volunteer-only mode, so they keep the standard shell). Admins are unaffected (role override → see all). Hub-scoped invites still pass their own `allowedHubs`. Scan confirmed: after fixing Reid/Liam to `['jobs']`, **0** active non-admin members remain unrestricted.
- **Admin notification (`functions/index.js`):** new `notifyAdminsOfNewMember` — `onDocumentCreated('users/{uid}')` emails the church's active admins (name · email · granted hubs · "review in Settings → Team Members") so they know someone joined and can adjust access. Skips church creators (role admin). Admin lookup filters role in code (no composite index). **Outage-safe:** unlike `sendWelcomeEmail`'s set-before-send guard, the `newMemberNotifiedAt` sentinel is written **only on a successful send**, so a join during an email outage isn't permanently marked notified — it delivers once email is restored (a rare duplicate admin notice is harmless; a missed one isn't). Deployed scoped: `firebase deploy --only functions:notifyAdminsOfNewMember`.
- ⚠️ **The notification can't actually deliver yet:** COH email runs through the shared SendGrid account that ended its free tier (0 emails/month post-trial — see `~/apps/echo-scripture/docs/backlog.md` 🔴 Brevo migration). So ALL COH email (welcome, job reminders, this) is currently failing with "Maximum credits exceeded." `notifyAdminsOfNewMember` is deployed + correct and will start delivering the instant the email provider is fixed. Couldn't live-test the trigger (prod-write to the real church was blocked, and email is down anyway) — verified-by-construction against the proven `sendWelcomeEmail` pattern.
- `npm run build` clean (prerender + verify-bundle pass); `node --check functions/index.js` clean; eslint clean.

## 2026-05-30 — Jobs Hub: SMS notification when a waitlister is promoted to a spot (code only — DEPLOY PENDING)

Gap found while reviewing the waitlist flow: a member promoted off the waitlist into an open spot got an **email only** — no text — even though the daily `sendJobReminders` does send SMS to opted-in users. Getting bumped into a spot is time-sensitive, so a text is warranted.

- Renamed `sendWaitlistPromotionEmail` → `sendWaitlistPromotionNotifications` (`functions/index.js`) and made it send **email and SMS as independent channels** (mirrors `sendJobReminders`): a user with only one of {email, phone+smsRemindersEnabled} still gets that one. SMS reuses the exact A2P plumbing — `getTwilioClient()`, the registered Messaging Service (`TWILIO_MESSAGING_SERVICE_SID`) with bare-from fallback, the `phone && smsRemindersEnabled` consent gate, and the "Reply STOP to opt out." footer. Same job-SMS consent + use case as the reminders, so no A2P re-registration needed. Both call sites updated (`jobWithdraw` inline promotion + the standalone `promoteFromWaitlist` callable).
- `node --check` clean; 0 stale references.
- **NOT YET DEPLOYED** — the production Cloud Functions deploy (`firebase deploy --only functions:jobWithdraw,functions:promoteFromWaitlist --project church-inventory-9615c`) is awaiting explicit authorization. **Post-deploy: probe both callables for the Gen-2 invoker-strip** (`curl -X POST <url> -H 'Content-Type: application/json' -d '{"data":{}}'` → expect 401 JSON, not 403 html) and re-grant `allUsers/run.invoker` if stripped.

## 2026-05-28 — Error-handling audit Phase 5: wrap last 3 unguarded onCall functions (commit cec4e05)

Final phase of the cross-app error-handling remediation (`~/apps/ERROR-HANDLING-FIX-PLAN.md`). `identifyItem`, `getChurchStats`, and `createCheckoutSession` were the last Cloud Functions where an unexpected (non-`HttpsError`) throw returned a generic error to the client with nothing reaching Sentry.

- Added a `wrapCall(name, handler)` HOF just below `Sentry.init` (mirrors the MasteryHelp pattern): captures non-`HttpsError` throws with `tags:{fn:name}`, rethrows as a generic `'internal'` HttpsError, and passes `HttpsError` (expected auth/permission/validation rejections) through untouched so they don't become Sentry noise. Applied at the 3 definition sites (chose the HOF over inline try/catch to avoid re-indenting bodies).
- `node -c` clean; deployed scoped: `firebase deploy --only functions:identifyItem,getChurchStats,createCheckoutSession --project church-inventory-9615c`.
- **⚠️ Invoker strip on `createCheckoutSession`:** post-deploy probe returned 403 (`text/html` GFE rejection) — the Gen-2 redeploy stripped its `allUsers/run.invoker`, so Stripe checkout was down for admins. Re-granted via `gcloud run services add-iam-policy-binding createcheckoutsession … --member=allUsers --role=roles/run.invoker`; re-probe → 401 (reachable). **New lesson now in CLAUDE.md: the invoker-strip gotcha is not limited to onRequest webhooks — onCall callables can lose invoker on redeploy too, and an unauthed curl returns 401 (reached) vs 403 (stripped).**

## 2026-05-28 — Fix app-wide Google sign-in: two `vercel.json` header fixes (commits 43b2c34 + 03083fb)

Diagnosed while troubleshooting the Lisa Bosley case: Google sign-in/signup (`signInWithPopup`) was failing **app-wide** — popup completed, returned to the page, hung on "Signing in…" (reproduced with a personal gmail account → not FXCC-Workspace-specific; that's why every recent signup was email/password). Ruled out: OAuth consent screen (In production / External, correct), CSP `frame-src`/`script-src apis.google.com` (correct since the May fix), `authDomain` + `/__/auth` proxy (present), FXCC Workspace. **Two header root causes, both in the `/(.*)` block:**
1. **`X-Frame-Options: DENY`** (commit `43b2c34` → `SAMEORIGIN`). `DENY` blocks framing by *any* origin incl. same-origin, so the app couldn't embed its own `/__/auth/iframe` relay. Console: *"Refused to display 'https://churchopshub.com/' in a frame … X-Frame-Options to 'deny'"* + iframe as `chrome-error://chromewebdata/`. The piece the May CSP fix missed.
2. **Missing `Cross-Origin-Opener-Policy`** (commit `03083fb` → `same-origin-allow-popups`). Firebase polls `window.closed` on the popup; modern Chrome blocks that without explicit COOP. Console: many *"Cross-Origin-Opener-Policy policy would block the window.closed call"*.

After both: relay iframe loads, popup completes, sign-in works (verified in a fresh incognito window — a normal refresh serves the **stale PWA service-worker shell** with old headers, so testing must use incognito). Real users get the fixed headers on their next load (network-first SW). Minor benign quirk: the first popup click after a fresh load can race the lazily-loaded relay iframe and need a second click. See CLAUDE.md "Known Pitfalls" → the now-FOUR-allowance header rule. (Separate "CSP blocks eval" Issues-panel item is a startup library, unrelated to auth — not addressed.)

---

## 2026-05-28 — Fix invite/Google signup stranding (commit e895375)

Surfaced by a real support case (Lisa Bosley, FXCC): she got an invite link, the Google sign-in "just sat" on the create-account page, the Continue button stayed disabled, and a retry "gave a new screen." Investigation (live Auth + Firestore via Firebase MCP):

- She *does* have an account now — created via **email/password** at 13:36; her auth has **only a password provider** (no Google identity ever persisted). `fxcc.org` is Google Workspace (MX = google), so the email is a valid Google account; the popup just never completed an identity. **None of the recent COH signups used Google** (even gmail users), which suggests Google sign-in is failing/avoided app-wide and people fall back to email/password. The COH Google config is correct (CSP allows `apis.google.com` + `frame-src 'self'`, `authDomain: churchopshub.com` + `/__/auth` proxy rewrite present) — so the old 2026-03 CSP breakage is **not** recurring. Most likely cause for a Workspace account: FXCC's Workspace admin blocking the third-party app, or a device popup/redirect failure. Exact code is in Sentry under tag `flow:google-signin`.

Three fixes shipped (frontend-only):
- **Persist the invite code in sessionStorage.** It was URL-only and stripped on load (`history.replaceState`), so any refresh or redirect-based Google sign-in blanked `form.churchCode` → Continue button stuck disabled. Now stashed on first load, restored as a fallback, cleared on successful registration.
- **`ProfileMissingScreen` self-recovery.** It was a dead end (email-support only). Now offers a church-code completion form that calls `registerWithGoogle` (works for any authed user, Google or email/password); `registerWithGoogle` now also clears `profileMissing` so the recovered user lands in the app instead of being held on the screen.
- **Register-screen hint** that Workspace accounts may block Google sign-in → use the email/password form.

Build clean (0 jsxDEV), lint 0 errors. No rules/functions deploy (frontend only). **Open follow-up:** confirm the exact Google failure via Sentry `flow:google-signin`; if FXCC wants Google sign-in, their Workspace admin must approve the churchopshub OAuth app.

---

## 2026-05-27 — Self-heal stale-chunk MIME errors on entry-point imports (commit bab7b6a)

Sentry issue `63a627a0`: `TypeError: 'text/html' is not a valid JavaScript MIME type` on `/?invite=FXCC&hubs=jobs`. Root cause: the `vercel.json` `/(.*) → /app.html` catch-all turns a 404 for a missing asset chunk into a 200 + HTML; with `X-Content-Type-Options: nosniff`, the browser refuses to execute it as JS. After every deploy, anyone with a cached `index.html` requesting the old `App-<hash>.js` hit this. Same root cause as the documented "Failed to fetch dynamically imported module" pitfall — but the MIME variant slipped past coverage because the failing import was a **raw** `import('./App.jsx')` in `main.jsx`, not a `lazyWithRetry`-wrapped hub chunk.

- `src/utils/lazyWithRetry.js` — extracted an `importWithRetry(factory, name)` primitive; `lazyWithRetry` now wraps it. The generic `catch` already handles both the "Failed to fetch" and "not a valid JavaScript MIME type" variants. Retry once → reload once (sessionStorage-guarded) → if still broken, throw.
- `src/main.jsx` — wrapped all three entry-path dynamic imports (`App.jsx`, `firebasePublic.js`, `PublicJobsPage.jsx`) with `importWithRetry`. These run before any React tree mounts, so a stale chunk here is fatal with no error boundary to catch it. Third-party background loads (posthog) left raw — post-mount, non-fatal.

## 2026-05-27 — Hub filter on Settings → Team Members (commit 96dd954)

Admins can narrow the Team Members list to users with access to a specific hub (e.g. "who has Job Hub access?"). Dropdown next to the member count, defaults to "All hubs". `SettingsPage.jsx` — admins always count as having every hub; non-admins match when `allowedHubs` is null (full access) or includes the selected hub. Count line flips to "X of Y members" while filtered; empty-state hint when nobody has the selected hub.

## 2026-05-27 — Optional end time on job listings

User-requested: "some jobs have a starting time and an ending time, not just a starting time." Now jobs carry an optional `scheduledEndTime` (HH:MM, same shape as `scheduledTime`).

- Job form (`JobsPage.jsx:1670+`) — "Time" relabeled "Start Time" with a new "End Time" input beside it; both flow through `addJobListing` / `updateJobListing` / `addJobListingSeries` via the existing `...jobForm` spread (no rules change needed — the update rule is a denylist, and `scheduledEndTime` isn't on it).
- New `formatTimeRange(start, end)` helper in `src/utils/time.js` and mirrored in `functions/index.js` — renders "2:00 PM – 4:00 PM" when both are present, falls back to "2:00 PM" alone, or "(until 4:00 PM)" if only end is set.
- Display surfaces all switched to `formatTimeRange`: JobsPage board, schedule row, calendar cell, detail modal · PublicJobsPage card · VolunteerHome next-shift + shift rows · `printJobRoster` · `exportJobsICS` (uses the real end time as `DTEND` when present and end > start; still falls back to +1hr otherwise).
- Outbound notifications updated: `sendJobReminders` email HTML + plain-text + SMS (single-job and multi-job bodies), `sendJobCancelledEmails`, `sendJobPosterNotification`, `promoteFromWaitlist` waitlist-promotion email.
- `getPublicJobs` public payload now includes `scheduledEndTime` so anonymous viewers on the share-board URL see the range too.

Bonus fixes uncovered along the way:
- `VolunteerHome` was rendering raw `job.scheduledTime` ("14:00") instead of the formatter — now formatted.
- `promoteFromWaitlist` email was likewise rendering raw `jobData.scheduledTime` — now formatted.

Legacy jobs without an end time keep working unchanged (start-time-only fallback). No migration needed.

---

## 2026-05-27 — Signup name previews on Job Board + Schedule

Follow-up to the volunteer shell: as a volunteer testing in FXCC, "I don't see who's signed up" — `JobCard` and `DesktopScheduleRow` only rendered `signupCount/spotsTotal`, never actual names, even when the viewer was allowed to see the roster. The `showRoster` prop was being passed but ignored.

- `JobsPage.jsx` now maintains `cardSignupsByJob` (Map<jobId, string[]>) — fetched on demand for every visible job where `canSeeRoster(job)` is true. Refires when `jobListings` changes, since the parent `signupCount` updates as a Cloud Function side effect of every signup/withdraw (no per-job snapshot listeners; reads stay bounded). Skips jobs with `signupCount==0`.
- New `SignupChips` primitive renders 2 teal pills (`Hazel B.`, `John V.`) + `+N more` collapse on JobCard. Schedule row shows comma-separated `First L.` names with a 3-name cap.
- Names formatted as `First L.` via `shortDisplayName()` — keeps cards compact and avoids exposing full last names church-wide when `jobsRosterVisibility='all'`.
- **FXCC `jobsRosterVisibility` flipped from `'signups'` → `'all'`** so every FXCC member sees signups in detail modals + on cards. Revertable from Settings → Jobs Hub.
- New test account `e2e-volunteer@churchopshub.com` (uid `7uIesfkVLGUvAZoc2n84TUoBwU43`, password `E2eTestPass123!`) provisioned via `scripts/setup-e2e-tenant.mjs` for manual volunteer-shell verification. Currently pointed at FXCC (move back to `e2e-test-church` via `node -e` admin SDK call when no longer needed). The setup script supports a per-account `allowedHubs` override now — set it on the ACCOUNTS entry to bypass the FIELD_DELETE default.

`→ Task` / Edit / Delete / Notify Signups / Print Roster are all gated behind `isAdminOrManager` in the job detail modal (`JobsPage.jsx:1976`), so volunteers never see them.

---

## 2026-05-27 — Volunteer-aware app shell

Hazel — a teen volunteer Jill invited via `?hubs=jobs` — landed in the app on her phone and saw the **Activity Log** as her first screen with raw admin-side noise (`Removed Uid: jgHRMpU4xR…`) and 7 tabs of operational features she had no permission to touch. The shell was admin-shaped end-to-end; volunteers had no purpose-built entry point.

Now: when `isVolunteerOnly(userProfile)` is true (role `'user'` with `allowedHubs === ['jobs']`), the app shows a jobs-first shell:

- **New `isVolunteerOnly` predicate** at `src/utils/roleHelpers.js` — single source of truth for every branch below.
- **4-tab mobile nav** (Home / Jobs / Activity / Settings) instead of 7 (`src/App.jsx`). Desktop tab row swapped to the same four. "Hubs" tab key stays the same but is labeled "Jobs" with a 💼 icon since for volunteers there's effectively only one hub.
- **New `VolunteerHome`** landing (`src/pages/VolunteerHome.jsx`) replaces the generic `Dashboard` for volunteers — greeting, "Next Shift" gradient card with Add-to-Calendar (.ics via `exportJobsICS`), upcoming shifts list, open-this-week list, "View all jobs" + "Open calendar" CTAs.
- **Auto-route single-hub users** in `src/pages/HubsPage.jsx` — anyone with `allowedHubs.length === 1` skips the upgrade-card grid and lands straight in their hub via a `useEffect`. The grid renders `null` in the interim so they never see a 6-card upgrade flash.
- **Volunteers see only their hub card** if they back out to the picker; the All-In Bundle callout is admin/manager-only.
- **JobsPage accepts `initialView` prop** so VolunteerHome's "Open calendar" CTA lands on the Calendar sub-view. On mobile, volunteers default to Calendar (date-first mental model); admins keep the Job Board default.
- **Activity Log filtered to self** for non-admin/manager (`src/pages/ActivityLogPage.jsx:67-68`). Volunteers see only their own sign-ups, withdrawals, and waivers — a useful "did my signup save?" surface, no admin noise.
- **UID detail keys scrubbed** from log detail rows for everyone (`HIDDEN_DETAIL_KEYS` set blocks `removedUid`, `addedUid`, `mentionedUid`, `uid`, `actorUid`, `targetUid`). Raw UIDs are debug-only; engineering still has them via Firestore + Sentry.

Admin/manager experience is byte-identical to before — every branch is `if (isVolunteerOnly(userProfile))` gated.

Out of scope (future): push notifications for shift reminders, swap-request UX redesign, a `role:user` non-volunteer landing (e.g. for someone with only Tasks Hub access — same `isVolunteerOnly` pattern would generalize).

---

## 2026-05-27 — Jobs Hub: missing COLLECTION-scope index broke series "this + all future" edit

Jill reported the recurring-job edit modal throwing a red index error at the top of the page when she picked **"This + all future jobs"**. `updateJobListingSeries` (`src/useFirestore.js:1032-1036`) runs a compound query `where('recurrenceGroupId', '==', g) + where('scheduledDate', '>=', d)` against `jobListings`, which needs a COLLECTION-scope composite index on `(recurrenceGroupId ASC, scheduledDate ASC)`. The index has been declared in `firestore.indexes.json:20-26` since the feature shipped in commit `cf24e63` (2026-04-24), but `firebase deploy --only firestore:indexes` silently skipped it — `gcloud firestore indexes composite list` confirmed only the `(status, scheduledDate)` indexes were in prod.

Same compound query is also used by `deleteJobListingSeriesFrom` (`src/useFirestore.js:1105-1109`), so "delete this and all future" was broken with the identical symptom (just no one had tried it yet).

Fix:
- Created the composite index directly via `gcloud firestore indexes composite create --collection-group=jobListings --query-scope=COLLECTION --field-config=field-path=recurrenceGroupId,order=ascending --field-config=field-path=scheduledDate,order=ascending`. Index built in seconds and is now `READY`.
- `src/useFirestore.js:38-71` — hardened `handleErr` so future missing-index regressions surface as `level: 'fatal'` in Sentry with `missingIndex:true` tag + the parsed Firestore Console URL (clickable for one-click index creation). User-facing message now says *"This feature is temporarily unavailable while a database index finishes building"* instead of the raw Firestore error.
- Verified all other composite indexes + field overrides in `firestore.indexes.json` are present in prod (the four jobListings composite indexes plus signups.uid / waitlist.uid / config.status / tasks.dueDate / jobAnnouncements.repeatWeekly / taskTemplates.autoGenerate field overrides all show `state: READY`).

This is the same `firebase deploy` skip pattern documented under Known Pitfalls + memory `feedback_firebase_collection_index.md`. Long-term fix (deferred): a post-deploy verifier script that probes each declared index against the live DB.

---

## 2026-05-26 — SEO refocus: rewire internal links toward GSC sleeper hits

GSC 28-day pull (via `~/apps/seo-tools/gsc.py`) found `/blog/volunteer-coordinator-role-guide` ranking at **avg pos 22.8 with 198 impressions** but **zero inbound internal links** — `BlogPost.jsx` "Keep Reading" was sorting by date desc, so newer posts captured all cross-link juice. Meanwhile `/blog/best-church-management-software-small-churches` had 399 impressions at avg pos 55–94 (Planning Center / Tithe.ly own that SERP) — its impressions were being inflated by the same date-desc rotation.

Changes:
- `BlogPost.jsx:197-209` — related-posts selector now reads optional `related: [slugs]` per post, with date-desc fallback that excludes the wrong-SERP loser.
- `blogPosts.js` — added `related` arrays to 7 posts (volunteer-coordinator + 6 semantic neighbors: scheduling-system-that-lasts, equipment-accountability, hidden-cost-of-spreadsheets, what-planning-center-cant-do, kanban-maintenance, workday-planning). Net inbound to the target post: 0 → 6.
- `blogPosts.js` — one inline contextual link added per source post pointing to volunteer-coordinator-role-guide.
- `LandingPage.jsx` — new "From the blog" featured section between How It Works and CTA banner, linking the target post from the property's highest-authority URL (homepage, avg pos 14.3).
- `docs/SEO-REFOCUS-2026-05-26.md` — rationale, change set, and a verify script for the 2026-06-23 re-check (success = volunteer-coordinator below pos 18).

Build verified: 21 blog posts prerendered, new links present in static HTML for Googlebot. See `docs/SEO-REFOCUS-2026-05-26.md` for the full plan.

---

## 2026-05-25 — Session summary: E2E isolation + contrast pass

End-of-session arrival: **60 passed / 0 failed / 7 skipped in 2.5 min**.

Baseline at session start (post-Phase-7): 47 passed / 16 failed / 4 skipped
in 6.7 min. Path:

| Step | Result | Δ |
|------|------|---|
| Phase 7 polish backlog | 47/16/4 | — (uncovered the failures) |
| Layer 2 — recursive purge | 47/16/4 | defensive only |
| Layer 1.5 — Phase 2 dialog sweep | 57/6/4 | +10 dialog tests green |
| Layer 1 — dedicated test tenant | 55/6/6 | infra cleaner; product debt visible |
| Contrast pass v1 (warmGray) | 54/7/6 | new violations surfaced on sand + navy |
| Contrast pass v2 (navy + sand + tests) | **60/0/7** | fully green |

The remaining 7 skipped: 4 long-standing baseline-skipped specs +
L9 owner-tab test (jcvaught@-gated) + public-board cache race +
one SMS smoke gated behind E2E_RUN_SMS.

---

## 2026-05-25 — E2E isolation Layer 1: dedicated test tenant + contrast fix

The structural fix. The E2E suite no longer runs against the production
FXCC church — it has its own dedicated tenant `e2e-test-church` with
the three test accounts, all hubs unlocked, no real members. Tests
that depended on FXCC's content (the "Supplies36" tab-name pollution)
now run against a clean tenant; the only data in the tenant is what
each spec seeds. Suite went 57/6/4 → 55/6/6 then to **60/1/6** after
fixing the contrast bug below — the only remaining red is the
public-board `getPublicJobs` 60s cache race (separate one-line
follow-up).

Components shipped:

- **`scripts/setup-e2e-tenant.mjs`** (new, idempotent) — mints
  `e2e-member-a@churchopshub.com` Auth user, creates
  `churches/e2e-test-church` with config/main (onboardingComplete:
  true so the new-user modal doesn't intercept clicks), config/main +
  config/settings + config/subscription (`grandfathered: true` so
  every hub unlocks without Stripe) + config/notifications. Writes
  `users/{uid}` for admin/memberA/memberB with `churchId:
  'e2e-test-church'`, `role` set, and `allowedHubs` deleted (per
  firestore.rules:34 the field-missing sentinel grants full hub
  access — `null` doesn't work because the rule uses
  `!('allowedHubs' in userData())`).
- **`e2e/admin-helpers.js`** — `CHURCH_ID` swapped from FXCC's id to
  `'e2e-test-church'` with a startup guard
  (`throw if !CHURCH_ID.startsWith('e2e-')`) so a future hardcode to a
  real church gets caught at import time. `uids()` map's memberA email
  switched to `e2e-member-a@churchopshub.com`.
- **`e2e/auth.setup.member-a.js`** + **`e2e/client-helpers.js`** —
  default email/password swapped.
- **`e2e/authenticated/uat-ui.spec.js`** L9 — skipped with a comment.
  The owner gate at `src/pages/SettingsPage.jsx:130` is hardcoded to
  `['jcvaught@gmail.com', 'jvaught@fxcc.org']`. Adding
  `e2e-member-a@churchopshub.com` to that allowlist would let anyone
  register that Firebase Auth email and claim owner privileges in
  real customer churches. Skip is safer than expanding the allowlist;
  re-enable by either hub-flagging the owner check via a rule-protected
  Firestore field or moving L9 to manual UAT.

Contrast bug discovered + fixed in the same session:

- **`src/components/brand/tokens.js`** — `B.textLight` darkened one
  more notch from `#6B7280` → `#5F6878`. Audit M8 had already
  darkened it once (`#8B93A1` → `#6B7280`) for the white-bg case,
  but `#6B7280` on `B.warmGray (#F2F0EB)` is 4.24:1, just below the
  WCAG-AA 4.5:1 threshold for normal text. The new value is
  `~4.95:1` on warmGray and `~5.5:1` on cream/white. Surfaced
  immediately once Layer 1 cleared the navigation blocker — FXCC's
  data noise (the "Supplies36" issue) had been masking the a11y axe
  scans. Visually nearly identical; technically WCAG-AA compliant.

Plan + sequencing: `docs/E2E-ISOLATION-PLAN-2026-05-25.md`. Memory
pointer: `~/.claude/memory/project_coh_e2e_isolation.md`.

Side effects on FXCC:

- `users/{e2e-admin-uid}` and `users/{e2e-member-b-uid}` now point at
  `e2e-test-church` instead of FXCC. From FXCC's perspective those
  two accounts are gone (already filtered from member lists by
  `excludeTestAccounts`, so no real-member-facing impact).
- `jcvaught@gmail.com`'s user doc stays untouched — still a FXCC
  member. Just retired from the E2E suite.

---

## 2026-05-25 — E2E isolation Layer 1.5: Phase 2 test follow-up

Closed all 10 dialog-related failures from the post-Phase-7 E2E run.
Suite went 47/16/4 → 57/6/4. Remaining 6 = 5 a11y axe scans (need
Layer 1, FXCC data state) + 1 public-board test (separate finding:
the 2026-05-23 `getPublicJobs` 60s in-process cache races a freshly-
seeded test job; tracked as a one-line follow-up).

Why these 10 broke in the first place: Phase 2 (2026-05-25) replaced
all 41 `window.confirm()` calls with the React `ConfirmDialog` modal.
The E2E suite had 11 sites using
`page.once('dialog', d => d.accept())` — Playwright's *native* browser
dialog API, which silently no-ops against a React modal. The
destructive verbs (admin Remove, member Withdraw, hard-delete,
delete-series, Share Board copy) never fired in the test.

Changes:
- `e2e/admin-helpers.js` — new `acceptConfirm(page, label)` and
  `dismissConfirm(page, label='Cancel')` exports. Use
  `getByRole('dialog').last()` so they target the topmost modal when
  ConfirmDialog stacks on top of a content modal.
- 11 sites swept across 7 spec files (waitlist ×3, notifications-gate
  ×3, signup-flow, edge-cases, recurring, uat-ui M10, crud cancel-path).
- M10 dialog assertion updated: `dialog.innerText()` instead of
  `dialog.message()`, regex relaxed to `/public page/i` to match the
  Phase 2 lowercase + `<strong>`-bolded copy.
- crud.spec.js cancel-path was passing for the wrong reason (no-op
  handler left modal hanging, delete never fired); now genuinely
  clicks Cancel in the ConfirmDialog.

Plan + sequencing: `docs/E2E-ISOLATION-PLAN-2026-05-25.md`.

---

## 2026-05-25 — E2E isolation Layer 2: recursive purge

`e2e/admin-helpers.js` `purgeE2EArtifacts()` now calls
`firestore.recursiveDelete()` on every `[E2E]`-prefixed parent instead of
issuing a flat `batch.delete()`. Closes the cleanup gap exposed by the
2026-05-22 Jobs Hub H1 refactor — `jobListings/{id}/signups/{uid}` and
`…/waitlist/{uid}` are protected subcollections that the previous
parent-only delete left orphaned forever. Plan + sequencing in
`docs/E2E-ISOLATION-PLAN-2026-05-25.md`; Layer 1 (dedicated
`e2e-test-church`) still pending a focused session, but unblocked
(OQ 1 + OQ 2 both resolved 2026-05-25).

The recursiveDelete pattern is applied uniformly across all 4 cleanup
paths (jobListings, jobAnnouncements, accessPeople, accessRecords) as
cheap insurance against future schema growth — only jobListings has
subcollections today, but the cost is negligible and the call site is
already locked to `[E2E]`-filtered refs, so a stray non-test ref can't
slip through.

**Re-run note:** the post-Layer-2 E2E run produced the same 47/16/4 as
the pre-Layer-2 run, which forced a re-diagnosis. 11 of the 16 failures
turn out to be Phase 2 fallout — the test suite's
`page.once('dialog', d => d.accept())` handlers (Playwright's *native*
browser-dialog API) no-op against the React `ConfirmDialog` modal
Phase 2 introduced, so destructive actions never fire. See
`docs/E2E-ISOLATION-PLAN-2026-05-25.md` "Correction" section + the new
**Layer 1.5** plan that addresses this. Layer 2's change is still
correct defensive cleanup — orphans from crashed runs will get reaped —
it just doesn't surface in today's results.

---

## 2026-05-25 — UI audit Phase 7: polish backlog

Phase 7 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. Single-pass cleanup of the
Medium/Low/Nit findings grouped by file. Build + lint clean (0 errors,
47 baseline warnings).

- **LandingPage** — pricing math now shows the breakdown ("7 hubs separately:
  6 × $7 + $5 = $47/mo → bundle saves $18/mo") instead of the stale, un-mathed
  "Save $16/mo"; external network links upgraded from `rel="noopener"` to
  `rel="noopener noreferrer"`.
- **App.jsx** auth-screen TOS/Privacy checkbox — Terms of Service and
  Privacy Policy buttons now have `text-decoration:underline` so they read
  as links inside the prose-style checkbox label.
- **BlogPost.jsx** — second back-link unified to "← Back to Blog" (was
  inconsistent with the rest of the app pattern).
- **BlogIndex.jsx** — post cards gain a permanent subtle resting shadow
  + a touch-press scale animation (`onTouchStart`/`onTouchEnd`) so touch
  users get visual feedback instead of relying on `:hover`-only shadow.
- **ActivityLogPage.jsx** — search input gets a clear-X button when
  non-empty; timestamps get a `title=…` tooltip showing full long-format
  time + IANA timezone (e.g. "Tuesday, May 25, 2026 at 10:42 AM EDT
  (America/New_York)"); chevron+row clickability already gated correctly
  via `dets`, no change needed.
- **ItemsPage.jsx** — search placeholder updated from "Search by name or
  ID..." to "Search by name, ID, location, or tag..." (matches actual
  search behavior); success toast gains a 5s linear countdown bar
  (`@keyframes coh-toast-countdown` in `index.html`).
- **SuppliesPage.jsx** — supplies grid gains `maxWidth: 1600` with
  `margin: '0 auto'` so cards don't sprawl on ultrawide displays; minmax
  bumped 300→320px for slightly better card density.
- **Modal.jsx** — close-X button gets `title="Close"` tooltip alongside
  the existing `aria-label="Close dialog"`.
- **InsightsPage.jsx — Seasonal chart** — X-axis labels now rotate -35°
  on mobile (with `textAnchor:'end'`, `height:44`, `interval:0`) so the
  monthly labels don't collide on narrow screens.
- **JobsPage.jsx — Mobile calendar** — Overdue / This Week / Next 30
  Days / Later groups are now collapsible with a chevron toggle and
  `(N)` count beside the heading. State held in component-local
  `collapsedGroups`. Pay frequency unit was already present ("per
  person") — no edit needed.
- **TasksPage.jsx** — Task detail modal gains a "📋 Copy" button next
  to the TSK-### number (uses `navigator.clipboard.writeText`, fires a
  flash). Both the create-task form and detail modal Recurrence field
  gain a "🔁 Next recurrence: <date>" preview line driven by
  `calculateNextDue(dueDate, recurrence)`.
- **Emoji aria sweep — Maintenance / Tasks / Accountability / Insights**
  — added `EmojiIcon` import to each and wrapped the standalone-emoji
  patterns the Phase 4 outcome flagged as outstanding (recurrence 🔁,
  photos 📷, due-date 📅, vendor 📞 / ✉️, empty-state icons, "Linked
  Job" 💼, blocked-by ⛔, warranty/running-out ⚠️, export ⬇, print 🖨,
  audit metadata 📅/👤/📦). Screen readers now announce a meaningful
  label or skip via `aria-hidden`, instead of falling back to the
  Unicode glyph name. Some emoji-as-icon spans remain (Stat icons are
  already handled by the Stat primitive); the high-traffic standalone
  cases on these 4 hubs are covered.

Audit doc untouched (the closed-item strikethroughs would be sprawling
for a 30+ item polish pass — the SHIPPED stamp on Phase 7 in the plan
doc is the closure marker).

---

## 2026-05-25 — UI audit Phase 6: upgrade-gate preview

Phase 6 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. The paywall used to show a
generic "🔒 + price + Subscribe Now" card with no visual context for what
the user is being asked to buy. Non-subscribers landed on a wall and bounced.
Phase 6 turns each gate into a *"see what you get"* preview by showing the
real hub UI above the upgrade card.

**`src/components/primitives/UpgradeGate.jsx`**
- Added optional `previewSrc` / `previewAlt` props. When `previewSrc` is
  passed, an image block renders above the existing upgrade card with a
  soft `mask-image: linear-gradient(to bottom, black 80%, transparent)`
  bottom-edge fade and a small "Preview" chip top-left.
- Image is `aria-hidden="true"` + `loading="lazy"` (the upgrade card
  already names the hub + price, so the image is decorative for AT).
- Wired PostHog: both the Subscribe and Contact buttons now fire
  `window.posthog?.capture('upgrade_gate_click', { hubName, action })`
  with `action: 'subscribe' | 'contact'`. PostHog wrapper is try/catch'd
  so telemetry never blocks Stripe checkout. Pattern matches the
  existing `jobs_signup_attempted` event in JobsPage.
- Existing props (`hubName`, `hubLabel`, `hubPrice`, `hubDescription`,
  `hasHub`, `children`) and the Stripe `createCheckoutSession` flow are
  unchanged — preview is purely opt-in.

**`src/pages/HubsPage.jsx`**
- New `UPGRADE_PREVIEWS` constant maps each paid hub key to its
  `'/upgrade-previews/<hub>.jpg'` URL.
- The single `<UpgradeGate />` callsite (~line 137) now passes
  `previewSrc={UPGRADE_PREVIEWS[hubKey]}` and
  `previewAlt={hubLabel + ' preview'}`.

**`public/upgrade-previews/`**
- 7 new JPEG screenshots (one per paid hub) captured from the live
  prod ChurchOpsHub at 1440px viewport using Playwright signed in
  as `e2e-admin@churchopshub.com`. Personally-identifiable names in
  People Access / Tasks / Jobs were rewritten to placeholder names
  via in-page DOM substitution before each screenshot.
- Compressed via `sips` to JPEG @ 65–78% quality, resampled to
  1040–1120px wide. All under 80KB each (insights 61K, maintenance
  74K, coordination 70K, accountability 58K, people-access 56K,
  tasks 81K, jobs 54K). Lazy-loaded, so no impact on hub picker LCP.

**Why JPEG instead of PNG**: the audit plan called for PNG, but sips
(only image tool available on this Mac without installing pngquant) won't
quantize PNGs effectively. JPEG at 70–78% quality hits the size budget
cleanly and the bottom-fade mask plus aria-hidden semantics mean lossy
artifacts are invisible.

**Verification**: production build clean (`npm run build` ✓, 4.0s,
prerender + verifier all green). Lint at baseline (0 errors, 47
exhaustive-deps warnings — baseline is ~45). Manual smoke deferred —
the gated state requires a no-hubs account, which doesn't exist in
the FXCC test church (all accounts trial the full suite).

**Out of scope** (deferred): option (b) live-data preview mode
(`previewMode={true}` swapping Firestore for fixtures), PostHog funnel
dashboard for `upgrade_gate_click` → checkout conversion, and any
A/B test of preview-on vs preview-off. Single variant ships; measure
conversion lift naturally over the next ~2 weeks via PostHog.

---

## 2026-05-25 — UI audit Phase 5: hub-specific high-impact UX

Phase 5 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. Nine targeted hub-specific items
spread across Tasks, Maintenance, Coordination, Jobs, and Accountability.

**TasksPage**
- New `depthByDocId` memo walks the `parentTaskId` chain (capped at 5 to
  contain cycles) and exposes a nesting level for every task.
- `TaskCard` gains a `depth` prop that adds `marginLeft: depth * 12` so
  subtasks step in 12px per level in the Kanban column rendering.
- List view's subtask rendering was extracted into a recursive
  `renderSubtree(parent, level)` helper so grand-subtasks now appear under
  their parent instead of being silently filtered out of the top level.
- The parent reference line on subtask cards renders **"Parent: TSK-###"**
  (was the bare `↳` glyph).
- The audit's "wire `isDirtyRef` for overdue badge persistence" item turned
  out moot in current code — `isDirtyRef` is already wired into the
  detail-modal conflict-resolution (TasksPage.jsx:1142-1190) and the
  overdue badge is purely derived from the live Firestore snapshot.
  No code change needed.

**MaintenancePage**
- New `isTouchOnly` state listens to `matchMedia('(hover: none)')`. On
  touch-only devices the checklist drag handle (`⠿`) is replaced with
  paired ▲/▼ reorder buttons (28×22, aria-labelled, disabled at the
  list ends). HTML5 drag-and-drop barely works on touch, so the buttons
  give a reliable mobile path.
- Vendor phone now renders as `<a href="tel:…">` and email as
  `<a href="mailto:…">`, both in teal (matches the visited-link cue
  the rest of the app uses).

**CoordinationPage**
- The bundle-checkout modal already reads from the live `activeItems`
  Firestore subscription (so the "Items (X/Y available)" summary and the
  disabled CTA were already live). What was missing was *acknowledgement*
  when state changed under the user. Added: `initialAvail` snapshot
  captured imperatively in `openCheckout(b)` (not via effect — avoids the
  "setState in effect" lint), then a 🟠 banner inside the modal that lists
  any items that were available at open but no longer are
  ("Heads up: 2 items became unavailable while you were here (E-014, E-017).
  The button below reflects the new count.").

**JobsPage** — swap-request initiator can now withdraw
- New `getMyJobSwapRequest(jobDocId, uid)` query in `useFirestore.js`
  (Firestore-rules require an explicit `where('uid', '==', uid)` clause
  so the rule engine can prove every result is readable).
- `firestore.rules` `jobSwapRequests` read rule loosened from admin/manager
  only to `admin/manager OR (member && resource.data.uid == request.auth.uid)`.
  Members can now read **their own** swap request documents, nothing more.
- Detail-modal load effect for the current user's own swap request runs
  alongside the existing admin load effect; on success the swap-request
  CTA flips from "Request Swap" → "Withdraw Request" with a tooltip and
  busy-state. Withdrawal deletes the request doc and reverts the button.
  `handleSubmitSwapRequest` now optimistically caches the new doc so the
  affordance flips immediately without a re-fetch.

**AccountabilityPage**
- `completeAudit()` now persists the saved audit doc into a new
  `auditSuccess` state and opens a `✅ Audit saved` modal (was: a flash).
  The modal shows location + items-checked + discrepancy count, then three
  next-actions: **View this audit** (opens the audit detail modal),
  **Start another audit** (admin/manager only — jumps to setup),
  **Insurance export** (admin only). Plus a plain Close to dismiss.
- Chain-of-custody timeline's empty state ("No activity recorded for this
  item") was replaced with a styled timeline row labelled **Unknown
  Location** so the visual pattern is consistent with the populated case
  and the user gets a clear "we own this, but its provenance is unknown"
  signal instead of an empty pane.

**HubsPage** — already done in a prior phase, no change.

**Files touched:**
`firestore.rules` · `src/useFirestore.js` ·
`src/pages/hubs/{TasksPage,MaintenancePage,CoordinationPage,JobsPage,AccountabilityPage}.jsx` ·
`docs/UI-AUDIT-2026-05-24-PLAN.md`.

**Acceptance:** `npm run build` clean. `npm run lint` 0 errors / 47
warnings (baseline). Firestore rules deployed
(`firebase deploy --only firestore:rules`).

---

## 2026-05-25 — UI audit Phase 4: cross-cutting a11y patterns

Phase 4 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. Two reusable primitives so the
audit's color-only-status and emoji-as-icon findings collapse into a single
pattern rather than dozens of one-off edits.

**New primitives:**
- `src/components/primitives/StatusDot.jsx` — colored dot with a required
  `label` prop. Renders `role="img"` + `aria-label`, and the label is either
  visible (`showLabel`) or visually-hidden (default screen-reader-only).
  Stops conveying state through color alone.
- `src/components/primitives/EmojiIcon.jsx` — two modes:
  *decorative* (`<EmojiIcon emoji="📦" decorative />` → `aria-hidden`) for
  emojis that sit next to label text, and *semantic*
  (`<EmojiIcon emoji="📦" label="Inventory" />` → `role="img"` +
  `aria-label`) for emojis that carry meaning on their own. Without one of
  these, screen readers announce the Unicode name of the glyph (e.g. "🔁" →
  "clockwise vertical arrows"), which rarely matches author intent.

**Pattern A — color-only status (StatusDot):**
- `SuppliesPage.jsx` `StockBar` — added `role="progressbar"` with
  `aria-valuenow` / `aria-valuemin` / `aria-valuemax` and an aria-label of
  the form *"Low stock: 3 of 5 minimum"*. The visible quantity text is now
  `aria-hidden` (redundant with the announce).
- `CoordinationPage.jsx` notifications dot — wrapped in `<StatusDot>` with
  "Notifications enabled/disabled" label.
- `PeopleAccessPage.jsx` person-card severity emoji — replaced the
  conditional `🔴`/`🟡` glyph with `<StatusDot>` whose label spells out
  *"Has expired or critically-expiring records"* / *"Has records expiring
  within 30 days"*.
- `JobsPage.jsx` status badges — already had `aria-label` on
  `JobStatusBadge` (audit M13); confirmed no regression.
- `ReservationsPage.jsx` `ResBadge` — the status icon was always paired
  with a visible status word, but the emoji glyph was being read aloud
  alongside it; wrapped in decorative `EmojiIcon`.

**Pattern B — emoji as icon (EmojiIcon):**
Applied across the high-traffic surfaces (Dashboard, ItemsPage, HubsPage,
ActivityLogPage, SuppliesPage, ReservationsPage, SettingsPage,
PeopleAccessPage, JobsPage, CoordinationPage) plus the shared `Stat`
primitive — every `Stat` instance is now silently iconed. Tab labels in
JobsPage (`💼 Job Board`, `📋 Schedule`, etc.) were split so the emoji is
decorative and only the word reaches the AT.

**Test coverage:**
- `e2e/authenticated/a11y.spec.js` (NEW) — runs `@axe-core/playwright`
  against /, /inventory, /supplies, /people-access, /jobs with a focused
  ruleset (`image-alt`, `aria-allowed-attr`, `aria-roles`,
  `aria-valid-attr-value`, `aria-required-attr`, `color-contrast`). The
  Supplies scan disables `color-contrast` because the StockBar's gold
  sub-pixel fill is intentional and not a text contrast issue.
- `@axe-core/playwright` added to devDependencies (`^4.11.3`).

**Deferred (single-pass per plan's Phase 7):**
Maintenance, Tasks, Accountability, and Insights hub pages still have
~60 unwrapped emojis. The pattern is in place; the codemod sweep across
the rest is the Phase 7 polish item and will be done in one pass.

---

## 2026-05-25 — UI audit Phase 3: app shell + responsive

Phase 3 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. Eight items targeting mobile/tablet
cramming and the focus-trap gap on the account menu — no new behaviour for
desktop ≥1024px, but every item below 1024px tightens up.

**New shared primitives:**
- `BREAKPOINTS = { mobile: 480, tablet: 768, desktop: 1024 }` in
  `src/components/brand/tokens.js`, and `useBreakpoint()` in
  `src/hooks/useMobile.js` returning `'mobile' | 'tablet' | 'desktop'`.
  Layouts that benefit from a third state import the hook; boolean
  decisions keep using the existing `MobileCtx` at 768px.
- `Modal.Footer` slot in `src/components/primitives/Modal.jsx`. When a
  Modal child is `<Modal.Footer>...</Modal.Footer>`, the panel becomes a
  flex column with a scrollable body and a sticky footer. Long
  forms no longer scroll their Save/Cancel row off-screen.

**Items shipped (numbered to the plan):**
1. Tablet breakpoint + `useBreakpoint()` hook (above).
2. App tab bar (`src/App.jsx`): `scrollSnapType: x mandatory` + edge-fade
   `maskImage` so the row scrolls tab-by-tab at tablet widths with a
   visible "more off-screen" cue.
3. Account menu focus trap (`src/App.jsx` AppShell): `role="menu"` +
   `aria-haspopup`/`aria-expanded` on the trigger, focus moves into the
   menu on open, Tab cycles inside, Escape closes and restores focus to
   the trigger. Mirrors the contract Modal already uses.
4. Dashboard stat grid (`src/pages/Dashboard.jsx`): now 2-col on phone,
   **3-col on tablet** (new — previously cramped 5-up at ~700px), 5-col
   on desktop. Uses `useBreakpoint()`.
5. Settings card sectioning (`src/pages/SettingsPage.jsx`): the My
   Profile card no longer mixes identity + notifications +
   delegate-picker. Identity stays in *My Profile*; SMS Job Reminders and
   Job Hub Report Delegates moved into a new *Notifications* card that
   only renders if the user has anything to configure. *My Compliance*
   was already its own card — page now reads Identity / Notifications /
   Compliance as the plan called for.
6. Sticky `Modal.Footer` (above). Migrated the **item-detail** modal
   (`src/pages/ItemsPage.jsx`) and the **ticket-detail** modal
   (`src/pages/hubs/MaintenancePage.jsx`) — their action rows
   (`Check Out / Print Label / Duplicate / Retire / Delete` and
   `Delete / Cancel / Save Changes` respectively) now pin to the bottom
   of the panel instead of scrolling off when the body grows long
   (item history, ticket comments).
7. Settings team-member row actions (`src/pages/SettingsPage.jsx`): on
   mobile the three buttons (Edit Access / Deactivate-Reactivate /
   Remove) collapse into a `⋮` button with a `role="menu"` popover —
   identical destructive-confirm wiring per Phase 2. Desktop still shows
   the inline button row.
8. Reservation filter pills (`src/pages/ReservationsPage.jsx:276`):
   bumped from `7px 16px` padding (~30px tall) to `minHeight:44, padding:
   10px 18px` to meet WCAG 2.1 SC 2.5.5 / Apple HIG mobile touch-target
   minimum.

**Files touched:**
`src/components/brand/tokens.js`, `src/hooks/useMobile.js`,
`src/components/primitives/Modal.jsx`, `src/App.jsx`,
`src/pages/Dashboard.jsx`, `src/pages/SettingsPage.jsx`,
`src/pages/ReservationsPage.jsx`, `src/pages/ItemsPage.jsx`,
`src/pages/hubs/MaintenancePage.jsx`.

**Acceptance:** `npm run build` clean. `npm run lint` 0 errors / 46
warnings (baseline + 1 new exhaustive-deps already present; no new
errors introduced). Dev server boots cleanly. Manual responsive
sweep (320 → 1920) deferred — items targeted the specific symptoms the
audit named rather than an exhaustive resize pass.

**Out of scope this phase / deferred:**
- New devices-viewport Playwright specs (`iPhone 13` / `iPad Pro 11`)
  per the plan's verification section — left for Phase 4's a11y pass to
  bundle with axe-core specs.

---

## 2026-05-25 — UI audit Phase 2: destructive-actions pattern

Phase 2 of `docs/UI-AUDIT-2026-05-24-PLAN.md`. Replaced every `window.confirm(...)`
call across the app (41 sites in 10 files) with two new primitives so destructive
verbs have a consistent, themed, focus-trapped surface — and the reversible ones
offer a 5-second Undo instead of a permanent action.

**New primitives:**
- `src/components/primitives/ConfirmDialog.jsx` — `useConfirm()` hook returns an
  imperative `confirm(opts)` (promise of true/false) plus a `<ConfirmHost />`
  JSX node. Supports title / message (string OR ReactNode) / cancel + confirm
  labels / danger styling / optional **type-to-confirm** gate (e.g. team-member
  name, item ID).
- `src/components/primitives/UndoToast.jsx` — fixed-position toast with a live
  countdown and `Undo` button; auto-dismisses after `durationMs` (default 5s).

**Undo wired on the reversible verbs:**
- People Access — Archive person (`updateAccessPerson(active:true)`)
- Settings — Deactivate team member (`updateUser(active:true)`)
- Settings — Archive space (`updateRoom(active:true)`)
- Items — Retire/dispose (restores status + clears dispose metadata)

**Type-to-confirm gates on the highest-blast-radius verbs:**
- Settings — Remove team member (must type the name)
- Items — Permanently delete (must type the item ID)
- Supplies — Permanently delete (must type the supply ID)

**Files touched:**
`src/components/primitives/{ConfirmDialog,UndoToast}.jsx` (new);
`src/pages/{SettingsPage,ItemsPage,SuppliesPage,ReservationsPage}.jsx`;
`src/pages/hubs/{PeopleAccessPage,MaintenancePage,TasksPage,JobsPage,CoordinationPage}.jsx`.
The bespoke confirm-archive / confirm-delete modals previously hand-rolled
inside PeopleAccessPage were also removed in favour of the new primitive.

**Acceptance (matches the plan):**
- `grep -rn "window.confirm" src/` returns zero call sites (the only matches
  are comments — `ConfirmDialog.jsx` header and the `waiverModal` audit-L9
  comment in JobsPage).
- Every destructive verb routes through `ConfirmDialog`.
- Reversible verbs surface `UndoToast` and restore prior state in <5s.

**Tests:** new `e2e/authenticated/destructive-actions.spec.js` exercises Cancel +
Confirm + Undo on People Access archive, and the type-to-confirm disable gate on
Settings → Remove team member. The spec runs against prod — it will only pass
after this commit deploys. `npm run build` clean. `npm run lint` 0 errors / 45
warnings (existing baseline). Deferred from the plan because they need new
features rather than confirm-replacement: SettingsPage *transfer church
ownership* and *delete church* (no data model / Cloud Function for either yet),
and MaintenancePage *close ticket without resolution* (no such surface today).

---

## 2026-05-25 — monitorScheduledJobs: self-healing no-heartbeat tolerance

`monitorScheduledJobs` fired a Sentry warning at 2026-05-25 06:00 UTC for
`scheduledJob:sendTaskDueReminders has never written a heartbeat`. False
positive: that job runs weekly (`0 8 * * 1` — Mondays at 8 AM Central /
13:00 UTC), and the heartbeat helper had been deployed yesterday at
2026-05-24 20:17 UTC. The job's next slot is today at 13:00 UTC — it
literally had not had a chance to fire yet.

The monitor's existing no-heartbeat branch had an aspirational comment
about tolerating brand-new deploys but the code fired immediately. Made
the code match the comment: on first observation of a missing doc, the
monitor now writes an `awaiting-first-run` placeholder with
`firstSeenMissing: serverTimestamp()`. The Sentry alert only fires once
that gap exceeds the cadence's stale window (26h daily, 8d weekly).
`withScheduledRun` uses `set({...}, { merge: false })` so the first real
run cleanly overwrites the placeholder. New scheduled jobs added to the
registry are now silently tolerated until they've had their full first
cadence window.

The four other registered jobs (`processTrialExpirations`, `closePastJobs`,
`sendJobReminders`, `generateRecurringTemplateTasks`) had already written
healthy heartbeats — only the weekly one tripped this.

---

## 2026-05-24 — UI audit remediation, Phase 1 (trust + critical a11y)

Companion: `docs/UI-AUDIT-2026-05-24-PLAN.md`, audit at
`docs/UI-AUDIT-2026-05-24.md`. Phase 1 closes the Critical-severity items
that affect legal trust, public findability, and screen-reader access. No
new patterns introduced — surgical fixes only.

- **Terms/Privacy modal dates synced and content unified** — the auth-screen
  Terms/Privacy modal had drifted to "March 14, 2026" while the
  standalone `/terms` and `/privacy` pages said "April 26, 2026". The
  modal body had also fallen behind the standalone pages (missing the
  SMS Communications section among others). Extracted shared
  `<TermsBody />` and `<PrivacyBody />` components in
  `src/components/legal/` and rendered them in both surfaces. Single
  source of truth — drift can't recur.
- **SEO on public surfaces** — `PublicJobsPage.jsx` and
  `PublicRequestPage.jsx` now render `<SEO>` so a shared link from the
  church into Slack/iMessage produces a real preview card, and search
  engines see church-specific titles and descriptions instead of the
  generic landing meta. Mirrors the pattern in
  `PublicSMSProgramPage.jsx`.
- **Chart screen-reader fallback** — new
  `src/components/primitives/DataTableDisclosure.jsx` renders a
  collapsed `<details>` block under a Recharts SVG; expanding exposes
  the same numbers in a real `<table>` with header semantics. Applied
  to all four `InsightsPage.jsx` charts (Utilization BarChart, Ministry
  PieChart, Seasonal AreaChart, Supply Burn BarChart). VoiceOver +
  similar tools now have something to read.
- **SMS phone-input a11y** — `SettingsPage.jsx` SMS phone field now
  emits `aria-invalid` + `aria-describedby` tied to a `role="alert"`
  error node when `phoneError` is truthy. Sighted users got the red
  border; screen-reader users got nothing. Now both do.
- **Reservation modal autofocus** — `ReservationsPage.jsx` "New
  Reservation" modal now `autoFocus`es the resource select (Equipment
  or Space) so keyboard users don't have to mouse into the first
  required field.
- Bulk "Select all" on `ItemsPage.jsx` was already labeled
  (`aria-label="Select all visible items"` at line 673) — no change
  needed.

Out of scope this phase: destructive-action confirms (Phase 2 — needs a
reusable pattern decision first), responsive/tablet breakpoint work
(Phase 3), color-only-status + emoji-icon sweeps (Phase 4),
upgrade-gate previews (Phase 6).

---

## 2026-05-24 — Jobs Hub error-handling hardening (pre-launch)

Jobs Hub is about to be the most-trafficked surface in ChurchOpsHub. The
existing audit had closed the Critical/High security work, but the
error-handling pass surfaced four launch-day silent-failure risks plus a
broader visibility gap in Sentry: every capture used a generic
`area:firestore-write` tag, expected rule-block codes drowned out real bugs,
and the only public unauthenticated surface (`PublicJobsPage`) swallowed
its errors with a misleading "your link is invalid" message. This change
closes all of it. See [docs/SENTRY-ALERTS.md](SENTRY-ALERTS.md) for the
alert rules to set up in the Sentry UI.

**T1 — silent-failure fixes**
- `PublicJobsPage.jsx`: `getPublicJobs` failures now `Sentry.captureException`
  with `area:public-board` + `fn:getPublicJobs` + `errorCode` tags and
  `{ churchId, churchCode }` extra. The user-facing copy distinguishes
  `functions/invalid-argument` (bad link) from a transient outage ("Could
  not load jobs right now. Please refresh…"). No more "link is invalid"
  for a 30-second Firestore blip.
- `JobsPage.jsx`: every fire-and-forget email callable
  (`sendJobAnnouncementEmails` / `sendJobCancelledEmails` /
  `sendJobPosterNotification` — 7 call sites) is routed through a new
  `invokeEmailCF(name, payload, { context, userMsgOnFail })` helper that
  awaits the callable, Sentry-captures with `area:jobs-hub-email` +
  `cf:<name>` + `errorCode` tags + `{ churchId, jobDocId, context }`
  extra, and shows a user toast on failure for admin-initiated actions
  (announcements, cancellations, notify-signups, pre-delete). Poster
  courtesy notifications stay fire-and-forget by design — Sentry still
  catches them, but a failed courtesy email shouldn't toast the user
  whose own action just succeeded.
- `useFirestore.js` `logActivity`: switched to a silent capture path via
  `handleErr(err, { op: 'logActivity', silent: true })`. Audit-log writes
  follow already-committed actions, so a failure now Sentry-captures for
  engineering visibility without setting global error state that would
  toast a confusing message over the user's successful operation.
- `jobSignUp` Cloud Function: every user-error return path now carries a
  structured `code` field (`job-not-found`, `job-not-open`,
  `compliance-missing`, `waiver-required`, `already-signed-up`,
  `already-waitlisted`, `waitlist-full`, `tx-no-result`). `performSignUp`
  switches on the code instead of regex-matching the message — the
  brittle `/compliance|background|certif|consent|access/i` check is gone.
  PostHog `jobs_signup_failed` / `jobs_signup_blocked_compliance` events
  now also carry the code.

**T2 — Sentry signal quality**
- `useFirestore.js` `handleErr` now takes an optional `ctx` =
  `{ op, hub, silent }`. Every Sentry capture is tagged with `area`,
  `op`, optional `hub`, and the underlying Firestore `errorCode`. The
  three Jobs Hub callable wrappers (`signUpForJob`, `withdrawFromJob`,
  `updateJobSignupAttendance`) pass `{ op: '…', hub: 'jobs' }` so the
  dashboard filters cleanly by hub.
- `main.jsx` `beforeSend`: filters `permission-denied`,
  `failed-precondition`, `unauthenticated`, and `not-found` from both
  Firebase callables (`functions/<code>`) and the Firestore client SDK
  (bare code). These are intentional rule-blocks — the system *working*,
  not breaking. Issue feed is now dominated by `internal`/`unknown` and
  unhandled exceptions, where real bugs live.
- `JobsPage.jsx`: `Sentry.addBreadcrumb({ category: 'jobs-hub', … })`
  on signup attempt/succeeded/waitlisted/blocked, withdraw attempt,
  admin-remove attempt, and swap-request submit. When an error fires
  later, the Sentry event carries the last few user actions inline —
  collapses "what was the user doing?" debugging.

**T3 — monitoring + alerts**
- `functions/index.js`: new `monitorScheduledJobs` hourly cron
  (`'0 * * * *'` America/Chicago) reads `scheduledJobRuns/{name}` for
  every known scheduled job (5 total — 4 daily, 1 weekly Mondays) and
  Sentry-captures any of: missing heartbeat, `status === 'failed'`,
  `status === 'running'` past its `maxRunMs` cap, or `finishedAt` older
  than the per-cadence staleness threshold (26h daily / 8d weekly).
  Tagged with `area:job-monitor` + `scheduledJob:<name>` +
  `reason:<no-heartbeat|stale|failed|hung>`.
- `docs/SENTRY-ALERTS.md`: new doc listing the 4 Sentry alert rules to
  configure in the console (first-occurrence on `area:public-board`,
  volume-spike on internal errors, first-occurrence on `area:job-monitor`,
  optional volume-spike on `area:jobs-hub-email`), plus useful saved
  searches and a "what does NOT page (by design)" section.

**Verification.** `npm run lint` 0 errors / 45 baseline warnings;
`npm run build` clean (4.00s, 0 jsxDEV, prod-bundle verifier ✓); functions
`node --check` clean. E2E 55/4/1 — single fail is the documented
`public-board.spec.js:52` 60s in-process-cache flake, unrelated to these
changes. Functions deploy ✓ (all 28 functions including the new
`monitorScheduledJobs`). Webhook IAM probes intact post-deploy.

---

## 2026-05-24 — firebase browser v10.8 → v12.13 + auth.setup hydration fix

Bumped `firebase` browser SDK to match the rest of the fleet (MH/CC/Echo
already on v12). Closes the residual undici browser highs that the 5-23
dependency audit left open. No source changes — package.json + lockfile
only; all `firebase/auth`, `firebase/firestore`, `firebase/storage`, and
`firebase/functions` APIs we use are stable across v10→v12. Lint clean,
build clean (0 jsxDEV, prod-bundle verifier ✓).

**Auth.setup E2E flake fix (same commit):** the first attempt after the
v12 deploy exposed a pre-existing race in the 3 auth setup scripts. The
landing page HTML is pre-rendered, so the `button "Sign In"` element
appears in the DOM before React hydrates and binds its `onClick`. The
old setup did `domcontentloaded` → click → `waitForSelector('email')` —
when hydration was slow enough, the click fired before binding, was
silently swallowed by the `.catch(() => {})`, and the 15s email-input
wait timed out. Member B (always [1/60] = first browser context) caught
the brunt; Members A and Admin ran in a warm context and almost never
hit it. The v12 bundle is marginally larger, pushing first-context
hydration past the timeout consistently rather than occasionally.

Fix: replace the single click + 15s wait with an 8-iteration loop that
clicks, checks for the email input, waits 500ms, repeats — up to ~4s
of pre-wait retries before the existing 15s `waitForSelector` kicks
in. When hydration is fast (Members A, Admin, retries) the loop exits
on iteration 1 with no extra cost. Applied to all 3 setups for
defense-in-depth in case run order changes. E2E baseline restored to
55/4/1 (the documented `public-board.spec.js:52` 60s in-process cache
race on `getPublicJobs`).

---

## 2026-05-24 — Jobs Hub Reports: lazy-fetch older jobs on 'all' scope

Closes the long-documented "known limitation" CLAUDE.md called out: the
all-time leaderboard on the Reports tab silently undercounted signups whose
parent job had fallen off the 500-most-recent `jobListings` window
(bounded by audit perf H-3, 2026-05-23). Today no church is anywhere near
500 historical jobs, so this is defensive future-proofing — but it
removes the silent-data-loss seam.

**Mechanics.** When the Reports tab opens, the existing on-demand fetch
already loads signups for every job in the live `jobListings` snapshot.
The new branch fires only when **both** `jobListings.length >= 500`
**and** `reportsScope === 'all'`: it queries the older
`churches/{churchId}/jobListings` docs (where `createdAt <` the oldest
visible) ordered desc, then fans out per-job signup `getDocs` for them,
and merges into a new `reportsExtraJobs` state. The `leaderboard`
`useMemo` builds `jobById` from `[...jobListings, ...reportsExtraJobs]`
so the enrichment + cutoff filter sees the full set. '30d'/'90d' scopes
skip the extras — they rarely fall outside the cap at plausible church
sizes, and the user's explicit "all time" intent is the only scope where
the silent undercount actually bit. Small UI hint under the scope picker
when extras are loaded: "Including N older jobs beyond the 500
most-recent in the live feed."

**No new index required.** Single-field `where('createdAt', '<', …)` +
`orderBy('createdAt', 'desc')` uses Firestore's auto single-field
indexes; no `firestore.indexes.json` change.

**Verification.** `npm run lint` 0 errors / 45 baseline warnings;
`npm run build` clean (3.90s, 0 jsxDEV, prod-bundle verifier ✓).
Pre-ship E2E 55/4/1 (the well-documented `public-board.spec.js:52` cache
flake, unchanged). The new branch is gated by `atCap === false` in every
prod church today, so the existing `attendance.spec.js:68` Reports
leaderboard coverage exercises the unchanged base path.

---

## 2026-05-24 — Tasks Hub bulk paste-import (Paste Tasks)

Closes the long-standing onboarding-friction blocker first surfaced 2026-05-01
when a new admin tried to migrate a ClickUp list and nothing reasonable
happened. New "Paste Tasks" button in the Tasks Hub header (next to "+ New
Task") opens a modal with a textarea + live preview. Two auto-detected modes:

- **Plain lines** — each non-empty line creates one task with that line as
  `name` (uses caller's `taskDefaults` for visibility/sharedWith).
- **TSV with header** — first line tab-separated and contains at least one
  recognized column. Supported columns (case-insensitive): `Name` /
  `Task` / `Title`, `Description` / `Desc` / `Notes`, `Priority`, `Status`,
  `Due Date` / `Due`, `Assignee` / `Owner`. Priority maps high/med/low +
  synonyms; Status maps backlog/todo/in-progress/done/etc.; dates accept
  `YYYY-MM-DD`, `M/D/YYYY`, `M/D/YY`, or anything `new Date()` parses;
  Assignee is resolved case-insensitively against `taskHubUsers` and
  produces the canonical `[{uid, name}]` shape (the
  `reference_modal_focus_pattern`-adjacent shape gotcha from the abortive
  2026-05-06 ClickUp import — flat-string `sharedWith` entries silently
  fail the `visibleTasks` filter). Unknown priority/status/assignee/date
  values surface as inline `⚠` warnings on the preview row, not hard errors.

Submission is **sequential**, not `Promise.allSettled` parallel: `addTask`
runs a `runTransaction` against `config/main.maxTaskNumber`, and racing all
N transactions causes Firestore contention retries that slow the bulk write
down more than serial execution. Per-row progress bar in the footer.
Per-import cap of 200 (above that, the preview shows "Showing first 200 of
N" and only the first 200 submit). Each created task goes through the
normal `addTask` → TSK-### numbering + `activityLog` write path; no new
backend or rules surface.

Implementation: one file (`src/pages/hubs/TasksPage.jsx`), ~210 LOC added.
Module-level `PASTE_TSV_HEADER_KEYS` / `PASTE_PRIORITY_MAP` /
`PASTE_STATUS_MAP` lookup tables + `parsePasteDate` / `parsePasteText`
pure helpers; new `PastePanel` module-level component (memoized parse
derivation via `useMemo` over `pasteText` + `taskHubUsers`); new
`openPaste` / `handlePasteSubmit` handlers; 4 new state cells
(`showPaste`, `pasteText`, `pasteSaving`, `pasteProgress`). No new
imports. TasksPage chunk +~4 KB gzip.

Verification: `npm run lint` 0 errors / 45 baseline warnings;
`npm run build` clean (3.89s, 0 jsxDEV, prod-bundle verifier ✓).

---

## 2026-05-24 — `processTrialExpirations` missing collection-group index (silent since day 1)

Sentry surfaced `FAILED_PRECONDITION: The query requires a
COLLECTION_GROUP_ASC index for collection config and field status` on the
2am Central run. Root cause was the same well-documented pitfall in
CLAUDE.md and [[feedback_firebase_collection_index]] — `firebase deploy`
silently skips `COLLECTION_GROUP_ASC` field overrides. The query at
`functions/index.js:863` (`db.collectionGroup('config').where('status',
'==', 'trialing')`) has been failing every single night since the
trial-expiry feature shipped in `8a95a8f`; it was previously invisible
because the function ran outside any error-capturing wrapper. Yesterday's
audit-followup commit (`3caa446`) wrapped it in `withScheduledRun`, which
both writes a heartbeat doc AND lets Sentry capture exceptions — so the
chronic failure surfaced on its first post-wrap run.

**Fix:** field override created via the Firestore Admin REST API
(`PATCH /v1/.../collectionGroups/config/fields/status` with both
`COLLECTION` + `COLLECTION_GROUP` `ASCENDING` scopes). The PATCH is a
full-replace, so the auto-default `COLLECTION_DESC` + `CONTAINS`
exemptions were dropped; verified nothing in `src/` or `functions/` uses
`orderBy('status', ...)` or array-contains on `status`. Override mirrored
into `firestore.indexes.json` for intent (the deploy CLI still won't act
on it — same gotcha — but the file documents what's actually deployed).

**Blast radius:** none. The 2 churches currently in `trialing` status
both have `trialEndsAt` 60+ days out, so neither was waiting on the
function. Verified post-fix: manual trigger via `gcloud scheduler jobs
run firebase-schedule-processTrialExpirations-us-central1` →
heartbeat doc `scheduledJobRuns/processTrialExpirations` flipped to
`{ status: 'completed', lastError: null, durationMs: 1600 }`. The chronic
silent failure is now closed, and `withScheduledRun` will catch any
future regression on the next 2am run.

---

## 2026-05-23 — Jobs Hub perf H-3 + H-4: bounded the last two unbounded reads

The Jobs Hub backlog's last code-actionable Highs from the 2026-05-23 perf
audit. Both diffs are one-spot caps; no behavior change at realistic scale.

**H-3 — `jobListings` live subscription bounded.** `src/useFirestore.js:182`
wrapped the collection ref in
`query(..., orderBy('createdAt', 'desc'), limit(500))`, dropping the
redundant client-side sort. Mirrors the `activityLog` bound at line 89.
Single-field `createdAt` index is automatic — no `firestore.indexes.json`
change. The bound caps a real-time subscription every signed-in user
opens on app mount; previously reads scaled linearly with church age.

**Known limitation (documented, not fixed here):** the Reports tab's
`reportsScope === 'all'` admin view joins `reportsSignups` against the
bounded `jobListings` via `jobById[s.jobId]`. A church past 500 historical
jobs would see its all-time leaderboard silently undercount signups whose
parent job fell off the window — same silent-drop behavior already present
for deleted jobs. Real fix (lazy one-shot fetch of older jobs on
`'all'`/`'90d'` scope select) is queued as a follow-up; pragmatically no
church on the platform is anywhere near 500 historical job listings yet.

**H-4 — `sendJobReminders` collectionGroup capped.** `functions/index.js:1492`
chained `.limit(5000)` onto the cross-tenant `collectionGroup('jobListings')`
query that fires at 8am Central daily. Matches the sibling
`sendTaskDueReminders` pattern at line 1305 exactly. Existing dual
idempotency stamps (`lastReminderSentDate`, `lastSmsReminderSentDate`)
already protect against re-runs hitting the same docs; `withScheduledRun`
heartbeat at `scheduledJobRuns/sendJobReminders` surfaces incomplete runs
via `durationMs`/`lastError`. Per-job signups `.get()` at line 1548 left
alone — that's a small per-doc cost (~5-20 rows typical), not the
unbounded leg the audit flagged.

Verification: pre-deploy E2E run + post-deploy `firebase deploy --only
functions:sendJobReminders` + webhook IAM curl sanity (see
[[feedback_gen2_invoker_strip]]).

---

## 2026-05-23 — `firebase-admin` v12 → v13 + npm overrides finally close the 4 highs

Bumped `firebase-admin` from `^12.0.0` to `^13.0.0` in
`functions/package.json` — already permitted by `firebase-functions@7`
peer dep (`^11.10.0 || ^12.0.0 || ^13.0.0`). Scripts/ devDep was
already on `^13.9.0` at the repo root, so this only changed what the
deployed Cloud Functions run.

**v13.0.0 breaking-change scan** (per the GitHub release notes), none
affect COH: Remote Config evaluation-hash change (we don't use RC),
deprecated FCM API removal (no FCM — the lone `messaging` hit in
`functions/index.js` is Twilio's `messagingServiceSid`), Node 16 →
Node 18 minimum (already on Node 22), and an internal credentials
refactor to `google-auth-library` (transparent for our
`admin.credential.cert(serviceAccountObject)` and default-ADC paths).

**Second audit-prediction miss recorded.** After the bump, `npm audit
--omit=dev` still showed the same 4 highs the v4→v7 bump didn't close
either. `npm ls` traced each one and confirmed they sit deep in
third-party transitive deps that no package-major release in the COH
tree currently fixes:
- `axios` → `@sendgrid/mail` 8.1.6 + `twilio` 6.0.0 (both pin axios
  `^1.x` and pull <1.15.1)
- `fast-xml-parser` + `fast-xml-builder` → `firebase-admin@13.10.0` →
  `@google-cloud/storage@7.19.0` (the latest admin still ships the
  vulnerable parser)
- `path-to-regexp` → `firebase-functions@7.2.5` → `express@4.22.1`
  (express 4 is pinned to the 0.1.x line of `path-to-regexp`; the
  unpatched-by-default 0.1.12 needs forcing to 0.1.13)

**The real fix was npm overrides** — same mechanism already used for
`protobufjs`. Added 3 forced bumps to `functions/package.json`:

```json
"overrides": {
  "protobufjs":      "^7.5.8",
  "axios":           "^1.16.0",
  "fast-xml-parser": "^5.5.6",
  "path-to-regexp":  "0.1.13"
}
```

`path-to-regexp` is intentionally pinned to the patch (`0.1.13`, not
`^0.1.13` or anything broader): the 0.2/1/2/.../8 majors all changed
the route-pattern API and would break express 4 at startup. Keep the
pin in the 0.1.x line.

Result: vulnerabilities dropped 17 → 14 (1L/12M/**4H** → 1L/13M/**0H**).
**All 4 highs that originally motivated this work are finally closed**;
the 13 remaining moderates are all `qs` / `uuid` / `retry-request`
chain — separately tracked, not blocking.

Verification: module-load smoke clean; pre-deploy E2E 55/1/4 (same
pre-existing `public-board.spec.js:52` cache flake); post-deploy
all-27-functions deploy clean; webhook IAM probes confirmed intact
(`stripeWebhook` 400, `sendgridEventWebhook` 401, `twilioInbound` 403
disambiguated via Cloud Logging — `invalid signature` warn at
`01:00:40` matched the probe trace, IAM intact); post-deploy E2E
54/2/4 — same `public-board.spec.js:52` failure plus a new
**unrelated** failure on `e2e/authenticated/sanity.spec.js:19` whose
`/^JOB-\d{3}$/` regex finally tripped when this church's job counter
crossed JOB-1000 (now at JOB-1025). Fixed inline to `/^JOB-\d{3,}$/`.

**Lesson recorded twice now:** when an audit attributes a vuln to a
package, run `npm ls <vulnerable-pkg>` first to find the true root in
the dep tree. The 2026-05-23 follow-up audit conflated "vulns in the
functions install tree" with "vulns caused by firebase-functions
itself"; the same mistake was repeated for firebase-admin. See
`reference_firebase_functions_vuln_attribution` memory.

---

## 2026-05-23 — `firebase-functions` v4 → v7

Retires the EOL v4 major in `functions/package.json`. The 2026-05-23
follow-up audit estimated "~3–5 hours" for this migration, but
exploration showed `functions/index.js` is **already 100% v2-style**
(every import is from `firebase-functions/v2/*` or
`firebase-functions/params`; zero `functions.config()`; zero v1 trigger
syntax), so the change reduced to a single-line dependency bump plus
`package-lock.json` regeneration.

Breaking-change scan from v5/v6/v7 release notes — none hit COH:
v6's default-entrypoint switch (we import from v2 subpaths, not the
bare package), v7's Node-16 drop (firebase.json already pins
`nodejs22`), v7's `functions.config()` removal (unused), v7's
TS5/ES2022 build (we're JS), v7's v1 `Event` → `LegacyEvent` rename
(unused). v7's "unhandled async errors in `onRequest` return 500
immediately in the **Emulator**" is the only behavior change to know
about for future local dev.

**Audit-prediction correction (worth recording):** the 2026-05-23
follow-up audit attributed 4 high transitive vulns to
`firebase-functions` v4. After the bump, `npm audit --omit=dev` still
reports 17 vulnerabilities (1 low / 12 moderate / 4 high). The
remaining highs — `axios`, `fast-xml-builder`, `fast-xml-parser`,
`path-to-regexp` — actually transit through `firebase-admin@^12.0.0`,
not `firebase-functions`. Closing them needs the still-deferred
`firebase-admin` v12 → v13 bump (already permitted by v7's peer dep:
`firebase-admin: ^11.10.0 || ^12.0.0 || ^13.0.0`).

Verification before deploy: module-load smoke (`node -e
"require('./index.js')"`) clean; pre-deploy E2E 55/1/4 (single failure
on `public-board.spec.js:52` is pre-existing — the second test in §9
Public job board races the 60s in-process cache on `getPublicJobs`
added by audit perf M-1 and reads the first test's seeded job; not
caused by the bump). After `firebase deploy --only functions` (all 27
updated), webhook IAM probes per the `feedback_gen2_invoker_strip`
gotcha: `stripeWebhook` 400 (missing signature header — function
reached), `sendgridEventWebhook` 401 (unauthorized — function reached),
`twilioInbound` 403 disambiguated via Cloud Logging — `twilioInbound:
invalid signature` warn entry present on the probe's trace ID → IAM
intact, no re-grant needed. Post-deploy E2E 55/1/4 — same single
failure, no regression. Commit `7e853e6`.

Out of scope (still deferred from the 2026-05-23 follow-up audit):
`firebase` browser v10 → v12 + `stripe` v14 → v22 (closes browser
`undici` highs), `firebase-admin` v12 → v13 (closes the 4 functions
highs above), `jobListings` upcoming-only listener + lazy
`collectionGroup` queries (perf H-3/H-4), Cloud Monitoring alerts
(Console-only), minors compliance audit.

---

## 2026-05-23 — Three-audit follow-up: protobufjs CVE + perf + observability

Ran three parallel audits the 2026-05-22 pre-launch pass had skipped:
**performance/cost**, **dependency/supply-chain**, **observability**. Combined
tally: 2 Critical · 19 High · 62 Medium · 10 Low. Shipped the highest-leverage
six findings as one branch (`audit-followup-2026-05-23`, commit `3caa446`).

**Critical fixes:**
- `protobufjs` arbitrary-code-execution advisory (GHSA-xq3m-2v4x-88gg) closed
  via `npm overrides protobufjs: ^7.5.8` in `functions/package.json`. The
  audit suggested bumping `firebase-admin` v12 → v13 — but `firebase-functions`
  v4 peer-pins admin at `^12`, AND admin@13 still pulls `protobufjs@7.5.4`
  (also in the vulnerable `<=7.5.7` range). The override is smaller, peer-dep
  compatible, and gets the job done. `npm audit` functions tree: 0 critical
  (was 1); 17 remaining vulns deferred to the firebase-functions v4 → v7
  migration.
- Anonymous `PublicJobsPage` bundle: split off the main app at `main.jsx`.
  New `src/firebasePublic.js` calls `initializeApp` with `firebase/app` only
  (no Auth/Firestore/Storage). `main.jsx` detects `?jobs=` in the URL and
  dynamically imports the minimal pair (`firebasePublic` + `PublicJobsPage`).
  Otherwise it dynamically imports `App.jsx` as before. Vite `manualChunks`
  split into `vendor-firebase-min` (app + functions) and
  `vendor-firebase-full` (auth + firestore + storage). `App.jsx` lost its
  `PublicJobsPage` static import + `publicJobs` branch — that path now lives
  in `main.jsx` so anonymous teen traffic never imports the authenticated
  app. Bundle size for `?jobs=` URL drops from ~2 MB to ~480 KB raw
  (~135 KB gzip), ~75% smaller.

**Observability:**
- `withScheduledRun(name, fn)` wrapper writes `scheduledJobRuns/{name}` per
  invocation with `{ status, startedAt, finishedAt, durationMs, lastError }`.
  Wraps the 5 scheduled jobs: `processTrialExpirations`, `sendTaskDueReminders`,
  `closePastJobs`, `sendJobReminders`, `generateRecurringTemplateTasks`. A
  cron that fails to fire is now distinguishable from a no-op (empty) run.
  Heartbeat write failures are Sentry-captured but never block the actual job.
- PostHog funnel events on the Jobs flow: `jobs_board_viewed` (auth + public
  surfaces), `jobs_signup_attempted`, `jobs_signup_succeeded`,
  `jobs_signup_waitlisted`, `jobs_signup_failed`, `jobs_signup_blocked_compliance`
  (heuristic on error message), `jobs_attended_marked`. PostHog was
  initialized but never `.capture()`'d before — the Jobs funnel was blind.
- `isEmailSuppressed` Firestore-read failure now `Sentry.captureException`s
  with an `extra: { email }` tag. Behavior stays fail-open (closing would
  block all transactional email during any Firestore degradation — worse
  failure mode than the rare bypass of an already-bounced address), but we
  know when it happens now.

**Performance:**
- `getPublicJobs` callable gets a per-instance 60-second in-process cache
  keyed on `churchId`. Callable protocol doesn't expose `Cache-Control`, so
  warm-instance memoization is the next-best lever. Bursty share-link
  previews, bot refreshes, and rapid teen reloads now hit memory. Cache
  set on both the populated path and the two empty-list early returns.

**Auth flow:** `?signin=1` query param opens `AuthScreen` in login mode (the
public-jobs minimal tree's Sign In button uses this so it lands directly on
login instead of bouncing through register-mode).

**Deploy:** `firebase deploy --only functions` updated all 27 functions
(2026-05-23 22:25 UTC). Webhook probes — stripeWebhook 400, sendgridEventWebhook
401, getPublicJobs 400 — all 4xx-from-function (IAM intact). twilioInbound
returned 403 "Forbidden" (9-byte body), which I initially misread as the
Gen-2 invoker strip; the body is *also* what the function emits on Twilio
signature mismatch (`functions/index.js:2350`). The 9-byte-body heuristic
from the existing gotcha note is ambiguous — Cloud Logging is the real
disambiguator. Frontend push triggered Vercel auto-deploy, new bundle hash
`index-iTHbIMRw.js` serving by 22:35 UTC.

**Deferred from the audits (queued as separate sessions):**
- `firebase-functions` v4 → v7 migration (closes 4 high transitive vulns;
  EOL major; ~3–5 hours).
- `firebase` browser v10 → v12 + `stripe` v14 → v22 (closes `undici` highs;
  ~2 hours).
- Bound `jobListings` to upcoming-only + lazy-subscribe the two
  `collectionGroup` listeners on JobsPage (audit perf H-3 + H-4).
- Cloud Monitoring alert wiring (gcloud requires interactive alpha/beta
  install; do via Console: severity≥ERROR on the 5 scheduled jobs + 3
  webhooks → email `jcvaught@gmail.com`).
- Legal/compliance audit for minors (COPPA, child-labor, waiver
  enforceability).

E2E: 56 passed / 4 skipped / 0 failed pre-deploy baseline.

---

## 2026-05-22 — Blog post: Tithely vs. Pushpay vs. ChurchOpsHub

New post `tithely-vs-pushpay-vs-churchopshub` (`src/data/blogPosts.js`) — brand-bound comparison positioning COH as complementary to giving platforms rather than competitive (Tithely/Pushpay = giving + ChMS; COH = operations). Stack recommendations by church size, overlap-avoidance guidance, internal link to the spreadsheet-cost post. Sitemap manually updated with the new URL (`public/sitemap.xml`). Prerender clean, 21 post pages emitted. Commit `f847126`.

## 2026-05-22 — stripeWebhook quiets scanner-probe Sentry noise

After the audit L2 fix made `stripeWebhook` `invoker:'public'` (correctly,
for Stripe), scanners hitting the Cloud Run URL with no body started
tripping `stripe.webhooks.constructEvent` → `No stripe-signature header
value was provided.` → Sentry alert (REACT-S today, 20:19 UTC, `curl 8.7.1`
on Ubuntu).

`stripeWebhook` now short-circuits when the `stripe-signature` header is
missing entirely: warn-level log (with UA + IP), 400 response, no Sentry
capture. Mirrors the `twilioInbound` pattern. A *signed* request that
fails verification still hits the existing catch + Sentry — that's the
case that matters.

Probed post-deploy: 400 "Missing stripe-signature header" on no-sig POST;
400 "Invalid webhook signature" on junk-sig POST; both 400 (not 403) so
`allUsers/roles/run.invoker` is intact.

---

## 2026-05-22 — Jobs Hub audit verification (Part 2) — UAT automation, 11 more tests

Most of `JOBS-HUB-AUDIT-VERIFICATION-PLAN.md` Part 2 turned out to be
automatable; pulled them off the human-checklist into Playwright.

**`e2e/authenticated/uat-ui.spec.js` (8 new tests)** —
- M13 — job detail formats `scheduledTime: '14:30'` as `2:30 PM`.
- M13 — Schedule status badge carries `title="Open — accepting signups"` and
  `aria-label="Status: Open — accepting signups"`.
- M10 — Post Job modal shows the public-PII warning text.
- M10 — `Share Board` click fires `window.confirm` with the multi-line
  public-warning text; dismissing it does NOT copy.
- L9 — Waiver Modal: `Agree & Sign Up` is disabled until "I have read and
  agree" is checked; Cancel = no signup.
- M8 — `B.textLight` resolves to `rgb(107, 114, 128)` (`#6B7280`) — WCAG AA.
- L8 — Recurring 🔁 chip exposes `aria-label="Recurring series"`.
- L9 — Owner Email tab (gated to `jcvaught@gmail.com` / `jvaught@fxcc.org`)
  loads the suppressions panel for the Member A fixture.

**`e2e/authenticated/uat-sms.spec.js` (3 new tests, gated `E2E_RUN_UAT_SMS=1`)** —
Signs Twilio webhook calls with `TWILIO_AUTH_TOKEN` from `functions/.env`
(HMAC-SHA1(URL + sorted-key concat), base64) and POSTs to the live
`twilioInbound` Cloud Function. Each test seeds + cleans up a synthetic
user doc in the unallocated `+1 555 555 01xx` NANP test range.
- M6 — STOP on a phone with prior consent flips `smsRemindersEnabled` to
  false.
- M6 — START on the same phone re-opts back to true.
- M6 — **critical safety**: START on a phone with NO `smsConsentAt` does
  NOT enable reminders and does NOT backfill consent (the
  recycled/family-shared-number protection).

`e2e/sms-helpers.js` (new) parses `functions/.env` for the auth token and
implements the Twilio signing algorithm + a thin `fetch` wrapper.

**Result:** standard suite **56 passed / 4 skipped / 0 failed** (~2.2 min).
UAT SMS gated run **3 passed** (~11s). Audit verification effectively closed
beyond the items that intrinsically need a real device or a wait for a
scheduled CF run (L7 PWA install, L8 actual screen-reader speech, M12 / L1 /
L3 next-run log spot-checks, eyeballs-on aesthetic judgment).

---

## 2026-05-22 — Jobs Hub audit verification (Part 1) — 8 E2E tests added

Closed the test-coverage gap on the 19 audit fixes shipped earlier today. Plan:
`docs/JOBS-HUB-AUDIT-VERIFICATION-PLAN.md` Part 1 (Part 2 is a separate manual
UAT checklist for the user on real devices). All 8 added tests passed first
run; suite is **48 passed / 1 skipped / 0 failed (~2.4 min)**.

**New harness — `e2e/client-helpers.js`.** A Node-side Firebase **client** SDK
(named app `e2e-client`), separate from the Admin SDK in `admin-helpers.js`.
Firestore rules are enforced for the client SDK regardless of whether it runs
in a browser or Node, so the rule-rejection tests are pure Node — no
Playwright browser, no app-side hook. Provides `signInAsClient(role)` /
`signOutClient()`, the client `db`, the firestore primitives the specs use,
`callGetPublicJobs(churchId)`, and `expectRejected(promise)`.

**`e2e/authenticated/audit-rules.spec.js` (new) — T1–T4.**
- T1 (M7) — admin updating `jobAnnouncements.createdBy`/`createdByName` is
  rejected with `permission-denied`; control body-only edit succeeds.
- T2 (L6) — unauthenticated `publicRequests.create` rejected for an
  extra/disallowed key, `itemDescription > 2000` chars, or missing `name`;
  control (10-key valid submission) succeeds and is admin-deleted in
  `afterAll` (not covered by `purgeE2EArtifacts`).
- T3 (L4) — member-A creating a `jobSwapRequests` doc with a spoofed name,
  `note > 1000` chars, or an extra key is rejected.
- T4 (M10) — `getPublicJobs` truncates `description` to 280 + `…` (length
  ≤ 281) and `location` to 160 + `…` (length ≤ 161).

**`e2e/authenticated/audit-ui.spec.js` (new) — T5–T8.**
- T5 (M13) — a job card with `requiredAccessTypes: ['background_check']`
  shows the `Background Check required` badge.
- T6 (M13) — the Schedule row's status badge reads `Open` (capitalized) —
  guards `JobStatusBadge` reuse in `DesktopScheduleRow`.
- T7 (M9) — opening a recurring job's detail modal shows a `Danger zone`
  label with the `Delete`, `Delete This + Future`, `Delete Series` buttons
  grouped separately from `Edit`.
- T8 (L9) — the Post Job modal's `Recurring series 🔁` section previews the
  count (`This will create N jobs.`) **and** real dates (a month
  abbreviation is present in the preview text).

**Lint:** 0 errors, 45 warnings (the documented exhaustive-deps baseline).

**Followup — not in this commit:** Part 2 manual UAT (M8 contrast, M9 touch
targets on phone, M13 clarity walk-through, L7 PWA icon, L8 screen-reader
labels, L9 waiver Modal, M10 PII warnings, **M6 SMS STOP/START** incl. the
never-opted-in case, M2 dedup, the M12/L1/L3 background-job log spot-checks).
Handed back to the user to tick off on real devices.

---

## 2026-05-22 — Jobs Hub audit backlog cleared (10 Medium + 9 Low + decision D1)

With the audit's High tier already shipped, this pass closed the remaining
triage backlog from `docs/JOBS-HUB-AUDIT-2026-05-22.md`. Shipped across three
deploy surfaces; the E2E suite (40 passed / 1 skipped) gated each one.

**Product decision D1 — accepted, no code.** The `manager` role keeps full Jobs
Hub access identical to `admin` (volunteer leaderboard + signup rosters). This
is intended — managers help run jobs. UI↔rules are already consistent.

**`firestore.rules`** — M5: explicit deny rule for the (unused) `errors`
collection so a future need is a deliberate change, not a default. M7:
`jobAnnouncements` update now blocks edits to `createdBy`/`createdByName`/
`createdAt` (mirrors the hardened `jobListings` rule). L6: `publicRequests`
create bounded by an exact key allowlist + length caps (was `if true`). L4:
`jobSwapRequests` create pins `uid` and `name` (to the caller's own user-doc
name, via the already-budgeted `userData()` get), caps `note` at 1000 chars,
and allowlists keys. `lastSmsReminderSentDate` added to the `jobListings`
update denylist.

**Cloud Functions** — M2: `sendJobReminders` email and SMS are now idempotent
on separate stamps (`lastReminderSentDate` / `lastSmsReminderSentDate`) so a
crash mid-channel can neither drop nor double-send the other. M6: `twilioInbound`
START re-opt-in now only revives accounts carrying an `smsConsentAt` consent
record (STOP still suppresses all phone matches — over-suppression is the safe
direction); prevents a recycled/family number re-opting-in a non-consenter. A
one-time backfill (`scripts/backfill-sms-consent.cjs`) stamped `smsConsentAt`
on the 4 already-opted-in users. M10: `getPublicJobs` caps `title`/`description`/
`location` length on the public payload; the Job modal and Share Board now warn
that those fields are public. M12: `sendTaskDueReminders` collection-group scan
gained a 90-day `dueDate` floor + `.limit(5000)`. L1: `closePastJobs`
subscription-agnostic behaviour documented as intentional. L2: explicit
`invoker:'public'` on `twilioInbound` and `stripeWebhook` (pins the `allUsers`
IAM against Gen-2 redeploy stripping). L3: `sendJobCancelledEmails` no longer
swallows its stamp-write error. L5: `promoteFromWaitlist` callable gated on
admin/manager role. New owner-only callable `setEmailSuppressionActive` backs
the L9 email-suppression UI. Webhooks curl-probed post-deploy — IAM intact.

**Frontend + static** — M8: `textLight` token darkened `#8B93A1`→`#6B7280`
(WCAG-AA). M9: the job-detail admin action row splits destructive buttons
(Delete / Delete This+Future / Delete Series) into a divided "Danger zone" row
so they can't be mis-tapped next to Edit. M11: `robots.txt` disallows `/?jobs=`.
M13: detail-modal time formatted, roster-fetch failure shows a distinct error
(was indistinguishable from an empty roster), `JobStatusBadge` carries a
status-meaning title/aria-label and is reused in the schedule rows (no more raw
lowercase pills), `requiredAccessTypes` shown as a 🔒 badge on the job card.
L7: PWA icons regenerated full-bleed (valid maskable safe-zone). L8: icon-only
🔁 chip + export/print buttons given `aria-label`s. L9: waiver consent is now a
real Modal + checkbox (not `window.confirm`), recurring-series setup previews
the actual dates, the `<tr role="button">` schedule row replaced with proper
row semantics + an in-cell `<button>`, and an owner-only Email-suppression
management tab (list + re-subscribe) added to Settings.

Build clean (0 jsxDEV), lint 0 errors (45 baseline warnings).

## 2026-05-22 — Jobs Hub roster refactor: production cutover (audit H1/H2/H3/H4/M1)

Shipped the `jobs-hub-roster-refactor` branch to production. The Jobs Hub roster (signups/waitlist) moved off the member-readable parent-doc arrays into protected per-uid subcollections (`jobListings/{id}/signups/{uid}`, `…/waitlist/{uid}`), with server-maintained `signupCount` / `waitlistCount` integers on the parent. All roster writes now route through compliance-enforcing Cloud Functions — new callables `jobSignUp` / `jobWithdraw` / `jobSetAttendance` (Admin SDK; enforce compliance + waiver + capacity server-side, promote the waitlist inline). Closes audit findings H1 (roster readable by any member via raw SDK), H2 (UI-only compliance), H3/M1 (hub-access gating in rules), H4 (`getPublicJobs` hardening).

Cutover ran the documented staged plan: merge → deploy functions/rules/indexes → migration phase 1 → frontend deploy → E2E gate → migration phase 2. Migration was a no-op both phases — **0 `jobListings` docs exist** (Jobs Hub is pre-launch). Final E2E: **40 passed, 1 skipped, 0 failed.**

Four issues the E2E cutover gate caught and fixed:
- **Collection-group indexes silently skipped.** `firebase deploy --only firestore:indexes` no-ops the `signups.uid` / `waitlist.uid` field-override CG indexes (known CLI gotcha — see `feedback_firebase_collection_index`). The frontend's "am I signed up" `collectionGroup` subscription failed without them. Created directly via the Firestore Admin REST API: `PATCH https://firestore.googleapis.com/v1/projects/church-inventory-9615c/databases/(default)/collectionGroups/{signups|waitlist}/fields/uid?updateMask=indexConfig` with a `COLLECTION_GROUP` index in the body. `gcloud firestore indexes fields update` cannot do this — its `--index` flag has no query-scope key.
- **`jobsRosterVisibility` broke for regular members.** The new subcollection rules were admin/manager-only, silently disabling the `'signups'`/`'all'` member-visible modes the frontend still offered. Fixed in `firestore.rules`: new `canSeeJobRoster(churchId, jobId)` helper enforces the setting per-member — a member reads a job's roster when visibility is `'all'`, or `'signups'` and they have their own `signups/{uid}` doc. The setting is now a real rule-enforced boundary (the old gate was UI-only — that was H1 itself).
- **Roster-fetch effect dependency + crash.** `JobsPage` detail-roster `useEffect` gated on `canSeeRoster()` without it in deps (a late `mySignups` subscription never re-triggered the fetch in `'signups'` mode). Adding `rosterAllowed` to deps exposed that `canSeeRoster(liveDetail)` runs every render and `canSeeRoster(null)` → `isSignedUp(null)` → `null._docId` threw, crashing the whole hub into `ChunkErrorBoundary`. Both fixed: `rosterAllowed` guards on `liveDetail`; `isSignedUp`/`isOnWaitlist` hardened against a null job.
- **Compliance E2E assertions** updated — compliance is now enforced server-side in `jobSignUp` with one unified error (*"This job requires a valid `<type>` on file. Ask an admin to add yours under People Access."*); the 3 block-tests asserted stale client-side wording.

All 11 Jobs Hub E2E specs migrated to roster-subcollection seeding/assertion helpers (`seedSignup` / `seedWaitlistEntry` / `getJobSignups` / `getJobWaitlist` in `admin-helpers.js`).

## 2026-05-22 — SMS outbound switched to the A2P Messaging Service

The A2P 10DLC campaign `CYO5934` (on Messaging Service `MGb4f2156d4ab3104ee564f15cb701d81d`) is **VERIFIED** — brand approved, sending number `+15715407100` attached to the service, `errors: []`. With the campaign live, an audit of the Jobs Hub texting path found the one remaining gap: `sendJobReminders` still sent outbound SMS via the bare `from` number (`messages.create({ from: TWILIO_FROM, … })`), which is not the A2P-compliant route — A2P traffic must go through the registered Messaging Service or it risks carrier filtering / error 30034.

Fix:
- Added `TWILIO_MESSAGING_SERVICE_SID=MGb4f2156d4ab3104ee564f15cb701d81d` to `functions/.env`.
- New module constant `TWILIO_MSID`; `sendJobReminders` now builds a `sender` of `{ messagingServiceSid }` when `TWILIO_MSID` is set, falling back to `{ from: TWILIO_FROM }` only if unset. The send guard widened to `tw && (TWILIO_MSID || TWILIO_FROM)`.
- Refreshed the stale `twilioInbound` header comment (the number is no longer "not attached to a Messaging Service" — it is, and outbound routes through it; the HELP/INFO branch stays as a harmless backstop).

`node -c` clean. Deployed `functions:sendJobReminders` to `church-inventory-9615c` (scheduled function — no `allUsers` invoker concern). The rest of the texting path was audited and confirmed sound: opt-in UI gated on email verification with E.164 normalization, consent stored as `users/{uid}.phone` + `smsRemindersEnabled`, the cron's per-user consent/active/hub-access guards, and `twilioInbound`'s STOP/START/HELP handling (probed live — reachable, IAM intact, signature validation working).

**Live delivery VERIFIED 2026-05-22.** SMS test user set up: `e2e-member-b@churchopshub.com` now carries `phone: +14122665015` + `smsRemindersEnabled: true` (`allowedHubs: ['jobs']`, active — fully eligible for `sendJobReminders`). A test message sent through the registered Messaging Service (`MGb4f2156d…`, SID `SMb68e0bd1…`) went `accepted → delivered` with no error code, and was confirmed received on the physical handset. `sms.spec.js` default `E2E_SMS_TARGET_EMAIL` repointed from `jvaught@fxcc.org` to `e2e-member-b@churchopshub.com` so the gated smoke test is self-contained on a designated test account. The Jobs Hub texting feature is fully verified end-to-end.

---

## 2026-05-21 — Supplies Hub: location filter + alphabetical sort

User feedback (Haleigh Watson) for the Supplies side: sort alphabetically and filter by location. `SuppliesPage.jsx` search card now has a location `<select>` (All locations + church locations from settings) and a sort `<select>` (Default / Name A–Z / Name Z–A). Both persist to `localStorage` (`sup_locationFilter`, `sup_sortBy`), mirroring the Items page filter-persistence pattern. Filter applied in the `filtered` `useMemo`; sort runs in-place on the filtered array via `localeCompare`.

---

## 2026-05-19 — A2P campaign resubmitted: public CTA screenshot + 4-field Console fix

Campaign `CM57da3c4d828884b7d8a66f30ac1955b7` resolved from 5/14 IN_PROGRESS limbo to terminal **FAILED** with **two** errors: **30921** (USE_CASE_DESCRIPTION — *"website requires authentication and cannot be reviewed"*) + **30909** (MESSAGE_FLOW — CTA can't be verified). Root cause: the registered Campaign description + message_flow led with *"authenticated web application"* and a *"TEST CREDENTIALS … OPT-IN STEPS after signing in"* block, the public `/sms-program` page only described the opt-in in prose (no visual), and Privacy/Terms URL fields on the campaign were **empty** (gray placeholder). Triple-gated in-app form (login → email-verified → Jobs Hub access) means a reviewer logging in still couldn't see the CTA.

Fix in two parts:

**Code (commit `2166b8c`, `src/pages/PublicSMSProgramPage.jsx`):** added `OptInFormScreenshot` — a faithful no-login visual reproduction of the exact Settings → My Profile → "SMS Job Reminders" consent form (heading, sub-text, phone field, unchecked checkbox, Save, verbatim disclosure), mirroring `SettingsPage.jsx` ~454-512. Prerendered into `dist/sms-program/index.html` so reviewers/bots get the CTA on first byte. Verified rendering via Playwright at `https://churchopshub.com/sms-program` (curl is firewall-blocked → `x-vercel-mitigated: deny`; **use a real browser to verify this page, not curl**).

**Console "Fix Campaign" (4 fields, no fees, same Campaign SID + MS + Brand):**
1. **Campaign description** rewritten to reference the public no-login URL (clears 30921 / USE_CASE_DESCRIPTION).
2. **"How do end-users consent to receive messages?"** rewritten — no test credentials, no "sign in" instructions, leads with the public URL + screenshot reference (clears 30909 / MESSAGE_FLOW).
3. **Privacy Policy URL** filled with `https://churchopshub.com/privacy` (was empty — a structured rejection vector, not just cosmetic).
4. **Terms and Conditions URL** filled with `https://churchopshub.com/terms` (was empty).

Sample messages, opt-in/opt-out keywords & messages, embedded-link/phone/age-gated/direct-lending flags all left **untouched** at parity with the prior submission.

Post-submit state: Console shows "In progress / under review"; API `GET .../Compliance/Usa2p` confirms `campaign_status: IN_PROGRESS` with the new description + message_flow stored. **Quirk:** unlike a 5/14-style API DELETE+POST resubmit, the Console "Fix Campaign" path does **not** immediately clear `errors[]` or advance `date_updated` on the Compliance API view — those refresh when TCR completes the new review. Console UI banner is the source of truth post-submit.

**Confirmed dead end:** the simplified Messaging Compliance API (`/v1/Services/{MS}/Compliance/Usa2p`) is **create-only** — `DELETE` → HTTP 405, `POST` over existing → HTTP 409. Earlier memory claiming a DELETE+POST path is wrong (corrected in `memory/project_churchopshub_webhook_drop.md`). For a FAILED campaign, the only no-fee path is the Console **"Fix Campaign →"** button on the campaign detail page.

---

## 2026-05-19 — Suppress Sentry "Connection to Indexed Database server lost" Firebase Auth noise

New Sentry error-level issue (`javascript-react`, prod): `UnknownError: Connection to Indexed Database server lost. Refresh the page to try again` at `https://churchopshub.com/?invite=FXCC&hubs=maintenance%2Ctasks` (someone on the AuthScreen opening an invite link). **Not an app defect.** Thrown by **Firebase Auth's IndexedDB-backed persistence** (its token store) when the browser drops the IDB connection mid-session — Safari/iOS eviction, a backgrounded/killed tab, cleared site data, or private mode. Transient, environmental, self-heals on the refresh the SDK's own message prompts. Firestore offline persistence is **not** enabled anywhere in `src/` (`grep` for `initializeFirestore`/`persistentLocalCache`/`enableIndexedDbPersistence` → none), so this is Auth-only token-store noise, not data-cache corruption. Surfaced as error-level only because `captureConsoleIntegration({levels:['error']})` picks up the Firebase SDK's `console.error`.

Fix (`src/main.jsx` `beforeSend`): added a second drop rule — `msg.includes('Connection to Indexed Database server lost') → return null` — alongside the existing `@firebase/firestore` "Uncaught Error in snapshot listener" filter. Same category as the 2026-05-18 SW-registration noise demotion. Source-only; takes effect on Vercel auto-deploy. Not actionable beyond this; nothing in app code can prevent a browser from evicting IndexedDB.

---

## 2026-05-18 — Fix: Sentry "Service worker registration failed: Rejected" demoted to warn

Stale Sentry error-level issue (`javascript-react` project, prod, `https://churchopshub.com/`). **Not a server defect** — direct prod probes confirmed every SW dependency serves correctly: `/sw.js` → `200 application/javascript`, `/manifest.json` → `200 application/json`, `/icon-192.png` & `/icon-512.png` → `200 image/png`. The vercel.json catch-all (`/(.*)` → `/app.html`) does **not** swallow these — Vercel's static-file precedence serves them before rewrites apply (an early investigation hypothesis that was disproven by the probes; no vercel.json change made).

The literal `err.message` of `"Rejected"` with all assets healthy means `navigator.serviceWorker.register('/sw.js')` is rejecting in restrictive **client** environments only (private mode / storage-blocked / bots/crawlers). The SW is explicitly best-effort (network-first, no stale data) with **zero user-facing impact** — a failed registration just means no PWA install prompt + no offline shell; the app loads and runs fully. Logging that via `console.error` made Sentry's `captureConsole({levels:['error']})` file invisible noise as an error-level issue.

Fix (commit `7446b6e`, `index.html`): the `.catch` now `console.warn`s `[ChurchOpsHub] Service worker registration skipped:` with `err.name` + message — diagnosable in-console, no longer error-level. Supersedes the 2026-05-14 `b3f6779` `console.error` choice (that commit's goal — surface the real error instead of an unhandled "Rejected" rejection — is now served by the enriched warn). Source-only change; takes effect on Vercel auto-deploy.

---

## 2026-05-18 — Hide test/E2E accounts from member lists + Reuben dedupe

Reported via the Tasks assignee filter showing "E2E Admin" and "Reuben Hinckley" twice.

**Test-account leak (commit `765cdbd`):** the E2E suite runs against PROD, so `e2e-admin@`/`e2e-member-b@churchopshub.com` live permanently in the real FXCC church (`6cksNI9…-church`) and surfaced in every user picker + the billable seat count. New `src/utils/testAccounts.js` (`isTestAccount` / `excludeTestAccounts`, matches the `@churchopshub.com` domain) applied at the single source in `useFirestore.js:117` so all consumers inherit it. Owner chose "hide everywhere" (unconditional) over the real-users-only variant.

**E2E verification:** full Playwright suite re-run against prod after deploy → **40 passed / 1 skipped / 0 failed (2.1m)**. The predicted risk (roster-visibility/announcements specs depending on test-member name render) did not materialize: those specs assert seeded signup-entry display names, not `users`-collection lookups. No spec rework needed. (First run was a false alarm — Vercel bot-protection "Code 21" challenge blocked auth-setup; passed cleanly on the documented ~5-min retry.)

**Reuben Hinckley duplicate (manual data fix):** he signed up twice within ~100s on 2026-05-18 — once with a typo email `reubenhh@gmail.xom` (`SLEYb4d3…`, allowedHubs `[maintenance,tasks]`), once correct `reubenhh@gmail.com` (`wEwGMVFCg9…`, no hubs). Neither had logged in again or had any task/job references. Owner-run script: copied `[maintenance,tasks]` onto the `.com` doc, deleted the `.xom` Firestore user doc + its Auth account. (The script was blocked from the agent by the destructive-action classifier — correct behavior — and run by the owner via `!`.)

---

## 2026-05-18 — Fix: Google sign-in blocked by CSP (two gates; broken ~7 weeks)

User reported "Google sign-in failed. Please try again." on the Welcome Back screen. Not a Firebase config problem — `churchopshub.com` is in Auth authorized domains, the `/__/auth/(.*)` → `church-inventory-9615c.firebaseapp.com` Vercel rewrite is present and returns real Firebase handler/iframe content, and email/password sign-in worked fine.

`signInWithPopup` (with the custom proxied `authDomain` `churchopshub.com`) needs two CSP allowances that the 2026-03-27 security-hardening commit (`a45da1f`) did not include. Both were broken from 2026-03-27 onward; unnoticed because email/password (the `jcvaught@gmail.com` path) was unaffected.

1. **`frame-src` missing `'self'`** — the SDK loads a same-origin relay iframe at `https://churchopshub.com/__/auth/iframe`; the browser enforces CSP on it as `'self'`. An explicit `frame-src` overrides `default-src 'self'`, so omitting `'self'` blocked the iframe. Fixed commit `ed108f6` (added `'self'` to `frame-src`).
2. **`script-src` missing `https://apis.google.com`** — that relay iframe loads `https://apis.google.com/js/api.js` (gapi) to drive the popup handshake. Browser console on `churchopshub.com` showed: *"Loading the script 'https://apis.google.com/js/api.js' violates … script-src 'self' 'unsafe-inline' https://js.stripe.com … The action has been blocked."* Fixed commit `d6b06ce` (added `https://apis.google.com` to `script-src`).

Diagnostics improvement (commit `9e6958b`): `loginWithGoogle` catch in `src/useAuth.js` previously swallowed every non-`popup-closed` error into a generic message with no logging. Now it special-cases `auth/popup-blocked` and `auth/unauthorized-domain` with actionable copy, surfaces the `auth/*` code for anything else, and `Sentry.captureException`s with tag `flow:google-signin` so future failures are diagnosable without a console.

All three are vercel.json/src changes; take effect on the Vercel auto-deploy. CSP header changes require a hard refresh (headers are attached per-deployment, cached pages keep the old header).

**Accepted behavior (not a bug):** after the CSP fix, the Google popup opens and completes but a password-registered user (e.g. `jcvaught@gmail.com`, UID `DTd95wkCIpeYRnqP39dtU0VyNvU2`, providers `["password"]` only) is bounced back to the sign-in screen. The project uses "one account per email" (`allowDuplicateEmails` off), so Google sign-in for an email that already has a password-only account collides (`auth/account-exists-with-different-credential`) — there is no linked Google identity to sign into. This affects any password-registered user who clicks "Sign in with Google". Owner decision 2026-05-18: leave as-is; email/password is canonical. Do **not** "fix" this bounce as a regression. If revisited, the path is an in-app link flow (password sign-in → `linkWithPopup(googleProvider)`).

---

## 2026-05-16 — Stale-chunk self-heal for lazy-loaded hubs

Sentry caught `TypeError: Failed to fetch dynamically imported module: .../assets/TasksPage--BA92yxPw.js` (issue `5e2ac57f…`, production, Chrome). Not a code bug — deploy skew: a browser still running an older build requested a hub chunk whose hashed filename no longer existed on the host after the 2026-05-15 pre-rendering deploy.

New `src/utils/lazyWithRetry.js` wraps `React.lazy`: retries the dynamic `import()` once (transient network blip), then on a second failure forces a one-time hard `window.location.reload()` to fetch the fresh `index.html` + chunk manifest. A `sessionStorage` flag (`chunk-reload:<name>`, cleared on success) prevents an infinite reload loop if the failure isn't a stale chunk. All 7 lazy hub imports in `HubsPage.jsx` (Insights, Maintenance, Coordination, Accountability, PeopleAccess, Tasks, Jobs) now use `lazyWithRetry`.

**Defense in depth:** `src/components/primitives/ChunkErrorBoundary.jsx` wraps the hub `<Suspense>` (`key={hubKey}` so each hub gets a fresh boundary). It's the terminal fallback for the case where `lazyWithRetry` already reloaded once and the import still fails (guard set → rethrows): instead of a hung spinner the user gets a framed *"A new version is available — Reload"* card (chunk errors) or a generic *Reload / Try again* card (other render crashes). Reports to Sentry via `componentDidCatch` (Suspense/render errors are swallowed by the boundary so the global handler never sees them) with `boundary:hub` + `chunkError` tags for feed filtering. **Caveat:** this only protects tabs running the new build — a tab still on a pre-`fea4b24` build during the *next* deploy can still hit the raw error once before the self-heal/boundary code is present. Closing that residual gap requires host-side asset retention (Vercel Skew Protection), deferred for now. Build + lint clean (0 errors).

---

## 2026-05-15 (PM) — Pre-rendering extended from blog posts to all public pages

Second pass of the SEO pre-rendering work — extended from blog content to landing + help + terms + privacy + sms-program. New `scripts/prerender-static.mjs` (commit `bf49b64`) runs in the `postbuild` chain after `prerender-blog.mjs`. Polyfills `globalThis.window` and `globalThis.document` BEFORE module imports — COH's `LandingPage` reads `window.innerWidth` in a `useState` lazy initializer for responsive layout state. Uses Vite's `ssrLoadModule` + React's `renderToString` wrapped in `HelmetProvider` (since `SEO.jsx` uses `react-helmet-async`).

**Vercel routing change.** `vercel.json` catch-all rewrite updated from `/index.html` → `/app.html`. The prerender script preserves the original Vite-built SPA shell at `dist/app.html` before overwriting `dist/index.html` with the SSR-rendered landing page. Vercel serves static files in `dist/` before applying rewrites. The existing `/__/auth/(.*)` Firebase auth rewrite stays before the catch-all and is unaffected.

**5 routes pre-rendered:**
- `/` (LandingPage 29KB)
- `/help` (Help Center 85KB — the 14-section accordion content this session expanded with the People Access Hub coverage)
- `/terms` (17KB)
- `/privacy` (18KB)
- `/sms-program` (14KB — the Twilio A2P public disclosure page)

**Legacy query-string URLs still work.** App.jsx checks both pathname AND query-string for the help/terms/privacy/sms-program routes. The path-based URLs are now SEO-canonical (and indexable), but old bookmarks/links to `/?help`, `/?privacy`, etc. continue to render the right page via the SPA after the catch-all routes them to `/app.html`.

**Before:** every public URL returned a 2,477-byte SPA shell with 30 chars of visible text. **After:** `/` returns 28,951 bytes with 3,607 chars of visible content; help page returns 84,734 bytes with the full FAQ accordion expanded — no JS execution needed for Google to crawl any of it. Production-verified post-deploy. Cross-app audit + outcomes at `~/apps/seo-audit-2026-05-15.md`. Memory: `project_prerender_blog.md`.

---

## 2026-05-14/15 — SEO Cross-App Audit + Blog Pre-rendering

Part of a 4-app SEO session covering RC, COH, MH, CC. Cross-app audit at `~/apps/seo-audit-2026-05-15.md`. Per-COH shipped this session:

**Help docs (Phase 1 in cross-app plan, commit `bb1b524`)** — HelpPage gained a complete People Access Hub section with 8 accordions (adding people, the 4 record types — background_check 🔍 / key_assignment 🔑 / certification 🎓 admin-only / custom ✅, expiry tracking with 🔴 expired / 🟡 warning / ✅ ok signals, custom requirements, bulk entry, linking a person to a user account, permissions at a glance, CSV export). All-In Bundle copy reconciled across three surfaces (FAQ said "six paid hubs", pricing card said "7", grid showed 8 — standardized on "7 feature hubs + unlimited team members" with the full list). Added a Note in Job Hub's "Signing up and withdrawing" accordion explaining how Required Access Types compliance gating links back to People Access Hub records.

**Blog post (commit `b091709`)** — "The Hidden Cost of Running Church Operations on Spreadsheets" (~1,900 words). Deliberately differentiated from the existing "Moving Beyond Spreadsheets: Church Inventory Best Practices" post by focusing on cross-functional operations sprawl (volunteer coordination + maintenance tickets + compliance + key management + audits + job posts) rather than inventory alone. Five hidden costs framed for the 200-member church target: volunteer coordinator tax (3–5 hrs/week), maintenance request Bermuda Triangle (no automatic surfacing), compliance risk with no owner ("probably yes but can't prove it"), key management liability (20–60 keys typically out), and cross-functional coordination tax (~150–300 hrs/year). Closes with the migration framing and the All-In Bundle math.

**PostHog analytics wired (commit `29b7ade`)** — `posthog-js` installed as a dep, lazy-loaded in `src/main.jsx` via `requestIdleCallback` (or 1500ms `setTimeout` fallback for Safari, matching MH/RC pattern). Block dead-code-eliminates when `VITE_POSTHOG_KEY` is unset, so the integration ships inert until env vars land. Activation requires: create PostHog project at us.posthog.com, set `VITE_POSTHOG_KEY` + optional `VITE_POSTHOG_HOST` in Vercel Production env, redeploy. Goes alongside the existing Sentry integration (which stays as the errors-only channel).

**Pre-rendering for SEO (commit `2750767`) — the major fix.** New `scripts/prerender-blog.mjs` runs as `postbuild` after `vite build`. Same pattern as RepCrew: reads `BLOG_POSTS` from `src/data/blogPosts.js`, renders each post's markdown to HTML via `marked`, wraps in a fully styled standalone HTML page (ChurchOpsHub navy + teal branding, embedded CSS, no external dependencies, includes site nav + footer + CTA + 3 related posts + post description prominently displayed), and writes to `dist/blog/<slug>/index.html`. Also generates `dist/blog/index.html` for the listing. Vercel serves static files before the SPA catch-all rewrite (preserving the existing Firebase auth rewrite in `vercel.json` — order matters: more specific rewrites first, then static files take precedence, then the SPA catch-all last).

**Before:** every blog URL returned a 2,477-byte SPA shell with 30 chars of visible text. **After:** each post URL returns ~20KB of static HTML with ~7,600 chars of actual visible blog content — no JS execution needed for Google to index. 20 posts + 1 index page generated per build. Production-verified post-deploy. Memory: `project_prerender_blog.md`.

**Sitemap status note:** unlike RC, COH's sitemap submission appeared to be working in GSC (HTTP 200, valid XML, 26 URLs at audit time). The deeper indexing problem was still the empty SPA shells — Google could read the sitemap but the URLs it discovered returned no content. Pre-rendering closes that gap.

---

## 2026-05-14 — New-user signup-flow audit (15 findings, 4 shipped)

Audited every signup entry point (`createChurch`, `register`, `loginWithGoogle`, `login`, `registerWithGoogle`, `onAuthStateChanged`, and the AuthScreen UI). 15 findings across 4 severity tiers. Three of the four critical/high items shipped this commit; the rest are queued.

### Shipped (commit `7b21317`)

- **S-1 — `profileMissing` recovery screen + Sentry breadcrumb.** When `onAuthStateChanged` finds an Auth account with no `users/{uid}` doc — exactly Haleigh's state earlier today — `useAuth` sets a new `profileMissing: true` flag and `Sentry.captureMessage(...)` logs the case for proactive visibility. `App.jsx` renders a new `ProfileMissingScreen` (email displayed, prefilled mailto support link, sign-out button) instead of silently bouncing the user back to the login form. We'll now hear about future occurrences instead of waiting for an email.
- **S-2 — Cleanup orphan Auth on any post-Auth failure.** Both `createChurch` and `register` now wrap every step after `createUserWithEmailAndPassword` in an inner try/catch that best-effort `cred.user.delete()`s on ANY thrown error (rules denial, network, quota, business-rule rejection). The user can retry with the same email instead of being permanently blocked by `auth/email-already-in-use`. The previous inline `cred.user.delete()` calls in `createChurch`/`register` for specific business errors are removed because the outer catch handles them — avoids double-delete.
- **S-4 — `sendEmailVerification` failures surfaced to Sentry.** Two `.catch(() => {})` swallowing sites replaced with `Sentry.captureException`. The signup still succeeds (verification is best-effort) but we hear about SendGrid/quota issues instead of users silently never receiving the email.
- **S-5 — `loginWithGoogle` distinguishes first-time vs stuck state.** Compares `creationTime` vs `lastSignInTime` on `firebaseUser.metadata`. First-time sign-in still flows to `needsRegistration`; returning users with missing profiles fall through to the new recovery screen with a Sentry warning. `login` (email/password) inherits the same recovery path via `onAuthStateChanged`.

### Second pass (commits `0944a47`, `6180e4f`, `f561139`) — remaining audit items shipped

- **S-6 — SMS opt-in gated on `user.emailVerified`** (`6180e4f`). The Settings page's SMS Job Reminders section now shows a "verify your email first" message in place of the phone/checkbox form for unverified users. After verifying (Resend button in the AppShell banner already), the form reappears unchanged. Ties TCPA/A2P consent to an identity we know the user controls.
- **S-7 — atomic `writeBatch` in `createChurch` + companion rules update** (`f561139`). The 5-doc signup chain is now one all-or-nothing batch. Companion rules change: `config/main` and `config/settings` split `allow write` into `allow create: if self-creator OR isChurchAdminOrManager` and `allow update, delete: if isChurchAdminOrManager`, matching the existing `config/subscription` pattern. Rules deployed to `church-inventory-9615c`. Closes the partial-failure window that previously could leave orphan Firestore docs even after S-2's Auth-account cleanup.
- **S-9 — `findChurchByCode` distinguishes "not found" from "lookup failed"** (`0944a47`). Throws a specific error on CF failure (+ Sentry); callers surface a transient-failure message instead of "Invalid church code" during CF outages.
- **S-11 — `registerWithGoogle` signs out on cleanup** (`0944a47`). Failed church-code lookup no longer leaves the user in a stuck-Google-session state.
- **S-12 — Honeypot bot trap on `register` form** (`0944a47`). Matches the existing trap on `createChurch`.
- **S-13 — Timestamps consolidated** (`0944a47`). Single `now` reused across every doc write in a single signup chain.
- **S-14 — Email normalization** (`0944a47`). `createChurch` / `register` / `login` / `resetPassword` / `registerWithGoogle` apply `.trim().toLowerCase()` before any Firestore or Firebase Auth call.

### Skipped / non-issues

- **S-3** was Haleigh's bug, already fixed in commit `73e73ec`.
- **S-8** is already covered by S-2's inner try/catch (`updateProfile` is inside it).
- **S-10** isn't reachable under current flows — `register` creates a new Auth account, and Firebase blocks duplicate emails before `setDoc` ever runs.
- **S-15 — server-side signup rate limiting** is the one real gap left. Effective limiting requires reCAPTCHA or a Cloud Function gate; client throttle is useless against bots. Firebase Auth's own per-IP throttling is the only protection in place today. Deferred as a known gap.

## 2026-05-14 — Signup chain broke for new church creators (Haleigh / TrueNorth)

Haleigh Watson signed up to evaluate ChurchOpsHub for TrueNorth Church (code TNC2026) at 10:40 EDT today and emailed asking for help — the signup accepted her info and the welcome email arrived, but she could not get past the login screen and password reset didn't help.

**Root cause:** `useAuth.createChurch` wrote Firestore docs in this order:

```
1. churches/{id}              ← parent doc        ✓ self-creator branch passes
2. churches/{id}/config/main  ← admin-required    ✗ DENIED here
3. churches/{id}/config/settings
4. churches/{id}/config/subscription
5. users/{uid}                ← creator's profile
```

The rule on `config/main` and `config/settings` is `isChurchAdminOrManager(churchId)`, which reads the requesting user's role from `users/{uid}`. At step 2 that document doesn't exist yet, so the rule denies, the awaited `setDoc` throws, the chain breaks, and steps 3–5 never run. The Auth account is created, the parent church doc is created (which fires the `sendWelcomeEmail` Cloud Function — explaining why she received the welcome email), but no config and no user profile exist. The app then loads, finds no user profile in Firestore, and keeps her stuck on the login screen.

Anyone signing up between the rules being deployed in this configuration and today's fix would have hit the same wall silently.

**Repair (Haleigh's account):** ran an Admin-SDK script that bypasses rules and wrote the four missing docs — `config/main`, `config/settings`, `config/subscription` (90-day trial restarted from today), and `users/{uid}` (role: admin, name: Haleigh Watson, etc.). All values match what the signup flow would have written; trial dates use today's timestamp per user request so the trial isn't shortened by the failed signup window.

**Fix (commit `73e73ec`):** moved the `users/{uid}` `setDoc` to immediately after the parent church doc, before any config writes. The chain is now:

```
1. churches/{id}
2. users/{uid}                ← was step 5
3. churches/{id}/config/main
4. churches/{id}/config/settings
5. churches/{id}/config/subscription
```

`isChurchAdminOrManager` now passes at step 3 because the user doc exists by then. Removed the duplicate `setDoc(users/...)` that was at the end of the block; kept the `setUserProfile()` React state update there. Build clean, lint 0 errors. Deployed via Vercel.

---

## 2026-05-14 — Tasks-modal interactive-primitives audit

After the third invisible-feedback report on the same modal in two days (focus-yank, focus-on-open, no-autogrow — all 2026-05-13), ran a narrow audit of the modal's interactive primitives: `Modal`, `FF`, `RichTextarea`, `TagInput`, `BlockedByInput`, the pill-group selects (`AssigneeSelect` / `SharedWithSelect` / `VisibilitySelect`), and `CommentThread`. 13 findings filed (`P-1` … `P-13`) across 3 severity tiers.

Shipped the two real bugs:

1. **P-1 — `BlockedByInput` leaked a `setTimeout`.** `addBlocker`'s "Task not found." error reset used a bare `setTimeout(() => setBlockerError(''), 3000)` with no unmount cleanup. Closing the modal within 3 s of typing an invalid TSK number fired `setState` on an unmounted component (React warning). Wrapped in `errorTimerRef` + an unmount cleanup `useEffect`, matching `TagInput`'s existing `blurTimerRef` pattern.

2. **P-2 — `CommentThread` mention insertion ignored cursor position.** Picking from the `@-mention` dropdown did `onChange(newComment + '@' + name + ' ')` — always appended at the end, even if the caret was elsewhere. Added a `commentInputWrapRef` on the input wrapper, `querySelector('textarea')` to read `selectionStart`, splice the mention at that offset, then restore the caret after the inserted text on the next tick. Verified live: caret at index 5 in `"Hello world"` → `"Hello @John Vaught world"` with caret at 18.

Remaining audit items (deferred — labelled `P-3` to `P-13` in session notes):

- **a11y bundle**: Modal has no focus trap (Tab can escape the dialog); `FF`'s `cloneElement` injection drops a11y props on custom-component children (`TagInput`, `BlockedByInput`, the `*Select` pills) → label `htmlFor` points nowhere; pill-group selects have no `role`/`aria-pressed`/`aria-checked` — screen readers can't tell what's selected.
- **polish**: `RichTextarea` label has no `htmlFor`; toolbar bullet/numbered toggles don't preserve cursor offset; `TagInput`/`BlockedByInput` fire Enter on both keydown + keyup; `scrollIntoView({behavior:'smooth'})` in `CommentThread` scrolls the modal panel; the edit-comment textarea is a plain `<textarea>` (no auto-grow) instead of `RichTextarea`; mention regex misses apostrophes/hyphens; required-field asterisks are inconsistent.

`RichTextarea` is also **still duplicated** between `TasksPage.jsx` and `MaintenancePage.jsx` — extracting to `src/components/primitives/RichTextarea.jsx` is the obvious next refactor if it gets touched again.

### a11y bundle shipped (P-3 / P-4 / P-5 / P-6, second pass on 2026-05-14)

Closed the four accessibility findings from the audit:

3. **P-3 — Modal focus trap.** `Modal.jsx`'s document `keydown` handler only watched `Escape`. Tab inside the panel would walk past the last focusable element onto background controls behind the backdrop (selects in the rest of the page, the close button on a parent modal, the browser's address bar). Extended the handler with a Tab branch: query `panelRef` for all enabled `input/select/textarea/button/a[href]/[tabindex]` elements, then preventDefault + wrap when (a) `Shift+Tab` from the first element → focus last, (b) `Tab` from the last element → focus first, (c) `Tab` fires while focus has somehow leaked outside the panel → snap back to the first element. `Escape` behavior unchanged.

4. **P-4 — `FF` a11y for custom components.** `FF`'s `cloneElement` only forwards `id`/`aria-*` to its first child, which works for native `<input>`/`<select>`/`<textarea>` but silently drops the props on custom components (the cloned `id` lands on the custom-component instance, not on the inner `<input>` it eventually renders). The label's `htmlFor` then points at an element that doesn't exist, breaking the click-label-to-focus-input behavior and screen-reader name lookup. New branch in `FF`: detect `typeof first.type === 'string'`. Native elements get the existing `htmlFor`/`cloneElement` path unchanged. Custom-component children now render the label as a `<div id={labelId}>` plus a `role="group" aria-labelledby={labelId}` wrapper (and `aria-required`/`aria-invalid`/`aria-describedby` lift onto the group). Visible markup is identical; screen readers announce the field group correctly.

5. **P-5 — pill-group ARIA semantics.** `AssigneeSelect`, `SharedWithSelect`, and `VisibilitySelect` render pill `<button>`s with a "✓ " prefix and a teal background as the only selection signal — screen readers had no way to know which pill was selected. Added `aria-pressed` (toggle-button pattern) to each pill. `SharedWithSelect` also emits `aria-disabled` on the locked "assignee" pill (it stays visible but can't be untoggled, which the cursor:`default` + 0.7 opacity already conveyed visually).

6. **P-6 — `RichTextarea` label `htmlFor`.** The internal `<label>` rendered when `RichTextarea` receives a `label` prop had no `htmlFor` and the `<textarea>` had no `id`. Generated a `useId` in `RichTextarea` (TasksPage copy), set `htmlFor` on the label and `id` on the textarea. MaintenancePage's `RichTextarea` doesn't render an internal label (parent wraps it in `FF`), so its accessibility is covered by the P-4 fix above.

Build clean, lint 0 errors (43 baseline warnings, all pre-existing `exhaustive-deps`).

### Polish bundle shipped (P-7 … P-13, third pass on 2026-05-14)

Closed the seven remaining audit items:

7. **P-7 — toolbar cursor preservation.** `RichTextarea.toggleBullet`/`toggleNumbered` toggled the `• ` / `1. ` prefix on the active line(s) and called `el.focus()` without restoring the selection — the cursor snapped back to offset 0. Replaced the duplicated toggle bodies with a single `applyLineTransform(kind)` helper that computes old/new line-start arrays and re-maps `selectionStart`/`selectionEnd` to the same offset-within-line in the new text. Applied to both `TasksPage.jsx` and the duplicated `MaintenancePage.jsx` copy.

8. **P-8 — `TagInput` / `BlockedByInput` Enter double-fire.** Both components handle Enter in `onKeyDown` (desktop) and `onKeyUp` (mobile virtual-keyboard fallback). The keydown clears `inputVal` via `setInputVal('')`, but React state isn't synchronously updated, so the closure-captured `inputVal` in `onKeyUp` is still non-empty and `addTag(inputVal)` ran a second time. Added an `enterHandledRef` flag set in keydown and cleared in keyup; the mobile fallback only fires when keydown didn't already handle it.

9. **P-9 — dropdown keyboard navigation.** `TagInput` and `BlockedByInput` suggestion dropdowns were mouse-only. Added `highlightIdx` state with `ArrowDown`/`ArrowUp` to navigate, `Enter` to select the highlighted suggestion, and `Escape` to dismiss. Mouse hover updates the highlight so keyboard + mouse stay in sync. Dropdowns got `role="listbox"` + `role="option"` + `aria-selected` so screen readers announce the active item. The displayed index is clamped via `safeIdx = idx >= 0 && idx < filtered.length ? idx : -1` rather than reset in a `useEffect` (avoids the "setState in effect" lint rule).

10. **P-10 — scope `CommentThread` auto-scroll.** `endRef.scrollIntoView({ behavior:'smooth' })` scrolls the nearest scrollable ancestor — for comments in a modal, that's the modal panel itself, so posting a comment yanked the entire dialog. Replaced with `listRef.current.scrollTop = listRef.current.scrollHeight` on the comment-list container.

11. **P-11 — edit-comment auto-grow.** Edit-comment mode rendered a plain `<textarea>` with no auto-grow, so editing a long comment hit the same Enter-doesn't-work invisible-feedback bug we fixed for the description field (2026-05-13). Extracted a small `AutoGrowTextarea` component (same `el.style.height = scrollHeight` pattern as `RichTextarea`) and used it for the edit path.

12. **P-12 — mention rendering.** `renderWithMentions` used `/(@[\w][\w\s]*?\b)/g` which dropped apostrophes/hyphens (`@O'Brien` → `@O`, `@Mary-Jane` → `@Mary`) and clipped multi-word names like `@John Vaught` to `@John` because `\b` matches at the first space. Replaced with a names-list-driven scan: pull the actual user names from the `users` prop, sort longest-first, and walk the text matching at each `@`. Now any reasonable name shape highlights correctly. Call site updated to pass `users`.

13. **P-13 — required-field asterisk consistency.** Across 10 files, 26 `FF` call sites used `label="Foo *"` and 2 used `label="Bar (required)"` while `FF`'s actual `required` prop only emitted `aria-required` (no visible marker), so two non-standard conventions had grown ad-hoc. Updated `FF` to render a red asterisk after the label when `required` is set, then converted all 28 call sites to `<FF label="Foo" required>`. Screen readers now hear "required" via `aria-required`; sighted users see a consistent asterisk.

Build clean, lint 0 errors (43 baseline `exhaustive-deps` warnings).

### Twilio HELP keyword (compliance gap closed on 2026-05-14)

A2P campaign `CM1c503f6147a2db830f…` is still "In progress" with Twilio (submitted 2026-04-27). While checking on it, found that Privacy §6 and Terms §7 commit to a "reply HELP for help" response, but **HELP replies silent-drop**:

- `twilioInbound` only branched on STOP / START keywords; HELP fell through to empty `<Response/>`.
- The CF's old comment said "HELP responses are handled by Twilio Messaging Service Advanced Opt-Out (configured in Twilio Console)" — but that's not actually in effect. Per `project_churchopshub_a2p.md`, `+1 571-540-7100` is a bare account-level number not attached to either Messaging Service, so the Messaging Service's Advanced Opt-Out keywords (where HELP would live) never fire for inbounds to this number. The phone number's webhook routes directly to `twilioInbound`.
- If Twilio's A2P reviewer tested HELP during review and got silence, the campaign could have been rejected on that alone.

**Fix:** Added a `HELP_KEYWORDS = ['HELP', 'INFO']` branch to `twilioInbound` that returns TwiML:
```
ChurchOpsHub: Reminders for jobs you signed up for. Msg frequency varies (1-5/week). Msg and data rates may apply. Reply STOP to opt out. For help, email churchopshub@gmail.com.
```
Deployed to prod immediately (`functions:twilioInbound` only). Once the A2P campaign approves and the bare number moves into the campaign's Messaging Service, the Advanced Opt-Out HELP keyword will fire first and this CF branch becomes a redundant fallback — safe to leave in place.

**Resolution (later 2026-05-14):** Diagnosed via Twilio Messaging API. Two findings:

1. **A2P campaign was rejected**, not "In progress." `campaign_status: IN_PROGRESS` in the Console UI is misleading — the API exposes `errors: [{error_code: 30909, fields: ["MESSAGE_FLOW"], description: "...rejected due to issues verifying the Call to Action (CTA)..."}]`. The reviewer couldn't verify the opt-in CTA because the actual form lives behind a login wall (Settings → My Profile → SMS Reminders). Carrier A2P filtering blocks every outbound from `+1 571-540-7100` (including Twilio's own compliance auto-responses) until the campaign is approved. That's why STOP / START / HELP replies never reached the user's phone in any test.

2. **HELP keyword is owned by the campaign**, not our webhook. Campaign config has `help_keywords: ["HELP", "INFO"]` with `help_message: "Reply STOP to unsubscribe. Msg&Data Rates May Apply."` — Twilio intercepts HELP/INFO and serves that default message before any webhook fires. Our P-Help CF branch (shipped earlier today in `e62eb42`) is now dead code on this account, but harmless to keep as defense-in-depth if HELP keywords are ever removed from the campaign.

3. **Inbound webhook routing was fixed** by moving the number into the campaign's Messaging Service (`MGb4f2156d4ab3104ee564f15cb701d81d`). Bare number + rejected campaign = silent webhook drops. Service-attached number = webhook fires. Verified via Delivery Steps showing "TwiML Fetch Succeeded" 4.14s after a non-keyword test message.

**Action items left open after this session:**
- ~~Address the campaign rejection~~ ✓ Resubmitted 2026-05-14 at 22:32 UTC. See section below.
- ~~Optionally customize the campaign's `help_message`~~ Attempted; Twilio's API kept its default text on LOW_VOLUME — not worth pursuing.

### Resubmission (later same day, 22:32 UTC)

Deleted both pre-existing campaigns via the Messaging API (`DELETE /v1/Services/{MS}/Compliance/Usa2p/{QEsid}`): the FAILED one on the unused service `MG45293bc76c21346ac47e5326ce1b7df6`, and the rejected one on the active service `MGb4f2156d4ab3104ee564f15cb701d81d`. Then POSTed a fresh campaign on the active service with the updated `MessageFlow` — reviewer test credentials (`e2e-admin@churchopshub.com` / `E2eTestPass123!`) and step-by-step opt-in walkthrough verified against the actual SettingsPage code. Brand SID `BN26d4c…` (approved) was reused.

Result: HTTP 201, `errors: []`, `date_updated: 2026-05-14T22:32:04Z`, `campaign_status: IN_PROGRESS`. Compliance SID reused: `QE2c6890da8086d771620e9b13fadeba0b`. Now waiting on TCR review — typical re-submission turnaround on an already-approved brand is 1–3 days, vs 2–3 weeks for first-time submissions.

Twilio's Console campaign page should now show just one campaign (the failed orphan on the second messaging service is gone). The fee for the new submission is charged to the Twilio account, partially or fully covered by the twilio.org nonprofit credit approved on 2026-04-27.

Until TCR approves, outbound replies from `+1 571-540-7100` to real US carriers will still be carrier-filtered as unregistered A2P traffic. End-to-end SMS testing has to wait for approval.

### Further investigation of the rejection — Edit form is locked

Attempted to resubmit the corrected `message_flow` through the Console's **Edit Campaign** dialog. The "How do end-users consent" textarea and the Privacy/Terms URL fields are all rendered greyed-out / non-editable while the campaign sits in this "rejected but displayed as IN_PROGRESS" limbo. No email rejection notification was sent (or it was missed). No "Resubmit" button appears on the campaign detail page.

Re-checked the Messaging API right after — `errors[]` still carries the same `30909 / MESSAGE_FLOW` entry, and `date_updated` is unchanged at `2026-04-27T12:45:46Z`. So Twilio is not silently retrying; the submission is stuck and the only avenue forward is **delete + re-register** via API, or a **support ticket** asking Twilio to either unlock the edit form or waive the re-registration fee.

### Compensating change shipped (independent of the campaign decision)

Discovered that the in-app SMS consent disclosure text (rendered in `SettingsPage.jsx`'s "SMS Job Reminders" section) did **not** match what the public `/sms-program` page claims is the "exact text shown in the app." The in-app version omitted the message-frequency note and the HELP keyword reference — both A2P-required language. A careful reviewer comparing the two would have flagged it independent of the CTA issue.

`SettingsPage.jsx` and `PublicSMSProgramPage.jsx` both now use the longer disclosure: *"By providing your phone number and enabling SMS reminders, you consent to receive automated text messages from ChurchOpsHub for job-shift reminders. US and Canada numbers only. Message and data rates may apply. Message frequency varies (typically 1-5 messages per week). Reply STOP to unsubscribe or HELP for help."*

Shipped in commit `d114495`. Deployed to Vercel. So whether the campaign gets re-submitted today or in three weeks, the in-app form already shows the disclosure text the `message_flow` field will describe.

### Drafted `message_flow` ready to paste once edit becomes possible

Includes test reviewer credentials (`e2e-admin@churchopshub.com` / `E2eTestPass123!` — user confirmed OK to share with TCR), explicit click-by-click opt-in steps verified against `SettingsPage.jsx`, the exact in-app consent disclosure text, and links to the public disclosure / privacy / terms pages. Stored in this session's notes; not committed to the repo because it's submission-form copy rather than code.

### Next-session resume

- Decide between **Twilio support ticket** (free, 2-3 days wait) vs **delete + API re-register** (~$15 fee, restarts TCR queue but no human-in-loop delay). User opted to pause here.
- Either way, no further code changes are required to address the rejection — the consent-text fix (commit `d114495`) and webhook routing fix (number moved into Messaging Service) are the only code-side dependencies, and both are done.
- Until the campaign is approved, **all outbound SMS from `+1 571-540-7100` to real US carriers will be filtered** by carrier A2P enforcement. This is the underlying reason every HELP / STOP / START test reply has been invisible to the user across multiple sessions.

**Original open-issue text below kept for context — superseded by the resolution above.**

**Open issue (2026-05-14, awaiting Twilio support):** Even with the HELP fix deployed and the Cloud Run IAM re-granted, end-to-end testing failed — Twilio's Programmable Messaging Logs show every inbound SMS to `+1 571-540-7100` as "Received" but with "no HTTP Requests logged for this event", for both keywords (HELP) and non-keywords (`test`). REST API confirms `sms_url` is set correctly on the phone number, no `sms_application_sid` override, and the number isn't in any Messaging Service sender pool. A successful invocation on 2026-05-12 (START keyword, `opt_in matched: 2` in function logs) proves the configuration worked at that point — something changed in Twilio's pipeline behavior for this bare 10DLC number between then and 2026-05-14 with no config changes on either side. Possibly A2P-compliance-related throttling for unregistered numbers under a pending campaign, but unverified. Support ticket pending. Example MessageSids: `SM12a764dc856eec66859321d56685d750` (HELP), `SM5b945d84b2dcb0e4b7a185284c12ebcb` (test).

**Gotcha caught during verification — deploy stripped `allUsers` invoker IAM.** When the user tested by texting HELP twice, Twilio Programmable Messaging Logs showed both inbounds as "Received" but no outgoing reply and no Cloud Function invocations. Direct `curl` against both function URLs (cloudfunctions.net and run.app) returned **HTTP 403 from Cloud Run itself** — Twilio's unauthenticated webhook calls were getting 403 before our function code ever ran, and Twilio silently dropped the webhook failures. Re-granted with `gcloud run services add-iam-policy-binding twilioinbound --region=us-central1 --project=church-inventory-9615c --member=allUsers --role=roles/run.invoker`. After re-grant, an unsigned curl now reaches the function and is correctly rejected by signature validation (visible in logs with `from: '+14122665015'`). Real Twilio webhooks (with valid X-Twilio-Signature) pass through.

This was the first 2nd-gen Functions deploy on the project that touched `twilioInbound` since 2026-05-13 (`cd049b2`). Firebase CLI 15.10 + firebase-functions 4.9 reproducibly strips the `allUsers` invoker binding on Gen-2 functions in this repo. Workaround: add a post-deploy `gcloud` step, or pin the IAM in `firebase.json`. For now, **always probe `curl ... twilioInbound` after deploying it** and re-grant if 403.

### E2E suite cleanup (final pass on 2026-05-14)

Ran the full Playwright suite after the audit work landed — 38 passed, 2 failed. Both failures turned out to be pre-existing spec bugs that had never actually run green: the test commits (`82c5d1a`, `4d42a39`) had been merged with "21/21 total" / "39 passed" notes from sessions where Vercel's bot-protection cooldown clipped setup, so these specs got committed without an end-to-end confirmation.

- **`public-board.spec.js` §9** — seeded 1 signup, then asserted `"0 / 3 spots filled"` on the public board. The `getPublicJobs` CF returns `signupCount = signups.length`, so the rendered text is `1/3`. Updated expectation to `1 / 3`.
- **`crud.spec.js` §2 (Admin can edit a job's location)** — queried `where('kind', '==', 'update_job')` and filtered `d.target`. The actual `activityLog` schema is `{ action, itemId, performedBy, performedByName, timestamp, details }` (`useFirestore.js:394`); the test had been written against a schema that doesn't exist. Fixed field names and wrapped in `expect.poll` because `logActivity` fires async after `updateJobListing` returns — the success toast can paint before the log doc lands.

Clean run: **40 passed, 1 SMS-smoke skipped, 0 failed** (~110s against prod).

### RichTextarea extracted to shared primitive

Closed the final audit follow-up. `RichTextarea` was duplicated between `TasksPage.jsx` and `MaintenancePage.jsx` — both copies converged after the P-7 toolbar-cursor and 2026-05-13 auto-grow fixes, so any further change had to be made twice. Pulled the component to `src/components/primitives/RichTextarea.jsx` (~135 lines), removed both local copies (~145 lines each), and replaced them with `import { RichTextarea } from '../../components/primitives/RichTextarea.jsx'`. The shared version keeps the optional `label` prop (TasksPage uses it; MaintenancePage doesn't) so both call patterns work unchanged. `CLAUDE.md` file-layout block updated to list the new primitive. Build clean, lint 0 errors.

---

## 2026-05-13 — Modal "one letter at a time" focus bug

User reported (Jill in FXCC, Chrome desktop): typing into the New Task modal in Tasks Hub yanked focus to the close-button "X" after every keystroke. Reproduced same-day on the reporter's own account by typing in the Description field.

**Root cause:** `Modal.jsx` (added 2026-05-12 in commit `a28e92a` "Mobile rollout-readiness batch") wired an a11y focus-management `useEffect` with `[open, onClose]` in its dependency array. Callers (every Modal call site, including `TasksPage.jsx:2090`) pass `onClose` as an inline arrow:

```jsx
<Modal open={showAdd} onClose={() => { setShowAdd(false); setTaskForm(getEmptyTask()); ... }}>
```

On every keystroke inside the modal, `setTaskForm` triggers a parent re-render → new `onClose` identity → the effect's deps see a change → cleanup + re-run. The re-run schedules `setTimeout(() => target.focus(), 0)` where `target = panelRef.current.querySelector('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')`. `querySelector` returns elements in DOM order, and the close-button "X" sits **before** any form input in the panel's DOM. So every keystroke → focus to the X → user has to click back into the field → repeat.

Typing only in the first input would have masked the bug (the `.focus()` lands on the same element if focus is already there). The reporter's "I don't have the issue" check had only typed into the Name field.

**Fix:** Pin `onClose` through a ref, drop it from the effect's dep array. Standard React idiom for "call the latest version of this callback without rebinding the effect."

```js
const onCloseRef = useRef(onClose);
useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

useEffect(() => {
  // …
  const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
  // …
}, [open]); // ← was [open, onClose]
```

Affects **every** modal in the app (New Task, edit task, bulk assign, defaults, settings, ticket detail, item detail, etc.) — anywhere users type inside a Modal. Single-component fix in the shared primitive, so all call sites are fixed at once. Build clean, lint 0 errors.

**Follow-up shipped same day** (separate concern from Jill's typing bug, but lives in the same effect block): the focus-on-open also targeted the close-button "X" for the same DOM-order reason. Split the `querySelector` into two passes — prefer `input/select/textarea/[tabindex]` first, fall back to `button` second, then the panel itself. Now opening any modal lands the cursor in the first typeable field, which is what users (and screen readers) expect.

**Third follow-up** (Enter-in-Description "doesn't work"): same modal, third invisible-feedback report. `RichTextarea` (TasksPage.jsx + MaintenancePage.jsx — duplicated, not a shared primitive yet) had `minHeight:72` / `52` and no auto-grow. Pressing Enter at end-of-content inserted `\n` correctly (state updated) but the cursor moved to an empty line just below the visible area — textarea scrolls ~2px to keep cursor in view, but with cursor on empty content there's nothing to see. User concludes Enter is broken. Confirmed empirically against prod: scrollHeight 70→82, clientHeight stays 70 → 12px overflow swallows the new line. **Fix:** `useEffect` on `value` setting `el.style.height = scrollHeight + 'px'`. After fix, clientHeight grows 70 → 80 → 100 as Enter is pressed. Applied to both copies.

---

## 2026-05-06 — Jobs Hub Pre-Rollout Audit + Blog #20 + Task Sharing Backfill

Pre-rollout audit of the Jobs Hub before opening it to real teens/parents at FXCC. 14 findings across four severity tiers; 13 actionable items shipped in three commits today, one was a non-issue.

### 🔴 Critical (4 / 4 shipped)

1. **`waitlist: []` initialized on new jobs** — `useFirestore.js:898` and `:873`. The Firestore rule on `jobListings` checks `request.resource.data.waitlist.size() == resource.data.waitlist.size() ± 1` against a missing field, so the first waitlist join on any new job was silently rejected. Both `addJobListing` and `addJobListingSeries` now write `waitlist: []` alongside `signups: []`.

2. **Public job-board signup leak fixed** — `firestore.rules:159` previously allowed unauthenticated `list` of any open `jobListing`, and the docs include `signups[]` / `waitlist[]` arrays with teen names. `PublicJobsPage.jsx` didn't render names, but raw SDK pulls did. Replaced the public-list path with a new callable Cloud Function `getPublicJobs(churchId)` that strips `signups`/`waitlist`/attendance and returns only display fields + a `signupCount` number. Rule now requires `isMember` for `list`/`get`. `PublicJobsPage` updated to call the CF instead of querying Firestore directly.

3. **Composite index for the public-board query** — `where('status','==','open') + orderBy('scheduledDate')` on a single-collection scope needed a `COLLECTION` (not `COLLECTION_GROUP`) index. Added to `firestore.indexes.json`. Note: the Firebase CLI silently no-op'd the COLLECTION-scope deploy (known quirk — it considers an existing same-fields `COLLECTION_GROUP` index to "cover" the query), so the index was created via `gcloud firestore indexes composite create` directly. Index is READY.

4. **Print Roster gated** — `JobsPage.jsx:999`. Wrapped the button in `(isAdminOrManager || rosterVisibility !== 'admin')` so non-admins can't dump teen names regardless of the church's `jobsRosterVisibility` setting.

### 🟠 High (5 / 5 shipped)

5. **Series cancellation now notifies signups.** `updateJobListingSeries` returns `{ count, affected: [{docId, signupCount}] }` so `JobsPage.handleSaveJob` can fan out per-job `sendJobCancelledEmails` calls after a cancel. The 1-hour debounce in the CF makes re-fires safe. Confirm dialog copy updated from "Signups will not be automatically notified" → "Existing signups will be emailed."

6. **`acknowledgedWaiverAt` audit trail survives waitlist promotion.** `signUpForJob` writes the timestamp onto the waitlist entry when the job requires a waiver; `promoteFromWaitlist` (CF) carries it onto the resulting signup entry.

7. **`closePastJobs` scheduled CF.** Daily 2am Central, `collectionGroup('jobListings')` where `status == 'open'` and `scheduledDate < today` → batch flip to `completed`. Without this, past-but-unfinished jobs accumulated in the Open filter forever and remained sign-up-able. Required a new `COLLECTION_GROUP` composite index on `status, scheduledDate` (also created via gcloud directly).

8. **`promoteFromWaitlist` email no longer gated on church-wide notifications toggle.** Removed the `if (!notifSnap.data()?.enabled) return ...` early-return — the promotion email is transactional ("you're now signed up"), not a marketing notification. Hub-active and per-user opt-out checks still apply.

9. **`updateJobListing` + `updateJobListingSeries` strip server-managed fields defensively.** Both now strip `waitlist`, `cancellationEmailSentAt`, `lastReminderSentDate`, `lastPosterNotifiedByActors`, and recurrence metadata. A future caller passing a stale doc as `updates` can no longer clobber dedupe stamps or recurrence config.

### 🟡 Medium (3 / 3 shipped)

10. **Waitlist hard-capped at 50 entries** — `firestore.rules:172`. Closes a denial-of-service vector (1MB doc cliff) and an unbounded-growth pattern.

11. **Capacity check before compliance** — `JobsPage.handleSignUp`. Reordered so a user trying to sign up for a full job sees "this job is full — join the waitlist?" before any compliance/waiver gate fires. Avoids the confusing "you need a Background Check" error for a job they wouldn't have fit into anyway. Also catches the new waitlist cap up front.

12. **Reports leaderboard date-scoped + pay footnote.** New scope selector (Last 30 days / Last 90 days / All time, defaults to 90 days). Filter applies cutoff against `job.scheduledDate` before aggregating. Footnote explains that Pay Earned only counts signups marked Attended, so unmarked signups read $0/— by design.

### 🟢 Low (1 / 1 shipped)

13. **Sign-up errors surface their message.** `handleSignUp`'s catch now prefixes `err.message` instead of swallowing it behind a generic "Sign-up failed."

### Non-issue

14. **`jobSwapRequests` rule** — already enforced `request.resource.data.uid == request.auth.uid` correctly. No change.

### New Cloud Functions
- **`getPublicJobs`** (onCall, no auth) — sanitized public job board read.
- **`closePastJobs`** (scheduled 2am Central) — auto-close past `open` jobs.

### Other today
- **Task sharing backfill** — 15 of Jill's ClickUp-imported tasks had `sharedWith: ['<uid>']` (flat strings) instead of `[{uid, name}]` objects, so the `TasksPage` `visibleTasks` filter silently failed and John couldn't see them. Backfilled the data shape directly in Firestore. Then John's 26 private tasks were converted to `shared` with Jill (and 4 team tasks left alone), and both users' `taskDefaultVisibility` / `taskDefaultSharedWith` were updated to share with each other on new tasks. Memory `project_churchopshub_task_import.md` updated with the shape gotcha so future imports won't reintroduce it.
- **Blog post** — "Church Workday Planning: How to Run an All-Hands Cleanup That Actually Gets Done" (`church-workday-planning`, 2026-05-05). Practical evergreen post; soft plug for Tasks Hub + Inventory Hub for recurring workday templating. Sitemap updated.

---

## 2026-04-30 — Tagline Repositioning: Operations Platform, Not Just Inventory

Product has outgrown the "inventory management" framing. Logo subtitle, browser title, SEO meta, manifest, and landing-page copy now describe ChurchOpsHub as the operations platform built for churches, with the new tagline **"Run Your Church"** under the logo.

- **`src/components/brand/Logo.jsx:28`** — `FullLogo` subtitle (most visible spot — appears in app top nav, blog header/footer, Privacy/Terms/Help, and on invite signup pages): `INVENTORY MANAGEMENT` → `RUN YOUR CHURCH`.
- **`index.html`** — browser tab title and meta description.
- **`public/manifest.json`** — PWA install prompt description.
- **`src/components/SEO.jsx`** — default title/description used wherever a page doesn't override them.
- **`src/pages/LandingPage.jsx`** — SoftwareApplication JSON-LD description, hero subhead, SEO `<title>` and `<meta description>`.
- **`src/pages/HelpPage.jsx`**, **`src/pages/BlogIndex.jsx`** — meta descriptions.

**Intentionally not changed:**
- `src/data/blogPosts.js` — every post uses "inventory management" / "asset tracking" as deliberate SEO keyword targets. Touching them loses ranking.
- LandingPage line ~201: *"The core inventory hub is free with no time limit"* — this paragraph specifically describes the FREE tier, which IS the inventory hub. Accurate as-is.
- App tab labels like "Inventory" — that tab is still the inventory tab.
- `functions/index.js` AI-vision prompt for photo descriptions — references "inventory items" appropriately for context.

---

## 2026-04-28 — twilioInbound Webhook (STOP/START Sync)

Closes the deferred follow-up from the SMS audit. When users reply STOP at the carrier level, Twilio auto-blocks further sends but our local `smsRemindersEnabled` flag stayed `true` — the Settings UI showed "enrolled" while messages silently dropped.

- **New CF: `twilioInbound`** — `functions/index.js`. HTTP webhook (`onRequest`) at `https://us-central1-church-inventory-9615c.cloudfunctions.net/twilioInbound`. Validates `X-Twilio-Signature` against `TWILIO_AUTH_TOKEN` (already in `functions/.env`); rejects unsigned requests with 403.
  - STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → set `smsRemindersEnabled = false` on every `users` doc with matching phone.
  - START / YES / UNSTOP → set `smsRemindersEnabled = true`.
  - Empty TwiML response (`<Response/>`) — carrier confirmation messages and HELP autoresponse handled by Twilio Messaging Service Advanced Opt-Out (configured in Twilio Console; see backlog memory `project_churchopshub_help_verify`).
- **New collection: `smsOptOuts`** — every STOP/START event recorded with phone, action, keyword, matched-user count, and timestamp. Retained indefinitely per Privacy §7 commitment to honor opt-out requests.
- **`firestore.rules`** — `match /smsOptOuts/{docId}`: owner-only read (`jcvaught@gmail.com`, `jvaught@fxcc.org`); no client writes (Admin SDK only via the CF).
- **Webhook URL configured in Twilio Console** (2026-04-28) → set on the bare phone number's "A message comes in" → Webhook (Phone Numbers → Manage → +1 571-540-7100 → Configure → Messaging Configuration), since `+1 571-540-7100` is not attached to either of the auto-created Messaging Services.
- **Signature validation URL hardcoding fix** (commit `b0d425d`) — first live STOP from a real phone failed validation. Cloud Functions 2nd gen runs on Cloud Run, so `req.headers.host` returned the internal `*.run.app` hostname rather than the `cloudfunctions.net` URL Twilio computed the signature against. Replaced `https://${req.headers.host}${req.originalUrl}` with the hardcoded public URL. Verified: subsequent STOP from real phone validated and produced `twilioInbound { action: 'opt_out', matched: 0, failed: 0 }`.

Initial smoke test: unsigned `curl` POST returns 403. Live test: real STOP from a phone validates and updates `users.smsRemindersEnabled` + writes audit row to `smsOptOuts`.

---

## 2026-04-28 — SMS Audit Fixes

Audit of texting code/UI surfaced six issues; fixed five (skipped international support per product decision; deferred STOP-webhook + Twilio Console HELP verification).

- **SMS body cost bug** — `functions/index.js:1130-1133`: replaced `•` and `—` with ASCII (`-`). Em-dash and bullet are outside GSM-7, forcing UCS-2 encoding which drops segment size from 160 → 70 chars. Typical reminder was billing as 2-3 segments instead of 1; now 1 segment.
- **Settings UI didn't sync after `userProfile` loaded** — `SettingsPage.jsx:55-58`: lazy `useState` initializer ran once on mount; if profile was null at that moment, the form stayed blank forever. Replaced with the in-render conditional-update pattern (tracking `prevSyncedPhone`/`prevSyncedSms`) per React docs. Also fixed: phone now displays formatted `(555) 123-4567` instead of raw `+15551234567` via new `formatPhoneDisplay()` helper.
- **Silent no-op on invalid phone** — `SettingsPage.jsx:handleSavePhone`: previously `if (!normalized) return;` with no feedback. Now sets `phoneError` state with explicit message ("Enter a valid US or Canada number..."), rendered in red below the input row; input border turns red on error; error clears on typing.
- **No "remove phone" affordance** — added explicit Remove button (only shown when `userProfile.phone` exists) that clears phone and disables SMS in one action.
- **Admin could modify another user's phone/SMS opt-in** — `firestore.rules:256-272`: admin-update branch now requires `request.resource.data.phone == resource.data.phone` and same for `smsRemindersEnabled`. TCPA: SMS opt-in must come from the user, not be set on their behalf. Self-update branch unchanged (admins can still update their own phone).
- **Help text** — added "US and Canada numbers only" to consent disclaimer.

Deployed: rules + sendJobReminders CF.

**Deferred follow-ups:**
- STOP webhook sync — when user replies STOP, Twilio auto-blocks but local `smsRemindersEnabled` stays `true` (UI shows "enrolled" while messages are silently dropped). Needs a new `twilioInbound` HTTPS function + Twilio Messaging Service webhook config.
- HELP autoresponse — Privacy/Terms promise "reply HELP". Verify configured in Twilio Console (Messaging Service → Opt-Out Management → Advanced Opt-Out Keywords) before next A2P review.

---

## 2026-04-27 — 4 New SEO Blog Posts

Added four search-targeted posts to `src/data/blogPosts.js` and registered them in `public/sitemap.xml`. Topics chosen for ranking potential on a small domain — templates and comparisons rank fastest; long-tail "[X] inventory" posts target lower-competition niches.

- **`free-church-inventory-template`** (2026-04-27) — keyword target: "church inventory template" / "free church inventory spreadsheet". Magnet post — describes columns, usage, when to outgrow.
- **`sortly-alternatives-for-churches`** (2026-04-30) — keyword target: "sortly alternatives" / "alternatives to sortly". Compares ChurchOpsHub, Asset Panda, Snipe-IT, Airtable, inFlow.
- **`church-av-equipment-inventory`** (2026-05-04) — keyword target: "church av equipment inventory" / "church audio equipment tracking". Practical system: categories, granularity rule, case-based checkout.
- **`vbs-supply-planning-checklist`** (2026-05-07) — keyword target: "vbs supply checklist" / "vbs inventory". Seasonal — published with lead time for May/June searches before VBS season.

Brings total published posts to 16. Build verified clean.

---

## 2026-04-27 — Error Handling Gap Closure

Surgical sweep to close the highest-value error-handling gaps after a three-agent audit. Verified before fixing: Sentry's default integrations already capture `window.onerror` + unhandled rejections (browser) and `process.uncaughtException` + `process.unhandledRejection` (node), so no global handler wiring needed. The real gaps were React boundary forwarding, swallowed CF error catches, server-side capture, and partial-failure UX.

- **React boundary → Sentry** — `App.jsx:29-46`: `PageErrorBoundary` gains `componentDidCatch(error, info)` that calls `Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } })`. React errors don't trigger `window.onerror`, so this was the only hole in browser-side capture.
- **Stop swallowing CF call errors** — replaced 11 `.catch(() => {})` patterns on `httpsCallable(...)` calls with logged catches that emit `console.error('[ChurchOpsHub] CF <name> failed', err)`. Sentry's `captureConsoleIntegration({ levels: ['error'] })` then forwards them. Sites: `JobsPage.jsx` (8 sites — sendJobAnnouncementEmails, sendJobCancelledEmails ×2, sendJobPosterNotification ×3, promoteFromWaitlist ×2; plus getJobSwapRequests Firestore call); `TasksPage.jsx` (sendTicketAssignedEmail, sendTaskMentionEmail).
- **Removed unused `errors` Firestore collection** — `useFirestore.js:35-44` `handleErr` no longer writes to top-level `errors`; `loadErrors` callback removed; `firestore.rules` `match /errors/{docId}` block removed; `SettingsPage.jsx` Owner-tab "Error Log" panel + state + handler removed (the panel was owner-only and the data fully duplicated Sentry, which already captures via `captureConsoleIntegration`). Drops one Firestore write per error.
- **`@sentry/node` on Cloud Functions** — `functions/package.json` adds `@sentry/node`; `functions/index.js` initializes Sentry at module load with the same DSN as the browser SDK (different SDK metadata routes them correctly), `tracesSampleRate: 0.1`, env tagged from `FUNCTIONS_EMULATOR`. 20 existing `console.error` sites now have `Sentry.captureException(err)` (or `r.reason` for `Promise.allSettled` rejection paths) appended. Default integrations include `onUncaughtExceptionIntegration` + `onUnhandledRejectionIntegration`, so any unhandled throw outside an explicit catch is also captured automatically.
- **Partial-failure UX on remaining `Promise.allSettled` sites** — `TasksPage.jsx`: `handleDeleteTask` now reports subtask + dependent-task cleanup failure counts (`'Task deleted. Cleanup of N dependent tasks failed — refresh to verify.'`); `handleBulkStatusChange` now reports recurring-next-task creation failures separately from the primary-status-change failure count.
- **Per-file photo upload errors** — `uploadPhotos` in `TasksPage.jsx` and `MaintenancePage.jsx` no longer aborts on the first per-file failure. Returns `{ urls, failed }` instead of `urls[]`; per-file failures `console.error` (so Sentry captures them with file name); callers flash partial-success messages (`'Uploaded X of Y photos; Z failed.'`). Three caller updates per page (handleAddTask/handleAddTicket + handleDetailPhotoAdd).
- **Stripe error UX** — `UpgradeGate.jsx` and `SettingsPage.jsx` (checkout + portal): error toasts now append `'If this keeps happening, contact jcvaught@gmail.com.'` so users have a recovery path instead of a dead-end generic message.

---

## 2026-04-27 — Tasks + Jobs Hub Bug Sweep #4

Nine bugs surfaced by a parallel three-agent sweep; verified against current code (several agent claims dropped as incorrect — login `uid` already set, waitlist auto-promotion already wired, ICS UID stability is correct per RFC 5545, `generateRecurringTemplateTasks` already idempotent).

- **Missing composite index for recurring-series queries** — `firestore.indexes.json` gains `(recurrenceGroupId ASC, scheduledDate ASC)` on `jobListings` (COLLECTION scope). `updateJobListingSeries` and `deleteJobListingSeriesFrom` would have failed in production with "index required".
- **Welcome email duplicate-send race** — `functions/index.js` `sendWelcomeEmail` now writes a `welcomeEmailSentAt: 'sending'` sentinel *before* `sgMail.send()`; the existing line-381 idempotency guard now short-circuits any CF retry between send-success and timestamp-update.
- **Compliance gate only checked first linked accessPerson** — `JobsPage.jsx` `handleSignUp` now uses `filter()` to evaluate every accessPerson linked to the user (rare but possible from data migration); records are unioned across all linked persons before the requiredAccessTypes check.
- **`promoteFromWaitlist` bypassed compliance + status checks** — CF now (a) refuses to promote into a non-`open` job (cancelled/closed) and (b) re-validates each waitlisted user's current `accessRecords` against the job's `requiredAccessTypes`. Ineligible users are *skipped* (left on waitlist) and the next eligible user is promoted instead. Pre-fetches accessPeople + accessRecords once outside the transaction.
- **Task detail modal stayed open with stale data on remote delete** — `TasksPage.jsx` `onSnapshot` now closes the modal and flashes "This task was deleted by another user" when the task disappears (previously it returned early and left the user looking at stale data, with saves potentially applying to the wrong doc).
- **Kanban reorder silently dropped failed writes** — `handleReorder` now counts `Promise.allSettled` rejections and flashes "Failed to reorder X of Y tasks — refresh to see correct order" on partial failure, matching the bulk-action partial-failure pattern from the 2026-04-25 audit fixes.
- **Cross-hub convert (→ Job and → Ticket) lacked rollback on backref failure** — `handleConvertToJob` and `handleCreateTicket` now wrap the second `updateTask` call in a try/catch; if the backref write fails, the just-created peer doc is deleted to avoid an orphan. If even cleanup fails, the toast names the orphan docId for manual cleanup.
- **Orphaned `linked*DocId` backrefs when peer deleted** — `deleteTask`, `deleteJobListing`, and `deleteTicket` in `useFirestore.js` now clear the reciprocal backref on the peer doc as a fire-and-forget step. `deleteTicket` and `deleteJobListing` fetch the doc first to discover the backref; `deleteTask` reads it from the passed `task` arg. UI no longer shows dead "Linked" chips after a peer is removed.

---

## 2026-04-26 — Walkthrough Bug Fixes (commits e59c275, f72a4fe)

**Phase 1 — Critical bugs**

- `src/useAuth.js` — all 6 `setUserProfile` calls now include `uid` alias alongside `id`; fixes 7 downstream broken features: Settings SMS/delegate save, My Compliance card display, PeopleAccess `createdBy`/`recordedBy`, App.jsx auto-link
- `src/pages/SuppliesPage.jsx` — removed undeclared `setPhotoFile(null)` call in Add Supply modal `onClose` (crashed on close)
- `src/pages/hubs/MaintenancePage.jsx` — added `config` to store destructure; fixes `config is not defined` crash when saving a ticket with a new assignee
- `src/pages/hubs/PeopleAccessPage.jsx` — added `open` prop to all 6 `<Modal>` instances; the entire People Access Hub was silently read-only
- `src/pages/hubs/JobsPage.jsx` — `handleSignUp` gating: `p.linkedUserId` → `p.userId`, `r.expiresAt` → `r.expiryDate`; access-gated sign-ups were always rejected even for qualified members
- `src/components/primitives/UpgradeGate.jsx` — replaced `mailto:` buttons with real Stripe `createCheckoutSession` checkout; updated copy from "30-day trial" to "Cancel anytime in Settings"

**Phase 2 — High-value medium issues**

- `src/pages/ReservationsPage.jsx` — replaced local `generateRecurrenceDates` with shared util from `date.js`; fixes `setMonth` month-end rollover bug (Jan 31 + monthly was → Mar 3 instead of Feb 28)
- `src/pages/hubs/AccountabilityPage.jsx` — audit progress now persisted to localStorage (keyed by `churchId`); refreshing mid-audit no longer loses work
- `src/pages/HubsPage.jsx` + `src/App.jsx` — hub card grid fades while subscription loads to prevent active→inactive flicker on hard refresh
- `src/utils/ical.js` — DTEND now bumps to next day when job end hour wraps past midnight (23:00 job no longer creates negative-duration events)
- `src/pages/ItemsPage.jsx` — Add Item modal stays open with error on photo upload failure instead of silently saving without photo; "In Use" removed from status filter (never set by UI)
- `src/pages/hubs/JobsPage.jsx` / `src/App.jsx` / `src/pages/PublicJobsPage.jsx` — Share Board URL now includes `&cc=CHURCH_CODE`; public Sign Up button pre-fills church code in registration form
- `src/pages/hubs/MaintenancePage.jsx` — added `recurringChildCreatedAt` guard to prevent duplicate recurring child tickets when drag+modal-save race occurs
- `src/App.jsx` — store error toast auto-dismiss bumped from 5s to 10s
- `firestore.rules` — waitlist updates now enforce ±1 size constraint server-side (previously client-only); deployed 2026-04-26

---

## 2026-04-26 — Twilio SMS Reminders + Legal Pages (commits b1409d9, 6b9bd6e, 1f7104e, 9a9b372)

**FB-03: SMS job reminders (Jobs Hub only)**

- `functions/index.js` — `twilio` npm package added; `getTwilioClient()` + `TWILIO_FROM` helpers added; `sendJobReminders` CF extended with SMS sweep after the email sweep: iterates the same user set, skips users without `phone`/`smsRemindersEnabled`, sends one SMS per opted-in user via `twilio.messages.create`; uses `Promise.allSettled` (non-blocking alongside email); SMS body includes job title/time/location + "Reply STOP to opt out"
- `src/pages/SettingsPage.jsx` — My Profile card gains SMS opt-in section (gated on `userHasJobsAccess`): phone number input, "Enable SMS reminders" checkbox (disabled until phone entered), Save button with "Saved!" flash, TCPA consent disclosure; `normalizePhone()` normalizes to E.164 on save; `phoneInput`/`smsEnabled`/`savingPhone`/`phoneSaved` state; `handleSavePhone()` saves `phone` + `smsRemindersEnabled` to `users/{uid}` via `updateUser`; clears `smsRemindersEnabled` if phone is cleared
- `functions/.env` — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` added (gitignored)

**Privacy + Terms standalone pages**

- `src/pages/PrivacyPage.jsx` (new) — Full privacy policy at `?privacy`; includes SMS section 6 with explicit no-share clause ("No mobile information will be shared with third parties for marketing"), BOLD STOP/HELP, sending number, opt-out retention note; correct `<h2>` heading hierarchy; `window.history.back()` nav
- `src/pages/TermsPage.jsx` (new) — Full ToS at `?terms`; Section 7 SMS Communications has all Twilio A2P required fields: program name, description, sending number (+1 571-540-7100), frequency (1–5/week), rates disclosure, BOLD HELP/STOP, support contact; Section 7 added to survival clause; `window.history.back()` nav
- `src/App.jsx` — `?privacy` and `?terms` routes added; `PrivacyPage`/`TermsPage` imported; existing auth-modal privacy section updated with Twilio SMS entry
- `public/sitemap.xml` — `?privacy` and `?terms` added
- Twilio A2P 10DLC registration in progress: TrustHub Business Profile approved 2026-04-27 ✓ (Bundle SID BU99f73c04fee0f43472f86f6bdd2a77fb); Brand registered 2026-04-26 ✓; Campaign submitted 2026-04-27 (Low Volume Mixed use case) — pending Twilio review (~1-3 days); Phone Number registration to follow once Campaign approved; sending number +1 571-540-7100. Twilio.org Impact Access program **approved** 2026-04-27 — $100 nonprofit credit + discounted pricing applied to the Fairfax Church of Christ account

---

## 2026-04-25 — Notable Gaps Polish (commit ad5e5a2)

4 items from the post-audit "notable gaps" list.

- **Task photo lightbox** — `PhotoGrid` gains a full-screen lightbox overlay; click any thumbnail to open; prev/next arrows, photo counter, Escape/arrow-key navigation; `cursor:zoom-in` on thumbnails; self-contained in `PhotoGrid` component (no TasksPage state added)
- **Job Hub delegate discoverability** — `📧 Delegates` button added to Job Board toolbar (admin/manager); opens a modal with the same chip-toggle UI from Settings → Profile, so admins can manage notification delegates without leaving the hub; `updateUser` added to JobsPage store destructure; `adminManagerUsers` memo + `handleSaveDelegates` added
- **Notes vs description clarity** — Placeholder text updated in both Add Task and Detail modals: description = "What needs to be done — scope, context, and acceptance criteria"; notes = "Follow-up reminders, reference links, or working notes"
- **Recurring announcements** — `repeatWeekly` boolean field added to announcement schema; form gains "Repeat weekly" checkbox that auto-fills `expiresAt` to 7 days from today when checked; `generateRecurringTemplateTasks` CF now sweeps `jobAnnouncements` collection group daily and advances `expiresAt` +7 days for expired `repeatWeekly` announcements; `firestore.indexes.json` updated with `jobAnnouncements/repeatWeekly` collection-group field override; functions + indexes deployed

---

## 2026-04-25 — Tier 3 Features (Session 5)

6 Tier 3 features: iCal export, cross-hub converts, compliance gate, swap requests, and public job board.

- **FB-02** `src/utils/ical.js` (new) + `TasksPage` + `JobsPage` — iCal / Google Calendar export: new `ical.js` utility with `exportTasksICS` and `exportJobsICS`; "Export ICS" button in Tasks toolbar (exports tasks with due dates) and Schedule toolbar in Jobs; `.ics` download via Blob; all-day events use `DTSTART;VALUE=DATE` with DTEND = day+1 per iCal spec; timed events parse "2:00 PM" style strings to `YYYYMMDDTHHMMSS`
- **FB-21** `TasksPage` + `JobsPage` + `useFirestore` — Cross-hub convert (job ↔ task): "→ Job" button in task detail modal (admin/manager) opens a mini-modal with title/date/location/spots; creates job via `addJobListing` then writes `linkedJobDocId` backref on task; "→ Task" button in job detail modal opens a mini-modal with name/due date/description; creates task via `addTask` then writes `linkedTaskDocId` backref on job; linked chips render in both detail modals; buttons hidden once linked
- **FB-23** `TasksPage` + `useFirestore` — Auto-create maintenance ticket from task: "→ Ticket" button in task detail (admin/manager); confirmation modal; creates ticket via `addTicket` then writes `linkedTicketDocId` backref on task; ticket title/description pre-seeded from task; button hidden once linked
- **FB-24** `JobsPage` + `useFirestore` — People Access compliance gate on job signup: admin can set `requiredAccessTypes[]` (background_check, key_assignment, certification, custom) checkboxes on each job form; before `signUpForJob`, client checks if user has a People Access person linked to their account and a valid (non-expired) record of each required type; blocks signup with a descriptive error message if not
- **FB-13** `JobsPage` + `useFirestore` + `firestore.rules` — Job swap/replacement requests: signed-up members see "Request Swap" button in job detail → opens modal with optional note → writes to new `jobSwapRequests` subcollection; admin sees swap requests section in job detail modal with per-entry dismiss; new Firestore rules for `jobSwapRequests` (member create-own, admin/manager read+delete); `getJobSwapRequests`, `addJobSwapRequest`, `deleteJobSwapRequest` added to `useFirestore.js`; swap requests auto-load when admin opens job detail
- **FB-01** `src/pages/PublicJobsPage.jsx` (new) + `App.jsx` + `firestore.rules` — Public job board for non-members: new `?jobs=CHURCH_ID&cn=ChurchName` route renders `PublicJobsPage` (unauthenticated); shows open job cards with title/description/date/location/pay/spots bar; roster names hidden; Sign Up buttons call `onGetStarted('register')`; CTA block at bottom; admin "Share Board" button in Job Board toolbar copies the URL to clipboard; `jobListings` Firestore rule updated to `allow read: if request.auth == null || isMember(churchId)`; rules deployed

---

## 2026-04-25 — Tier 2 Tasks Features (Session 4)

6 features from the Tasks session (FB-06, FB-08, FB-10, FB-14, FB-17, FB-25). Commit `5648b45`.

- **FB-06** `TasksPage` + `useFirestore` + `functions/index.js` — @-mentions in task comments: `@ Mention` button in comment input opens a dropdown of hub users; selecting a user appends `@Name` to the comment text; `@Name` substrings are highlighted teal when rendering comment text; `mentions: [uid]` array stored on comment doc; new `sendTaskMentionEmail` onCall CF sends a SendGrid notification to each mentioned user (respects `notifEnabled` + `subHasHub`)
- **FB-08** `TasksPage` + `csv.js` — Time tracking: `estimatedHours` and `actualHours` number fields on tasks; shown in TaskCard as `⏱ actual/estimate h`; inputs in Add Task (estimate only) and Detail modals; included in CSV export
- **FB-10** `TasksPage` — Manual Kanban reorder: cards in each column are now card-level drop targets; dropping a card onto another card in the same column writes ascending `sortOrder` to all tasks in that column; `sortOrder` takes precedence over the High-priority pin (which applies only to tasks without a `sortOrder`)
- **FB-14** `TasksPage` + `functions/index.js` — Recurring template auto-generation: Save-as-Template replaces the `window.prompt` with a proper modal including name, `autoGenerate` checkbox, frequency, and first-generate-on date; new `generateRecurringTemplateTasks` scheduled CF (8am Central daily) queries `taskTemplates` with `autoGenerate == true`, creates tasks via Admin SDK transaction, and advances `autoGenerateNextAt`
- **FB-17** `TasksPage` — Task velocity Insights view: "Insights" tab (admin/manager only) shows a 12-week `BarChart` of tasks created vs. completed per week (Recharts) and 4 summary stat cards including a 90-day average velocity
- **FB-25** `TasksPage` + `csv.js` — Ministry-scoped tasks: optional `ministry` field on tasks (populated from `settings.ministries`); indigo badge on TaskCard; ministry filter dropdown in the filter bar (persisted in saved views); ministry dropdown in Add Task and Detail modals; included in CSV export

---

## 2026-04-25 — Tier 2 Jobs Features (Session 3)

5 features from the Jobs session (FB-04, FB-11, FB-15, FB-16, FB-20). FB-13 (job swap) deferred to Tier 3.

- **FB-04** `JobsPage` + `useFirestore` + `functions/index.js` + `firestore.rules` — Waitlist when full: jobs add a `waitlist: [{uid, name, addedAt}]` array; "Join Waitlist" button when spots are full; "Leave Waitlist" / waitlist position for members; admin sees waitlist count on cards and a numbered waitlist section in the detail modal with per-entry removal; `withdrawFromJob` now handles both signups and waitlist entries; auto-promotion on withdrawal/admin-removal via new `promoteFromWaitlist` CF (atomic transaction + SendGrid email to promoted user); Firestore rule updated to allow member `waitlist`+`updatedAt` writes on open jobs
- **FB-11** `JobsPage` — Inline edit from Schedule: desktop Schedule table gets an "Edit" column with a per-row Edit button (admin/manager only); clicking it opens the Edit Job modal directly, bypassing the detail modal
- **FB-15** `JobsPage` — Volunteer Reports tab (admin/manager only): leaderboard table shows each volunteer's jobs signed up, attended count, no-show count, and total pay earned; derived from `jobListings` subscription in real time via `useMemo`
- **FB-16** `JobsPage` + `useFirestore` — Attendance tracking: admin/manager can mark each signup as attended or no-show after the job date passes; toggles appear in the detail modal's signup list for past jobs; stored as `signups[].attended: bool`; attendance summary shown in Reports leaderboard
- **FB-20** `JobsPage` — Per-job waiver/consent: optional `requiresWaiver` checkbox + `waiverText` field on job form; waiver text shown in job detail modal before signup; `window.confirm` gate before calling `signUpForJob`; `acknowledgedWaiverAt` timestamp stored per signup; admin sees 📋✓ / 📋? badge per signup in the detail modal

---

## 2026-04-25 — Tier 1 Quick-Win Features (Session 2)

7 features from the Opus feature suggestions (FB-05, FB-07, FB-09, FB-12, FB-18, FB-19, FB-22).

- **FB-05** `JobsPage` + `functions/index.js` — Per-job lead override: new `jobLead: { uid, name }` field on jobs; select in job form; displayed in job detail modal metadata; `sendJobPosterNotification` notifies job lead in addition to poster + delegates, with email deduplication via `Set` to prevent duplicate sends when lead = delegate
- **FB-07** `TasksPage` — Quick-add in Kanban: each column gets an inline text input at the bottom; pressing Enter or clicking `+` creates a task in that column with Medium priority and the user's default visibility, without opening the full Add modal
- **FB-09** `TasksPage` — Saved filter views: `taskSavedFilters` array stored on `users/{uid}`; Save View button appears alongside Clear when any filter is active; loads live from the `users` subscription; chip row below the filter bar lets users one-click reload or delete named views
- **FB-12** `TasksPage` — Bulk task assignment: assignee dropdown + Assign button in the bulk action bar; uses `Promise.allSettled` matching the existing bulk status pattern; skips tasks already assigned to the chosen user
- **FB-18** `ActivityLogPage` — Hub filter: new `ACTION_HUB` constant maps all action strings to hub names; Hub select (All / Inventory / Supplies / Jobs / Tasks / Maintenance) added as the first filter column; grid expanded from 3 to 4 columns
- **FB-19** `print.js` + `JobsPage` — Print-friendly roster: `printJobRoster(jobs, churchName)` function opens a styled HTML print window with a table of jobs and their signups; Print Roster button in Schedule tab toolbar alongside Show/Hide Past Jobs
- **FB-22** `TasksPage` — Link task to item/ticket: `linkedItemDocId` and `linkedTicketDocId` fields on task documents; two selects (Link to Item / Link to Ticket) in both the Add Task and Task Detail modals; flows through `taskToEdits` + dirty-state tracking; inventory items and open maintenance tickets from the store are used to populate the selects

---

## 2026-04-25 — Workflow Audit Bug Fixes (Session 1 / Tier 0)

All 11 non-deferred findings from the 2026-04-25 full 35-workflow audit. See `docs/AUDIT-TASKS-JOBS-2026-04-25.md` for full details.

- **F-01** `TasksPage` — `createNextRecurringTask`: roll back `nextRecurrenceCreatedAt` marker if `addTask` fails, so user can retry by re-completing the task
- **F-02** `TasksPage` — Bulk status change: `Promise.all` → `Promise.allSettled` with partial-failure reporting ("X of Y tasks updated; Z failed")
- **F-03** `TasksPage` — Bulk delete: same `Promise.allSettled` + partial-failure reporting
- **F-04** `functions/index.js` — `sendJobReminders`: added per-church `notifEnabled` check (was missing; tasks reminders already had this)
- **F-05** `functions/index.js` — `sendJobPosterNotification`: added `subHasHub(sub, 'jobs')` check alongside existing `notifEnabled` check
- **F-06** `JobsPage` — Removed `'completed'` from `terminalStatuses`; marking a job Completed no longer triggers a "Job Cancelled" email to signups
- **F-07** `functions/index.js` — `sendJobReminders`: now stamps `lastReminderSentDate` only on jobs where at least one email succeeded (mirrors `sendTaskDueReminders` pattern)
- **F-08** `functions/index.js` — `sendJobAnnouncementEmails`: added `notifEnabled` server-side check (client-only guard was bypassable)
- **F-09** `TasksPage` — `handleDeleteTask`: after deleting a task, queries for tasks that had it in `blockedBy` and removes the stale reference via `arrayRemove`
- **F-11** `useFirestore` — `addTask` / `updateTask`: private and shared task names no longer written to activity log `details.name` (activity log is readable by all members)
- **F-12** `useFirestore` + `JobsPage` — `deleteJobListing`: logs `JOB-###` (human-readable jobNumber) instead of an opaque Firestore docId

---

## Completed Phases

### ✅ Phases 1–3

- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub (rebuilt): kanban + list views, 6-status workflow (Backlog→Complete), drag-and-drop between kanban columns (admin/manager, native HTML5), multi-assignee, tag autocomplete (`maintenanceTags` via `arrayUnion`), photo uploads (Firebase Storage at `churches/{churchId}/maintenance/{docId}/`), real-time comment threads (subcollection), vendor directory, overdue date highlighting, `maint_viewMode` persisted to localStorage
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel (tabbed: Suggestions / Error Log) gated by `['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(email)` in UI and by `request.auth.token.email in [...]` in Firestore rules; Error Log loads from top-level `errors` collection written by `handleErr()` in `useFirestore`

### ✅ Phase 4 — Insights Hub

- `InsightsPage.jsx`: 5 sections — Item Utilization, Ministry Breakdown, Seasonal Trends, Financial & Depreciation, Supply Burn Rate
- Recharts (BarChart, AreaChart, PieChart) for all visualizations
- Financial fields on items: `purchaseDate`, `purchasePrice`, `warrantyExpiry`, `estimatedValue` (collapsible in Add/Edit modals; shown in Detail modal)
- Straight-line depreciation over 5 years; manual override option; warranty expiry alerts (90-day window)

### ✅ Phase 5 — Team Hub

- User count display in Team Members header (e.g. "8 / 10 members"); upgrade banner for admins at/over the free plan 10-user cap
- Three roles: `admin` (full system access), `manager` (full operational access scoped to `managedMinistries[]`), `user` (day-to-day use only); distinct badge colors
- Edit Access modal in Settings > Team Members: role selector (Admin/Manager/User), hub checkboxes (church-active hubs only), managed ministries multi-select (manager only)
- `userCanSeeHub(hubName)` in `App.jsx`: admins see all; manager/user sees intersection of church `hubs[]` and `allowedHubs[]`; `allowedHubs: null` = inherit all (backward compat)
- Hub tabs hidden (not locked) when user's `allowedHubs` excludes them; Firestore rules unchanged

### ✅ Phase 6 — Coordination Hub

- `CoordinationPage.jsx`: checkout bundles (create/edit/delete, per-item availability indicator, bulk checkout skips unavailable items); EmailJS notification settings (Service ID, Public Key, template IDs for approved/denied, test-send button)
- `ReservationsPage.jsx`: recurring reservations (weekly/biweekly/monthly + end date, live instance count preview, `recurrenceGroupId` links series); recurring badge on cards; auto-email requester on approve/deny if EmailJS configured
- `useFirestore`: `bundles` collection subscription + CRUD; `config/notifications` subscription + `updateNotificationConfig`; `totalSubs` 9→11
- `@emailjs/browser` installed; email sent client-side via dynamic import on approve/deny actions

### ✅ Phase 7 — Accountability Hub

- `AccountabilityPage.jsx`: physical audit mode (select location → walk-through items, mark Present/Issue/Missing), audit history list with discrepancy reports, chain of custody timeline (per item, from activityLog), insurance-ready CSV export (all active items + financial fields)
- `useFirestore`: `audits` collection subscription + `addAudit` + `updateAudit`; `totalSubs` 11→12
- Feature gated via `hasHub('accountability')` + `UpgradeGate`; `📋 Audit` on mobile nav

### ✅ Phase 8 — Stripe Integration

- `functions/index.js`: three Cloud Functions — `createCheckoutSession`, `createPortalSession`, `stripeWebhook`
- `functions/package.json`: Node 22, firebase-functions v4, firebase-admin v12, stripe v14
- `firebase.json` updated with `functions` source config (`nodejs22`)
- `firebase.js` exports `app` for `getFunctions(app)` calls
- `SettingsPage.jsx`: Upgrade modal with All-In bundle, individual hubs, and team plans; "Manage Billing" button opens Stripe portal; team member cap banner opens Stripe checkout
- Webhook handles: `checkout.session.completed` (unlock hub/plan), `customer.subscription.updated` (sync status), `customer.subscription.deleted` (downgrade)
- Secrets stored in Google Secret Manager: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Price IDs hardcoded in `functions/index.js` `PRICE_IDS` (live Stripe prices)
- Webhook endpoint registered in Stripe: `https://stripewebhook-zzlqdukuqq-uc.a.run.app`
- Stripe billing portal configured at dashboard.stripe.com/settings/billing/portal

### ✅ Phase 9 — UX Polish & AI Features (2026-03-15)

- **All-In Bundle** ($29/mo) confirmed complete: price ID wired in `PRICE_IDS`, webhook handles `all_in` type (unlocks all hubs + unlimited users), upgrade modal in SettingsPage, plan label shows "All-In"
- **Barcode/QR scanning**: `📷 Scan` button in AppShell top nav (all tabs); `BarcodeScanner` component in `src/components/primitives/`; `@zxing/browser` dynamically imported; tries `facingMode: environment` first, falls back to any camera; parses QR URL `?item=` param or raw text as itemId; navigates to inventory tab + opens item detail; "No item found" flash if ID doesn't match
- **Bulk item actions**: `☑ Select` button in ItemsPage toolbar enters bulk mode; checkboxes on item cards; select-all toggle in navy action bar; bulk checkout (skips non-Available with warning), bulk return (single condition prompt, skips non-returnable with warning), bulk location change, bulk CSV export; `exitBulkMode` resets selection
- **AI item identification**: `✨ Identify Item` button appears in Add Item modal after photo selected; converts `photoFile` to base64 via `FileReader`; calls `identifyItem` Cloud Function (Claude Haiku 4.5 vision, max 100 tokens); pre-fills `itemForm.description`; `ANTHROPIC_API_KEY` stored in Google Secret Manager; `@anthropic-ai/sdk` added to `functions/package.json`

### ✅ Phase 10 — UX Polish: Duplication, Shortcuts, Public Requests (2026-03-15)

- **Item duplication**: `⊕ Duplicate` button in detail modal and desktop item rows (admin/manager); opens Add Item pre-filled with all fields, ID cleared for new unique assignment
- **Keyboard shortcuts**: `N` = new item, `/` = focus search, `Esc` = close modal; global `keydown` listener on `document`; suppressed in input/textarea/select; `N` only fires when no modal is open and user is admin/manager
- **Public item request form**: `PublicRequestPage.jsx` — no-auth public form shown when `?request=CHURCH_ID&cn=Church+Name` URL params present; fields: name, email, phone, item description, quantity, date needed, urgency, notes; honeypot spam protection (`website` hidden input); writes to `churches/{churchId}/publicRequests`; Firestore rule allows unauthenticated creates; admins see pending requests panel in ItemsPage with Dismiss button; "📥 Copy Request Form Link" in Settings > Team Members; `totalSubs` 12→13

### ✅ Phase 11 — Maintenance UX Improvements (2026-03-16)

- **Kanban drag-and-drop**: Cards draggable between columns (admin/manager only); native HTML5 drag-and-drop, no library; drop target highlights teal on hover; updates ticket `status` in Firestore on drop; correctly sets/clears `completedAt` when moving to/from Complete
- **Stat bar compact layout**: Summary stats replaced with compact inline strip (smaller padding, `fontSize:20` vs `fontSize:30`); "Backlog" renamed to "Open" and now counts all non-Complete/non-Cancelled tickets so Planning and On Hold are included
- **Modal close on save**: Ticket detail modal now closes after Save Changes (was staying open)
- **Ticket card redesign**: Removed ticket number from card header; assignee initials (teal circles, 2-char) now shown at top-left of each card; "Unassigned" shown in gray when no assignees; photo/due-date row kept at bottom
- **"My tickets" empty state**: When filter is active but user has no assigned tickets, shows a helpful card explaining how to self-assign with a "Show all tickets" button to clear the filter
- **RichTextarea component**: Toolbar with `• List` and `1. List` buttons added above Description, Notes, and Comments fields; toggles bullet/numbered prefixes on selected lines; stores plain text with `• ` / `1. ` prefixes; comment display uses `white-space: pre-wrap`; comment input changed from single-line `<input>` to `<textarea>` (Enter posts, Shift+Enter = newline)

### ✅ Phase 12 — Help Center & User-Facing Documentation (2026-03-16)

- **`HelpPage.jsx`**: Full user-facing help page with 12 sections — Getting Started, Inventory, Supplies, Reservations, Activity Log, Maintenance Hub, Insights Hub, Coordination Hub, Accountability Hub, Team Hub, Settings & Billing, FAQ
- **Accordion UI**: Collapsible sections (first item open by default); role badges (`admin`/`manager`/`user`), hub badges, Tip/Note callout blocks, keyboard shortcut formatting
- **Responsive layout**: Sticky sidebar on desktop with active-section highlighting via `IntersectionObserver`; horizontal scrollable section tab bar on mobile
- **Routing**: Accessible via `?help` URL param (same pattern as `?request=`); `← Back to App` button calls `window.history.back()`
- **Entry points**: "Help" link in LandingPage nav (desktop only); "Help Center" link in in-app footer; "Help Center" card in Settings page (above Danger Zone)
- **Support email**: All user-facing `jcvaught@gmail.com` references replaced with `churchopshub@gmail.com` across LandingPage, SettingsPage, UpgradeGate, and App.jsx (ToS + Privacy Policy contact sections); `isOwner` access control check left unchanged
- **Registration UX**: Split "Your Name" field into separate First Name + Last Name fields on all registration forms (register, createChurch); `useAuth` stores `firstName`, `lastName`, and `name` on user profiles; `registerWithGoogle` splits `displayName` on first space; backward-compatible (`name` field still used everywhere for display)
- **Two-character initials**: `initials(name)` helper in MaintenancePage derives two-char initials (e.g. "JS" for John Smith); assignee avatar circle size increased 22→26px with `title` tooltip; SettingsPage team member avatars updated with same logic

### ✅ Phase 13 — Maintenance Hub Enhancements (2026-03-16)

- **Checklist sub-tasks**: `checklist: [{id, text, done}]` field on tickets; add/remove/toggle items in ticket detail modal (Enter to add); checklist progress badge `✓ X/Y` shown on ticket cards; checklist items reset to `done: false` when a recurring ticket auto-creates; checklist persists immediately on toggle (auto-save) and on Save Changes for add/remove
- **Recurring tickets**: `recurrence` field (`weekly` | `biweekly` | `monthly` | `quarterly` | `annually` | null); dropdown in Add and Detail modals; completing a recurring ticket auto-creates the next ticket with `calculateNextDue()` (adds interval to `dueDate` or today); new ticket inherits all fields with checklist reset; `🔁 Label` badge shown on cards; `RECURRENCE_OPTIONS` + `RECURRENCE_LABELS` constants at top of file
- **Sort options**: `sortBy` state (`createdDesc` | `createdAsc` | `priority` | `dueDate`) + dropdown in View Toggle row; `sortedTickets` useMemo applied after `filteredTickets`; used in both kanban (within-column) and list (within-group) views; default is `createdDesc` (matches Firestore order)
- **Email assignee on assignment**: when saving a ticket, detects newly added assignees (excludes self); sends EmailJS notification if `notificationConfig.enabled && templateAssigned` is set; template variables: `to_email`, `to_name`, `ticket_name`, `ticket_number`, `priority`, `due_date`, `assigned_by`; new **Template ID — Ticket Assigned (Maintenance)** field added to Coordination → Notification Settings (`templateAssigned` key in `config/notifications` doc)

### ✅ Phase 14 — UI Polish (2026-03-16)

- **Input focus indicator**: single global CSS rule in `index.html` adds teal border + subtle glow (`box-shadow: 0 0 0 3px rgba(42,125,110,0.12)`) on focus for all inputs, selects, and textareas; overrides inline `outline:none` from `inp` token without touching each component
- **Checklist auto-save**: checkbox toggles in the ticket detail modal now immediately persist to Firestore via `updateTicket` (optimistic — local state updated first, Firestore write fires async); previously required clicking Save Changes
- **Checklist empty state**: checklist area in detail modal wrapped in a dashed border box (`border: 1px dashed B.sand, borderRadius:10, padding:12px 14px`) for visual containment rather than bare floating text
- **Sort control relocated**: Sort dropdown moved from filter bar to the View Toggle row (next to Kanban/List toggle) with a "Sort:" label; filter bar reduced from 5 to 4 controls; ticket count pushed to `marginLeft:auto` on the right
- **Responsive Add Ticket grid**: Priority / Due Date / Recurrence row switches from `1fr 1fr 1fr` to `1fr 1fr` on mobile with Recurrence wrapped in `gridColumn:'1/-1'` div to span full width; prevents field crushing on phones
- **Recurrence + Due Date paired**: detail modal Due Date / Actual Cost row expanded to 3-col grid (Due Date | Actual Cost | Recurrence) on desktop, 2-col on mobile; standalone Recurrence FF below Notes removed
- **Badge sizes**: recurrence (`🔁`) and checklist progress (`✓ X/Y`) badges on ticket cards bumped from `fontSize:10` to `fontSize:12`
- **Opacity consistency**: login button disabled opacity corrected from `.6` to `.5` (matches all other buttons in the app)

### ✅ Phase 15 — Security, Performance & Code Quality Audit (2026-03-16)

- **`identifyItem` churchId validation**: after auth check, verifies caller has a Firestore user profile with a `churchId` — prevents unauthorized AI API credit usage
- **Firestore rules — church doc reads**: split `allow read` into `allow get` (creator/member only) + `allow list` (any authenticated user, for join-by-code query); narrows direct document reads
- **Storage rules — active check**: `allow write` now also requires `userProfile().active == true` via a Firestore helper function; deactivated users can no longer upload photos
- **Stripe webhook — church existence check**: `checkout.session.completed` handler verifies the church doc exists before writing subscription data; logs warning and returns 200 on missing church
- **Owner email sync comments**: `OWNER_EMAILS` constant in `functions/index.js` now has comments pointing to the other two hardcoded locations (`firestore.rules`, `SettingsPage.jsx`)
- **`console.error` → `handleErr`**: `logActivity()` and `addMaintenanceTags()` now use the shared `handleErr()` helper (Sentry + error collection write + toast); `loadErrors()` keeps `console.error` + `setError` to avoid a write-loop
- **Bulk action confirmations**: `window.confirm()` dialogs added before `handleBulkCheckout`, `handleBulkReturn`, and `handleBulkLocation` execute Firestore writes
- **Activity log date validation**: `dateTo` onChange handler now clears the field (rather than silently accepting) if the selected date is before `dateFrom`
- **`useMemo` for ReservationsPage**: `activeItems` and `filtered` lists wrapped in `useMemo` with proper dependency arrays
- **Date comparison — Date objects**: `form.returnDate < form.eventDate` changed to `new Date(form.returnDate) < new Date(form.eventDate)` for explicit date comparison
- **Disabled button opacity standardized**: ActivityLogPage pagination buttons changed from `.4` to `.5` to match all other disabled buttons in the app
- **ARIA labels on icon-only buttons**: `aria-label` added to `📷 Scan` (App.jsx), `⬇ Export CSV` (ItemsPage, SuppliesPage, ReservationsPage), `☑ Select` (ItemsPage), `⊕ Dup/Duplicate` (ItemsPage), `⬇ Export` (bulk bar)
- **Status constants**: `src/utils/constants.js` created with `ITEM_STATUS`, `RES_STATUS`, `TICKET_STATUS` string enums; Dashboard, ItemsPage, ReservationsPage, and App.jsx updated to import and use them
- **`today` hoisted out of map**: `new Date().toISOString().split("T")[0]` computed once per render in ReservationsPage (above the JSX), not inside each `.map()` iteration

### ✅ Phase 16 — Full App Code Review & Bug Sweep (2026-03-17)

Systematic walkthrough of every page looking for logic bugs, missing guards, and UX gaps before tester session.

- **Audit trail gaps**: `updateItem()` and `updateSupply()` in `useFirestore` both accepted `userId`/`userName` but never called `logActivity()` — item edits and supply edits were silently omitted from the activity log; both now log `edit_item` / `edit_supply`
- **Month-end date rollover**: JavaScript `setMonth(n+1)` rolls Jan 31 → Mar 3; fixed in `calculateNextDue()` (MaintenancePage) and `generateRecurrenceDates()` (ReservationsPage) by clamping to `lastDay` after advancing the month
- **Kanban drag missing recurrence**: `handleDrop()` in MaintenancePage was the only completion path that didn't auto-create the next recurring ticket on drag-to-Complete; fixed by copying full recurrence logic into `handleDrop`
- **Recurring reservation conflict check**: `handleAdd()` only checked the base date for conflicts; remaining generated dates in a series were unchecked; now loops all dates before creating any, with early return and specific conflict message
- **Use-exceeds-stock**: `handleUse()` in SuppliesPage showed a warning but didn't block submission; `useSupply` in the hook silently clamped via `Math.max(0, ...)` — blocked at the UI layer before the hook is called
- **Missing audit trail for supply edits**: `updateSupply()` signature changed to `(docId, updates, userId, userName)` and now logs `edit_supply`; all callers updated
- **Activity log missing action types**: `edit_item` and `edit_supply` added to icon/label/color maps in both ActivityLogPage and Dashboard
- **Dashboard badge bug**: Checked Out items were showing "Under Repair" badge when overdue; badge now always shows "Checked Out" (overdue state is shown separately in the alert section)
- **Dashboard pending reservations**: `r.purpose` fallback to `r.eventName` — reservations created via the request form use `eventName`, not `purpose`
- **Supply ID duplicate check**: `handleAdd()` in SuppliesPage now checks for an existing supply with the same ID before saving (parallel to ItemsPage's existing check)
- **Supply minQuantity negative**: `handleEditSupply()` now rejects negative minQuantity values
- **Item duplicate ID on edit**: `handleEdit()` in ItemsPage checks for ID collisions excluding the current item's own doc
- **Item recovery value negative**: `handleRetire()` rejects negative recovery values
- **Public request dismiss confirmation**: `window.confirm()` added before `dismissPublicRequest()`
- **Recurring ticket notes**: `notes` field was silently dropped when auto-creating the next recurring ticket; now propagated
- **Escape key exits bulk mode**: Esc handler in ItemsPage now exits bulk select mode first before closing any modal
- **`N` key clears financial panel**: `setShowFinancial(false)` added before `setShowAdd(true)` in the keyboard shortcut handler
- **Modal reset fixes**: MaintenancePage — new comment cleared on detail modal close; cancel clears comments/input/checklist state; add vendor form reset on close
- **EmailJS failure visibility**: Three `console.error` calls on email send failure changed to `flash()` so users see a visible prompt to notify manually (MaintenancePage assignee email, ReservationsPage approve/deny email)
- **Vendor specialty in detail modal**: vendor dropdown in ticket detail now shows specialty suffix (matching Add Ticket modal)
- **Sort preference persisted**: `sortBy` in MaintenancePage now persists to `localStorage` under `maint_sortBy` (parallel to `maint_viewMode`)
- **Checklist input focus restored**: `useRef` added to checklist input; focus returns to input after adding a checklist item
- **`dateTo` input `min` attribute**: replaced the programmatic "clear if invalid" approach with `min={dateFrom || undefined}` — browser blocks invalid selection at the native date picker level
- **SettingsPage — church code uniqueness**: `handleChangeCode()` now async; queries Firestore for `where('churchCode', '==', code)` before saving to prevent two churches sharing a code
- **SettingsPage — case-insensitive list dedup**: `addToList()` now lowercases both sides when checking for duplicates so "Sanctuary" and "sanctuary" can't both be added
- **SettingsPage — church code input uppercase**: `onChange` now calls `.toUpperCase()` so the stored value always matches the visual display (CSS `textTransform` was visual-only)

### ✅ Phase 17 — Mobile Audit & Responsive Fixes (2026-03-17)

- **Modal safe-area-inset**: bottom-sheet modals on iPhone X+ now include `env(safe-area-inset-bottom, 0px)` in their bottom padding so action buttons are never hidden behind the home indicator
- **Error toast clearance**: toast `bottom` raised from `80` to `96` — on iPhone X the nav bar is ~82px tall (48px buttons + 34px safe area); the toast was appearing behind it
- **SuppliesPage card layout**: button row gets `flexShrink: 0`; "Min / Restocked" text gets `minWidth: 0, overflow: hidden, textOverflow: ellipsis` so long meta text can't compress action buttons off-screen
- **ActivityLogPage — added `isMobile`**: filter bar reorganized from fixed-width flex items into a column layout — Search full-width on row 1; Action + From in a 2-col grid on row 2; To full-width on row 3; expanded detail left indent reduced 52px → 14px on mobile
- **Dashboard stat cards**: switched from `flexWrap` to a 2-col CSS grid on mobile so all 5 stats have consistent equal widths (previously 2+2+1 with uneven sizing)
- **`Stat` component**: mobile-aware padding (`14px 16px`), icon size (`15px`), and value font (`24px`); `flex`/`minWidth` props removed (not needed in a grid parent)
- **CoordinationPage — added `isMobile`**: notification config form and checkout bundle form both use `gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'`; at 162px per column on a 375px phone the "Template ID — Ticket Assigned (Maintenance)" label was wrapping to 3 lines and date inputs were hard to interact with

### ✅ Phase 18 — UX Polish & Settings Inline Editing (2026-03-17)

- **Error boundary added**: `PageErrorBoundary` (class component) wraps the page content area in `App.jsx`; keyed by `tab` so it resets on navigation. Production render crashes show an error message with stack trace instead of a blank screen.
- **Settings list inline editing**: Locations, Ministries, and Tags lists now support inline rename — each row has an Edit button that swaps the label for a text input (pre-filled); Save/Cancel via button or keyboard (Enter/Escape); duplicate-name check on save.

### ✅ Phase 19 — Production Crash: Full Investigation & Fix (2026-03-17)

The All Items tab crashed on every production load with a blank screen. Four separate issues stacked on top of each other.

**Step 1 — Add error boundary to surface the actual error.**
Added `PageErrorBoundary` (class component with `getDerivedStateFromError`) wrapping the page area in `App.jsx`, keyed by `tab` so it resets on navigation.

**Step 2 — First crash: `ReferenceError: Cannot access 'Pn' before initialization`**
`ItemsPage` had 32 `useState` calls and 30+ imports. esbuild's minifier assigns short names sequentially across the entire flattened Rollup bundle without scope analysis. The module-scope `ITEM_STATUS` constant and a function-scope bulk-action `useState` boolean both got assigned `Pn`.

**Step 3 — Collisions kept shifting: `Pn` → `on` → `Se` → `be`**
Every `useState` consolidation just shifted which two-char name collided. Switching to Terser with `mangle: true` made no difference. Code splitting helped but didn't fully fix it.

*Actual fix:* `vite.config.js` set `mangle: false` in `terserOptions`. With identifier mangling disabled, all variable names stay as their original source names — structurally impossible to collide.

**Step 4 — New crash: `ReferenceError: Cannot access 'bulkModal' before initialization`**
With `mangle: false` preserving real names, a genuine source-level TDZ appeared: a `useEffect` dependency array referenced `bulkModal`, `bulkMode`, `isAdmin`, `isManager` — all declared *below* that `useEffect` in the component body.

*Fix:* moved all `useState` declarations and derived values that appear in `useEffect` dependency arrays to the top of the component, before any `useEffect` call.

**Final `vite.config.js` build config:**
```js
build: {
  minify: 'terser',
  terserOptions: { compress: true, mangle: false },
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
      },
    },
  },
}
```

**Post-fix audit (2026-03-17):** Full hook-ordering audit run across all 15 source files. No further violations found.

### ✅ Phase 20 — Delete Actions & Supply Tags (2026-03-17)

- **Item delete**: `deleteItem(docId, itemId, userId, userName)` added to `useFirestore`; permanently removes item from Firestore and logs `delete_item` to activity log; **Delete** button (dark red, admin only) in item detail modal footer alongside Retire; `window.confirm` dialog before executing
- **Supply delete**: `deleteSupply(docId, supplyId, userId, userName)` added to `useFirestore`; permanently removes supply and logs `delete_supply`; **Delete** button (admin only) on each supply card; `window.confirm` dialog before executing
- **Tags on supplies**: `tags[]` field added to supply data model; tag selection (pill-toggle UI, same as items) in Add and Edit Supply modals; tag filter pills in the search bar (toggle single-tag filter); tag pills displayed on supply cards; all sourced from `settings.tags` — hidden if no tags configured
- **Quantity correction in Edit Supply**: admin-only **Current Quantity** field in the Edit Supply modal allows correcting a counting mistake without creating a misleading use/restock log entry; validates non-negative; saved via existing `updateSupply` call

### ✅ Phase 21 — AI Supply Identification (2026-03-17)

- **`✨ Identify Item` in Add Supply modal**: single button opens the device camera/file picker; on photo selection, automatically converts to base64 and calls the existing `identifyItem` Cloud Function (Claude Haiku vision); pre-fills the Description field; photo is used for identification only and is **not stored**
- Button label stays `✨ Identify Item` throughout (no "upload" language to avoid implying the photo is saved); button shows `Identifying…` and is disabled while the Cloud Function runs
- Reuses the same `identifyItem` Cloud Function and `ANTHROPIC_API_KEY` secret already in place for items; no backend changes required

### ✅ Move Between Inventory and Supplies (2026-03-18)

- **Admin-only** action available in two places:
  - Supply Edit modal: "Move to Inventory →" link at the bottom opens a modal asking for an Item ID (3+ chars, duplicate-checked); status defaults to Available
  - Item detail modal: "Move to Supplies →" link below the action buttons opens a modal asking for a Supply ID, starting qty, min qty, and unit
- Description, location, ministry, and tags carry over automatically in both directions
- Original record is deleted after the new one is created; both steps log through existing `addItem`/`addSupply` + `deleteItem`/`deleteSupply` activity logging
- FAQ entry added to HelpPage: "What if someone added something to the wrong list?"

### ✅ Location Report — Insights Hub (2026-03-18)

- New **📍 Location Report** section in Insights Hub
- Location dropdown (populated from `settings.locations`); selecting a location shows all active items and all supplies at that location in two separate tables
- Items table: ID, description, status (color-coded), ministry
- Supplies table: ID, description, quantity (red if below minimum), min qty, ministry
- Stat summary: item count + supply count
- **⬇ Export CSV** button downloads a combined file (Type, ID, Description, Status/Qty, Ministry, Tags)
- HelpPage updated with Location Report accordion in the Insights Hub section

### ✅ iOS Safari Compatibility (2026-03-18)

- **PWA standalone mode**: Added `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`), and `apple-mobile-web-app-title` meta tags to `index.html` so the app runs as a true full-screen standalone app when added to the iPhone home screen
- **Notch / safe-area support**: Added `viewport-fit=cover` to the viewport meta tag so `env(safe-area-inset-*)` extends background to screen edges on notched and Dynamic Island devices (already used in Modal and bottom nav styles)
- **Input auto-zoom prevention**: Added a CSS `@supports (-webkit-touch-callout: none)` rule forcing `font-size: 16px` on all `input`, `select`, and `textarea` elements on iOS only — iOS Safari auto-zooms inputs with font-size < 16px on focus; desktop rendering unchanged (still 14px via inline styles)
- **Overscroll / pull-to-refresh**: Added `overscroll-behavior: none` to the `<body>` element to prevent accidental Safari pull-to-refresh when users scroll to the top of a page
- **Stable viewport height**: Changed `Spinner.jsx` from `height: 100vh` to `height: 100svh` (small stable viewport height, which excludes the collapsing address bar) to prevent the loading screen from being clipped on initial load in Safari
- **Clipboard silent failure**: Added `.catch(() => {})` to all three `navigator.clipboard.writeText()` calls in `SettingsPage.jsx` — iOS requires user permission for clipboard access and rejects silently on denial; without the catch, this produced an unhandled promise rejection

### ✅ SEO: Sitemap, Meta Tags, Schema Markup & Blog (2026-03-18)

- **`public/robots.txt`**: Allows all crawlers; disallows `?request=`, `?signup`, `?invite`; references sitemap at `https://churchopshub.com/sitemap.xml`
- **`public/sitemap.xml`**: Static sitemap with all 6 public URLs — `/` (priority 1.0), `/?help` (0.6), `/blog` (0.8), and all 3 blog post slugs (0.7 each); `changefreq: monthly`
- **`react-helmet-async`**: Installed and `<HelmetProvider>` wraps the app in `main.jsx`
- **`src/components/SEO.jsx`**: Reusable component wrapping `<Helmet>`; sets `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name`), Twitter Card tags, and an optional JSON-LD `<script>` block; accepts `title`, `description`, `canonical`, `ogImage`, `ogType`, `jsonLd` props; canonical URLs are absolute (`https://churchopshub.com` + path)
- **`LandingPage.jsx`**: `<SEO>` added with optimized title/description; SoftwareApplication JSON-LD schema (`@type: SoftwareApplication`, `applicationCategory: BusinessApplication`, free `Offer`); pain points paragraph added to hero section calling out spreadsheets and Planning Center's lack of inventory features; Blog link added to nav and footer
- **`HelpPage.jsx`**: `<SEO>` added with `canonical="/?help"`
- **`src/data/blogPosts.js`**: Array of 3 post objects (`slug`, `title`, `description`, `date`, `keywords`, `content` as markdown string); posts are ~600-800 words of real copy with h2/h3 heading structure
  - *Why Churches Need Dedicated Inventory Management* — lost equipment, no accountability, reservation conflicts, deferred maintenance
  - *Moving Beyond Spreadsheets: Church Inventory Best Practices* — version/history/access/reservation/mobile problems with spreadsheets; 7 best practices
  - *What Planning Center Can't Do: Managing Your Church's Physical Assets* — PCO's people/events focus, common workarounds (Resources, fake People records, spreadsheets), what dedicated inventory adds, how both systems coexist
- **`src/pages/BlogIndex.jsx`**: Blog listing page at `/blog`; reuses LandingPage nav pattern; post cards with hover shadow; CTA section; footer with nav links; `<SEO ogType="website">`
- **`src/pages/BlogPost.jsx`**: Single post layout at `/blog/:slug`; `renderContent()` converts markdown headings and paragraphs to styled JSX; BlogPosting JSON-LD schema; related articles section (other posts); CTA card; 404-style fallback for unknown slugs; `<SEO ogType="article">`
- **`App.jsx`**: Pathname routing added before query-param checks — `window.location.pathname === '/blog'` → BlogIndex; `.startsWith('/blog/')` → BlogPost with extracted slug; works because `vercel.json` already rewrites all paths to `index.html`

### ✅ Auto-Generated IDs & Inline Tag Creation (2026-03-18)

- **Auto-generated Item/Supply IDs**: Description field moved to top of Add modals (items and supplies); as the user types a description, the ID field auto-fills with a `PREFIX-NNN` suggestion derived from the first meaningful word of the description (e.g. `Wireless Microphone` → `MIC-001`). The prefix is the first 3 alphanumeric characters of the first non-article word, uppercased; the number is the next available for that prefix among existing records. The field remains fully editable — any manual keystroke locks it and stops auto-updates. Also fires on AI Identify and when duplicating an item. Duplicate now pre-generates an ID from the copied description instead of leaving the field blank.
- **Inline tag creation for items**: Add/Edit Item modals now include a "New tag…" input + "+ Add" button below the tag pills, matching the same feature already in supplies. New tags are saved to `settings.tags` and auto-selected. Enter key also triggers add. The `tagOptions.length > 0` gate removed — tag section always visible.
- **FXCC data migration**: All 61 supply IDs and the single item ID migrated via Firestore REST API to consistent category-prefix scheme: `ENV-001–014` (envelopes), `PPR-001–008` (paper), `MED-001–021` (medical/first aid), `OFF-001–005` (office equipment), `LBL-001–002` (labels), `STA-001–004` (stationery/cards), `CLN-001–004` (cleaning), `GEN-001–003` (general), `STPLR-01` (stapler item).

### ✅ Security Hardening (2026-03-20)

Full security audit findings addressed across all layers.

- **Firestore granular rules** (`firestore.rules`): Replaced catch-all `match /{document=**}` wildcard with explicit per-subcollection rules for all 10+ collections. Key grants: `config/subscription` — client create only at church creation, no client updates (webhook/Admin SDK only); `activityLog` — create-only, no updates/deletes (immutable audit trail); `items`/`supplies` — members can update (checkout/return/usage) but only admins+managers can create/delete; `maintenanceTickets/comments` — any member can add, only admins+managers can edit/delete. Refactored helpers to use a single `userData()` function (one `get()` call per request).
- **User self-escalation fix** (`firestore.rules`): Profile `create` rule requires `role == 'user'` except church creators who may set `role == 'admin'` only when `churchId == uid + '-church'`. Self-`update` rule blocks changes to `role`, `churchId`, `active`, and `allowedHubs`; only admins in the same church can modify those fields.
- **Remove `allowedHubs` from registration** (`src/useAuth.js`): Stripped `allowedHubs` parameter from `register` and `registerWithGoogle` — new users can no longer pre-set their own hub access at signup.
- **XSS fix — HTML escaping in print functions** (`src/utils/print.js`, `src/pages/hubs/InsightsPage.jsx`): Added exported `escapeHtml(str)` helper; applied to all Firestore-derived values interpolated into `document.write()` HTML in `printLabel`, `printInventory`, and `printInsightsReport`.
- **Security headers** (`vercel.json`): Added `Content-Security-Policy` (self + Google Fonts + Firebase + Stripe + EmailJS), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` via Vercel `headers` config.
- **Cloud Functions URL allowlist** (`functions/index.js`): `validateRedirectUrl()` checks `new URL(url).origin` against `ALLOWED_REDIRECT_ORIGINS`; applied to `successUrl`/`cancelUrl` in `createCheckoutSession` and `returnUrl` in `createPortalSession`. Webhook signature failure response changed from `err.message` to generic `'Invalid webhook signature'`.
- **Supply quantity race condition** (`src/useFirestore.js`): `useSupply` and `restockSupply` now use `runTransaction` to atomically read the current quantity and write the new value, preventing concurrent updates from producing incorrect totals.
- **Storage rules hardening** (`storage.rules`): Write rule now enforces `request.resource.size < 5 * 1024 * 1024` (5MB max) and `request.resource.contentType.matches('image/.*')` (images only).
- Rules deployed to Firebase (`firestore:rules,storage`).

---

## Public Launch Checklist (All Resolved)

### ✅ Critical

- **Firestore security rules** — scoped to user's `churchId` via `get()` lookup; admin-only writes for role/active changes.
- **Storage security rules** — same `churchId` scoping via `firestore.get()`; IAM role granted.
- **Password reset UI** — "Forgot password?" link on login screen; `sendPasswordResetEmail()` in `useAuth.js`.

### ✅ Important

- **Email verification** — `sendEmailVerification()` called after `createChurch` and `register` (skipped for Google sign-in). Dismissible yellow banner in `AppShell` for unverified users with Resend button; `resendVerification()` exposed from `useAuth`.
- **Church creation rate limiting** — honeypot hidden input in Create Church form (silently rejected if filled); 1-church-per-email check in `createChurch()` queries `churches` by `createdBy == uid` before proceeding.
- **Terms of Service & Privacy Policy** — ToS checkbox on all three registration forms (register, googleRegister, createChurch); submit button disabled until checked. Clicking "Terms of Service" or "Privacy Policy" opens a modal overlay within `AuthScreen` with full content; "I Agree" button in modal footer auto-checks the checkbox.

### ✅ Polish

- **Item ID minimum length** — `handleAdd` and `handleEdit` in `ItemsPage.jsx` reject IDs shorter than 3 characters with a flash message; Add button disabled until valid.
- **Onboarding flow** — 3-step modal in `AppShell` fires when `userProfile.role === 'admin' && !config?.onboardingComplete && items.length === 0`; steps: Welcome → Settings (locations/ministries) → Add first item; any dismiss/skip/complete writes `onboardingComplete: true` to `config/main`.
- **Account & data deletion** — "Delete Account" button in Settings > Danger Zone; modal with `type DELETE` confirmation + password field; reauthenticates then deletes Firestore user profile + Firebase Auth account.
- **Landing / marketing page** — `LandingPage.jsx` shown to unauthenticated visitors.
- **Custom domain** — `churchopshub.com` configured in Vercel; added to Firebase Authentication authorized domains; `authDomain` updated in `src/firebase.js`. `vercel.json` added to proxy `/__/auth/*` to `church-inventory-9615c.firebaseapp.com`.
- **Error monitoring** — Sentry integrated in `main.jsx` with browser tracing (20% sample rate).

---

## Known Issues & Tech Debt (All Resolved)

### Security

- ~~**Firestore rules wildcard — any member could write any subcollection**~~ ✅ Fixed (2026-03-20) — wildcard replaced with granular per-subcollection rules; `config/subscription` client-write denied; `activityLog` immutable; role escalation blocked.
- ~~**User self-escalation via direct Firestore write**~~ ✅ Fixed (2026-03-20) — `create` requires `role == 'user'`; `update` blocks changes to `role`/`churchId`/`active`/`allowedHubs`.
- ~~**Users Firestore rule leaks cross-church data**~~ ✅ Fixed — reads now require `request.auth.uid == userId || userChurchId() == resource.data.churchId`.
- ~~**Suggestions UI gate uses wrong email source**~~ ✅ Fixed — `isOwner` now uses `user?.email` from the Firebase Auth object (verified token).
- ~~**Church code lookup scans entire `churches` collection**~~ ✅ Fixed — replaced full collection scans with `query(collection(db, 'churches'), where('churchCode', '==', ...))`.

### UX / Data Integrity

- ~~**Maintenance ticket detail modal stays open after Save**~~ ✅ Fixed
- ~~**No confirmation dialog before deactivating users, changing roles, or changing the church code**~~ ✅ Fixed
- ~~**Photo upload failure is silent**~~ ✅ Fixed
- ~~**Return date not validated against checkout date**~~ ✅ Fixed
- ~~**Supply quantities allow negatives**~~ ✅ Fixed
- ~~**Item ID has no minimum length**~~ ✅ Fixed
- ~~**Firestore errors are silent**~~ ✅ Fixed — `handleErr()` helper + toast + Sentry
- ~~**QR code depends on external API**~~ ✅ Fixed — `qrcode` npm package, client-side
- ~~**Activity log capped at 20 entries**~~ ✅ Fixed — load-more button
- ~~**No copy-to-clipboard on church code**~~ ✅ Fixed

---

## Performance & Efficiency (All Resolved)

### Firestore

- ~~**`loadUsers` scans entire users collection**~~ ✅ Fixed — real-time `onSnapshot` with `where('churchId', '==', churchId)`.
- ~~**Ticket numbering is O(n) per new ticket**~~ ✅ Fixed — `runTransaction` to atomically increment `maxTicketNumber` on `config/main`.
- ~~**Suggestions load has no limit**~~ ✅ Fixed — `.limit(100)` on `loadSuggestions()` query.

### React

- ~~**No `useMemo` on expensive derived state**~~ ✅ Fixed — wrapped in Dashboard, ItemsPage, ReservationsPage.
- ~~**`useWindowWidth` fires on every pixel during resize**~~ ✅ Fixed — 100ms debounce in `useMobile.js`.
- ~~**Bulk location change writes `_docId` to Firestore**~~ ✅ Fixed — passes only `{ location: bulkNewLoc }`.
- ~~**Bulk operations are sequential**~~ ✅ Fixed — `Promise.all` in all three bulk handlers.
- ~~**`loadChurches` dead code in `useFirestore`**~~ ✅ Removed.

---

## Post-Phase-21 Updates (2026-03-18 onwards)

### 2026-03-18

- Location Report added to Insights Hub
- Move between Inventory and Supplies (admin)
- Auto-generated IDs & inline tag creation for items
- iOS Safari compatibility fixes
- SEO: sitemap, robots.txt, meta tags, schema markup, blog

### 2026-03-19

- Blog link in AppShell desktop footer; Google Search Console verification
- Auto-generate Item ID when moving supply to inventory
- Hub picker (HubsPage): single "Hubs" tab replaces individual hub tabs; picker grid + sub-nav breadcrumb
- People Access Hub: background checks, key assignments, certifications, custom requirements, expiry alerts, CSV export
- People Access: bulk entry modal (spreadsheet-style, interval expiry, name autocomplete)
- People Access: link accessPeople to user accounts (auto-link by email on login, manual link by admin); My Compliance card in Settings; Team Members compliance badges

### 2026-03-20

- Security hardening: granular Firestore rules (per-subcollection), user self-escalation fix, `escapeHtml` XSS fix for print functions, CSP/security headers in vercel.json, URL allowlist in Cloud Functions, supply quantity race condition → runTransaction, storage size+type limits

### 2026-03-21

- Blog post: "Church Supply Management: How to Stop Running Out of What You Need"

### 2026-03-22

- Maintenance Hub: user role can now update/edit tickets and drag Kanban status; Delete gated to admin+mgr; removed dead allowedHubs args from invite registration flow
- Hub access control: People Access Hub hidden from user role entirely; certifications admin-only (add/edit/delete); managers handle background checks, key assignments, custom requirements
- Security audit: fixed missing cert role guard in `handleBulkSave` (PeopleAccessPage)
- Maintenance Hub UX (user role audit): role-aware subtitle + empty state; ticket number search; checklist add/remove now auto-save
- Maintenance Hub UX (mobile + comments): mobile Kanban replaced with "Move to:" select on cards; unsaved-changes confirm on modal close; comment edit/delete for own comments; relative timestamps; own-comment styling; Firestore rule updated to allow comment author self-edit/delete

### 2026-03-24

- Blog post: "Church Equipment Maintenance: A Complete Guide"
- RichTextarea Enter key list continuation: Enter continues bullet/numbered list; double Enter on empty prefix line exits list; numbered lists auto-increment
- UX fixes (Opus audit — Maintenance + Inventory hubs): error flash red styling, checklist save error handling, onDragStart boolean fix, comment tap targets, comment placeholder text, bulk location role gate, "Send to Repair" label, role-aware empty state, statusFilter localStorage persistence, search placeholder cleanup, overdue red border persists in bulk select

### 2026-04-04

- Assignee color differentiation on Maintenance Kanban cards: deterministic hash of uid mapped to 8-color palette; same person always gets same color

### 2026-04-07

- Blog post: "How to Do a Church Physical Audit: A Step-by-Step Guide"

### 2026-04-09

- UI polish: confirm on deny, hub card focus, item name tooltip, auth form mobile, brand token cleanup, CoordinationPage required-field errors + badge, COC timeline mobile, skipped names truncation, BlogPost word-break
- Blog post: "5 Things Every Church Facilities Manager Needs to Track"
- Blog post: "Church Volunteer Equipment Accountability: Best Practices"

### 2026-04-14

- Tasks Hub: general-purpose Kanban task board with visibility control (team/private/shared), assignees, comments, recurrence, TSK-### numbering
- Tasks Hub: assignees filtered to Tasks Hub-access users only; per-user task defaults (⚙ Defaults button → default visibility + default share-with list, saved to users/{uid}); private tasks truly private (admin override removed); High priority pinned to top of each Kanban column

### 2026-04-15

- Tasks Hub: Opus review — security (private tasks enforced server-side in Firestore rules; creator delete allowed), bugs (calculateNextDue month-end rollover, isDetailDirty checklist, checklist Cancel flow, addTask silent failure, photo URL memory leak), refactor (createNextRecurringTask shared helper), a11y (TaskCard role/tabIndex/aria-label, mobile status select aria-label, comment button aria-label), performance (React.memo on TaskCard + KanbanColumn, useMemo for stats)

### 2026-04-16

- Tasks Hub: real-time detail modal sync — onSnapshot listener on open task doc; silent update when no dirty edits; amber conflict banner (Reload/Dismiss) when concurrent edit detected; extracted taskToEdits() helper; isDirtyRef avoids stale closures
- SEO: sitemap lastmod + changefreq fixes (yearly on posts, weekly on /blog); add missing moving-beyond-spreadsheets post; landing page title → "Church Inventory Management Software — Free"; add Organization schema + featureList to SoftwareApplication schema
- Blog post: "Best Church Management Software for Small Churches in 2026"
- Room/Space booking: rooms collection + Firestore rules; useFirestore rooms subscription (totalSubs→17) + CRUD; RESOURCE_TYPE enum; Settings Spaces card + modal (name/capacity/location/amenities/archive); ReservationsPage Equipment/Space toggle, room conflict detection, room badges, Check Out hidden for rooms, CSV updated
- Preventive Maintenance Calendar: custom month grid as third view mode in Maintenance Hub; priority-colored chips, 🔁 recurring badge, +N overflow, overdue cell highlight, month nav + Today button; mobile grouped list (Overdue/This Week/Next 30 Days/Later)
- Bug fixes (Opus review — Room booking + Maintenance Calendar): localDateStr() replaces toISOString() to fix UTC off-by-one; TicketChip extracted to module level; double-reduce in calendar header fixed; empty-state message when no spaces defined; Mark Complete action for approved room reservations
- Job Hub: teen job board + announcement board ($7/mo, key: jobs, JOB-###); admins post jobs; members sign up via runTransaction; announcements with pin + optional expiry; last 3 announcements on Dashboard; all-in bundle fixed to include people_access + jobs; totalSubs 17→19
- Email: migrated all notifications from EmailJS (client-side) to SendGrid via Cloud Functions; removed @emailjs/browser; new CFs: sendReservationEmail, sendTicketAssignedEmail, sendJobAnnouncementEmails
- Job Hub: My Jobs filter tab; morning reminder emails (sendJobReminders scheduled CF, 8am Central); cancellation emails (sendJobCancelledEmails CF); signup list privacy (admin/mgr see names, members see own status only); activity log for all job actions
- Tasks Hub enhancements (Opus review phase 2): activity logging; CSV export (exportTasksCSV); due-date reminder emails (sendTaskDueReminders scheduled CF); Calendar view; task templates (save/apply, admin+mgr only); subtasks (parentTaskId); bulk actions in list view; task dependencies (blockedBy TSK-### array with soft warning on Complete); firestore.indexes.json; taskTemplates Firestore rules

### 2026-04-20

- Job Hub: Schedule (roster) view + Calendar view; view tabs expanded from 2 to 4 (Job Board, Schedule, Calendar, Announcements)

### 2026-04-21

- Blog post: "How to Use a Kanban Board to Track Church Maintenance"
- UI/UX fix sweep (Opus review): extract `localDateStr` to `src/utils/date.js`; fix all UTC `toISOString()` date bugs (17 occurrences, 9 files); keyboard a11y on TicketCard/HubCards/ReservationCards/Modal close; flash messages standardized (5s, isError, dismiss button) app-wide; Activity Log added to mobile nav; dead code removed
- UX polish (Opus medium items): supply cards click-to-detail modal; reservation Equipment/Space toggle persists to localStorage; reservations empty state role-aware; PeopleAccessPage header font-size standardized
- Job Hub audit fixes (Opus + Explore review): Firestore signup rule hardened (±1 delta + spotsTotal cap); updateJobListing strips immutable fields + wraps spotsTotal shrink in runTransaction; withdrawFromJob no-op guard; invite flow threads allowedHubs; sendJobAnnouncementEmails + sendJobCancelledEmails + sendJobReminders: subscription gating, allowedHubs/active filter, error logging, idempotency; keyboard a11y on all Job Hub interactive elements

### 2026-04-23

- Job Hub enhancements (Opus review): recurring job series (recurrenceGroupId/recurrenceFreq/seriesEndDate, up to 100 jobs, one transaction with contiguous JOB-### numbers, 🔁 badge); poster + delegate notifications (sendJobPosterNotification CF — withdrawal and co-admin cancellation, 30s double-fire guard); jobPosterDelegates on user profile (cap 5); roster visibility toggle in Settings (admin only) — 'admin'/'signups'/'all', canSeeRoster() helper
- 90-day free trial system: new churches get all 7 paid hubs free for 90 days; trial banner in AppShell; processTrialExpirations daily CF (2am Central — auto-selects 2 most-used hubs, 7-day warning email); subHasHub() shared helper in functions/index.js; subscription status starts 'trialing', changes to 'active' on expiry
- Welcome email on signup: sendWelcomeEmail CF (Firestore onCreate trigger on churches/{churchId}, idempotency via welcomeEmailSentAt, replyTo: jcvaught@gmail.com)
- Job Hub Phase 1 fixes (new Opus review): 30s poster-notif guard scoped by actorUid (lastPosterNotifiedByActors map); admin_removal event added to sendJobPosterNotification CF; generateRecurrenceDates() extracted to src/utils/date.js; withdrawFromJob returns { wasSignedUp }; module-scope React.memo for JobCard, MobileScheduleRow, DesktopScheduleRow, AnnouncementCard

### 2026-04-24

- Job Hub H3: series-wide edit and delete — updateJobListingSeries + deleteJobListingSeries in useFirestore (writeBatch; spotsTotal validated against each job's signups); edit modal gains scope selector (This job only / This + all future jobs); detail modal gains "Delete Series" button
- Tasks Hub audit fixes (Opus review): all task functions now rethrow errors; updateTask strips immutable fields; Firestore rule blocks visibility escalation by non-creators; calculateNextDue Feb-29 annually fix + extracted to src/utils/date.js; createNextRecurringTask idempotency via runTransaction; handleDeleteTask cascade-deletes subtasks; deleteTask batch-deletes comments + Storage photos; bulk Complete triggers createNextRecurringTask; activityLabels.js shared utility; sendTaskDueReminders: idempotency, active+allowedHubs filter
- Tasks + Job Hub follow-up audit fixes (Opus review #2): tasksByDocId useMemo moved before pruning useEffect (TDZ crash fix); addTaskTags gated behind canOperate; Firestore task update rule blocks visibility changes by non-creators; sendTaskDueReminders lower bound removed (overdue tasks now included); job signup rule blocks writes on cancelled/completed jobs; updateJobListingSeries → runTransaction (TOCTOU fix); all Job Hub CRUD catch blocks rethrow; deleteJobListingSeriesFrom helper (Delete This + Future); savingJobId per-card (sign-up/withdraw no longer freezes all cards)

### 2026-05-11 — Jobs Hub pre-rollout UAT (manual)

Session 1 of the rollout: user ran `docs/TEST-JOBS-HUB-2026-05-07.md` against prod. First click broke (Modal `open` prop missing), then every UAT section surfaced 2–3 bugs. 11 fixes shipped during testing (F-fix-1 through F-fix-11). Highlights:

- **F-fix-1 (Modal open prop)**: 4 modals (New/Edit Job, Job Detail, New/Edit Announcement, Delegates) were calling `<Modal>` without the `open` prop — every click silently rendered nothing. Added `open` shorthand + Modal `maxWidth` prop support.
- **F-fix-2 (Sentry CSP)**: `vercel.json` CSP `connect-src` was missing `*.ingest.sentry.io` — Sentry transmission blocked since launch, hiding F-fix-1 and (later) F-fix-9 from telemetry. Added Sentry hosts.
- **F-fix-3 (hard-delete cancellation emails)**: handleDeleteJob/handleDeleteSeries/handleDeleteSeriesFrom were silently stranding signups. Now fan out sendJobCancelledEmails before delete.
- F-fix-4 update_job activity-log showed raw docId not JOB-###.
- F-fix-5 Job Lead dropdown now filters to admins + users-with-jobs-access.
- F-fix-6 past-dated open jobs were signup-able until 2am cron — filter + handler guard + disabled card button.
- F-fix-7 ICS export scoped per-user (members get their signups; admins get "Export All").
- F-fix-8 Print Roster admin-only + selection modal.
- **F-fix-9 (CSP for Cloud Functions)** — _the silent catastrophe_: CSP missing `*.cloudfunctions.net` + `*.run.app` had blocked every client-callable CF since launch. Cloud Run logs showed 24h of zero client-CF activity. Hidden by F-fix-2.
- F-fix-10 Spots field now flashes "Spots must be at least 1" instead of silent Math.max clamp.
- F-fix-11 flash banner was hidden behind Modal's z:1000 backdrop; now fixed-position z:1100.

### 2026-05-12 — Overnight 7-agent audit + comprehensive fix wave

Triggered by 2026-05-11 UAT volume. User asked for "full audit while I sleep." Seven parallel deep-review agents covered security, race conditions, email/SMS plumbing, error resilience, mobile/a11y, performance/scale, and data-model integrity. ~80 findings consolidated into `docs/AUDIT-TASKS-JOBS-2026-04-25.md`.

**Audit fix waves (F-fix-12 through F-fix-19):**

- F-fix-12 (F-20): cosmetic cleanup — shadowed isFull, dead todayStr prop, stale eslint-disable.
- F-fix-13 (F-18): signUpForJob prechecks 50-entry waitlist cap.
- F-fix-14 (F-17): promoteFromWaitlist gates on subscription pre-transaction.
- F-fix-15 (F-15): sendJobPosterNotification 30s double-fire guard now atomic via runTransaction (was: race between read and post-send write).
- F-fix-16 (F-14): missing `config/notifications` doc defaults to enabled=true. Five CF gate sites updated. Fresh churches now receive emails.
- F-fix-17 (F-21): new `effectiveHasHub(user, hub)` helper applied to 7 CF sites — admins with `allowedHubs: []` (e.g., John, Nancy in FXCC) no longer excluded from job emails.
- F-fix-18 (Security C-02, C-03): Stripe CFs now require admin role; sendTaskMentionEmail verifies caller's churchId match. Closes cross-tenant phishing primitive + the "any member can cancel subscription" path.
- F-fix-19 (F-23): tasks.dueDate + taskTemplates.autoGenerate COLLECTION_GROUP indexes patched via Firestore Admin REST API (firebase deploy --only firestore:indexes silently no-op'd per the known `feedback_firebase_collection_index` pitfall). Fixes daily 8am cron FAILED_PRECONDITION errors.

**Rules tightening Phases A–D (user-sign-off-required, all shipped):**

- Phase A (C-01): pinned `churchId` equality on admin user-update branch. Closes cross-tenant transplant attack where admin could rewrite any user's (or own) churchId.
- Phase B (F-16): jobListings admin update gets a forbidden-fields blocklist (signups/waitlist/attendance/server-managed). Three legitimate sub-paths preserved (attendance length-preserving, single removal, waitlist removal).
- Phase C (Data #2): member-branch of jobListings has `'signups' in resource.data && …` guards. Backfill script `scripts/backfill-jobs.cjs` added (dry-run; not executed against FXCC which already has all fields).
- Phase D (H-02): dropped `allow list` on churches collection — replaced with new `lookupChurchByCode` callable CF. Three-step coordinated deploy: CF first → client refactor (5 call sites) → rule drop.

**Autonomous batch:**

- F-RC-1: removePeopleAccessRequirement wrapped in runTransaction.
- F-RC-3: handleWithdraw awaits promoteFromWaitlist (was fire-and-forget; tab-close could drop the promotion).
- F-RC-4: processTrialExpirations read-validate-update now in runTransaction.
- F-RC-6: generateRecurringTemplateTasks template advance now in same txn as task create.
- F-23/agent: NEW `clearCancellationStampOnReopen` onDocumentUpdated trigger.
- F-32: sendJobCancelledEmails now emails waitlist users with a distinct subject.
- F-39: sendTicketAssignedEmail accepts `kind: 'task'|'ticket'` for accurate subject.
- handleErr Sentry.captureException with `{ area: 'firestore-write' }` tag — instruments ~80 mutations at one stroke.
- **Bundle splitting**: 7 hub pages → React.lazy + Suspense; qrcode dynamic-imported. Main bundle 462 KB → **230 KB gzipped (-50%)**. Recharts now its own lazy 132 KB chunk.
- **activityLog pagination**: subscription capped at 100 most-recent; `loadOlderActivityLog` helper for deeper history; ActivityLogPage gains "Load older entries" button.

**Mobile rollout-readiness:**

- C-1: admin ✕ remove-signup buttons bumped from ~22×16pt to ≥44×44pt.
- C-3: safe-area-inset on flash banner top + error toast bottom.
- H-1: Modal a11y — role=dialog, aria-modal, aria-labelledby, Escape closes, focus trap (move-in + restore).
- H-2: Modal maxHeight `92vh` → `92dvh` (iOS Safari toolbar safe).
- H-3: bottom-nav `flex: 0 0 64px` (448px wide, overflowed) → `flex: 1 1 0`. All 7 tabs fit any iPhone width.
- H-4: view tabs + filter chips horizontal-scroll on mobile.
- M-3: JobCard hover handlers skipped on mobile (no stuck-hover after tap).
- M-7: Public Jobs CTAs bumped to 14px / 44pt.
- L-1: aria-hidden on decorative emojis (bottom nav, error toast).

**Bucket 1 polish:**

- H-6: FF.jsx form-a11y refactor — useId-generated label/input association, opt-in `required` + `error` props (aria-required, aria-invalid, aria-describedby). Every form gets proper screen-reader semantics.
- M-1: Job card secondary-text font sizes bumped 11–12px → 13 on mobile.
- Data #1: deleteJobListingSeries + deleteJobListingSeriesFrom now clear linkedTaskDocId back-refs.
- F-28: sendJobAnnouncementEmails caps body at 5000 chars.
- F-30: sendTaskMentionEmail now includes plain-text MIME part.
- F-37: twilioInbound signature URL reads from `TWILIO_INBOUND_URL` env var (hardcoded fallback).

**F-24 — sender domain swap (last 🔴 closed):**

- Authenticated `churchopshub.com` in SendGrid — 5 CNAMEs + DMARC TXT added to Vercel DNS.
- `from: noreply@churchopshub.com` replaces gmail-as-sender across all 11 SendGrid sends.
- Verified end-to-end via raw email headers: `dkim=pass header.i=@churchopshub.com header.s=s1` + `spf=pass` + `dmarc=pass`. First-send landed in Gmail inbox, not spam.

**Sentry cleanup:**

- `beforeSend` filter drops transient `@firebase/firestore: Uncaught Error in snapshot listener` console.errors (transient auth-state-transition noise).

**A2P 10DLC resubmission prep:**

- 2026-04-27 campaign rejected with "issues verifying CTA" — TCR couldn't follow the authenticated in-app opt-in flow.
- New `src/pages/PublicSMSProgramPage.jsx` — publicly accessible (no auth required) disclosure page: program name, sending number, sample messages, frequency, exact in-app consent text, opt-in/out flow, HELP/STOP keywords, privacy + terms links.
- Routing: both `/sms-program` (clean path via SPA catch-all + pathname check) and `?sms-program` (query) work. Same pattern enabled for `/privacy` and `/terms`.
- Cross-links from Privacy + Terms SMS sections; LandingPage footer surfaces Privacy + Terms + SMS Program. sitemap.xml entry added.
- User updates the Twilio campaign with: new opt-in description pointing at /sms-program, Privacy URL = https://churchopshub.com/privacy, Terms URL = https://churchopshub.com/terms. Three daily Gmail-draft reminders scheduled via Claude Routines for May 13–15.

**Playwright E2E suite — 31/31 passing in ~80s:**

- Mirrors Court Climber's pattern: Firebase v12 IndexedDB auth state, per-spec teardown via Admin SDK, three roles (admin / member-a / member-b).
- Coverage maps every section of `docs/TEST-JOBS-HUB-2026-05-07.md`: §4 waitlist + auto-promotion, §5 compliance/waiver, §6 attendance/Reports, §7 roster visibility, §8 announcements, §9 public board (PII strip regression check), §10 notifications gate (verified via F-15 transaction stamp on lastPosterNotifiedByActors), §11 edge cases.
- SMS smoke test gated behind `E2E_RUN_SMS=1`. Triggers via `gcloud scheduler jobs run`, polls Twilio Messages API for delivery. Will auto-flip green after A2P approval + Messaging Service migration.
- Files: `playwright.config.js`, `e2e/firebase-fixtures.js`, 3 auth.setup.\*.js, `admin-helpers.js`, 7 spec files. Test accounts in FXCC: `jcvaught@gmail.com` (Member A), `e2e-admin@churchopshub.com`, `e2e-member-b@churchopshub.com`.
- Run: `E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e`.
