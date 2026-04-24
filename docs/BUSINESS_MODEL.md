# Business Model — Hub-Based Monetization

**"The stuff is free, what you do with the stuff is paid."**

## Inventory Hub (Forever Free) — System of Record

Everything existing stays free. 10 team members per church included.

## Paid Hubs

| Hub | Price | Status |
|-----|-------|--------|
| **Team Hub** | $9/mo (25 users) or $19/mo (unlimited) | ✅ Done — Phase 5 |
| **Insights Hub** | $7/mo | ✅ Done — Phase 4 |
| **Maintenance Hub** | $7/mo | ✅ Done — Phase 3 |
| **Coordination Hub** | $7/mo | ✅ Done — Phase 6 |
| **Accountability Hub** | $5/mo | ✅ Done — Phase 7 |
| **All-In Bundle** | $29/mo (all hubs) | ✅ Done — Phase 8 |
| **People Access Hub** | $7/mo | ✅ Done |
| **Tasks Hub** | $7/mo | ✅ Done |
| **Job Hub** | $7/mo | ✅ Done |

## Grandfathering

Existing churches at launch: 12 months Founder status (unlimited users, all hubs).

## Subscription Doc

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

## 90-Day Free Trial

New churches get all 7 paid hubs free for 90 days. `useAuth.js` writes `trialStartedAt`/`trialEndsAt`/`trialHubs`/`freeHubsSelected: null` at church creation. `processTrialExpirations` CF (2am Central daily) auto-selects 2 most-used hubs from `activityLog` and writes `freeHubsSelected` on expiry. `subscription.status` starts as `'trialing'`, changes to `'active'` on expiry.

## Feature Gating

- `useSubscription(churchId)` → `hasHub(name)`, `canAddUser(count)`, `isTrialing(name)`, `trialDaysRemaining()`
- `UpgradeGate` component wraps paid pages
- Hub tabs: shown with 🔒 when church hasn't subscribed (drives discovery); hidden entirely when user's `allowedHubs[]` excludes them
- `userCanSeeHub(hubName)` in `App.jsx` combines church-level `hasHub()` + role check (people_access blocked for `user` role) + user-level `allowedHubs` check
- Payment: Stripe (Cloud Functions — wired up via `createCheckoutSession` / `createPortalSession`)

## Per-User Hub Access

Hub visibility is controlled at two levels:

1. **Church level** — subscription `hubs[]` determines which hubs the church has paid for
2. **User level** — `allowedHubs[]` on `users/{uid}` determines which of those hubs a given user can see

**Rules:**

- `admin` role always sees all church hubs — no `allowedHubs` check needed
- `manager` role: visible hubs = intersection of church `hubs[]` and user `allowedHubs[]`; `allowedHubs` null/missing = inherits all church hubs
- `user` role: same as manager but **People Access Hub is always hidden** regardless of `allowedHubs`
- `allowedHubs` null/missing = user inherits all church hubs (default for backward compatibility)
- Admins assign hub access per-user in Settings → Team Members (only showing hubs the church has)
- **People Access Hub** — manager+ only; certifications within it are admin-only (background checks, key assignments, custom requirements editable by manager)
- This is a **UI/UX concern only** — Firestore rules do not change
