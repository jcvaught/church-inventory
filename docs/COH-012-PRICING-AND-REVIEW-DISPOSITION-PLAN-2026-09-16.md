# COH-012 — Flat pricing, entitlement collapse, and disposition of the 2026-08-28 review remainder

- Date: 2026-09-16
- Owner: Product owner (John)
- Implementation: Claude (DEC-2026-011)
- Reviewer: Codex (plan review before implementation)
- Status: **rev 8 (2026-09-17) — A.3, A.4.0a/b, A.4.1–A.4.5 SHIPPED + DEPLOYED.
  A.5 (public copy + Terms notice email) and Part B next.** See "A.4 as shipped"
  below for the two calls made during implementation that the plan did not
  anticipate.
- Prior: rev 7 (2026-09-17) — A.3 SHIPPED; round 5 closed; A.4.0 next.**
  Owner decisions taken 2026-09-16 + 2026-09-17 (see "Owner decisions" below);
  DEC-2026-021 + DEC-2026-022 recorded in `docs/DECISIONS.md` (`397f090`). Five
  Codex rounds, all REWORK, all findings verified and closed — see "Review
  history". Round 5 (post-A.3) found one real regression A.3 introduced in
  `firestore.rules`, an unspecified document shape, a contradiction in A.4.0's
  "behavior-preserving" claim, and a **fourth** inventory miss — the last of
  which retires the in-doc table for a checked-in script (A.4.0 step 1).
- Base commit: `f429b86` (2026-09-10); rev 7 against `ebc9a2b` (2026-09-17)
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

## Owner decisions — 2026-09-16

All seven open questions answered. These supersede the "open question" framing
left in A.0, A.1, A.1b and A.4 §3 below; those sections are kept for their
reasoning, not their status.

| # | Question | Answer |
|---|---|---|
| 1 | Ship the neutral email rewrite, or pause the cron? | **Ship.** Done — see A.3 status |
| 2 | Change the model? | **Yes.** DEC-2026-021 |
| 3 | Day 91 behavior | **"They can't add more."** Not full read-only — a lapsed church finishes what it started but starts nothing new |
| 4 | Do Inventory/Reservations lose `free: true`? | **Yes for everyone — except TrueNorth, which is grandfathered like FXCC** |
| 5 | Does $5 include unlimited members? | **Yes.** No seat cap in any state |
| 6 | $50/year? | **Yes** |
| 7 | Grace window for the two lapsed churches? | **No grace.** New model applies immediately (modified for TrueNorth by #4) |
| 8 | Notice for the Terms change (2026-09-17)? | **Email on the day A.5 ships.** The Terms edit carries an effective date 14 days after that email (`TermsBody.jsx:59` requires 14 days' notice). See A.5 |
| 9 | Grandfather TrueNorth (2026-09-17)? | **Yes** — explicit approval given for the one production write. Executed at A.4 ship time, not before |

**Two interpretations applied, both flagged to the owner and neither corrected:**

1. **#3 "can't add more" is implemented literally.** A lapsed church can return
   equipment, complete a task, close a reservation; it cannot create an item,
   task, reservation, or **member**. Full read-only would freeze a church
   mid-week with equipment checked out and no way to record its return. Two
   consequences: inviting a person is blocked, and **server-side automation must
   respect the rule too** — `generateRecurringTemplateTasks` would otherwise keep
   creating records for a lapsed church.
2. **#4 and #7 conflicted on TrueNorth.** Read as: no grace window for anyone
   (#7), and TrueNorth separately grandfathered (#4), making grace moot for it.
   St Olaf gets the new model immediately.

**The one production write is approved (#9, 2026-09-17).** Grandfathering
TrueNorth = `grandfathered: true` on
`churches/Nxy6GTxK0bhuDy97lWFCwECmWg43-church/config/subscription`. It is the
only migration write in Part A, it runs with the A.4 deploy (so the new
predicate never sees TrueNorth as lapsed), and the A.2 tenant-census re-run
verifies it. Supporting data: TrueNorth is the only non-FXCC tenant with real
content — **15 supplies**, 101 activity rows, last active **2026-08-24**.

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
entries — 81%.** That figure is measured. The string-era rows age out of the
trailing window continuously, so coverage falls on its own; the **2026-11-27**
zero-coverage date is a **projection from current data, not a code-verifiable
claim** (round 3 made this distinction and it is kept). The direction is
certain; the date is an estimate.

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
- **St Olaf, TrueNorth** — **superseded by owner decisions #7 and #9:** no
  grace window for anyone; TrueNorth is grandfathered outright; St Olaf gets
  the new model the day A.4 ships. The grace-via-`trialing` design below is
  kept only for its reasoning (and the `trialWarningEmailSentAt` constraint,
  which still applies to any future grace write). Nothing in it is executed.

  *Original text:* currently hold two free hubs by auto-selection.
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

  **Round 4 found the cost of that reuse, and it was measured rather than
  assumed.** The 7-day warning pass selects on `status == 'trialing'` and
  `trialEndsAt` seven days out (`functions/index.js:1758-1769`), so a grace
  church would be mailed *"Your trial ends in 7 days"* on 2026-10-24 — months
  after its trial actually ended. **Verified not-live for these two tenants:**
  both already carry `trialWarningEmailSentAt` (St Olaf `2026-07-15`, TrueNorth
  `2026-08-05`), and the pass skips on that field (`:1767`), so neither would
  be mailed.

  That is luck, not design — the guard is an idempotency stamp, not a
  grace-aware condition. **Constraint on implementation:** the grace write must
  not clear `trialWarningEmailSentAt`, and if grace is ever extended to a church
  without that stamp, the warning pass needs an explicit grace exclusion first.
  Record this beside the write, not only here.
  This is a **production data write on two tenant documents** and is therefore
  the owner's to approve as a separate, explicit step (DEC-2026-014).
  Both have zero inventory/work/reservation data; TrueNorth has 101 supply
  actions and no supplies.
- **e2e-test-church** — grandfathered; fixtures must be checked for any
  assumption about `freeHubsSelected` or `trialHubs`.

### A.3 Phase 1 — stop the false promise — ✅ SHIPPED 2026-09-16

**Deployed to `church-inventory-9615c`, commit `1521053`.** Scheduler confirmed
ENABLED (`0 2 * * *` America/Chicago). Ranking deleted, `freeHubsSelected` no
longer written at expiry, both emails model-neutral. `status` stays `'active'`
rather than a new `'lapsed'` value, because `SettingsPage.jsx:925-926` renders
`subscription.status` verbatim and colours anything else red — the lapsed state
is modelled in A.4 with the client that presents it.

**Correction (round 5, B14): A.3 did change one thing it claimed not to.**
The commit comment at `functions/index.js:1681-1685` says "today's semantics
are unchanged" — true for the client and for `subHasHub`, both of which
time-check `trialEndsAt`, and **false for `firestore.rules`**. `jobsHubActive()`
(`firestore.rules:216-220`) has no time check; it relied on expiry *writing*
`freeHubsSelected` to take the `freeHubsSelected == null && trialHubs` branch
out of play. A.3 stopped that write, so any trial that expires from now on keeps
**rules-level** Jobs write access for as long as `trialHubs` contains `jobs` —
which is every church, since `useAuth.js:235` seeds all seven hubs. The UI hides
it; rules do not. **Affected today: nobody** — St Olaf and TrueNorth expired
under the old code and carry `freeHubsSelected` arrays. **First affected:
Highland, 2026-09-30 02:00 Central.** A.4 §7 closes it, and A.4 therefore has a
date: rules must deploy before 09-30 or Highland's expiry leaks. Entitlement is
not a security boundary (AGENTS.md), so this is a correctness defect in a gate,
not an exposure — but a claim of "unchanged" was made and it was wrong.

**First tests for this function** (`functions/test/handlers/trialExpirations.test.mjs`,
7 tests). It had none while it emailed strangers and mutated their subscription
documents. They caught a `ReferenceError` at `index.js:1736` on the first green
run — the trailing log still referenced the deleted `freeHubsSelected`, which
would have thrown for every expiring church *after* its email had gone out.
Gates: handlers 94/94 · unit 166/166 · lint 0 errors · build clean.

Highland's 7-day warning (~2026-09-22) and expiry (2026-09-30) now run on the
neutral copy.

#### Original scope, for the record

This phase is deliberately separable and reversible, so it can ship on its own if
the rest slips.

1. Rewrite the 7-day warning email and the trial-expiry email
   (`functions/index.js:1707-1800`) to be **model-neutral**. Remove every "two
   most-used hubs" claim — and do **not** announce $5/$50 here.

   Round 3 caught this: A.3 deploys functions only, so checkout is still wired
   to the $15/$150 price IDs (`functions/index.js:445-446`) and both client
   callers still submit `pro_monthly`. An A.3 that advertised the new price
   would email a product **that cannot be purchased**. The phase's job is to
   stop the false claim, not to launch the new model. Say the trial is ending
   and where to see options; announce pricing in phase 2, with the prices.
2. Delete the usage ranking and `freeHubsSelected` selection
   (`functions/index.js:1655-1700`); the cron's remaining job is to flip
   `status` at expiry and send mail.
3. Deploy functions only. No rules, no client, no Stripe changes.

**Fallback if phase 1 cannot land by 09-22:** disable the
`processTrialExpirations` schedule. No church loses anything (Highland has zero
data); no stranger receives a false claim.

### A.4 as shipped — 2026-09-17, five commits, all deployed

| Commit | What | Verified |
|---|---|---|
| `e47b99f` A.4.1 | Flat predicate in one module + generated twin; 18-fixture matrix incl. every legacy shape; `jobsHubActive()` rewritten and **rules deployed same day** (B14 closed 13 days before Highland's expiry); AGENTS.md invariant in the same commit; **TrueNorth grandfathered** (owner #9) | unit 174 / handlers 94 / rules 160 |
| `2b46b9c` A.4.2 | $5/$50 prices created on the ChurchOpsHub product; only `flat_*` purchasable; legacy events normalized; `paidAt`/`canceledAt` from Stripe timestamps (the re-delivery idempotency test caught a clock write) | handlers 101; invoker probe |
| `d2e8de0` A.4.3 | No paywall on hubs; `LapsedBanner` + `SubscribeButton` replace `UpgradeGate`; hub grid all Included; flat signup shape + rules pin on the self-created doc; Settings per state | **browser: lapsed / trialing / paid all rendered** in the emulator sandbox |
| `c70ef8e` A.4.4 | Create guard on 15 store paths → modal; `lookupChurchByCode` refuses a lapsed church; recurring generator uses `canCreate`; `jobSignUp` allows a lapsed church | **browser, real gestures:** create blocked + nothing written; complete an existing task succeeds |
| A.4.5 | `BUSINESS_MODEL.md` rewritten; DEC-2026-020 clause annotated; this section | — |

**Two calls the plan did not anticipate, made during implementation:**

1. **`hasHub` is not the billing state.** The plan said `hasHub` becomes
   `grandfathered || trialing || paid`. Combined with owner #3 ("they can't
   add more"), that was a contradiction: `hasHub` false hides whole hubs
   (`UpgradeGate`, `userCanSeeHub`, `attention.js`, Event Day), which is a
   paywall, not "finish what you started". Shipped: `hasHub(sub)` = "a
   subscription document exists" — a lapsed church HAS every hub;
   `isEntitled()` carries billing and `canCreate()` carries day-91. Only the
   one server consumer that *creates* (`generateRecurringTemplateTasks`)
   switched to `canCreate`; sign-ups, reminders, feeds and digests keep
   running for a lapsed church. A.1(i)'s phrase "its callables refuse" is
   therefore narrower than written: they refuse *creates*.
2. **Rules gate Jobs *create* only.** `canUseJobsHub` (reads, swap requests)
   and the update/delete rules on listings and announcements no longer test
   entitlement — a lapsed church must still see Saturday's job, sign up, mark
   attendance and clean up. The pin test names this. Also added, unplanned:
   the signup `create` on `config/subscription` now pins the trial shape (a
   self-created document could previously be born `grandfathered: true`).

**Verification scope, stated:** rendered and gestured in the emulator sandbox
(one church, one admin, the Work hub); not exercised in production, not on a
phone, not as a non-admin member. The Stripe checkout was not driven to a
real session. Highland's 09-30 expiry is the first production exercise of the
lapsed path — watch it.

### A.4 Phase 2 — collapse the entitlement model (as planned, rev 7)

1. **Stripe.** Add `$5/mo` and `$50/yr` price IDs. Retain `pro_monthly` /
   `pro_annual` in `PRICE_IDS` for webhook resolution exactly as the legacy
   per-hub IDs already are (`functions/index.js:444-458`) — do not delete them;
   an in-flight webhook must still resolve.

   **Decide what the webhook writes, not just what readers read.** Rev 3 left
   this implicit and round 3 caught it: the purchase path writes `update.hubs`
   and `update.freeHubsSelected` (`:933-940`) and the cancellation path writes
   `hubs: []`, `freeHubsSelected: []` (`:973-978`). Under the new model those
   fields have no meaning. Stop writing them.

   **But stopping is not enough, and round 4 caught why.** The retained legacy
   mappings keep their own `hubs` writes: `config.type === 'hub'` does
   `update.hubs = arrayUnion(config.hub)` (`:928-931`) and the cancellation
   branch does `arrayRemove` (`:968-971`). Those branches are live — the tests
   exercise them at `stripeWebhook.test.mjs:118-125` and `:173-182` — so a
   legacy event arriving after cutover would resurrect the field the
   consolidation just declared dead.

   **Specify legacy-event normalization:** any legacy paid event (per-hub,
   team, all_in, pro) resolves to the **flat paid state**; any legacy
   cancellation resolves to the **flat lapsed state**. No branch writes `hubs`
   at all. Update the three test groups together
   (`stripeWebhook.test.mjs:80-81`, `:118-125`, `:173-182`) — they are the
   specification of the old shape, and they are how this gets proven.
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
4. **Subscription shape — the fields, not just the predicate (round 5, B16).**
   Four revisions said `grandfathered || trialing || paid` and never said what
   `paid` or `lapsed` *are* on the document. They are:

   | State | Test | Written by |
   |---|---|---|
   | grandfathered | `grandfathered == true` | owner write (FXCC, TrueNorth, e2e) |
   | trialing | `status == 'trialing' && trialEndsAt > now` (client/functions); rules use `status == 'trialing'` alone — the 02:00 cron flips it, ≤1 day lag accepted | `useAuth.js:267-277` at church creation |
   | paid | `plan == 'flat' && status in ['active','past_due']` — `past_due` keeps access through Stripe's dunning window; `unpaid`/`canceled` do not | webhook: new `$5` prices **and every normalized legacy paid event** (§1) |
   | lapsed | none of the above — **derived, never stored.** Today's A.3 output (`plan: 'free'`, `status: 'active'`, `trialExpiredAt` set) and the cancellation output (`plan: 'free'`, `status: 'canceled'`) both fall here | expiry cron (unchanged from A.3); webhook cancellation → `plan: 'free', status: 'canceled'` |

   `customer.subscription.updated` (`functions/index.js:946-953`) writes
   Stripe's `status` verbatim, which is why `paid` enumerates statuses instead
   of testing `!= 'canceled'`. `plan: 'flat'` is a new value; `pro`/`all_in`/
   `team_*` stop being *read* (legacy events are normalized to `flat` on
   arrival, §1) but existing documents are not rewritten — FXCC keeps
   `plan: 'all_in'` and is covered by `grandfathered`. Seats: none (owner #5) —
   `canAddUser` returns true in every state except lapsed, where "can't add
   more" (#3) makes it false.

   `hasHub` becomes that predicate in **all four** implementations. Rev 1 listed
   three and missed the fourth:
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
7. **Rules — with a date.** Under A.1(i), `firestore.rules` is left alone
   apart from `jobsHubActive()`, which is rewritten to the §4 shape:
   `grandfathered == true || status == 'trialing' || (plan == 'flat' && status
   in ['active','past_due'])`. The `freeHubsSelected == null && trialHubs`
   branch — the one A.3 broke (see A.3 correction) — is deleted, not patched.
   Rules test: an expired trial (`status: 'active'`, `trialHubs: ['jobs']`,
   `freeHubsSelected: null`) is **denied** — the case that passes today and
   should not. **Must deploy before 2026-09-30 02:00 Central** (Highland's
   expiry). Rev 1 proposed dissolving the function; A.1(i) keeps it.
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

**Step 1 — take the inventory mechanically, not from memory.** ~~Generated
2026-09-16, file-level counts:~~ **Rev 7: the table below missed a fourth time**
(round 5, B15 — `functions/test/handlers/trialExpirations.test.mjs`,
`stripeWebhook.test.mjs:160,170`, the archived rules fixture
`functions/test/rules/fixtures/transitional-archive-2026-09-07.rules:187-199`,
and the new `trialExpiredAt` field). A table frozen in a document is the wrong
tool: it goes stale the moment the tree moves, and it has now been wrong in
every revision that carried it. **The inventory is a checked-in script,
`scripts/entitlement-inventory.sh`, committed in A.4.0 and run at every A.4
commit.** It greps the symbol list below (plus `trialExpiredAt`, plus the
load-bearing `hubs` writers) over `src/ functions/ firestore.rules scripts/ e2e/
docs/BUSINESS_MODEL.md`, *including* `functions/test/`, and prints file-level
counts. The A.4 grep gate is "the script's output names only files this plan
has dispositioned" — and the table below is retained as the 2026-09-16 baseline
only, superseded by the script's output from A.4.0 onward. The archived rules
fixture is a frozen snapshot by design and is **excluded** from the gate with a
comment in the script saying why.

Baseline table (2026-09-16, known-incomplete):

| Symbol | Files |
|---|---|
| `freeHubsSelected` | `functions/index.js` (14), `useSubscription.js` (5), `BUSINESS_MODEL.md` (4), `firestore.rules` (3), `useAuth.js`, `SettingsPage.jsx`, `App.jsx`, `scripts/setup-e2e-tenant.mjs`, `scripts/seed-emulator.mjs` |
| `trialHubs` | `useSubscription.js` (2), `useAuth.js`, `SettingsPage.jsx`, `functions/index.js`, `firestore.rules`, `BUSINESS_MODEL.md`, `scripts/setup-e2e-tenant.mjs` |
| `trialEndsAt` | `functions/index.js` (9), `useSubscription.js` (4), `useAuth.js` (2), `SettingsPage.jsx` (2), `scripts/setup-e2e-tenant.mjs` (2), `App.jsx`, `BUSINESS_MODEL.md` |
| `grandfathered` | `SettingsPage.jsx` (5), `useSubscription.js` (3), `scripts/setup-e2e-tenant.mjs` (3), `scripts/export-tenant-to-emulator.cjs` (3), `BUSINESS_MODEL.md` (3), `useAuth.js` (2), `scripts/seed-emulator.mjs` (2), `HubsPage.jsx`, `functions/index.js`, `firestore.rules`, `e2e/authenticated/work-merge.spec.js` |
| `pro_monthly` / `pro_annual` | `functions/index.js` (4), `BUSINESS_MODEL.md` (3), **`SettingsPage.jsx` (2)**, `UpgradeGate.jsx` |
| `TRIAL_HUBS` / `PRO_HUBS` | `functions/index.js` (6), `useAuth.js` (2) |
| `hasHub` / `subHasHub` | `functions/index.js` (20), `src/lib/attention.js` (10), `HubsPage.jsx` (9), `EventDayPage.jsx` (6), `App.jsx` (4), `useSubscription.js` (2), `UpgradeGate.jsx` (2), `Dashboard.jsx`, `firestore.rules`, `scripts/setup-e2e-tenant.mjs` |
| **`hubs` (the field itself)** | **Round 3 found this row missing.** A bare `hubs` grep is noisy — the word appears in UI prose across 38 files — so the gate must target the *load-bearing writers and readers*, not the string: `functions/index.js:928-939` (webhook **writes** `update.hubs`), `:966-978` (cancellation writes `update.hubs = []`), `useAuth.js:267-277` (church creation), `useSubscription.js`, `SettingsPage.jsx`, `firestore.rules`, `scripts/setup-e2e-tenant.mjs`, and `functions/test/handlers/stripeWebhook.test.mjs:80-81` |

Fourteen files, plus three scripts and an e2e spec. That is the real surface,
and no prose list was ever going to hold it.

**Step 2 — collapse the implementations into one before changing any
behavior — and be honest about which repoint is a no-op (round 5, B17).**
Rev 3 said "four implementations, behavior-preserving". Round 5 checked:
`SettingsPage.jsx:174-179,386-389` is **not** an implementation of `hasHub` —
it derives `churchHubs` / `hasJobsHub` / `hasInsightsHub` / `hasPeopleHub` from
`plan`, `grandfathered` and `hubs[]` only, and **ignores trials entirely**. A
trialing church today sees none of the Jobs/Insights/People settings panels it
is entitled to. And `firestore.rules` implements Jobs only. So "repoint
SettingsPage, preserving behavior" was a contradiction. A.4.0 is therefore two
commits:

- **A.4.0a — the no-op. ✅ SHIPPED 2026-09-17.** Extract a pure
  `src/lib/entitlement.js` — `hasHub`, `isTrialing`, `canAddUser`,
  `trialDaysRemaining` — copied verbatim from `useSubscription.js:29-62`
  (`maxUsers`/`planLabel` are Settings-only derivations and move in 0b), with
  a CJS twin at `functions/lib/entitlement.js`
  and a **twin parity test**, exactly as `attention.js`, `occurrences.js` and
  `people.js` already do (DEC-2026-019 §3). Repoint `useSubscription.js` and
  `functions/index.js:subHasHub` at it. The parity matrix is the **current**
  shape: `{grandfathered, pro, all_in, trialing-in-window, expired-with-array
  (pre-A.3 lapsed), expired-with-null (post-A.3 lapsed), per-hub hubs[]}`. Rules
  are pinned for **Jobs only** via `npm run test:rules` fixtures against the
  same matrix — that is the only hub the rules gate. *Shipped as:*
  `scripts/entitlement-inventory.sh` (which immediately surfaced five more
  files no table had — `createCheckoutSession.test.mjs`, `jobRoster.test.mjs`,
  `scheduledSends.test.mjs`, `coh006-gate3-smoke.spec.js`,
  `export-tenant-to-emulator.cjs`), the module + twin,
  `functions/test/entitlement.test.mjs` (832-comparison parity + pinned
  current-shape table), and 14 rules-pin tests in `core-collections.test.mjs`
  that **empirically confirm both divergences** — `pro` without
  `freeHubsSelected` denied (Finding 3) and `expiredWithNull` allowed (B14).
  Unit 172 / handlers 94 / rules 151, all green, no existing fixture changed.
- **A.4.0b — the named behavior change, its own commit. ✅ SHIPPED
  2026-09-17.** Repoint `SettingsPage.jsx`'s derivations at the module
  (`churchHubs`, `maxUsers`, `hasJobsHub`/`hasInsightsHub`/`hasPeopleHub`,
  `isTrialing`, `trialDaysLeft`, `planLabel`; `inTrialWindow`, `maxUsers`,
  `planLabel`, `PAID_HUBS` added to the module + twin + parity). **Effect: a
  trialing church starts seeing the Jobs, Insights and People Access settings
  panels, and its hub list in the member/invite editors.** Second, smaller
  effect: the displayed seat cap now reads the stored `maxUsers` (as
  `canAddUser` always did) instead of hard-coding `team_25 ? 25 : 10`. Both
  stated in the commit message. *Verified at the predicate level* (pinned
  test: trialing fixture → `['jobs','insights','people_access']`); not
  render-verified in a browser — the Settings JSX consumes the same booleans
  it did before, only their source changed.

Only after both land does the model change — in one module instead of four
files, which is what makes the rest of A.4 verifiable rather than hopeful.

Only after that lands does the model change — in one module instead of four
files, which is what makes the rest of A.4 verifiable rather than hopeful.

**Step 3 — the grep gate runs as a check, not as the discovery method.** Each
symbol above must return only sites this plan names. Rev 2 claimed this gate and
still failed it, because the gate was written after the list instead of before.

### A.1b Second open question the owner must answer: seats

**Does $5/month include unlimited members?** The plan has been silent on this
through four revisions and round 4 was right to call it: seat policy is a live,
load-bearing part of the current model that the new one does not mention.

Today: `FREE_PLAN_MAX_USERS = 10` (`src/hooks/useSubscription.js:5`) caps every
non-`pro` church, `canAddUser` short-circuits for `pro`/`team_unlimited`/`all_in`
(`:43-47`), and `SettingsPage` independently derives the cap
(`:177-179` — `team_25 ? 25 : 10`) and a plan label including "Team Unlimited"
(`:497`). Two retired Stripe price IDs, `team_25` and `team_unlimited`
(`functions/index.js:454-455`), are still mapped.

Three sub-decisions, none of which implementation can make:

1. Does the $5 plan carry unlimited members (as $15 does), or a cap?
2. What is the seat cap **during** the 90-day trial?
3. What is it **after lapse** — and can a lapsed church over the cap still have
   all its people, or does it go read-only on membership too?

Whatever is chosen, add a fixture for adding an **11th member** in each of
`{trialing, paid, lapsed}` (round 4's suggestion, adopted). Seat policy also has
to appear in the same four-implementation consolidation as `hasHub` — `maxUsers`
is derived in both `useSubscription` and `SettingsPage` today.

### A.5 Phase 3 — public copy

Rev 1 said "eleven claim sites"; round 2 found more; round 4 found more again,
including the **Terms of Service**. Three wrong counts is the same failure as the
consumer enumeration, so A.5 takes the same fix: **the list is generated, not
remembered.**

Generated 2026-09-16 over free-tier and price claims (`free tier` · `free base
tier` · `permanently free` · `stay free` · `no time limit` · `$15` · `$150` ·
`two most-used` · `free Inventory`), file-level counts:

| File | Sites | Nature |
|---|---|---|
| `src/data/blogPosts.js` | 21 | indexed, ranking — sentence-level edits only |
| `src/pages/HelpPage.jsx` | 14 | public help centre; `:175`, `:1005-1012`, `:1082` promise free Inventory and $15/unlimited |
| `src/pages/LandingPage.jsx` | 3 | marketing |
| `src/pages/SettingsPage.jsx` | 2 | in-product (`:1613` free-hubs line, checkout markup) |
| **`src/components/legal/TermsBody.jsx`** | **2** | **contract** — `:20` and `:29` promise "a free tier and optional paid hubs" |
| `src/pages/HubsPage.jsx` | 1 | in-product |
| `src/hooks/useSubscription.js` | 1 | code comment |
| `src/data/whatsNew.js` | 1 | changelog entry |
| `docs/BUSINESS_MODEL.md` | 1 | canonical pricing table |

**`TermsBody.jsx` is not copy — it is the agreement the user accepted**, shared
by the auth-screen modal and `/terms` so the two cannot drift. Shipping a model
its own Terms contradict is a different class of problem from stale marketing.
Treat it as a **precondition alongside `AGENTS.md` and `BUSINESS_MODEL.md`**.

**Notice (owner #8, round 5 B18).** The Terms themselves set the rule:
`TermsBody.jsx:59` — *"We will notify active users of material changes via
email at least 14 days before the new terms take effect."* So A.5 is:

1. Edit `TermsBody.jsx:20,29` to the flat model; change "Last updated" (`:14`)
   to the ship date and add an **"Effective: <ship date + 14 days>"** line
   beside it.
2. **Send the notice email the day A.5 ships** — one plain email to the admin of
   each non-FXCC church (5 churches; FXCC is grandfathered and unaffected):
   what changes, when it takes effect, the $5/$50 price, and that they can
   cancel before the effective date. Draft the copy in A.5; it is model-facing
   copy like everything else in this section. FXCC is copied for the record.
3. For the 14 days between, the product already behaves the new way while the
   old Terms are the agreement on paper. **Accepted:** that gap has existed
   since A.3 shipped, no church has ever paid, and the only church that can
   lapse inside the window is Highland (09-30), which has zero data.

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
   Part A), `:2308` (this fix), `:3978` (`completedAt` — COH-007 archiver),
   `src/pages/hubs/JobsPage.jsx:870` (`createdAt`). **Audited 2026-09-17
   (round 5, G13):** `completedAt` is written as `new Date().toISOString()` at
   `WorkBoard.jsx:1149,1329` and the archiver compares it to `archiveCutoffISO()`
   — string vs string. `createdAt` on job listings is a string everywhere
   (`JobsPage.jsx:500,727,737` call `.slice`/`.localeCompare` on it) and `:870`
   compares string to string. **Neither has a second lane.** The activity log is
   the only collection with a mixed-type history, because it is the only one
   whose writer changed SDKs (`serverTimestamp` era → ISO era).
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
2. **Each of those three call sites must be restructured, not wrapped — and
   not all three take the same mechanism.** Rev 1 specified a test that "forces
   the audit write to fail and asserts the primary write rolls back"; that test
   would pass vacuously today, because checkout/return commits before calling
   `logActivity` (`src/useFirestore.js:503`) and `logActivity` catches and
   suppresses its own failure (`:663-679`). Nothing a failed audit write does
   can affect anything.

   **`writeBatch` is the right tool for only two of the three.** Round 3 caught
   the third: **`useSupply` is a `runTransaction`** (`:604-620`) that reads
   `quantity`, computes `max(0, qty - n)`, and writes it back. Replacing that
   with a batch would discard the read-modify-write guarantee and reintroduce
   lost updates under concurrent consumption — a real regression, traded for an
   audit-trail improvement. **The audit document must be added *inside* the
   existing transaction (`tx.set(auditRef, …)`), not batched around it.**

   - checkout / return → `writeBatch`
   - reservation approval → `writeBatch`
   - supply consumption → **audit write inside the existing `runTransaction`**

   The assertion is "both documents exist or neither does", not "a rollback
   happened". The `silent: true` suppression stays for the other 33 sites.
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
| A.4.0a parity | Twin parity test (`src/lib/entitlement.js` ≡ `functions/lib/entitlement.js`) across the **current-shape** matrix in A.4.0 step 2; rules pinned for Jobs only via `test:rules` fixtures on the same matrix. Behavior-preserving: `npm test` + `test:rules` green with no fixture changes |
| A.4.0b | One assertion: a trialing fixture church renders the Jobs/Insights/People settings panels (it does not today) |
| A.4 entitlement | The same parity test re-pointed at the **new-shape** matrix `{grandfathered, trialing, paid-active, paid-past_due, lapsed-expired, lapsed-canceled}`; `SettingsPage` now consumes the module so it is covered by construction, not by a fourth copy |
| A.4 completeness | `scripts/entitlement-inventory.sh` output names only files this plan has dispositioned; run at every A.4 commit, not once |
| A.4 checkout | End-to-end: a checkout session created after cutover resolves to the **$5** price, not `pro_monthly` |
| A.4 rules | `npm run test:rules` — the Jobs gate passes for `plan: 'flat'` + `status: 'active'`/`'past_due'`, passes for `status: 'trialing'`, **denies** an expired trial with `trialHubs: ['jobs']` and `freeHubsSelected: null` (the A.3 regression, B14), denies `status: 'canceled'`. Deployed before 2026-09-30 |
| A.4 Stripe | Webhook test for a legacy `pro_monthly` event arriving after cutover, and a new `$5` event |
| A.2 TrueNorth | After the owner-approved write (#9), TrueNorth reads `grandfathered: true` and `hasHub` returns true in every implementation; St Olaf reads lapsed. The A.2 grace-write row from rev 5 is **withdrawn** (owner #7: no grace) |
| B | Parity test between the `src/lib` helper and its `functions/lib` twin; digest test seeding **both** timestamp types in-window; re-run the two REST counts and confirm the digest counts 213, not 173 |
| C | For each of the **three** restructured call sites: assert primary + audit document both exist, and that a rejected batch/transaction leaves **neither**. A test that only forces `logActivity` to throw proves nothing — see C.2 |
| C — contention | **Round 3's fixture, adopted verbatim:** two concurrent `useSupply` calls against `quantity: 1`; assert final quantity is 0 **and two audit rows exist**. This is the test that fails if the transaction is ever downgraded to a batch |
| A.4 webhook shape | `functions/test/handlers/stripeWebhook.test.mjs:80-81` updated to the new document shape, and a cancellation-path assertion alongside it |
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

### Round 3 — Codex, 2026-09-16 (`gpt-5.6-terra`), verdict **REWORK**

Three blockers and four gaps — but two of the "gaps" were **confirmations**, and
one blocker caught the plan introducing a bug rather than omitting a site. The
shape changed, which is itself a signal that A.4.0 addressed the right thing.

| # | Finding | Disposition in rev 4 |
|---|---|---|
| B9 | A.3 cannot ship alone while announcing $5: checkout is still wired to the $15/$150 IDs, so it would email a product that cannot be bought | A.3 §1 — the phase-1 emails become **model-neutral**; pricing is announced in phase 2, with the prices |
| B10 | A.4.0's inventory omits `hubs` itself; the webhook **writes** it at `:928-939` and `:966-978`, so consolidation could not prove the old shape unused | A.4.0 — `hubs` row added, targeting load-bearing writers/readers rather than the noisy string; A.4 §1 now specifies what the webhook writes |
| B11 | **Part C would have caused a regression.** `useSupply` is a `runTransaction` (`:604-620`); the specified `writeBatch` discards the read-modify-write guarantee and reintroduces lost updates | C.2 — two sites batch, supply consumption puts its audit **inside the existing transaction**. Also fixed the three-vs-five inconsistency rev 3 left behind |
| G6 | `stripeWebhook.test.mjs:80-81` asserts the legacy `hubs`/`freeHubsSelected` state | A.4 §1 + verification table |
| G7 | Add a supply-contention fixture: two concurrent `useSupply` against quantity 1 | Adopted verbatim into the verification table |
| G8 | *Confirmation:* the Timestamp-before-String conclusion is sound; the November date is a data projection, not code-verifiable | Finding 2 reworded to separate the measured 81% from the projected date |
| G9 | *Confirmation:* no concrete cross-tenant or privilege-escalation harm from A.1(i)'s raw SDK writes; residual is accepted unpaid own-tenant use | **Review-focus question 2 is answered. A.1(i) stands as written** |

**What rev 3's structural change bought.** Rounds 1 and 2 each found consumers
the plan had missed — the same failure, twice. Round 3 found **one** such
omission (`hubs`), and spent the rest of its budget on things a list could never
have caught: a phase-ordering contradiction, a concurrency regression, and two
confirmations. That is the review moving from "your inventory is wrong" to "your
engineering is wrong", which is where it should have been at round 1.

### Round 4 — Codex, 2026-09-16 (`gpt-5.6-terra`), verdict **REWORK**

Two blockers, three gaps — one of which was a confirmation. **No
consumer-enumeration miss in A.4.0's code inventory**: the findings moved to
policy and to copy.

| # | Finding | Disposition in rev 5 |
|---|---|---|
| B12 | `hubs` cannot be declared dead while retained **legacy** mappings still write it (`:928-931` arrayUnion, `:968-971` arrayRemove), exercised by `stripeWebhook.test.mjs:118-125,173-182` | A.4 §1 — legacy-event **normalization** specified: every legacy paid event → flat paid state, every legacy cancellation → flat lapsed state, no branch writes `hubs` |
| B13 | A.5 still incomplete — public Help copy and, more seriously, **`TermsBody.jsx:20,29`**, which promises "a free tier and optional paid hubs" | A.5 rewritten around a **generated** inventory (44 sites, 9 files); Terms promoted to a precondition, since it is the accepted agreement, not marketing |
| G10 | Seat policy is undecided: `FREE_PLAN_MAX_USERS`, `maxUsers`, `team_25`, `team_unlimited` — does $5 include unlimited members? | **New A.1b** — a second owner decision, with three sub-questions and round 4's 11th-member fixture adopted |
| G11 | Grace-via-`trialing` would mail already-expired churches "your trial ends in 7 days" (`:1758-1799`) | A.2 — **measured, and narrower than stated**: both tenants already carry `trialWarningEmailSentAt` (2026-07-15, 2026-08-05) and the pass skips on it (`:1767`), so neither would be mailed. Recorded as luck rather than design, with two constraints on the grace write |
| G12 | *Confirmation:* Part C's three mechanisms are sound; `useSupply` must keep `runTransaction` and can `tx.set` its audit row atomically | Settled |

**Where the four rounds landed.** Rounds 1–2 found missed consumers (twice).
Round 3 found one omission plus a phase-ordering contradiction and a concurrency
regression. Round 4 found **no** code-inventory miss — it found two undecided
policies and a copy surface. The defect class has moved from "the plan does not
know the codebase" to "the owner has not decided", which is the boundary where
plan review stops being useful.

**Recommendation on the review loop itself:** rev 5 is the point to stop
iterating with Codex and hand to the owner. The remaining blockers are
**A.0** (amend `AGENTS.md`, `BUSINESS_MODEL.md`, `TermsBody.jsx`), **A.1**
(day-91 behavior), **A.1b** (seats), and **A.4 §3** (the `free: true` flag) —
all four are decisions, not findings, and no further review round can close
them.

### Round 5 — Codex, 2026-09-17 (`gpt-5.6-luna`, post-A.3), verdict **REWORK**

Run against the live tree with A.3 at `1521053`, focused on A.4.0 readiness.
Five blockers, two gaps. Every one verified against the code before
disposition; all five blockers were real, though two were narrower than stated.

| # | Finding | Verified as | Disposition in rev 7 |
|---|---|---|---|
| B14 | A.3 left `freeHubsSelected == null` on expiry, so `jobsHubActive()` keeps granting Jobs via `trialHubs` (`firestore.rules:216-220`) | **Real, latent.** No church is affected yet (both lapsed tenants expired pre-A.3); Highland on 09-30 is first | A.3 correction paragraph; A.4 §7 rewritten with the denial test and a **deploy-before-09-30** date |
| B15 | Inventory omits `trialExpirations.test.mjs`, `stripeWebhook.test.mjs:160,170`, the archived rules fixture, and `trialExpiredAt` | **Real — fourth miss of the same class** | A.4.0 step 1: table retired, `scripts/entitlement-inventory.sh` checked in and run per commit; archive fixture excluded with a stated reason |
| B16 | `paid`/`lapsed` never defined as fields; A.3 writes lapsed as `status: 'active'`; `subscription.updated` writes Stripe status verbatim | **Real** | A.4 §4 state table: `plan: 'flat'` + status enumeration for paid; lapsed derived, never stored |
| B17 | "Four implementations" — `SettingsPage` has no `hasHub`; its derivations ignore trials; rules cover Jobs only | **Real** — and it made "behavior-preserving" a contradiction | A.4.0 split into 0a (no-op extraction, current-shape matrix, rules pinned for Jobs) and 0b (Settings repoint, named as the fix it is) |
| B18 | A.5 leaves Terms notice/acceptance unresolved | **Real, and an owner call** — `TermsBody.jsx:59` requires 14 days' emailed notice | Owner #8: email on ship day, effective +14; A.5 steps 1–3 |
| G13 | Part B never states `completedAt`/`createdAt` types | Audited: both ISO strings on write and on query; no second lane | Part B step 3 |
| G14 | No fixture for the St Olaf/TrueNorth grace write | Moot — owner #7 withdrew the grace; #9 approved TrueNorth's grandfather instead | A.2 bullet superseded; verification row replaced |

**Where round 5 landed.** The loop was stopped at rev 5 because the blockers
had become owner decisions. Round 5 was run *after* those decisions and after
A.3 landed, and it found something the earlier rounds could not have: a
regression the shipped commit *introduced* while claiming not to (B14). That is
the argument for one post-ship round per phase — not for reopening the loop.
B15 is the fourth inventory miss and closes the question of whether a table in
a document can ever be the gate: it cannot, so it is no longer asked to be.

**Not yet reviewed:** rev 7. Next review point: after A.4.0a+b land, against
the tree, not the doc.

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
