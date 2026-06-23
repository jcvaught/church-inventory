# Hub Restructure — Plan (2026-06-23)

**Goal:** Make navigation consistent — the free operational surfaces (Items, Supplies,
Reservations) become **hub cards** like everything else, instead of top-level nav tabs. Do this
*before* the room-calendar build so the calendar lands in its final home (the Reservations Hub) and
isn't moved twice. See `docs/ROOM-CALENDAR-PLAN-2026-06-23.md`.

## Decisions (owner, 2026-06-23)
- **Inventory Hub** (free) — Items + Supplies behind a sub-nav toggle (mirrors `WorkPage`'s
  Tasks/Maintenance pattern).
- **Reservations Hub** (free, keeps the name) — equipment *or* rooms. The surface the room-calendar
  builds into next.
- Both **free** — no `UpgradeGate`, shown as **"Included"** cards.
- **Hide locked/paid hubs from members who can't use them** (no paywall cards for free members).
  Keep the admin/manager **"View Plan"** callout for upgrade discovery.
- **Top nav slims** to: `Dashboard · Event Day · Hubs · Activity Log · Settings`.

## Files & changes

### NEW `src/pages/InventoryPage.jsx`
Container mirroring `WorkPage.jsx`: an **Items | Supplies** segmented toggle (persisted in
`localStorage.inventoryCategory`) that lazy-mounts `ItemsPage`/`SuppliesPage`. Threads
`initialItemId`/`scannedItemId`/`onScannedItemConsumed` to `ItemsPage`, and **forces the Items
sub-view** whenever a deep-link/scan item is present.

### `src/pages/HubsPage.jsx`
- Lazy-import `InventoryPage` + `ReservationsPage`.
- Add `inventory` + `reservations` to `HUB_DEFS` at the **top**, with `free: true`.
- `HubContent`: branches for `inventory` (threads the item props) + `reservations`.
- Active-hub render: a **`def.free` branch** that renders `HubContent` directly (breadcrumb, no
  `UpgradeGate`, no `userCanSeeHub` gate — free hubs are open to all members).
- Picker filter: free hubs always shown (except volunteer mode = jobs-only); **paid hubs shown only
  when `hasHub(key) && userCanSeeHub(key)`** (locked cards hidden).
- Card chrome: free ⇒ `active=true`, **"Included"** badge, `Open →`.
- Subtitle copy: no longer "paid add-ons" only.
- "View Plan" callout condition excludes `free` hubs.
- New props: `initialItemId`, `scannedItemId`, `onScannedItemConsumed`.

### `src/App.jsx`
- Drop eager imports of `ItemsPage`/`SuppliesPage`/`ReservationsPage` (now lazy inside the hubs) and
  their `tab === '…'` render branches.
- `mobileTabs`/`desktopTabs`: remove inventory/supplies/reservations entries.
- Consolidate the per-tab **low-stock + pending-reservation badges into one aggregate badge on the
  Hubs tab** (signal preserved).
- Pass `initialItemId`/`scannedItemId`/`onScannedItemConsumed` into `HubsPage`.
- **Navigation translation** — a `navigateToTab(t)` helper maps legacy targets into hub nav:
  `inventory`/`supplies` → open Inventory Hub (+ select category); `reservations` → open
  Reservations Hub; everything else → `setTab`. Route `handleScan`, `handleSearchNav`
  (item/tab/hub kinds), and `dismissOnboarding` through it. This also fixes the notification +
  global-search links that still emit `{kind:'tab', tab:'reservations'|'supplies'}`.
- **Stale-state migration:** `tab`/`hubKey` initializers translate a pre-deploy
  `localStorage.lastTab` of `inventory`/`supplies`/`reservations` (and the `?item=` deep link) into
  Hubs + the right hub, so a returning user never lands on a now-blank tab.

## Preserved invariants
- **Volunteer-only shell** (jobs-first) unchanged — picker still hides all non-jobs hubs in
  volunteer mode, so the new free hubs stay hidden for volunteers.
- **Event Day** stays a top-level admin/manager tab (it spans jobs/reservations/maintenance).
- **People Access** stays manager+ only.
- Deep-link `?item=` + barcode scan still open item detail (now via Inventory Hub → Items).

## Testing
- `npm run build` (0 errors) + `npm run lint` (0-error baseline) before push.
- Emulator smoke: open each hub card; Items/Supplies toggle; reservation request; scan/deeplink an
  item; confirm a reservation notification link opens the Reservations Hub.
- E2E: existing specs that navigate via tabs may need selectors updated (Items/Supplies/Reservations
  now reached through Hubs) — audit `e2e/` after the UI lands.
- What's New + Help: add a plain-language note that Items/Supplies/Reservations now live under Hubs.

## Out of scope (next)
Room-calendar build (times → conflicts → month view → buffers → auto-approve → GCal one-click),
per `docs/ROOM-CALENDAR-PLAN-2026-06-23.md`.
