# CHANGELOG.md

Archive of completed phases, resolved checklist items, and fixed issues. Moved here from CLAUDE.md to keep active guidance concise.

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
