# CLAUDE.md — e2e/

Loads only when working under `e2e/`. Moved here from the root CLAUDE.md (2026-10-12) to keep
the always-loaded file small. Root-level rules and Known Pitfalls still apply.

## E2E test suite

Playwright suite at `e2e/` mirrors the Court Climber pattern (Firebase v12 IndexedDB auth state per role, per-spec teardown via Admin SDK, three roles: admin / member-a / member-b). 67 tests covering every section of `docs/TEST-JOBS-HUB-2026-05-07.md` (§2–§11), the 2026-05-22 audit-fix verification specs (`audit-rules.spec.js`, `audit-ui.spec.js` — T1–T8), and the 2026-05-22 UAT automation (`uat-ui.spec.js` — M13 time/tooltip, M10 PII warning + share-confirm, L9 waiver Modal gating, M8 contrast, L8 aria; `uat-sms.spec.js` — M6 STOP/START + recycled-phone protection). Runs against PROD against a dedicated `e2e-test-church` tenant (E2E isolation Layer 1, 2026-05-26); cleans up after itself via `purgeE2EArtifacts()` which now uses `firestore.recursiveDelete()` so `jobListings/{id}/signups` and `…/waitlist` subcollections get reaped along with the parent. Last clean run 2026-05-26: 60 passed, 0 failed, 7 skipped (~2.5 min; skips = SMS smoke + UAT SMS gated, L9 owner-tab gated to jcvaught@, public-board gated on getPublicJobs cache race, plus standard baseline skips). Phase 2's `ConfirmDialog` migration broke the old `page.once('dialog', d => d.accept())` pattern — use `acceptConfirm(page, label)` / `dismissConfirm(page, label)` from `e2e/admin-helpers.js` instead; both use `getByRole('dialog').last()` to target the topmost modal when ConfirmDialog stacks on top of a content modal. Rule-rejection tests use a pure-Node client SDK in `e2e/client-helpers.js` (Firestore rules enforce equally in Node and browser); the UAT SMS spec uses `e2e/sms-helpers.js` to sign requests with `TWILIO_AUTH_TOKEN` from `functions/.env` and POST to the live `twilioInbound` endpoint. Admin SDK in `e2e/admin-helpers.js` is for seeding/cleanup only.

**activityLog schema for E2E assertions:** docs are `{ action, itemId, performedBy, performedByName, timestamp, details }` (see `useFirestore.js:394` `logActivity`). When asserting log entries, query `where('action', '==', '...')` and filter on `itemId` — *not* `kind`/`target` (a bug that landed in `crud.spec.js` because it was committed without an end-to-end run). `logActivity` fires async after the mutation it follows, so wrap log assertions in `expect.poll`.

```bash
# Full suite (~80s)
E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e

# SMS smoke test — gated; sends a real SMS via Twilio
E2E_RUN_SMS=1 E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e -- sms
```

Test accounts (all in the dedicated `e2e-test-church` tenant — Layer 1, 2026-05-26): `e2e-admin@churchopshub.com` / `E2eTestPass123!` (admin), `e2e-member-a@churchopshub.com` / `E2eTestPass123!` (Member A), `e2e-member-b@churchopshub.com` / `E2eTestPass123!` (Member B). All managed via Admin SDK; `scripts/serviceAccountKey.json` holds the credentials. Tenant is bootstrapped by `scripts/setup-e2e-tenant.mjs` (idempotent — re-run to repair drift; mints any missing Auth user, writes church + config docs with `grandfathered: true` so every hub unlocks without Stripe, deletes `allowedHubs` field on user docs since `firestore.rules:34` treats field-missing as "full hub access" but field-present-with-null as "no hubs"). `src/utils/testAccounts.js` (`excludeTestAccounts`, matches the `@churchopshub.com` domain) still filters these out of member-facing pickers + the billable seat count for any real church; do not surface test accounts in UI lists. `jcvaught@gmail.com` was retired from the suite 2026-05-26 — still a real FXCC member, just no longer driven by tests. One follow-up: L9 owner-tab test is skipped because its owner gate at `SettingsPage.jsx:130` is hardcoded to `['jcvaught@gmail.com', 'jvaught@fxcc.org']`; adding `e2e-member-a@churchopshub.com` to that allowlist would let anyone register that Firebase Auth email and claim owner privileges in real customer churches.

When the E2E suite mysteriously fails at the auth-setup step with "Failed to verify your browser / Code 21," Vercel's bot protection has flagged the headless browser. `playwright.config.js` sets a realistic Chrome User-Agent to minimize this; if it still trips, wait ~5 min and retry.
