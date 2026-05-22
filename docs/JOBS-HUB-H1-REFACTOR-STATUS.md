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

## ⏳ REMAINING

### 1. Staged production cutover (CHECKPOINT WITH THE USER FIRST)

1. Merge `jobs-hub-roster-refactor` → `main`.
2. `./node_modules/.bin/firebase deploy --only functions,firestore:rules,firestore:indexes`
   (verify `firebase use` is `church-inventory-9615c` first).
3. **Migration phase 1** — `node scripts/migrate-job-signups.cjs` (backfill;
   purely additive, leaves the legacy arrays in place).
4. Frontend auto-deploys via Vercel on the push to `main`.
5. Run the E2E suite: `E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e`.
6. **Green** → **migration phase 2** — `node scripts/migrate-job-signups.cjs --finalize`
   (drops the legacy arrays) → verified ready.
   **Red** → roll back (redeploy prior functions/rules + revert frontend; the
   legacy arrays are still present so the old code works).
7. Curl-probe `twilioInbound` + any webhook for the `allUsers` invoker (the
   documented Gen-2 IAM-strip gotcha).

Then it's launch-ready. The launch stays gated on a green E2E run.
