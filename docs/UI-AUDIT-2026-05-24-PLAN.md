# UI Audit Remediation Plan — 2026-05-24

Companion to `docs/UI-AUDIT-2026-05-24.md`. Sequences the ~212 audit findings into shippable phases. Each phase lists files touched, work items, acceptance criteria, and verification.

Two organizing principles:
1. **Trust/legal/a11y-blocker first**, polish last.
2. **Group cross-cutting patterns into single passes** instead of one-off edits — the audit found that ~5 patterns (color-only status, emoji-as-icon, missing destructive-action confirm, mobile cramming, chart a11y) account for ~60+ findings. Fixing the pattern once is cheaper than fixing each instance.

---

## Phase 1 — Trust + critical a11y (one session, ~2h)

**Goal:** ship the fixes that affect legal trust, public findability, and screen-reader access. No new patterns introduced; pure surgery.

### Items
1. **Sync Terms/Privacy modal dates** — `src/App.jsx:313, 365` → change to `April 26, 2026` to match `TermsPage.jsx:31` / `PrivacyPage.jsx:31`.
2. **Decide on Terms/Privacy modal content** — body jumps from §1–2 to §16. Either:
   - (a) Label as excerpt with "Read full Terms at /terms" link, OR
   - (b) Render the full Terms/Privacy content (extract shared component used by both modal and standalone page).
   Recommended: **(b)** — extract `<TermsBody />` and `<PrivacyBody />` shared components, use in both modal and `/terms` `/privacy` pages.
3. **Add `<SEO>` to public pages** — `src/pages/PublicJobsPage.jsx`, `src/pages/PublicRequestPage.jsx`. Mirror the pattern in `PublicSMSProgramPage.jsx:54`. Title: `"[ChurchName] — Job Board | ChurchOpsHub"` / `"Submit a Request | [ChurchName]"`. Include description, canonical, OG card.
4. **Insights chart fallback** — `src/pages/hubs/InsightsPage.jsx`. Add a small `<DataTableDisclosure data={...} />` primitive below each Recharts chart that renders an `<details>` with the underlying data as `<table>`. Apply to BarChart, PieChart, AreaChart usages.
5. **Bulk "Select all" label** — `src/pages/ItemsPage.jsx:674`. Add `aria-label="Select all visible items"`.
6. **Reservation modal autofocus** — `src/pages/ReservationsPage.jsx:331`. `autoFocus` on first required field.
7. **SMS phone input a11y** — `src/pages/SettingsPage.jsx:506`. Add `aria-invalid={!!phoneError}` and `aria-describedby="phone-error"` tied to the error text node.

### Acceptance
- [ ] Diff the modal Terms/Privacy text against `/terms` and `/privacy` — identical.
- [ ] `curl -s https://churchopshub.com/public/jobs/<churchCode> | grep -E "<title>|description"` returns church-specific text (not generic landing).
- [ ] VoiceOver on Insights page reads chart data via the disclosure.
- [ ] Tabbing into the Reservation "New" modal lands on the first required field.

### Verification
- E2E: extend `e2e/audit-ui.spec.js` with `T9-modal-dates-match` (assert both modal date strings).
- Manual: open both modals from auth screen; visually scan; sign-out to confirm.

### Out of scope this phase
Destructive-action confirms (Phase 2; needs a pattern decision first).

---

## Phase 2 — Destructive actions pattern (one session, ~3h) — **SHIPPED 2026-05-25**

**Goal:** introduce one reusable pattern for confirm-then-undo on destructive actions; apply across the app in a single pass.

**Outcome:** new `ConfirmDialog` (`useConfirm()` hook + imperative API + optional type-to-confirm gate) and `UndoToast` primitives. All 41 `window.confirm(...)` calls across 10 page files replaced. Undo wired to the four reversible verbs (PeopleAccess archive, Settings deactivate, Settings archive-space, Items retire/dispose). Type-to-confirm gates added to the three highest-blast-radius verbs (Settings remove team member, Items delete, Supplies delete). The audit-listed "delete church" and "transfer church ownership" were deferred — they're new features rather than confirm-replacements (no data model / Cloud Function exists yet). MaintenancePage "close ticket without resolution" was also deferred for the same reason. See `docs/CHANGELOG.md`.

### Pattern
New primitive `src/components/primitives/ConfirmDestructive.jsx`:
- Opens a modal with action description, names of affected entities, type-to-confirm input for non-trivial actions (delete church, transfer ownership).
- On confirm, fires action and shows a `<UndoToast />` (5s) with the inverse action when reversible.

### Sites to apply
- `PeopleAccessPage.jsx:667` — Deactivate person (with Undo)
- `PeopleAccessPage.jsx` — Delete person (type-to-confirm, no undo)
- `SettingsPage.jsx` — Remove team member (with Undo if reactivation is possible)
- `SettingsPage.jsx` — Transfer church ownership (type-to-confirm)
- `SettingsPage.jsx` — Delete church (type-to-confirm + 7-day grace, if data model supports)
- `ItemsPage.jsx` — Retire/dispose item (with Undo)
- `MaintenancePage.jsx` — Close ticket without resolution
- `JobsPage.jsx` — Cancel job after applicants signed up (notify-applicants checkbox)

### Acceptance
- [ ] Audit `grep -rn "confirm(" src/pages` — zero remaining browser-confirm calls.
- [ ] Every destructive verb in the UI routes through `ConfirmDestructive`.
- [ ] Undo restores prior state in <5s for reversible actions.

### Verification
- E2E: new `e2e/destructive-actions.spec.js` exercises Deactivate + Undo on People Access.
- Manual smoke: walk every "Delete" / "Remove" / "Cancel" button in the app.

---

## Phase 3 — App shell + responsive (one session, ~3h) — **SHIPPED 2026-05-25**

**Outcome:** all 8 items shipped. `BREAKPOINTS` + `useBreakpoint()` primitives live in
`tokens.js` / `useMobile.js`; the app tab bar gets scroll-snap + edge-fade; the
account menu now focus-traps with Escape-to-close + focus restore; Dashboard goes
2-col → 3-col on tablet → 5-col on desktop via `useBreakpoint()`; Settings splits
Profile/Notifications/Compliance into 3 cards; new `Modal.Footer` slot is wired
into item-detail + ticket-detail; team-member row collapses to a `⋮` popover on
mobile; reservation filter pills hit 44px touch target. See `docs/CHANGELOG.md`
(2026-05-25). Sticky `Modal.Footer` is now available for the broader set of
modals that have a Save/Cancel row — apply opportunistically in future sessions.

**Goal:** fix mobile/tablet cramming once. Introduce a tablet breakpoint to the brand tokens.

### Items
1. **Tablet breakpoint** — `src/components/brand/tokens.js` add `BREAKPOINTS = { mobile: 480, tablet: 768, desktop: 1024 }` and a `useBreakpoint()` hook. Replace ad-hoc `isMobile` booleans where a 3-state distinction helps.
2. **App tab bar overflow** — `src/App.jsx:665–670`. `overflow-x: auto` with scroll-snap, or collapse low-priority tabs into "More ▾" at <1100px.
3. **Account menu focus trap** — `src/App.jsx:644`. Wrap dropdown in focus-trap; restore focus to trigger on close. (Consider promoting to `<Menu />` primitive — see Phase 5.)
4. **Dashboard stat grid** — `src/pages/Dashboard.jsx:56`. Three-column tablet variant.
5. **Settings card sectioning** — `src/pages/SettingsPage.jsx:417–545`. Split Profile / Notifications / Compliance into separate cards with subheads.
6. **Sticky modal action row** — extend `src/components/primitives/Modal.jsx` with a `<Modal.Footer>` slot that auto-sticks to the bottom. Migrate item-detail and ticket-detail modals first.
7. **Settings team-member row actions** — `SettingsPage.jsx:785–796`. Collapse to a `⋮` menu on mobile.
8. **Reservation filter pills** — `ReservationsPage.jsx:276`. Bump padding to meet 44px touch target.

### Acceptance
- [ ] Resize browser from 320 → 1920 with no horizontal scroll (except intentional tables).
- [ ] Lighthouse mobile run on `/`, `/dashboard`, `/items`, `/settings` — no tap-target failures.
- [ ] Keyboard-only walkthrough of opening + closing the account menu works without losing focus.

### Verification
- Playwright with `devices['iPhone 13']` and `devices['iPad Pro 11']` viewports across the key pages.

---

## Phase 4 — Cross-cutting a11y patterns (one session, ~2h) — **SHIPPED 2026-05-25**

**Outcome:** both primitives shipped (`StatusDot` + `EmojiIcon`). Pattern A
applied to the 5 sites the plan called out (SuppliesPage StockBar gained
`role="progressbar"` semantics; CoordinationPage dot, PeopleAccessPage
severity, JobsPage badge, ReservationsPage badge all wrapped). Pattern B
applied across the 10 highest-traffic pages plus the shared `Stat`
primitive (so every Stat instance is silently iconed in one stroke).
Maintenance/Tasks/Accountability/Insights hub pages still have ~60
unwrapped emojis — the primitive is in place and the sweep is rolled into
Phase 7's polish pass. `@axe-core/playwright` installed and
`e2e/authenticated/a11y.spec.js` enforces the rules across /, /inventory,
/supplies, People Access, and Job Hub. See `docs/CHANGELOG.md`
(2026-05-25).

**Goal:** fix color-only-status and emoji-as-icon globally with two small primitives.

### Pattern A — color-only status
New primitive `src/components/primitives/StatusDot.jsx`:
- Renders the colored dot + a visually-hidden text label, OR (configurable) the dot + a visible mini-label.
- Default `role="img"` with the label as `aria-label`.

Apply at:
- `SuppliesPage.jsx:237` StockBar
- `ReservationsPage.jsx` overdue
- `PeopleAccessPage.jsx` expiry severity dots
- `JobsPage.jsx` status badges
- `CoordinationPage.jsx` enabled/disabled dot

### Pattern B — emoji as icon
New primitive `src/components/primitives/EmojiIcon.jsx`:
- Decorative mode (`<EmojiIcon emoji="📦" decorative />`) emits `aria-hidden="true"`.
- Semantic mode (`<EmojiIcon emoji="📦" label="Inventory" />`) emits `role="img"` + `aria-label`.

Apply via codemod-style grep: every standalone emoji in JSX gets wrapped.

### Acceptance
- [ ] axe-core scan on each major page — zero `image-alt` or `color-contrast` failures attributable to status.
- [ ] VoiceOver pass on Supplies, People Access, Jobs — every status announces text, never just colour.

### Verification
- New `e2e/a11y.spec.js` using `@axe-core/playwright` against `/`, `/items`, `/supplies`, `/people-access`, `/jobs`.

---

## Phase 5 — Hub-specific high-impact UX (1–2 sessions, ~4h)

**Goal:** clear the High-severity hub items that don't fit a pattern.

### Items
- **`TasksPage.jsx:1667`** — Subtask hierarchy: 12px left margin per level + "Parent: TSK-###" reference line.
- **`TasksPage.jsx:1142`** — Persist overdue badge until server confirms via `isDirtyRef` (already in the file — wire it).
- **`MaintenancePage.jsx:689`** — Replace drag handle on touch with ↑/↓ buttons; detect via `matchMedia('(hover: none)')`.
- **`MaintenancePage.jsx:956`** — Wrap vendor phone in `<a href="tel:…">`, email in `<a href="mailto:…">`.
- **`CoordinationPage.jsx:285`** — Real-time availability subscription inside bundle-checkout modal; banner + disabled CTA on change.
- **`JobsPage.jsx:1847`** — "Withdraw Request" secondary button for the swap initiator on pending state.
- **`AccountabilityPage.jsx:412`** — Success modal after Complete Audit ("✅ Audit saved" + 3 next-actions).
- **`AccountabilityPage.jsx:348`** — Render zero-activity items in timeline as "Unknown Location" rows.
- **`HubsPage.jsx:166`** — Filter People Access hub at `HUB_DEFS.filter()` for `role === 'user'`.

### Acceptance
- [ ] Manual playthrough of each hub: Tasks board → list → calendar with overdue task stays badged; bundle checkout in two tabs reflects availability changes; swap-withdraw flow works end-to-end.

### Verification
- Extend hub-specific Playwright specs where they exist; add `tasks-subtasks.spec.js`, `coordination-bundle-availability.spec.js`.

---

## Phase 6 — Upgrade-gate preview (one session, ~3h)

**Goal:** turn the upgrade wall into a "see what you get" preview.

### Approach
- Extend `src/components/primitives/UpgradeGate.jsx` to accept a `preview` slot.
- For each of the 7 paid hubs, render a partial, blurred-edge screenshot of the actual hub UI with fake/sample data, overlaid with a "$X/mo — Unlock" CTA.
- Implementation options:
  - (a) Static screenshots committed to `public/upgrade-previews/` (cheap, can rot)
  - (b) Render the real hub component with `previewMode={true}` that swaps Firestore reads for static fixtures (lives in code, never rots, more work)
  - Recommended: **(a)** for v1, plan **(b)** later if needed.

### Acceptance
- [ ] Visiting each paid hub as a non-subscriber shows a preview, not a wall.
- [ ] CTA tracks click-through (PostHog event `upgrade_gate_click` with hub name).

---

## Phase 7 — Polish backlog (deferred, single-pass when convenient)

Single-PR cleanup pass for Medium/Low/Nit items grouped by file:

- `LandingPage.jsx` — show pricing math; smooth fontSize jumps; underline TOS/Privacy in checkbox.
- `BlogIndex.jsx` / `BlogPost.jsx` — unify "Back to Blog" pattern; touch-friendly card affordance.
- `ActivityLogPage.jsx` — clear-X on search; consistent chevron behavior; timezone in tooltip.
- `ItemsPage.jsx` — search placeholder copy; toast countdown.
- `SuppliesPage.jsx` — hover affordance on cards; max-width on grid.
- `Modal.jsx` — `title="Close"` on X.
- `InsightsPage.jsx` — sortable header chevrons; chart axis label rotation.
- `JobsPage.jsx` — pay frequency unit; mobile calendar group collapse.
- `TasksPage.jsx` — copy-to-clipboard on TSK-###; recurrence preview.
- Emoji aria pass (uses Phase 4 primitive).

---

## Sequencing summary

| Phase | Effort | When | Blocking? |
|------|--------|------|-----------|
| 1 — Trust + critical a11y | ~2h | Now | No |
| 2 — Destructive actions pattern | ~3h | This week | Phase 1 |
| 3 — App shell + responsive | ~3h | This week | No |
| 4 — A11y patterns (status + emoji) | ~2h | Next week | No |
| 5 — Hub-specific UX | ~4h | Next week | No |
| 6 — Upgrade-gate preview | ~3h | Next week | No |
| 7 — Polish backlog | rolling | As convenient | Phase 4 (for emoji) |

**Total estimated:** ~17h over ~6 work sessions.

## Definition of done
- All Phase 1–5 acceptance checks pass.
- `e2e/audit-ui.spec.js`, new `destructive-actions.spec.js`, `a11y.spec.js` green.
- Audit doc updated with closed-item markers `~~struck-through~~` per fix.
- Session entry in `docs/CHANGELOG.md`.
