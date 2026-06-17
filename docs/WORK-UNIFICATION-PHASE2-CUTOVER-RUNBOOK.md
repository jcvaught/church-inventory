# Work-Unification Phase 2 — Cutover Runbook (Tasks + Maintenance → `workItems`)

**Purpose:** execute the read-path flip from the legacy `tasks` / `maintenanceTickets` collections to the unified `workItems` collection, for FXCC, with zero data loss and instant rollback.
**Companion docs:** `WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md` (§8.5 cutover, §13 dark/safe split), `PLATFORM-FOUNDATIONS-2026-06-06.md`.
**Code:** all on branch `phase2-readpath` (flag-gated, dark). **Target tenant:** FXCC = `6cksNI9Uv8h0jXptdTESnXTXFgF3-church`.

## Rehearsal baseline (proven in the emulator against a real FXCC copy — do not re-derive)
Dry-run = **117 work items (76 tasks + 41 maintenance) + 11 comments**. Execute wrote 117+11. `--verify` → `tasks ✓ 76/76 · maintenance ✓ 41/41 · orphans ✓ 0 · spot-check ✓ 0`, **exit 0**. Idempotent re-run wrote 0. Deleting a source doc made `--verify` report `orphans ✗ 1` / "do NOT flip" / **exit 2**. Live counts will differ (tenant grows); the *shape* of a healthy run is: every legacy doc has a typed twin, 0 orphans, 0 mismatches, exit 0.

---

## The core idea: almost everything is DARK and happens BEFORE the window
The flag `config/featureFlags.workItemsEnabled` is **off** for every church by default. With it off, the merged code reads legacy collections exactly as today. So deploying the code/rules/index and running the prod backfill are all **no-ops in user-visible terms** and can be done calmly, any time, ahead of the window. The Thursday window itself is only: **freeze → final re-migrate → verify → flip one flag → smoke-test → unfreeze.**

---

## Part A — Pre-window (safe, dark, do any time; NOT in the window)

- [ ] **A1. Merge `phase2-readpath` → `main`.** It's 0 behind main (rescued 2026-06-17) and verified (lint 0-err · build clean · `test:unit` 5/5 · `test:rules` 29/29). Vercel auto-deploys the flag-aware frontend on push; **flag off everywhere ⇒ no behavior change.**
- [ ] **A2. Deploy Cloud Functions** (flag-aware, dark): `firebase deploy --only functions`. Modified CFs: `sendTaskDueReminders`, `getAttentionDigest`, `icsCalendarFeed`, `generateRecurringTemplateTasks`.
- [ ] **A3. Re-probe Gen-2 invoker IAM** on those 4 CFs immediately after A2 (deploys can silently strip `allUsers/run.invoker` → 403). `icsCalendarFeed` (public `onRequest`) is the highest risk.
  - onCall probe: `curl -X POST <url> -H 'Content-Type: application/json' -d '{"data":{}}'` → **401 JSON = OK**, **403 text/html = stripped**.
  - Re-grant if stripped: `gcloud functions add-invoker-policy-binding <Fn> --region=us-central1 --project=church-inventory-9615c --member=allUsers`.
- [ ] **A4. Deploy Firestore rules** (adds the `featureFlags` read/write rule + the `workItems` task/maintenance rules): `./node_modules/.bin/firebase deploy --only firestore:rules,storage`. (Requires `firebase login`.)
- [ ] **A5. Confirm the `workItems.dueDate` COLLECTION_GROUP index is READY** — `sendTaskDueReminders` runs `collectionGroup('workItems').where('dueDate', …)`; if absent the hourly job throws `FAILED_PRECONDITION` and **all** task reminders stop. `firebase deploy --only firestore:indexes` **silently skips** CG field-overrides, so verify directly:
  - `gcloud firestore indexes fields list --collection-group=workItems` → must show a `COLLECTION_GROUP` entry for `dueDate`. It was created READY 2026-06-08; this is a re-confirm. If missing, create via the Admin REST API (see CLAUDE.md "firebase deploy … silently skips two index kinds", Case B).
- [ ] **A6. Prod backfill (dark) — `--execute --prod`:** `node scripts/migrate-work-unification.cjs --execute --prod`. Upsert-only, idempotent, never touches source collections. Then `node scripts/migrate-work-unification.cjs --verify` → **must be exit 0** (all ✓, 0 orphans).
- [ ] **A7. Sanity:** confirm `config/featureFlags.workItemsEnabled` is still **off/absent** for FXCC: `node scripts/set-work-flag.cjs --church=6cksNI9Uv8h0jXptdTESnXTXFgF3-church --status --prod`.

After Part A: prod has a full `workItems` mirror, all code/rules/index live, **and nothing has changed for users** (flag off).

---

## Part B — The window (Thursday evening; ~20 min)

**Timing:** Thursday evening is clear of all three reminder crons — `sendJobReminders` (church-local 8am), `sendNewJobsDigest` (local noon), `closePastJobs` (2am Central). Before starting, confirm **no job is scheduled for this evening or tomorrow morning** (don't disrupt a shift / its reminders).

- [ ] **B1. Raise the maintenance banner / freeze writes.** Settings → set `appConfig/banner` to the **maintenance** type (red, non-dismissible): *"ChurchOpsHub is updating — back in ~20 minutes. Finish your current edit and we'll be right back."* This is the write-freeze so no task/ticket edit can land mid-cutover.
- [ ] **B2. Final re-migrate (captures anything that landed since A6):** `node scripts/migrate-work-unification.cjs --execute --prod`. A clean re-run on a frozen tenant should write ~0 (only edits since A6).
- [ ] **B3. VERIFY — the go/no-go gate:** `node scripts/migrate-work-unification.cjs --verify`. **Exit 0 + all ✓ + 0 orphans ⇒ GO. Any ✗ / exit 2 ⇒ STOP, do NOT flip** (an orphan = a source doc deleted post-backfill; investigate before proceeding — flipping would resurrect it).
- [ ] **B4. Flip the flag for FXCC:** `node scripts/set-work-flag.cjs --church=6cksNI9Uv8h0jXptdTESnXTXFgF3-church --on --prod`. The frontend re-subscribes to `workItems` live (no deploy needed).
- [ ] **B5. Smoke-test (flag on):** load Tasks Hub (count matches), load Maintenance Hub (count matches), create one task → lands in `workItems` as `task_<id>` / `type:task`, post a comment, edit a status, confirm a task↔ticket/job link still resolves. Watch Sentry for `missingIndex:true` / `failed-precondition`.
- [ ] **B6. Lower the banner** (clear `appConfig/banner`). Window closed.

---

## Part C — Post-window

- [ ] **C1. Watch** Sentry + behavior for the rest of the day (the AI digest, ICS feed, and task due-reminders now read `workItems` for FXCC).
- [ ] **C2. Legacy stays read-only one full week** as the rollback escape hatch — do **not** delete `tasks` / `maintenanceTickets` yet.
- [ ] **C3. After a clean week:** delete the legacy collections, then in a follow-up PR remove the flag + the legacy read/write branches from `useFirestore.js` and the 4 CFs (collapse to `workItems`-only).
- [ ] **C4. Docs:** CHANGELOG entry (window executed), flip the backlog/CLAUDE Phase-2 status to shipped, add a `whatsNew.js` entry only if anything is user-visible (it shouldn't be — that's the point).

---

## Rollback (instant, at any point after B4)
`node scripts/set-work-flag.cjs --church=6cksNI9Uv8h0jXptdTESnXTXFgF3-church --off --prod` — the next snapshot re-subscribes to the legacy collections, which were never modified. No data migration to unwind. (If rolling back, also re-raise the banner briefly so the re-subscription settles cleanly.)

## Hard rules
- The migration **never writes source collections** and is upsert-only (no orphan pruning) — that's exactly why the **write-freeze (B1) before the final re-migrate (B2)** is mandatory: a delete landing between backfill and flip orphans its twin and the item resurrects after the flip. B3's `--verify` is the backstop that catches it.
- Writing prod requires **both** `--execute --prod` (migration) / `--on --prod` (flag). An emulator-intended run that forgets `FIRESTORE_EMULATOR_HOST` refuses to touch prod.
- **Tasks first. Jobs (Phase 3) is a separate, later window** — and per decision #7 it's a UI/navigation unification, not a data migration (jobs stays its own collection).
