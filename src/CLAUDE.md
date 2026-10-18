# CLAUDE.md — src/

Loads only when working under `src/`. Moved here from the root CLAUDE.md (2026-10-12) to keep
the always-loaded file small. Root-level rules and Known Pitfalls still apply.

## File layout

```
src/
├── App.jsx                    ← AuthScreen + AppShell (tabs, mobile nav) + root App (~368 lines)
├── useAuth.js                 ← Firebase Auth hook (email/password + Google, church setup/join)
├── useFirestore.js            ← All Firestore CRUD as a single hook (incl. maintenance)
├── firebase.js                ← Firebase app init; exports `db`, `auth`, `googleProvider`, `storage`
├── firebasePublic.js          ← Minimal init (firebase/app only, no Auth/Firestore/Storage); used by main.jsx when `?jobs=` is present so anonymous teen traffic never imports the authenticated SDKs (audit 2026-05-23 perf C-1)
├── main.jsx                   ← React entry point; initializes Sentry (@sentry/react v10) with browserTracing + captureConsole({levels:['error']}) — defaults also catch window.onerror, unhandled rejections, and breadcrumbs. **The DSN is gated on `import.meta.env.PROD`** so only DEPLOYED builds transmit — local dev servers (incl. `npm run dev:emulator`) init the SDK but send nothing, so local/sandbox errors can't fire prod alerts (2026-06-10). Routes `?jobs=` URLs to a minimal tree (firebasePublic + PublicJobsPage) BEFORE importing App.jsx — cut anonymous bundle from ~2 MB to ~480 KB raw
├── hooks/
│   ├── useMobile.js           ← MobileCtx + useWindowWidth (breakpoint 768px)
│   ├── useSubscription.js     ← Subscription state hook: hasHub(), canAddUser(), isTrialing()
│   └── useVersionCheck.js     ← Polls /version.json vs the bundle's `__BUILD_ID__` (vite define); flags a new deploy. Powers UpdateBanner. Polling, not SW — sw.js is byte-stable across deploys so `updatefound` never fires
├── components/
│   ├── brand/
│   │   ├── tokens.js          ← B, f1, f2, inp, btnP, btnS, btnD
│   │   └── Logo.jsx           ← Logo, FullLogo
│   ├── legal/
│   │   ├── TermsBody.jsx      ← Shared Terms-of-Service body; rendered by both the auth-screen modal (App.jsx) and the standalone /terms page (TermsPage.jsx) so they cannot drift (audit 2026-05-24 Phase 1)
│   │   └── PrivacyBody.jsx    ← Shared Privacy-Policy body; same pattern as TermsBody — single source of truth for modal + /privacy page
│   ├── primitives/
│   │   ├── Modal.jsx, FF.jsx, Badge.jsx, Stat.jsx, Spinner.jsx
│   │   ├── RichTextarea.jsx   ← Auto-grow textarea with bullet/numbered list toolbar; optional `label` prop
│   │   ├── DataTableDisclosure.jsx ← Screen-reader fallback for Recharts SVGs: renders `<details>` with a real `<table>` of the underlying data. Applied to every chart in InsightsPage (audit 2026-05-24 Phase 1)
│   │   ├── StatusDot.jsx      ← Colored dot + accessible label (visible or sr-only) for status indicators; default role="img" + aria-label. Stops color-only conveyance (audit 2026-05-24 Phase 4)
│   │   ├── EmojiIcon.jsx      ← Wraps an emoji in either decorative (aria-hidden) or semantic (role="img" + aria-label) mode. Use whenever an emoji appears in JSX (audit 2026-05-24 Phase 4)
│   │   └── LapsedBanner.jsx / SubscribeButton.jsx ← COH-012: the day-91 state (app strip, in-hub card, blocked-create modal) and the one checkout path. Replaced UpgradeGate (a full-hub paywall), which no longer exists. Formerly: Optional `previewSrc`/`previewAlt` renders a hub screenshot above the card with a `mask-image` bottom fade (audit 2026-05-24 Phase 6). Subscribe + Contact buttons fire `window.posthog?.capture('upgrade_gate_click', { hubName, action })` — telemetry is try/catch'd so it never blocks Stripe checkout. JPEG previews live in `public/upgrade-previews/<hub>.jpg`.
│   ├── SEO.jsx                ← Reusable SEO component (react-helmet-async); sets title, description, canonical, OG tags, Twitter card, JSON-LD
│   ├── UpdateBanner.jsx       ← "Update available — Reload / Later" card (bottom corner, clears mobile nav); shows when useVersionCheck detects a newer deploy. Mounted once in main.jsx (out of the anonymous ?jobs= path)
│   └── AttentionPanel.jsx     ← Admin-only Dashboard panel; calls getAttentionDigest (AI "what needs attention this week") and renders summary + priority-tagged items + Refresh. The CF caches weekly; this just renders.
├── pages/
│   ├── LandingPage.jsx        ← Marketing landing page; includes SoftwareApplication JSON-LD schema and pain points copy
│   ├── HelpPage.jsx           ← User-facing help center (no auth required); shown when ?help param present; 12 sections, accordion UI, responsive sidebar
│   ├── PrivacyPage.jsx        ← Standalone privacy policy (no auth required); shown when ?privacy param present; includes SMS Section 6 with STOP/HELP, no-share clause, Twilio sub-processor; correct h2 heading hierarchy
│   ├── TermsPage.jsx          ← Standalone terms of service (no auth required); shown when ?terms param present; includes SMS Section 7 with all Twilio A2P required fields (program name, frequency, rates, HELP/STOP in bold, sending number)
│   ├── PublicSMSProgramPage.jsx ← Public-facing SMS program disclosure page for TCR A2P 10DLC verification; reachable at /sms-program (or ?sms-program); includes sample messages, opt-in flow, exact consent disclosure text, opt-out keywords, links to Privacy + Terms
│   ├── PublicRequestPage.jsx  ← Public item request form (no auth required); shown when ?request=CHURCH_ID param present
│   ├── PublicJobsPage.jsx     ← Public job board (no auth required); shown when ?jobs=CHURCH_ID&cn=ChurchName param present; shows open jobs with spots bar; Sign Up redirects to register
│   ├── BlogIndex.jsx          ← Blog listing page at /blog; nav, post cards, CTA, footer
│   ├── BlogPost.jsx           ← Single blog post at /blog/:slug; related articles, post-level JSON-LD, CTA
│   ├── Dashboard.jsx
│   ├── EventDayPage.jsx       ← **Event-Day Ops console** (admin/manager top-level "Event Day" tab; not a paid hub). A getOccurrences consumer: one day → Serving-today (shifts + roster via per-job getDocs on signups + per-volunteer `shiftReadiness` compliance badge), Rooms & reservations (free base), Due-today (tasks/maintenance). Each section self-gates via `hasHub`. Day nav: prev/next/Today/upcoming-Sunday/date. See `docs/EVENT-DAY-OPS-PLAN-2026-06-18.md`.
│   ├── VolunteerHome.jsx      ← Volunteer landing — replaces Dashboard for `isVolunteerOnly(userProfile)` (role:user + allowedHubs=['jobs']). Sections: greeting · Next Shift gradient card with Add-to-Calendar (.ics) · upcoming shifts · open-this-week · "View all jobs" + "Open calendar" CTAs. Subscribes to `collectionGroup('signups').where('uid','==',userId)` directly.
│   ├── InventoryPage.jsx       ← **Inventory Hub** container (free hub): Items/Supplies segmented toggle (mirrors WorkPage), persists `localStorage.inventoryCategory`, lazy-mounts ItemsPage/SuppliesPage, forces the Items sub-view on a `?item=`/scan deep link. Mounted by HubsPage (hub key `inventory`), not by a top-level tab.
│   ├── ItemsPage.jsx           ← Mounted inside InventoryPage (was the `inventory` tab pre-2026-06-23). **Room-scoped inventory (Shape A, 2026-06-24):** items carry optional `roomDocId` + denormalized `roomName` (a "Space" select in add/edit, shown only when active rooms exist; prefills free-text Location if empty). Adds a Space filter (`inv_spaceFilter`), 🏛️ Space on detail, `roomName` CSV column; Manage Spaces shows a per-room item count; Phase 6 `itemsForRoomHold` matches exact `roomDocId` (⭐). Free-text `location` untouched — full `rooms`↔`locations` convergence (Shape B) deliberately NOT done (no rooms in prod yet; revisit only if a hard room-inventory link is needed)
│   ├── SuppliesPage.jsx        ← Mounted inside InventoryPage (was the `supplies` tab). **Room-scoped supplies (Shape A parity, 2026-07-08):** same optional `roomDocId`/`roomName` link as ItemsPage — "Space (optional)" select in add/edit (only when active rooms exist; prefills free-text Location), Space filter (`sup_spaceFilter`), 🏛️ Space on detail, `roomName` CSV column; Move-to-Inventory carries the link to the new item
│   ├── ReservationsPage.jsx    ← Mounted by HubsPage as the Reservations Hub (was the `reservations` tab). **Phase 6 cross-hub moat:** a room-booking detail's "For this event" section reserves linked equipment (a `resourceType:'item'` reservation carrying `linkedReservationDocId`; soft `⭐` location-match suggestion, no item↔room FK) and creates a linked setup task (a `workItem` via `addTask`; booking stamped `linkedSetupTaskDocId`, gated on `userCanSeeHub('tasks')` passed from HubsPage). `deleteTask` clears the reservation backref. No migration — equipment-not-tied-to-rooms convergence stays deferred
│   ├── ActivityLogPage.jsx
│   ├── SettingsPage.jsx       ← Includes Subscription & Billing card for admins; My Compliance card (shows linked accessPerson records for current user); Team Members compliance badges (🔴/🟡 when linked users have expiring records); Church Settings (timezone + opt-in **Weekly Email Digest** toggles: insightsDigestEnabled [gated on insights hub] · complianceDigestEnabled [gated on people_access hub] + a **Daily Job Alerts** block with emptyJobAlertEnabled [gated on jobs hub]); **Calendar Feed** card (admin: generate/copy/rotate the read-only ICS feedToken → icsCalendarFeed URL)
│   ├── HubsPage.jsx           ← Hub picker + sub-navigation container; renders hub cards and routes into active hub with breadcrumb. **Single-hub users** (`allowedHubs.length === 1`) skip the picker entirely — `useEffect` auto-calls `onOpenHub(allowedHubs[0])` and the picker renders `null` in the interim so the upgrade grid never flashes. Volunteers only see their own hub card if they ever do reach the picker. **Tasks+Maintenance merge (2026-06-23):** when a user can use BOTH (`mergeWork = userCanSeeHub('tasks') && userCanSeeHub('maintenance')`), the two cards collapse into one synthetic **"Work"** card (`HUB_DEFS` `key:'work'`, `synthetic:true`) routing to `WorkPage`; single-category users keep their own card. `allowedHubs` stays `'tasks'`/`'maintenance'` (no `'work'` key) so scoping is unchanged; the `'work'` shell bypasses `UpgradeGate`. The flat-plan upgrade callout is admin/manager-only AND only shows when a real paid hub is still locked (hidden for grandfathered/pro).
│   ├── WorkPage.jsx           ← **Unified Work board (rescoped Phase 4).** A Tasks/Maintenance segmented toggle that mounts the ONE `WorkBoard` engine with `type=task|maintenance`; the toggle only offers categories the user's `allowedHubs` permits (category-granular scoping); selection persists in `localStorage.workCategory`. Jobs not here. See `docs/WORK-MERGE-TASKS-MAINTENANCE-PLAN-2026-06-23.md`.
│   └── hubs/
│       ├── InsightsPage.jsx        ← Insights Hub (Phase 4): utilization, ministry, seasonal, financial, supply analytics (Recharts). Usage analytics compute from a trailing-12-month one-shot fetch (loadActivityLogSince), NOT the live activityLog array — that's capped at 100 and silently truncated history (2026-06-07 fix). loadActivityLogSince reads BOTH `timestamp` type lanes via `src/lib/activity-lanes.js` (COH-012 B, 2026-09-18) — see the activityLog-lanes bullet under Pricing for the rule
│       ├── CoordinationPage.jsx    ← Coordination Hub (Phase 6): checkout bundles, email notification settings
│       ├── AccountabilityPage.jsx  ← Accountability Hub (Phase 7): physical audits, chain of custody, insurance export
│       ├── PeopleAccessPage.jsx    ← People Access Hub: background checks, key assignments, certifications, custom compliance milestones; bulk entry modal; link/unlink to user accounts. Views: People · **Readiness** (serving-readiness cross-tab by requirement [clear/renewing/expired/no-record across active people, "Required for shifts" badge from upcoming jobs' requiredAccessTypes] + 90-day expiry timeline; mirrors server isAccessEligible) · Requirements · Timesheet (`Timesheet.jsx` — contractor lifecycle Scheduled→Logged→Approved→Paid; Upcoming Work card for scheduled entries, Awaiting Payment = approved-unpaid; `timeEntries` fields status/estHours/paidDate/linkedTicketId/rolledUp)
│       ├── WorkBoard.jsx          ← **The ONE board engine for BOTH Tasks and Maintenance** (`WorkBoard({store, userProfile, type})`, was `TasksPage.jsx` + the deleted `MaintenancePage.jsx`). `type` selects category; a small `isMaint` adapter at the top is the ONLY divergence point (store-fn aliases — maintenance fns harmlessly ignore the task fns' extra trailing args — plus numberField/docPrefix/hubKey/notifyType/tagSuggestions/canCreate). Shared scaffold: Kanban/List/Calendar views, cards, filters, assignees (filtered to the category's hub users), comments, photos, checklist, recurrence (→ next on complete via `createNextRecurringTask`), per-detail live-sync listener.
│       │                              **Tasks (`type=task`):** visibility (team/private/shared) — **server-enforced as of COH-006 (2026-09-03). `canSeeWorkItem()` in `firestore.rules` is the single predicate for reads, for update's pre-state authorization, and for comment gating; the client issues five constrained queries (maintenance / team / own / assigned / shared) merged in `utils/workMerge.js`. NO admin override — private means private, including from church admins. Comments inherit the parent's visibility. Membership uses `.hasAny([uid])` not `uid in field`: the `is list` guard the latter needs is rejected for array-contains queries (measured), and `hasAny` fails closed on a malformed map anyway. Anyone already authorized may widen access (DEC-2026-012); the uid arrays are canonical and deliberately not pinned to `assignees`/`sharedWith`;** new tasks default to **private + assigned to the creator** across all three create paths (New Task modal, kanban quick-add, paste-import); per-user defaults (users/{uid}) override the visibility half; High pinned to top of each column (unless manual sortOrder via drag); @-mention comments (sendTaskMentionEmail CF); estimatedHours/actualHours; ministry field+filter; Insights view (12-wk velocity BarChart); TSK-###; bulk actions; paste-import (200/import cap); templates (generateRecurringTemplateTasks CF); saved filter views; link to item/ticket; CSV/ICS export; due reminders (sendTaskDueReminders CF); → Job convert (writes linkedJobDocId). Any-member create.
│       │                              **Maintenance (`type=maintenance`):** vendor directory + CRUD; linked equipment (asset); estimatedCost/actualCost; **Contractor Work** section (lists timeEntries by `linkedTicketId`, no backref field + "Schedule Contractor" → creates a **scheduled** timeEntry; logging its hours rolls cost into `actualCost`); MNT-### numbering; admin/manager-create-only; operator-only field disabling. No visibility/templates/insights/bulk/saved-views/reorder/paste/export. (The task→`→ Ticket` convert was REMOVED — same collection, so it's a `type` flip.)
│       └── JobsPage.jsx            ← Job Hub: teen job board; admins post jobs (JOB-###, date/time/location/pay/spots/requiredAccessTypes); members sign up via the jobSignUp Cloud Function (server-side compliance + waiver + capacity enforcement; audit H1/H2); the roster lives in protected signups/waitlist per-uid subcollections, parent carries signupCount/waitlistCount; "My Jobs" filter; announcement board with pin/expiry; cancellation emails via sendJobCancelledEmails CF; morning reminder emails via sendJobReminders scheduled CF (also sends SMS to opted-in users); roster names visible per the jobsRosterVisibility setting (admin/signups/all — rule-enforced via canSeeJobRoster); activity log for all job actions; Schedule view (roster table: date/job/location/spots progress/status); Calendar view (month grid + mobile grouped list); 4 view tabs: Job Board, Schedule, Calendar, Announcements; waitlist + auto-promotion (promoteFromWaitlist CF); waiver/consent gate; per-job attendance tracking; volunteer Reports leaderboard; ICS export in Schedule view; Share Board button (admin) copies public job board URL; → Task convert (admin: mini-modal creates task + linkedTaskDocId backref); swap/replacement requests (member → modal → jobSwapRequests collection; admin sees + dismisses in detail modal)
│       └── ShepherdHubPage.jsx     ← **Shepherd Hub** (FXCC-only, elders): NOT a paid hub — a special non-subscription card in HubsPage (`HUB_DEFS` key `shepherd`, `special:true`; bypasses UpgradeGate + hasHub), shown only when `canSeeShepherd` (FXCC && (isElder || John)) — computed in App.jsx, passed to HubsPage with `isElder`. Privacy doc via the 🔒 Privacy header link (`PrivacyModal`). Reads the CF-synced `shepherdPeople` cache + `config/shepherdRoster`. Views: My Flock / All Congregation / Needs Reassignment; person detail with contact + pastoral fields + private note (owner-only) + shared care thread (`shepherdAudit` logs views/edits); Elder Assigned multi-select editor → `setElderAssignment` PCO write-back; admin "View as [elder]" preview + RosterManager (saves via the `saveShepherdRoster` callable — the roster and `config/shepherdAccess` are server-written only, COH-014). Roster/normalization/claim logic in `functions/lib/roster.js`
├── utils/
│   ├── csv.js                 ← exportItemsCSV, exportSuppliesCSV, exportReservationsCSV, exportAccessRecordsCSV, exportTasksCSV, exportShepherdPeopleCSV (Shepherd Hub flock/congregation contact list — contact fields only, no medical/notes)
│   ├── ical.js                ← exportTasksICS(tasks, churchName), exportJobsICS(jobs, churchName) — client-side .ics Blob download. As of F5 the VEVENT bodies come from the shared `src/lib/occurrences.js` adapters + `occurrenceToVEvent` (one mapping with the server feed); this file is just the download wrapper + the client VCALENDAR header (distinct PRODID, no METHOD line). `functions/lib/ics.js` is now only the golden byte-parity reference for the F5 test.
│   ├── date.js                ← localDateStr(d) — shared local-timezone YYYY-MM-DD formatter (import instead of toISOString()); the recurrence engine `advanceOnce`/`calculateNextDue`/`generateRecurrenceDates` (server twin: `functions/lib/recurrence.js`); and `RECURRENCE_FREQS` — the canonical `[value,label]` cadence list (the exact freqs the math implements; consumed by boardUI/Jobs/Reservations)
│   ├── calendarGrid.js        ← **F5 calendar-dedup.** Pure: `monthMatrix(year,month)` (the month-grid day matrix) + `windowGroups(items,{dateOf,todayStr,isOverdue,now})` (Overdue/This-Week/Next-30/Later). Shared by `BoardCalendar` (Tasks/Maintenance) + `JobCalendar` (Jobs) — each keeps its own chrome; the overdue predicate is injectable
│   ├── print.js               ← printLabel, printInventory
│   ├── imageResize.js         ← resizeImageForUpload
│   ├── roleHelpers.js         ← canManageMinistry, canManageItem, canManageSupply
│   ├── phone.js               ← formatPhone(value) — US phone formatter → (555) 555-5555; progressive (as-you-type) + display. Applied to People Access contacts, Maintenance vendors, public item-request form (input + display). NOT for users.phone (E.164 for Twilio SMS) or shepherdPeople (read-only PCO). One-time normalizer: scripts/backfill-phone-format.cjs
│   └── constants.js           ← ITEM_STATUS, RES_STATUS, TICKET_STATUS, ACCESS_RECORD_TYPE string enums
├── lib/
│   └── people.js              ← **Foundation F2 — the People model.** Pure, zero-import resolver that unifies `users` (auth) + `accessPeople` (People Access tracked people) into one uniform `Person`, collapsing the canonical `accessPerson.userId` link so a contractor-who's-also-a-user is never double-counted. Exports `PersonRef`/`makeRef`/`refKey`, `getPerson(ref, ctx)`, `listPeople(ctx)`, `isEligibleFor`, `shiftReadiness` (per-shift `ok`/`soon`/`blocked` readiness for a shift's required compliance — used by Event-Day ops), `complianceStatusForTracked`, and the shared expiry windows (`expiryStatus`, `EXPIRY_CRITICAL_DAYS=7`, `EXPIRY_WARNING_DAYS=30`). Operates on already-subscribed arrays (does NOT fetch). **Server twin = `functions/index.js` `isAccessEligible`** (commonjs, can't import this ESM lib); the two are pinned together by the parity suite in `functions/test/people-resolver.test.mjs`. Consume this instead of re-deriving expiry/link/role logic. See `docs/PLATFORM-FOUNDATIONS-2026-06-06.md` §Foundation 2.
│   ├── attention.js           ← **Foundation F4 — the Attention engine.** Pure ESM. Canonical `AttentionItem` + 8 hub-gated collectors + `computeAttention`/`summarizeAttention`. The single source of the overdue/expiring/low predicates, consumed by the Dashboard cards AND (via the CJS twin) the AI digest. **Server twin = `functions/lib/attention.js`** (CJS — deploy can't reach src/); pinned by the parity suite in `functions/test/attention.test.mjs`. Thresholds in `attention-thresholds.json`; cert windows reuse F2's `EXPIRY_*`. See `docs/FOUNDATION-F4-PLAN-2026-06-18.md`.
│   ├── attention-thresholds.json ← the ONE shared copy of F4's numeric windows (JSON imports in both Vite + Node). KEEP IN SYNC with the inlined copy in `functions/lib/attention.js` (parity-tested).
│   └── occurrences.js         ← **Foundation F5 — the Scheduled-Occurrences feed.** Pure ESM. Canonical `Occurrence` + 4 per-source adapters (reservation/shift/work-task/maintenance_due, each applying the legacy terminal-status skips) + `getOccurrences(ctx,{sourceTypes,range,includePay})` + the single `occurrenceToVEvent`/`buildCalendar` ICS mapping. Adapters operate on already-subscribed arrays (don't fetch). **Server twin = `functions/lib/occurrences.js`** (CJS — drives `icsCalendarFeed`); pinned by `functions/test/occurrences.test.mjs` (client≡server + byte-parity vs legacy `ics.js`). NB: COH materializes recurrence into per-date docs, so this is adapter+filter, NOT a read-time expander. See `docs/FOUNDATION-F5-PLAN-2026-06-18.md`.
└── data/
    ├── referenceData.js       ← Static reference inventory (not auto-seeded; reference only)
    ├── blogPosts.js           ← Blog post data: slug, title, description, date, keywords, content (markdown string)
    └── whatsNew.js            ← User-facing "What's New" log (newest-first {date,tag,title,body}). Surfaced via the account-menu "What's New" item (unseen dot) → WhatsNewModal. NOT the dev changelog (that's docs/CHANGELOG.md). **DOC RITUAL: when a user-VISIBLE change ships, add a plain-language, benefit-first entry here** — keep it fed or it goes stale.
```

## Known Pitfalls (moved from root CLAUDE.md 2026-10-15, text unchanged)

### 🔴 Import name shadowing → TDZ crash in production
Never re-declare an imported name as a local `const`/`let` inside a function body in the same file. esbuild's minifier assigns the same short name to both, creating a Temporal Dead Zone error ("Cannot access 'X' before initialization") that crashes the app in production but is invisible in development.

```js
// ❌ WRONG — shadows the `ref` import from firebase/storage
import { ref } from 'firebase/storage';
function MyComponent() {
  const ref = useRef(); // TDZ bug after minification
}

// ✅ CORRECT — use a distinct name
function MyComponent() {
  const inputRef = useRef();
}

// ✅ ALSO CORRECT — alias the import (see ItemsPage.jsx)
import { ref as storageRef } from 'firebase/storage';
```

**Variant — too many variables in one component:** Even without an explicit name match in source code, a component with many imports AND many `useState` declarations can trigger the same crash. esbuild assigns short names sequentially without full scope analysis; once module-scope and function-scope names converge on the same two-character identifier (e.g. `Pn`, `on`, `Se`), the TDZ crash occurs. Consolidating `useState` calls just shifts which name collides — it doesn't fix the root cause.

**The permanent fix (Phase 19): `vite.config.js` uses Terser with `mangle: false`.** This keeps all variable names as their original source names, making name collisions structurally impossible. Switching to Terser alone was not enough — code splitting alone was not enough either, because app-internal modules (e.g. `useFirestore`) also produce module-scope vars that collide with page component `useState` vars in the same chunk. `mangle: false` is the only reliable solution. `compress: true` still strips dead code and whitespace. Bundle gzip size increases modestly (~130 KB) but correctness outweighs size. **Do not re-enable `mangle: true` or switch back to esbuild.**

**Second pitfall exposed by `mangle: false` — `useState` declared after `useEffect` that uses it:** Once variable names were readable, a genuine source-level TDZ appeared: `bulkModal`, `bulkMode`, and `isAdmin`/`isManager` were referenced in a `useEffect` dependency array that appeared *before* their `useState`/derived declarations in the component body. React evaluates dependency arrays immediately during render, so accessing a `const` before its declaration throws TDZ. **Rule: always declare all `useState` calls and derived values that appear in `useEffect` dependency arrays *before* any `useEffect` in the component body.**

### 🟡 `setMonth()` rolls over on month-end dates
`date.setMonth(n + 1)` silently overflows to the next month when the current day doesn't exist in the target month (e.g. Jan 31 + 1 month → Mar 3, not Feb 28). Always clamp after advancing:

```js
const day = date.getDate();
date.setMonth(date.getMonth() + interval);
const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
if (date.getDate() < day) date.setDate(lastDay); // clamp to month-end
```

This pattern lives in `advanceOnce()` in `src/utils/date.js` (the shared recurrence engine behind `calculateNextDue`/`generateRecurrenceDates`) and its parity-tested server twin `functions/lib/recurrence.js`. Pages (Tasks/Maintenance/Reservations/Jobs) call into the shared util — they no longer inline the month math. The canonical cadence list (`RECURRENCE_FREQS`) also lives in `date.js` next to the math. The only remaining raw `setMonth` calls are InsightsPage chart-axis buckets (range cutoffs, not date-string output — low risk).

### 🟡 `toISOString()` returns UTC — wrong date in US timezones
`date.toISOString().slice(0, 10)` converts to UTC before formatting. For users in US timezones (UTC−5 to UTC−8), a date like "April 15 at 11pm local" becomes "April 16" in UTC — off by one day. Always use local-time formatting for date strings that will be compared to stored `YYYY-MM-DD` date fields:

```js
// ❌ WRONG — UTC conversion causes off-by-one for US users
const today = new Date().toISOString().slice(0, 10);

// ✅ CORRECT — local time
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const today = localDateStr(new Date());
```

`localDateStr` is defined in `src/utils/date.js`. Import it instead of using `toISOString()` anywhere a `YYYY-MM-DD` date string is needed.

### 🟡 Bare `>` in JSX text content
esbuild's strict JSX parser rejects bare `>` characters in JSX text (e.g. `<P>Settings > Team Members</P>`). Use `→` for navigation paths or `{'>'`} to escape. Running `npm run build` will surface these immediately.

### 🟡 Pseudo-selector styles (`:focus`, `:hover`) require global CSS
Inline styles cannot target pseudo-selectors. The workaround for focus states is a global CSS rule in `index.html` — not `onFocus`/`onBlur` handlers on every input. The existing rule in `index.html` covers all `input`, `select`, and `textarea` elements with a teal border + glow on focus. For hover states on interactive elements, use `onMouseEnter`/`onMouseLeave` handlers inline (see KanbanColumn, TicketCard).

### 🟡 Stale-chunk errors after a deploy = stale chunk, not a bug (two message variants)
Each build emits new hash-named chunks; the host removes the old ones. A browser still running the previous build requests an old chunk that no longer exists. This surfaces as **one of two** `TypeError`s depending on how Vercel responds to the missing file:
- `TypeError: Failed to fetch dynamically imported module: .../X-<hash>.js` — the chunk 404s before the catch-all rewrite catches it.
- `TypeError: 'text/html' is not a valid JavaScript MIME type.` — the `/(.*) → /app.html` catch-all returns 200 + HTML instead, and `X-Content-Type-Options: nosniff` makes the browser reject it. (Sentry `63a627a0`, fixed 2026-05-27.)

Both have the same root cause and the same fix. **Never use a raw `lazy(() => import(...))` or a raw `import(...)` for app modules — always route through `src/utils/lazyWithRetry.js`:** `lazyWithRetry(factory, name)` for React components (e.g. hub routes in `HubsPage.jsx`), or the bare `importWithRetry(factory, name)` primitive for non-component dynamic imports. The generic `catch` covers **both** message variants: it retries once, then forces a one-time `window.location.reload()` (sessionStorage-guarded against reload loops) to pull the fresh manifest. **The entry-point imports in `main.jsx` (`App.jsx`, `firebasePublic.js`, `PublicJobsPage.jsx`) are wrapped with `importWithRetry`** — these run before any React tree mounts, so a stale chunk there is fatal with no error boundary to catch it (that was the `63a627a0` gap). Third-party background loads (posthog, qrcode, zxing) are intentionally left raw — they're post-mount and non-fatal. As terminal fallback for component chunks, `ChunkErrorBoundary` (in `components/primitives/`, wrapping the hub `<Suspense>` with `key={hubKey}`) shows a *"New version available — Reload"* card instead of a hung spinner and reports to Sentry with `boundary:hub`/`chunkError` tags. **Residual gap (accepted):** none of this runs in a tab still on an *older* build during a deploy — only host-side asset retention (Vercel Skew Protection) closes that, and it's not enabled. If Sentry shows this error it's a returning user on an old tab — not actionable beyond confirming the self-heal fired.

### 🟡 Sentry "Service worker registration failed" is best-effort noise, not a server bug
The SW is an optional PWA layer (network-first, no stale data) with **zero user-facing impact** — registration failing only loses the install prompt + offline shell. The `index.html` `.catch` logs at `console.warn` (not `console.error`) **on purpose** so Sentry's `captureConsole({levels:['error']})` doesn't file it. Do **not** re-promote it to `console.error`. If you see this in Sentry, it's a stale pre-`7446b6e` event or a warn-level breadcrumb. The vercel.json catch-all does **not** swallow `/sw.js` / `/manifest.json` / icons — Vercel static-file precedence serves them before rewrites (verified by prod probes 2026-05-18: all `200` with correct MIME). Don't re-investigate a rewrite fix for this — it was already disproven.

### 🟡 Sentry `functions/deadline-exceeded` after an iOS background = client timer, not a server failure
A callable's 70s timeout is client-side. iOS Safari suspends a hidden tab, and on resume the timer fires even though the server already answered (JAVASCRIPT-REACT-1K, 2026-10-18: Cloud Run 200 in 8.9s, error logged 8 min later). `invokeEmailCF` in `JobsPage.jsx` tracks whether the tab was hidden at ANY point during the call; if so, a `functions/deadline-exceeded` logs at `console.warn` + breadcrumb only. A timeout with the tab visible throughout still reports in full. Before trusting such an event, check the function's Cloud Run log for the request's status.

### 🟡 Sentry "Connection to Indexed Database server lost" is benign Firebase Auth noise
`UnknownError: Connection to Indexed Database server lost. Refresh the page to try again` comes from **Firebase Auth's** IndexedDB token-store persistence when the browser drops the IDB connection (Safari/iOS eviction, backgrounded/killed tab, cleared site data, private mode). It is transient, environmental, and self-heals on the refresh the SDK's own message prompts. Firestore offline persistence is **not** enabled (no `initializeFirestore`/`persistentLocalCache`/`enableIndexedDbPersistence` in `src/`), so it is never a data-cache corruption. Dropped in `src/main.jsx` `beforeSend` (`msg.includes('Connection to Indexed Database server lost') → null`, added 2026-05-19, sibling to the `@firebase/firestore` snapshot-listener filter). If you see it in Sentry it's a stale pre-fix event — **do not** "fix the IndexedDB connection" (impossible from app code) or remove the `beforeSend` rule.
