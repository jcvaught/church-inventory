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
├── App.jsx           ← Entire UI: all page components, modals, primitives (~2200 lines)
├── useAuth.js        ← Firebase Auth hook (email/password + Google, church setup/join)
├── useFirestore.js   ← All Firestore read/write operations as a single hook
├── firebase.js       ← Firebase app init; exports `db`, `auth`, `googleProvider`, `storage`
├── main.jsx          ← React entry point
└── data/
    └── referenceData.js  ← Static reference inventory (not auto-seeded; reference only)
```

### Data Flow

`App` → `AppShell` → renders one of six tab pages, each receiving `store` and `userProfile` as props.

- `useAuth()` handles authentication state and exposes `userProfile` (Firestore user record with `churchId`, `role`, `name`).
- `useFirestore(churchId)` subscribes in real-time to all six Firestore collections for that church and exposes CRUD operations.
- `store` passed to pages is the return value of `useFirestore`.

### Firestore Data Model (Multi-Tenant)

All church data is namespaced under `churches/{churchId}/`:

| Path | Contents |
|------|----------|
| `churches/{churchId}` | Church name, code, createdAt |
| `churches/{churchId}/config/main` | Church metadata |
| `churches/{churchId}/config/settings` | `locations[]`, `ministries[]`, `tags[]` |
| `churches/{churchId}/items` | Equipment inventory items |
| `churches/{churchId}/supplies` | Consumable supplies with quantity tracking |
| `churches/{churchId}/activityLog` | Audit trail (every action logged) |
| `churches/{churchId}/reservations` | Future item reservation requests |
| `users/{uid}` | User profile with `churchId`, `role` (`admin`/`user`), `name`, `email`, `active` |

`churchId` is always `{creatorUid}-church` (set at church creation time).

### Auth Flow

1. **Create church** — admin creates a church with a unique alphanumeric church code; their UID becomes the churchId prefix.
2. **Join church** — new members register with email/password or Google, entering the church code to be linked to the right `churchId`.
3. Firestore rules scope all church data to the user's own `churchId` via a `get()` lookup. Admins can update role/active for users in their own church. Storage rules apply the same scoping via `firestore.get()`.

### UI Conventions

- **No CSS files, no component library, no router.** All styling is inline using a `B` brand token object defined at the top of `App.jsx`.
- Two font families: `f1 = 'Outfit'` (headings/UI), `f2 = 'Source Sans 3'` (body text) — loaded from Google Fonts at runtime.
- Shared style objects: `inp` (inputs), `btnP` (primary button), `btnS` (secondary), `btnD` (danger).
- Reusable primitives defined in `App.jsx`: `Modal`, `FF` (form field wrapper), `Badge` (status pill), `Stat` (dashboard stat card), `Spinner`.
- Tab keys: `dashboard`, `settings`, `inventory`, `supplies`, `reservations`, `log`.
- `MobileCtx` React context + `useWindowWidth()` hook drive mobile layout. Components read `useContext(MobileCtx)` — no prop drilling needed. Breakpoint is 768px.
- Mobile: tabs hidden, bottom nav bar fixed at bottom, modals slide up from bottom.
- **Deep linking:** `?item=ITEM_ID` URL param auto-opens item detail. URL cleaned with `history.replaceState` after read.
- **QR codes:** Generated via `https://api.qrserver.com` (no npm package). Links back to the app with `?item=` param.
- **Firebase Storage** (Blaze plan): item photos stored under `churches/{churchId}/items/`. Images are client-side resized to max 1200px / 82% JPEG quality before upload via Canvas API (`resizeImageForUpload`).
- **Role enforcement:** `isAdmin = userProfile?.role === "admin"`. Only admins can retire items, edit dropdown lists (Locations/Ministries/Tags), and promote/demote other users.
- **localStorage:** Items page persists `locationFilter` and `ministryFilter` under keys `inv_locationFilter` / `inv_ministryFilter`.

### Item Status Values

`Available` | `Checked Out` | `In Use` | `Under Repair` | `Disposed`

## Roadmap

### Session 6 — Notifications & Awareness
- Email notifications when a reservation is approved/denied (EmailJS, no backend)
- Overdue escalation visibility per user
- Countdown on approved reservations ("3 days away")

### Session 7 — Reporting & History ✅ Done
- Full inventory print view (all active items grouped by location or ministry)
- Supply usage history drawer (filter activityLog by supplyId)
- Dashboard activity stats date range filter (7/30/90 days)

### Session 8 — UX Polish
- Bulk actions (select multiple items to check out, change location, or export)
- Item duplication ("Duplicate item" to clone similar items)
- Keyboard shortcuts (N to add item, / to focus search, Esc to close modal)

### Bigger Lift (Later)
- Public item request form (shareable URL for non-app users)
- Barcode scanning via device camera
- Multi-location / campus-aware filtering

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
