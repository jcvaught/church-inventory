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
| `churches/{churchId}/maintenanceTickets` | Maintenance Hub: repair tickets (MNT-### numbering) |
| `churches/{churchId}/vendors` | Maintenance Hub: vendor/contractor directory |
| `users/{uid}` | User profile with `churchId`, `role` (`admin`/`user`), `name`, `email`, `active` |
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
- **QR codes:** Generated via `https://api.qrserver.com` (no npm package). Links back to the app with `?item=` param.
- **Firebase Storage** (Blaze plan): item photos stored under `churches/{churchId}/items/`. Images are client-side resized to max 1200px / 82% JPEG quality before upload via Canvas API (`resizeImageForUpload`).
- **Role enforcement:** `isAdmin = userProfile?.role === "admin"`. Only admins can retire items, edit dropdown lists (Locations/Ministries/Tags), and promote/demote other users.
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

## Roadmap

### ✅ Done — Phases 1–3
- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub: tickets (MNT-### numbering), priority/category/status, vendor directory, stats
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel gated by `userProfile?.email === 'jcvaught@gmail.com'` in UI and by `request.auth.token.email` in Firestore rules

### Phase 4 — Insights Hub
- Item utilization stats, ministry usage breakdown, seasonal trends
- Depreciation tracking (purchaseDate/Price → estimated value)
- Supply burn rate + reorder forecasting
- Additional `purchaseDate`, `purchasePrice`, `estimatedValue` fields on items

### Phase 5 — Team Hub
- 10-user soft cap with upgrade banner
- "Manager" role with ministry-scoped permissions
- `managedMinistries[]` field on user profiles

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
