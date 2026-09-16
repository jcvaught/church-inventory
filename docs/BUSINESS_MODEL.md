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

Legacy per-hub / team / `all_in` Stripe products were **archived** (`active:false`) in Stripe on 2026-06-15
(only `prod_Ui4uQaH7X8iO9O` ChurchOpsHub stays active). Their price IDs remain mapped in `functions/index.js`
`PRICE_IDS`/`getPriceConfig` so any historical webhook still resolves — `getPriceConfig` is a local map
lookup (no Stripe call), and archived products/prices still resolve via the API regardless. No church was ever on a paid Stripe subscription at cutover (verified 2026-06-15:
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

## 90-Day Free Trial

New churches get all paid features free for 90 days. `useAuth.js` writes
`trialStartedAt`/`trialEndsAt`/`trialHubs`/`freeHubsSelected: null` at church creation.
`processTrialExpirations` CF (2am Central daily) flips an expired trial out of `trialing`,
stamps `trialExpiredAt`, and emails the admin; a second pass sends a 7-day warning.

**The 2-most-used-hubs auto-selection was DELETED 2026-09-16 (COH-012 A.3, `1521053`).**
It never worked. Both churches it ever processed received the same pair —
`['accountability','coordination']` — which is the alphabetical tie-break on all-zero
counts; TrueNorth's 101 activity rows were all supply actions and supplies was never a
trial hub, so nothing could rank. The email meanwhile told the admin these were their
"two most-used hubs". **`freeHubsSelected` is no longer written at expiry** — it stays
`null`, and with `trialEndsAt` past, `hasHub()` already returns false for every paid hub.
Both trial emails are now model-neutral: no hub named, no price named.

⚠️ **This section describes the CURRENT running code. The pricing model above is being
replaced** — see DEC-2026-021 (90 days of everything, then $5/mo or $50/yr for
everything, no free tier, unlimited members) and
`docs/COH-012-PRICING-AND-REVIEW-DISPOSITION-PLAN-2026-09-16.md`. The $15/$150 table and
the free-Inventory promise in this file are amended when COH-012 phase A.4 ships, not
before — until then they are still true of what is deployed.

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
