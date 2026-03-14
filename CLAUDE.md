# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, typically http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
```

There are no tests and no linter configured.

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
│       └── UpgradeGate.jsx    ← Paywall component; shows upgrade card when hub inactive
├── pages/
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
│   └── imageResize.js         ← resizeImageForUpload
└── data/
    └── referenceData.js       ← Static reference inventory (not auto-seeded; reference only)
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
| `churches/{churchId}/maintenanceTickets` | Maintenance Hub: repair tickets (MNT-### numbering, max-based); fields: `ticketNumber`, `name`, `description`, `priority` (High/Medium/Low), `status` (Backlog/Planning/In Progress/On Hold/Complete/Cancelled), `tags[]`, `dueDate`, `assignees[{uid,name}]`, `photos[]`, `linkedItemDocId/Id/Description`, `vendorId/Name`, `estimatedCost`, `actualCost`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`, `completedAt` |
| `churches/{churchId}/maintenanceTickets/{id}/comments` | Comment subcollection: `text`, `authorId`, `authorName`, `createdAt` |
| `churches/{churchId}/vendors` | Maintenance Hub: vendor/contractor directory |
| `churches/{churchId}/config/settings.maintenanceTags` | `string[]` — tag autocomplete for maintenance tickets; new tags added via `arrayUnion` |
| `churches/{churchId}/bundles` | Coordination Hub: checkout bundles; fields: `name`, `description`, `items[{docId,itemId,description,location}]`, `createdBy`, `createdByName`, `createdAt` |
| `churches/{churchId}/config/notifications` | Coordination Hub: EmailJS config; fields: `enabled`, `serviceId`, `publicKey`, `templateApproved`, `templateDenied` |
| `churches/{churchId}/audits` | Accountability Hub: physical audit records; fields: `location`, `conductedBy`, `conductedByName`, `startedAt`, `completedAt`, `status`, `itemsChecked`, `discrepancyCount`, `items[{docId,itemId,description,currentStatus,auditResult,condition,notes}]`, `discrepancies[]`, `createdAt` |
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
- **Role enforcement:** `isAdmin = userProfile?.role === "admin"`. Only admins can retire items, edit dropdown lists (Locations/Ministries/Tags), and promote/demote other users. Roles: `admin` / `manager` (Phase 5) / `user`. Hub visibility per user controlled by `allowedHubs[]` on user profile (see Per-User Hub Access).
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
| **All-In Bundle** | $29/mo | Planned |

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

### ✅ Done — Phases 1–7

**Phases 1–3:**
- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub (rebuilt): kanban + list views, 6-status workflow (Backlog→Complete), multi-assignee, tag autocomplete (`maintenanceTags` via `arrayUnion`), photo uploads (Firebase Storage at `churches/{churchId}/maintenance/{docId}/`), real-time comment threads (subcollection), vendor directory, overdue date highlighting, `maint_viewMode` persisted to localStorage
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel (tabbed: Suggestions / Error Log) gated by `['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(email)` in UI and by `request.auth.token.email in [...]` in Firestore rules; Error Log loads from top-level `errors` collection written by `handleErr()` in `useFirestore`

**Phase 4 — Insights Hub:**
- `InsightsPage.jsx`: 5 sections — Item Utilization, Ministry Breakdown, Seasonal Trends, Financial & Depreciation, Supply Burn Rate
- Recharts (BarChart, AreaChart, PieChart) for all visualizations
- Financial fields on items: `purchaseDate`, `purchasePrice`, `warrantyExpiry`, `estimatedValue` (collapsible in Add/Edit modals; shown in Detail modal)
- Straight-line depreciation over 5 years; manual override option; warranty expiry alerts (90-day window)

**Phase 5 — Team Hub:**
- User count display in Team Members header (e.g. "8 / 10 members"); upgrade banner for admins at/over the free plan 10-user cap
- Three roles: `admin` (full access), `manager` (assigned hubs + managed ministries), `user` (assigned hubs only); distinct badge colors
- Edit Access modal in Settings > Team Members: role selector (Admin/Manager/User), hub checkboxes (church-active hubs only), managed ministries multi-select (manager only)
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

### Phase 8 — Stripe Integration
- Cloud Functions: createCheckoutSession, createPortalSession, stripeWebhook
- Webhook updates config/subscription on payment events
- Billing portal in SettingsPage

### UX Polish (Ongoing)
- ~~Scoped invite links~~ ✅ Done — Settings > Team Members: admin generates `?invite=CODE&hubs=maintenance,...` link; `AuthScreen` detects param, auto-opens register tab with church code pre-filled and hub banner; `register`/`registerWithGoogle` accept `allowedHubs` and save to user profile.
- Bulk actions (select multiple items to check out, change location, or export)
- Item duplication ("Duplicate item" to clone similar items)
- Keyboard shortcuts (N to add item, / to focus search, Esc to close modal)
- Barcode scanning via device camera
- Public item request form (shareable URL for non-app users)

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

**Onboarding flow** — After church creation, guide the admin through adding their first location, ministry, and item. Could be a multi-step modal that fires once on first login when `items.length === 0`. Implementation: new `OnboardingModal` component in `App.jsx` or `SettingsPage.jsx`; flag in `config/main` (`onboardingComplete: true`) once dismissed.

**Account & data deletion** — GDPR and similar laws require users to be able to delete their account and all associated data. Implementation: "Delete My Account" button in Settings; calls a Firebase Cloud Function that deletes the Auth user + all their Firestore data (or just marks as deleted and a cleanup job runs). If admin, warn that deleting transfers ownership or orphans the church.

**Landing / marketing page** — Currently the app URL goes straight to the login screen. New visitors need a page explaining what ChurchOpsHub is, with pricing, a CTA, and a sign-up link.

**Custom domain** — Replace `church-inventory-9615c.firebaseapp.com` with a real domain (e.g., `churchopshub.com`) for auth and hosting. *(Infrastructure — Vercel + Firebase Console config only.)*

~~**Error monitoring**~~ ✅ Done — Sentry integrated in `main.jsx` with browser tracing (20% sample rate).

### Deployment

Deployed via Vercel (auto-detect Vite). Firebase config is hardcoded in `src/firebase.js` (not via env vars).

To deploy Firestore/Storage rules: `./node_modules/.bin/firebase deploy --only firestore:rules,storage` (requires `firebase login` first). `.firebaserc` is configured with project ID `church-inventory-9615c`.

---

## Known Issues & Tech Debt

Findings from a full security + UX audit. All items resolved.

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

### 🟢 Longer Term (pre-hub expansion)

~~**Extract remaining pages out of `App.jsx`**~~ ✅ Done — `App.jsx` trimmed from 2330 to 368 lines; all 6 remaining pages extracted to `src/pages/`. Now ready for lazy loading and hub expansion.
