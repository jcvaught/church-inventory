# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, typically http://localhost:5173)
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run lint      # ESLint — catch bugs and hook violations (0 errors baseline)
npm run lint:fix  # ESLint with auto-fix
npm run analyze   # Build + open bundle size visualizer in browser (dist/bundle-stats.html)
```

**Run `npm run build` and fix any errors before pushing.** Run `npm run lint` regularly — the baseline is 0 errors, 47 intentional `exhaustive-deps` warnings. Any new errors should be fixed before committing.

### Deployment

Deployed via Vercel (auto-detect Vite). Firebase config is hardcoded in `src/firebase.js` (not via env vars).

To deploy Firestore/Storage rules: `./node_modules/.bin/firebase deploy --only firestore:rules,storage` (requires `firebase login` first). `.firebaserc` is configured with project ID `church-inventory-9615c`.

**TODO:** Set a Firebase billing budget in Google Cloud Console to catch unexpected usage spikes. (Console-only — no code change needed.)

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
│   ├── primitives/
│   │   ├── Modal.jsx, FF.jsx, Badge.jsx, Stat.jsx, Spinner.jsx
│   │   ├── UpgradeGate.jsx    ← Paywall component; shows upgrade card when hub inactive
│   │   └── (RichTextarea is a local component inside MaintenancePage.jsx, not a shared primitive)
│   └── SEO.jsx                ← Reusable SEO component (react-helmet-async); sets title, description, canonical, OG tags, Twitter card, JSON-LD
├── pages/
│   ├── LandingPage.jsx        ← Marketing landing page; includes SoftwareApplication JSON-LD schema and pain points copy
│   ├── HelpPage.jsx           ← User-facing help center (no auth required); shown when ?help param present; 12 sections, accordion UI, responsive sidebar
│   ├── PublicRequestPage.jsx  ← Public item request form (no auth required); shown when ?request=CHURCH_ID param present
│   ├── BlogIndex.jsx          ← Blog listing page at /blog; nav, post cards, CTA, footer
│   ├── BlogPost.jsx           ← Single blog post at /blog/:slug; related articles, post-level JSON-LD, CTA
│   ├── Dashboard.jsx
│   ├── ItemsPage.jsx
│   ├── SuppliesPage.jsx
│   ├── ReservationsPage.jsx
│   ├── ActivityLogPage.jsx
│   ├── SettingsPage.jsx       ← Includes Subscription & Billing card for admins
│   ├── HubsPage.jsx           ← Hub picker + sub-navigation container; renders hub cards and routes into active hub with breadcrumb
│   └── hubs/
│       ├── MaintenancePage.jsx     ← Maintenance Hub (Phase 3)
│       ├── InsightsPage.jsx        ← Insights Hub (Phase 4): utilization, ministry, seasonal, financial, supply analytics (Recharts)
│       ├── CoordinationPage.jsx    ← Coordination Hub (Phase 6): checkout bundles, email notification settings
│       ├── AccountabilityPage.jsx  ← Accountability Hub (Phase 7): physical audits, chain of custody, insurance export
│       └── PeopleAccessPage.jsx    ← People Access Hub: background checks, key assignments, certifications, custom compliance milestones
├── utils/
│   ├── csv.js                 ← exportItemsCSV, exportSuppliesCSV, exportReservationsCSV, exportAccessRecordsCSV
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
| `churches/{churchId}/accessPeople` | People Access Hub: tracked people (staff/volunteers); fields: `name`, `email`, `phone`, `ministries[]`, `notes`, `active` (soft archive), `createdBy`, `createdAt`, `updatedAt` |
| `churches/{churchId}/accessRecords` | People Access Hub: one flat collection for all compliance record types; fields: `personId`, `personName` (denormalized), `type` (`background_check`/`key_assignment`/`certification`/`custom`), `completedDate`, `expiryDate`, `notes`, `ministry`, `recordedBy`, `recordedByName`, `createdAt`, `updatedAt`; key_assignment adds: `keyIdentifier`, `returnedDate`; certification adds: `certType`, `issuingOrganization`; custom adds: `requirementId`, `requirementName` |
| `churches/{churchId}/config/settings.peopleAccessRequirements` | `[{id, name, hasExpiry}]` — custom requirement types for People Access Hub; added via `arrayUnion` |
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
- Tab keys: `dashboard`, `inventory`, `supplies`, `reservations`, `log`, `hubs`, `settings`. All paid hubs are accessed via the `hubs` tab through `HubsPage`. Hub picker shows cards for all 5 hubs (Insights, Maintenance, Coordination, Accountability, People Access) — active hubs show "Open →", inactive show price and upgrade CTA. Clicking a hub sets `hubKey` (stored in `localStorage` as `lastHub`) and renders the hub with a `← All Hubs` breadcrumb. Clicking "Hubs" nav tab while already on hubs resets to the picker.
- `MobileCtx` React context + `useWindowWidth()` hook in `src/hooks/useMobile.js`. Components read `useContext(MobileCtx)` — no prop drilling needed. Breakpoint is 768px.
- Mobile: tabs hidden, bottom nav bar fixed at bottom, modals slide up from bottom.
- **Routing:** No router library. `App.jsx` checks `window.location.pathname` first (`/blog` → BlogIndex, `/blog/:slug` → BlogPost), then query params (`?request=` → PublicRequestPage, `?help` → HelpPage, `?signup`/`?invite` → AuthScreen), then auth state (unauthenticated → LandingPage, authenticated → AppShell).
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
- **SEO:** `react-helmet-async` installed; `<HelmetProvider>` wraps the app in `main.jsx`. Reusable `<SEO>` component in `src/components/SEO.jsx` sets `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags, Twitter Card tags, and optional JSON-LD via `<script type="application/ld+json">`. Applied to LandingPage (with SoftwareApplication schema), HelpPage, BlogIndex, and BlogPost (with BlogPosting schema). Blog posts use `ogType="article"`. Google Search Console verified via `public/google254ab6f07b8682a3.html`.
- **AppShell footer (desktop only):** Displays logo, domain, and links to Help Center and Blog. Hidden on mobile (`!isMobile`). Blog link uses `href="/blog"` — works via Vercel catch-all rewrite.
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
| **People Access Hub** | $7/mo | ✅ Done |

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
- Payment: Stripe (Cloud Functions — wired up via `createCheckoutSession` / `createPortalSession`)

### Per-User Hub Access
Hub visibility is controlled at two levels:
1. **Church level** — subscription `hubs[]` determines which hubs the church has paid for
2. **User level** — `allowedHubs[]` on `users/{uid}` determines which of those hubs a given user can see

**Rules:**
- `admin` role always sees all church hubs — no `allowedHubs` check needed
- `manager` and `user` roles: visible hubs = intersection of church `hubs[]` and user `allowedHubs[]`
- `allowedHubs` null/missing = user inherits all church hubs (default for backward compatibility)
- Admins assign hub access per-user in Settings > Team Members (only showing hubs the church has)
- This is a **UI/UX concern only** — Firestore rules do not change

## Completed Phases

All phases complete as of 2026-03-17. See `docs/CHANGELOG.md` for full details.

| Phase | Name | Date |
|-------|------|------|
| 1–3 | Code restructure, Subscription infrastructure, Maintenance Hub | — |
| 4 | Insights Hub | — |
| 5 | Team Hub | — |
| 6 | Coordination Hub | — |
| 7 | Accountability Hub | — |
| 8 | Stripe Integration | — |
| 9 | UX Polish & AI Features | 2026-03-15 |
| 10 | UX Polish: Duplication, Shortcuts, Public Requests | 2026-03-15 |
| 11 | Maintenance UX Improvements | 2026-03-16 |
| 12 | Help Center & User-Facing Documentation | 2026-03-16 |
| 13 | Maintenance Hub Enhancements | 2026-03-16 |
| 14 | UI Polish | 2026-03-16 |
| 15 | Security, Performance & Code Quality Audit | 2026-03-16 |
| 16 | Full App Code Review & Bug Sweep | 2026-03-17 |
| 17 | Mobile Audit & Responsive Fixes | 2026-03-17 |
| 18 | UX Polish & Settings Inline Editing | 2026-03-17 |
| 19 | Production Crash: Full Investigation & Fix | 2026-03-17 |
| 20 | Delete Actions & Supply Tags | 2026-03-17 |
| 21 | AI Supply Identification | 2026-03-17 |
| — | Location Report (Insights Hub) | 2026-03-18 |
| — | Move between Inventory and Supplies (admin) | 2026-03-18 |
| — | Auto-generated IDs & inline tag creation for items | 2026-03-18 |
| — | iOS Safari compatibility fixes | 2026-03-18 |
| — | SEO: sitemap, robots.txt, meta tags, schema markup, blog | 2026-03-18 |
| — | Blog link in AppShell desktop footer; Google Search Console verification | 2026-03-19 |
| — | Auto-generate Item ID when moving supply to inventory | 2026-03-19 |
| — | Hub picker (HubsPage): single "Hubs" tab replaces individual hub tabs; picker grid + sub-nav breadcrumb | 2026-03-19 |
| — | People Access Hub: background checks, key assignments, certifications, custom requirements, expiry alerts, CSV export | 2026-03-19 |

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
