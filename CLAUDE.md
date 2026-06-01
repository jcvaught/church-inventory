# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Further Reading

- `docs/DATA_MODEL.md` — Firestore collection schemas and rules summary
- `docs/BUSINESS_MODEL.md` — Hub pricing, subscription doc, grandfathering, per-user hub access
- `docs/CHANGELOG.md` — All phase history and dated fixes
- `docs/SENTRY-ALERTS.md` — Sentry alert rules to configure for Jobs Hub launch
- `docs/SEO-REFOCUS-2026-05-26.md` — internal-link rewire plan for volunteer-coordinator post; verify script for 2026-06-23 re-check

## Commands

```bash
npm run dev       # Start dev server (Vite, typically http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint — catch bugs and hook violations (0 errors baseline)
npm run lint:fix  # ESLint with auto-fix
npm run analyze   # Build + open bundle size visualizer in browser (dist/bundle-stats.html)
npm run test:e2e  # Playwright E2E suite against prod (~80s, requires E2E_MEMBER_B_EMAIL env)
```

**Run `npm run build` and fix any errors before pushing.** Run `npm run lint` regularly — the baseline is 0 errors, ~45 intentional `exhaustive-deps` warnings. Any new errors should be fixed before committing.

### E2E test suite

Playwright suite at `e2e/` mirrors the Court Climber pattern (Firebase v12 IndexedDB auth state per role, per-spec teardown via Admin SDK, three roles: admin / member-a / member-b). 67 tests covering every section of `docs/TEST-JOBS-HUB-2026-05-07.md` (§2–§11), the 2026-05-22 audit-fix verification specs (`audit-rules.spec.js`, `audit-ui.spec.js` — T1–T8), and the 2026-05-22 UAT automation (`uat-ui.spec.js` — M13 time/tooltip, M10 PII warning + share-confirm, L9 waiver Modal gating, M8 contrast, L8 aria; `uat-sms.spec.js` — M6 STOP/START + recycled-phone protection). Runs against PROD against a dedicated `e2e-test-church` tenant (E2E isolation Layer 1, 2026-05-26); cleans up after itself via `purgeE2EArtifacts()` which now uses `firestore.recursiveDelete()` so `jobListings/{id}/signups` and `…/waitlist` subcollections get reaped along with the parent. Last clean run 2026-05-26: 60 passed, 0 failed, 7 skipped (~2.5 min; skips = SMS smoke + UAT SMS gated, L9 owner-tab gated to jcvaught@, public-board gated on getPublicJobs cache race, plus standard baseline skips). Phase 2's `ConfirmDialog` migration broke the old `page.once('dialog', d => d.accept())` pattern — use `acceptConfirm(page, label)` / `dismissConfirm(page, label)` from `e2e/admin-helpers.js` instead; both use `getByRole('dialog').last()` to target the topmost modal when ConfirmDialog stacks on top of a content modal. Rule-rejection tests use a pure-Node client SDK in `e2e/client-helpers.js` (Firestore rules enforce equally in Node and browser); the UAT SMS spec uses `e2e/sms-helpers.js` to sign requests with `TWILIO_AUTH_TOKEN` from `functions/.env` and POST to the live `twilioInbound` endpoint. Admin SDK in `e2e/admin-helpers.js` is for seeding/cleanup only.

**activityLog schema for E2E assertions:** docs are `{ action, itemId, performedBy, performedByName, timestamp, details }` (see `useFirestore.js:394` `logActivity`). When asserting log entries, query `where('action', '==', '...')` and filter on `itemId` — *not* `kind`/`target` (a bug that landed in `crud.spec.js` because it was committed without an end-to-end run). `logActivity` fires async after the mutation it follows, so wrap log assertions in `expect.poll`.

```bash
# Full suite (~80s)
E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e

# SMS smoke test — gated; sends a real SMS via Twilio
E2E_RUN_SMS=1 E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e -- sms
```

Test accounts (all in the dedicated `e2e-test-church` tenant — Layer 1, 2026-05-26): `e2e-admin@churchopshub.com` / `E2eTestPass123!` (admin), `e2e-member-a@churchopshub.com` / `E2eTestPass123!` (Member A), `e2e-member-b@churchopshub.com` / `E2eTestPass123!` (Member B). All managed via Admin SDK; `scripts/serviceAccountKey.json` holds the credentials. Tenant is bootstrapped by `scripts/setup-e2e-tenant.mjs` (idempotent — re-run to repair drift; mints any missing Auth user, writes church + config docs with `grandfathered: true` so every hub unlocks without Stripe, deletes `allowedHubs` field on user docs since `firestore.rules:34` treats field-missing as "full hub access" but field-present-with-null as "no hubs"). `src/utils/testAccounts.js` (`excludeTestAccounts`, matches the `@churchopshub.com` domain) still filters these out of member-facing pickers + the billable seat count for any real church; do not surface test accounts in UI lists. `jcvaught@gmail.com` was retired from the suite 2026-05-26 — still a real FXCC member, just no longer driven by tests. One follow-up: L9 owner-tab test is skipped because its owner gate at `SettingsPage.jsx:130` is hardcoded to `['jcvaught@gmail.com', 'jvaught@fxcc.org']`; adding `e2e-member-a@churchopshub.com` to that allowlist would let anyone register that Firebase Auth email and claim owner privileges in real customer churches.

When the E2E suite mysteriously fails at the auth-setup step with "Failed to verify your browser / Code 21," Vercel's bot protection has flagged the headless browser. `playwright.config.js` sets a realistic Chrome User-Agent to minimize this; if it still trips, wait ~5 min and retry.

### Deployment

Deployed via Vercel (auto-detect Vite). Firebase config is hardcoded in `src/firebase.js` (not via env vars).

To deploy Firestore/Storage rules: `./node_modules/.bin/firebase deploy --only firestore:rules,storage` (requires `firebase login` first). `.firebaserc` is configured with project ID `church-inventory-9615c`.

**TODO:** Set a Firebase billing budget in Google Cloud Console to catch unexpected usage spikes. (Console-only — no code change needed.)

## Architecture

This is a single-page React 18 + Vite PWA — **ChurchOpsHub** — a multi-tenant operations platform for churches backed by Firebase (Firestore + Auth). Free inventory hub plus paid hubs for maintenance, insights, coordination, accountability, people access, tasks, and jobs. Tagline: *"Run Your Church"*.

### File Layout

```
src/
├── App.jsx                    ← AuthScreen + AppShell (tabs, mobile nav) + root App (~368 lines)
├── useAuth.js                 ← Firebase Auth hook (email/password + Google, church setup/join)
├── useFirestore.js            ← All Firestore CRUD as a single hook (incl. maintenance)
├── firebase.js                ← Firebase app init; exports `db`, `auth`, `googleProvider`, `storage`
├── firebasePublic.js          ← Minimal init (firebase/app only, no Auth/Firestore/Storage); used by main.jsx when `?jobs=` is present so anonymous teen traffic never imports the authenticated SDKs (audit 2026-05-23 perf C-1)
├── main.jsx                   ← React entry point; initializes Sentry (@sentry/react v10) with browserTracing + captureConsole({levels:['error']}) — defaults also catch window.onerror, unhandled rejections, and breadcrumbs. Routes `?jobs=` URLs to a minimal tree (firebasePublic + PublicJobsPage) BEFORE importing App.jsx — cut anonymous bundle from ~2 MB to ~480 KB raw
├── hooks/
│   ├── useMobile.js           ← MobileCtx + useWindowWidth (breakpoint 768px)
│   └── useSubscription.js     ← Subscription state hook: hasHub(), canAddUser(), isTrialing()
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
│   │   └── UpgradeGate.jsx    ← Paywall component; shows upgrade card when hub inactive. Optional `previewSrc`/`previewAlt` renders a hub screenshot above the card with a `mask-image` bottom fade (audit 2026-05-24 Phase 6). Subscribe + Contact buttons fire `window.posthog?.capture('upgrade_gate_click', { hubName, action })` — telemetry is try/catch'd so it never blocks Stripe checkout. JPEG previews live in `public/upgrade-previews/<hub>.jpg`.
│   └── SEO.jsx                ← Reusable SEO component (react-helmet-async); sets title, description, canonical, OG tags, Twitter card, JSON-LD
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
│   ├── VolunteerHome.jsx      ← Volunteer landing — replaces Dashboard for `isVolunteerOnly(userProfile)` (role:user + allowedHubs=['jobs']). Sections: greeting · Next Shift gradient card with Add-to-Calendar (.ics) · upcoming shifts · open-this-week · "View all jobs" + "Open calendar" CTAs. Subscribes to `collectionGroup('signups').where('uid','==',userId)` directly.
│   ├── ItemsPage.jsx
│   ├── SuppliesPage.jsx
│   ├── ReservationsPage.jsx
│   ├── ActivityLogPage.jsx
│   ├── SettingsPage.jsx       ← Includes Subscription & Billing card for admins; My Compliance card (shows linked accessPerson records for current user); Team Members compliance badges (🔴/🟡 when linked users have expiring records)
│   ├── HubsPage.jsx           ← Hub picker + sub-navigation container; renders hub cards and routes into active hub with breadcrumb. **Single-hub users** (`allowedHubs.length === 1`) skip the picker entirely — `useEffect` auto-calls `onOpenHub(allowedHubs[0])` and the picker renders `null` in the interim so the upgrade grid never flashes. Volunteers only see their own hub card if they ever do reach the picker, and the All-In Bundle callout is admin/manager-only.
│   └── hubs/
│       ├── MaintenancePage.jsx     ← Maintenance Hub (Phase 3)
│       ├── InsightsPage.jsx        ← Insights Hub (Phase 4): utilization, ministry, seasonal, financial, supply analytics (Recharts)
│       ├── CoordinationPage.jsx    ← Coordination Hub (Phase 6): checkout bundles, email notification settings
│       ├── AccountabilityPage.jsx  ← Accountability Hub (Phase 7): physical audits, chain of custody, insurance export
│       ├── PeopleAccessPage.jsx    ← People Access Hub: background checks, key assignments, certifications, custom compliance milestones; bulk entry modal; link/unlink to user accounts
│       ├── TasksPage.jsx           ← Tasks Hub: general-purpose Kanban task board; visibility control (team/private/shared, no admin override — private tasks are truly private); assignees filtered to Tasks Hub users only; per-user task defaults (taskDefaultVisibility + taskDefaultSharedWith saved to users/{uid}); High priority pinned to top of each Kanban column (overridden when manual sortOrder is set via within-column drag); @-mention button in comments with SendGrid notification (sendTaskMentionEmail CF); time tracking (estimatedHours/actualHours); ministry-scoped field + filter; Insights view (12-week velocity BarChart, Recharts); comments; recurrence; TSK-### numbering; subtasks (parentTaskId); task dependencies (blockedBy TSK-### soft warning); bulk actions (list view checkboxes — bulk status change + bulk delete + bulk assign); bulk paste-import (Paste Tasks button — auto-detects plain lines or TSV with header; supports Name/Description/Priority/Status/Due Date/Assignee columns; sequential to avoid maxTaskNumber transaction contention; 200/import cap); task templates (save via modal with optional auto-generate schedule; generateRecurringTemplateTasks scheduled CF); saved filter views (persisted on users/{uid}); link to item/ticket; Calendar view (month grid + mobile grouped list); CSV export (includes ministry, estimatedHours, actualHours); ICS export (tasks with due dates); due-date reminder emails (sendTaskDueReminders scheduled CF); → Job convert (admin: mini-modal creates job + writes linkedJobDocId backref); → Ticket convert (admin: creates maintenance ticket + writes linkedTicketDocId backref)
│       └── JobsPage.jsx            ← Job Hub: teen job board; admins post jobs (JOB-###, date/time/location/pay/spots/requiredAccessTypes); members sign up via the jobSignUp Cloud Function (server-side compliance + waiver + capacity enforcement; audit H1/H2); the roster lives in protected signups/waitlist per-uid subcollections, parent carries signupCount/waitlistCount; "My Jobs" filter; announcement board with pin/expiry; cancellation emails via sendJobCancelledEmails CF; morning reminder emails via sendJobReminders scheduled CF (also sends SMS to opted-in users); roster names visible per the jobsRosterVisibility setting (admin/signups/all — rule-enforced via canSeeJobRoster); activity log for all job actions; Schedule view (roster table: date/job/location/spots progress/status); Calendar view (month grid + mobile grouped list); 4 view tabs: Job Board, Schedule, Calendar, Announcements; waitlist + auto-promotion (promoteFromWaitlist CF); waiver/consent gate; per-job attendance tracking; volunteer Reports leaderboard; ICS export in Schedule view; Share Board button (admin) copies public job board URL; → Task convert (admin: mini-modal creates task + linkedTaskDocId backref); swap/replacement requests (member → modal → jobSwapRequests collection; admin sees + dismisses in detail modal)
├── utils/
│   ├── csv.js                 ← exportItemsCSV, exportSuppliesCSV, exportReservationsCSV, exportAccessRecordsCSV
│   ├── ical.js                ← exportTasksICS(tasks, churchName), exportJobsICS(jobs, churchName) — client-side .ics Blob download; all-day events use DTEND=day+1 per iCal spec
│   ├── date.js                ← localDateStr(d) — shared local-timezone YYYY-MM-DD formatter; import instead of toISOString()
│   ├── print.js               ← printLabel, printInventory
│   ├── imageResize.js         ← resizeImageForUpload
│   ├── roleHelpers.js         ← canManageMinistry, canManageItem, canManageSupply
│   └── constants.js           ← ITEM_STATUS, RES_STATUS, TICKET_STATUS, ACCESS_RECORD_TYPE string enums
└── data/
    ├── referenceData.js       ← Static reference inventory (not auto-seeded; reference only)
    └── blogPosts.js           ← Blog post data: slug, title, description, date, keywords, content (markdown string)
public/
├── robots.txt                 ← Disallows ?request=, ?signup, ?invite; references sitemap
├── sitemap.xml                ← Static sitemap: /, /?help, /blog, and all 3 blog post URLs
└── google254ab6f07b8682a3.html ← Google Search Console ownership verification file
functions/
├── index.js                   ← Cloud Functions: createCheckoutSession, createPortalSession, stripeWebhook, getPublicJobs (onCall, no auth — sanitized public job board: takes churchId, strips signups[]/waitlist[]/attendance, returns display fields + signupCount; replaces direct-Firestore-list path which leaked teen names), sendReservationEmail, sendTicketAssignedEmail, sendJobAnnouncementEmails, sendJobCancelledEmails, sendJobReminders (scheduled 8am Central daily — emails all signups; also sends SMS to users with phone+smsRemindersEnabled via Twilio), closePastJobs (scheduled 2am Central daily — collectionGroup query flips `status: 'open' → 'completed'` when scheduledDate < today; prevents past-but-unfinished jobs accumulating in the Open filter), sendJobPosterNotification (onCall — poster + delegates notified on withdrawal or co-admin cancellation; 30s double-fire guard), sendTaskDueReminders (scheduled 8am Central **Mondays** — weekly digest, collectionGroup query on tasks.dueDate), sendTaskMentionEmail (onCall — notifies mentioned users when @name appears in task comment), generateRecurringTemplateTasks (scheduled 8am Central daily — creates tasks from templates with autoGenerate==true; also advances repeatWeekly job announcements), jobSignUp / jobWithdraw / jobSetAttendance (onCall — all Jobs Hub roster writes; operate on the signups/waitlist per-uid subcollections, maintain signupCount/waitlistCount, enforce compliance + waiver + capacity server-side; audit H1/H2, 2026-05-22), promoteFromWaitlist (onCall — moves the first waitlist subcollection entry into signups, sends transactional notifications via sendWaitlistPromotionNotifications: email + an SMS to opted-in users [phone+smsRemindersEnabled, A2P Messaging Service, STOP footer — same plumbing as sendJobReminders]; carries acknowledgedWaiverAt forward; jobWithdraw also promotes inline server-side), sendWelcomeEmail (Firestore onCreate trigger on churches/{churchId}), processTrialExpirations (scheduled 2am Central daily — trial expiry + 7-day warning emails), setEmailSuppressionActive (onCall, owner-only — flips emailSuppressions/{id}.active so the owner can re-subscribe/re-suppress an address from Settings → Email tab; audit L9); shared subHasHub() helper used by all hub-gating CFs; `withScheduledRun(name, fn)` heartbeat helper wraps every onSchedule body and writes `scheduledJobRuns/{name}` with `{ status, startedAt, finishedAt, durationMs, lastError }` so a missing/failed run is detectable (audit 2026-05-23 obs-H1; `getPublicJobs` also gets a per-instance 60s in-process cache, perf M-1); `isEmailSuppressed` fail-open with Sentry capture on read errors (obs-H4); `monitorScheduledJobs` (onSchedule, hourly — reads every `scheduledJobRuns/{name}` heartbeat and Sentry-captures missing/failed/hung/stale jobs with `area:job-monitor` + `scheduledJob:<name>` + `reason:<…>` tags; pre-launch error-handling pass 2026-05-24; **fresh-deploy tolerance 2026-05-25**: a missing doc writes an `awaiting-first-run` placeholder with `firstSeenMissing: serverTimestamp()` on first observation, and only alerts once that gap exceeds the cadence's stale window — `withScheduledRun` overwrites the placeholder cleanly on the first real fire); (all email via **Brevo** — migrated off SendGrid 2026-06-01 when its free tier went to 0/month post-trial; `sendEmailSafe` wraps the `sendViaBrevo` helper [Node 22 fetch, no SDK], `BREVO_API_KEY` in functions/.env, `churchopshub.com` must be authenticated in Brevo; the SendGrid event webhook `sendgridEventWebhook` is now inert — wiring a Brevo event webhook to repopulate `emailSuppressions` is a follow-up; SMS via Twilio Programmable Messaging — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_MESSAGING_SERVICE_SID in functions/.env; sendJobReminders sends via the A2P-registered Messaging Service (messagingServiceSid) when TWILIO_MESSAGING_SERVICE_SID is set, falling back to the bare from-number; sender: churchopshub@gmail.com; replyTo: jcvaught@gmail.com on welcome/trial emails)
└── package.json               ← Node 22, firebase-functions v7, firebase-admin v13, stripe v14, @sentry/node (server-side error capture, same DSN as browser; defaults catch process uncaughtException + unhandledRejection); npm overrides force-bump 4 transitive vulns: `protobufjs: ^7.5.8`, `axios: ^1.16.0`, `fast-xml-parser: ^5.5.6`, `path-to-regexp: 0.1.13` (the path-to-regexp pin must stay in the 0.1.x line for express 4 compat — newer majors changed the route-pattern API)
```

### Data Flow

`App` (in `App.jsx`) → `AppShell` (also in `App.jsx`) → renders one of nine tab pages, each receiving `store`, `userProfile`, and `subscription` as props.

- `useAuth()` handles authentication state and exposes `userProfile` (Firestore user record with `churchId`, `role`, `name`).
- `useFirestore(churchId)` subscribes in real-time to all Firestore collections for that church and exposes CRUD operations.
- `useSubscription(churchId)` reads `churches/{churchId}/config/subscription` and exposes `hasHub(name)`, `canAddUser(count)`, `isTrialing(name)`.
- `store` passed to pages is the return value of `useFirestore`.

### Firestore Data Model (Multi-Tenant)

Full collection schemas and Firestore rules summary: `docs/DATA_MODEL.md`. Quick summary: all church data lives under `churches/{churchId}/`; `churchId = {creatorUid}-church`.

### Auth Flow

1. **Create church** — admin creates a church with a unique alphanumeric church code; their UID becomes the churchId prefix.
2. **Join church** — new members register with email/password or Google, entering the church code to be linked to the right `churchId`.
3. Firestore rules use granular per-subcollection rules (not a wildcard). Key constraints:
   - `config/subscription` — client create only at church creation time; no client updates (webhook/Admin SDK only)
   - `activityLog` — immutable; members can create, nobody can update or delete
   - `maintenanceTickets` — members can update (edit fields, assign, move status); only admin/manager can create or delete
   - `maintenanceTickets/comments` — any member can create; authors can update/delete their own; admin/manager can update/delete any
   - Users cannot self-escalate role: create requires `role == 'user'` (or `role == 'admin'` only if churchId matches own church); self-updates cannot change `role`, `churchId`, `active`, or `allowedHubs`
   - Storage rules enforce 5MB max upload size and `image/*` content type only

### UI Conventions

- **No CSS files, no component library, no router.** All styling is inline using a `B` brand token object from `src/components/brand/tokens.js`.
- Two font families: `f1 = 'Outfit'` (headings/UI), `f2 = 'Source Sans 3'` (body text) — loaded from Google Fonts at runtime.
- Shared style objects: `inp` (inputs), `btnP` (primary button), `btnS` (secondary), `btnD` (danger) — all from `src/components/brand/tokens.js`.
- Reusable primitives in `src/components/primitives/`: `Modal` (focus-traps Tab/Shift+Tab inside the panel; focuses the first form input on open), `FF` (form-field wrapper — for native `<input>`/`<select>`/`<textarea>` children it injects `id` + `aria-required`/`aria-invalid` via `cloneElement`; for custom-component children it wraps with `role="group"` + `aria-labelledby`; renders a red `*` after the label when `required`), `RichTextarea` (auto-grow textarea with bullet/numbered list toolbar and optional `label` prop), `Badge` (status pill), `Stat` (dashboard stat card), `Spinner`, `UpgradeGate`, `StatusDot` (colored dot + accessible label, default sr-only), `EmojiIcon` (wraps an emoji with `aria-hidden` decorative mode or `role="img"` + `aria-label` semantic mode — every emoji in JSX should go through this).
- Tab keys: `dashboard`, `inventory`, `supplies`, `reservations`, `log`, `hubs`, `settings`. All paid hubs are accessed via the `hubs` tab through `HubsPage`. Hub picker shows cards for all 6 hubs (Insights, Maintenance, Coordination, Accountability, People Access, Tasks) — active hubs show "Open →", inactive show price and upgrade CTA. Clicking a hub sets `hubKey` (stored in `localStorage` as `lastHub`) and renders the hub with a `← All Hubs` breadcrumb. Clicking "Hubs" nav tab while already on hubs resets to the picker.
- `MobileCtx` React context + `useWindowWidth()` hook in `src/hooks/useMobile.js`. Components read `useContext(MobileCtx)` — no prop drilling needed. Breakpoint is 768px.
- Mobile: tabs hidden, bottom nav bar fixed at bottom, modals slide up from bottom.
- **Routing:** No router library. `App.jsx` checks `window.location.pathname` first (`/blog` → BlogIndex, `/blog/:slug` → BlogPost, `/privacy` → PrivacyPage, `/terms` → TermsPage, `/sms-program` → PublicSMSProgramPage, `/help` → HelpPage), then query params (`?request=` → PublicRequestPage, `?jobs=CHURCH_ID&cn=ChurchName` → PublicJobsPage, `?help`/`?privacy`/`?terms`/`?sms-program` → corresponding pages [legacy fallback], `?signup`/`?invite` → AuthScreen), then auth state (unauthenticated → LandingPage, authenticated → AppShell). Both pathname and query-param forms work for the public disclosure pages; the clean paths are SEO-friendly + Vercel-rewrite-friendly.
- **Deep linking:** `?item=ITEM_ID` URL param auto-opens item detail. URL cleaned with `history.replaceState` after read.
- **QR codes:** Generated locally via the `qrcode` npm package (`QRCode.toDataURL()`). Links back to the app with `?item=` param. In the item detail modal, the QR data URL is stored in `detailQrUrl` state (generated in a `useEffect` when `showDetail` changes). `printLabel` is async (awaits `QRCode.toDataURL()` before opening the print window).
- **Firebase Storage** (Blaze plan): item photos stored under `churches/{churchId}/items/`. Images are client-side resized to max 1200px / 82% JPEG quality before upload via Canvas API (`resizeImageForUpload`).
- **Volunteer-only mode (2026-05-27):** When `isVolunteerOnly(userProfile)` (`src/utils/roleHelpers.js`) is true — role `'user'` with `allowedHubs === ['jobs']` exactly — the app swaps to a jobs-first shell: 4-tab mobile nav (Home/Jobs/Activity/Settings, "Hubs" key relabeled "Jobs"), `VolunteerHome` replaces `Dashboard`, JobsPage defaults to Calendar on mobile, ActivityLogPage filters to `performedBy === userId`, and HubsPage hides every card except `jobs`. The predicate is deliberately narrow — `allowedHubs:null` (full access) and `['jobs','tasks']` both fall back to the standard admin-shaped shell. To extend to other single-hub volunteer modes (e.g. Tasks-only) generalize the predicate, not the branches.
- **Role enforcement:** Three roles — `admin`, `manager`, `user`. Enforced at both UI level and Firestore rules level. Shared helpers in `src/utils/roleHelpers.js` (`canManageMinistry`, `canManageItem`, `canManageSupply`, `isVolunteerOnly`).
  - **admin**: full access — team management, church code, billing, invite links, EmailJS config, plus all manager capabilities.
  - **manager**: full operational access — edit dropdown lists (Locations/Ministries/Tags); add/edit/retire items + supplies scoped to `managedMinistries[]`; approve/deny/checkout reservations for their ministries; create/manage maintenance tickets and vendors; run audits; create/edit/delete bundles. Cannot manage team members, billing, or EmailJS config.
  - **user**: day-to-day use — checkout/return items, request reservations (cancel own), log supply usage/restock, view all accessible hubs. Cannot add/edit items or supplies, approve reservations, or start audits. Cannot see People Access Hub at all (hidden from picker and blocked on access).
  - Items/supplies with no ministry assigned are admin-only (managers cannot edit unscoped items).
  - Settings page: all users see a Profile card (name, email, role, managed ministries); Team Members section is admin-only; list editors (locations/ministries/tags) are editable by admin and manager.
  - Hub visibility per user controlled by `allowedHubs[]` on user profile (see `docs/BUSINESS_MODEL.md`).
- **SEO:** `react-helmet-async` installed; `<HelmetProvider>` wraps the app in `main.jsx`. Reusable `<SEO>` component in `src/components/SEO.jsx` sets `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags, Twitter Card tags, and optional JSON-LD via `<script type="application/ld+json">` (accepts object or array). Applied to LandingPage (SoftwareApplication + Organization schemas, featureList), HelpPage, PrivacyPage, TermsPage, BlogIndex, BlogPost (BlogPosting schema), PublicJobsPage (church-specific title/description/canonical), and PublicRequestPage. Blog posts use `ogType="article"`. Google Search Console verified via `public/google254ab6f07b8682a3.html`. Sitemap at `public/sitemap.xml` — update `lastmod` on `/` and `/?help` when those pages change; add new blog posts with their publish date and `changefreq: yearly`.
- **AppShell footer (desktop only):** Displays logo, domain, and links to Help Center and Blog. Hidden on mobile (`!isMobile`). Blog link uses `href="/blog"` — works via Vercel catch-all rewrite.
- **localStorage:** Items page persists `locationFilter`, `ministryFilter`, and `statusFilter` under keys `inv_locationFilter` / `inv_ministryFilter` / `inv_statusFilter`. Supplies page persists its location filter and sort order under `sup_locationFilter` / `sup_sortBy`. Reservations page persists the Equipment/Space resource type toggle under `res_resourceType`.

### Item Status Values

`Available` | `Checked Out` | `In Use` | `Under Repair` | `Disposed`

## Business Model — Hub-Based Monetization

**"The stuff is free, what you do with the stuff is paid."** Inventory Hub is forever free (10 users included). Paid hubs:

| Hub | Price |
|-----|-------|
| Team Hub | $9/mo (25 users) or $19/mo (unlimited) |
| Insights Hub | $7/mo |
| Maintenance Hub | $7/mo |
| Coordination Hub | $7/mo |
| Accountability Hub | $5/mo |
| People Access Hub | $7/mo |
| Tasks Hub | $7/mo |
| Job Hub | $7/mo |
| All-In Bundle | $29/mo (all hubs) |

New churches get a 90-day free trial of all paid hubs. Feature gating via `useSubscription` + `UpgradeGate`. See `docs/BUSINESS_MODEL.md` for subscription doc schema, grandfathering, feature gating details, and per-user hub access rules.

## Project History

All phase work and dated fixes: `docs/CHANGELOG.md`.

## Future Work

**Known limitations (documented, accepted):**
- ~~Roster names readable by any church member via raw Firestore SDK queries~~ — **resolved 2026-05-22** (audit H1). The Jobs Hub roster moved into protected per-uid subcollections (`jobListings/{id}/signups/{uid}`, `…/waitlist/{uid}`); writes are Cloud Functions only; reads are gated by `firestore.rules` `canSeeJobRoster()` per the `jobsRosterVisibility` setting. See `docs/CHANGELOG.md` (2026-05-22) and `docs/JOBS-HUB-H1-REFACTOR-STATUS.md`.
- Private task **comments** are visible to all church members via raw Firestore reads (Firestore rules cannot apply task.visibility to its comments subcollection). UI does not expose private-task comments to non-participants; the data-layer limitation is accepted.
- ~~Jobs Hub **Reports tab** (`reportsScope === 'all' | '90d'`) joins `reportsSignups` against the bounded `jobListings` array~~ — **resolved 2026-05-24**. The Reports leaderboard now lazy-fetches older jobs + their signups when the live `jobListings` snapshot is at its 500-cap AND the user picks 'all' scope, and merges them into `jobById` for enrichment. '30d'/'90d' scopes still skip the extras (rarely fall outside the cap at plausible church sizes). New `reportsExtraJobs` state + a one-line UI hint when extras are loaded. See `docs/CHANGELOG.md` (2026-05-24).

---

## Known Pitfalls

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

This pattern is used in `calculateNextDue()` (MaintenancePage) and `generateRecurrenceDates()` (ReservationsPage).

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

### 🟡 A2P/TCR Compliance API is create-only — FAILED campaigns can only be fixed via Console "Fix Campaign"

`POST/GET https://messaging.twilio.com/v1/Services/{MS}/Compliance/Usa2p` is **create + read only**:
- `DELETE` → **HTTP 405** *"resource does not support the attempted HTTP method DELETE"*
- `POST` over an existing record → **HTTP 409 Conflict**
- No `PUT`/update method

Once a campaign reaches terminal `FAILED`, the Messaging Service is permanently bound to that compliance record via API. To fix and resubmit, use the **Twilio Console → Trust Hub → A2P Campaigns → [Campaign SID] → "Fix Campaign →"** button on the campaign detail page (only appears when status is terminally Rejected, not the rejected-but-IN_PROGRESS limbo). That wizard re-uses the same Campaign SID + Messaging Service + Brand at no fee.

For TCR rejections **30921** (USE_CASE_DESCRIPTION / *"website requires authentication"*) and **30909** (MESSAGE_FLOW / CTA unverifiable), the structural fix is making the opt-in CTA reviewable **without login**:
1. A public no-login page that shows a faithful visual reproduction of the in-app consent form + the verbatim disclosure (`PublicSMSProgramPage.jsx` has `OptInFormScreenshot` for this). Prose descriptions of the flow are not enough — reviewers need to *see* the CTA.
2. Console fields to edit on resubmit: **Campaign description**, **"How do end-users consent to receive messages?"**, **Privacy Policy URL**, **Terms and Conditions URL**. The last two can silently sit empty after the initial registration — confirm they're populated.
3. Strip "authenticated web application", "TEST CREDENTIALS FOR REVIEWERS", and "sign in" framing from message_flow — those phrases are 30921's trigger even when accompanied by a public disclosure page.

Verify post-submit via API `GET` (description + message_flow update immediately; `errors[]` + `date_updated` lag until TCR re-reviews). **Don't verify the public page via curl** — `churchopshub.com` returns `x-vercel-mitigated: deny` (HTTP 403) to plain curl; use a real browser (Playwright) instead.

### 🟡 Gen-2 deploy can strip `allUsers` invoker IAM (silent 403 on webhooks)

Reproduced 2026-05-14 on `twilioInbound`. After `firebase deploy --only functions:<webhook-name>`, the Cloud Run service's `allUsers/roles/run.invoker` binding can be silently removed. Symptoms: Twilio/SendGrid/Stripe webhook calls return 403 before reaching your function, no logs, the third-party's logs show "delivered to webhook" but no callback fired.

**Always probe a redeployed webhook function before walking away:**
```bash
curl -X POST <function-url> -d "test=1"
```

A 403 with `content-type: text/html` and a 9-byte "Forbidden" body is **ambiguous** — the Google Frontend's IAM-strip response and the function's own signature-rejection (`twilioInbound` at `functions/index.js:2350`) look identical at the wire level (verified 2026-05-23). **Don't rely on the body alone.** The real disambiguator:
- Check Cloud Logging for the function's `console.warn('twilioInbound: invalid signature', ...)` entry on your test request's trace ID. **No log entry → IAM stripped. Log entry present → IAM fine, function rejected.**
- A 400/401 response = IAM fine (function returned a status code, so it reached the code path). Only 403 is ambiguous.

**Re-grant (if needed):**
```bash
# Either form works — they target the same Cloud Run IAM binding:
gcloud run services add-iam-policy-binding <service-name> \
  --region=us-central1 --project=church-inventory-9615c \
  --member=allUsers --role=roles/run.invoker
# Or, the function-aware shorthand:
gcloud functions add-invoker-policy-binding <FunctionName> \
  --region=us-central1 --project=church-inventory-9615c --member=allUsers
```

Applies to `twilioInbound`, `sendgridEventWebhook`, `stripeWebhook`, and any other Gen-2 `onRequest` function called by an unauthenticated third party.

**`onCall` callables are NOT immune — confirmed 2026-05-28.** A scoped redeploy of `createCheckoutSession` (onCall) stripped its `allUsers/run.invoker` (the two sibling onCalls in the same deploy kept theirs), so every browser caller — admins starting Stripe checkout — got **403 (`text/html` GFE rejection)** until a re-grant. onCall handlers need `allUsers` invoker too (auth happens *inside* via `req.auth`, not at the IAM layer). **The probe is cleaner for onCall than for a webhook:** `curl -X POST <url> -H 'Content-Type: application/json' -d '{"data":{}}'` returns **401 (JSON)** when the function is reached vs **403 (`text/html`)** when IAM is stripped — unambiguous, no log-trace check needed. So also probe `createCheckoutSession`, `createPortalSession`, `identifyItem`, `getChurchStats`, `getPublicJobs` after redeploying them.

### 🟡 Pseudo-selector styles (`:focus`, `:hover`) require global CSS
Inline styles cannot target pseudo-selectors. The workaround for focus states is a global CSS rule in `index.html` — not `onFocus`/`onBlur` handlers on every input. The existing rule in `index.html` covers all `input`, `select`, and `textarea` elements with a teal border + glow on focus. For hover states on interactive elements, use `onMouseEnter`/`onMouseLeave` handlers inline (see KanbanColumn, TicketCard).

### 🟡 Stale-chunk errors after a deploy = stale chunk, not a bug (two message variants)
Each build emits new hash-named chunks; the host removes the old ones. A browser still running the previous build requests an old chunk that no longer exists. This surfaces as **one of two** `TypeError`s depending on how Vercel responds to the missing file:
- `TypeError: Failed to fetch dynamically imported module: .../X-<hash>.js` — the chunk 404s before the catch-all rewrite catches it.
- `TypeError: 'text/html' is not a valid JavaScript MIME type.` — the `/(.*) → /app.html` catch-all returns 200 + HTML instead, and `X-Content-Type-Options: nosniff` makes the browser reject it. (Sentry `63a627a0`, fixed 2026-05-27.)

Both have the same root cause and the same fix. **Never use a raw `lazy(() => import(...))` or a raw `import(...)` for app modules — always route through `src/utils/lazyWithRetry.js`:** `lazyWithRetry(factory, name)` for React components (e.g. hub routes in `HubsPage.jsx`), or the bare `importWithRetry(factory, name)` primitive for non-component dynamic imports. The generic `catch` covers **both** message variants: it retries once, then forces a one-time `window.location.reload()` (sessionStorage-guarded against reload loops) to pull the fresh manifest. **The entry-point imports in `main.jsx` (`App.jsx`, `firebasePublic.js`, `PublicJobsPage.jsx`) are wrapped with `importWithRetry`** — these run before any React tree mounts, so a stale chunk there is fatal with no error boundary to catch it (that was the `63a627a0` gap). Third-party background loads (posthog, qrcode, zxing) are intentionally left raw — they're post-mount and non-fatal. As terminal fallback for component chunks, `ChunkErrorBoundary` (in `components/primitives/`, wrapping the hub `<Suspense>` with `key={hubKey}`) shows a *"New version available — Reload"* card instead of a hung spinner and reports to Sentry with `boundary:hub`/`chunkError` tags. **Residual gap (accepted):** none of this runs in a tab still on an *older* build during a deploy — only host-side asset retention (Vercel Skew Protection) closes that, and it's not enabled. If Sentry shows this error it's a returning user on an old tab — not actionable beyond confirming the self-heal fired.

### 🟡 Sentry "Service worker registration failed" is best-effort noise, not a server bug
The SW is an optional PWA layer (network-first, no stale data) with **zero user-facing impact** — registration failing only loses the install prompt + offline shell. The `index.html` `.catch` logs at `console.warn` (not `console.error`) **on purpose** so Sentry's `captureConsole({levels:['error']})` doesn't file it. Do **not** re-promote it to `console.error`. If you see this in Sentry, it's a stale pre-`7446b6e` event or a warn-level breadcrumb. The vercel.json catch-all does **not** swallow `/sw.js` / `/manifest.json` / icons — Vercel static-file precedence serves them before rewrites (verified by prod probes 2026-05-18: all `200` with correct MIME). Don't re-investigate a rewrite fix for this — it was already disproven.

### 🟡 Sentry "Connection to Indexed Database server lost" is benign Firebase Auth noise
`UnknownError: Connection to Indexed Database server lost. Refresh the page to try again` comes from **Firebase Auth's** IndexedDB token-store persistence when the browser drops the IDB connection (Safari/iOS eviction, backgrounded/killed tab, cleared site data, private mode). It is transient, environmental, and self-heals on the refresh the SDK's own message prompts. Firestore offline persistence is **not** enabled (no `initializeFirestore`/`persistentLocalCache`/`enableIndexedDbPersistence` in `src/`), so it is never a data-cache corruption. Dropped in `src/main.jsx` `beforeSend` (`msg.includes('Connection to Indexed Database server lost') → null`, added 2026-05-19, sibling to the `@firebase/firestore` snapshot-listener filter). If you see it in Sentry it's a stale pre-fix event — **do not** "fix the IndexedDB connection" (impossible from app code) or remove the `beforeSend` rule.

### 🟡 `firebase deploy --only firestore:indexes` silently skips two index kinds

`firebase deploy --only firestore:indexes` exits 0 with `✔ Deploy complete!` for two index shapes it never actually creates. The affected query then throws `FAILED_PRECONDITION: The query requires an index` at runtime, with no deploy-time signal that anything was wrong.

**Case A — COLLECTION-scope composite indexes.** A `COLLECTION`-scope composite (e.g. `jobListings` on `(recurrenceGroupId, scheduledDate)`) declared in `firestore.indexes.json` may be silently no-op'd when an existing `COLLECTION_GROUP` index has the same field list — the CLI thinks it's covered, but a single-collection query (`collection(...).where(...)`) needs an index whose `queryScope` is exactly `COLLECTION`. Bit us 2026-05-06 (Jobs Hub audit) and again 2026-05-27 (Jill's "this + all future" series edit — index had been missing in prod for 5 weeks). Fix with `gcloud`:

```bash
gcloud firestore indexes composite create \
  --project=church-inventory-9615c --collection-group=jobListings --query-scope=COLLECTION \
  --field-config=field-path=recurrenceGroupId,order=ascending \
  --field-config=field-path=scheduledDate,order=ascending
```

**Case B — COLLECTION_GROUP field-override indexes.** A `fieldOverrides` entry with a `COLLECTION_GROUP` index (e.g. `signups.uid`, `waitlist.uid` for the Jobs Hub roster) is not created by `firebase deploy`. `gcloud firestore indexes fields list --collection-group=<cg>` shows `Listed 0 items`, and `collectionGroup(...).where('uid','==',x)` fails. `gcloud firestore indexes fields update` can't fix it (its `--index` flag has no query-scope key) — create directly via the Firestore Admin REST API:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -X PATCH \
  "https://firestore.googleapis.com/v1/projects/church-inventory-9615c/databases/(default)/collectionGroups/signups/fields/uid?updateMask=indexConfig" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"indexConfig":{"indexes":[{"queryScope":"COLLECTION","fields":[{"fieldPath":"uid","order":"ASCENDING"}]},{"queryScope":"COLLECTION_GROUP","fields":[{"fieldPath":"uid","order":"ASCENDING"}]}]}}'
```

The build is near-instant on an empty collection. **Always probe new index-dependent queries against prod after a deploy** rather than trusting `Deploy complete!`. As a safety net, `useFirestore.js:handleErr` (2026-05-27) tags Firestore `failed-precondition / requires an index` errors with `missingIndex:true` at Sentry `level: 'fatal'` and extracts the Firebase Console URL — set up a Sentry alert on that tag to catch the next regression at the first occurrence.

### 🟡 `vercel.json` security headers MUST allow Firebase popup sign-in (FOUR allowances)

`authDomain` in `src/firebase.js` is the custom domain `churchopshub.com` (proxied to Firebase via the `/__/auth/(.*)` rewrite). `signInWithPopup` needs **all four** of these header settings, or Google sign-in/signup breaks **app-wide** while email/password keeps working (so it's easy to miss — and every blocked user silently falls back to email/password):

1. **CSP `frame-src` must include `'self'`** — the SDK loads a same-origin relay iframe at `https://churchopshub.com/__/auth/iframe`. An explicit `frame-src` overrides `default-src 'self'`, so omitting `'self'` blocks it.
2. **CSP `script-src` must include `https://apis.google.com`** — the relay iframe loads `apis.google.com/js/api.js` (gapi) to drive the popup handshake.
3. **`X-Frame-Options` must be `SAMEORIGIN`, NOT `DENY`** — `DENY` blocks ALL framing including same-origin, so the app can't embed its own `/__/auth/iframe` relay. Symptom: popup completes, returns to the page, hangs ("Signing in…" stuck); Console shows *"Refused to display 'https://churchopshub.com/' in a frame because it set 'X-Frame-Options' to 'deny'"* + the iframe loads as `chrome-error://chromewebdata/`. (Fixed 2026-05-28, commit `43b2c34`.)
4. **`Cross-Origin-Opener-Policy` must be `same-origin-allow-popups`** — Firebase's popup polls `window.closed`; modern Chrome blocks that across the COOP boundary without this, breaking the popup result handshake. Symptom: many *"Cross-Origin-Opener-Policy policy would block the window.closed call"* Console errors from `vendor-firebase`. (Added 2026-05-28, commit `03083fb`.)

Items 1–2 were dropped by the 2026-03-27 hardening commit (`a45da1f`), unnoticed ~7 weeks (fixed 2026-05-18, `ed108f6`+`d6b06ce`); items 3–4 were the *same* class of bug that the May fix missed (X-Frame-Options stayed `DENY`; COOP was never set), found 2026-05-28 while debugging the Lisa Bosley case. **All four live in the `/(.*)` headers block of `vercel.json` — never tighten any of them back.** Header changes need a fresh load to test, and COH is a PWA: a normal refresh serves the **stale cached shell via the service worker** — test in a brand-new incognito window. The `loginWithGoogle` catch Sentry-captures with tag `flow:google-signin`. (Minor known UX quirk after a fresh load: the first popup click can race the lazily-loaded relay iframe and need a second click; benign — `signInWithRedirect` would eliminate it if ever needed.)
