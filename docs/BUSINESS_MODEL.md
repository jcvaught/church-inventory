# Business Model — Flat Pricing (2026-06-15)

**"The stuff is free, what you do with the stuff is paid."**

As of 2026-06-15 the 8-hub à-la-carte matrix (+ $29 All-In bundle + Team seat tiers)
was collapsed into **one flat plan**. See `docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` §7.

## Tiers

| Tier | What | Users | Price |
|------|------|-------|-------|
| **Free** | Inventory + Supplies + Reservations + Activity Log — forever, no trial, no expiry | 10 | **$0** |
| **ChurchOpsHub** | *Everything else*: Maintenance, Insights, Coordination, Accountability, People Access, Tasks, Jobs/Shifts (contractor hours, AI digest, etc.) | Unlimited | **$15/mo** or **$150/yr** |

- Inventory is **never** paid. It's the permanent free wedge.
- No per-hub purchase, no Team seat tiers, no bundle math. One plan unlocks all paid hubs + unlimited members.
- `$150/yr` ≈ 2 months free vs monthly.

## Stripe

Live products (created 2026-06-15 via API):

| | Price ID | Lookup key | Amount |
|---|---|---|---|
| Product | `prod_Ui4uQaH7X8iO9O` (ChurchOpsHub) | — | — |
| Monthly | `price_1TiekxF12bDL8YA7j1uH1X1i` | `pro_monthly` | $15/mo |
| Annual | `price_1TiekyF12bDL8YA7Z0BTmiHD` | `pro_annual` | $150/yr |

Legacy per-hub / team / `all_in` Stripe products are **retired** (no longer offered for purchase) but
left active in Stripe + mapped in `functions/index.js` `PRICE_IDS`/`getPriceConfig` so any historical
webhook still resolves. No church was ever on a paid Stripe subscription at cutover (verified 2026-06-15:
0 live subs across all churches), so there were **no payers to migrate or grandfather**.

## Subscription Doc

`churches/{churchId}/config/subscription`:
```json
{
  "plan": "free | pro | (legacy: all_in | team_25 | team_unlimited)",
  "hubs": ["maintenance", "insights", ...],   // set to all paid hubs when plan==='pro'
  "maxUsers": 9999,                            // 10 on free, 9999 on pro
  "status": "active | trialing | past_due | canceled",
  "grandfathered": false,
  "freeHubsSelected": null
}
```

- **`plan: 'pro'`** is the flat plan. Both client `hasHub()` (`src/hooks/useSubscription.js`) and server
  `subHasHub()` (`functions/index.js`) short-circuit `plan === 'pro' || plan === 'all_in'` → true for every hub.
- On `pro` checkout the webhook sets `plan:'pro'`, `maxUsers:9999`, `hubs:<all>`, `freeHubsSelected:<all>`
  (the last pins the church out of the trial branch). On cancel it reverts to `free` / 10 users / `hubs:[]`.
- `grandfathered: true` still overrides everything (FXCC + e2e-test-church).

## Grandfathering

FXCC and the e2e test church carry `grandfathered: true` and keep full access regardless of plan name.
No à-la-carte payers existed at cutover, so the historical "migrate over-payers down to flat" step was a no-op.

## 90-Day Free Trial (unchanged)

New churches get all paid features free for 90 days. `useAuth.js` writes
`trialStartedAt`/`trialEndsAt`/`trialHubs`/`freeHubsSelected: null` at church creation.
`processTrialExpirations` CF (2am Central daily) auto-selects the 2 most-used hubs from `activityLog`
and writes `freeHubsSelected` on expiry (soft landing). After the trial a church keeps free Inventory
(+ its 2 auto-selected hubs) until it subscribes to the $15 plan.

## Feature Gating

- `useSubscription(churchId)` → `hasHub(name)`, `canAddUser(count)`, `isTrialing(name)`, `trialDaysRemaining()`
- `UpgradeGate` (`src/components/primitives/UpgradeGate.jsx`) wraps paid pages; its Subscribe button now
  always starts checkout for `pro_monthly`. Settings → Subscription & Billing offers monthly + annual.
- Payment: Stripe via `createCheckoutSession` / `createPortalSession` (Cloud Functions).

## Per-User Hub Access (unchanged)

`allowedHubs[]` on `users/{uid}` is **decoupled from billing** — it's now purely per-user access control
(the volunteer-only shell still needs "this user only sees Shifts"). Billing no longer reads it.

- `admin` role always sees all church hubs — no `allowedHubs` check
- `manager`/`user`: visible hubs = intersection of church hubs + `allowedHubs` (null/missing = all)
- `user` role: People Access Hub always hidden regardless of `allowedHubs`
- This is a **UI/UX concern only** — Firestore rules do not change
