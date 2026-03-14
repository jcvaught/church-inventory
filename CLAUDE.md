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
├── App.jsx                    ← Slim shell: auth gate + AppShell
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
│   ├── primitives/
│   │   ├── Modal.jsx, FF.jsx, Badge.jsx, Stat.jsx, Spinner.jsx
│   │   └── UpgradeGate.jsx    ← Paywall component; shows upgrade card when hub inactive
│   └── layout/
│       ├── AppShell.jsx       ← Top-level shell with header, tabs, mobile nav
│       ├── Header.jsx
│       └── BottomNav.jsx
├── pages/
│   ├── Dashboard.jsx
│   ├── ItemsPage.jsx
│   ├── SuppliesPage.jsx
│   ├── ReservationsPage.jsx
│   ├── ActivityLogPage.jsx
│   ├── SettingsPage.jsx       ← Includes Subscription & Billing card for admins
│   └── hubs/
│       └── MaintenancePage.jsx ← Maintenance Hub (Phase 3)
├── utils/
│   ├── csv.js                 ← exportItemsCSV, exportSuppliesCSV, exportReservationsCSV
│   ├── print.js               ← printLabel, printInventory
│   └── imageResize.js         ← resizeImageForUpload
└── data/
    └── referenceData.js       ← Static reference inventory (not auto-seeded; reference only)
```

### Data Flow

`App` → `AppShell` → renders one of seven tab pages, each receiving `store`, `userProfile`, and `subscription` as props.

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
| `users/{uid}` | User profile with `churchId`, `role` (`admin`/`manager`/`user`), `name`, `email`, `active`, `allowedHubs[]`, `managedMinistries[]` |
| `suggestions/{docId}` | **Top-level** (not church-scoped) — cross-church user suggestions; fields: `text`, `category`, `submittedBy`, `submittedByName`, `churchId`, `churchName`, `submittedAt` |

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
- Tab keys: `dashboard`, `settings`, `inventory`, `supplies`, `reservations`, `log`, `maintenance`.
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
| **Team Hub** | $9/mo (25 users) or $19/mo (unlimited) | Planned — Phase 5 |
| **Insights Hub** | $7/mo | Planned — Phase 4 |
| **Maintenance Hub** | $7/mo | ✅ Done — Phase 3 |
| **Coordination Hub** | $7/mo | Planned — Phase 6 |
| **Accountability Hub** | $5/mo | Planned — Phase 6 |
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
- Hub tabs always visible (with 🔒 when locked) to drive discovery
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

### ✅ Done — Phases 1–3
- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub (rebuilt): kanban + list views, 6-status workflow (Backlog→Complete), multi-assignee, tag autocomplete (`maintenanceTags` via `arrayUnion`), photo uploads (Firebase Storage at `churches/{churchId}/maintenance/{docId}/`), real-time comment threads (subcollection), vendor directory, overdue date highlighting, `maint_viewMode` persisted to localStorage
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel gated by `['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(email)` in UI and by `request.auth.token.email in [...]` in Firestore rules

### Phase 4 — Insights Hub
- Item utilization stats, ministry usage breakdown, seasonal trends
- Depreciation tracking (purchaseDate/Price → estimated value)
- Supply burn rate + reorder forecasting
- Additional `purchaseDate`, `purchasePrice`, `estimatedValue` fields on items

### Phase 5 — Team Hub
- 10-user soft cap with upgrade banner
- Three roles: `admin` (full access), `manager` (assigned hubs + managed ministries), `user` (assigned hubs only)
- `managedMinistries[]` field on user profiles — managers scoped to their ministries
- `allowedHubs[]` field on user profiles — per-user hub visibility (null = all church hubs)
- Admin UI in Settings > Team Members to assign hubs and ministries per user

### Phase 6 — Coordination Hub
- Email notifications (EmailJS): reservation approved/denied, overdue, low-stock
- Checkout bundles ("Sunday Morning Setup" = predefined item groups)
- Recurring reservations

### Phase 7 — Accountability Hub
- Physical audit mode (QR scan walk-through)
- Chain of custody reports
- Condition photo logging at check-in/check-out

### Phase 8 — Stripe Integration
- Cloud Functions: createCheckoutSession, createPortalSession, stripeWebhook
- Webhook updates config/subscription on payment events
- Billing portal in SettingsPage

### UX Polish (Ongoing)
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

**Email verification** — Add `sendEmailVerification()` after registration to reduce fake/abuse accounts.

**Church creation rate limiting** — Nothing prevents one person from creating hundreds of churches. Consider limiting by email or adding a honeypot field.

**Firebase budget alert** — Set a billing budget in Google Cloud Console to catch unexpected usage spikes (already on Blaze pay-as-you-go).

**Terms of Service & Privacy Policy** — Legally required when handling data for multiple organizations. Must be linked from the registration screen.

### 🟢 Polish — For Full Public Launch

**Custom domain** — Replace `church-inventory-9615c.firebaseapp.com` with a real domain (e.g., `churchopshub.com`) for auth and hosting.

**Landing / marketing page** — Currently the app URL goes straight to the login screen. New visitors need a page explaining what ChurchOpsHub is.

**Onboarding flow** — After church creation, guide the admin through adding their first location, ministry, and item.

**Account & data deletion** — GDPR and similar laws require users to be able to delete their account and all associated data.

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

**Item ID has no minimum length or pattern enforcement** (`ItemsPage`)
Single-character IDs like "A" are accepted. Consider requiring at least 3 characters or a pattern like `[A-Z0-9]{2,}-[0-9]+`.

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

**Extract remaining pages out of `App.jsx`** — currently 2300+ lines with all 7 pages inline. `MaintenancePage` is already extracted; finish extracting `SettingsPage`, `Dashboard`, `ItemsPage`, `SuppliesPage`, `ReservationsPage`, `ActivityLogPage`. Prerequisite for lazy loading and easier maintainability as hubs grow.
