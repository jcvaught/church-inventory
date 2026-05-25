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
2. ~~Do we provision the new tenant via the create-church UI flow…~~
   **Resolved 2026-05-25: scripted bootstrap.** Write
   `scripts/setup-e2e-tenant.mjs` (and a sibling
   `scripts/teardown-e2e-tenant.mjs`) so the church can be torn down
   and rebuilt deterministically. The script:
   - Mints the three Auth users (`e2e-admin@`, `e2e-member-a@`,
     `e2e-member-b@` — all `@churchopshub.com`) via Admin SDK
     `auth().createUser()` if they don't already exist.
   - Creates `churches/{churchId}` with config docs that mirror the
     production shape (`config/main`, `config/subscription`).
   - Writes the three `users/{uid}` docs with the right `churchId`,
     `role`, and `allowedHubs: ['*']`.
   - Mints a subscription doc with `trialExpiresAt` set far in the
     future (year 2099 — internal-only tenant, no Stripe involvement).
   - Idempotent: re-running tops up missing pieces without
     duplicating.
   Justification: a UI-driven setup is a one-off snapshot that rots
   the moment the create-church flow changes; the script stays
   exercised because we'll call it from CI when (if) we ever go to
   ephemeral-per-run.

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

## Correction — root cause re-diagnosis (2026-05-25)

The Layer 2 re-run produced the **same 16 failures** as before, which
forced a closer look. Most of the failures aren't orphan data at all —
they're Phase 2 fallout the original diagnosis missed:

- Phase 2 replaced all 41 `window.confirm(...)` calls in the app with
  the new `ConfirmDialog` React modal (commit `548aac7`,
  `src/components/primitives/ConfirmDialog.jsx`).
- The test suite has 11 sites using `page.once('dialog', d => d.accept())`
  (Playwright's *native* browser-dialog handler). Those handlers
  silently no-op against a React modal, so the destructive action
  (admin Remove, member Withdraw, hard-delete-with-emails, delete-series,
  Share Board copy) never runs.
- That maps exactly to 11 of the 16 failures: 3 waitlist (admin remove
  + member withdraw), 3 notifications-gate, 1 signup-flow withdraw,
  1 edge-cases hard-delete, 1 recurring delete-series, 1 public-board,
  1 UAT M10 Share Board (which also has a stale `/PUBLIC page/`
  case-sensitive regex that needs to match the lowercase wording
  Phase 2 introduced).

The other 5 failures (the a11y axe suite) really are FXCC data-state
pollution — those still need Layer 1 to clear.

**Implication:** Layer 2's recursive-delete change is correct and ships
anyway as defensive cleanup (orphan docs that *do* accumulate from
crashed runs will now get cleaned), but it doesn't surface in today's
results. The real next priority is **Layer 1.5 — Phase 2 test
follow-up**: replace the native-dialog handlers with React-dialog
assertions.

---

## Layer 1.5 — Phase 2 test follow-up — **SHIPPED 2026-05-25**

**Outcome:** all 10 dialog-related failures flipped green. Suite went
from 47/16/4 → 57/6/4. Remaining 6 = 5 a11y (still need Layer 1) +
1 public-board cache race (new finding, see below).

### Layer 1.5 changes



**Goal:** unblock the 11 tests Phase 2 quietly broke by aligning the
spec patterns with the new `ConfirmDialog` modal.

### Change

Add a tiny helper in `e2e/admin-helpers.js` (or a new
`e2e/ui-helpers.js`):

```js
// Click the primary CTA inside the active ConfirmDialog modal.
// Pass the exact confirmLabel the call site uses (e.g. 'Remove',
// 'Withdraw', 'Delete series'). Caller is responsible for triggering
// the dialog first.
export async function acceptConfirm(page, label) {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  await dialog.getByRole('button', { name: new RegExp('^' + label + '$', 'i') }).click();
}
```

Then sweep the 11 sites identified by
`grep -n "page.once.*dialog\|page.on.*dialog\|memberAPage.once.*dialog" e2e/authenticated/*.spec.js`
and replace each native handler with the helper. Per call-site labels
(sourced from `JobsPage.jsx` `confirmLabel:` values):

| Spec / line | Action | confirmLabel |
|------|------|------|
| waitlist.spec.js:41 | admin removes signup | `Remove` |
| waitlist.spec.js:73 | admin removes only signup | `Remove` |
| waitlist.spec.js:101 | member self-withdraws | `Withdraw` |
| signup-flow.spec.js:78 | member self-withdraws | `Withdraw` |
| notifications-gate.spec.js:44 | admin removes signup | `Remove` |
| notifications-gate.spec.js:74 | admin removes signup | `Remove` |
| notifications-gate.spec.js:100 | member self-withdraws | `Withdraw` |
| edge-cases.spec.js:84 | hard-delete with emails | `Send emails` |
| recurring.spec.js:57 | admin deletes series | `Delete series` |
| public-board.spec.js | admin changes status | TBC during sweep |
| uat-ui.spec.js:97 | Share Board copy-link | `Copy link` |
| crud.spec.js:88 | (cancel path — `dialog.dismiss()`) | use `Cancel` |

Also update `uat-ui.spec.js` M10's expectation from
`/PUBLIC page/` → `/public page/i` (or just `/public page/`) to match
Phase 2's lowercase + `<strong>`-bolded copy.

### Acceptance

- All 11 dialog-related failures from the 2026-05-25 re-run flip green.
- A11y axe specs still red (they need Layer 1 — FXCC data state).
- No new failures introduced.

### Risks

- A few of the call sites may use a *different* `confirmLabel` than
  what's tabulated above (e.g. `public-board.spec.js` needs inspection).
  Mitigation: do the sweep test-by-test, run incrementally, fix labels
  inline if `acceptConfirm` times out finding the button.

### What actually shipped

- `e2e/admin-helpers.js` — exported `acceptConfirm(page, label)` and
  `dismissConfirm(page, label='Cancel')`. Both use
  `getByRole('dialog').last()` so they target the topmost modal when
  ConfirmDialog opens on top of an existing content modal (e.g. job
  detail → Withdraw → confirm).
- Swept 11 sites across 7 spec files: waitlist (3), notifications-gate
  (3), signup-flow (1), edge-cases (1), recurring (1), uat-ui M10 (1),
  crud cancel-path (1). Native-dialog handlers replaced with
  `acceptConfirm` / `dismissConfirm`.
- `uat-ui.spec.js` M10 now reads the warning copy via
  `dialog.innerText()` and matches `/public page/i` (was
  `/PUBLIC page/`), reflecting the Phase 2 lowercase + bolded copy.
- `crud.spec.js` cancel-path was passing for the wrong reason (the
  no-op native handler left the modal hanging; the delete never
  fired); now it genuinely clicks Cancel in the ConfirmDialog.

### Findings during the sweep

- `public-board.spec.js:52` is *not* a dialog issue — the test creates
  a new `[E2E] Public Visible` job and the public board doesn't show
  it within the 20s wait. Root cause: `getPublicJobs` Cloud Function
  has a 60s per-instance in-process cache (perf M-1 from the 2026-05-23
  audit-followup). The test was written before that cache landed.
  Fix is to either (a) bump the test's waitFor to 70s, (b) clear the
  cache between tests via a CF endpoint, or (c) hit Firestore directly
  to verify the docs exist with the right `status`. Tracked as a
  separate post-Layer-1.5 follow-up.

---

## Status

- Layer 2: **SHIPPED 2026-05-25** — `purgeE2EArtifacts()` in
  `e2e/admin-helpers.js` now calls `firestore.recursiveDelete()` on
  every `[E2E]`-filtered parent. Defensive cleanup against orphan
  subcollections from crashed runs.
- Layer 1.5: **SHIPPED 2026-05-25** — `acceptConfirm` /
  `dismissConfirm` helpers + sweep of 11 native-dialog sites + M10
  regex fix. Closed all 10 dialog-related failures. Suite went
  47/16/4 → 57/6/4.
- Layer 1: **SHIPPED 2026-05-25** — dedicated `e2e-test-church`
  tenant via `scripts/setup-e2e-tenant.mjs` (idempotent). Three test
  users moved into the new tenant; `jcvaught@gmail.com` retired from
  the suite (Member A is now `e2e-member-a@churchopshub.com`); FXCC
  no longer participates in E2E. Suite went 57/6/4 → 55/6/6 then
  closed 5 a11y failures via the contrast fix below; expected final
  state once Vercel deploys: 60/1/6 (only the public-board cache
  race remains).
- **Contrast bug discovered + fixed 2026-05-25:** with FXCC's data
  noise gone, the a11y axe scans surfaced a real WCAG-AA failure —
  `B.textLight (#6B7280)` on `B.warmGray (#F2F0EB)` is 4.24:1, just
  below the 4.5:1 threshold for normal-size text. Audit M8 had
  darkened textLight from `#8B93A1` → `#6B7280` for the white-bg
  case, but missed the warmGray combination. Fixed by darkening one
  more notch to `#5F6878` (now ~4.95:1 on warmGray, ~5.5:1 on
  cream/white). One-line change in `src/components/brand/tokens.js`.
- Public-board cache race: **deferred** — `getPublicJobs` 60s cache
  vs. fresh-seed test (see "Findings" above). One-line follow-up.
- Gold-plated ephemeral-tenant-per-run: still deferred per the
  earlier section. Layer 1's dedicated tenant + Layer 2's recursive
  purge cover ~95% of the benefit.

Updates to this plan get tracked here, not in CHANGELOG, until the
layers actually ship.
