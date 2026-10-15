# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Shared Agent Coordination

Before planning, reviewing, or changing the repository, read `AGENTS.md` and
`docs/AI-WORKBOARD.md`. `AGENTS.md` contains the shared safety, ownership,
verification, and handoff rules used by both Claude and Codex. Follow the active
task assignment and do not edit another agent's branch or worktree.

**Before adding code to `functions/index.js`, `src/useFirestore.js`,
`src/App.jsx` or `src/pages/hubs/WorkBoard.jsx`**, read `AGENTS.md` → "Where new
code goes" (DEC-2026-019). Placement is decided by cohesion and independent
testability, never by line count — and no refactor of those files is authorized
or scheduled.

## Keeping this file small

**CLAUDE.md is for rules and gotchas, not history.** Dated narratives go to `docs/CHANGELOG.md`;
per-directory maps go in `src/CLAUDE.md`, `functions/CLAUDE.md`, `e2e/CLAUDE.md` (they load only
there; Codex reads them too via its CLAUDE.md fallback). Add a root line only when a future session
could not learn it from the code. Target: root under 40k chars — check `wc -c CLAUDE.md`.

## Further Reading

- `docs/DATA_MODEL.md` — Firestore collection schemas and rules summary
- `docs/BUSINESS_MODEL.md` — Hub pricing, subscription doc, grandfathering, per-user hub access
- `docs/CHANGELOG.md` — All phase history and dated fixes
- `docs/SENTRY-ALERTS.md` — Sentry alert rules to configure for Jobs Hub launch
- `docs/SEO-REFOCUS-2026-05-26.md` — internal-link rewire plan for volunteer-coordinator post; verify script for 2026-06-23 re-check
- `docs/backlog.md` — **single source of truth for open COH work** (keystone migration phases, foundations, premium features, known limitations). Check here first for "what's next."
- `docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` — the strategy plan: unify Tasks+Maintenance+Jobs into one "Work" model + contractor hours; collapse pricing to one flat $15 plan. **STATUS: P0/P1/P5 shipped; P2 (Tasks+Maintenance→`workItems`) FULLY COMPLETE — Part C done 2026-06-23 (flag + legacy branches stripped, legacy collections deleted; hook reads `workItems`-only). P3 (Jobs) DEFERRED INDEFINITELY. P4 RESCOPED to Tasks+Maintenance UI merge only (Jobs excluded).**
- `docs/WORK-MERGE-TASKS-MAINTENANCE-PLAN-2026-06-23.md` — **DONE (rescoped Phase 4, engine dedup complete 2026-06-23):** the two board engines are now ONE parameterized component `src/pages/hubs/WorkBoard.jsx` (`type="task|maintenance"`); `MaintenancePage.jsx` deleted; the task↔maintenance `→ Ticket` convert removed. Per-user `allowedHubs` scoping preserved at **category granularity** (maint-only sees only maint, tasks-only sees only tasks; invite scoping unchanged). **Jobs stays separate.**
- `docs/WORK-UNIFICATION-PHASE2-CUTOVER-RUNBOOK.md` — the executed P2 cutover checklist (Part A dark prep · Part B window · Part C cleanup). **Rollback = `node scripts/set-work-flag.cjs --church=<id> --off --prod`.** Reuse the same shape for the P3 Jobs window.
- `docs/PLATFORM-FOUNDATIONS-2026-06-06.md` — **architecture contracts** the premier features plug into (Work model · People model · Notification/delivery layer · Attention engine · Scheduled-occurrences · Search). The consumer matrix + build-order that keep incremental delivery from re-fragmenting. Read before building any premier feature.
- `docs/LOCAL-TESTING-AND-REVERT-2026-06-06.md` — **how to build/test/revert safely:** Firebase emulator setup, migration-against-prod-data-copy protocol, optional staging project, backups, feature-flag dark-launch, per-layer revert runbook, pre-prod gate checklist.
- `docs/SHEPHERD-HUB-PLAN.md` — **Shepherd Hub** (FXCC-only elders' hub) spec + phase status. P1–P4 SHIPPED (live); only Level-2 note encryption remains. The doc to resume from.
- `docs/SHEPHERD-HUB-AUDIT-2026-06-11.md` — **Shepherd Hub audit tracker** (Fable 5 findings): **✅ CLOSED 2026-06-11** — all phases shipped, every Critical/High/Medium resolved (incl. SEC-1 elder-role escalation + SEC-2/SEC-3), decisions D1–D6 all recorded. Rules guarded by 7 emulator unit tests (`npm run test:rules`). **Accepted/not done:** UX-7 (household grouping), CQ-5 (EmojiIcon), **SEC-7 (Level-2 note encryption — D5, the one deferred item)**. Start here for any further Shepherd hardening.
- `docs/SHEPHERD-HUB-PRIVACY.md` — plain-language privacy/confidentiality promise shown to elders in-app (🔒 Privacy link → `PrivacyModal`). Keep the two in sync.
- `docs/SHEPHERD-HUB-LAUNCH-AUDIT-2026-08-04.md` — **launch-readiness audit** run before the elder rollout email. Key open item: **LNCH-1** (first-session volunteer-shell trap — profile not re-read after the first elder-claim grant) must be fixed before elders sign up; LNCH-2 (Cesone's PCO assignments mostly inactive) is a pastoral data call; §4 lists easy usage wins (log-a-contact tap, auto-open hub, first-visit privacy modal, Monday elder digest).
- `docs/SHEPHERD-HUB-LAUNCH-PLAN-2026-08-04.md` — **the execution plan for the audit's findings**: Phase 1 F1/F2 launch blockers + fresh-signup dry-run gate · Phase 2 F3/F4 landing polish · Phase 3 F5 log-a-contact, F6 Monday elder digest, F7 cosmetics · Phase 4 rollout steps (Cesone data call, invite email). Track item status here.

## Commands

```bash
npm run dev       # Start dev server (Vite, typically http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint — catch bugs and hook violations (0 errors baseline)
npm run lint:fix  # ESLint with auto-fix
npm run analyze   # Build + open bundle size visualizer in browser (dist/bundle-stats.html)
npm run test:e2e  # Playwright E2E suite against prod (~80s, requires E2E_MEMBER_B_EMAIL env)
npm run test:unit # Pure-logic unit tests (node --test functions/test/*.test.mjs) — no emulator
npm run test:rules # Firestore + Storage RULES tests (boots emulators; needs Java; --test-concurrency=1).
                  # Add rule assertions HERE, not to test:unit (that glob runs without an emulator).
npm run test:handlers # Cloud Functions HANDLER tests against the real exported handlers (boots
                  # firestore+auth emulators; needs Java). node --test, NOT vitest (`.run(req)` is a
                  # firebase-functions wrapper method). Each test seeds a UNIQUE churchId (shared
                  # emulator, no global wipe). External HTTP stubbed at its boundary — Brevo/Twilio/
                  # PCO/Claude via global.fetch, Stripe via the require cache — see
                  # functions/test/handlers/setup.mjs. Scheduled sends use the injectable clock
                  # (exports._setClock/_resetClock). Emulator evidence only: the first production run
                  # is the authority (COH-007 A3 contradicted its plan in the emulator).
```

### Local sandbox — Firebase Emulator Suite (2026-06-07)

A fully-isolated local backend for testing UI/data changes with **zero connection to production** (groundwork for the Work-unification phases; see `docs/LOCAL-TESTING-AND-REVERT-2026-06-06.md`). **Requires Java** (Firestore emulator runs on the JVM). Installed via the no-sudo formula `brew install openjdk` (keg-only at `/opt/homebrew/opt/openjdk`); the `emulators` npm script prepends that to PATH so no `sudo`/symlink is needed (the `--cask temurin` route also works but needs a sudo password). Three terminals:

```bash
npm run emulators        # 1. start Auth+Firestore+Storage emulators (UI at localhost:4000)
npm run seed:emulator    # 2. seed a grandfathered test church + sample data (login: admin@test.local / Test1234!)
npm run dev:emulator     # 3. Vite with VITE_USE_EMULATORS=true → app talks to the local emulators
```

`src/firebase.js` connects the emulators only when `VITE_USE_EMULATORS=true` (unset in every real build, so prod/Vercel is unaffected — the block dead-code-eliminates). **Cloud Functions are NOT emulated** (avoids local code firing real Brevo/Twilio/Stripe/Claude calls), so callable-backed actions (job sign-up, @mention emails, checkout) won't work in the sandbox — test those against the `e2e-test-church` tenant instead. The emulator is empty on each start; re-run `seed:emulator` after restarting (or add `--import/--export-on-exit=.emulator-data` to the `emulators` script to persist). `scripts/seed-emulator.mjs` refuses to run unless the admin SDK is pointed at a localhost emulator (can never touch prod).

**Run `npm run build` and fix any errors before pushing.** Run `npm run lint` regularly — the baseline is 0 errors, ~45 intentional `exhaustive-deps` warnings. Any new errors should be fixed before committing.

### E2E test suite

Playwright suite against PROD (`e2e-test-church` tenant). Details, accounts and gotchas:
`e2e/CLAUDE.md` (loads when working under `e2e/`).

### Deployment

Deployed via Vercel (auto-detect Vite). Firebase config is hardcoded in `src/firebase.js` (not via env vars).

To deploy Firestore/Storage rules: `./node_modules/.bin/firebase deploy --only firestore:rules,storage` (requires `firebase login` first). `.firebaserc` is configured with project ID `church-inventory-9615c`.

**TODO:** Set a Firebase billing budget in Google Cloud Console to catch unexpected usage spikes. (Console-only — no code change needed.)

## Architecture

This is a single-page React 18 + Vite PWA — **ChurchOpsHub** — a multi-tenant operations platform for churches backed by Firebase (Firestore + Auth). Free inventory hub plus paid hubs for maintenance, insights, coordination, accountability, people access, tasks, and jobs. Tagline: *"Run Your Church"*.

### File Layout

Per-directory detail loads on demand: `src/CLAUDE.md` (every page, hook, component, lib
and the F2/F4/F5 foundations with their server twins) and `functions/CLAUDE.md` (every Cloud
Function, its schedule, secrets, and email/SMS plumbing). `public/` holds robots.txt, sitemap.xml
(update `lastmod` when `/` or `/?help` change) and the Search Console verification file.

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
- Tab keys: `dashboard`, `eventday` (admin/manager only — the Event-Day Ops console; conditionally inserted after `dashboard` via `showEventDay`, render branch gated by the same condition), `log`, `hubs`, `settings`. **Hub restructure (2026-06-23, `docs/HUB-RESTRUCTURE-PLAN-2026-06-23.md`):** Inventory (Items+Supplies), and Reservations are no longer top-level tabs — they're **free hub cards** inside `HubsPage` (`HUB_DEFS` `free:true`; "Included" badge, no `UpgradeGate`, shown first). Items+Supplies share an `InventoryPage` container (Items/Supplies toggle, mirrors `WorkPage`); the Reservations Hub mounts `ReservationsPage`. Top nav is now just the 5 app-level surfaces above. **Free members no longer see locked/paid hub cards** — the picker shows a paid card only when `hasHub(key) && userCanSeeHub(key)` (admins still get the "View Plan" upgrade callout). Deep-link `?item=`/scan/global-search/notification links route into the Inventory or Reservations hub via `navigateToTab()` in `App.jsx`; the `tab`/`hubKey` initializers migrate any pre-restructure `lastTab`. Low-stock + pending-reservation nudges now show as one aggregate badge on the Hubs tab. Clicking a hub sets `hubKey` (stored in `localStorage` as `lastHub`) and renders the hub with a `← All Hubs` breadcrumb; clicking "Hubs" while already on hubs resets to the picker.
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

## Business Model — Flat Pricing (2026-06-15)

**One plan (DEC-2026-021, shipped 2026-09-17 — COH-012 A.4).** Every church gets 90 days of everything, then ChurchOpsHub is **$5/mo or $50/yr for everything**. No free tier, no per-hub purchase, no seat cap.

| State | What |
|---|---|
| **First 90 days** | Every hub, unlimited members, $0 |
| **ChurchOpsHub** | Every hub, unlimited members — `flat_monthly` `price_1UGntiF12bDL8YA7UjdhSqFf` ($5), `flat_annual` `price_1UGntiF12bDL8YA7ldky35B4` ($50), product `prod_Ui4uQaH7X8iO9O` |
| **Lapsed** (day 91, unsubscribed) | *"They can't add more"* — keeps every hub and finishes what it started; cannot create an item/task/reservation/job/… or add a member |

- **`activityLog.timestamp` has two types on disk** (ISO string until 812f15e, Firestore Timestamp since) and a Firestore inequality filter is TYPE-SCOPED — one `where('timestamp','>=',x)` sees only x's type, and a mixed-type range (`>= string AND < Timestamp`) matches NOTHING (measured FXCC 2026-09-18: 173 / 43 / 0). Any window over activityLog uses `src/lib/activity-lanes.js` (twin `functions/lib/activity-lanes.js`, `python3 scripts/activity-lanes-twin.py`): one `>=` per lane, merge. Client `loadActivityLogSince`, server `readActivityLogSince`. Never add a bare `.where('timestamp', ...)`; never add an upper bound of the other type. Dual-lane is permanent — no backfill of ~1000 audit rows.
- `src/lib/entitlement.js` is the ONE implementation (`functions/lib/entitlement.js` is generated — `python3 scripts/entitlement-twin.py`; `functions/test/entitlement.test.mjs` pins twin ≡ client ≡ rules Jobs gate over 18 fixtures). States are derived, never stored: `grandfathered` · `trialing` (`status=='trialing'` + `trialEndsAt` future) · `paid` (`plan=='flat'` + `status` active/past_due) · `lapsed`. **`hasHub()` = "a subscription doc exists"** (a lapsed church has every hub); `isEntitled()` is billing; `canCreate()` is day-91.
- Enforcement: client (`useFirestore` create guard → `LapsedBanner` modal; 15 store creates), callables (`lookupChurchByCode` refuses joins, `generateRecurringTemplateTasks` skips), rules (Jobs **create** only; signup can create `config/subscription` only in the trial shape). Entitlement is not a security boundary (AGENTS.md).
- `LapsedBanner` + `SubscribeButton` are the only paywall/checkout surfaces (`UpgradeGate` is gone). `createCheckoutSession` accepts only `flat_*`; legacy price IDs stay mapped for webhook resolution and are normalized to the flat shape on arrival. Legacy doc fields (`hubs`, `trialHubs`, `freeHubsSelected`, `maxUsers`, `plan: 'pro'|'all_in'|'team_*'`) are no longer read; documents are not rewritten.
- `grandfathered: true` (FXCC, TrueNorth, e2e-test-church) is entitled in every state. `allowedHubs[]` is per-user access only; billing never reads it. `scripts/entitlement-inventory.sh` prints every consumer of the model. See `docs/BUSINESS_MODEL.md`.

## Project History

All phase work and dated fixes: `docs/CHANGELOG.md`.

## Future Work

**Known limitations (documented, accepted):**
- ~~Comment attribution forgeable~~ — **RESOLVED 2026-09-26 (owner decision: a comment is fixed to its author).** Work-item comments: create must carry the caller's own `authorId`, their profile `name` as `authorName` (`isOwnDisplayName`), a string `createdAt`, and nothing else (`mentions` a list); edits are **author-only** and may change only `text`/`updatedAt`; admins/managers may delete, never edit. Shepherd care thread: own `authorUid` + profile name + `createdAt == request.time`; **no edits by anyone**; author-only delete; elders-only read (unchanged). `users/{uid}.name` is client-immutable in both arms of the users update rule because the pin trusts it — no UI edits a name; use a script. **Accepted residual:** an account holder can always choose their own name (at signup, or by self-deleting and re-creating their profile — which fires the new-member admin email). The `authorId`/`authorUid` is the identity; the name is display. Tests: `coh006-visibility.test.mjs` (comments: attribution) + `shepherd-rules.test.mjs` (care thread). **Production check:** `node scripts/probe-attribution.cjs` (16 cases, self-cleaning; passed at the 2026-09-26 deploy).

---

## Known Pitfalls

### 🔴 Shepherd access is the access list, not the `elder` claim (COH-014)

Who may use the Shepherd Hub is `churches/{id}/config/shepherdAccess.emails`,
written ONLY by `saveShepherdRoster` in the same transaction as the roster.
Rules (`isElderOf(churchId)`) and callables (`isCurrentElder`) both require:
the claim (rules only, as a cheap first check), a verified email, an active
profile **in that church**, and the email on that list. `isShepherdAdminOf` /
`isShepherdOwner` limit John to FXCC the same way (DEC-2026-024).

- **Never gate Shepherd data on `token.elder` alone** — a claim survives in an
  issued token for up to an hour, and the person being removed will not refresh.
- **Never write `config/shepherdRoster` any other way** (Admin SDK script, Console):
  the access list would not follow. Rules deny client writes to both documents.
- **No `DEFAULT_ROSTER` fallback in the access path.** It stays only for PCO
  name-matching (`getShepherdRoster`); a missing access doc must deny.
- New elder-gated rule or callable → add it to `elderOps()` in
  `functions/test/rules/shepherd-rules.test.mjs` or `shepherdAccess.test.mjs`.
- **Production check:** `node scripts/backfill-shepherd-access.cjs --check`
  (roster ≡ access list; `--repair` rebuilds the list from the roster) and
  `node scripts/probe-coh014-shepherd-access.cjs` (throwaway elder in
  `e2e-test-church`: own church 200, FXCC 403, removed-with-live-token 403;
  cleans up after itself). Both passed at the 2026-09-24 deploy.

### 🟡 A field stored in two documents will drift — `churchName` / `churchCode`

`churchName` and `churchCode` live on the parent `churches/{id}` **and** on
`churches/{id}/config/main`. **The parent is authoritative** (DEC-2026-023): it
is what `lookupChurchByCode` resolves joins against, and the only one of the two
that cannot be removed. As of 2026-09-23 every reader — the client via the
store's merged `config`, and every handler — takes these fields from the parent.

Two rules when touching them:

- **Write through `updateChurchCode`**, which writes both documents in one
  batch. `updateConfig` strips these fields deliberately. Rules do *not* enforce
  this yet and cannot while both documents are written, because
  `updateChurchCode` is itself a client writer needing that permission —
  `functions/test/rules/core-collections.test.mjs` records the gap.
- **Never add a reader of `config/main.churchName` / `.churchCode`.**
  `functions/test/handlers/churchNameSource.test.mjs` fails the build if you do.

The original bug: Settings wrote only `config/main`, joining read the parent, so
a changed code showed in the UI and in invite links, silently failed to let
anyone join, and left the old code working — with no error anywhere. `config/main`
still duplicates `churchName`/`churchCode` for compatibility with already-open
tabs; retiring those copies is a backlog item, not a free cleanup.

### 🟡 `firebase deploy --only firestore:indexes` silently skips two index kinds

`firebase deploy --only firestore:indexes` exits 0 with `✔ Deploy complete!` for two index shapes it never actually creates. The affected query then throws `FAILED_PRECONDITION: The query requires an index` at runtime, with no deploy-time signal that anything was wrong.

**Case A — COLLECTION-scope composite indexes.** A `COLLECTION`-scope composite (e.g. `jobListings` on `(recurrenceGroupId, scheduledDate)`) declared in `firestore.indexes.json` may be silently no-op'd when an existing `COLLECTION_GROUP` index has the same field list — the CLI thinks it's covered, but a single-collection query (`collection(...).where(...)`) needs an index whose `queryScope` is exactly `COLLECTION`. Bit us 2026-05-06 (Jobs Hub audit) and again 2026-05-27 (Jill's "this + all future" series edit — index had been missing in prod for 5 weeks). Fix with `gcloud`:

```bash
gcloud firestore indexes composite create \
  --project=church-inventory-9615c --collection-group=jobListings --query-scope=COLLECTION \
  --field-config=field-path=recurrenceGroupId,order=ascending \
  --field-config=field-path=scheduledDate,order=ascending
```

**Case A2 — a BUILDING index and a MISSING index return the same error code (2026-09-07, COH-007).** A newly created composite rejects queries with `failed-precondition` while it builds — byte-identical in code to a missing index. The only discriminator is the message text ("That index is currently building and cannot be used yet"). Worse, the state flag and query availability are **not simultaneous**: `gcloud firestore indexes composite list` reported every index `READY` while queries kept rejecting for roughly another minute. Any post-deploy index probe must (a) match on the message, not just the code, and (b) re-run after the reported-ready moment. Reading a building index as a missing one is how a healthy deploy gets needlessly rolled back or "fixed" with a duplicate `gcloud` index. `scripts/verify-coh007-additive-gate.mjs` encodes both rules.

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

### Moved to the directory files (2026-10-15, to keep this file under 40k)

Full text, unchanged, in the file that loads when you work there:

- 🔴 Import name shadowing → TDZ crash in production → `src/CLAUDE.md`
- 🟡 `setMonth()` rolls over on month-end dates → `src/CLAUDE.md`
- 🟡 `toISOString()` returns UTC — wrong date in US timezones → `src/CLAUDE.md`
- 🟡 Bare `>` in JSX text content → `src/CLAUDE.md`
- 🟡 Pseudo-selector styles (`:focus`, `:hover`) require global CSS → `src/CLAUDE.md`
- 🟡 Stale-chunk errors after a deploy = stale chunk, not a bug (two message variants) → `src/CLAUDE.md`
- 🟡 Sentry "Service worker registration failed" is best-effort noise, not a server bug → `src/CLAUDE.md`
- 🟡 Sentry "Connection to Indexed Database server lost" is benign Firebase Auth noise → `src/CLAUDE.md`
- 🟡 A2P/TCR Compliance API is create-only — FAILED campaigns can only be fixed via Console "Fix Campaign" → `functions/CLAUDE.md`
- 🟡 Gen-2 deploy can strip `allUsers` invoker IAM (silent 403 on webhooks) → `functions/CLAUDE.md`
- 🟡 Server Sentry is disabled under test — a `production`-tagged event from a local/test machine is test noise → `functions/CLAUDE.md`
- 🟡 User-facing scheduled sends run HOURLY and gate on each church's local hour — don't "fix" them back to a daily cron → `functions/CLAUDE.md`
- 🟡 A freshly deployed Firestore trigger does not fire immediately → `functions/CLAUDE.md`

## Vercel: Ignored Build Step (docs-only commits skip the build)

`scripts/vercel-ignore-build.sh` is wired to this project's Vercel **Ignored Build Step**. A push
whose changes SINCE THE LAST SUCCESSFUL DEPLOYMENT (`VERCEL_GIT_PREVIOUS_SHA`) touch only docs —
`docs/`, top-level `*.md`, `README.md` files — does NOT produce a new deployment. Any other
markdown counts as code. (Until 2026-09-30 it diffed only `HEAD^..HEAD`, so a push ending in a
docs-only commit silently dropped the code commits beneath it — it happened on Echo Scripture.) Vercel bills retained build
output as Deployment Storage, and docs-only commits were burning it (COH made 20 such deploys in
two days).

**Consequence — read this before assuming a push shipped:** "pushed to `main`" no longer implies
"a new deployment exists". To force a deploy, change something outside `docs/`/top-level `*.md`, or redeploy
from the Vercel dashboard.

The script **fails open**: if the diff can't be determined (no previous deployment, commit not
fetchable, git error) it builds. A missed skip costs a few MB; a missed build ships nothing.
