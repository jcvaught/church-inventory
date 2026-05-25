# E2E Isolation Plan — 2026-05-25

Background: the 2026-05-25 post-Phase-7 E2E run regressed from 56/0/4 (clean
baseline 2026-05-22) to 47/16/4. Investigation showed the failures are
*not* Phase 7 regressions — they cluster around two structural issues in
the test harness that were briefly masked by quiet test-data state on
2026-05-22:

1. **Test tenant coupling.** `e2e/admin-helpers.js:19` hardcodes
   `CHURCH_ID = '6cksNI9Uv8h0jXptdTESnXTXFgF3-church'` — the live
   production FXCC church. Real members keep adding real inventory, real
   low-stock supplies, real jobs. Selectors like
   `getByRole('button', { name: /^supplies$/i })` quietly worked while
   FXCC happened to have zero low-stock items; once members logged some,
   the Supplies tab's accessible name became `"Supplies36"` and 5+ a11y
   specs started timing out.
2. **Subcollection cleanup gap.** The H1 refactor on 2026-05-22 moved
   the Jobs Hub roster into protected per-uid subcollections
   (`jobListings/{id}/signups/{uid}`, `…/waitlist/{uid}`). The existing
   `purgeE2EArtifacts()` still only deletes the parent `[E2E]`-prefixed
   `jobListings` doc — Firestore has no cascade, so the
   signup/waitlist child docs orphan forever. Waitlist tests now read
   `waitlistLength: 1` (orphan) where they expect `0`, and pick up
   stranger UIDs in signups for the same reason.

This doc records the plan to eliminate both root causes. The fix is
intentionally split into two layers so the higher-cost Layer 1 can be
deferred without blocking Layer 2.

---

## Layer 2 — Recursive purge of subcollections (~15 min, ships first)

**Goal:** make `purgeE2EArtifacts()` self-healing — once committed,
every subsequent test run starts from a known-clean parent + subcollection
state regardless of what the previous run left behind.

### Change

In `e2e/admin-helpers.js`, replace the batch-delete pass over
`[E2E]`-prefixed `jobListings` parents with `firestore.recursiveDelete()`:

```js
// Was:
const batch = f.batch();
jobsSnap.docs.forEach(d => batch.delete(d.ref)); // misses subcollections
// …
await batch.commit();

// Becomes:
for (const doc of jobsSnap.docs) {
  await f.recursiveDelete(doc.ref); // handles signups/, waitlist/, comments/
}
```

`recursiveDelete` is on the Admin SDK's `Firestore` instance (firebase-admin
v11+). It paginates through the subcollection tree and batch-deletes
everything under the document — including future subcollections like
`comments/` if we add them. Cost: one extra Firestore RPC per E2E job
doc cleaned up. Negligible.

`jobAnnouncements`, `accessPeople`, `accessRecords` have no subcollections
today, but the same pattern is cheap insurance against future schema
growth.

### Acceptance

- After a deliberately-aborted spec (e.g. SIGINT mid-test), running
  `await purgeE2EArtifacts()` from a Node REPL leaves zero `[E2E]`
  parents AND zero docs under
  `collectionGroup('signups')` / `collectionGroup('waitlist')` whose
  parent `jobListings/{id}` no longer exists.
- The three waitlist specs (`waitlist.spec.js`) flip back to green
  without any other change.

### Risks

- `recursiveDelete` is destructive — if a future contributor passes a
  non-`[E2E]` doc ref to it by accident, real data dies. Mitigation:
  the call site only consumes refs produced by the
  `where('title', '>=', E2E_PREFIX)` query, which structurally cannot
  return a non-`[E2E]` parent.

---

## Layer 1 — Move E2E to a dedicated test church (bigger win, ~2h)

**Goal:** decouple E2E from a real working church so test assertions
never observe real members' data and a misbehaving test cannot scribble
on real production state.

### Approach

Stand up a separate Firebase Auth + Firestore tenant `e2e-test-church`
(churchId TBD, e.g. `e2e-test-church`) that contains only the three test
accounts and only `[E2E]`-prefixed data. The live FXCC church goes back
to being purely operational.

### Steps

1. **Create the church via the app's own create-church flow** so the
   subscription / config docs match the production shape. Use a script
   that signs in as a dedicated `e2e-owner@churchopshub.com` admin and
   POSTs through the normal create-church path. Capture the resulting
   `churchId`.
2. **Move the three test accounts** (`jcvaught@gmail.com`,
   `e2e-admin@churchopshub.com`, `e2e-member-b@churchopshub.com`) into
   the new church. Practically: create new user records under the new
   church via Admin SDK (`users/{uid}.churchId = '<new-id>'`,
   `role = …`, `allowedHubs = ['*']`). The Auth side stays untouched;
   only the Firestore user docs swap tenants. Real members in FXCC are
   already shielded from these accounts by
   `src/utils/testAccounts.js` (filters `@churchopshub.com`), but
   `jcvaught@gmail.com` will need that filter relaxed or moved (see
   Open question 1 below).
3. **Grant a trial / All-In subscription doc** on the new church via
   Admin SDK so paid-hub specs (Jobs, Coordination, etc.) keep
   working. Mirror the production subscription doc shape from
   `docs/BUSINESS_MODEL.md`.
4. **Update `e2e/admin-helpers.js:19`** — replace the hardcoded
   FXCC churchId with the new one. Add a guard:
   `if (!CHURCH_ID.startsWith('e2e-')) throw …` so a future hardcode
   to a real church can't slip in.
5. **Smoke run** the full suite against the new tenant. Fix any
   selector that implicitly depended on FXCC content (the test that
   looked up "Supplies" by exact role-name will work again because
   the new church has zero low-stock items).
6. **Keep FXCC clean** — drop the existing FXCC test accounts' admin
   role on FXCC (downgrade to no-access, or delete the user docs
   entirely). Real FXCC members stop seeing E2E accounts in pickers.

### Acceptance

- `e2e/admin-helpers.js` no longer references any real-tenant ID.
- The full suite passes (56+/0/4) against the new tenant.
- Visiting the FXCC church as a real admin does not surface any of the
  E2E-domain accounts in team/seat lists.
- Deleting all of the new tenant's data has zero impact on FXCC or on
  any real customer.

### Risks

- **Subscription / Stripe state.** Stripe webhooks won't know about
  the new tenant; the trial doc has to be written manually via Admin
  SDK each time it expires (90-day window per the Business Model).
  Mitigation: a small `scripts/refresh-e2e-trial.mjs` we can `cron` or
  run on demand, or set the subscription doc's
  `trialExpiresAt` to year 2099 since it's an internal-only church.
- **A second tenant doubles the surface area for Firestore rules
  drift.** Mitigation: rules are tenant-agnostic; same wildcard rules
  apply to both churches.
- **Hub access defaults.** The new church must keep
  `allowedHubs: ['*']` on the test users or `allowedHubs` matching the
  production-trial defaults, or hub-specific specs will start failing
  on access checks.

### Open questions

1. ~~`jcvaught@gmail.com` is the human owner's address. Do we keep it as
   the "Member A" E2E account…~~ **Resolved 2026-05-25: retire the
   personal address from the suite.** Mint a new
   `e2e-member-a@churchopshub.com` (or similar) and use that as Member A
   instead. Cleanup steps after the new tenant lands:
   - Remove `jcvaught@gmail.com` from `e2e/playwright.config.js` /
     auth-state fixtures wherever it's currently referenced as Member A.
   - Delete the `jcvaught@gmail.com` user doc that lives under FXCC's
     `users/{uid}` *only if* the human owner doesn't actively use FXCC
     as a member; otherwise leave it (it's just not invoked by the
     test suite anymore).
   - The `excludeTestAccounts` filter in `src/utils/testAccounts.js`
     can drop the `jcvaught@gmail.com` special-case once the suite no
     longer references that address.
2. Do we provision the new tenant via the create-church UI flow once
   (and snapshot the resulting docs), or codify the whole bootstrap in
   `scripts/setup-e2e-tenant.mjs` so it can be torn down + rebuilt at
   will?

---

## Sequencing + rollout

| Step | Layer | Effort | Blocker | Ship order |
|------|-------|--------|---------|-----------|
| Recursive `purgeE2EArtifacts` | 2 | ~15 min | none | **1** |
| Re-run E2E (expect waitlist green, a11y still failing on FXCC data) | — | ~7 min | Layer 2 | 2 |
| ~~Decide Open Question 1~~ — **resolved 2026-05-25: mint `e2e-member-a@churchopshub.com`** | — | — | — | done |
| Mint new `e2e-member-a@churchopshub.com` Auth user + service-account creds | 1 | ~5 min | none | 3 |
| Stand up `e2e-test-church` + subscription doc | 1 | ~45 min | step 3 | 4 |
| Move test users into new tenant (including new Member A) | 1 | ~15 min | new church exists | 5 |
| Update `e2e/admin-helpers.js` churchId + auth-state fixtures | 1 | ~5 min | users moved | 6 |
| Full smoke run | — | ~7 min | step 6 | 7 |
| Decommission `jcvaught@gmail.com` from auth-state + test fixtures | 1 | ~5 min | suite green on new tenant | 8 |
| Decommission FXCC-side `e2e-admin@` / `e2e-member-b@` test docs | 1 | ~5 min | step 8 | 9 |

Layer 2 closes the bleeding waitlist failures within an hour. Layer 1
is the structural fix and lands when there's a focused session for the
tenant bootstrap; OQ 1 is no longer a blocker.

## Gold-plated alternative (deferred)

Ephemeral church per run — `beforeAll` provisions `e2e-{runId}-church`
via Admin SDK, `afterAll` calls `firestore.recursiveDelete()` on the
whole `churches/{runId}` tree. Bulletproof and self-healing, but adds
~30s of setup per run and complicates Stripe-paid-hub coverage (need
to mint a fresh subscription doc per run). Revisit only if the
dedicated-church + recursive-purge pair turns out to drift again.

---

## Status

- Layer 2: **not started** (this doc is the plan; implementation lands
  in the next session focused on E2E hardening).
- Layer 1: **unblocked** as of 2026-05-25 — OQ 1 resolved (use
  `e2e-member-a@churchopshub.com`, retire `jcvaught@gmail.com` from the
  suite). Still pending the focused session to execute steps 3–9.

Updates to this plan get tracked here, not in CHANGELOG, until the
layers actually ship.
