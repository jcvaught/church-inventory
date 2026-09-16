# COH-012 — Flat pricing, entitlement collapse, and disposition of the 2026-08-28 review remainder

- Date: 2026-09-16
- Owner: Product owner (John)
- Implementation: Claude (DEC-2026-011)
- Reviewer: Codex (plan review before implementation)
- Status: **PLAN — not started**
- Base commit: `f429b86` (2026-09-10), working tree clean
- Related: Codex application review 2026-08-28; DEC-2026-019; DEC-2026-020;
  `docs/backlog.md` "Priority order"

---

## Summary

One plan, five parts, one hard date.

**Part A** replaces the trial/free-hub entitlement model with a flat one: 90 days
of everything, then **$5/month for everything**, no per-hub tier. This deletes
the auto-selection cron, `freeHubsSelected`, `trialHubs`, the per-hub `hasHub`
logic in all three places it is implemented, and the dead `$5/$7` artifacts. It
requires amending a guardrail in DEC-2026-020.

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

**This amends DEC-2026-020.** That decision's guardrail reads *"Inventory /
Supplies must remain free."* DEC-2026-021 supersedes that clause and must say so
explicitly, with the reasoning below; the rest of DEC-2026-020 stands unchanged.

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

- **(i) Read-only** *(recommended)* — members keep read access and export; all
  writes are refused. Rules become `allow read: if member; allow write: if
  member && subscriptionActive`. This is simpler than the per-hub gating it
  replaces, keeps the church's data reachable, and avoids "we locked you out of
  your own records."
- (ii) Full lockout — simplest to state, worst to receive, and raises a data
  retention question the app has no answer for.
- (iii) Keep inventory free — preserves the wedge but retains per-hub gating,
  which forfeits most of Part A's simplification.

The rest of Part A is written assuming **(i)**. If the owner picks (iii), phases
A.3 and A.4 shrink to a copy change and this plan should be re-reviewed.

### A.2 Treatment of the five existing tenants

- **FXCC** — `grandfathered: true` short-circuits every branch. Unaffected. No
  migration write.
- **Highland, New Life, Compassion** — keep their existing `trialEndsAt`
  unchanged. They were promised 90 days of everything and still receive exactly
  that. Only what happens *after* changes, and they are told before it does.
- **St Olaf, TrueNorth** — currently hold two free hubs by auto-selection. They
  are notified that those fold into the $5 plan, with a grace window ending no
  earlier than **2026-10-31**. Both have zero inventory/work/reservation data;
  TrueNorth has 101 supply actions and no supplies.
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
2. **Subscription shape.** `hasHub` becomes
   `grandfathered || trialing || paid` in all three implementations:
   `src/hooks/useSubscription.js:29-40`, `functions/index.js:1212-1223`,
   `firestore.rules:214-221`. `trialHubs`, `freeHubsSelected`, and `hubs[]` stop
   being read. Leave the fields on existing documents; do not migrate data that
   nothing reads.
3. **Rules.** `jobsHubActive()` becomes a plan-level `subscriptionActive()`.
   Under A.1(i), add the read/write split. Finding 3's `plan == 'pro'` gap
   disappears with the function that contained it.
4. **Client.** Delete `UPGRADE_PRICES`, the seven `price:` fields, and the
   dangling `hubPrice` prop (`HubsPage.jsx:57-147,295`). `UpgradeGate` already
   hardcodes the plan price; update the figure and copy.
5. **Per-user `allowedHubs` is untouched.** It is an admin permission, not an
   entitlement, and it stays.

### A.5 Phase 3 — public copy

Eleven claim sites: `src/pages/LandingPage.jsx` (2), `src/pages/HelpPage.jsx`
(3), `src/data/blogPosts.js` (5), `src/data/whatsNew.js` (1). Blog posts are
indexed and ranking; edit the pricing sentences in place rather than restructuring
posts. Add a What's New entry.

---

## Part B — fix the timestamp type mismatch (FXCC-facing)

Independent of Part A and, under the FXCC-first frame, the highest-value item in
this plan: it is a *proven* defect against *FXCC's* data.

1. Fix `sendWeeklyInsightsDigest` (`functions/index.js:2308`) to query both type
   lanes and merge, mirroring the client's `loadActivityLogSince`
   (`src/useFirestore.js:1648-1670`). Reuse that logic rather than writing a
   second version of it.
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

1. Do **not** batch all 36. Batch the five where a missing row changes an answer
   someone will actually ask: item checkout/return, supply consumption,
   reservation approval, member deactivation, access-record change.
2. Wire a Sentry alert on `op: logActivity`. Today the failure is invisible to
   everyone. This is the code half of backlog #10; the console half (budget +
   alert configuration) stays the owner's and stays open.
3. Refresh `docs/SENTRY-ALERTS.md`, which still references SendGrid post-Brevo.

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
| A.4 entitlement | Parity test asserting all three `hasHub` implementations agree across the matrix of `{grandfathered, trialing, paid, lapsed}` — the test Finding 3 would have caught |
| A.4 rules | `npm run test:rules`; add lapsed-tenant read-allowed / write-denied cases |
| A.4 Stripe | Webhook test for a legacy `pro_monthly` event arriving after cutover, and a new `$5` event |
| B | Dual-lane digest test seeding **both** timestamp types; re-run the two REST counts above and confirm the digest's count equals 213, not 173 |
| C | Batch atomicity test: force the audit write to fail and assert the primary write rolls back |
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

## Review focus (for Codex)

1. **Check Finding 2 against the code and tell me if the type-ordering claim is
   wrong.** The two REST counts are reproducible; the conclusion drawn from them
   is the part worth attacking. Is `sendWeeklyInsightsDigest` actually degraded,
   and is the late-November projection right?
2. **Is A.1(i) (read-only after lapse) actually simpler in rules than what it
   replaces, or does it fan out across every collection?** If it fans out, say
   so — the simplification argument is most of Part A's justification.
3. **Does Part A.4 delete anything that is load-bearing for a path I have not
   listed?** Specifically `allowedHubs`, the e2e fixtures, and anything reading
   `hubs[]` outside the three `hasHub` sites.
4. **Is deleting the ranking (A.3 step 2) safe to ship without the rest of Part
   A?** Phase 1 assumes it is.
5. **Argue against the pricing change on its merits.** The plan asserts the free
   tier is not earning its complexity from five tenants' data. Five is a small
   number. If that inference is unsound, the whole of Part A rests on it.
6. Findings as test cases wherever one can be written — fixture and assertion.
