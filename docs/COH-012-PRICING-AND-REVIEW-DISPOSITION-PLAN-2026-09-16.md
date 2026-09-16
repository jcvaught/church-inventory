# COH-012 — Flat pricing, entitlement collapse, and disposition of the 2026-08-28 review remainder

- Date: 2026-09-16
- Owner: Product owner (John)
- Implementation: Claude (DEC-2026-011)
- Reviewer: Codex (plan review before implementation)
- Status: **PLAN — rev 3, not started.** Two Codex rounds, both **REWORK**:
  rev 1 (`97de92a`) drew five blockers and three gaps; rev 2 (`8da9992`) drew
  three more blockers and two gaps. Every finding was verified against the code
  before being accepted, and every one was correct. See "Review history" — the
  pattern in them mattered more than any single finding.
- Base commit: `f429b86` (2026-09-10), working tree clean
- Related: Codex application review 2026-08-28; DEC-2026-019; DEC-2026-020;
  `docs/backlog.md` "Priority order"

---

## Summary

One plan, five parts, one hard date.

**Part A** replaces the trial/free-hub entitlement model with a flat one: 90 days
of everything, then **$5/month for everything**, no per-hub tier. This deletes
the auto-selection cron, `freeHubsSelected`, `trialHubs`, the per-hub `hasHub`
logic in **all four** places it is implemented, and the dead `$5/$7` artifacts.
It requires amending a guardrail in DEC-2026-020, the invariants list in
`AGENTS.md`, and the canonical `docs/BUSINESS_MODEL.md`.

**Part B** fixes a live, FXCC-facing defect found while measuring Part A: a
string-vs-Timestamp query type mismatch that is silently hiding 19% of FXCC's
activity from the weekly insights digest, trending to 100% by late November.

**Part C** narrows the review's audit-log-atomicity item to five action classes
and wires the Sentry alert that makes its failures visible.

**Part D** converts the `role="button"` divs on the two surfaces volunteers
actually touch.

**Part E** records the disposition of everything else left from the 2026-08-28
review: two closures, three re-filings, one rewritten backlog item.

**The date:** `processTrialExpirations` sends Highland Presbyterian a *"Your
ChurchOpsHub trial ends in 7 days"* email on or about **2026-09-22**, and
processes their expiry on **2026-09-30 02:00 America/Chicago**. That email's copy
promises a feature Part A deletes. Part A phase 1 must land before 09-22, or the
cron must be paused.

---

## Measured evidence (2026-09-16)

All figures below are from read-only Firestore REST queries against
`church-inventory-9615c`, run 2026-09-16. They are stated so the reviewer can
re-run them rather than accept them.

### Tenant census

| Church | plan / status | grandfathered | trialEndsAt | activityLog | items | workItems | reservations | jobListings |
|---|---|---|---|---|---|---|---|---|
| Fairfax (FXCC) | `all_in` / active | **true** | — | 1007 | 8 | 135 | 0 | 50 |
| Highland Presbyterian | `free` / **trialing** | false | **2026-09-29** | 0 | 0 | 0 | 0 | 0 |
| New Life Baptist | `free` / **trialing** | false | 2026-10-11 | 0 | 0 | 0 | 0 | 0 |
| Compassion Church Ministries | `free` / **trialing** | false | 2026-12-11 | 0 | 0 | 0 | 0 | 0 |
| St Olaf Catholic | `free` / active | false | expired 2026-07-22 | 0 | 0 | 0 | 0 | 0 |
| TrueNorth | `free` / active | false | expired 2026-08-12 | 101 | 0 | 0 | 0 | 0 |
| e2e-test-church | `all_in` / active | true | — | — | — | — | — | — |

`stripeCustomerId` and `stripeSubscriptionId` are **null on all five non-FXCC
tenants**. No Stripe customer has ever been created. Compassion signed up
2026-09-12.

### Finding 1 — the usage ranking has never ranked anything

`processTrialExpirations` (`functions/index.js:1634-1751`) counts activity per
hub and takes the top two, breaking ties **alphabetically** (`:1681-1684`).

Both churches it has processed received the identical result,
`['accountability', 'coordination']` — which is exactly the first two entries of
`TRIAL_HUBS` in alphabetical order, i.e. the all-zero tie-break.

- St Olaf: 0 activity entries. All counts zero. Alphabetical fallback.
- TrueNorth: 101 entries, **all of them supply actions** (`edit_supply` 43,
  `use_supply` 33, `add_supply` 16, `restock` 8, `delete_supply` 1). Supplies is
  a free hub and is not in `TRIAL_HUBS`, so none of it maps to `HUB_ACTIONS`
  (`:1674-1679`). All counts zero. Alphabetical fallback.

The trial-expiry email tells the admin *"we'll automatically keep your two
most-used hubs active for free"* (`functions/index.js:1788-1795`). In both real
firings it delivered the alphabetically-first two instead. **The claim in that
email has never been true.**

### Finding 2 — a live string-vs-Timestamp query defect (new; not in the backlog)

`logActivity` switched from an ISO string to `serverTimestamp()` in commit
`812f15e` (2026-08-29) — `src/useFirestore.js:663-679`. Firestore sorts
Timestamp before String in its canonical type order, so an inequality filter
written against a *string* matches only string-typed values and silently
excludes every Timestamp-typed one.

Measured on FXCC's `activityLog` (1007 documents total):

```
timestamp >= "2020-01-01T00:00:00.000Z"   (stringValue)     →  967 docs
timestamp >= 2020-01-01T00:00:00Z         (timestampValue)  →   40 docs
                                                      total = 1007, disjoint
```

Two server call sites pass a string:

1. `functions/index.js:1662` — `processTrialExpirations`, filtering by
   `sub.trialStartedAt` (an ISO string; confirmed on Highland's doc). **Deleted
   by Part A.**
2. `functions/index.js:2308` — **`sendWeeklyInsightsDigest`**, filtering by
   `since90 = ymdAddDays(todayStr, -90)`, a `YYYY-MM-DD` string. This is a live
   weekly email. FXCC is grandfathered, so `subHasHub(sub, 'insights')`
   (`:2297`) is true and FXCC receives it.

Measured blind spot for FXCC's current 90-day window (since 2026-06-18):

```
string lane     (what the digest sees)      →  173 docs
timestamp lane  (invisible to the digest)   →   40 docs
```

**FXCC's weekly insights digest is currently computing over 173 of 213
entries — 81%.** The string-era rows age out of the trailing window
continuously; on or about **2026-11-27** the window becomes entirely
post-migration and the digest will report zero activity while appearing to
succeed.

The client already solved this. `loadActivityLogSince`
(`src/useFirestore.js:1648-1670`) queries **both type lanes** and merges them,
with a comment naming the compatibility period. The server was never updated to
match.

### Finding 3 — entitlement logic has already drifted

The rule is implemented three times: `src/hooks/useSubscription.js:29-40`,
`functions/index.js:1212-1223`, `firestore.rules:214-221`. The rules copy accepts
`s.plan == 'all_in'` but **not** `s.plan == 'pro'`, while the live $15 plan
writes `plan: 'pro'` (`functions/index.js:462-463`).

**This is latent, not live.** The same webhook also writes `hubs: PRO_HUBS` and
`freeHubsSelected: PRO_HUBS` (`:933-940`), and `PRO_HUBS` includes `'jobs'`, so
the rules' later branches catch a real purchase. It would bite only a
subscription document carrying `plan` without `hubs` — a manual console grant, or
a refactor. Part A dissolves it by deletion rather than by patching it.

### Finding 4 — the dead pricing artifacts are genuinely dead

`price:` on the hub objects (`src/pages/HubsPage.jsx:57,78,86,94,102,110,118`)
and `UPGRADE_PRICES` (`:146-147`) are read in exactly one place —
`hubPrice={UPGRADE_PRICES[hubKey]}` at `:295`. `UpgradeGate.jsx` never
destructures `hubPrice`; it hardcodes `$15/month` at `:63`. Nothing renders
them today. Part A removes them along with the model they describe.

---

## Part A — flat pricing and entitlement collapse

### A.0 The decision to record (DEC-2026-021)

**New model.** Every new church gets 90 days of every feature. After 90 days the
church is **$5/month (or $50/year) for every feature**. There is no free tier and
no per-hub purchase.

**Two binding statements must be amended first, and both are the owner's to
amend — not this plan's.** Implementation may not begin until they are:

1. **`AGENTS.md:25-26`** — *"Inventory and supplies are permanently included in
   the free product. The current paid offering is one ChurchOpsHub plan:
   $15/month or $150/year."* This sits in the repo's binding-invariants list,
   which every agent reads before working. It must be rewritten in the **same
   commit** as the first behavior change (`feedback_doc_with_behavior_change`),
   not after.
2. **DEC-2026-020's guardrail** — *"Inventory / Supplies must remain free."*
   DEC-2026-021 supersedes that clause explicitly, with the reasoning below. The
   rest of DEC-2026-020 stands unchanged.

Rev 1 named only the second. A decision document cannot quietly outrank the
invariants file; the owner changes the invariant, or the plan does not proceed.

**Why the free tier is not worth keeping.** It exists as an acquisition wedge.
Measured: five non-FXCC signups, four with zero documents of any kind, one
(TrueNorth) that used supplies and stopped. Zero Stripe customers ever created.
The wedge has never converted anyone because no tenant has ever activated. It is
not earning the gating complexity it costs.

**Why the price change is not expected to do anything.** There is no evidence
$15 was ever an obstacle — no checkout session has ever been started. $5 is
chosen as a statement of what the product is (an internal tool others may share
the cost of), not as a conversion lever. The plan must not claim otherwise, and
must not be justified by projected conversion.

**Honest cost of the change.** TrueNorth's only activity was on supplies, which
is free today and would be paid tomorrow. Their data is zero, so the practical
impact is nil, but the shape of the trade should be recorded rather than
glossed.

### A.1 Open question the owner must answer before implementation

**What happens at day 91 to a church that does not pay?**

**Rev 1 got the cost of this wrong and the correction changes the
recommendation.** Rev 1 claimed read-only-after-lapse was a localized change to
`jobsHubActive()` and therefore *simpler* than the per-hub gating it replaces.
It is not. Writes to items, supplies and reservations authorize on membership
alone (`firestore.rules:336-368`), as do most collections; read-only would mean
editing **every write predicate in the file** and adding a subscription `get()`
to each — a billed document read per write evaluation, against the 10-`get()`
ceiling per single-document request. That is a larger and riskier change than
the thing it replaces, and the simplification argument for it collapses.

The correction also exposes a category error in rev 1. **Entitlement is not a
security boundary.** The `churchId` tenant boundary is, and so is per-user
authority inside a tenant — those are what `AGENTS.md:21-24` protects and what
COH-002/006/011 hardened. A lapsed customer writing to *their own church's*
records is a billing problem, not a breach. Rev 1 treated the two as the same
kind of thing and proposed rules-layer machinery accordingly.

Options, restated honestly:

- **(i) Lapse enforced in the client and callables; rules unchanged**
  *(recommended)*. A lapsed church sees a paywall and its callables refuse;
  a determined member could still write through the raw SDK, and that is
  accepted and recorded. Cheapest, no rules risk, no per-write read cost.
  **The existing rules-layer Jobs gate (`firestore.rules:214-221`) stays** —
  it is written, tested, and removing it would be a weakening; it is simply not
  extended to anything else.
- (ii) Read-only enforced in rules — every write predicate, plus a `get()` per
  write. Defensible only if the owner wants billing enforced against the SDK,
  which no evidence suggests is needed at 0 payers.
- (iii) Full lockout — worst to receive, and raises a data-retention question
  the app cannot currently answer.
- (iv) Keep inventory free — preserves the wedge, retains per-hub gating,
  forfeits most of Part A.

The rest of Part A assumes **(i)**. Under (i), A.4's rules work reduces to
leaving `firestore.rules` almost entirely alone, which is also the lowest-risk
outcome available.

### A.2 Treatment of the five existing tenants

- **FXCC** — `grandfathered: true` short-circuits every branch. Unaffected. No
  migration write.
- **Highland, New Life, Compassion** — keep their existing `trialEndsAt`
  unchanged. They were promised 90 days of everything and still receive exactly
  that. Only what happens *after* changes, and they are told before it does.
- **St Olaf, TrueNorth** — currently hold two free hubs by auto-selection.
  Rev 1 promised them a grace window to 2026-10-31 without saying what state
  represented it. There is none: `processTrialExpirations` writes
  `status: 'active'` at expiry (`functions/index.js:1700`), so a lapsed church
  is indistinguishable from a paying one by status alone, and the new
  `grandfathered || trialing || paid` predicate would drop them the moment it
  ships.

  **Implement the grace by reusing `trialing`, not by inventing a state.** Set
  `status: 'trialing'` and `trialEndsAt: 2026-10-31T23:59:59Z` on both
  documents. No new field, no new predicate, no new branch to test — it rides
  the path every trialing church already exercises, and it expires on its own.
  This is a **production data write on two tenant documents** and is therefore
  the owner's to approve as a separate, explicit step (DEC-2026-014).
  Both have zero inventory/work/reservation data; TrueNorth has 101 supply
  actions and no supplies.
- **e2e-test-church** — grandfathered; fixtures must be checked for any
  assumption about `freeHubsSelected` or `trialHubs`.

### A.3 Phase 1 — stop the false promise (MUST land before 2026-09-22)

This phase is deliberately separable and reversible, so it can ship on its own if
the rest slips.

1. Rewrite the 7-day warning email and the trial-expiry email
   (`functions/index.js:1707-1800`) to describe the new model. Remove every
   "two most-used hubs" claim.
2. Delete the usage ranking and `freeHubsSelected` selection
   (`functions/index.js:1655-1700`); the cron's remaining job is to flip
   `status` at expiry and send mail.
3. Deploy functions only. No rules, no client, no Stripe changes.

**Fallback if phase 1 cannot land by 09-22:** disable the
`processTrialExpirations` schedule. No church loses anything (Highland has zero
data); no stranger receives a false claim.

### A.4 Phase 2 — collapse the entitlement model

1. **Stripe.** Add `$5/mo` and `$50/yr` price IDs. Retain `pro_monthly` /
   `pro_annual` in `PRICE_IDS` for webhook resolution exactly as the legacy
   per-hub IDs already are (`functions/index.js:444-458`) — do not delete them;
   an in-flight webhook must still resolve.
2. **Change every checkout caller in the same commit — there are two, and the
   one rev 2 fixed is the lesser.**
   - `src/components/primitives/UpgradeGate.jsx:27` — `item: 'pro_monthly'`.
   - **`src/pages/SettingsPage.jsx:1595,1606`** — `handleCheckout('pro_monthly')`
     and `handleCheckout('pro_annual')`, the *primary* subscription surface,
     with **`$15` and `$150` hardcoded in the markup** at `:1592` and `:1603`
     and a "2 MONTHS FREE" badge whose arithmetic changes at $5/$50.

   Retaining the legacy keys for webhook resolution while leaving either caller
   unchanged means **checkout keeps charging the old prices**. Rev 1 missed both;
   rev 2 fixed one and asserted a grep gate that would have found the other.

3. **Free-hub flags must be resolved, not inherited.** `HubsPage.jsx:43,51`
   mark Inventory and Reservations `free: true`, and free hubs bypass
   `UpgradeGate` entirely (`:248`). Under "$5 for every feature" that flag is
   either deleted — making them paid like everything else — or it is retained
   and the model is not what A.0 says it is. **This is an owner decision, not an
   implementation detail**, and it interacts directly with A.1: if Inventory
   stays free, a lapsed church keeps a working product and the paywall premise
   weakens further. Recommended: delete the flag, since a free wedge that has
   never converted anyone (see A.0) is exactly what this plan is retiring.
4. **Subscription shape.** `hasHub` becomes `grandfathered || trialing || paid`
   in **all four** implementations. Rev 1 listed three and missed the fourth:
   - `src/hooks/useSubscription.js:29-40`
   - `functions/index.js:1212-1223`
   - `firestore.rules:214-221` (Jobs only — see A.1(i), it stays)
   - **`src/pages/SettingsPage.jsx`** — four distinct consumers, not one.
     Rev 2 named the first and round 2 found the rest:
     - `:174-177,386-388` — `churchHubs`, `maxUsers`, `allHubsUnlocked`,
       `hasJobsHub`, `hasInsightsHub`, gating the Jobs, Insights and People
       panels. Carries its own copy of the `plan === 'pro'` test (Finding 3).
     - `:495` — `isTrialing` derived from `freeHubsSelected === null`. Delete
       the field and **every church silently reads as not trialing**, which is
       the most damaging single line in this list.
     - `:498` — `activeHubs` renders `trialHubs` / `hubs[]` as user-visible text.
     - `:946` — *"After the trial, your two most-used hubs stay free"* — the
       same false claim as the expiry email, in the UI.
   `trialHubs`, `freeHubsSelected`, and `hubs[]` stop being read. Leave the
   fields on existing documents; do not migrate data that nothing reads.
5. **Church creation.** `src/useAuth.js:267-277` writes the initial subscription
   document with `hubs: []`, `trialHubs: TRIAL_HUBS`, `freeHubsSelected: null`.
   Update it to the new shape. A new church created after cutover must not be
   born carrying fields the model no longer has.
6. **Trial banner.** `src/App.jsx:839` renders trial state from these fields;
   update with the rest.
7. **Rules.** Under A.1(i), `firestore.rules` is left alone apart from whatever
   `jobsHubActive()` needs to keep working against the new document shape —
   including adding the missing `plan == 'pro'` branch (Finding 3) rather than
   deleting the function. Rev 1 proposed dissolving it; A.1(i) keeps it.
8. **Client copy.** Delete `UPGRADE_PRICES`, the seven `price:` fields, and the
   dangling `hubPrice` prop (`HubsPage.jsx:57-147,295`). Update the hardcoded
   figure in `UpgradeGate.jsx:63`.
9. **Per-user `allowedHubs` is untouched.** It is an admin permission, not an
   entitlement (`AGENTS.md:29`), and it stays.

### A.4.0 Consolidate first, then change behavior (rev 3)

**Rev 1 listed three entitlement consumers. Round 1 found a fourth. Rev 2 named
four. Round 2 found four more sites inside that same fourth file.** The plan's
method was the defect: hand-enumerating consumers in prose and hoping the list
was complete. Rev 3 stops doing that.

**Step 1 — take the inventory mechanically, not from memory.** Generated
2026-09-16, file-level counts:

| Symbol | Files |
|---|---|
| `freeHubsSelected` | `functions/index.js` (14), `useSubscription.js` (5), `BUSINESS_MODEL.md` (4), `firestore.rules` (3), `useAuth.js`, `SettingsPage.jsx`, `App.jsx`, `scripts/setup-e2e-tenant.mjs`, `scripts/seed-emulator.mjs` |
| `trialHubs` | `useSubscription.js` (2), `useAuth.js`, `SettingsPage.jsx`, `functions/index.js`, `firestore.rules`, `BUSINESS_MODEL.md`, `scripts/setup-e2e-tenant.mjs` |
| `trialEndsAt` | `functions/index.js` (9), `useSubscription.js` (4), `useAuth.js` (2), `SettingsPage.jsx` (2), `scripts/setup-e2e-tenant.mjs` (2), `App.jsx`, `BUSINESS_MODEL.md` |
| `grandfathered` | `SettingsPage.jsx` (5), `useSubscription.js` (3), `scripts/setup-e2e-tenant.mjs` (3), `scripts/export-tenant-to-emulator.cjs` (3), `BUSINESS_MODEL.md` (3), `useAuth.js` (2), `scripts/seed-emulator.mjs` (2), `HubsPage.jsx`, `functions/index.js`, `firestore.rules`, `e2e/authenticated/work-merge.spec.js` |
| `pro_monthly` / `pro_annual` | `functions/index.js` (4), `BUSINESS_MODEL.md` (3), **`SettingsPage.jsx` (2)**, `UpgradeGate.jsx` |
| `TRIAL_HUBS` / `PRO_HUBS` | `functions/index.js` (6), `useAuth.js` (2) |
| `hasHub` / `subHasHub` | `functions/index.js` (20), `src/lib/attention.js` (10), `HubsPage.jsx` (9), `EventDayPage.jsx` (6), `App.jsx` (4), `useSubscription.js` (2), `UpgradeGate.jsx` (2), `Dashboard.jsx`, `firestore.rules`, `scripts/setup-e2e-tenant.mjs` |

Fourteen files, plus three scripts and an e2e spec. That is the real surface,
and no prose list was ever going to hold it.

**Step 2 — collapse four implementations into one before changing any
behavior.** Extract a pure `src/lib/entitlement.js` — `hasHub`, `isTrialing`,
`canAddUser`, `planLabel` — with a CJS twin at `functions/lib/entitlement.js`
and a **parity test**, exactly as `attention.js`, `occurrences.js` and
`people.js` already do (DEC-2026-019 §3: a behavior-preserving commit placed
*before* the feature commit). Repoint `useSubscription.js`, `SettingsPage.jsx`,
and `functions/index.js:subHasHub` at it. `firestore.rules` necessarily keeps
its own copy; the parity test pins it.

Only after that lands does the model change — in one module instead of four
files, which is what makes the rest of A.4 verifiable rather than hopeful.

**Step 3 — the grep gate runs as a check, not as the discovery method.** Each
symbol above must return only sites this plan names. Rev 2 claimed this gate and
still failed it, because the gate was written after the list instead of before.

### A.5 Phase 3 — public copy

Rev 1 said "eleven claim sites" and counted only marketing copy. The real set
also includes in-product copy and the canonical business-model document:

- `src/pages/LandingPage.jsx` (2), `src/pages/HelpPage.jsx` (3),
  `src/data/blogPosts.js` (5), `src/data/whatsNew.js` (1)
- **`src/pages/SettingsPage.jsx:1592,1603`** — `$15` / `$150` hardcoded in the
  checkout markup, plus the "2 MONTHS FREE" badge whose arithmetic changes
- **`src/pages/SettingsPage.jsx:1613`** — *"Inventory, supplies & reservations
  stay free. Cancel anytime."*
- **`src/pages/SettingsPage.jsx:946`** — the two-most-used-hubs claim
- **`src/pages/HubsPage.jsx:405`** — current-product pricing copy
- **`docs/BUSINESS_MODEL.md:12-18`** — the canonical pricing table, *"Inventory
  is **never** paid. It's the permanent free wedge."* This is the document the
  rest of the repo defers to; leaving it means the repository contradicts its
  own decision. Treat it as a **precondition alongside `AGENTS.md`**, not as
  trailing copy work.

Blog posts are indexed and ranking; edit the pricing sentences in place rather
than restructuring posts. Add a What's New entry.

---

## Part B — fix the timestamp type mismatch (FXCC-facing)

Independent of Part A and, under the FXCC-first frame, the highest-value item in
this plan: it is a *proven* defect against *FXCC's* data.

1. Fix `sendWeeklyInsightsDigest` (`functions/index.js:2308`) to query both type
   lanes and merge. Rev 1 said "reuse the client's `loadActivityLogSince`"
   (`src/useFirestore.js:1648-1670`); that is not possible — it is a `useCallback`
   closed over `churchId` and the browser Firestore SDK, and a Cloud Function
   cannot import it. Follow the repo's established pattern instead: a **pure
   lane-splitting helper** (given a window, return the two query bounds and merge
   two result sets into one ISO-shaped list) in `src/lib/`, with a CJS twin in
   `functions/lib/` and a **parity test**, exactly as `attention.js` and
   `occurrences.js` already do. The query execution stays SDK-specific on each
   side; only the lane logic is shared.
2. Add a regression test that seeds **both** a string-timestamped and a
   Timestamp-timestamped activity row inside the window and asserts the digest
   counts both. A test that seeds only one lane passes today and proves nothing.
3. Audit every remaining server-side inequality filter on a timestamp-typed
   field for the same defect. Known sites: `functions/index.js:1662` (deleted by
   Part A), `:2308` (this fix), `:3993` (`completedAt` — COH-007 archiver;
   verify which type it writes), `src/pages/hubs/JobsPage.jsx:870`
   (`createdAt`).
4. Decide whether to backfill the 40 Timestamp-era FXCC rows to strings, convert
   the 967 string rows to Timestamps, or run dual-lane indefinitely.
   **Recommendation: dual-lane, no backfill** — the client already does it, a
   migration touches 1007 live audit rows to fix a reporting query, and audit
   rows are the last thing that should be rewritten in place.

---

## Part C — audit-log atomicity, narrowed

The review's framing is two-thirds stale: `logActivity` already uses
`serverTimestamp()` and pins the actor from the authenticated profile with no
fallback (`src/useFirestore.js:663-679`, DEC-2026-005). What remains is that the
trail is a separate fire-and-forget write at 36 call sites, failing to Sentry
with `silent: true`.

1. Do **not** batch all 36. Rev 1 named five targets; round 2 established that
   **two of them cannot be batched at all**, for different reasons:
   - `addAccessRecord` / `updateAccessRecord`
     (`src/useFirestore.js:1203-1215`) have **no `logActivity` call to batch**.
     Auditing them is *new* behavior — specify the action name and payload
     schema, or drop them from this part.
   - Member deactivation runs through the `setMemberActive` **callable**
     (`src/pages/SettingsPage.jsx:1090`, COH-011). A client-side batch is
     impossible; its audit row must be written server-side inside the callable,
     where it is already atomic with the mutation. Different work entirely.

   That leaves **three** genuine client-batch sites: item checkout/return,
   supply consumption, reservation approval. Scope Part C to those three, and
   file the other two separately rather than counting them here.
2. **Each of those five call sites must be restructured, not wrapped.** Rev 1
   specified a test that "forces the audit write to fail and asserts the primary
   write rolls back" — that test would pass vacuously today and prove nothing.
   Checkout/return commits its primary write *before* calling `logActivity`
   (`src/useFirestore.js:503`), and `logActivity` catches and suppresses its own
   failure (`:663-679`), so there is no path for a failed audit write to affect
   anything. The work is to have those five callers *build* the audit document
   and commit it in one `writeBatch` with the primary mutation. The assertion is
   then "both documents exist or neither does", not "a rollback happened".
   Enumerate all five paths before starting; the `silent: true` suppression stays
   for the other 31.
3. Wire a Sentry alert on `op: logActivity`. Today the failure is invisible to
   everyone. This is the code half of backlog #10; the console half (budget +
   alert configuration) stays the owner's and stays open.
4. Refresh `docs/SENTRY-ALERTS.md`, which still references SendGrid post-Brevo.

---

## Part D — accessibility, opportunistically

13 `role="button"` divs across `HubsPage`, `ReservationsPage`, `SuppliesPage`,
`JobsPage`, `WorkBoard`. Convert the `WorkBoard` and `JobsPage` ones — phones,
volunteers, real FXCC use — when next working in those files, as a separate
behavior-preserving commit per DEC-2026-019 §3. Leave the rest. This is not a
task with a date.

---

## Part E — closures and re-filings (DEC-2026-022)

**Close as done — "subscription / data-loading reduction."** Most of it shipped
before the review: activityLog capped at 100 (`src/useFirestore.js:210-218`),
jobListings at 500 (`:359`), People Access role-aware (`:404-455`), tasks scoped
`archived:false` (`:310-314`). The remainder has no data behind it: FXCC has
**0 reservations** and **135 workItems** lifetime. Replace the backlog line with
a tripwire — revisit if FXCC passes ~2,000 workItems or ~500 reservations.

**Note the one real gap it exposed:** COH-007 gave tasks an archive arm and gave
maintenance nothing (`src/useFirestore.js:311`). File that as its own small item
rather than leaving it inside a closed one.

**Close as accepted — "server timestamps beyond `activityLog`."** 82
`toISOString()` writes against 8 `serverTimestamp()`. The threat is a wrong or
manipulated client clock; the chronology that matters for security is the audit
trail, and it is already server-stamped. Retire it the way the private-comment
rule limitation was retired.

**Re-file under backlog #11 ("ask FXCC")** — request inbox, volunteer expiring
links, navigation consolidation. Same species as Sunday-readiness and templates:
plausible bets resting entirely on a guess about how FXCC works.

**Superseded by Part A** — "pricing artifacts", "two free hubs",
"centralized entitlement policy matrix". The matrix was the right diagnosis of
Finding 3 and the wrong prescription: three-layer policy machinery for one
rules-gated hub. Deleting the divergence beats testing it.

---

## Verification

| Item | How it is verified |
|---|---|
| A.3 emails | Render both templates against a fixture church; assert no "most-used" string survives anywhere in `functions/` |
| A.4 entitlement | Parity test asserting **all four** `hasHub` implementations agree across the matrix of `{grandfathered, trialing, paid, lapsed}` — including `SettingsPage`'s inline copy. This is the test Finding 3 would have caught and the test that would have caught rev 1's own omission |
| A.4 completeness | The grep gate in A.4: `freeHubsSelected`, `trialHubs`, `UPGRADE_PRICES`, `pro_monthly`, `subscription?.hubs` return only named sites |
| A.4 checkout | End-to-end: a checkout session created after cutover resolves to the **$5** price, not `pro_monthly` |
| A.4 rules | `npm run test:rules` — asserting the Jobs gate still passes for `plan: 'pro'`, which it does not today (Finding 3) |
| A.4 Stripe | Webhook test for a legacy `pro_monthly` event arriving after cutover, and a new `$5` event |
| A.2 grace | After the owner-approved write, St Olaf and TrueNorth read `status: 'trialing'`, `trialEndsAt: 2026-10-31`, and `hasHub` returns true for them in all four implementations |
| B | Parity test between the `src/lib` helper and its `functions/lib` twin; digest test seeding **both** timestamp types in-window; re-run the two REST counts and confirm the digest counts 213, not 173 |
| C | For each of the five restructured call sites: assert primary + audit document both exist, and that a rejected batch leaves **neither**. A test that only forces `logActivity` to throw proves nothing — see C.2 |
| A.2 | Re-run the tenant census after deploy; assert FXCC's subscription document is byte-identical |
| Regression | Full `npm test`, `npm run test:rules`, and the E2E suite against the Firebase test tenant |

Deployment order per `feedback_staged_deploy_ordering`: rules and functions
before the web push that depends on them.

---

## Risks and rollback

- **Highest risk is Part A.4 on rules.** A mistake locks a paying or trialing
  church out of its own data. Mitigation: A.1(i) keeps reads open in every
  state, so the worst failure is refused writes, not an inaccessible church.
- **In-flight Stripe webhooks** during cutover. Mitigation: retain the legacy
  price IDs; do not delete resolution paths.
- **Blog edits** touch indexed, ranking pages. Mitigation: sentence-level edits
  only; no restructuring, no URL changes.
- **Rollback.** A.3 and A.4 are separate function deploys and revert
  independently. Part B is a single function. No data migration is proposed
  anywhere in this plan, which is what makes rollback cheap — keep it that way.
- **Not in scope:** anything requiring FXCC input, the Shepherd items, COH-005,
  AC-07, comment attribution. Those keep their existing backlog positions.

---

## Review history

### Round 1 — Codex, 2026-09-16 (`gpt-5.6-terra`), verdict **REWORK**

Five blockers and three gaps. All eight were checked against the code before
being accepted; all eight were correct.

| # | Finding | Disposition in rev 2 |
|---|---|---|
| B1 | `AGENTS.md:25-26` carries the free-inventory / $15 invariant; a DEC cannot supersede it | A.0 — owner-gated precondition, amended in the same commit as the behavior change |
| B2 | `SettingsPage.jsx:174-177,386-388` is a fourth entitlement consumer | A.4 §3 — listed, plus a grep gate so the next one is found by the plan, not the reviewer |
| B3 | `UpgradeGate.jsx:27` hardcodes `item: 'pro_monthly'` — new prices would never be charged | A.4 §2 — caller changes in the same commit |
| B4 | Read-only after lapse is not localized; writes authorize on membership across the rules file | **A.1 rewritten and the recommendation changed** — see below |
| B5 | The 10-31 grace window had no state; post-expiry churches are `status: 'active'` | A.2 — grace implemented by reusing `trialing` + `trialEndsAt`, owner-approved write |
| G1 | `useAuth.js:267-277` and `App.jsx:839` read the fields being deleted | A.4 §4-5 |
| G2 | Part B cannot reuse a client `useCallback` from a Cloud Function | B.1 — shared pure helper + CJS twin + parity test, per the `attention.js` precedent |
| G3 | Part C's rollback test would pass vacuously | C.2 — restructure the five callers into batches; assert both-or-neither |

**The one that changed a decision, not just a detail:** B4. Rev 1 argued
read-only-after-lapse was *simpler* than the per-hub gating it replaced, and
most of Part A's justification leaned on that. It is not simpler — it touches
every write predicate and adds a billed `get()` per write. Correcting it
surfaced a category error worth keeping: **entitlement is not a security
boundary**, and rev 1 was proposing rules-layer machinery to enforce billing.
Rev 2 enforces lapse in the client and callables, leaves the rules alone, and
records the residual SDK-write exposure as accepted.

### Round 2 — Codex, 2026-09-16 (`gpt-5.6-terra`), verdict **REWORK**

Three blockers, two gaps. All five checked against the code; all five correct.

| # | Finding | Disposition in rev 3 |
|---|---|---|
| B6 | Inventory and Reservations are `free: true` (`HubsPage.jsx:43,51`) and bypass `UpgradeGate` (`:248`); "$5 for every feature" never reaches them | A.4 §3 — surfaced as an explicit owner decision, not an implementation detail |
| B7 | `SettingsPage.jsx:1595,1606` is the **primary** checkout surface, still submitting `pro_monthly`/`pro_annual` with `$15`/`$150` in the markup | A.4 §2 — both callers, and the price strings, move together |
| B8 | Four more Settings consumers: `isTrialing` off `freeHubsSelected` (`:495`), `activeHubs` (`:498`), the two-most-used copy (`:946`) | A.4 §4 |
| G4 | "Eleven claim sites" missed in-product copy and `docs/BUSINESS_MODEL.md:12-18`, the canonical pricing document | A.5 — BUSINESS_MODEL.md promoted to a precondition beside `AGENTS.md` |
| G5 | Part C's "access-record change" has no `logActivity` call to batch, and deactivation runs through a callable | C.1 — narrowed to three real sites; the other two respecified |

**The pattern, which matters more than any single finding.** Round 1 found a
consumer rev 1 had missed. Rev 2 added it and asserted a grep gate. Round 2 then
found four more consumers *in the same file rev 2 had just edited*, plus the
primary checkout surface. Three passes of hand-enumeration produced three
incomplete lists.

Rev 3's response is not a fourth list. **A.4.0 replaces enumeration with a
generated inventory and requires consolidating four implementations into one
module before any behavior changes.** The grep gate demotes to a check. If round
3 finds another missed consumer, that is evidence the consolidation step should
come earlier still — not that the list needs another entry.

**Not yet reviewed:** rev 3.

---

## Review focus (for Codex)

1. **Check Finding 2 against the code and tell me if the type-ordering claim is
   wrong.** The two REST counts are reproducible; the conclusion drawn from them
   is the part worth attacking. Is `sendWeeklyInsightsDigest` actually degraded,
   and is the late-November projection right?
2. **With lapse enforced only in the client and callables, is A.1(i)
   under-enforcing in a way that matters?** Name a concrete path where a lapsed
   church's raw SDK write causes real harm rather than unpaid usage. If there is
   none, say none — the accepted-risk framing stands or falls on that.
3. **Attack A.4.0, not the consumer list.** Rev 3 stops enumerating and requires
   consolidation into one `entitlement` module first. Two questions: does the
   generated inventory miss a *symbol* (not a site) — and can the consolidation
   actually land as a behavior-preserving commit, given `firestore.rules` must
   keep its own copy and `SettingsPage` derives rather than calls?
4. **Is the `free: true` decision (A.4 §3) separable from the rest?** If
   Inventory stays free, does anything else in Part A stop making sense?
5. **Is deleting the ranking (A.3 step 2) safe to ship without the rest of Part
   A?** Phase 1 assumes it is.
6. **Argue against the pricing change on its merits.** The plan asserts the free
   tier is not earning its complexity from five tenants' data. Five is a small
   number. If that inference is unsound, the whole of Part A rests on it.
7. Findings as test cases wherever one can be written — fixture and assertion.
