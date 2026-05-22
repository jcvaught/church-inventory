# Jobs Hub roster refactor — status & pickup guide

_Last updated 2026-05-22. Companion to `docs/JOBS-HUB-AUDIT-2026-05-22.md`._

Remediation of the pre-launch audit's headline findings: the Jobs Hub roster
(signups/waitlist) was readable by any church member via raw SDK queries and
compliance was UI-only. This refactor moves the roster into protected per-uid
subcollections and routes all roster writes through compliance-enforcing Cloud
Functions.

## ▶ HOW TO RESUME

```bash
cd ~/apps/church-inventory
git checkout jobs-hub-roster-refactor      # all work is on this branch
```

- The branch is **7 commits ahead of `main`**; working tree clean.
- **Nothing is deployed. Production is 100% untouched.**
- Verification approach already decided: **staged production cutover with the
  E2E suite as the green/red gate** (the repo has no Firebase emulator
  configured; the E2E suite runs against prod). The two-phase migration makes
  the cutover reversible.
- Covers audit findings **H1, H2, H3, H4, M1** (+ M3/M4 fixed along the way).
  The 13 Medium / 9 Low findings are NOT in scope here — they're the triage
  backlog in the audit doc.

## New data model

- `jobListings/{id}` — keeps every field EXCEPT the `signups[]`/`waitlist[]`
  arrays; gains server-maintained integers `signupCount` / `waitlistCount`.
- `jobListings/{id}/signups/{uid}` — `{ uid, name, signedUpAt, attended?, acknowledgedWaiverAt? }`
- `jobListings/{id}/waitlist/{uid}` — `{ uid, name, addedAt, acknowledgedWaiverAt? }`
- All roster writes go through Cloud Functions (Admin SDK). A member reads only
  their own signup/waitlist doc (incl. via a collectionGroup query); admin and
  manager read the full roster.

## ✅ DONE — code-complete, committed, builds clean (0 lint errors)

- **H4** — `getPublicJobs` hardened (enumeration oracle closed, 200-row cap, `pay` coerce).
- **Cloud Functions** — `jobSignUp` / `jobWithdraw` / `jobSetAttendance` + rewritten
  `promoteFromWaitlist`: operate on the subcollections, maintain the counters,
  enforce compliance + waiver + capacity server-side (H2), promote inline (M3/M4).
- **Email functions** — `sendJobCancelledEmails` / `sendJobReminders` /
  `sendJobPosterNotification` read the subcollections / `signupCount`.
- **`firestore.rules`** — subcollection rules (own-doc + admin reads, CF-only
  writes), member parent-writes removed, `canUseJobsHub` gate (H3 subscription
  enforcement + M1 `allowedHubs` enforcement).
- **`firestore.indexes.json`** — collection-group indexes for `signups.uid` / `waitlist.uid`.
- **`useFirestore.js`** — signup/withdraw/attendance call the Cloud Functions;
  `addJobListing`/`addJobListingSeries` seed `signupCount`/`waitlistCount`.
- **`JobsPage.jsx`** — full refactor: counts from `signupCount`/`waitlistCount`;
  the member's own status from a `collectionGroup` subscription; the detail-modal
  roster fetched on open; the Reports leaderboard aggregates per-job signup
  fetches; signup passes `waiverAccepted`; attendance checks `{ updated }`.
- **`ical.js`** uses `signupCount`. `print.js` unchanged (gets a roster fetched
  at call time).
- **`scripts/migrate-job-signups.cjs`** — two-phase production data migration.
- **E2E** — `admin-helpers.js` has the new roster helpers; **all 11** Jobs Hub
  specs migrated to the roster subcollections (2026-05-22). `crud.spec.js`
  needed no change — it never touched the roster arrays. All 40 tests collect
  cleanly via `npx playwright test --list`.

## ✅ CUTOVER COMPLETE — 2026-05-22

The staged production cutover ran end-to-end; the E2E suite went green.

1. ✅ Merged `jobs-hub-roster-refactor` → `main` (8 commits).
2. ✅ Deployed functions / rules / indexes to `church-inventory-9615c`.
   New callables `jobSignUp` / `jobWithdraw` / `jobSetAttendance` created
   with `allUsers` invoker intact; webhooks probed (all healthy).
3. ✅ Migration phase 1 — no-op: **0 `jobListings` docs exist** across all
   3 churches (Jobs Hub is pre-launch with nothing posted).
4. ✅ Frontend deployed via Vercel.
5. ✅ E2E suite **GREEN — 40 passed, 0 failed, 1 skipped** (SMS gated).
6. ✅ Migration phase 2 (`--finalize`) — no-op (0 docs).
7. ✅ `twilioInbound` probed — `roles/run.invoker → allUsers` intact.

### Issues found by the cutover gate and fixed

- **CG indexes silently skipped.** `firebase deploy --only
  firestore:indexes` no-ops the `signups.uid` / `waitlist.uid`
  collection-group field-override indexes (documented CLI gotcha).
  Created directly via the Firestore Admin REST API
  (`PATCH …/collectionGroups/{cg}/fields/uid`).
- **`jobsRosterVisibility` broke for members.** The new subcollection
  rules were admin/manager-only, silently disabling the 'signups'/'all'
  member-visible modes the frontend still offered. Fixed: `firestore.rules`
  `canSeeJobRoster()` enforces the setting per-member (rule-enforced now,
  where the old gate was UI-only).
- **Roster-fetch effect missed a dep**, then a **null-deref crash.** The
  detail-roster effect gated on `canSeeRoster()` without it in deps;
  adding `rosterAllowed` exposed that `canSeeRoster(null)` (no modal open)
  throws. Both fixed in `JobsPage.jsx`.
- **Compliance E2E text** updated for the unified server-side error.

The launch stays gated on a green E2E run — which it now has.
