# Foundation 4 — Attention Engine — Implementation Plan (2026-06-18)

**Spec:** `docs/PLATFORM-FOUNDATIONS-2026-06-06.md` §Foundation 4 + §Cross-environment code sharing + §Build order (item 4).
**Goal:** replace the three ad-hoc "what needs attention" computations with one canonical `AttentionItem` contract + pure per-domain collectors + a single shared thresholds config, so the dashboard, the AI digest, and the emailed digests can't drift.

F4 is the highest-fan-in foundation (6 hard-dependency consumers in the matrix). Its prerequisites are in place (F2 resolver shipped 2026-06-17; F3 Tier A shipped). It's a **consolidation of proven code**, not greenfield, and is fully decoupled from the Phase-2 legacy-strip soak (scheduled 2026-06-24).

---

## What exists today (the code F4 consolidates)

Attention is computed in three unrelated places, each with its own copy of the "overdue/expiring/low?" predicates:

1. **`src/pages/Dashboard.jsx`** (client, ~lines 48–50) — overdue items, low stock, pending reservations; computed inline from already-subscribed data, rendered as colored cards.
2. **`gatherAttentionSignals`** (`functions/index.js:2301`, server) — overdue work (tasks+maintenance), expiring compliance, low stock + warranty, unfilled shifts, contractor budget. Feeds `getAttentionDigest` (AI, onCall) + `sendWeeklyAttentionDigest` (weekly email).
3. **`src/components/AttentionPanel.jsx`** — renders #2's cached output only.

Drift surface today: `in7`/`in30` windows hard-coded in the CF; `quantity <= minQuantity` duplicated in Dashboard and the CF; cert windows in the CF unrelated to F2's `EXPIRY_*` constants.

---

## The contract

```
AttentionItem = {
  id, kind,        // 'work_overdue' | 'cert_expiring' | 'low_stock'
                   // | 'warranty_expiring' | 'shift_unfilled'
                   // | 'reservation_pending' | 'contractor_outstanding'
  severity,        // 'critical' | 'warning' | 'info'
  title, link,
  dueDate?, count?, subjectRef?,   // subjectRef = F2 PersonRef / itemId / workItemId
}
```

- Each domain contributes a **pure collector** `collectX(ctx) → AttentionItem[]`.
- One aggregator `computeAttention(ctx, opts) → AttentionItem[]` runs all hub-gated collectors.
- `ctx` = already-subscribed collections (client) or freshly-`.get()`'d snapshots (server) — collectors operate on plain arrays, they do not fetch (mirrors the F2 resolver contract).

## Cross-environment decision (the load-bearing call)

`src/` is ESM (Vite); `functions/` is CommonJS. The F2 precedent chose **duplicate logic + parity test** (`src/lib/people.js` ESM; server keeps its own `isAccessEligible`, pinned by `functions/test/people-resolver.test.mjs`) rather than a truly shared module.

**Decision — hybrid (honors the doc's intent + the F2 precedent):**
- **Thresholds + enums live in ONE shared `.json`** — JSON imports cleanly in both Vite and Node, so there is genuinely one copy of the numbers (the doc's non-negotiable). Cert windows **reuse F2's `EXPIRY_CRITICAL_DAYS=7` / `EXPIRY_WARNING_DAYS=30`** rather than inventing a third set.
- **Collector logic is two thin impls** (ESM `src/lib/attention.js` + CJS `functions/lib/attention.cjs`), refactored out of the existing code, **pinned by a parity test sharing fixtures** — the proven F2 pattern, explicitly blessed by the doc ("the two behavior impls must share test fixtures").

Rejected: a single truly-shared collector module — fighting the ESM/CJS boundary is friction for no benefit when the parity test already guarantees no-drift.

## File layout

```
src/lib/attention.js              ← AttentionItem shape, computeAttention + client collectors (ESM, pure)
src/lib/attention-thresholds.json ← shared thresholds + kind/severity enums (the one copy)
functions/lib/attention.cjs       ← server collectors (CJS), reads the same .json
functions/test/attention.test.mjs ← unit + parity suite (shared fixtures, pins client ≡ server)
```

## Collector mapping (existing → canonical)

| Collector | kind(s) | Source today | Notes |
|---|---|---|---|
| `collectWork` | `work_overdue` | task/maintenance dueDate logic | reads `workItems` split by type — already flag-aware |
| `collectCompliance` | `cert_expiring` | accessRecords `in7`/`in30` | **routes through F2 `complianceStatusForTracked`** → F2's 2nd real consumer |
| `collectInventory` | `low_stock`, `warranty_expiring` | supplies / items | keep exact `quantity<=minQuantity` predicate (no behavior change) |
| `collectShifts` | `shift_unfilled` | jobListings | hub-gated (jobs) |
| `collectContractor` | `contractor_outstanding` | timeEntries | outstanding payment + upcoming; hub-gated (people_access) |
| `collectReservations` | `reservation_pending` | reservations (client-only today) | folds the Dashboard pending-res card in |

Severity mapping preserves today's distinctions: overdue/expired → `critical`; due-soon/expiring-soon → `warning`; informational → `info`.

## Migration order (dashboard-first, per build-order spec item 4)

- **Phase A** — contract + thresholds JSON + client collectors in `src/lib/attention.js`; unit tests. No UI change.
- **Phase B** — refactor `Dashboard.jsx` cards to render from `computeAttention()`. **Strict visual/behavior parity** (same items, colors, predicates) — live admin surface, gets its own verify pass.
- **Phase C** — refactor server `gatherAttentionSignals` into `functions/lib/attention.cjs` collectors reading the same JSON; add the parity test. AI digest + weekly email consume canonical collectors. Deploy CFs; re-probe invoker IAM on `getAttentionDigest` (onCall).
- **Phase D** — docs: CHANGELOG, flip backlog F4 → shipped, `whatsNew.js` only if user-visible (it shouldn't be — parity is the point).

## Out of scope for F4

- **Notification-center wiring** — F4 produces AttentionItems; the `notify()` hook lands when the notification-center UI exists (F3 is only Tier A today). Leave the seam, don't build the consumer.
- **New signals** (outstanding keys, etc. from the spec's kind list) — add collectors when a real surface needs them.
- **F5 / Phase 3** — separate tracks.

## Status

- [x] **Phase A** — client collectors + thresholds JSON + unit tests (2026-06-18). `src/lib/attention.js` (8 collectors + `computeAttention` + `summarizeAttention`), `src/lib/attention-thresholds.json` (shared numbers; cert windows reuse F2's `EXPIRY_*`), `functions/test/attention.test.mjs` (13 tests). JSON-import-with-attributes verified in both Node 22 (`test:unit` 27/27) and Vite (`build` clean). Added `item_overdue` kind (the Dashboard's overdue-checkout card, which the spec's kind list had missed). Canonical `low_stock` predicate requires `minQuantity != null` (normalizes a Dashboard micro-edge).
- [ ] Phase B — Dashboard refactor (visual parity)
- [ ] Phase C — server collectors + parity test + deploy
- [ ] Phase D — docs
