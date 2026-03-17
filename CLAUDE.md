# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, typically http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

There are no tests and no linter configured. **Run `npm run build` and fix any errors before pushing.**

## Architecture

This is a single-page React 18 + Vite PWA — **ChurchOpsHub** — a multi-tenant church inventory management system backed by Firebase (Firestore + Auth).

### File Layout

```
src/
├── App.jsx                    ← AuthScreen + AppShell (tabs, mobile nav) + root App (~368 lines)
├── useAuth.js                 ← Firebase Auth hook (email/password + Google, church setup/join)
├── useFirestore.js            ← All Firestore CRUD as a single hook (incl. maintenance)
├── firebase.js                ← Firebase app init; exports `db`, `auth`, `googleProvider`, `storage`
├── main.jsx                   ← React entry point
├── hooks/
│   ├── useMobile.js           ← MobileCtx + useWindowWidth (breakpoint 768px)
│   └── useSubscription.js     ← Subscription state hook: hasHub(), canAddUser(), isTrialing()
├── components/
│   ├── brand/
│   │   ├── tokens.js          ← B, f1, f2, inp, btnP, btnS, btnD
│   │   └── Logo.jsx           ← Logo, FullLogo
│   └── primitives/
│       ├── Modal.jsx, FF.jsx, Badge.jsx, Stat.jsx, Spinner.jsx
│       ├── UpgradeGate.jsx    ← Paywall component; shows upgrade card when hub inactive
│       └── (RichTextarea is a local component inside MaintenancePage.jsx, not a shared primitive)
├── pages/
│   ├── LandingPage.jsx        ← Marketing landing page (shown to unauthenticated visitors)
│   ├── HelpPage.jsx           ← User-facing help center (no auth required); shown when ?help param present; 12 sections, accordion UI, responsive sidebar
│   ├── PublicRequestPage.jsx  ← Public item request form (no auth required); shown when ?request=CHURCH_ID param present
│   ├── Dashboard.jsx
│   ├── ItemsPage.jsx
│   ├── SuppliesPage.jsx
│   ├── ReservationsPage.jsx
│   ├── ActivityLogPage.jsx
│   ├── SettingsPage.jsx       ← Includes Subscription & Billing card for admins
│   └── hubs/
│       ├── MaintenancePage.jsx     ← Maintenance Hub (Phase 3)
│       ├── InsightsPage.jsx        ← Insights Hub (Phase 4): utilization, ministry, seasonal, financial, supply analytics (Recharts)
│       ├── CoordinationPage.jsx    ← Coordination Hub (Phase 6): checkout bundles, email notification settings
│       └── AccountabilityPage.jsx  ← Accountability Hub (Phase 7): physical audits, chain of custody, insurance export
├── utils/
│   ├── csv.js                 ← exportItemsCSV, exportSuppliesCSV, exportReservationsCSV
│   ├── print.js               ← printLabel, printInventory
│   ├── imageResize.js         ← resizeImageForUpload
│   ├── roleHelpers.js         ← canManageMinistry, canManageItem, canManageSupply
│   └── constants.js           ← ITEM_STATUS, RES_STATUS, TICKET_STATUS string enums
└── data/
    └── referenceData.js       ← Static reference inventory (not auto-seeded; reference only)
functions/
├── index.js                   ← Cloud Functions: createCheckoutSession, createPortalSession, stripeWebhook
└── package.json               ← Node 18, firebase-functions v4, firebase-admin v12, stripe v14
```

### Data Flow

`App` (in `App.jsx`) → `AppShell` (also in `App.jsx`) → renders one of nine tab pages, each receiving `store`, `userProfile`, and `subscription` as props.

- `useAuth()` handles authentication state and exposes `userProfile` (Firestore user record with `churchId`, `role`, `name`).
- `useFirestore(churchId)` subscribes in real-time to all Firestore collections for that church and exposes CRUD operations.
- `useSubscription(churchId)` reads `churches/{churchId}/config/subscription` and exposes `hasHub(name)`, `canAddUser(count)`, `isTrialing(name)`.
- `store` passed to pages is the return value of `useFirestore`.

### Firestore Data Model (Multi-Tenant)

All church data is namespaced under `churches/{churchId}/`:

| Path | Contents |
|------|----------|
| `churches/{churchId}` | Church name, code, createdAt |
| `churches/{churchId}/config/main` | Church metadata |
| `churches/{churchId}/config/settings` | `locations[]`, `ministries[]`, `tags[]` |
| `churches/{churchId}/config/subscription` | Plan, hubs[], maxUsers, status, Stripe IDs, grandfathered |
| `churches/{churchId}/items` | Equipment inventory items |
| `churches/{churchId}/supplies` | Consumable supplies with quantity tracking |
| `churches/{churchId}/activityLog` | Audit trail (every action logged) |
| `churches/{churchId}/reservations` | Future item reservation requests |
| `churches/{churchId}/maintenanceTickets` | Maintenance Hub: repair tickets (MNT-### numbering, max-based); fields: `ticketNumber`, `name`, `description`, `priority` (High/Medium/Low), `status` (Backlog/Planning/In Progress/On Hold/Complete/Cancelled), `tags[]`, `dueDate`, `recurrence` (weekly/biweekly/monthly/quarterly/annually/null), `assignees[{uid,name}]`, `checklist[{id,text,done}]`, `photos[]`, `linkedItemDocId/Id/Description`, `vendorId/Name`, `estimatedCost`, `actualCost`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`, `completedAt` |
| `churches/{churchId}/maintenanceTickets/{id}/comments` | Comment subcollection: `text`, `authorId`, `authorName`, `createdAt` |
| `churches/{churchId}/vendors` | Maintenance Hub: vendor/contractor directory |
| `churches/{churchId}/config/settings.maintenanceTags` | `string[]` — tag autocomplete for maintenance tickets; new tags added via `arrayUnion` |
| `churches/{churchId}/bundles` | Coordination Hub: checkout bundles; fields: `name`, `description`, `items[{docId,itemId,description,location}]`, `createdBy`, `createdByName`, `createdAt` |
| `churches/{churchId}/config/notifications` | Coordination Hub: EmailJS config; fields: `enabled`, `serviceId`, `publicKey`, `templateApproved`, `templateDenied`, `templateAssigned` (maintenance ticket assignment notification) |
| `churches/{churchId}/audits` | Accountability Hub: physical audit records; fields: `location`, `conductedBy`, `conductedByName`, `startedAt`, `completedAt`, `status`, `itemsChecked`, `discrepancyCount`, `items[{docId,itemId,description,currentStatus,auditResult,condition,notes}]`, `discrepancies[]`, `createdAt` |
| `churches/{churchId}/publicRequests` | Public item requests submitted via `PublicRequestPage`; **unauthenticated creates allowed** (Firestore rule); fields: `name`, `email`, `phone`, `itemDescription`, `quantity`, `dateNeeded`, `urgency` (Low/Medium/High), `notes`, `status` (`pending`/`dismissed`), `submittedAt`; admins see pending requests in ItemsPage panel; dismissed via `dismissPublicRequest()` |
| `users/{uid}` | User profile with `churchId`, `role` (`admin`/`manager`/`user`), `name`, `email`, `active`, `allowedHubs[]`, `managedMinistries[]` |
| `suggestions/{docId}` | **Top-level** (not church-scoped) — cross-church user suggestions; fields: `text`, `category`, `submittedBy`, `submittedByName`, `churchId`, `churchName`, `submittedAt` |
| `errors/{docId}` | **Top-level** (not church-scoped) — Firestore error log written by `handleErr()` in `useFirestore`; fields: `message`, `stack` (first 4 lines), `churchId`, `timestamp`; owner-only read in Firestore rules |

`churchId` is always `{creatorUid}-church` (set at church creation time).

### Auth Flow

1. **Create church** — admin creates a church with a unique alphanumeric church code; their UID becomes the churchId prefix.
2. **Join church** — new members register with email/password or Google, entering the church code to be linked to the right `churchId`.
3. Firestore rules scope all church data to the user's own `churchId` via a `get()` lookup. Admins can update role/active for users in their own church. Storage rules apply the same scoping via `firestore.get()`.

### UI Conventions

- **No CSS files, no component library, no router.** All styling is inline using a `B` brand token object from `src/components/brand/tokens.js`.
- Two font families: `f1 = 'Outfit'` (headings/UI), `f2 = 'Source Sans 3'` (body text) — loaded from Google Fonts at runtime.
- Shared style objects: `inp` (inputs), `btnP` (primary button), `btnS` (secondary), `btnD` (danger) — all from `src/components/brand/tokens.js`.
- Reusable primitives in `src/components/primitives/`: `Modal`, `FF` (form field wrapper), `Badge` (status pill), `Stat` (dashboard stat card), `Spinner`, `UpgradeGate`.
- Tab keys: `dashboard`, `inventory`, `supplies`, `reservations`, `log`, `insights`, `maintenance`, `coordination`, `accountability`, `settings`. Hub tabs hidden from users whose `allowedHubs[]` excludes them; shown with 🔒 when church hasn't subscribed (drives discovery).
- `MobileCtx` React context + `useWindowWidth()` hook in `src/hooks/useMobile.js`. Components read `useContext(MobileCtx)` — no prop drilling needed. Breakpoint is 768px.
- Mobile: tabs hidden, bottom nav bar fixed at bottom, modals slide up from bottom.
- **Deep linking:** `?item=ITEM_ID` URL param auto-opens item detail. URL cleaned with `history.replaceState` after read.
- **QR codes:** Generated locally via the `qrcode` npm package (`QRCode.toDataURL()`). Links back to the app with `?item=` param. In the item detail modal, the QR data URL is stored in `detailQrUrl` state (generated in a `useEffect` when `showDetail` changes). `printLabel` is async (awaits `QRCode.toDataURL()` before opening the print window).
- **Firebase Storage** (Blaze plan): item photos stored under `churches/{churchId}/items/`. Images are client-side resized to max 1200px / 82% JPEG quality before upload via Canvas API (`resizeImageForUpload`).
- **Role enforcement:** Three roles — `admin`, `manager`, `user`. UI-only enforcement; Firestore rules unchanged. Shared helpers in `src/utils/roleHelpers.js` (`canManageMinistry`, `canManageItem`, `canManageSupply`).
  - **admin**: full access — team management, church code, billing, invite links, EmailJS config, plus all manager capabilities.
  - **manager**: full operational access — edit dropdown lists (Locations/Ministries/Tags); add/edit/retire items + supplies scoped to `managedMinistries[]`; approve/deny/checkout reservations for their ministries; create/manage maintenance tickets and vendors; run audits; create/edit/delete bundles. Cannot manage team members, billing, or EmailJS config.
  - **user**: day-to-day use — checkout/return items, request reservations (cancel own), log supply usage/restock, view all accessible hubs. Cannot add/edit items or supplies, approve reservations, or start audits.
  - Items/supplies with no ministry assigned are admin-only (managers cannot edit unscoped items).
  - Settings page: all users see a Profile card (name, email, role, managed ministries); Team Members section is admin-only; list editors (locations/ministries/tags) are editable by admin and manager.
  - Hub visibility per user controlled by `allowedHubs[]` on user profile (see Per-User Hub Access).
- **localStorage:** Items page persists `locationFilter` and `ministryFilter` under keys `inv_locationFilter` / `inv_ministryFilter`.

### Item Status Values

`Available` | `Checked Out` | `In Use` | `Under Repair` | `Disposed`

## Business Model — Hub-Based Monetization

**"The stuff is free, what you do with the stuff is paid."**

### Inventory Hub (Forever Free) — System of Record
Everything existing stays free. 10 team members per church included.

### Paid Hubs

| Hub | Price | Status |
|-----|-------|--------|
| **Team Hub** | $9/mo (25 users) or $19/mo (unlimited) | ✅ Done — Phase 5 |
| **Insights Hub** | $7/mo | ✅ Done — Phase 4 |
| **Maintenance Hub** | $7/mo | ✅ Done — Phase 3 |
| **Coordination Hub** | $7/mo | ✅ Done — Phase 6 |
| **Accountability Hub** | $5/mo | ✅ Done — Phase 7 |
| **All-In Bundle** | $29/mo | ✅ Done — Phase 8 |

### Grandfathering
Existing churches at launch: 12 months Founder status (unlimited users, all hubs).

### Subscription Doc
`churches/{churchId}/config/subscription`:
```json
{
  "plan": "free|team_25|team_unlimited|all_in",
  "hubs": ["maintenance", "insights", ...],
  "maxUsers": 10,
  "status": "active|trialing|past_due|canceled",
  "grandfathered": false,
  "grandfatheredUntil": null
}
```

### Feature Gating
- `useSubscription(churchId)` → `hasHub(name)`, `canAddUser(count)`, `isTrialing(name)`
- `UpgradeGate` component wraps paid pages
- Hub tabs: shown with 🔒 when church hasn't subscribed (drives discovery); hidden entirely when user's `allowedHubs[]` excludes them
- `userCanSeeHub(hubName)` in `App.jsx` combines church-level `hasHub()` + user-level `allowedHubs` check
- Payment: Stripe (Cloud Functions — not yet wired up; mailto CTA for now)

### Per-User Hub Access (Phase 5)
Hub visibility is controlled at two levels:
1. **Church level** — subscription `hubs[]` determines which hubs the church has paid for
2. **User level** — `allowedHubs[]` on `users/{uid}` determines which of those hubs a given user can see

**Rules:**
- `admin` role always sees all church hubs — no `allowedHubs` check needed
- `manager` and `user` roles: visible hubs = intersection of church `hubs[]` and user `allowedHubs[]`
- `allowedHubs` null/missing = user inherits all church hubs (default for backward compatibility)
- Admins assign hub access per-user in Settings > Team Members (only showing hubs the church has)
- This is a **UI/UX concern only** — Firestore rules do not change; all church members can still read all church data under `churches/{churchId}/`

## Roadmap

### ✅ Done — Phases 1–8

**Phases 1–3:**
- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub (rebuilt): kanban + list views, 6-status workflow (Backlog→Complete), drag-and-drop between kanban columns (admin/manager, native HTML5), multi-assignee, tag autocomplete (`maintenanceTags` via `arrayUnion`), photo uploads (Firebase Storage at `churches/{churchId}/maintenance/{docId}/`), real-time comment threads (subcollection), vendor directory, overdue date highlighting, `maint_viewMode` persisted to localStorage
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel (tabbed: Suggestions / Error Log) gated by `['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(email)` in UI and by `request.auth.token.email in [...]` in Firestore rules; Error Log loads from top-level `errors` collection written by `handleErr()` in `useFirestore`

**Phase 4 — Insights Hub:**
- `InsightsPage.jsx`: 5 sections — Item Utilization, Ministry Breakdown, Seasonal Trends, Financial & Depreciation, Supply Burn Rate
- Recharts (BarChart, AreaChart, PieChart) for all visualizations
- Financial fields on items: `purchaseDate`, `purchasePrice`, `warrantyExpiry`, `estimatedValue` (collapsible in Add/Edit modals; shown in Detail modal)
- Straight-line depreciation over 5 years; manual override option; warranty expiry alerts (90-day window)

**Phase 5 — Team Hub:**
- User count display in Team Members header (e.g. "8 / 10 members"); upgrade banner for admins at/over the free plan 10-user cap
- Three roles: `admin` (full system access), `manager` (full operational access scoped to `managedMinistries[]`), `user` (day-to-day use only); distinct badge colors
- Edit Access modal in Settings > Team Members: role selector (Admin/Manager/User), hub checkboxes (church-active hubs only), managed ministries multi-select (manager only); full role capabilities documented in UI Conventions above
- `userCanSeeHub(hubName)` in `App.jsx`: admins see all; manager/user sees intersection of church `hubs[]` and `allowedHubs[]`; `allowedHubs: null` = inherit all (backward compat)
- Hub tabs hidden (not locked) when user's `allowedHubs` excludes them; Firestore rules unchanged

**Phase 6 — Coordination Hub:**
- `CoordinationPage.jsx`: checkout bundles (create/edit/delete, per-item availability indicator, bulk checkout skips unavailable items); EmailJS notification settings (Service ID, Public Key, template IDs for approved/denied, test-send button)
- `ReservationsPage.jsx`: recurring reservations (weekly/biweekly/monthly + end date, live instance count preview, `recurrenceGroupId` links series); recurring badge on cards; auto-email requester on approve/deny if EmailJS configured
- `useFirestore`: `bundles` collection subscription + CRUD; `config/notifications` subscription + `updateNotificationConfig`; `totalSubs` 9→11
- `@emailjs/browser` installed; email sent client-side via dynamic import on approve/deny actions

**Phase 7 — Accountability Hub:**
- `AccountabilityPage.jsx`: physical audit mode (select location → walk-through items, mark Present/Issue/Missing), audit history list with discrepancy reports, chain of custody timeline (per item, from activityLog), insurance-ready CSV export (all active items + financial fields)
- `useFirestore`: `audits` collection subscription + `addAudit` + `updateAudit`; `totalSubs` 11→12
- Feature gated via `hasHub('accountability')` + `UpgradeGate`; `📋 Audit` on mobile nav

### ✅ Done — Phase 8 — Stripe Integration

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

### ✅ Done — Phase 12 — Help Center & User-Facing Documentation (2026-03-16)

- **`HelpPage.jsx`**: Full user-facing help page with 12 sections — Getting Started, Inventory, Supplies, Reservations, Activity Log, Maintenance Hub, Insights Hub, Coordination Hub, Accountability Hub, Team Hub, Settings & Billing, FAQ
- **Accordion UI**: Collapsible sections (first item open by default); role badges (`admin`/`manager`/`user`), hub badges, Tip/Note callout blocks, keyboard shortcut formatting
- **Responsive layout**: Sticky sidebar on desktop with active-section highlighting via `IntersectionObserver`; horizontal scrollable section tab bar on mobile
- **Routing**: Accessible via `?help` URL param (same pattern as `?request=`); `← Back to App` button calls `window.history.back()`
- **Entry points**: "Help" link in LandingPage nav (desktop only); "Help Center" link in in-app footer; "Help Center" card in Settings page (above Danger Zone)
- **Support email**: All user-facing `jcvaught@gmail.com` references replaced with `churchopshub@gmail.com` across LandingPage, SettingsPage, UpgradeGate, and App.jsx (ToS + Privacy Policy contact sections); `isOwner` access control check left unchanged
- **Registration UX**: Split "Your Name" field into separate First Name + Last Name fields on all registration forms (register, createChurch); `useAuth` stores `firstName`, `lastName`, and `name` on user profiles; `registerWithGoogle` splits `displayName` on first space; backward-compatible (`name` field still used everywhere for display)
- **Two-character initials**: `initials(name)` helper in MaintenancePage derives two-char initials (e.g. "JS" for John Smith); assignee avatar circle size increased 22→26px with `title` tooltip; SettingsPage team member avatars updated with same logic

### ✅ Done — Phase 19 — Production Crash: Full Investigation & Fix (2026-03-17)

The All Items tab crashed on every production load with a blank screen. This was the most complex bug in the project — four separate issues stacked on top of each other, each one only visible after the previous was fixed.

**Step 1 — Add error boundary to surface the actual error.**
The blank screen gave no information. Added `PageErrorBoundary` (class component with `getDerivedStateFromError`) wrapping the page area in `App.jsx`, keyed by `tab` so it resets on navigation. This turned the blank screen into a readable crash report.

**Step 2 — First crash: `ReferenceError: Cannot access 'Pn' before initialization`**
`ItemsPage` had 32 `useState` calls and 30+ imports. esbuild's minifier assigns short names (`a`, `b`, ..., `Pn`, ...) sequentially across the entire flattened Rollup bundle without scope analysis. The module-scope `ITEM_STATUS` constant and a function-scope bulk-action `useState` boolean both got assigned `Pn`. Any access to `ITEM_STATUS` inside the component (e.g. in a `useMemo`) threw TDZ before the `const [Pn] = useState(false)` line executed.

*Attempted fix:* consolidated 5 bulk boolean states (`showBulkCoWarn`, `showBulkCo`, `showBulkRetWarn`, `showBulkRet`, `showBulkLoc`) into one `bulkModal` string state and 5 bulk data states into one `bulkData` object — saving 20 function-scope variable slots. This resolved `Pn` but the collision shifted.

**Step 3 — Collisions kept shifting: `Pn` → `on` → `Se` → `be`**
Every `useState` consolidation just shifted which two-char name collided. Switching from esbuild to Terser (`minify: 'terser'`) made no difference — Terser with `mangle: true` has the same sequential naming problem. Adding `manualChunks` to split React and Firebase into separate vendor chunks helped (removed React's internal `var be` from the app chunk) but app-internal modules (`useFirestore`, etc.) still produced module-scope vars that collided with page component state vars in the same chunk.

*Actual fix:* `vite.config.js` set `mangle: false` in `terserOptions`. With identifier mangling disabled, all variable names stay as their original source names — structurally impossible to collide. `compress: true` still strips dead code and whitespace. Bundle gzip size increased ~130 KB (acceptable for a SaaS app).

**Step 4 — New crash with readable name: `ReferenceError: Cannot access 'bulkModal' before initialization`**
With `mangle: false` preserving real names, a second independent bug became visible: a genuine source-level TDZ. The keyboard shortcut `useEffect` at line 89 had a dependency array `[activeModal, bulkModal, bulkMode, isAdmin, isManager]`. React evaluates dependency arrays *immediately during render* — but `bulkModal`, `bulkMode`, and `isAdmin`/`isManager` were all declared *below* that `useEffect` call in the component body (lines 107–123). JavaScript's `const` is hoisted but stays in TDZ until execution reaches the declaration, so evaluating the dep array crashed on every render.

This bug had always existed in the source but was invisible in development (Vite serves modules separately, not flattened) and was masked in production by the earlier minification crash — the app was already crashing before reaching this point.

*Fix:* moved all `useState` declarations and derived values that appear in `useEffect` dependency arrays to the top of the component, before any `useEffect` call.

**Final state of `vite.config.js`:**
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
**Do not re-enable `mangle: true` or switch back to esbuild.**

### ✅ Done — Phase 18 — UX Polish & Settings Inline Editing (2026-03-17)

- **Error boundary added**: `PageErrorBoundary` (class component) wraps the page content area in `App.jsx`; keyed by `tab` so it resets on navigation. Production render crashes show an error message with stack trace instead of a blank screen.
- **Settings list inline editing**: Locations, Ministries, and Tags lists now support inline rename — each row has an Edit button that swaps the label for a text input (pre-filled); Save/Cancel via button or keyboard (Enter/Escape); duplicate-name check on save.

### ✅ Done — Phase 17 — Mobile Audit & Responsive Fixes (2026-03-17)

- **Modal safe-area-inset**: bottom-sheet modals on iPhone X+ now include `env(safe-area-inset-bottom, 0px)` in their bottom padding so action buttons are never hidden behind the home indicator
- **Error toast clearance**: toast `bottom` raised from `80` to `96` — on iPhone X the nav bar is ~82px tall (48px buttons + 34px safe area); the toast was appearing behind it
- **SuppliesPage card layout**: button row gets `flexShrink: 0`; "Min / Restocked" text gets `minWidth: 0, overflow: hidden, textOverflow: ellipsis` so long meta text can't compress action buttons off-screen
- **ActivityLogPage — added `isMobile`**: filter bar reorganized from fixed-width flex items into a column layout — Search full-width on row 1; Action + From in a 2-col grid on row 2; To full-width on row 3; expanded detail left indent reduced 52px → 14px on mobile
- **Dashboard stat cards**: switched from `flexWrap` to a 2-col CSS grid on mobile so all 5 stats have consistent equal widths (previously 2+2+1 with uneven sizing)
- **`Stat` component**: mobile-aware padding (`14px 16px`), icon size (`15px`), and value font (`24px`); `flex`/`minWidth` props removed (not needed in a grid parent)
- **CoordinationPage — added `isMobile`**: notification config form and checkout bundle form both use `gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'`; at 162px per column on a 375px phone the "Template ID — Ticket Assigned (Maintenance)" label was wrapping to 3 lines and date inputs were hard to interact with

### ✅ Done — Phase 16 — Full App Code Review & Bug Sweep (2026-03-17)

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

### ✅ Done — Phase 15 — Security, Performance & Code Quality Audit (2026-03-16)

- **`identifyItem` churchId validation**: after auth check, verifies caller has a Firestore user profile with a `churchId` — prevents unauthorized AI API credit usage
- **Firestore rules — church doc reads**: split `allow read` into `allow get` (creator/member only) + `allow list` (any authenticated user, for join-by-code query); narrows direct document reads
- **Storage rules — active check**: `allow write` now also requires `userProfile().active == true` via a Firestore helper function; deactivated users can no longer upload photos
- **Stripe webhook — church existence check**: `checkout.session.completed` handler verifies the church doc exists before writing subscription data; logs warning and returns 200 on missing church
- **Owner email sync comments**: `OWNER_EMAILS` constant in `functions/index.js` now has comments pointing to the other two hardcoded locations (`firestore.rules`, `SettingsPage.jsx`); same for the other two locations
- **`console.error` → `handleErr`**: `logActivity()` and `addMaintenanceTags()` now use the shared `handleErr()` helper (Sentry + error collection write + toast); `loadErrors()` keeps `console.error` + `setError` to avoid a write-loop
- **Bulk action confirmations**: `window.confirm()` dialogs added before `handleBulkCheckout`, `handleBulkReturn`, and `handleBulkLocation` execute Firestore writes
- **Activity log date validation**: `dateTo` onChange handler now clears the field (rather than silently accepting) if the selected date is before `dateFrom`
- **`useMemo` for ReservationsPage**: `activeItems` and `filtered` lists wrapped in `useMemo` with proper dependency arrays
- **Date comparison — Date objects**: `form.returnDate < form.eventDate` changed to `new Date(form.returnDate) < new Date(form.eventDate)` for explicit date comparison
- **Disabled button opacity standardized**: ActivityLogPage pagination buttons changed from `.4` to `.5` to match all other disabled buttons in the app
- **ARIA labels on icon-only buttons**: `aria-label` added to `📷 Scan` (App.jsx), `⬇ Export CSV` (ItemsPage, SuppliesPage, ReservationsPage), `☑ Select` (ItemsPage), `⊕ Dup/Duplicate` (ItemsPage), `⬇ Export` (bulk bar)
- **Status constants**: `src/utils/constants.js` created with `ITEM_STATUS`, `RES_STATUS`, `TICKET_STATUS` string enums; Dashboard, ItemsPage, ReservationsPage, and App.jsx updated to import and use them
- **`today` hoisted out of map**: `new Date().toISOString().split("T")[0]` computed once per render in ReservationsPage (above the JSX), not inside each `.map()` iteration
- **HelpPage updated**: bulk actions accordion notes confirmation dialogs; activity log date range tip clarifies "To" must be on or after "From"

### ✅ Done — Phase 14 — UI Polish (2026-03-16)

- **Input focus indicator**: single global CSS rule in `index.html` adds teal border + subtle glow (`box-shadow: 0 0 0 3px rgba(42,125,110,0.12)`) on focus for all inputs, selects, and textareas; overrides inline `outline:none` from `inp` token without touching each component
- **Checklist auto-save**: checkbox toggles in the ticket detail modal now immediately persist to Firestore via `updateTicket` (optimistic — local state updated first, Firestore write fires async); previously required clicking Save Changes
- **Checklist empty state**: checklist area in detail modal wrapped in a dashed border box (`border: 1px dashed B.sand, borderRadius:10, padding:12px 14px`) for visual containment rather than bare floating text
- **Sort control relocated**: Sort dropdown moved from filter bar to the View Toggle row (next to Kanban/List toggle) with a "Sort:" label; filter bar reduced from 5 to 4 controls; ticket count pushed to `marginLeft:auto` on the right
- **Responsive Add Ticket grid**: Priority / Due Date / Recurrence row switches from `1fr 1fr 1fr` to `1fr 1fr` on mobile with Recurrence wrapped in `gridColumn:'1/-1'` div to span full width; prevents field crushing on phones
- **Recurrence + Due Date paired**: detail modal Due Date / Actual Cost row expanded to 3-col grid (Due Date | Actual Cost | Recurrence) on desktop, 2-col on mobile; standalone Recurrence FF below Notes removed
- **Badge sizes**: recurrence (`🔁`) and checklist progress (`✓ X/Y`) badges on ticket cards bumped from `fontSize:10` to `fontSize:12`
- **Opacity consistency**: login button disabled opacity corrected from `.6` to `.5` (matches all other buttons in the app)

### ✅ Done — Phase 13 — Maintenance Hub Enhancements (2026-03-16)

- **Checklist sub-tasks**: `checklist: [{id, text, done}]` field on tickets; add/remove/toggle items in ticket detail modal (Enter to add); checklist progress badge `✓ X/Y` shown on ticket cards; checklist items reset to `done: false` when a recurring ticket auto-creates; checklist persists immediately on toggle (auto-save) and on Save Changes for add/remove
- **Recurring tickets**: `recurrence` field (`weekly` | `biweekly` | `monthly` | `quarterly` | `annually` | null); dropdown in Add and Detail modals; completing a recurring ticket auto-creates the next ticket with `calculateNextDue()` (adds interval to `dueDate` or today); new ticket inherits all fields with checklist reset; `🔁 Label` badge shown on cards; `RECURRENCE_OPTIONS` + `RECURRENCE_LABELS` constants at top of file
- **Sort options**: `sortBy` state (`createdDesc` | `createdAsc` | `priority` | `dueDate`) + dropdown in View Toggle row (moved to Phase 14); `sortedTickets` useMemo applied after `filteredTickets`; used in both kanban (within-column) and list (within-group) views; default is `createdDesc` (matches Firestore order)
- **Email assignee on assignment**: when saving a ticket, detects newly added assignees (excludes self); sends EmailJS notification if `notificationConfig.enabled && templateAssigned` is set; template variables: `to_email`, `to_name`, `ticket_name`, `ticket_number`, `priority`, `due_date`, `assigned_by`; new **Template ID — Ticket Assigned (Maintenance)** field added to Coordination → Notification Settings (`templateAssigned` key in `config/notifications` doc)

### ✅ Done — Phase 11 — Maintenance UX Improvements (2026-03-16)

- **Kanban drag-and-drop**: Cards draggable between columns (admin/manager only); native HTML5 drag-and-drop, no library; drop target highlights teal on hover; updates ticket `status` in Firestore on drop; correctly sets/clears `completedAt` when moving to/from Complete
- **Stat bar compact layout**: Summary stats replaced with compact inline strip (smaller padding, `fontSize:20` vs `fontSize:30`); "Backlog" renamed to "Open" and now counts all non-Complete/non-Cancelled tickets so Planning and On Hold are included
- **Modal close on save**: Ticket detail modal now closes after Save Changes (was staying open)
- **Ticket card redesign**: Removed ticket number from card header; assignee initials (teal circles, 2-char) now shown at top-left of each card; "Unassigned" shown in gray when no assignees; photo/due-date row kept at bottom
- **"My tickets" empty state**: When filter is active but user has no assigned tickets, shows a helpful card explaining how to self-assign with a "Show all tickets" button to clear the filter
- **RichTextarea component**: Toolbar with `• List` and `1. List` buttons added above Description, Notes, and Comments fields; toggles bullet/numbered prefixes on selected lines; stores plain text with `• ` / `1. ` prefixes; comment display uses `white-space: pre-wrap`; comment input changed from single-line `<input>` to `<textarea>` (Enter posts, Shift+Enter = newline)

### ✅ Done — Phase 10 — UX Polish: Duplication, Shortcuts, Public Requests (2026-03-15)

- **Item duplication**: `⊕ Duplicate` button in detail modal and desktop item rows (admin/manager); opens Add Item pre-filled with all fields, ID cleared for new unique assignment
- **Keyboard shortcuts**: `N` = new item, `/` = focus search, `Esc` = close modal; global `keydown` listener on `document`; suppressed in input/textarea/select; `N` only fires when no modal is open and user is admin/manager
- **Public item request form**: `PublicRequestPage.jsx` — no-auth public form shown when `?request=CHURCH_ID&cn=Church+Name` URL params present; fields: name, email, phone, item description, quantity, date needed, urgency, notes; honeypot spam protection (`website` hidden input); writes to `churches/{churchId}/publicRequests`; Firestore rule allows unauthenticated creates; admins see pending requests panel in ItemsPage with Dismiss button; "📥 Copy Request Form Link" in Settings > Team Members; `totalSubs` 12→13

### ✅ Done — Phase 9 — UX Polish & AI Features (2026-03-15)

- **All-In Bundle** ($29/mo) confirmed complete: price ID wired in `PRICE_IDS`, webhook handles `all_in` type (unlocks all hubs + unlimited users), upgrade modal in SettingsPage, plan label shows "All-In"
- **Barcode/QR scanning**: `📷 Scan` button in AppShell top nav (all tabs); `BarcodeScanner` component in `src/components/primitives/`; `@zxing/browser` dynamically imported; tries `facingMode: environment` first, falls back to any camera; parses QR URL `?item=` param or raw text as itemId; navigates to inventory tab + opens item detail; "No item found" flash if ID doesn't match
- **Bulk item actions**: `☑ Select` button in ItemsPage toolbar enters bulk mode; checkboxes on item cards; select-all toggle in navy action bar; bulk checkout (skips non-Available with warning), bulk return (single condition prompt, skips non-returnable with warning), bulk location change, bulk CSV export; `exitBulkMode` resets selection
- **AI item identification**: `✨ Identify Item` button appears in Add Item modal after photo selected; converts `photoFile` to base64 via `FileReader`; calls `identifyItem` Cloud Function (Claude Haiku 4.5 vision, max 100 tokens); pre-fills `itemForm.description`; `ANTHROPIC_API_KEY` stored in Google Secret Manager; `@anthropic-ai/sdk` added to `functions/package.json`

### UX Polish (Ongoing)
- ~~Scoped invite links~~ ✅ Done — Settings > Team Members: admin generates `?invite=CODE&hubs=maintenance,...` link; `AuthScreen` detects param, auto-opens register tab with church code pre-filled and hub banner; `register`/`registerWithGoogle` accept `allowedHubs` and save to user profile.
- ~~Bulk actions~~ ✅ Done — "☑ Select" mode in ItemsPage: select-all, bulk checkout (warn on skip), bulk return (condition prompt), bulk location change, bulk CSV export
- ~~Item duplication~~ ✅ Done — `⊕ Duplicate` button in detail modal + desktop row (admin/manager); opens Add Item pre-filled with all fields copied, Item ID cleared
- ~~Keyboard shortcuts~~ ✅ Done — `N` = open Add Item (no modal open + admin/manager), `/` = focus search input, `Esc` = close topmost modal; suppressed when typing in inputs; `useEffect` on `document` with full modal-state deps
- ~~Barcode scanning via device camera~~ ✅ Done — "📷 Scan" button in top nav (all tabs); `@zxing/browser` dynamically imported; parses QR URL `?item=` param or raw barcode text; navigates to Items tab and opens item detail
- ~~AI item identification from photo~~ ✅ Done — "✨ Identify Item" button in Add Item modal after photo selected; calls `identifyItem` Cloud Function (Claude Haiku vision); pre-fills description field; requires `ANTHROPIC_API_KEY` secret in Google Secret Manager
- ~~Churches report~~ ✅ Done — owner-only "Churches" tab in Settings panel; `getChurchStats` Cloud Function (Admin SDK, owner email-gated) returns all churches with item + user counts via `count()` aggregation queries; shows church name, code, item count, user count, registration date
- ~~Public item request form~~ ✅ Done — `PublicRequestPage.jsx` shown when `?request=CHURCH_ID&cn=Name` param present (no auth); honeypot spam protection; writes to `churches/{churchId}/publicRequests`; Firestore rule allows unauthenticated creates; admins see pending requests panel in ItemsPage; "📥 Copy Request Form Link" button in Settings > Team Members; `useFirestore` `totalSubs` 12→13

## Public Launch Checklist

The data model is already multi-tenant (`churches/{churchId}/`). The following must be completed before opening the app to other churches.

### 🔴 Critical — Fix Before Any Public Use

~~**Firestore security rules**~~ ✅ Done — scoped to user's `churchId` via `get()` lookup; admin-only writes for role/active changes.

~~**Storage security rules**~~ ✅ Done — same `churchId` scoping via `firestore.get()`; IAM role granted.

~~**Password reset UI**~~ ✅ Done — "Forgot password?" link on login screen; `sendPasswordResetEmail()` in `useAuth.js`.

### 🟡 Important — Before Soft Launch

~~**Email verification**~~ ✅ Done — `sendEmailVerification()` called after `createChurch` and `register` (skipped for Google sign-in). Dismissible yellow banner in `AppShell` for unverified users with Resend button; `resendVerification()` exposed from `useAuth`.

~~**Church creation rate limiting**~~ ✅ Done — honeypot hidden input in Create Church form (silently rejected if filled); 1-church-per-email check in `createChurch()` queries `churches` by `createdBy == uid` before proceeding (account deleted and error shown if duplicate found).

**Firebase budget alert** — Set a billing budget in Google Cloud Console to catch unexpected usage spikes. *(Console-only — no code change needed.)*

~~**Terms of Service & Privacy Policy**~~ ✅ Done — ToS checkbox on all three registration forms (register, googleRegister, createChurch); submit button disabled until checked. Clicking "Terms of Service" or "Privacy Policy" opens a modal overlay within `AuthScreen` with full content; "I Agree" button in modal footer auto-checks the checkbox. Content drafted covering: acceptance, data ownership, storage/isolation, deletion rights, cookies.

### 🟢 Polish — For Full Public Launch

~~**Item ID minimum length**~~ ✅ Done — `handleAdd` and `handleEdit` in `ItemsPage.jsx` reject IDs shorter than 3 characters with a flash message; Add button disabled until valid.

~~**Onboarding flow**~~ ✅ Done — 3-step modal in `AppShell` fires when `userProfile.role === 'admin' && !config?.onboardingComplete && items.length === 0`; steps: Welcome → Settings (locations/ministries) → Add first item; each step has a primary CTA that navigates to the relevant tab; any dismiss/skip/complete writes `onboardingComplete: true` to `config/main`. Progress dots in the modal header.

~~**Account & data deletion**~~ ✅ Done (client-side) — "Delete Account" button in Settings > Danger Zone; modal with `type DELETE` confirmation + password field (skipped for Google users who get a popup re-auth instead); reauthenticates via `reauthenticateWithCredential` (email) or `reauthenticateWithPopup` (Google), then deletes Firestore user profile + Firebase Auth account. Admin warning shown explaining church data remains and to contact us for full deletion. Full church subcollection deletion requires a Cloud Function (Phase 8 / Stripe work).

~~**Landing / marketing page**~~ ✅ Done — `LandingPage.jsx` shown to unauthenticated visitors; sections: hero, free features grid, hubs teaser, pricing (free vs. All-In), individual hub pricing toggle, how-it-works steps, CTA banner, footer.

~~**Custom domain**~~ ✅ Done — `churchopshub.com` configured in Vercel (Valid Configuration); added to Firebase Authentication authorized domains; `authDomain` updated in `src/firebase.js`. `vercel.json` added to proxy `/__/auth/*` to `church-inventory-9615c.firebaseapp.com` (required for Firebase Auth OAuth handler on non-Firebase hosting). Google Cloud Console OAuth client must have `https://churchopshub.com` in Authorized JavaScript Origins and `https://churchopshub.com/__/auth/handler` in Authorized Redirect URIs — these are console-only settings, not in code.

~~**Error monitoring**~~ ✅ Done — Sentry integrated in `main.jsx` with browser tracing (20% sample rate).

### Deployment

Deployed via Vercel (auto-detect Vite). Firebase config is hardcoded in `src/firebase.js` (not via env vars).

To deploy Firestore/Storage rules: `./node_modules/.bin/firebase deploy --only firestore:rules,storage` (requires `firebase login` first). `.firebaserc` is configured with project ID `church-inventory-9615c`.

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

### 🟡 Bare `>` in JSX text content
esbuild's strict JSX parser rejects bare `>` characters in JSX text (e.g. `<P>Settings > Team Members</P>`). Use `→` for navigation paths or `{'>'`} to escape. Running `npm run build` will surface these immediately.

### 🟡 Pseudo-selector styles (`:focus`, `:hover`) require global CSS
Inline styles cannot target pseudo-selectors. The workaround for focus states is a global CSS rule in `index.html` — not `onFocus`/`onBlur` handlers on every input. The existing rule in `index.html` covers all `input`, `select`, and `textarea` elements with a teal border + glow on focus. For hover states on interactive elements, use `onMouseEnter`/`onMouseLeave` handlers inline (see KanbanColumn, TicketCard).

---

## Known Issues & Tech Debt

Findings from a full security + UX audit. All items resolved.

### 🟢 UX — Post-Launch Fixes

~~**Maintenance ticket detail modal stays open after Save**~~ ✅ Fixed — `handleUpdateTicket` now calls `setShowDetail(null)` + `setDetailEdits({})` on success instead of updating local state in-place. All other modal save handlers were audited and close correctly.

### 🔴 Security — High Priority

~~**Users Firestore rule leaks cross-church data**~~ ✅ Fixed — reads now require `request.auth.uid == userId || userChurchId() == resource.data.churchId`.

~~**Suggestions UI gate uses wrong email source**~~ ✅ Fixed — `isOwner` now uses `user?.email` from the Firebase Auth object (verified token) instead of `userProfile?.email` (user-writable Firestore field). `user` prop passed from `AppShell` → `SettingsPage`.

### 🟡 Security — Medium Priority

~~**Church code lookup scans entire `churches` collection**~~ ✅ Fixed — replaced full collection scans with `query(collection(db, 'churches'), where('churchCode', '==', ...))`. Auth account is now created before the check so the read is authenticated. Firestore rules updated to allow any authenticated user to read church parent docs (name/code only).

### ~~🔴 UX — Missing Confirmations on Destructive Actions~~ ✅ Fixed

~~No confirmation dialog before deactivating users, changing roles, or changing the church code.~~ Added `window.confirm()` for all three.

### 🟡 UX — Data Integrity Bugs

~~**Photo upload failure is silent**~~ ✅ Fixed — `flash()` now shown when photo upload fails in both ItemsPage and MaintenancePage.

~~**Return date not validated against checkout date**~~ ✅ Fixed — validated in checkout flow and reservation form before submit.

~~**Supply quantities allow negatives**~~ ✅ Fixed — validated on submit before saving.

~~**Item ID has no minimum length or pattern enforcement**~~ ✅ Fixed — 3-character minimum enforced in `handleAdd`/`handleEdit`; Add button disabled until valid.

~~**Firestore errors are silent — no user feedback and not logged to Sentry**~~ ✅ Fixed — `handleErr()` helper in `useFirestore` calls `console.error` + writes to top-level `errors` collection (fire-and-forget) + sets `store.error`; `AppShell` renders a dark toast that auto-dismisses after 5s with an × to close; `clearError` exposed from hook; `Sentry.captureConsoleIntegration({ levels: ['error'] })` added to `main.jsx` so all errors reach Sentry; owner Error Log tab in Settings panel loads from `errors` collection showing message, churchId, timestamp, and stack trace.

### 🟢 UX — Polish

~~**QR code depends on external API**~~ ✅ Fixed — replaced `api.qrserver.com` with the `qrcode` npm package. QR codes now generated entirely client-side.

~~**Activity log capped at 20 entries with no load-more**~~ ✅ Fixed — `activityVisible` state (starts at 20, increments by 20); "Load more (N remaining)" button shown when more entries exist; resets when range filter changes.

~~**No copy-to-clipboard on church code**~~ ✅ Fixed — "Copy" button next to the church code uses `navigator.clipboard.writeText()`; shows "Copied!" confirmation for 2 seconds.

---

## Performance & Efficiency

Findings from a full efficiency audit. Fix in priority order before hub expansion.

### 🔴 Firestore — High Priority

~~**`loadUsers` scans entire users collection**~~ ✅ Fixed — replaced `getDocs(collection(db, 'users'))` + client-side filter with a real-time `onSnapshot` listener using `where('churchId', '==', churchId)`. Removed manual `loadUsers()` calls from `updateUser`/`removeUser`; removed Refresh button from Team Members UI. `totalSubs` bumped to 9.

~~**Ticket numbering is O(n) per new ticket**~~ ✅ Fixed — `addTicket()` now uses `runTransaction` to atomically read and increment `maxTicketNumber` on `config/main`. No longer scans all tickets on creation.

~~**Suggestions load has no limit**~~ ✅ Fixed — added `.limit(100)` to `loadSuggestions()` query.

### 🟡 React — Medium Priority

~~**No `useMemo` on expensive derived state**~~ ✅ Fixed — wrapped `activeItems`, `counts`, `checkedOut`, `overdue`, `lowStock`, `pendingRes`, and `activityFiltered` in Dashboard; `activeItems`, `disposedItems`, `displayItems` in ItemsPage. Activity log filter lifted out of inline IIFE into `useMemo`.

~~**`useWindowWidth` fires on every pixel during resize**~~ ✅ Fixed — added 100ms debounce to the resize handler in `useMobile.js`.

~~**Bulk location change writes `_docId` to Firestore**~~ ✅ Fixed — `handleBulkLocation` was spreading `{ ...item, location }` which included the internal `_docId` field; now passes only `{ location: bulkNewLoc }`.

~~**Bulk operations are sequential**~~ ✅ Fixed — `handleBulkCheckout`, `handleBulkReturn`, and `handleBulkLocation` now use `Promise.all` instead of sequential `for...of` + `await`.

~~**`loadChurches` dead code in `useFirestore`**~~ ✅ Removed — `SettingsPage` calls the `getChurchStats` Cloud Function directly; client-side `loadChurches` was unused and removed from hook + store return.

### 🟢 Longer Term (pre-hub expansion)

~~**Extract remaining pages out of `App.jsx`**~~ ✅ Done — `App.jsx` trimmed from 2330 to 368 lines; all 6 remaining pages extracted to `src/pages/`. Now ready for lazy loading and hub expansion.
