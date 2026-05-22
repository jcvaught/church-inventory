# Jobs Hub roster refactor — status & handoff (2026-05-22)

Companion to `docs/JOBS-HUB-AUDIT-2026-05-22.md`. Tracks the H1/H2/H3/M1
remediation: moving the signups/waitlist roster off the `jobListings` parent
doc (raw-SDK-readable by any church member — the audit's headline finding)
into protected per-uid subcollections, with all roster writes routed through
compliance-enforcing Cloud Functions.

Branch: **`jobs-hub-roster-refactor`** (commit `5feea68`). **Nothing is
deployed — production is untouched.**

## New data model

- `jobListings/{id}` — keeps every field EXCEPT the `signups[]`/`waitlist[]`
  arrays; gains server-maintained integers `signupCount` / `waitlistCount`.
- `jobListings/{id}/signups/{uid}` — `{ uid, name, signedUpAt, attended?, acknowledgedWaiverAt? }`
- `jobListings/{id}/waitlist/{uid}` — `{ uid, name, addedAt, acknowledgedWaiverAt? }`
- All roster writes go through Cloud Functions (Admin SDK). Members read only
  their own signup/waitlist doc; admin/manager read the full roster.

## ✅ DONE — server side (committed, syntax-clean)

- **H4** — `getPublicJobs` hardened (enumeration oracle, 200-row cap, `pay` coerce).
- **`jobSignUp` / `jobWithdraw` / `jobSetAttendance`** Cloud Functions + rewritten
  `promoteFromWaitlist` — operate on the subcollections, maintain the counters,
  enforce compliance + waiver + capacity server-side (H2), promote inline (M3/M4).
- **`sendJobCancelledEmails` / `sendJobReminders` / `sendJobPosterNotification`**
  updated to read the subcollections / `signupCount`.
- **`firestore.rules`** — subcollection rules (own-doc + admin reads, CF-only
  writes), member parent-writes removed, `canUseJobsHub` gate (H3 subscription
  enforcement + M1 `allowedHubs` enforcement).
- **`firestore.indexes.json`** — collection-group indexes for `signups.uid` /
  `waitlist.uid`.
- **`useFirestore.js`** — `signUpForJob` / `withdrawFromJob` /
  `updateJobSignupAttendance` now call the Cloud Functions; `spotsTotal`-reduction
  checks use `signupCount`.

## ⏳ REMAINING — frontend + cutover

**This part needs interactive testing (dev server running) before it cuts over
to a teen-facing launch — a subtle bug here blocks signups for real teens.**

1. **`src/pages/hubs/JobsPage.jsx`** (~20 sites):
   - Spot counts (`JobChip` ~45, `JobCalendar` mobile ~144, `SpotsBar` ~219,
     `MobileScheduleRow` ~336, `DesktopScheduleRow` ~361) → `job.signupCount || 0`.
   - Per-card / per-row roster *names* (`JobCard` ~278-281, `MobileScheduleRow`
     ~352, `DesktopScheduleRow` ~392) → names no longer live on the job; show
     count only on cards/rows, move the name roster into the detail modal,
     loaded on open via a `getDocs` on the job's `signups` subcollection
     (admin/manager only).
   - Waitlist count (`JobCard` ~289) → `job.waitlistCount || 0`.
   - `isSignedUp` / `isOnWaitlist` (~527-528) → a new `collectionGroup('signups')`
     / `collectionGroup('waitlist')` subscription `where('uid','==',userId)`,
     producing Sets of job ids. `isFull` (~529) → `signupCount >= spotsTotal`.
   - Signup handler (~823-854) → pass `waiverAccepted` + `jobNumber` to
     `signUpForJob`; the waiver should be an in-app Modal (audit L9), not
     `window.confirm`. Server now enforces compliance, so the client gate
     becomes UX-only.
   - Attendance handler (~916) → check the returned `{ updated }` and flash if
     `false` (audit M4).
   - Delete-confirm signup counts (~731, 747, 757, 776, 795) → `signupCount`.
   - Reports leaderboard (~551) → needs every job's signups; fetch per-job
     `signups` subcollections when the Reports tab opens and aggregate.
2. **`src/utils/ical.js`** (~91) and **`src/utils/print.js`** (~60, 66) — the
   roster export reads `job.signups`; pass the fetched roster in instead.
3. **Migration script** — `scripts/migrate-job-signups.cjs` (Admin SDK,
   `serviceAccountKey.json`). Two-phase: (a) for every `jobListings` doc, create
   `signups/{uid}` + `waitlist/{uid}` docs from the arrays and set
   `signupCount`/`waitlistCount`; (b) after verification, delete the legacy
   arrays. Two-phase so the cutover can roll back.
4. **E2E** — `e2e/admin-helpers.js` (`createJob` sets `signups:[]` — harmless,
   but seeding signups for tests must now write subcollection docs) and the
   specs that read/seed `signups`: `signup-flow`, `waitlist`, `attendance`,
   `compliance`, `roster-visibility`, `public-board`, `sms`.
5. **Verify** against the Firebase emulator (`firebase emulators:start`), then
   the **cutover**: deploy `functions` + `firestore:rules,indexes`, run the
   migration, deploy the frontend (Vercel), run the E2E suite as the gate.

## Recommendation

The remaining frontend is a focused mini-project (~1–2 days with the dev server
in the loop). It should be finished and tested deliberately — not rushed into
launch week untested. If the launch date is tight, the safest sequence is to
treat this branch as the immediate post-audit work item and give the cutover a
properly tested window.

---

## Update — feature refactor code-complete (2026-05-22, later)

The frontend is done and committed (branch tip `f83523c`): `JobsPage.jsx`,
`useFirestore.js`, `ical.js`, and the two-phase migration script
`scripts/migrate-job-signups.cjs`. Production build clean, **0 lint errors**.
`print.js` needed no change (it receives a roster fetched at call time).

**The entire feature refactor — H1 / H2 / H3 / H4 / M1 — is code-complete.**

Only verification remains. Two facts shape the path:
- The Playwright E2E suite runs against **production** — `firebase.json` has no
  emulator block, so a pure emulator-suite run is a separate infra build-out.
- ~11 E2E specs + `admin-helpers.js` still reference the old `signups[]` model
  and need updating to the subcollection model.

**Recommended path to "verified ready":** update the 11 E2E specs, then a
**staged production cutover** — deploy `functions` + `firestore:rules,indexes`,
run migration **phase 1** (backfill — additive, safe), deploy the frontend, run
the existing prod E2E suite. Green ⇒ run migration **phase 2** (drop legacy
arrays) ⇒ verified ready. Red ⇒ roll back (legacy arrays still present;
redeploy the prior functions/rules/frontend). The launch stays gated on that
green result — which is exactly the "won't launch until it's ready" posture.
