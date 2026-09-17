# Business Model — One Plan (2026-09-17)

**Every church gets 90 days of everything. Then ChurchOpsHub is $5/month or $50/year for everything.**

DEC-2026-021 (recorded 2026-09-16, shipped 2026-09-17 as COH-012 phase A.4). It replaces the
2026-06-15 model (free Inventory forever + one $15/$150 plan for the rest), which itself replaced
the 8-hub à-la-carte matrix. History: `docs/COH-012-PRICING-AND-REVIEW-DISPOSITION-PLAN-2026-09-16.md`.

## The plan

| | What | Members | Price |
|---|---|---|---|
| **First 90 days** | Every hub — Inventory, Reservations, Maintenance, Insights, Coordination, Accountability, People Access, Tasks, Jobs/Shifts | Unlimited | **$0** |
| **ChurchOpsHub** | Every hub, same as the trial | Unlimited | **$5/mo** or **$50/yr** |
| **Lapsed** (day 91, unsubscribed) | *Finishes what it started, starts nothing new* — see below | — | — |

- There is **no free tier** and **no per-hub purchase**. Nothing is "paid" and nothing is "free"; it is all included.
- There is **no seat cap** in any state (owner decision #5).
- `$50/yr` = 2 months free vs monthly.
- Why $5: a statement of what the product is (an internal tool others may share the cost of), not a
  conversion lever. No church had ever started a checkout at $15; the plan does not claim $5 will change that.

## Day 91 — "they can't add more" (owner decision #3)

A church that does not subscribe is **lapsed**. It keeps every hub and all its data, and it can finish
what it started: return equipment, complete tasks, close reservations, mark attendance, sign up for
a job already posted, comment, log contractor hours. It cannot **start** anything: no new item,
supply, reservation, ticket, task, template, bundle, audit, vendor, space, person, requirement,
job, announcement — and no new **member** (invite links resolve, but joining is refused with a
message naming who can fix it). Server-side automation follows the same rule: the recurring-task
generator skips a lapsed church; reminders, digests and feeds keep running.

Enforced in the **client** (`useFirestore` create guard → modal) and the **callables**
(`lookupChurchByCode`, `generateRecurringTemplateTasks`), and in `firestore.rules` only where a
gate already existed (Jobs create). **Entitlement is not a security boundary** — a determined
member could write through the raw SDK, and that is accepted (AGENTS.md; COH-012 A.1(i)).

## Entitlement states

`src/lib/entitlement.js` is the ONE implementation; `functions/lib/entitlement.js` is generated from it
(`python3 scripts/entitlement-twin.py`) and `functions/test/entitlement.test.mjs` pins them together with the
rules' Jobs gate across an 18-fixture matrix. States are **derived, never stored**:

| State | Test | Written by |
|---|---|---|
| grandfathered | `grandfathered == true` | owner (FXCC, TrueNorth, e2e-test-church) |
| trialing | `status == 'trialing' && trialEndsAt > now` | `useAuth` at signup; `processTrialExpirations` flips `status` to `'active'` at 02:00 Central |
| paid | `plan == 'flat' && status in ['active','past_due']` | `stripeWebhook` — `past_due` keeps access through Stripe's dunning window |
| lapsed | none of the above | — |

`hasHub(sub, name)` is **"a subscription document exists"** — a lapsed church has every hub. `isEntitled()` is the
billing state; `canCreate()` is the day-91 rule; `canAddUser()` = `isEntitled()` (no cap).

`firestore.rules` `jobsHubActive()` = `grandfathered || status == 'trialing' || (plan == 'flat' && status in
['active','past_due'])` — rules cannot time-check `trialEndsAt`, so a trial stays open there for at most one day
past its end.

## Subscription document

`churches/{churchId}/config/subscription` — the flat shape (a church born after 2026-09-17):
```json
{
  "plan": "free | flat",
  "status": "trialing | active | past_due | unpaid | canceled",
  "trialStartedAt": "…", "trialEndsAt": "…",
  "trialExpiredAt": "…",           // stamped by the cron at expiry
  "paidAt": "…", "canceledAt": "…",  // from Stripe's own timestamps, never the clock
  "stripeCustomerId": null, "stripeSubscriptionId": null, "currentPeriodEnd": null,
  "grandfathered": false,
  "createdAt": "…"
}
```
Signup may create this document only in the trial shape (`grandfathered: false`, `plan: 'free'`,
`status: 'trialing'` — pinned in rules); every later change is webhook/Admin-SDK.

**Legacy fields** — `hubs`, `trialHubs`, `freeHubsSelected`, `maxUsers`, `plan: 'pro' | 'all_in' | 'team_*'` —
are **no longer read by anything**. Existing documents are not rewritten. A legacy Stripe event is normalized on
arrival: any known price → the flat paid state; any cancellation → `plan: 'free', status: 'canceled'`.

## Stripe

Product `prod_Ui4uQaH7X8iO9O` (ChurchOpsHub). Live prices:

| | Price ID | Key | Amount |
|---|---|---|---|
| Monthly | `price_1UGntiF12bDL8YA7UjdhSqFf` | `flat_monthly` | $5/mo (created 2026-09-17) |
| Annual | `price_1UGntiF12bDL8YA7ldky35B4` | `flat_annual` | $50/yr (created 2026-09-17) |
| *legacy* | `price_1TiekxF12bDL8YA7j1uH1X1i` / `…Z0BTmiHD` | `pro_monthly` / `pro_annual` | $15 / $150 — webhook resolution only |

`createCheckoutSession` accepts **only** `flat_monthly` / `flat_annual`; every legacy key is refused with
failed-precondition, so a stale client can never start a $15 checkout. The per-hub / team / `all_in` prices
were archived in Stripe on 2026-06-15 and remain mapped for webhook resolution. **Zero churches were on any
paid Stripe subscription at either cutover** (verified 2026-06-15 and 2026-09-16).

## Grandfathering

FXCC, TrueNorth (owner decision #9, written 2026-09-17) and the e2e test church carry `grandfathered: true` and
are entitled in every state.

## 90-day trial

`useAuth.js` writes `status: 'trialing'` + `trialStartedAt`/`trialEndsAt` at church creation.
`processTrialExpirations` (02:00 Central daily) flips an expired trial's `status` to `'active'`, stamps
`trialExpiredAt`, and emails the admin; a second pass sends a 7-day warning. Both emails are model-neutral
(no hub named, no price named — A.3, 2026-09-16). The "two most-used hubs stay free" auto-selection was deleted
in A.3; it never worked (see the COH-012 plan, A.3).

## Feature gating in the client

- `useSubscription(churchId)` → `subscription`, `hasHub`, `canAddUser`, `canCreate`, `isTrialing`, `isLapsed`, `trialDaysRemaining`
- `LapsedBanner` (`src/components/primitives/LapsedBanner.jsx`) is the product's only paywall: an app-wide
  strip (not dismissable), a card inside each hub and on the picker, and the modal a blocked create opens.
  `SubscribeButton` is the one checkout path. `UpgradeGate` (the old full-hub paywall) is gone.
- Payment: Stripe via `createCheckoutSession` / `createPortalSession` (Cloud Functions).

## Per-user hub access (unchanged)

`allowedHubs[]` on `users/{uid}` is **decoupled from billing** — purely per-user access control (the
volunteer-only shell still needs "this user only sees Shifts"). Billing never reads it, and entitlement never
overrides it (pinned in the rules tests).

- `admin` always sees every hub — no `allowedHubs` check
- `manager`/`user`: `allowedHubs` (null/missing = all)
- `user` role: People Access always hidden regardless of `allowedHubs`
- Inventory and Reservations are `core` hubs: visible to every member regardless of `allowedHubs`
