# ChurchOpsHub — Local Testing & Safe-Revert Runbook

**Drafted:** 2026-06-06
**Status:** PROCESS SPEC — how to build, test locally, and stay revertable for the unification + foundations work. Some of this is **setup we don't have yet** (emulators, scheduled backups) and is flagged as such.
**Companion docs:** `PLATFORM-FOUNDATIONS-2026-06-06.md`, `WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md`.

The risky work (live Tasks/Jobs migration, billing changes, foundation refactors) must be **testable end-to-end locally before prod**, and **every change must be revertable**. This doc defines both.

---

## Current reality (what we're improving on)

- **One Firebase project: `church-inventory-9615c` (prod).** No staging project today.
- **Deploy:** Vercel auto-deploys on push to `main`. Firestore rules/indexes + Cloud Functions deploy via the `firebase` CLI.
- **Tests:** the Playwright E2E suite runs **against PROD**, isolated to a dedicated `e2e-test-church` tenant. Good for regression, **not safe for destructive schema migrations.**
- **No Firebase emulator usage today** (MasteryHelp uses emulators; COH doesn't yet).
- **No documented scheduled Firestore backups** (there's a billing-budget TODO, nothing on data backup).

The four upgrades below close those gaps.

---

## Principles (build so revert is always cheap)

1. **Additive-first.** New collections (`workItems`, `timeEntries`, `notifications`), never destructive mutation of `tasks`/`jobListings`. Old data stays intact and readable so a read-path flip-back is the rollback.
2. **Dark launch behind feature flags.** Risky UI/behavior ships **off**, enabled per-tenant (FXCC first). Reverting a misbehaving feature is flipping a flag, not redeploying.
3. **Migrations are idempotent + dry-runnable.** Every migration script supports `--dry-run` and can be re-run safely. Old collections kept **read-only for one full release** before deletion.
4. **Nothing risky touches prod until it's green locally** (emulator) and, for migrations, green against a **prod-data copy**.

---

## A. Local development with the Firebase Emulator Suite *(to set up)*

Run Firestore + Auth + Functions + Storage entirely locally — test rules, functions, and data flows with zero prod impact.

**Setup:**
1. Add an `emulators` block to `firebase.json` (firestore, auth, functions, storage, ui).
2. Gate `src/firebase.js` to connect to emulators when a flag is set:
   ```js
   if (import.meta.env.VITE_USE_EMULATORS === 'true') {
     connectFirestoreEmulator(db, 'localhost', 8080);
     connectAuthEmulator(auth, 'http://localhost:9099');
     connectFunctionsEmulator(functions, 'localhost', 5001);
     connectStorageEmulator(storage, 'localhost', 9199);
   }
   ```
3. Run: `firebase emulators:start --import=./.emulator-data --export-on-exit` (persists local data between runs).
4. Run the app against it: `VITE_USE_EMULATORS=true npm run dev`.

**External-service caveats** (the emulator can't fully simulate these — stub or use test mode):
- **Stripe** → use Stripe **test mode** keys; forward webhooks locally with `stripe listen --forward-to localhost:5001/<project>/us-central1/stripeWebhook`.
- **Brevo (email)** / **Twilio (SMS)** → use test creds or a `DRY_RUN_NOTIFICATIONS` env that makes the notify-layer log instead of send. (Build this no-op switch into Foundation 3 from the start — it doubles as the emulator-safe mode.)
- **FCM push** → test on a real device/build; emulator can't deliver push.

**Why this is the foundation of "test before prod":** every Foundation (notify, attention, people, occurrences) and every meantime feature gets built and exercised here first. The migration scripts get proven here against real data (§B) before any prod window.

---

## B. Testing the migration against a copy of prod data

The migration (Tasks/Jobs → `workItems`) is the highest-risk change. Prove it on **real data, locally**, before the Thursday window.

**Recommended path (uses existing tooling):**
1. **Export one tenant** with an Admin SDK script (`scripts/serviceAccountKey.json` already exists; admin scripts already used for E2E seeding): dump a church's `tasks`/`maintenanceTickets`/`jobListings` (+ subcollections) to JSON. Sanitize if needed.
2. **Seed the emulator** from that JSON (`scripts/seed-emulator.cjs`).
3. **Dry-run the migration** (`node scripts/migrate-work-unification.cjs --dry-run`) → review the diff/counts.
4. **Run it for real against the emulator** → verify counts match, numbering counters carried, subcollections (comments/signups/waitlist) intact, no orphans.
5. **Point the app at the emulator and run the E2E suite** against the migrated shape → must be green.
6. Only then schedule the prod window (migration plan §8.5).

**Full-backup path (alternative / belt-and-suspenders):** `gcloud firestore export gs://<backup-bucket>` then import into the emulator — note the managed-export vs. emulator-import formats can need a conversion step; **verify the round-trip once** before relying on it. The Admin-SDK-per-tenant path above avoids this and is the primary recommendation.

---

## C. Staging option *(recommended for the migration era)*

The emulator is great for logic but isn't a real shared URL. For "test the actual deployed thing before prod," stand up a **second Firebase project** (e.g. `church-inventory-staging`) and a **Vercel preview** that points at it:

- Make Firebase config env-driven (today it's hardcoded in `src/firebase.js`) so preview builds use the staging project and prod uses prod. (Memory `reference_vercel_env_via_cli`: set Vercel env via CLI; preview env needs `git_branch_required`.)
- Seed staging with a sanitized prod-like dataset.
- Deploy migration + foundations to staging first; smoke-test; then prod.

This is more setup than the emulator and is **optional** — the emulator + prod-data-copy (§A/§B) covers most of the safety. Stand up staging if/when the emulator's "not a real URL" limitation actually bites (e.g. testing push, custom-domain auth, or webhooks end-to-end).

---

## D. Backups *(set up before the first migration)*

1. **Before every migration window: a manual full export.** `gcloud firestore export gs://<backup-bucket> --project=church-inventory-9615c`. This is the ultimate revert — restore with `gcloud firestore import` if anything catastrophic happens.
2. **Scheduled daily exports** (recommended, currently missing): a scheduled job (Cloud Scheduler → export, or a `withScheduledRun`-wrapped function) writing daily to the backup bucket with lifecycle expiry (e.g. keep 30 days). Cheap insurance for a multi-tenant app holding other churches' data.

---

## E. Feature flags *(build early — they power both dark-launch and instant revert)*

A lightweight flag layer makes risky things **enable-per-tenant** and **instantly revertable without a deploy**.

- **Where:** a per-church `config/featureFlags` doc (and/or an owner-only global flags doc), read into app state alongside `config/settings`.
- **Pattern:** new surfaces (unified Work UI, notification center, AI digest) render behind a flag, default **off**. Enable at **FXCC first**, watch, then roll out per tenant. If a feature misbehaves in prod, **flip the flag off** — instant revert, no redeploy, no data change.
- **Server-side too:** gate new Cloud Function behaviors on the same flag so a flagged-off feature can't fire notifications/writes.
- This is the safest way to "test in prod" — a real tenant (FXCC), real data, but contained and reversible by one toggle.

---

## F. Revert runbook (per layer)

When something goes wrong, this is how each layer rolls back:

| Layer | Revert |
|---|---|
| **Feature behavior** | Flip its `config/featureFlags` flag **off** — instant, no deploy (§E). First resort. |
| **Frontend (Vercel)** | Vercel keeps every deployment immutable → **promote the previous deployment to production** (Vercel dashboard "Promote to Production", or `vercel rollback`). Instant. |
| **Code (git)** | `git revert <sha>` → push → Vercel redeploys the reverted build. |
| **Firestore rules** | Redeploy prior rules from the reverted commit: `firebase deploy --only firestore:rules`. (Rules are versioned in git — keep it that way.) |
| **Cloud Functions** | **No native one-click rollback.** Redeploy prior code from the reverted commit: `firebase deploy --only functions:<name>`. Then **curl-probe the function** — Gen-2 redeploys can strip the `allUsers` invoker IAM (documented pitfall). |
| **Migrated data** | Migrations are **additive** → revert is **flipping the app's read-path back to the old collections** (which were kept read-only, untouched). The new `workItems` data is simply ignored. |
| **Catastrophic data loss** | `gcloud firestore import` from the pre-migration export (§D). Last resort. |

**Migration-phase rollback checklist (P2/P3):**
1. Flip the read-path flag back to old collections (app reads `tasks`/`jobListings` again).
2. Confirm staff see their in-progress work intact (it never moved — old collections are the source of truth until the flag is flipped forward and verified).
3. Investigate `workItems` in the emulator, not prod.
4. Re-attempt only after a clean local re-run (§B).

---

## G. The pre-prod gate (checklist before ANY prod deploy or migration)

- [ ] Green locally against the **emulator** (`VITE_USE_EMULATORS=true`).
- [ ] For migrations: dry-run + real run + **E2E green against a prod-data copy** in the emulator (§B).
- [ ] New/changed Firestore queries have their **composite + collection-group indexes** created and **prod-probed** (the CLI silently skips two index kinds; `missingIndex:true` Sentry tag is the backstop).
- [ ] Risky surface is **behind a feature flag**, default off, ready to enable FXCC-first.
- [ ] For migrations: **manual `gcloud firestore export`** taken (§D).
- [ ] Revert path for this change identified in §F.
- [ ] For migration windows: scheduled for **Thursday evening**, clear of the reminder crons and any live shift (migration plan §8.5).
- [ ] Cloud Functions touched? Plan to **curl-probe** each after deploy (IAM-strip pitfall).

If any box is unchecked, it doesn't go to prod.
