# CHANGELOG.md

Archive of completed phases, resolved checklist items, and fixed issues. Moved here from CLAUDE.md to keep active guidance concise.

---

## 2026-05-22 — Jobs Hub audit verification (Part 2) — UAT automation, 11 more tests

Most of `JOBS-HUB-AUDIT-VERIFICATION-PLAN.md` Part 2 turned out to be
automatable; pulled them off the human-checklist into Playwright.

**`e2e/authenticated/uat-ui.spec.js` (8 new tests)** —
- M13 — job detail formats `scheduledTime: '14:30'` as `2:30 PM`.
- M13 — Schedule status badge carries `title="Open — accepting signups"` and
  `aria-label="Status: Open — accepting signups"`.
- M10 — Post Job modal shows the public-PII warning text.
- M10 — `Share Board` click fires `window.confirm` with the multi-line
  public-warning text; dismissing it does NOT copy.
- L9 — Waiver Modal: `Agree & Sign Up` is disabled until "I have read and
  agree" is checked; Cancel = no signup.
- M8 — `B.textLight` resolves to `rgb(107, 114, 128)` (`#6B7280`) — WCAG AA.
- L8 — Recurring 🔁 chip exposes `aria-label="Recurring series"`.
- L9 — Owner Email tab (gated to `jcvaught@gmail.com` / `jvaught@fxcc.org`)
  loads the suppressions panel for the Member A fixture.

**`e2e/authenticated/uat-sms.spec.js` (3 new tests, gated `E2E_RUN_UAT_SMS=1`)** —
Signs Twilio webhook calls with `TWILIO_AUTH_TOKEN` from `functions/.env`
(HMAC-SHA1(URL + sorted-key concat), base64) and POSTs to the live
`twilioInbound` Cloud Function. Each test seeds + cleans up a synthetic
user doc in the unallocated `+1 555 555 01xx` NANP test range.
- M6 — STOP on a phone with prior consent flips `smsRemindersEnabled` to
  false.
- M6 — START on the same phone re-opts back to true.
- M6 — **critical safety**: START on a phone with NO `smsConsentAt` does
  NOT enable reminders and does NOT backfill consent (the
  recycled/family-shared-number protection).

`e2e/sms-helpers.js` (new) parses `functions/.env` for the auth token and
implements the Twilio signing algorithm + a thin `fetch` wrapper.

**Result:** standard suite **56 passed / 4 skipped / 0 failed** (~2.2 min).
UAT SMS gated run **3 passed** (~11s). Audit verification effectively closed
beyond the items that intrinsically need a real device or a wait for a
scheduled CF run (L7 PWA install, L8 actual screen-reader speech, M12 / L1 /
L3 next-run log spot-checks, eyeballs-on aesthetic judgment).

---

## 2026-05-22 — Jobs Hub audit verification (Part 1) — 8 E2E tests added

Closed the test-coverage gap on the 19 audit fixes shipped earlier today. Plan:
`docs/JOBS-HUB-AUDIT-VERIFICATION-PLAN.md` Part 1 (Part 2 is a separate manual
UAT checklist for the user on real devices). All 8 added tests passed first
run; suite is **48 passed / 1 skipped / 0 failed (~2.4 min)**.

**New harness — `e2e/client-helpers.js`.** A Node-side Firebase **client** SDK
(named app `e2e-client`), separate from the Admin SDK in `admin-helpers.js`.
Firestore rules are enforced for the client SDK regardless of whether it runs
in a browser or Node, so the rule-rejection tests are pure Node — no
Playwright browser, no app-side hook. Provides `signInAsClient(role)` /
`signOutClient()`, the client `db`, the firestore primitives the specs use,
`callGetPublicJobs(churchId)`, and `expectRejected(promise)`.

**`e2e/authenticated/audit-rules.spec.js` (new) — T1–T4.**
- T1 (M7) — admin updating `jobAnnouncements.createdBy`/`createdByName` is
  rejected with `permission-denied`; control body-only edit succeeds.
- T2 (L6) — unauthenticated `publicRequests.create` rejected for an
  extra/disallowed key, `itemDescription > 2000` chars, or missing `name`;
  control (10-key valid submission) succeeds and is admin-deleted in
  `afterAll` (not covered by `purgeE2EArtifacts`).
- T3 (L4) — member-A creating a `jobSwapRequests` doc with a spoofed name,
  `note > 1000` chars, or an extra key is rejected.
- T4 (M10) — `getPublicJobs` truncates `description` to 280 + `…` (length
  ≤ 281) and `location` to 160 + `…` (length ≤ 161).

**`e2e/authenticated/audit-ui.spec.js` (new) — T5–T8.**
- T5 (M13) — a job card with `requiredAccessTypes: ['background_check']`
  shows the `Background Check required` badge.
- T6 (M13) — the Schedule row's status badge reads `Open` (capitalized) —
  guards `JobStatusBadge` reuse in `DesktopScheduleRow`.
- T7 (M9) — opening a recurring job's detail modal shows a `Danger zone`
  label with the `Delete`, `Delete This + Future`, `Delete Series` buttons
  grouped separately from `Edit`.
- T8 (L9) — the Post Job modal's `Recurring series 🔁` section previews the
  count (`This will create N jobs.`) **and** real dates (a month
  abbreviation is present in the preview text).

**Lint:** 0 errors, 45 warnings (the documented exhaustive-deps baseline).

**Followup — not in this commit:** Part 2 manual UAT (M8 contrast, M9 touch
targets on phone, M13 clarity walk-through, L7 PWA icon, L8 screen-reader
labels, L9 waiver Modal, M10 PII warnings, **M6 SMS STOP/START** incl. the
never-opted-in case, M2 dedup, the M12/L1/L3 background-job log spot-checks).
Handed back to the user to tick off on real devices.

---

## 2026-05-22 — Jobs Hub audit backlog cleared (10 Medium + 9 Low + decision D1)

With the audit's High tier already shipped, this pass closed the remaining
triage backlog from `docs/JOBS-HUB-AUDIT-2026-05-22.md`. Shipped across three
deploy surfaces; the E2E suite (40 passed / 1 skipped) gated each one.

**Product decision D1 — accepted, no code.** The `manager` role keeps full Jobs
Hub access identical to `admin` (volunteer leaderboard + signup rosters). This
is intended — managers help run jobs. UI↔rules are already consistent.

**`firestore.rules`** — M5: explicit deny rule for the (unused) `errors`
collection so a future need is a deliberate change, not a default. M7:
`jobAnnouncements` update now blocks edits to `createdBy`/`createdByName`/
`createdAt` (mirrors the hardened `jobListings` rule). L6: `publicRequests`
create bounded by an exact key allowlist + length caps (was `if true`). L4:
`jobSwapRequests` create pins `uid` and `name` (to the caller's own user-doc
name, via the already-budgeted `userData()` get), caps `note` at 1000 chars,
and allowlists keys. `lastSmsReminderSentDate` added to the `jobListings`
update denylist.

**Cloud Functions** — M2: `sendJobReminders` email and SMS are now idempotent
on separate stamps (`lastReminderSentDate` / `lastSmsReminderSentDate`) so a
crash mid-channel can neither drop nor double-send the other. M6: `twilioInbound`
START re-opt-in now only revives accounts carrying an `smsConsentAt` consent
record (STOP still suppresses all phone matches — over-suppression is the safe
direction); prevents a recycled/family number re-opting-in a non-consenter. A
one-time backfill (`scripts/backfill-sms-consent.cjs`) stamped `smsConsentAt`
on the 4 already-opted-in users. M10: `getPublicJobs` caps `title`/`description`/
`location` length on the public payload; the Job modal and Share Board now warn
that those fields are public. M12: `sendTaskDueReminders` collection-group scan
gained a 90-day `dueDate` floor + `.limit(5000)`. L1: `closePastJobs`
subscription-agnostic behaviour documented as intentional. L2: explicit
`invoker:'public'` on `twilioInbound` and `stripeWebhook` (pins the `allUsers`
IAM against Gen-2 redeploy stripping). L3: `sendJobCancelledEmails` no longer
swallows its stamp-write error. L5: `promoteFromWaitlist` callable gated on
admin/manager role. New owner-only callable `setEmailSuppressionActive` backs
the L9 email-suppression UI. Webhooks curl-probed post-deploy — IAM intact.

**Frontend + static** — M8: `textLight` token darkened `#8B93A1`→`#6B7280`
(WCAG-AA). M9: the job-detail admin action row splits destructive buttons
(Delete / Delete This+Future / Delete Series) into a divided "Danger zone" row
so they can't be mis-tapped next to Edit. M11: `robots.txt` disallows `/?jobs=`.
M13: detail-modal time formatted, roster-fetch failure shows a distinct error
(was indistinguishable from an empty roster), `JobStatusBadge` carries a
status-meaning title/aria-label and is reused in the schedule rows (no more raw
lowercase pills), `requiredAccessTypes` shown as a 🔒 badge on the job card.
L7: PWA icons regenerated full-bleed (valid maskable safe-zone). L8: icon-only
🔁 chip + export/print buttons given `aria-label`s. L9: waiver consent is now a
real Modal + checkbox (not `window.confirm`), recurring-series setup previews
the actual dates, the `<tr role="button">` schedule row replaced with proper
row semantics + an in-cell `<button>`, and an owner-only Email-suppression
management tab (list + re-subscribe) added to Settings.

Build clean (0 jsxDEV), lint 0 errors (45 baseline warnings).

## 2026-05-22 — Jobs Hub roster refactor: production cutover (audit H1/H2/H3/H4/M1)

Shipped the `jobs-hub-roster-refactor` branch to production. The Jobs Hub roster (signups/waitlist) moved off the member-readable parent-doc arrays into protected per-uid subcollections (`jobListings/{id}/signups/{uid}`, `…/waitlist/{uid}`), with server-maintained `signupCount` / `waitlistCount` integers on the parent. All roster writes now route through compliance-enforcing Cloud Functions — new callables `jobSignUp` / `jobWithdraw` / `jobSetAttendance` (Admin SDK; enforce compliance + waiver + capacity server-side, promote the waitlist inline). Closes audit findings H1 (roster readable by any member via raw SDK), H2 (UI-only compliance), H3/M1 (hub-access gating in rules), H4 (`getPublicJobs` hardening).

Cutover ran the documented staged plan: merge → deploy functions/rules/indexes → migration phase 1 → frontend deploy → E2E gate → migration phase 2. Migration was a no-op both phases — **0 `jobListings` docs exist** (Jobs Hub is pre-launch). Final E2E: **40 passed, 1 skipped, 0 failed.**

Four issues the E2E cutover gate caught and fixed:
- **Collection-group indexes silently skipped.** `firebase deploy --only firestore:indexes` no-ops the `signups.uid` / `waitlist.uid` field-override CG indexes (known CLI gotcha — see `feedback_firebase_collection_index`). The frontend's "am I signed up" `collectionGroup` subscription failed without them. Created directly via the Firestore Admin REST API: `PATCH https://firestore.googleapis.com/v1/projects/church-inventory-9615c/databases/(default)/collectionGroups/{signups|waitlist}/fields/uid?updateMask=indexConfig` with a `COLLECTION_GROUP` index in the body. `gcloud firestore indexes fields update` cannot do this — its `--index` flag has no query-scope key.
- **`jobsRosterVisibility` broke for regular members.** The new subcollection rules were admin/manager-only, silently disabling the `'signups'`/`'all'` member-visible modes the frontend still offered. Fixed in `firestore.rules`: new `canSeeJobRoster(churchId, jobId)` helper enforces the setting per-member — a member reads a job's roster when visibility is `'all'`, or `'signups'` and they have their own `signups/{uid}` doc. The setting is now a real rule-enforced boundary (the old gate was UI-only — that was H1 itself).
- **Roster-fetch effect dependency + crash.** `JobsPage` detail-roster `useEffect` gated on `canSeeRoster()` without it in deps (a late `mySignups` subscription never re-triggered the fetch in `'signups'` mode). Adding `rosterAllowed` to deps exposed that `canSeeRoster(liveDetail)` runs every render and `canSeeRoster(null)` → `isSignedUp(null)` → `null._docId` threw, crashing the whole hub into `ChunkErrorBoundary`. Both fixed: `rosterAllowed` guards on `liveDetail`; `isSignedUp`/`isOnWaitlist` hardened against a null job.
- **Compliance E2E assertions** updated — compliance is now enforced server-side in `jobSignUp` with one unified error (*"This job requires a valid `<type>` on file. Ask an admin to add yours under People Access."*); the 3 block-tests asserted stale client-side wording.

All 11 Jobs Hub E2E specs migrated to roster-subcollection seeding/assertion helpers (`seedSignup` / `seedWaitlistEntry` / `getJobSignups` / `getJobWaitlist` in `admin-helpers.js`).

## 2026-05-22 — SMS outbound switched to the A2P Messaging Service

The A2P 10DLC campaign `CYO5934` (on Messaging Service `MGb4f2156d4ab3104ee564f15cb701d81d`) is **VERIFIED** — brand approved, sending number `+15715407100` attached to the service, `errors: []`. With the campaign live, an audit of the Jobs Hub texting path found the one remaining gap: `sendJobReminders` still sent outbound SMS via the bare `from` number (`messages.create({ from: TWILIO_FROM, … })`), which is not the A2P-compliant route — A2P traffic must go through the registered Messaging Service or it risks carrier filtering / error 30034.

Fix:
- Added `TWILIO_MESSAGING_SERVICE_SID=MGb4f2156d4ab3104ee564f15cb701d81d` to `functions/.env`.
- New module constant `TWILIO_MSID`; `sendJobReminders` now builds a `sender` of `{ messagingServiceSid }` when `TWILIO_MSID` is set, falling back to `{ from: TWILIO_FROM }` only if unset. The send guard widened to `tw && (TWILIO_MSID || TWILIO_FROM)`.
- Refreshed the stale `twilioInbound` header comment (the number is no longer "not attached to a Messaging Service" — it is, and outbound routes through it; the HELP/INFO branch stays as a harmless backstop).

`node -c` clean. Deployed `functions:sendJobReminders` to `church-inventory-9615c` (scheduled function — no `allUsers` invoker concern). The rest of the texting path was audited and confirmed sound: opt-in UI gated on email verification with E.164 normalization, consent stored as `users/{uid}.phone` + `smsRemindersEnabled`, the cron's per-user consent/active/hub-access guards, and `twilioInbound`'s STOP/START/HELP handling (probed live — reachable, IAM intact, signature validation working).

**Live delivery VERIFIED 2026-05-22.** SMS test user set up: `e2e-member-b@churchopshub.com` now carries `phone: +14122665015` + `smsRemindersEnabled: true` (`allowedHubs: ['jobs']`, active — fully eligible for `sendJobReminders`). A test message sent through the registered Messaging Service (`MGb4f2156d…`, SID `SMb68e0bd1…`) went `accepted → delivered` with no error code, and was confirmed received on the physical handset. `sms.spec.js` default `E2E_SMS_TARGET_EMAIL` repointed from `jvaught@fxcc.org` to `e2e-member-b@churchopshub.com` so the gated smoke test is self-contained on a designated test account. The Jobs Hub texting feature is fully verified end-to-end.

---

## 2026-05-21 — Supplies Hub: location filter + alphabetical sort

User feedback (Haleigh Watson) for the Supplies side: sort alphabetically and filter by location. `SuppliesPage.jsx` search card now has a location `<select>` (All locations + church locations from settings) and a sort `<select>` (Default / Name A–Z / Name Z–A). Both persist to `localStorage` (`sup_locationFilter`, `sup_sortBy`), mirroring the Items page filter-persistence pattern. Filter applied in the `filtered` `useMemo`; sort runs in-place on the filtered array via `localeCompare`.

---

## 2026-05-19 — A2P campaign resubmitted: public CTA screenshot + 4-field Console fix

Campaign `CM57da3c4d828884b7d8a66f30ac1955b7` resolved from 5/14 IN_PROGRESS limbo to terminal **FAILED** with **two** errors: **30921** (USE_CASE_DESCRIPTION — *"website requires authentication and cannot be reviewed"*) + **30909** (MESSAGE_FLOW — CTA can't be verified). Root cause: the registered Campaign description + message_flow led with *"authenticated web application"* and a *"TEST CREDENTIALS … OPT-IN STEPS after signing in"* block, the public `/sms-program` page only described the opt-in in prose (no visual), and Privacy/Terms URL fields on the campaign were **empty** (gray placeholder). Triple-gated in-app form (login → email-verified → Jobs Hub access) means a reviewer logging in still couldn't see the CTA.

Fix in two parts:

**Code (commit `2166b8c`, `src/pages/PublicSMSProgramPage.jsx`):** added `OptInFormScreenshot` — a faithful no-login visual reproduction of the exact Settings → My Profile → "SMS Job Reminders" consent form (heading, sub-text, phone field, unchecked checkbox, Save, verbatim disclosure), mirroring `SettingsPage.jsx` ~454-512. Prerendered into `dist/sms-program/index.html` so reviewers/bots get the CTA on first byte. Verified rendering via Playwright at `https://churchopshub.com/sms-program` (curl is firewall-blocked → `x-vercel-mitigated: deny`; **use a real browser to verify this page, not curl**).

**Console "Fix Campaign" (4 fields, no fees, same Campaign SID + MS + Brand):**
1. **Campaign description** rewritten to reference the public no-login URL (clears 30921 / USE_CASE_DESCRIPTION).
2. **"How do end-users consent to receive messages?"** rewritten — no test credentials, no "sign in" instructions, leads with the public URL + screenshot reference (clears 30909 / MESSAGE_FLOW).
3. **Privacy Policy URL** filled with `https://churchopshub.com/privacy` (was empty — a structured rejection vector, not just cosmetic).
4. **Terms and Conditions URL** filled with `https://churchopshub.com/terms` (was empty).

Sample messages, opt-in/opt-out keywords & messages, embedded-link/phone/age-gated/direct-lending flags all left **untouched** at parity with the prior submission.

Post-submit state: Console shows "In progress / under review"; API `GET .../Compliance/Usa2p` confirms `campaign_status: IN_PROGRESS` with the new description + message_flow stored. **Quirk:** unlike a 5/14-style API DELETE+POST resubmit, the Console "Fix Campaign" path does **not** immediately clear `errors[]` or advance `date_updated` on the Compliance API view — those refresh when TCR completes the new review. Console UI banner is the source of truth post-submit.

**Confirmed dead end:** the simplified Messaging Compliance API (`/v1/Services/{MS}/Compliance/Usa2p`) is **create-only** — `DELETE` → HTTP 405, `POST` over existing → HTTP 409. Earlier memory claiming a DELETE+POST path is wrong (corrected in `memory/project_churchopshub_webhook_drop.md`). For a FAILED campaign, the only no-fee path is the Console **"Fix Campaign →"** button on the campaign detail page.

---

## 2026-05-19 — Suppress Sentry "Connection to Indexed Database server lost" Firebase Auth noise

New Sentry error-level issue (`javascript-react`, prod): `UnknownError: Connection to Indexed Database server lost. Refresh the page to try again` at `https://churchopshub.com/?invite=FXCC&hubs=maintenance%2Ctasks` (someone on the AuthScreen opening an invite link). **Not an app defect.** Thrown by **Firebase Auth's IndexedDB-backed persistence** (its token store) when the browser drops the IDB connection mid-session — Safari/iOS eviction, a backgrounded/killed tab, cleared site data, or private mode. Transient, environmental, self-heals on the refresh the SDK's own message prompts. Firestore offline persistence is **not** enabled anywhere in `src/` (`grep` for `initializeFirestore`/`persistentLocalCache`/`enableIndexedDbPersistence` → none), so this is Auth-only token-store noise, not data-cache corruption. Surfaced as error-level only because `captureConsoleIntegration({levels:['error']})` picks up the Firebase SDK's `console.error`.

Fix (`src/main.jsx` `beforeSend`): added a second drop rule — `msg.includes('Connection to Indexed Database server lost') → return null` — alongside the existing `@firebase/firestore` "Uncaught Error in snapshot listener" filter. Same category as the 2026-05-18 SW-registration noise demotion. Source-only; takes effect on Vercel auto-deploy. Not actionable beyond this; nothing in app code can prevent a browser from evicting IndexedDB.

---

## 2026-05-18 — Fix: Sentry "Service worker registration failed: Rejected" demoted to warn

Stale Sentry error-level issue (`javascript-react` project, prod, `https://churchopshub.com/`). **Not a server defect** — direct prod probes confirmed every SW dependency serves correctly: `/sw.js` → `200 application/javascript`, `/manifest.json` → `200 application/json`, `/icon-192.png` & `/icon-512.png` → `200 image/png`. The vercel.json catch-all (`/(.*)` → `/app.html`) does **not** swallow these — Vercel's static-file precedence serves them before rewrites apply (an early investigation hypothesis that was disproven by the probes; no vercel.json change made).

The literal `err.message` of `"Rejected"` with all assets healthy means `navigator.serviceWorker.register('/sw.js')` is rejecting in restrictive **client** environments only (private mode / storage-blocked / bots/crawlers). The SW is explicitly best-effort (network-first, no stale data) with **zero user-facing impact** — a failed registration just means no PWA install prompt + no offline shell; the app loads and runs fully. Logging that via `console.error` made Sentry's `captureConsole({levels:['error']})` file invisible noise as an error-level issue.

Fix (commit `7446b6e`, `index.html`): the `.catch` now `console.warn`s `[ChurchOpsHub] Service worker registration skipped:` with `err.name` + message — diagnosable in-console, no longer error-level. Supersedes the 2026-05-14 `b3f6779` `console.error` choice (that commit's goal — surface the real error instead of an unhandled "Rejected" rejection — is now served by the enriched warn). Source-only change; takes effect on Vercel auto-deploy.

---

## 2026-05-18 — Hide test/E2E accounts from member lists + Reuben dedupe

Reported via the Tasks assignee filter showing "E2E Admin" and "Reuben Hinckley" twice.

**Test-account leak (commit `765cdbd`):** the E2E suite runs against PROD, so `e2e-admin@`/`e2e-member-b@churchopshub.com` live permanently in the real FXCC church (`6cksNI9…-church`) and surfaced in every user picker + the billable seat count. New `src/utils/testAccounts.js` (`isTestAccount` / `excludeTestAccounts`, matches the `@churchopshub.com` domain) applied at the single source in `useFirestore.js:117` so all consumers inherit it. Owner chose "hide everywhere" (unconditional) over the real-users-only variant.

**E2E verification:** full Playwright suite re-run against prod after deploy → **40 passed / 1 skipped / 0 failed (2.1m)**. The predicted risk (roster-visibility/announcements specs depending on test-member name render) did not materialize: those specs assert seeded signup-entry display names, not `users`-collection lookups. No spec rework needed. (First run was a false alarm — Vercel bot-protection "Code 21" challenge blocked auth-setup; passed cleanly on the documented ~5-min retry.)

**Reuben Hinckley duplicate (manual data fix):** he signed up twice within ~100s on 2026-05-18 — once with a typo email `reubenhh@gmail.xom` (`SLEYb4d3…`, allowedHubs `[maintenance,tasks]`), once correct `reubenhh@gmail.com` (`wEwGMVFCg9…`, no hubs). Neither had logged in again or had any task/job references. Owner-run script: copied `[maintenance,tasks]` onto the `.com` doc, deleted the `.xom` Firestore user doc + its Auth account. (The script was blocked from the agent by the destructive-action classifier — correct behavior — and run by the owner via `!`.)

---

## 2026-05-18 — Fix: Google sign-in blocked by CSP (two gates; broken ~7 weeks)

User reported "Google sign-in failed. Please try again." on the Welcome Back screen. Not a Firebase config problem — `churchopshub.com` is in Auth authorized domains, the `/__/auth/(.*)` → `church-inventory-9615c.firebaseapp.com` Vercel rewrite is present and returns real Firebase handler/iframe content, and email/password sign-in worked fine.

`signInWithPopup` (with the custom proxied `authDomain` `churchopshub.com`) needs two CSP allowances that the 2026-03-27 security-hardening commit (`a45da1f`) did not include. Both were broken from 2026-03-27 onward; unnoticed because email/password (the `jcvaught@gmail.com` path) was unaffected.

1. **`frame-src` missing `'self'`** — the SDK loads a same-origin relay iframe at `https://churchopshub.com/__/auth/iframe`; the browser enforces CSP on it as `'self'`. An explicit `frame-src` overrides `default-src 'self'`, so omitting `'self'` blocked the iframe. Fixed commit `ed108f6` (added `'self'` to `frame-src`).
2. **`script-src` missing `https://apis.google.com`** — that relay iframe loads `https://apis.google.com/js/api.js` (gapi) to drive the popup handshake. Browser console on `churchopshub.com` showed: *"Loading the script 'https://apis.google.com/js/api.js' violates … script-src 'self' 'unsafe-inline' https://js.stripe.com … The action has been blocked."* Fixed commit `d6b06ce` (added `https://apis.google.com` to `script-src`).

Diagnostics improvement (commit `9e6958b`): `loginWithGoogle` catch in `src/useAuth.js` previously swallowed every non-`popup-closed` error into a generic message with no logging. Now it special-cases `auth/popup-blocked` and `auth/unauthorized-domain` with actionable copy, surfaces the `auth/*` code for anything else, and `Sentry.captureException`s with tag `flow:google-signin` so future failures are diagnosable without a console.

All three are vercel.json/src changes; take effect on the Vercel auto-deploy. CSP header changes require a hard refresh (headers are attached per-deployment, cached pages keep the old header).

**Accepted behavior (not a bug):** after the CSP fix, the Google popup opens and completes but a password-registered user (e.g. `jcvaught@gmail.com`, UID `DTd95wkCIpeYRnqP39dtU0VyNvU2`, providers `["password"]` only) is bounced back to the sign-in screen. The project uses "one account per email" (`allowDuplicateEmails` off), so Google sign-in for an email that already has a password-only account collides (`auth/account-exists-with-different-credential`) — there is no linked Google identity to sign into. This affects any password-registered user who clicks "Sign in with Google". Owner decision 2026-05-18: leave as-is; email/password is canonical. Do **not** "fix" this bounce as a regression. If revisited, the path is an in-app link flow (password sign-in → `linkWithPopup(googleProvider)`).

---

## 2026-05-16 — Stale-chunk self-heal for lazy-loaded hubs

Sentry caught `TypeError: Failed to fetch dynamically imported module: .../assets/TasksPage--BA92yxPw.js` (issue `5e2ac57f…`, production, Chrome). Not a code bug — deploy skew: a browser still running an older build requested a hub chunk whose hashed filename no longer existed on the host after the 2026-05-15 pre-rendering deploy.

New `src/utils/lazyWithRetry.js` wraps `React.lazy`: retries the dynamic `import()` once (transient network blip), then on a second failure forces a one-time hard `window.location.reload()` to fetch the fresh `index.html` + chunk manifest. A `sessionStorage` flag (`chunk-reload:<name>`, cleared on success) prevents an infinite reload loop if the failure isn't a stale chunk. All 7 lazy hub imports in `HubsPage.jsx` (Insights, Maintenance, Coordination, Accountability, PeopleAccess, Tasks, Jobs) now use `lazyWithRetry`.

**Defense in depth:** `src/components/primitives/ChunkErrorBoundary.jsx` wraps the hub `<Suspense>` (`key={hubKey}` so each hub gets a fresh boundary). It's the terminal fallback for the case where `lazyWithRetry` already reloaded once and the import still fails (guard set → rethrows): instead of a hung spinner the user gets a framed *"A new version is available — Reload"* card (chunk errors) or a generic *Reload / Try again* card (other render crashes). Reports to Sentry via `componentDidCatch` (Suspense/render errors are swallowed by the boundary so the global handler never sees them) with `boundary:hub` + `chunkError` tags for feed filtering. **Caveat:** this only protects tabs running the new build — a tab still on a pre-`fea4b24` build during the *next* deploy can still hit the raw error once before the self-heal/boundary code is present. Closing that residual gap requires host-side asset retention (Vercel Skew Protection), deferred for now. Build + lint clean (0 errors).

---

## 2026-05-15 (PM) — Pre-rendering extended from blog posts to all public pages

Second pass of the SEO pre-rendering work — extended from blog content to landing + help + terms + privacy + sms-program. New `scripts/prerender-static.mjs` (commit `bf49b64`) runs in the `postbuild` chain after `prerender-blog.mjs`. Polyfills `globalThis.window` and `globalThis.document` BEFORE module imports — COH's `LandingPage` reads `window.innerWidth` in a `useState` lazy initializer for responsive layout state. Uses Vite's `ssrLoadModule` + React's `renderToString` wrapped in `HelmetProvider` (since `SEO.jsx` uses `react-helmet-async`).

**Vercel routing change.** `vercel.json` catch-all rewrite updated from `/index.html` → `/app.html`. The prerender script preserves the original Vite-built SPA shell at `dist/app.html` before overwriting `dist/index.html` with the SSR-rendered landing page. Vercel serves static files in `dist/` before applying rewrites. The existing `/__/auth/(.*)` Firebase auth rewrite stays before the catch-all and is unaffected.

**5 routes pre-rendered:**
- `/` (LandingPage 29KB)
- `/help` (Help Center 85KB — the 14-section accordion content this session expanded with the People Access Hub coverage)
- `/terms` (17KB)
- `/privacy` (18KB)
- `/sms-program` (14KB — the Twilio A2P public disclosure page)

**Legacy query-string URLs still work.** App.jsx checks both pathname AND query-string for the help/terms/privacy/sms-program routes. The path-based URLs are now SEO-canonical (and indexable), but old bookmarks/links to `/?help`, `/?privacy`, etc. continue to render the right page via the SPA after the catch-all routes them to `/app.html`.

**Before:** every public URL returned a 2,477-byte SPA shell with 30 chars of visible text. **After:** `/` returns 28,951 bytes with 3,607 chars of visible content; help page returns 84,734 bytes with the full FAQ accordion expanded — no JS execution needed for Google to crawl any of it. Production-verified post-deploy. Cross-app audit + outcomes at `~/apps/seo-audit-2026-05-15.md`. Memory: `project_prerender_blog.md`.

---

## 2026-05-14/15 — SEO Cross-App Audit + Blog Pre-rendering

Part of a 4-app SEO session covering RC, COH, MH, CC. Cross-app audit at `~/apps/seo-audit-2026-05-15.md`. Per-COH shipped this session:

**Help docs (Phase 1 in cross-app plan, commit `bb1b524`)** — HelpPage gained a complete People Access Hub section with 8 accordions (adding people, the 4 record types — background_check 🔍 / key_assignment 🔑 / certification 🎓 admin-only / custom ✅, expiry tracking with 🔴 expired / 🟡 warning / ✅ ok signals, custom requirements, bulk entry, linking a person to a user account, permissions at a glance, CSV export). All-In Bundle copy reconciled across three surfaces (FAQ said "six paid hubs", pricing card said "7", grid showed 8 — standardized on "7 feature hubs + unlimited team members" with the full list). Added a Note in Job Hub's "Signing up and withdrawing" accordion explaining how Required Access Types compliance gating links back to People Access Hub records.

**Blog post (commit `b091709`)** — "The Hidden Cost of Running Church Operations on Spreadsheets" (~1,900 words). Deliberately differentiated from the existing "Moving Beyond Spreadsheets: Church Inventory Best Practices" post by focusing on cross-functional operations sprawl (volunteer coordination + maintenance tickets + compliance + key management + audits + job posts) rather than inventory alone. Five hidden costs framed for the 200-member church target: volunteer coordinator tax (3–5 hrs/week), maintenance request Bermuda Triangle (no automatic surfacing), compliance risk with no owner ("probably yes but can't prove it"), key management liability (20–60 keys typically out), and cross-functional coordination tax (~150–300 hrs/year). Closes with the migration framing and the All-In Bundle math.

**PostHog analytics wired (commit `29b7ade`)** — `posthog-js` installed as a dep, lazy-loaded in `src/main.jsx` via `requestIdleCallback` (or 1500ms `setTimeout` fallback for Safari, matching MH/RC pattern). Block dead-code-eliminates when `VITE_POSTHOG_KEY` is unset, so the integration ships inert until env vars land. Activation requires: create PostHog project at us.posthog.com, set `VITE_POSTHOG_KEY` + optional `VITE_POSTHOG_HOST` in Vercel Production env, redeploy. Goes alongside the existing Sentry integration (which stays as the errors-only channel).

**Pre-rendering for SEO (commit `2750767`) — the major fix.** New `scripts/prerender-blog.mjs` runs as `postbuild` after `vite build`. Same pattern as RepCrew: reads `BLOG_POSTS` from `src/data/blogPosts.js`, renders each post's markdown to HTML via `marked`, wraps in a fully styled standalone HTML page (ChurchOpsHub navy + teal branding, embedded CSS, no external dependencies, includes site nav + footer + CTA + 3 related posts + post description prominently displayed), and writes to `dist/blog/<slug>/index.html`. Also generates `dist/blog/index.html` for the listing. Vercel serves static files before the SPA catch-all rewrite (preserving the existing Firebase auth rewrite in `vercel.json` — order matters: more specific rewrites first, then static files take precedence, then the SPA catch-all last).

**Before:** every blog URL returned a 2,477-byte SPA shell with 30 chars of visible text. **After:** each post URL returns ~20KB of static HTML with ~7,600 chars of actual visible blog content — no JS execution needed for Google to index. 20 posts + 1 index page generated per build. Production-verified post-deploy. Memory: `project_prerender_blog.md`.

**Sitemap status note:** unlike RC, COH's sitemap submission appeared to be working in GSC (HTTP 200, valid XML, 26 URLs at audit time). The deeper indexing problem was still the empty SPA shells — Google could read the sitemap but the URLs it discovered returned no content. Pre-rendering closes that gap.

---

## 2026-05-14 — New-user signup-flow audit (15 findings, 4 shipped)

Audited every signup entry point (`createChurch`, `register`, `loginWithGoogle`, `login`, `registerWithGoogle`, `onAuthStateChanged`, and the AuthScreen UI). 15 findings across 4 severity tiers. Three of the four critical/high items shipped this commit; the rest are queued.

### Shipped (commit `7b21317`)

- **S-1 — `profileMissing` recovery screen + Sentry breadcrumb.** When `onAuthStateChanged` finds an Auth account with no `users/{uid}` doc — exactly Haleigh's state earlier today — `useAuth` sets a new `profileMissing: true` flag and `Sentry.captureMessage(...)` logs the case for proactive visibility. `App.jsx` renders a new `ProfileMissingScreen` (email displayed, prefilled mailto support link, sign-out button) instead of silently bouncing the user back to the login form. We'll now hear about future occurrences instead of waiting for an email.
- **S-2 — Cleanup orphan Auth on any post-Auth failure.** Both `createChurch` and `register` now wrap every step after `createUserWithEmailAndPassword` in an inner try/catch that best-effort `cred.user.delete()`s on ANY thrown error (rules denial, network, quota, business-rule rejection). The user can retry with the same email instead of being permanently blocked by `auth/email-already-in-use`. The previous inline `cred.user.delete()` calls in `createChurch`/`register` for specific business errors are removed because the outer catch handles them — avoids double-delete.
- **S-4 — `sendEmailVerification` failures surfaced to Sentry.** Two `.catch(() => {})` swallowing sites replaced with `Sentry.captureException`. The signup still succeeds (verification is best-effort) but we hear about SendGrid/quota issues instead of users silently never receiving the email.
- **S-5 — `loginWithGoogle` distinguishes first-time vs stuck state.** Compares `creationTime` vs `lastSignInTime` on `firebaseUser.metadata`. First-time sign-in still flows to `needsRegistration`; returning users with missing profiles fall through to the new recovery screen with a Sentry warning. `login` (email/password) inherits the same recovery path via `onAuthStateChanged`.

### Second pass (commits `0944a47`, `6180e4f`, `f561139`) — remaining audit items shipped

- **S-6 — SMS opt-in gated on `user.emailVerified`** (`6180e4f`). The Settings page's SMS Job Reminders section now shows a "verify your email first" message in place of the phone/checkbox form for unverified users. After verifying (Resend button in the AppShell banner already), the form reappears unchanged. Ties TCPA/A2P consent to an identity we know the user controls.
- **S-7 — atomic `writeBatch` in `createChurch` + companion rules update** (`f561139`). The 5-doc signup chain is now one all-or-nothing batch. Companion rules change: `config/main` and `config/settings` split `allow write` into `allow create: if self-creator OR isChurchAdminOrManager` and `allow update, delete: if isChurchAdminOrManager`, matching the existing `config/subscription` pattern. Rules deployed to `church-inventory-9615c`. Closes the partial-failure window that previously could leave orphan Firestore docs even after S-2's Auth-account cleanup.
- **S-9 — `findChurchByCode` distinguishes "not found" from "lookup failed"** (`0944a47`). Throws a specific error on CF failure (+ Sentry); callers surface a transient-failure message instead of "Invalid church code" during CF outages.
- **S-11 — `registerWithGoogle` signs out on cleanup** (`0944a47`). Failed church-code lookup no longer leaves the user in a stuck-Google-session state.
- **S-12 — Honeypot bot trap on `register` form** (`0944a47`). Matches the existing trap on `createChurch`.
- **S-13 — Timestamps consolidated** (`0944a47`). Single `now` reused across every doc write in a single signup chain.
- **S-14 — Email normalization** (`0944a47`). `createChurch` / `register` / `login` / `resetPassword` / `registerWithGoogle` apply `.trim().toLowerCase()` before any Firestore or Firebase Auth call.

### Skipped / non-issues

- **S-3** was Haleigh's bug, already fixed in commit `73e73ec`.
- **S-8** is already covered by S-2's inner try/catch (`updateProfile` is inside it).
- **S-10** isn't reachable under current flows — `register` creates a new Auth account, and Firebase blocks duplicate emails before `setDoc` ever runs.
- **S-15 — server-side signup rate limiting** is the one real gap left. Effective limiting requires reCAPTCHA or a Cloud Function gate; client throttle is useless against bots. Firebase Auth's own per-IP throttling is the only protection in place today. Deferred as a known gap.

## 2026-05-14 — Signup chain broke for new church creators (Haleigh / TrueNorth)

Haleigh Watson signed up to evaluate ChurchOpsHub for TrueNorth Church (code TNC2026) at 10:40 EDT today and emailed asking for help — the signup accepted her info and the welcome email arrived, but she could not get past the login screen and password reset didn't help.

**Root cause:** `useAuth.createChurch` wrote Firestore docs in this order:

```
1. churches/{id}              ← parent doc        ✓ self-creator branch passes
2. churches/{id}/config/main  ← admin-required    ✗ DENIED here
3. churches/{id}/config/settings
4. churches/{id}/config/subscription
5. users/{uid}                ← creator's profile
```

The rule on `config/main` and `config/settings` is `isChurchAdminOrManager(churchId)`, which reads the requesting user's role from `users/{uid}`. At step 2 that document doesn't exist yet, so the rule denies, the awaited `setDoc` throws, the chain breaks, and steps 3–5 never run. The Auth account is created, the parent church doc is created (which fires the `sendWelcomeEmail` Cloud Function — explaining why she received the welcome email), but no config and no user profile exist. The app then loads, finds no user profile in Firestore, and keeps her stuck on the login screen.

Anyone signing up between the rules being deployed in this configuration and today's fix would have hit the same wall silently.

**Repair (Haleigh's account):** ran an Admin-SDK script that bypasses rules and wrote the four missing docs — `config/main`, `config/settings`, `config/subscription` (90-day trial restarted from today), and `users/{uid}` (role: admin, name: Haleigh Watson, etc.). All values match what the signup flow would have written; trial dates use today's timestamp per user request so the trial isn't shortened by the failed signup window.

**Fix (commit `73e73ec`):** moved the `users/{uid}` `setDoc` to immediately after the parent church doc, before any config writes. The chain is now:

```
1. churches/{id}
2. users/{uid}                ← was step 5
3. churches/{id}/config/main
4. churches/{id}/config/settings
5. churches/{id}/config/subscription
```

`isChurchAdminOrManager` now passes at step 3 because the user doc exists by then. Removed the duplicate `setDoc(users/...)` that was at the end of the block; kept the `setUserProfile()` React state update there. Build clean, lint 0 errors. Deployed via Vercel.

---

## 2026-05-14 — Tasks-modal interactive-primitives audit

After the third invisible-feedback report on the same modal in two days (focus-yank, focus-on-open, no-autogrow — all 2026-05-13), ran a narrow audit of the modal's interactive primitives: `Modal`, `FF`, `RichTextarea`, `TagInput`, `BlockedByInput`, the pill-group selects (`AssigneeSelect` / `SharedWithSelect` / `VisibilitySelect`), and `CommentThread`. 13 findings filed (`P-1` … `P-13`) across 3 severity tiers.

Shipped the two real bugs:

1. **P-1 — `BlockedByInput` leaked a `setTimeout`.** `addBlocker`'s "Task not found." error reset used a bare `setTimeout(() => setBlockerError(''), 3000)` with no unmount cleanup. Closing the modal within 3 s of typing an invalid TSK number fired `setState` on an unmounted component (React warning). Wrapped in `errorTimerRef` + an unmount cleanup `useEffect`, matching `TagInput`'s existing `blurTimerRef` pattern.

2. **P-2 — `CommentThread` mention insertion ignored cursor position.** Picking from the `@-mention` dropdown did `onChange(newComment + '@' + name + ' ')` — always appended at the end, even if the caret was elsewhere. Added a `commentInputWrapRef` on the input wrapper, `querySelector('textarea')` to read `selectionStart`, splice the mention at that offset, then restore the caret after the inserted text on the next tick. Verified live: caret at index 5 in `"Hello world"` → `"Hello @John Vaught world"` with caret at 18.

Remaining audit items (deferred — labelled `P-3` to `P-13` in session notes):

- **a11y bundle**: Modal has no focus trap (Tab can escape the dialog); `FF`'s `cloneElement` injection drops a11y props on custom-component children (`TagInput`, `BlockedByInput`, the `*Select` pills) → label `htmlFor` points nowhere; pill-group selects have no `role`/`aria-pressed`/`aria-checked` — screen readers can't tell what's selected.
- **polish**: `RichTextarea` label has no `htmlFor`; toolbar bullet/numbered toggles don't preserve cursor offset; `TagInput`/`BlockedByInput` fire Enter on both keydown + keyup; `scrollIntoView({behavior:'smooth'})` in `CommentThread` scrolls the modal panel; the edit-comment textarea is a plain `<textarea>` (no auto-grow) instead of `RichTextarea`; mention regex misses apostrophes/hyphens; required-field asterisks are inconsistent.

`RichTextarea` is also **still duplicated** between `TasksPage.jsx` and `MaintenancePage.jsx` — extracting to `src/components/primitives/RichTextarea.jsx` is the obvious next refactor if it gets touched again.

### a11y bundle shipped (P-3 / P-4 / P-5 / P-6, second pass on 2026-05-14)

Closed the four accessibility findings from the audit:

3. **P-3 — Modal focus trap.** `Modal.jsx`'s document `keydown` handler only watched `Escape`. Tab inside the panel would walk past the last focusable element onto background controls behind the backdrop (selects in the rest of the page, the close button on a parent modal, the browser's address bar). Extended the handler with a Tab branch: query `panelRef` for all enabled `input/select/textarea/button/a[href]/[tabindex]` elements, then preventDefault + wrap when (a) `Shift+Tab` from the first element → focus last, (b) `Tab` from the last element → focus first, (c) `Tab` fires while focus has somehow leaked outside the panel → snap back to the first element. `Escape` behavior unchanged.

4. **P-4 — `FF` a11y for custom components.** `FF`'s `cloneElement` only forwards `id`/`aria-*` to its first child, which works for native `<input>`/`<select>`/`<textarea>` but silently drops the props on custom components (the cloned `id` lands on the custom-component instance, not on the inner `<input>` it eventually renders). The label's `htmlFor` then points at an element that doesn't exist, breaking the click-label-to-focus-input behavior and screen-reader name lookup. New branch in `FF`: detect `typeof first.type === 'string'`. Native elements get the existing `htmlFor`/`cloneElement` path unchanged. Custom-component children now render the label as a `<div id={labelId}>` plus a `role="group" aria-labelledby={labelId}` wrapper (and `aria-required`/`aria-invalid`/`aria-describedby` lift onto the group). Visible markup is identical; screen readers announce the field group correctly.

5. **P-5 — pill-group ARIA semantics.** `AssigneeSelect`, `SharedWithSelect`, and `VisibilitySelect` render pill `<button>`s with a "✓ " prefix and a teal background as the only selection signal — screen readers had no way to know which pill was selected. Added `aria-pressed` (toggle-button pattern) to each pill. `SharedWithSelect` also emits `aria-disabled` on the locked "assignee" pill (it stays visible but can't be untoggled, which the cursor:`default` + 0.7 opacity already conveyed visually).

6. **P-6 — `RichTextarea` label `htmlFor`.** The internal `<label>` rendered when `RichTextarea` receives a `label` prop had no `htmlFor` and the `<textarea>` had no `id`. Generated a `useId` in `RichTextarea` (TasksPage copy), set `htmlFor` on the label and `id` on the textarea. MaintenancePage's `RichTextarea` doesn't render an internal label (parent wraps it in `FF`), so its accessibility is covered by the P-4 fix above.

Build clean, lint 0 errors (43 baseline warnings, all pre-existing `exhaustive-deps`).

### Polish bundle shipped (P-7 … P-13, third pass on 2026-05-14)

Closed the seven remaining audit items:

7. **P-7 — toolbar cursor preservation.** `RichTextarea.toggleBullet`/`toggleNumbered` toggled the `• ` / `1. ` prefix on the active line(s) and called `el.focus()` without restoring the selection — the cursor snapped back to offset 0. Replaced the duplicated toggle bodies with a single `applyLineTransform(kind)` helper that computes old/new line-start arrays and re-maps `selectionStart`/`selectionEnd` to the same offset-within-line in the new text. Applied to both `TasksPage.jsx` and the duplicated `MaintenancePage.jsx` copy.

8. **P-8 — `TagInput` / `BlockedByInput` Enter double-fire.** Both components handle Enter in `onKeyDown` (desktop) and `onKeyUp` (mobile virtual-keyboard fallback). The keydown clears `inputVal` via `setInputVal('')`, but React state isn't synchronously updated, so the closure-captured `inputVal` in `onKeyUp` is still non-empty and `addTag(inputVal)` ran a second time. Added an `enterHandledRef` flag set in keydown and cleared in keyup; the mobile fallback only fires when keydown didn't already handle it.

9. **P-9 — dropdown keyboard navigation.** `TagInput` and `BlockedByInput` suggestion dropdowns were mouse-only. Added `highlightIdx` state with `ArrowDown`/`ArrowUp` to navigate, `Enter` to select the highlighted suggestion, and `Escape` to dismiss. Mouse hover updates the highlight so keyboard + mouse stay in sync. Dropdowns got `role="listbox"` + `role="option"` + `aria-selected` so screen readers announce the active item. The displayed index is clamped via `safeIdx = idx >= 0 && idx < filtered.length ? idx : -1` rather than reset in a `useEffect` (avoids the "setState in effect" lint rule).

10. **P-10 — scope `CommentThread` auto-scroll.** `endRef.scrollIntoView({ behavior:'smooth' })` scrolls the nearest scrollable ancestor — for comments in a modal, that's the modal panel itself, so posting a comment yanked the entire dialog. Replaced with `listRef.current.scrollTop = listRef.current.scrollHeight` on the comment-list container.

11. **P-11 — edit-comment auto-grow.** Edit-comment mode rendered a plain `<textarea>` with no auto-grow, so editing a long comment hit the same Enter-doesn't-work invisible-feedback bug we fixed for the description field (2026-05-13). Extracted a small `AutoGrowTextarea` component (same `el.style.height = scrollHeight` pattern as `RichTextarea`) and used it for the edit path.

12. **P-12 — mention rendering.** `renderWithMentions` used `/(@[\w][\w\s]*?\b)/g` which dropped apostrophes/hyphens (`@O'Brien` → `@O`, `@Mary-Jane` → `@Mary`) and clipped multi-word names like `@John Vaught` to `@John` because `\b` matches at the first space. Replaced with a names-list-driven scan: pull the actual user names from the `users` prop, sort longest-first, and walk the text matching at each `@`. Now any reasonable name shape highlights correctly. Call site updated to pass `users`.

13. **P-13 — required-field asterisk consistency.** Across 10 files, 26 `FF` call sites used `label="Foo *"` and 2 used `label="Bar (required)"` while `FF`'s actual `required` prop only emitted `aria-required` (no visible marker), so two non-standard conventions had grown ad-hoc. Updated `FF` to render a red asterisk after the label when `required` is set, then converted all 28 call sites to `<FF label="Foo" required>`. Screen readers now hear "required" via `aria-required`; sighted users see a consistent asterisk.

Build clean, lint 0 errors (43 baseline `exhaustive-deps` warnings).

### Twilio HELP keyword (compliance gap closed on 2026-05-14)

A2P campaign `CM1c503f6147a2db830f…` is still "In progress" with Twilio (submitted 2026-04-27). While checking on it, found that Privacy §6 and Terms §7 commit to a "reply HELP for help" response, but **HELP replies silent-drop**:

- `twilioInbound` only branched on STOP / START keywords; HELP fell through to empty `<Response/>`.
- The CF's old comment said "HELP responses are handled by Twilio Messaging Service Advanced Opt-Out (configured in Twilio Console)" — but that's not actually in effect. Per `project_churchopshub_a2p.md`, `+1 571-540-7100` is a bare account-level number not attached to either Messaging Service, so the Messaging Service's Advanced Opt-Out keywords (where HELP would live) never fire for inbounds to this number. The phone number's webhook routes directly to `twilioInbound`.
- If Twilio's A2P reviewer tested HELP during review and got silence, the campaign could have been rejected on that alone.

**Fix:** Added a `HELP_KEYWORDS = ['HELP', 'INFO']` branch to `twilioInbound` that returns TwiML:
```
ChurchOpsHub: Reminders for jobs you signed up for. Msg frequency varies (1-5/week). Msg and data rates may apply. Reply STOP to opt out. For help, email churchopshub@gmail.com.
```
Deployed to prod immediately (`functions:twilioInbound` only). Once the A2P campaign approves and the bare number moves into the campaign's Messaging Service, the Advanced Opt-Out HELP keyword will fire first and this CF branch becomes a redundant fallback — safe to leave in place.

**Resolution (later 2026-05-14):** Diagnosed via Twilio Messaging API. Two findings:

1. **A2P campaign was rejected**, not "In progress." `campaign_status: IN_PROGRESS` in the Console UI is misleading — the API exposes `errors: [{error_code: 30909, fields: ["MESSAGE_FLOW"], description: "...rejected due to issues verifying the Call to Action (CTA)..."}]`. The reviewer couldn't verify the opt-in CTA because the actual form lives behind a login wall (Settings → My Profile → SMS Reminders). Carrier A2P filtering blocks every outbound from `+1 571-540-7100` (including Twilio's own compliance auto-responses) until the campaign is approved. That's why STOP / START / HELP replies never reached the user's phone in any test.

2. **HELP keyword is owned by the campaign**, not our webhook. Campaign config has `help_keywords: ["HELP", "INFO"]` with `help_message: "Reply STOP to unsubscribe. Msg&Data Rates May Apply."` — Twilio intercepts HELP/INFO and serves that default message before any webhook fires. Our P-Help CF branch (shipped earlier today in `e62eb42`) is now dead code on this account, but harmless to keep as defense-in-depth if HELP keywords are ever removed from the campaign.

3. **Inbound webhook routing was fixed** by moving the number into the campaign's Messaging Service (`MGb4f2156d4ab3104ee564f15cb701d81d`). Bare number + rejected campaign = silent webhook drops. Service-attached number = webhook fires. Verified via Delivery Steps showing "TwiML Fetch Succeeded" 4.14s after a non-keyword test message.

**Action items left open after this session:**
- ~~Address the campaign rejection~~ ✓ Resubmitted 2026-05-14 at 22:32 UTC. See section below.
- ~~Optionally customize the campaign's `help_message`~~ Attempted; Twilio's API kept its default text on LOW_VOLUME — not worth pursuing.

### Resubmission (later same day, 22:32 UTC)

Deleted both pre-existing campaigns via the Messaging API (`DELETE /v1/Services/{MS}/Compliance/Usa2p/{QEsid}`): the FAILED one on the unused service `MG45293bc76c21346ac47e5326ce1b7df6`, and the rejected one on the active service `MGb4f2156d4ab3104ee564f15cb701d81d`. Then POSTed a fresh campaign on the active service with the updated `MessageFlow` — reviewer test credentials (`e2e-admin@churchopshub.com` / `E2eTestPass123!`) and step-by-step opt-in walkthrough verified against the actual SettingsPage code. Brand SID `BN26d4c…` (approved) was reused.

Result: HTTP 201, `errors: []`, `date_updated: 2026-05-14T22:32:04Z`, `campaign_status: IN_PROGRESS`. Compliance SID reused: `QE2c6890da8086d771620e9b13fadeba0b`. Now waiting on TCR review — typical re-submission turnaround on an already-approved brand is 1–3 days, vs 2–3 weeks for first-time submissions.

Twilio's Console campaign page should now show just one campaign (the failed orphan on the second messaging service is gone). The fee for the new submission is charged to the Twilio account, partially or fully covered by the twilio.org nonprofit credit approved on 2026-04-27.

Until TCR approves, outbound replies from `+1 571-540-7100` to real US carriers will still be carrier-filtered as unregistered A2P traffic. End-to-end SMS testing has to wait for approval.

### Further investigation of the rejection — Edit form is locked

Attempted to resubmit the corrected `message_flow` through the Console's **Edit Campaign** dialog. The "How do end-users consent" textarea and the Privacy/Terms URL fields are all rendered greyed-out / non-editable while the campaign sits in this "rejected but displayed as IN_PROGRESS" limbo. No email rejection notification was sent (or it was missed). No "Resubmit" button appears on the campaign detail page.

Re-checked the Messaging API right after — `errors[]` still carries the same `30909 / MESSAGE_FLOW` entry, and `date_updated` is unchanged at `2026-04-27T12:45:46Z`. So Twilio is not silently retrying; the submission is stuck and the only avenue forward is **delete + re-register** via API, or a **support ticket** asking Twilio to either unlock the edit form or waive the re-registration fee.

### Compensating change shipped (independent of the campaign decision)

Discovered that the in-app SMS consent disclosure text (rendered in `SettingsPage.jsx`'s "SMS Job Reminders" section) did **not** match what the public `/sms-program` page claims is the "exact text shown in the app." The in-app version omitted the message-frequency note and the HELP keyword reference — both A2P-required language. A careful reviewer comparing the two would have flagged it independent of the CTA issue.

`SettingsPage.jsx` and `PublicSMSProgramPage.jsx` both now use the longer disclosure: *"By providing your phone number and enabling SMS reminders, you consent to receive automated text messages from ChurchOpsHub for job-shift reminders. US and Canada numbers only. Message and data rates may apply. Message frequency varies (typically 1-5 messages per week). Reply STOP to unsubscribe or HELP for help."*

Shipped in commit `d114495`. Deployed to Vercel. So whether the campaign gets re-submitted today or in three weeks, the in-app form already shows the disclosure text the `message_flow` field will describe.

### Drafted `message_flow` ready to paste once edit becomes possible

Includes test reviewer credentials (`e2e-admin@churchopshub.com` / `E2eTestPass123!` — user confirmed OK to share with TCR), explicit click-by-click opt-in steps verified against `SettingsPage.jsx`, the exact in-app consent disclosure text, and links to the public disclosure / privacy / terms pages. Stored in this session's notes; not committed to the repo because it's submission-form copy rather than code.

### Next-session resume

- Decide between **Twilio support ticket** (free, 2-3 days wait) vs **delete + API re-register** (~$15 fee, restarts TCR queue but no human-in-loop delay). User opted to pause here.
- Either way, no further code changes are required to address the rejection — the consent-text fix (commit `d114495`) and webhook routing fix (number moved into Messaging Service) are the only code-side dependencies, and both are done.
- Until the campaign is approved, **all outbound SMS from `+1 571-540-7100` to real US carriers will be filtered** by carrier A2P enforcement. This is the underlying reason every HELP / STOP / START test reply has been invisible to the user across multiple sessions.

**Original open-issue text below kept for context — superseded by the resolution above.**

**Open issue (2026-05-14, awaiting Twilio support):** Even with the HELP fix deployed and the Cloud Run IAM re-granted, end-to-end testing failed — Twilio's Programmable Messaging Logs show every inbound SMS to `+1 571-540-7100` as "Received" but with "no HTTP Requests logged for this event", for both keywords (HELP) and non-keywords (`test`). REST API confirms `sms_url` is set correctly on the phone number, no `sms_application_sid` override, and the number isn't in any Messaging Service sender pool. A successful invocation on 2026-05-12 (START keyword, `opt_in matched: 2` in function logs) proves the configuration worked at that point — something changed in Twilio's pipeline behavior for this bare 10DLC number between then and 2026-05-14 with no config changes on either side. Possibly A2P-compliance-related throttling for unregistered numbers under a pending campaign, but unverified. Support ticket pending. Example MessageSids: `SM12a764dc856eec66859321d56685d750` (HELP), `SM5b945d84b2dcb0e4b7a185284c12ebcb` (test).

**Gotcha caught during verification — deploy stripped `allUsers` invoker IAM.** When the user tested by texting HELP twice, Twilio Programmable Messaging Logs showed both inbounds as "Received" but no outgoing reply and no Cloud Function invocations. Direct `curl` against both function URLs (cloudfunctions.net and run.app) returned **HTTP 403 from Cloud Run itself** — Twilio's unauthenticated webhook calls were getting 403 before our function code ever ran, and Twilio silently dropped the webhook failures. Re-granted with `gcloud run services add-iam-policy-binding twilioinbound --region=us-central1 --project=church-inventory-9615c --member=allUsers --role=roles/run.invoker`. After re-grant, an unsigned curl now reaches the function and is correctly rejected by signature validation (visible in logs with `from: '+14122665015'`). Real Twilio webhooks (with valid X-Twilio-Signature) pass through.

This was the first 2nd-gen Functions deploy on the project that touched `twilioInbound` since 2026-05-13 (`cd049b2`). Firebase CLI 15.10 + firebase-functions 4.9 reproducibly strips the `allUsers` invoker binding on Gen-2 functions in this repo. Workaround: add a post-deploy `gcloud` step, or pin the IAM in `firebase.json`. For now, **always probe `curl ... twilioInbound` after deploying it** and re-grant if 403.

### E2E suite cleanup (final pass on 2026-05-14)

Ran the full Playwright suite after the audit work landed — 38 passed, 2 failed. Both failures turned out to be pre-existing spec bugs that had never actually run green: the test commits (`82c5d1a`, `4d42a39`) had been merged with "21/21 total" / "39 passed" notes from sessions where Vercel's bot-protection cooldown clipped setup, so these specs got committed without an end-to-end confirmation.

- **`public-board.spec.js` §9** — seeded 1 signup, then asserted `"0 / 3 spots filled"` on the public board. The `getPublicJobs` CF returns `signupCount = signups.length`, so the rendered text is `1/3`. Updated expectation to `1 / 3`.
- **`crud.spec.js` §2 (Admin can edit a job's location)** — queried `where('kind', '==', 'update_job')` and filtered `d.target`. The actual `activityLog` schema is `{ action, itemId, performedBy, performedByName, timestamp, details }` (`useFirestore.js:394`); the test had been written against a schema that doesn't exist. Fixed field names and wrapped in `expect.poll` because `logActivity` fires async after `updateJobListing` returns — the success toast can paint before the log doc lands.

Clean run: **40 passed, 1 SMS-smoke skipped, 0 failed** (~110s against prod).

### RichTextarea extracted to shared primitive

Closed the final audit follow-up. `RichTextarea` was duplicated between `TasksPage.jsx` and `MaintenancePage.jsx` — both copies converged after the P-7 toolbar-cursor and 2026-05-13 auto-grow fixes, so any further change had to be made twice. Pulled the component to `src/components/primitives/RichTextarea.jsx` (~135 lines), removed both local copies (~145 lines each), and replaced them with `import { RichTextarea } from '../../components/primitives/RichTextarea.jsx'`. The shared version keeps the optional `label` prop (TasksPage uses it; MaintenancePage doesn't) so both call patterns work unchanged. `CLAUDE.md` file-layout block updated to list the new primitive. Build clean, lint 0 errors.

---

## 2026-05-13 — Modal "one letter at a time" focus bug

User reported (Jill in FXCC, Chrome desktop): typing into the New Task modal in Tasks Hub yanked focus to the close-button "X" after every keystroke. Reproduced same-day on the reporter's own account by typing in the Description field.

**Root cause:** `Modal.jsx` (added 2026-05-12 in commit `a28e92a` "Mobile rollout-readiness batch") wired an a11y focus-management `useEffect` with `[open, onClose]` in its dependency array. Callers (every Modal call site, including `TasksPage.jsx:2090`) pass `onClose` as an inline arrow:

```jsx
<Modal open={showAdd} onClose={() => { setShowAdd(false); setTaskForm(getEmptyTask()); ... }}>
```

On every keystroke inside the modal, `setTaskForm` triggers a parent re-render → new `onClose` identity → the effect's deps see a change → cleanup + re-run. The re-run schedules `setTimeout(() => target.focus(), 0)` where `target = panelRef.current.querySelector('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')`. `querySelector` returns elements in DOM order, and the close-button "X" sits **before** any form input in the panel's DOM. So every keystroke → focus to the X → user has to click back into the field → repeat.

Typing only in the first input would have masked the bug (the `.focus()` lands on the same element if focus is already there). The reporter's "I don't have the issue" check had only typed into the Name field.

**Fix:** Pin `onClose` through a ref, drop it from the effect's dep array. Standard React idiom for "call the latest version of this callback without rebinding the effect."

```js
const onCloseRef = useRef(onClose);
useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

useEffect(() => {
  // …
  const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
  // …
}, [open]); // ← was [open, onClose]
```

Affects **every** modal in the app (New Task, edit task, bulk assign, defaults, settings, ticket detail, item detail, etc.) — anywhere users type inside a Modal. Single-component fix in the shared primitive, so all call sites are fixed at once. Build clean, lint 0 errors.

**Follow-up shipped same day** (separate concern from Jill's typing bug, but lives in the same effect block): the focus-on-open also targeted the close-button "X" for the same DOM-order reason. Split the `querySelector` into two passes — prefer `input/select/textarea/[tabindex]` first, fall back to `button` second, then the panel itself. Now opening any modal lands the cursor in the first typeable field, which is what users (and screen readers) expect.

**Third follow-up** (Enter-in-Description "doesn't work"): same modal, third invisible-feedback report. `RichTextarea` (TasksPage.jsx + MaintenancePage.jsx — duplicated, not a shared primitive yet) had `minHeight:72` / `52` and no auto-grow. Pressing Enter at end-of-content inserted `\n` correctly (state updated) but the cursor moved to an empty line just below the visible area — textarea scrolls ~2px to keep cursor in view, but with cursor on empty content there's nothing to see. User concludes Enter is broken. Confirmed empirically against prod: scrollHeight 70→82, clientHeight stays 70 → 12px overflow swallows the new line. **Fix:** `useEffect` on `value` setting `el.style.height = scrollHeight + 'px'`. After fix, clientHeight grows 70 → 80 → 100 as Enter is pressed. Applied to both copies.

---

## 2026-05-06 — Jobs Hub Pre-Rollout Audit + Blog #20 + Task Sharing Backfill

Pre-rollout audit of the Jobs Hub before opening it to real teens/parents at FXCC. 14 findings across four severity tiers; 13 actionable items shipped in three commits today, one was a non-issue.

### 🔴 Critical (4 / 4 shipped)

1. **`waitlist: []` initialized on new jobs** — `useFirestore.js:898` and `:873`. The Firestore rule on `jobListings` checks `request.resource.data.waitlist.size() == resource.data.waitlist.size() ± 1` against a missing field, so the first waitlist join on any new job was silently rejected. Both `addJobListing` and `addJobListingSeries` now write `waitlist: []` alongside `signups: []`.

2. **Public job-board signup leak fixed** — `firestore.rules:159` previously allowed unauthenticated `list` of any open `jobListing`, and the docs include `signups[]` / `waitlist[]` arrays with teen names. `PublicJobsPage.jsx` didn't render names, but raw SDK pulls did. Replaced the public-list path with a new callable Cloud Function `getPublicJobs(churchId)` that strips `signups`/`waitlist`/attendance and returns only display fields + a `signupCount` number. Rule now requires `isMember` for `list`/`get`. `PublicJobsPage` updated to call the CF instead of querying Firestore directly.

3. **Composite index for the public-board query** — `where('status','==','open') + orderBy('scheduledDate')` on a single-collection scope needed a `COLLECTION` (not `COLLECTION_GROUP`) index. Added to `firestore.indexes.json`. Note: the Firebase CLI silently no-op'd the COLLECTION-scope deploy (known quirk — it considers an existing same-fields `COLLECTION_GROUP` index to "cover" the query), so the index was created via `gcloud firestore indexes composite create` directly. Index is READY.

4. **Print Roster gated** — `JobsPage.jsx:999`. Wrapped the button in `(isAdminOrManager || rosterVisibility !== 'admin')` so non-admins can't dump teen names regardless of the church's `jobsRosterVisibility` setting.

### 🟠 High (5 / 5 shipped)

5. **Series cancellation now notifies signups.** `updateJobListingSeries` returns `{ count, affected: [{docId, signupCount}] }` so `JobsPage.handleSaveJob` can fan out per-job `sendJobCancelledEmails` calls after a cancel. The 1-hour debounce in the CF makes re-fires safe. Confirm dialog copy updated from "Signups will not be automatically notified" → "Existing signups will be emailed."

6. **`acknowledgedWaiverAt` audit trail survives waitlist promotion.** `signUpForJob` writes the timestamp onto the waitlist entry when the job requires a waiver; `promoteFromWaitlist` (CF) carries it onto the resulting signup entry.

7. **`closePastJobs` scheduled CF.** Daily 2am Central, `collectionGroup('jobListings')` where `status == 'open'` and `scheduledDate < today` → batch flip to `completed`. Without this, past-but-unfinished jobs accumulated in the Open filter forever and remained sign-up-able. Required a new `COLLECTION_GROUP` composite index on `status, scheduledDate` (also created via gcloud directly).

8. **`promoteFromWaitlist` email no longer gated on church-wide notifications toggle.** Removed the `if (!notifSnap.data()?.enabled) return ...` early-return — the promotion email is transactional ("you're now signed up"), not a marketing notification. Hub-active and per-user opt-out checks still apply.

9. **`updateJobListing` + `updateJobListingSeries` strip server-managed fields defensively.** Both now strip `waitlist`, `cancellationEmailSentAt`, `lastReminderSentDate`, `lastPosterNotifiedByActors`, and recurrence metadata. A future caller passing a stale doc as `updates` can no longer clobber dedupe stamps or recurrence config.

### 🟡 Medium (3 / 3 shipped)

10. **Waitlist hard-capped at 50 entries** — `firestore.rules:172`. Closes a denial-of-service vector (1MB doc cliff) and an unbounded-growth pattern.

11. **Capacity check before compliance** — `JobsPage.handleSignUp`. Reordered so a user trying to sign up for a full job sees "this job is full — join the waitlist?" before any compliance/waiver gate fires. Avoids the confusing "you need a Background Check" error for a job they wouldn't have fit into anyway. Also catches the new waitlist cap up front.

12. **Reports leaderboard date-scoped + pay footnote.** New scope selector (Last 30 days / Last 90 days / All time, defaults to 90 days). Filter applies cutoff against `job.scheduledDate` before aggregating. Footnote explains that Pay Earned only counts signups marked Attended, so unmarked signups read $0/— by design.

### 🟢 Low (1 / 1 shipped)

13. **Sign-up errors surface their message.** `handleSignUp`'s catch now prefixes `err.message` instead of swallowing it behind a generic "Sign-up failed."

### Non-issue

14. **`jobSwapRequests` rule** — already enforced `request.resource.data.uid == request.auth.uid` correctly. No change.

### New Cloud Functions
- **`getPublicJobs`** (onCall, no auth) — sanitized public job board read.
- **`closePastJobs`** (scheduled 2am Central) — auto-close past `open` jobs.

### Other today
- **Task sharing backfill** — 15 of Jill's ClickUp-imported tasks had `sharedWith: ['<uid>']` (flat strings) instead of `[{uid, name}]` objects, so the `TasksPage` `visibleTasks` filter silently failed and John couldn't see them. Backfilled the data shape directly in Firestore. Then John's 26 private tasks were converted to `shared` with Jill (and 4 team tasks left alone), and both users' `taskDefaultVisibility` / `taskDefaultSharedWith` were updated to share with each other on new tasks. Memory `project_churchopshub_task_import.md` updated with the shape gotcha so future imports won't reintroduce it.
- **Blog post** — "Church Workday Planning: How to Run an All-Hands Cleanup That Actually Gets Done" (`church-workday-planning`, 2026-05-05). Practical evergreen post; soft plug for Tasks Hub + Inventory Hub for recurring workday templating. Sitemap updated.

---

## 2026-04-30 — Tagline Repositioning: Operations Platform, Not Just Inventory

Product has outgrown the "inventory management" framing. Logo subtitle, browser title, SEO meta, manifest, and landing-page copy now describe ChurchOpsHub as the operations platform built for churches, with the new tagline **"Run Your Church"** under the logo.

- **`src/components/brand/Logo.jsx:28`** — `FullLogo` subtitle (most visible spot — appears in app top nav, blog header/footer, Privacy/Terms/Help, and on invite signup pages): `INVENTORY MANAGEMENT` → `RUN YOUR CHURCH`.
- **`index.html`** — browser tab title and meta description.
- **`public/manifest.json`** — PWA install prompt description.
- **`src/components/SEO.jsx`** — default title/description used wherever a page doesn't override them.
- **`src/pages/LandingPage.jsx`** — SoftwareApplication JSON-LD description, hero subhead, SEO `<title>` and `<meta description>`.
- **`src/pages/HelpPage.jsx`**, **`src/pages/BlogIndex.jsx`** — meta descriptions.

**Intentionally not changed:**
- `src/data/blogPosts.js` — every post uses "inventory management" / "asset tracking" as deliberate SEO keyword targets. Touching them loses ranking.
- LandingPage line ~201: *"The core inventory hub is free with no time limit"* — this paragraph specifically describes the FREE tier, which IS the inventory hub. Accurate as-is.
- App tab labels like "Inventory" — that tab is still the inventory tab.
- `functions/index.js` AI-vision prompt for photo descriptions — references "inventory items" appropriately for context.

---

## 2026-04-28 — twilioInbound Webhook (STOP/START Sync)

Closes the deferred follow-up from the SMS audit. When users reply STOP at the carrier level, Twilio auto-blocks further sends but our local `smsRemindersEnabled` flag stayed `true` — the Settings UI showed "enrolled" while messages silently dropped.

- **New CF: `twilioInbound`** — `functions/index.js`. HTTP webhook (`onRequest`) at `https://us-central1-church-inventory-9615c.cloudfunctions.net/twilioInbound`. Validates `X-Twilio-Signature` against `TWILIO_AUTH_TOKEN` (already in `functions/.env`); rejects unsigned requests with 403.
  - STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT → set `smsRemindersEnabled = false` on every `users` doc with matching phone.
  - START / YES / UNSTOP → set `smsRemindersEnabled = true`.
  - Empty TwiML response (`<Response/>`) — carrier confirmation messages and HELP autoresponse handled by Twilio Messaging Service Advanced Opt-Out (configured in Twilio Console; see backlog memory `project_churchopshub_help_verify`).
- **New collection: `smsOptOuts`** — every STOP/START event recorded with phone, action, keyword, matched-user count, and timestamp. Retained indefinitely per Privacy §7 commitment to honor opt-out requests.
- **`firestore.rules`** — `match /smsOptOuts/{docId}`: owner-only read (`jcvaught@gmail.com`, `jvaught@fxcc.org`); no client writes (Admin SDK only via the CF).
- **Webhook URL configured in Twilio Console** (2026-04-28) → set on the bare phone number's "A message comes in" → Webhook (Phone Numbers → Manage → +1 571-540-7100 → Configure → Messaging Configuration), since `+1 571-540-7100` is not attached to either of the auto-created Messaging Services.
- **Signature validation URL hardcoding fix** (commit `b0d425d`) — first live STOP from a real phone failed validation. Cloud Functions 2nd gen runs on Cloud Run, so `req.headers.host` returned the internal `*.run.app` hostname rather than the `cloudfunctions.net` URL Twilio computed the signature against. Replaced `https://${req.headers.host}${req.originalUrl}` with the hardcoded public URL. Verified: subsequent STOP from real phone validated and produced `twilioInbound { action: 'opt_out', matched: 0, failed: 0 }`.

Initial smoke test: unsigned `curl` POST returns 403. Live test: real STOP from a phone validates and updates `users.smsRemindersEnabled` + writes audit row to `smsOptOuts`.

---

## 2026-04-28 — SMS Audit Fixes

Audit of texting code/UI surfaced six issues; fixed five (skipped international support per product decision; deferred STOP-webhook + Twilio Console HELP verification).

- **SMS body cost bug** — `functions/index.js:1130-1133`: replaced `•` and `—` with ASCII (`-`). Em-dash and bullet are outside GSM-7, forcing UCS-2 encoding which drops segment size from 160 → 70 chars. Typical reminder was billing as 2-3 segments instead of 1; now 1 segment.
- **Settings UI didn't sync after `userProfile` loaded** — `SettingsPage.jsx:55-58`: lazy `useState` initializer ran once on mount; if profile was null at that moment, the form stayed blank forever. Replaced with the in-render conditional-update pattern (tracking `prevSyncedPhone`/`prevSyncedSms`) per React docs. Also fixed: phone now displays formatted `(555) 123-4567` instead of raw `+15551234567` via new `formatPhoneDisplay()` helper.
- **Silent no-op on invalid phone** — `SettingsPage.jsx:handleSavePhone`: previously `if (!normalized) return;` with no feedback. Now sets `phoneError` state with explicit message ("Enter a valid US or Canada number..."), rendered in red below the input row; input border turns red on error; error clears on typing.
- **No "remove phone" affordance** — added explicit Remove button (only shown when `userProfile.phone` exists) that clears phone and disables SMS in one action.
- **Admin could modify another user's phone/SMS opt-in** — `firestore.rules:256-272`: admin-update branch now requires `request.resource.data.phone == resource.data.phone` and same for `smsRemindersEnabled`. TCPA: SMS opt-in must come from the user, not be set on their behalf. Self-update branch unchanged (admins can still update their own phone).
- **Help text** — added "US and Canada numbers only" to consent disclaimer.

Deployed: rules + sendJobReminders CF.

**Deferred follow-ups:**
- STOP webhook sync — when user replies STOP, Twilio auto-blocks but local `smsRemindersEnabled` stays `true` (UI shows "enrolled" while messages are silently dropped). Needs a new `twilioInbound` HTTPS function + Twilio Messaging Service webhook config.
- HELP autoresponse — Privacy/Terms promise "reply HELP". Verify configured in Twilio Console (Messaging Service → Opt-Out Management → Advanced Opt-Out Keywords) before next A2P review.

---

## 2026-04-27 — 4 New SEO Blog Posts

Added four search-targeted posts to `src/data/blogPosts.js` and registered them in `public/sitemap.xml`. Topics chosen for ranking potential on a small domain — templates and comparisons rank fastest; long-tail "[X] inventory" posts target lower-competition niches.

- **`free-church-inventory-template`** (2026-04-27) — keyword target: "church inventory template" / "free church inventory spreadsheet". Magnet post — describes columns, usage, when to outgrow.
- **`sortly-alternatives-for-churches`** (2026-04-30) — keyword target: "sortly alternatives" / "alternatives to sortly". Compares ChurchOpsHub, Asset Panda, Snipe-IT, Airtable, inFlow.
- **`church-av-equipment-inventory`** (2026-05-04) — keyword target: "church av equipment inventory" / "church audio equipment tracking". Practical system: categories, granularity rule, case-based checkout.
- **`vbs-supply-planning-checklist`** (2026-05-07) — keyword target: "vbs supply checklist" / "vbs inventory". Seasonal — published with lead time for May/June searches before VBS season.

Brings total published posts to 16. Build verified clean.

---

## 2026-04-27 — Error Handling Gap Closure

Surgical sweep to close the highest-value error-handling gaps after a three-agent audit. Verified before fixing: Sentry's default integrations already capture `window.onerror` + unhandled rejections (browser) and `process.uncaughtException` + `process.unhandledRejection` (node), so no global handler wiring needed. The real gaps were React boundary forwarding, swallowed CF error catches, server-side capture, and partial-failure UX.

- **React boundary → Sentry** — `App.jsx:29-46`: `PageErrorBoundary` gains `componentDidCatch(error, info)` that calls `Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } })`. React errors don't trigger `window.onerror`, so this was the only hole in browser-side capture.
- **Stop swallowing CF call errors** — replaced 11 `.catch(() => {})` patterns on `httpsCallable(...)` calls with logged catches that emit `console.error('[ChurchOpsHub] CF <name> failed', err)`. Sentry's `captureConsoleIntegration({ levels: ['error'] })` then forwards them. Sites: `JobsPage.jsx` (8 sites — sendJobAnnouncementEmails, sendJobCancelledEmails ×2, sendJobPosterNotification ×3, promoteFromWaitlist ×2; plus getJobSwapRequests Firestore call); `TasksPage.jsx` (sendTicketAssignedEmail, sendTaskMentionEmail).
- **Removed unused `errors` Firestore collection** — `useFirestore.js:35-44` `handleErr` no longer writes to top-level `errors`; `loadErrors` callback removed; `firestore.rules` `match /errors/{docId}` block removed; `SettingsPage.jsx` Owner-tab "Error Log" panel + state + handler removed (the panel was owner-only and the data fully duplicated Sentry, which already captures via `captureConsoleIntegration`). Drops one Firestore write per error.
- **`@sentry/node` on Cloud Functions** — `functions/package.json` adds `@sentry/node`; `functions/index.js` initializes Sentry at module load with the same DSN as the browser SDK (different SDK metadata routes them correctly), `tracesSampleRate: 0.1`, env tagged from `FUNCTIONS_EMULATOR`. 20 existing `console.error` sites now have `Sentry.captureException(err)` (or `r.reason` for `Promise.allSettled` rejection paths) appended. Default integrations include `onUncaughtExceptionIntegration` + `onUnhandledRejectionIntegration`, so any unhandled throw outside an explicit catch is also captured automatically.
- **Partial-failure UX on remaining `Promise.allSettled` sites** — `TasksPage.jsx`: `handleDeleteTask` now reports subtask + dependent-task cleanup failure counts (`'Task deleted. Cleanup of N dependent tasks failed — refresh to verify.'`); `handleBulkStatusChange` now reports recurring-next-task creation failures separately from the primary-status-change failure count.
- **Per-file photo upload errors** — `uploadPhotos` in `TasksPage.jsx` and `MaintenancePage.jsx` no longer aborts on the first per-file failure. Returns `{ urls, failed }` instead of `urls[]`; per-file failures `console.error` (so Sentry captures them with file name); callers flash partial-success messages (`'Uploaded X of Y photos; Z failed.'`). Three caller updates per page (handleAddTask/handleAddTicket + handleDetailPhotoAdd).
- **Stripe error UX** — `UpgradeGate.jsx` and `SettingsPage.jsx` (checkout + portal): error toasts now append `'If this keeps happening, contact jcvaught@gmail.com.'` so users have a recovery path instead of a dead-end generic message.

---

## 2026-04-27 — Tasks + Jobs Hub Bug Sweep #4

Nine bugs surfaced by a parallel three-agent sweep; verified against current code (several agent claims dropped as incorrect — login `uid` already set, waitlist auto-promotion already wired, ICS UID stability is correct per RFC 5545, `generateRecurringTemplateTasks` already idempotent).

- **Missing composite index for recurring-series queries** — `firestore.indexes.json` gains `(recurrenceGroupId ASC, scheduledDate ASC)` on `jobListings` (COLLECTION scope). `updateJobListingSeries` and `deleteJobListingSeriesFrom` would have failed in production with "index required".
- **Welcome email duplicate-send race** — `functions/index.js` `sendWelcomeEmail` now writes a `welcomeEmailSentAt: 'sending'` sentinel *before* `sgMail.send()`; the existing line-381 idempotency guard now short-circuits any CF retry between send-success and timestamp-update.
- **Compliance gate only checked first linked accessPerson** — `JobsPage.jsx` `handleSignUp` now uses `filter()` to evaluate every accessPerson linked to the user (rare but possible from data migration); records are unioned across all linked persons before the requiredAccessTypes check.
- **`promoteFromWaitlist` bypassed compliance + status checks** — CF now (a) refuses to promote into a non-`open` job (cancelled/closed) and (b) re-validates each waitlisted user's current `accessRecords` against the job's `requiredAccessTypes`. Ineligible users are *skipped* (left on waitlist) and the next eligible user is promoted instead. Pre-fetches accessPeople + accessRecords once outside the transaction.
- **Task detail modal stayed open with stale data on remote delete** — `TasksPage.jsx` `onSnapshot` now closes the modal and flashes "This task was deleted by another user" when the task disappears (previously it returned early and left the user looking at stale data, with saves potentially applying to the wrong doc).
- **Kanban reorder silently dropped failed writes** — `handleReorder` now counts `Promise.allSettled` rejections and flashes "Failed to reorder X of Y tasks — refresh to see correct order" on partial failure, matching the bulk-action partial-failure pattern from the 2026-04-25 audit fixes.
- **Cross-hub convert (→ Job and → Ticket) lacked rollback on backref failure** — `handleConvertToJob` and `handleCreateTicket` now wrap the second `updateTask` call in a try/catch; if the backref write fails, the just-created peer doc is deleted to avoid an orphan. If even cleanup fails, the toast names the orphan docId for manual cleanup.
- **Orphaned `linked*DocId` backrefs when peer deleted** — `deleteTask`, `deleteJobListing`, and `deleteTicket` in `useFirestore.js` now clear the reciprocal backref on the peer doc as a fire-and-forget step. `deleteTicket` and `deleteJobListing` fetch the doc first to discover the backref; `deleteTask` reads it from the passed `task` arg. UI no longer shows dead "Linked" chips after a peer is removed.

---

## 2026-04-26 — Walkthrough Bug Fixes (commits e59c275, f72a4fe)

**Phase 1 — Critical bugs**

- `src/useAuth.js` — all 6 `setUserProfile` calls now include `uid` alias alongside `id`; fixes 7 downstream broken features: Settings SMS/delegate save, My Compliance card display, PeopleAccess `createdBy`/`recordedBy`, App.jsx auto-link
- `src/pages/SuppliesPage.jsx` — removed undeclared `setPhotoFile(null)` call in Add Supply modal `onClose` (crashed on close)
- `src/pages/hubs/MaintenancePage.jsx` — added `config` to store destructure; fixes `config is not defined` crash when saving a ticket with a new assignee
- `src/pages/hubs/PeopleAccessPage.jsx` — added `open` prop to all 6 `<Modal>` instances; the entire People Access Hub was silently read-only
- `src/pages/hubs/JobsPage.jsx` — `handleSignUp` gating: `p.linkedUserId` → `p.userId`, `r.expiresAt` → `r.expiryDate`; access-gated sign-ups were always rejected even for qualified members
- `src/components/primitives/UpgradeGate.jsx` — replaced `mailto:` buttons with real Stripe `createCheckoutSession` checkout; updated copy from "30-day trial" to "Cancel anytime in Settings"

**Phase 2 — High-value medium issues**

- `src/pages/ReservationsPage.jsx` — replaced local `generateRecurrenceDates` with shared util from `date.js`; fixes `setMonth` month-end rollover bug (Jan 31 + monthly was → Mar 3 instead of Feb 28)
- `src/pages/hubs/AccountabilityPage.jsx` — audit progress now persisted to localStorage (keyed by `churchId`); refreshing mid-audit no longer loses work
- `src/pages/HubsPage.jsx` + `src/App.jsx` — hub card grid fades while subscription loads to prevent active→inactive flicker on hard refresh
- `src/utils/ical.js` — DTEND now bumps to next day when job end hour wraps past midnight (23:00 job no longer creates negative-duration events)
- `src/pages/ItemsPage.jsx` — Add Item modal stays open with error on photo upload failure instead of silently saving without photo; "In Use" removed from status filter (never set by UI)
- `src/pages/hubs/JobsPage.jsx` / `src/App.jsx` / `src/pages/PublicJobsPage.jsx` — Share Board URL now includes `&cc=CHURCH_CODE`; public Sign Up button pre-fills church code in registration form
- `src/pages/hubs/MaintenancePage.jsx` — added `recurringChildCreatedAt` guard to prevent duplicate recurring child tickets when drag+modal-save race occurs
- `src/App.jsx` — store error toast auto-dismiss bumped from 5s to 10s
- `firestore.rules` — waitlist updates now enforce ±1 size constraint server-side (previously client-only); deployed 2026-04-26

---

## 2026-04-26 — Twilio SMS Reminders + Legal Pages (commits b1409d9, 6b9bd6e, 1f7104e, 9a9b372)

**FB-03: SMS job reminders (Jobs Hub only)**

- `functions/index.js` — `twilio` npm package added; `getTwilioClient()` + `TWILIO_FROM` helpers added; `sendJobReminders` CF extended with SMS sweep after the email sweep: iterates the same user set, skips users without `phone`/`smsRemindersEnabled`, sends one SMS per opted-in user via `twilio.messages.create`; uses `Promise.allSettled` (non-blocking alongside email); SMS body includes job title/time/location + "Reply STOP to opt out"
- `src/pages/SettingsPage.jsx` — My Profile card gains SMS opt-in section (gated on `userHasJobsAccess`): phone number input, "Enable SMS reminders" checkbox (disabled until phone entered), Save button with "Saved!" flash, TCPA consent disclosure; `normalizePhone()` normalizes to E.164 on save; `phoneInput`/`smsEnabled`/`savingPhone`/`phoneSaved` state; `handleSavePhone()` saves `phone` + `smsRemindersEnabled` to `users/{uid}` via `updateUser`; clears `smsRemindersEnabled` if phone is cleared
- `functions/.env` — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` added (gitignored)

**Privacy + Terms standalone pages**

- `src/pages/PrivacyPage.jsx` (new) — Full privacy policy at `?privacy`; includes SMS section 6 with explicit no-share clause ("No mobile information will be shared with third parties for marketing"), BOLD STOP/HELP, sending number, opt-out retention note; correct `<h2>` heading hierarchy; `window.history.back()` nav
- `src/pages/TermsPage.jsx` (new) — Full ToS at `?terms`; Section 7 SMS Communications has all Twilio A2P required fields: program name, description, sending number (+1 571-540-7100), frequency (1–5/week), rates disclosure, BOLD HELP/STOP, support contact; Section 7 added to survival clause; `window.history.back()` nav
- `src/App.jsx` — `?privacy` and `?terms` routes added; `PrivacyPage`/`TermsPage` imported; existing auth-modal privacy section updated with Twilio SMS entry
- `public/sitemap.xml` — `?privacy` and `?terms` added
- Twilio A2P 10DLC registration in progress: TrustHub Business Profile approved 2026-04-27 ✓ (Bundle SID BU99f73c04fee0f43472f86f6bdd2a77fb); Brand registered 2026-04-26 ✓; Campaign submitted 2026-04-27 (Low Volume Mixed use case) — pending Twilio review (~1-3 days); Phone Number registration to follow once Campaign approved; sending number +1 571-540-7100. Twilio.org Impact Access program **approved** 2026-04-27 — $100 nonprofit credit + discounted pricing applied to the Fairfax Church of Christ account

---

## 2026-04-25 — Notable Gaps Polish (commit ad5e5a2)

4 items from the post-audit "notable gaps" list.

- **Task photo lightbox** — `PhotoGrid` gains a full-screen lightbox overlay; click any thumbnail to open; prev/next arrows, photo counter, Escape/arrow-key navigation; `cursor:zoom-in` on thumbnails; self-contained in `PhotoGrid` component (no TasksPage state added)
- **Job Hub delegate discoverability** — `📧 Delegates` button added to Job Board toolbar (admin/manager); opens a modal with the same chip-toggle UI from Settings → Profile, so admins can manage notification delegates without leaving the hub; `updateUser` added to JobsPage store destructure; `adminManagerUsers` memo + `handleSaveDelegates` added
- **Notes vs description clarity** — Placeholder text updated in both Add Task and Detail modals: description = "What needs to be done — scope, context, and acceptance criteria"; notes = "Follow-up reminders, reference links, or working notes"
- **Recurring announcements** — `repeatWeekly` boolean field added to announcement schema; form gains "Repeat weekly" checkbox that auto-fills `expiresAt` to 7 days from today when checked; `generateRecurringTemplateTasks` CF now sweeps `jobAnnouncements` collection group daily and advances `expiresAt` +7 days for expired `repeatWeekly` announcements; `firestore.indexes.json` updated with `jobAnnouncements/repeatWeekly` collection-group field override; functions + indexes deployed

---

## 2026-04-25 — Tier 3 Features (Session 5)

6 Tier 3 features: iCal export, cross-hub converts, compliance gate, swap requests, and public job board.

- **FB-02** `src/utils/ical.js` (new) + `TasksPage` + `JobsPage` — iCal / Google Calendar export: new `ical.js` utility with `exportTasksICS` and `exportJobsICS`; "Export ICS" button in Tasks toolbar (exports tasks with due dates) and Schedule toolbar in Jobs; `.ics` download via Blob; all-day events use `DTSTART;VALUE=DATE` with DTEND = day+1 per iCal spec; timed events parse "2:00 PM" style strings to `YYYYMMDDTHHMMSS`
- **FB-21** `TasksPage` + `JobsPage` + `useFirestore` — Cross-hub convert (job ↔ task): "→ Job" button in task detail modal (admin/manager) opens a mini-modal with title/date/location/spots; creates job via `addJobListing` then writes `linkedJobDocId` backref on task; "→ Task" button in job detail modal opens a mini-modal with name/due date/description; creates task via `addTask` then writes `linkedTaskDocId` backref on job; linked chips render in both detail modals; buttons hidden once linked
- **FB-23** `TasksPage` + `useFirestore` — Auto-create maintenance ticket from task: "→ Ticket" button in task detail (admin/manager); confirmation modal; creates ticket via `addTicket` then writes `linkedTicketDocId` backref on task; ticket title/description pre-seeded from task; button hidden once linked
- **FB-24** `JobsPage` + `useFirestore` — People Access compliance gate on job signup: admin can set `requiredAccessTypes[]` (background_check, key_assignment, certification, custom) checkboxes on each job form; before `signUpForJob`, client checks if user has a People Access person linked to their account and a valid (non-expired) record of each required type; blocks signup with a descriptive error message if not
- **FB-13** `JobsPage` + `useFirestore` + `firestore.rules` — Job swap/replacement requests: signed-up members see "Request Swap" button in job detail → opens modal with optional note → writes to new `jobSwapRequests` subcollection; admin sees swap requests section in job detail modal with per-entry dismiss; new Firestore rules for `jobSwapRequests` (member create-own, admin/manager read+delete); `getJobSwapRequests`, `addJobSwapRequest`, `deleteJobSwapRequest` added to `useFirestore.js`; swap requests auto-load when admin opens job detail
- **FB-01** `src/pages/PublicJobsPage.jsx` (new) + `App.jsx` + `firestore.rules` — Public job board for non-members: new `?jobs=CHURCH_ID&cn=ChurchName` route renders `PublicJobsPage` (unauthenticated); shows open job cards with title/description/date/location/pay/spots bar; roster names hidden; Sign Up buttons call `onGetStarted('register')`; CTA block at bottom; admin "Share Board" button in Job Board toolbar copies the URL to clipboard; `jobListings` Firestore rule updated to `allow read: if request.auth == null || isMember(churchId)`; rules deployed

---

## 2026-04-25 — Tier 2 Tasks Features (Session 4)

6 features from the Tasks session (FB-06, FB-08, FB-10, FB-14, FB-17, FB-25). Commit `5648b45`.

- **FB-06** `TasksPage` + `useFirestore` + `functions/index.js` — @-mentions in task comments: `@ Mention` button in comment input opens a dropdown of hub users; selecting a user appends `@Name` to the comment text; `@Name` substrings are highlighted teal when rendering comment text; `mentions: [uid]` array stored on comment doc; new `sendTaskMentionEmail` onCall CF sends a SendGrid notification to each mentioned user (respects `notifEnabled` + `subHasHub`)
- **FB-08** `TasksPage` + `csv.js` — Time tracking: `estimatedHours` and `actualHours` number fields on tasks; shown in TaskCard as `⏱ actual/estimate h`; inputs in Add Task (estimate only) and Detail modals; included in CSV export
- **FB-10** `TasksPage` — Manual Kanban reorder: cards in each column are now card-level drop targets; dropping a card onto another card in the same column writes ascending `sortOrder` to all tasks in that column; `sortOrder` takes precedence over the High-priority pin (which applies only to tasks without a `sortOrder`)
- **FB-14** `TasksPage` + `functions/index.js` — Recurring template auto-generation: Save-as-Template replaces the `window.prompt` with a proper modal including name, `autoGenerate` checkbox, frequency, and first-generate-on date; new `generateRecurringTemplateTasks` scheduled CF (8am Central daily) queries `taskTemplates` with `autoGenerate == true`, creates tasks via Admin SDK transaction, and advances `autoGenerateNextAt`
- **FB-17** `TasksPage` — Task velocity Insights view: "Insights" tab (admin/manager only) shows a 12-week `BarChart` of tasks created vs. completed per week (Recharts) and 4 summary stat cards including a 90-day average velocity
- **FB-25** `TasksPage` + `csv.js` — Ministry-scoped tasks: optional `ministry` field on tasks (populated from `settings.ministries`); indigo badge on TaskCard; ministry filter dropdown in the filter bar (persisted in saved views); ministry dropdown in Add Task and Detail modals; included in CSV export

---

## 2026-04-25 — Tier 2 Jobs Features (Session 3)

5 features from the Jobs session (FB-04, FB-11, FB-15, FB-16, FB-20). FB-13 (job swap) deferred to Tier 3.

- **FB-04** `JobsPage` + `useFirestore` + `functions/index.js` + `firestore.rules` — Waitlist when full: jobs add a `waitlist: [{uid, name, addedAt}]` array; "Join Waitlist" button when spots are full; "Leave Waitlist" / waitlist position for members; admin sees waitlist count on cards and a numbered waitlist section in the detail modal with per-entry removal; `withdrawFromJob` now handles both signups and waitlist entries; auto-promotion on withdrawal/admin-removal via new `promoteFromWaitlist` CF (atomic transaction + SendGrid email to promoted user); Firestore rule updated to allow member `waitlist`+`updatedAt` writes on open jobs
- **FB-11** `JobsPage` — Inline edit from Schedule: desktop Schedule table gets an "Edit" column with a per-row Edit button (admin/manager only); clicking it opens the Edit Job modal directly, bypassing the detail modal
- **FB-15** `JobsPage` — Volunteer Reports tab (admin/manager only): leaderboard table shows each volunteer's jobs signed up, attended count, no-show count, and total pay earned; derived from `jobListings` subscription in real time via `useMemo`
- **FB-16** `JobsPage` + `useFirestore` — Attendance tracking: admin/manager can mark each signup as attended or no-show after the job date passes; toggles appear in the detail modal's signup list for past jobs; stored as `signups[].attended: bool`; attendance summary shown in Reports leaderboard
- **FB-20** `JobsPage` — Per-job waiver/consent: optional `requiresWaiver` checkbox + `waiverText` field on job form; waiver text shown in job detail modal before signup; `window.confirm` gate before calling `signUpForJob`; `acknowledgedWaiverAt` timestamp stored per signup; admin sees 📋✓ / 📋? badge per signup in the detail modal

---

## 2026-04-25 — Tier 1 Quick-Win Features (Session 2)

7 features from the Opus feature suggestions (FB-05, FB-07, FB-09, FB-12, FB-18, FB-19, FB-22).

- **FB-05** `JobsPage` + `functions/index.js` — Per-job lead override: new `jobLead: { uid, name }` field on jobs; select in job form; displayed in job detail modal metadata; `sendJobPosterNotification` notifies job lead in addition to poster + delegates, with email deduplication via `Set` to prevent duplicate sends when lead = delegate
- **FB-07** `TasksPage` — Quick-add in Kanban: each column gets an inline text input at the bottom; pressing Enter or clicking `+` creates a task in that column with Medium priority and the user's default visibility, without opening the full Add modal
- **FB-09** `TasksPage` — Saved filter views: `taskSavedFilters` array stored on `users/{uid}`; Save View button appears alongside Clear when any filter is active; loads live from the `users` subscription; chip row below the filter bar lets users one-click reload or delete named views
- **FB-12** `TasksPage` — Bulk task assignment: assignee dropdown + Assign button in the bulk action bar; uses `Promise.allSettled` matching the existing bulk status pattern; skips tasks already assigned to the chosen user
- **FB-18** `ActivityLogPage` — Hub filter: new `ACTION_HUB` constant maps all action strings to hub names; Hub select (All / Inventory / Supplies / Jobs / Tasks / Maintenance) added as the first filter column; grid expanded from 3 to 4 columns
- **FB-19** `print.js` + `JobsPage` — Print-friendly roster: `printJobRoster(jobs, churchName)` function opens a styled HTML print window with a table of jobs and their signups; Print Roster button in Schedule tab toolbar alongside Show/Hide Past Jobs
- **FB-22** `TasksPage` — Link task to item/ticket: `linkedItemDocId` and `linkedTicketDocId` fields on task documents; two selects (Link to Item / Link to Ticket) in both the Add Task and Task Detail modals; flows through `taskToEdits` + dirty-state tracking; inventory items and open maintenance tickets from the store are used to populate the selects

---

## 2026-04-25 — Workflow Audit Bug Fixes (Session 1 / Tier 0)

All 11 non-deferred findings from the 2026-04-25 full 35-workflow audit. See `docs/AUDIT-TASKS-JOBS-2026-04-25.md` for full details.

- **F-01** `TasksPage` — `createNextRecurringTask`: roll back `nextRecurrenceCreatedAt` marker if `addTask` fails, so user can retry by re-completing the task
- **F-02** `TasksPage` — Bulk status change: `Promise.all` → `Promise.allSettled` with partial-failure reporting ("X of Y tasks updated; Z failed")
- **F-03** `TasksPage` — Bulk delete: same `Promise.allSettled` + partial-failure reporting
- **F-04** `functions/index.js` — `sendJobReminders`: added per-church `notifEnabled` check (was missing; tasks reminders already had this)
- **F-05** `functions/index.js` — `sendJobPosterNotification`: added `subHasHub(sub, 'jobs')` check alongside existing `notifEnabled` check
- **F-06** `JobsPage` — Removed `'completed'` from `terminalStatuses`; marking a job Completed no longer triggers a "Job Cancelled" email to signups
- **F-07** `functions/index.js` — `sendJobReminders`: now stamps `lastReminderSentDate` only on jobs where at least one email succeeded (mirrors `sendTaskDueReminders` pattern)
- **F-08** `functions/index.js` — `sendJobAnnouncementEmails`: added `notifEnabled` server-side check (client-only guard was bypassable)
- **F-09** `TasksPage` — `handleDeleteTask`: after deleting a task, queries for tasks that had it in `blockedBy` and removes the stale reference via `arrayRemove`
- **F-11** `useFirestore` — `addTask` / `updateTask`: private and shared task names no longer written to activity log `details.name` (activity log is readable by all members)
- **F-12** `useFirestore` + `JobsPage` — `deleteJobListing`: logs `JOB-###` (human-readable jobNumber) instead of an opaque Firestore docId

---

## Completed Phases

### ✅ Phases 1–3

- Code restructured into component/page/hook/utils files
- Subscription infrastructure (useSubscription, UpgradeGate, subscription doc on church creation)
- Maintenance Hub (rebuilt): kanban + list views, 6-status workflow (Backlog→Complete), drag-and-drop between kanban columns (admin/manager, native HTML5), multi-assignee, tag autocomplete (`maintenanceTags` via `arrayUnion`), photo uploads (Firebase Storage at `churches/{churchId}/maintenance/{docId}/`), real-time comment threads (subcollection), vendor directory, overdue date highlighting, `maint_viewMode` persisted to localStorage
- User Suggestions: all users can submit categorized suggestions (Feature Request / Bug Report / Other) from SettingsPage; stored in top-level `suggestions` collection (cross-church); owner-only report panel (tabbed: Suggestions / Error Log) gated by `['jcvaught@gmail.com', 'jvaught@fxcc.org'].includes(email)` in UI and by `request.auth.token.email in [...]` in Firestore rules; Error Log loads from top-level `errors` collection written by `handleErr()` in `useFirestore`

### ✅ Phase 4 — Insights Hub

- `InsightsPage.jsx`: 5 sections — Item Utilization, Ministry Breakdown, Seasonal Trends, Financial & Depreciation, Supply Burn Rate
- Recharts (BarChart, AreaChart, PieChart) for all visualizations
- Financial fields on items: `purchaseDate`, `purchasePrice`, `warrantyExpiry`, `estimatedValue` (collapsible in Add/Edit modals; shown in Detail modal)
- Straight-line depreciation over 5 years; manual override option; warranty expiry alerts (90-day window)

### ✅ Phase 5 — Team Hub

- User count display in Team Members header (e.g. "8 / 10 members"); upgrade banner for admins at/over the free plan 10-user cap
- Three roles: `admin` (full system access), `manager` (full operational access scoped to `managedMinistries[]`), `user` (day-to-day use only); distinct badge colors
- Edit Access modal in Settings > Team Members: role selector (Admin/Manager/User), hub checkboxes (church-active hubs only), managed ministries multi-select (manager only)
- `userCanSeeHub(hubName)` in `App.jsx`: admins see all; manager/user sees intersection of church `hubs[]` and `allowedHubs[]`; `allowedHubs: null` = inherit all (backward compat)
- Hub tabs hidden (not locked) when user's `allowedHubs` excludes them; Firestore rules unchanged

### ✅ Phase 6 — Coordination Hub

- `CoordinationPage.jsx`: checkout bundles (create/edit/delete, per-item availability indicator, bulk checkout skips unavailable items); EmailJS notification settings (Service ID, Public Key, template IDs for approved/denied, test-send button)
- `ReservationsPage.jsx`: recurring reservations (weekly/biweekly/monthly + end date, live instance count preview, `recurrenceGroupId` links series); recurring badge on cards; auto-email requester on approve/deny if EmailJS configured
- `useFirestore`: `bundles` collection subscription + CRUD; `config/notifications` subscription + `updateNotificationConfig`; `totalSubs` 9→11
- `@emailjs/browser` installed; email sent client-side via dynamic import on approve/deny actions

### ✅ Phase 7 — Accountability Hub

- `AccountabilityPage.jsx`: physical audit mode (select location → walk-through items, mark Present/Issue/Missing), audit history list with discrepancy reports, chain of custody timeline (per item, from activityLog), insurance-ready CSV export (all active items + financial fields)
- `useFirestore`: `audits` collection subscription + `addAudit` + `updateAudit`; `totalSubs` 11→12
- Feature gated via `hasHub('accountability')` + `UpgradeGate`; `📋 Audit` on mobile nav

### ✅ Phase 8 — Stripe Integration

- `functions/index.js`: three Cloud Functions — `createCheckoutSession`, `createPortalSession`, `stripeWebhook`
- `functions/package.json`: Node 22, firebase-functions v4, firebase-admin v12, stripe v14
- `firebase.json` updated with `functions` source config (`nodejs22`)
- `firebase.js` exports `app` for `getFunctions(app)` calls
- `SettingsPage.jsx`: Upgrade modal with All-In bundle, individual hubs, and team plans; "Manage Billing" button opens Stripe portal; team member cap banner opens Stripe checkout
- Webhook handles: `checkout.session.completed` (unlock hub/plan), `customer.subscription.updated` (sync status), `customer.subscription.deleted` (downgrade)
- Secrets stored in Google Secret Manager: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Price IDs hardcoded in `functions/index.js` `PRICE_IDS` (live Stripe prices)
- Webhook endpoint registered in Stripe: `https://stripewebhook-zzlqdukuqq-uc.a.run.app`
- Stripe billing portal configured at dashboard.stripe.com/settings/billing/portal

### ✅ Phase 9 — UX Polish & AI Features (2026-03-15)

- **All-In Bundle** ($29/mo) confirmed complete: price ID wired in `PRICE_IDS`, webhook handles `all_in` type (unlocks all hubs + unlimited users), upgrade modal in SettingsPage, plan label shows "All-In"
- **Barcode/QR scanning**: `📷 Scan` button in AppShell top nav (all tabs); `BarcodeScanner` component in `src/components/primitives/`; `@zxing/browser` dynamically imported; tries `facingMode: environment` first, falls back to any camera; parses QR URL `?item=` param or raw text as itemId; navigates to inventory tab + opens item detail; "No item found" flash if ID doesn't match
- **Bulk item actions**: `☑ Select` button in ItemsPage toolbar enters bulk mode; checkboxes on item cards; select-all toggle in navy action bar; bulk checkout (skips non-Available with warning), bulk return (single condition prompt, skips non-returnable with warning), bulk location change, bulk CSV export; `exitBulkMode` resets selection
- **AI item identification**: `✨ Identify Item` button appears in Add Item modal after photo selected; converts `photoFile` to base64 via `FileReader`; calls `identifyItem` Cloud Function (Claude Haiku 4.5 vision, max 100 tokens); pre-fills `itemForm.description`; `ANTHROPIC_API_KEY` stored in Google Secret Manager; `@anthropic-ai/sdk` added to `functions/package.json`

### ✅ Phase 10 — UX Polish: Duplication, Shortcuts, Public Requests (2026-03-15)

- **Item duplication**: `⊕ Duplicate` button in detail modal and desktop item rows (admin/manager); opens Add Item pre-filled with all fields, ID cleared for new unique assignment
- **Keyboard shortcuts**: `N` = new item, `/` = focus search, `Esc` = close modal; global `keydown` listener on `document`; suppressed in input/textarea/select; `N` only fires when no modal is open and user is admin/manager
- **Public item request form**: `PublicRequestPage.jsx` — no-auth public form shown when `?request=CHURCH_ID&cn=Church+Name` URL params present; fields: name, email, phone, item description, quantity, date needed, urgency, notes; honeypot spam protection (`website` hidden input); writes to `churches/{churchId}/publicRequests`; Firestore rule allows unauthenticated creates; admins see pending requests panel in ItemsPage with Dismiss button; "📥 Copy Request Form Link" in Settings > Team Members; `totalSubs` 12→13

### ✅ Phase 11 — Maintenance UX Improvements (2026-03-16)

- **Kanban drag-and-drop**: Cards draggable between columns (admin/manager only); native HTML5 drag-and-drop, no library; drop target highlights teal on hover; updates ticket `status` in Firestore on drop; correctly sets/clears `completedAt` when moving to/from Complete
- **Stat bar compact layout**: Summary stats replaced with compact inline strip (smaller padding, `fontSize:20` vs `fontSize:30`); "Backlog" renamed to "Open" and now counts all non-Complete/non-Cancelled tickets so Planning and On Hold are included
- **Modal close on save**: Ticket detail modal now closes after Save Changes (was staying open)
- **Ticket card redesign**: Removed ticket number from card header; assignee initials (teal circles, 2-char) now shown at top-left of each card; "Unassigned" shown in gray when no assignees; photo/due-date row kept at bottom
- **"My tickets" empty state**: When filter is active but user has no assigned tickets, shows a helpful card explaining how to self-assign with a "Show all tickets" button to clear the filter
- **RichTextarea component**: Toolbar with `• List` and `1. List` buttons added above Description, Notes, and Comments fields; toggles bullet/numbered prefixes on selected lines; stores plain text with `• ` / `1. ` prefixes; comment display uses `white-space: pre-wrap`; comment input changed from single-line `<input>` to `<textarea>` (Enter posts, Shift+Enter = newline)

### ✅ Phase 12 — Help Center & User-Facing Documentation (2026-03-16)

- **`HelpPage.jsx`**: Full user-facing help page with 12 sections — Getting Started, Inventory, Supplies, Reservations, Activity Log, Maintenance Hub, Insights Hub, Coordination Hub, Accountability Hub, Team Hub, Settings & Billing, FAQ
- **Accordion UI**: Collapsible sections (first item open by default); role badges (`admin`/`manager`/`user`), hub badges, Tip/Note callout blocks, keyboard shortcut formatting
- **Responsive layout**: Sticky sidebar on desktop with active-section highlighting via `IntersectionObserver`; horizontal scrollable section tab bar on mobile
- **Routing**: Accessible via `?help` URL param (same pattern as `?request=`); `← Back to App` button calls `window.history.back()`
- **Entry points**: "Help" link in LandingPage nav (desktop only); "Help Center" link in in-app footer; "Help Center" card in Settings page (above Danger Zone)
- **Support email**: All user-facing `jcvaught@gmail.com` references replaced with `churchopshub@gmail.com` across LandingPage, SettingsPage, UpgradeGate, and App.jsx (ToS + Privacy Policy contact sections); `isOwner` access control check left unchanged
- **Registration UX**: Split "Your Name" field into separate First Name + Last Name fields on all registration forms (register, createChurch); `useAuth` stores `firstName`, `lastName`, and `name` on user profiles; `registerWithGoogle` splits `displayName` on first space; backward-compatible (`name` field still used everywhere for display)
- **Two-character initials**: `initials(name)` helper in MaintenancePage derives two-char initials (e.g. "JS" for John Smith); assignee avatar circle size increased 22→26px with `title` tooltip; SettingsPage team member avatars updated with same logic

### ✅ Phase 13 — Maintenance Hub Enhancements (2026-03-16)

- **Checklist sub-tasks**: `checklist: [{id, text, done}]` field on tickets; add/remove/toggle items in ticket detail modal (Enter to add); checklist progress badge `✓ X/Y` shown on ticket cards; checklist items reset to `done: false` when a recurring ticket auto-creates; checklist persists immediately on toggle (auto-save) and on Save Changes for add/remove
- **Recurring tickets**: `recurrence` field (`weekly` | `biweekly` | `monthly` | `quarterly` | `annually` | null); dropdown in Add and Detail modals; completing a recurring ticket auto-creates the next ticket with `calculateNextDue()` (adds interval to `dueDate` or today); new ticket inherits all fields with checklist reset; `🔁 Label` badge shown on cards; `RECURRENCE_OPTIONS` + `RECURRENCE_LABELS` constants at top of file
- **Sort options**: `sortBy` state (`createdDesc` | `createdAsc` | `priority` | `dueDate`) + dropdown in View Toggle row; `sortedTickets` useMemo applied after `filteredTickets`; used in both kanban (within-column) and list (within-group) views; default is `createdDesc` (matches Firestore order)
- **Email assignee on assignment**: when saving a ticket, detects newly added assignees (excludes self); sends EmailJS notification if `notificationConfig.enabled && templateAssigned` is set; template variables: `to_email`, `to_name`, `ticket_name`, `ticket_number`, `priority`, `due_date`, `assigned_by`; new **Template ID — Ticket Assigned (Maintenance)** field added to Coordination → Notification Settings (`templateAssigned` key in `config/notifications` doc)

### ✅ Phase 14 — UI Polish (2026-03-16)

- **Input focus indicator**: single global CSS rule in `index.html` adds teal border + subtle glow (`box-shadow: 0 0 0 3px rgba(42,125,110,0.12)`) on focus for all inputs, selects, and textareas; overrides inline `outline:none` from `inp` token without touching each component
- **Checklist auto-save**: checkbox toggles in the ticket detail modal now immediately persist to Firestore via `updateTicket` (optimistic — local state updated first, Firestore write fires async); previously required clicking Save Changes
- **Checklist empty state**: checklist area in detail modal wrapped in a dashed border box (`border: 1px dashed B.sand, borderRadius:10, padding:12px 14px`) for visual containment rather than bare floating text
- **Sort control relocated**: Sort dropdown moved from filter bar to the View Toggle row (next to Kanban/List toggle) with a "Sort:" label; filter bar reduced from 5 to 4 controls; ticket count pushed to `marginLeft:auto` on the right
- **Responsive Add Ticket grid**: Priority / Due Date / Recurrence row switches from `1fr 1fr 1fr` to `1fr 1fr` on mobile with Recurrence wrapped in `gridColumn:'1/-1'` div to span full width; prevents field crushing on phones
- **Recurrence + Due Date paired**: detail modal Due Date / Actual Cost row expanded to 3-col grid (Due Date | Actual Cost | Recurrence) on desktop, 2-col on mobile; standalone Recurrence FF below Notes removed
- **Badge sizes**: recurrence (`🔁`) and checklist progress (`✓ X/Y`) badges on ticket cards bumped from `fontSize:10` to `fontSize:12`
- **Opacity consistency**: login button disabled opacity corrected from `.6` to `.5` (matches all other buttons in the app)

### ✅ Phase 15 — Security, Performance & Code Quality Audit (2026-03-16)

- **`identifyItem` churchId validation**: after auth check, verifies caller has a Firestore user profile with a `churchId` — prevents unauthorized AI API credit usage
- **Firestore rules — church doc reads**: split `allow read` into `allow get` (creator/member only) + `allow list` (any authenticated user, for join-by-code query); narrows direct document reads
- **Storage rules — active check**: `allow write` now also requires `userProfile().active == true` via a Firestore helper function; deactivated users can no longer upload photos
- **Stripe webhook — church existence check**: `checkout.session.completed` handler verifies the church doc exists before writing subscription data; logs warning and returns 200 on missing church
- **Owner email sync comments**: `OWNER_EMAILS` constant in `functions/index.js` now has comments pointing to the other two hardcoded locations (`firestore.rules`, `SettingsPage.jsx`)
- **`console.error` → `handleErr`**: `logActivity()` and `addMaintenanceTags()` now use the shared `handleErr()` helper (Sentry + error collection write + toast); `loadErrors()` keeps `console.error` + `setError` to avoid a write-loop
- **Bulk action confirmations**: `window.confirm()` dialogs added before `handleBulkCheckout`, `handleBulkReturn`, and `handleBulkLocation` execute Firestore writes
- **Activity log date validation**: `dateTo` onChange handler now clears the field (rather than silently accepting) if the selected date is before `dateFrom`
- **`useMemo` for ReservationsPage**: `activeItems` and `filtered` lists wrapped in `useMemo` with proper dependency arrays
- **Date comparison — Date objects**: `form.returnDate < form.eventDate` changed to `new Date(form.returnDate) < new Date(form.eventDate)` for explicit date comparison
- **Disabled button opacity standardized**: ActivityLogPage pagination buttons changed from `.4` to `.5` to match all other disabled buttons in the app
- **ARIA labels on icon-only buttons**: `aria-label` added to `📷 Scan` (App.jsx), `⬇ Export CSV` (ItemsPage, SuppliesPage, ReservationsPage), `☑ Select` (ItemsPage), `⊕ Dup/Duplicate` (ItemsPage), `⬇ Export` (bulk bar)
- **Status constants**: `src/utils/constants.js` created with `ITEM_STATUS`, `RES_STATUS`, `TICKET_STATUS` string enums; Dashboard, ItemsPage, ReservationsPage, and App.jsx updated to import and use them
- **`today` hoisted out of map**: `new Date().toISOString().split("T")[0]` computed once per render in ReservationsPage (above the JSX), not inside each `.map()` iteration

### ✅ Phase 16 — Full App Code Review & Bug Sweep (2026-03-17)

Systematic walkthrough of every page looking for logic bugs, missing guards, and UX gaps before tester session.

- **Audit trail gaps**: `updateItem()` and `updateSupply()` in `useFirestore` both accepted `userId`/`userName` but never called `logActivity()` — item edits and supply edits were silently omitted from the activity log; both now log `edit_item` / `edit_supply`
- **Month-end date rollover**: JavaScript `setMonth(n+1)` rolls Jan 31 → Mar 3; fixed in `calculateNextDue()` (MaintenancePage) and `generateRecurrenceDates()` (ReservationsPage) by clamping to `lastDay` after advancing the month
- **Kanban drag missing recurrence**: `handleDrop()` in MaintenancePage was the only completion path that didn't auto-create the next recurring ticket on drag-to-Complete; fixed by copying full recurrence logic into `handleDrop`
- **Recurring reservation conflict check**: `handleAdd()` only checked the base date for conflicts; remaining generated dates in a series were unchecked; now loops all dates before creating any, with early return and specific conflict message
- **Use-exceeds-stock**: `handleUse()` in SuppliesPage showed a warning but didn't block submission; `useSupply` in the hook silently clamped via `Math.max(0, ...)` — blocked at the UI layer before the hook is called
- **Missing audit trail for supply edits**: `updateSupply()` signature changed to `(docId, updates, userId, userName)` and now logs `edit_supply`; all callers updated
- **Activity log missing action types**: `edit_item` and `edit_supply` added to icon/label/color maps in both ActivityLogPage and Dashboard
- **Dashboard badge bug**: Checked Out items were showing "Under Repair" badge when overdue; badge now always shows "Checked Out" (overdue state is shown separately in the alert section)
- **Dashboard pending reservations**: `r.purpose` fallback to `r.eventName` — reservations created via the request form use `eventName`, not `purpose`
- **Supply ID duplicate check**: `handleAdd()` in SuppliesPage now checks for an existing supply with the same ID before saving (parallel to ItemsPage's existing check)
- **Supply minQuantity negative**: `handleEditSupply()` now rejects negative minQuantity values
- **Item duplicate ID on edit**: `handleEdit()` in ItemsPage checks for ID collisions excluding the current item's own doc
- **Item recovery value negative**: `handleRetire()` rejects negative recovery values
- **Public request dismiss confirmation**: `window.confirm()` added before `dismissPublicRequest()`
- **Recurring ticket notes**: `notes` field was silently dropped when auto-creating the next recurring ticket; now propagated
- **Escape key exits bulk mode**: Esc handler in ItemsPage now exits bulk select mode first before closing any modal
- **`N` key clears financial panel**: `setShowFinancial(false)` added before `setShowAdd(true)` in the keyboard shortcut handler
- **Modal reset fixes**: MaintenancePage — new comment cleared on detail modal close; cancel clears comments/input/checklist state; add vendor form reset on close
- **EmailJS failure visibility**: Three `console.error` calls on email send failure changed to `flash()` so users see a visible prompt to notify manually (MaintenancePage assignee email, ReservationsPage approve/deny email)
- **Vendor specialty in detail modal**: vendor dropdown in ticket detail now shows specialty suffix (matching Add Ticket modal)
- **Sort preference persisted**: `sortBy` in MaintenancePage now persists to `localStorage` under `maint_sortBy` (parallel to `maint_viewMode`)
- **Checklist input focus restored**: `useRef` added to checklist input; focus returns to input after adding a checklist item
- **`dateTo` input `min` attribute**: replaced the programmatic "clear if invalid" approach with `min={dateFrom || undefined}` — browser blocks invalid selection at the native date picker level
- **SettingsPage — church code uniqueness**: `handleChangeCode()` now async; queries Firestore for `where('churchCode', '==', code)` before saving to prevent two churches sharing a code
- **SettingsPage — case-insensitive list dedup**: `addToList()` now lowercases both sides when checking for duplicates so "Sanctuary" and "sanctuary" can't both be added
- **SettingsPage — church code input uppercase**: `onChange` now calls `.toUpperCase()` so the stored value always matches the visual display (CSS `textTransform` was visual-only)

### ✅ Phase 17 — Mobile Audit & Responsive Fixes (2026-03-17)

- **Modal safe-area-inset**: bottom-sheet modals on iPhone X+ now include `env(safe-area-inset-bottom, 0px)` in their bottom padding so action buttons are never hidden behind the home indicator
- **Error toast clearance**: toast `bottom` raised from `80` to `96` — on iPhone X the nav bar is ~82px tall (48px buttons + 34px safe area); the toast was appearing behind it
- **SuppliesPage card layout**: button row gets `flexShrink: 0`; "Min / Restocked" text gets `minWidth: 0, overflow: hidden, textOverflow: ellipsis` so long meta text can't compress action buttons off-screen
- **ActivityLogPage — added `isMobile`**: filter bar reorganized from fixed-width flex items into a column layout — Search full-width on row 1; Action + From in a 2-col grid on row 2; To full-width on row 3; expanded detail left indent reduced 52px → 14px on mobile
- **Dashboard stat cards**: switched from `flexWrap` to a 2-col CSS grid on mobile so all 5 stats have consistent equal widths (previously 2+2+1 with uneven sizing)
- **`Stat` component**: mobile-aware padding (`14px 16px`), icon size (`15px`), and value font (`24px`); `flex`/`minWidth` props removed (not needed in a grid parent)
- **CoordinationPage — added `isMobile`**: notification config form and checkout bundle form both use `gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'`; at 162px per column on a 375px phone the "Template ID — Ticket Assigned (Maintenance)" label was wrapping to 3 lines and date inputs were hard to interact with

### ✅ Phase 18 — UX Polish & Settings Inline Editing (2026-03-17)

- **Error boundary added**: `PageErrorBoundary` (class component) wraps the page content area in `App.jsx`; keyed by `tab` so it resets on navigation. Production render crashes show an error message with stack trace instead of a blank screen.
- **Settings list inline editing**: Locations, Ministries, and Tags lists now support inline rename — each row has an Edit button that swaps the label for a text input (pre-filled); Save/Cancel via button or keyboard (Enter/Escape); duplicate-name check on save.

### ✅ Phase 19 — Production Crash: Full Investigation & Fix (2026-03-17)

The All Items tab crashed on every production load with a blank screen. Four separate issues stacked on top of each other.

**Step 1 — Add error boundary to surface the actual error.**
Added `PageErrorBoundary` (class component with `getDerivedStateFromError`) wrapping the page area in `App.jsx`, keyed by `tab` so it resets on navigation.

**Step 2 — First crash: `ReferenceError: Cannot access 'Pn' before initialization`**
`ItemsPage` had 32 `useState` calls and 30+ imports. esbuild's minifier assigns short names sequentially across the entire flattened Rollup bundle without scope analysis. The module-scope `ITEM_STATUS` constant and a function-scope bulk-action `useState` boolean both got assigned `Pn`.

**Step 3 — Collisions kept shifting: `Pn` → `on` → `Se` → `be`**
Every `useState` consolidation just shifted which two-char name collided. Switching to Terser with `mangle: true` made no difference. Code splitting helped but didn't fully fix it.

*Actual fix:* `vite.config.js` set `mangle: false` in `terserOptions`. With identifier mangling disabled, all variable names stay as their original source names — structurally impossible to collide.

**Step 4 — New crash: `ReferenceError: Cannot access 'bulkModal' before initialization`**
With `mangle: false` preserving real names, a genuine source-level TDZ appeared: a `useEffect` dependency array referenced `bulkModal`, `bulkMode`, `isAdmin`, `isManager` — all declared *below* that `useEffect` in the component body.

*Fix:* moved all `useState` declarations and derived values that appear in `useEffect` dependency arrays to the top of the component, before any `useEffect` call.

**Final `vite.config.js` build config:**
```js
build: {
  minify: 'terser',
  terserOptions: { compress: true, mangle: false },
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
      },
    },
  },
}
```

**Post-fix audit (2026-03-17):** Full hook-ordering audit run across all 15 source files. No further violations found.

### ✅ Phase 20 — Delete Actions & Supply Tags (2026-03-17)

- **Item delete**: `deleteItem(docId, itemId, userId, userName)` added to `useFirestore`; permanently removes item from Firestore and logs `delete_item` to activity log; **Delete** button (dark red, admin only) in item detail modal footer alongside Retire; `window.confirm` dialog before executing
- **Supply delete**: `deleteSupply(docId, supplyId, userId, userName)` added to `useFirestore`; permanently removes supply and logs `delete_supply`; **Delete** button (admin only) on each supply card; `window.confirm` dialog before executing
- **Tags on supplies**: `tags[]` field added to supply data model; tag selection (pill-toggle UI, same as items) in Add and Edit Supply modals; tag filter pills in the search bar (toggle single-tag filter); tag pills displayed on supply cards; all sourced from `settings.tags` — hidden if no tags configured
- **Quantity correction in Edit Supply**: admin-only **Current Quantity** field in the Edit Supply modal allows correcting a counting mistake without creating a misleading use/restock log entry; validates non-negative; saved via existing `updateSupply` call

### ✅ Phase 21 — AI Supply Identification (2026-03-17)

- **`✨ Identify Item` in Add Supply modal**: single button opens the device camera/file picker; on photo selection, automatically converts to base64 and calls the existing `identifyItem` Cloud Function (Claude Haiku vision); pre-fills the Description field; photo is used for identification only and is **not stored**
- Button label stays `✨ Identify Item` throughout (no "upload" language to avoid implying the photo is saved); button shows `Identifying…` and is disabled while the Cloud Function runs
- Reuses the same `identifyItem` Cloud Function and `ANTHROPIC_API_KEY` secret already in place for items; no backend changes required

### ✅ Move Between Inventory and Supplies (2026-03-18)

- **Admin-only** action available in two places:
  - Supply Edit modal: "Move to Inventory →" link at the bottom opens a modal asking for an Item ID (3+ chars, duplicate-checked); status defaults to Available
  - Item detail modal: "Move to Supplies →" link below the action buttons opens a modal asking for a Supply ID, starting qty, min qty, and unit
- Description, location, ministry, and tags carry over automatically in both directions
- Original record is deleted after the new one is created; both steps log through existing `addItem`/`addSupply` + `deleteItem`/`deleteSupply` activity logging
- FAQ entry added to HelpPage: "What if someone added something to the wrong list?"

### ✅ Location Report — Insights Hub (2026-03-18)

- New **📍 Location Report** section in Insights Hub
- Location dropdown (populated from `settings.locations`); selecting a location shows all active items and all supplies at that location in two separate tables
- Items table: ID, description, status (color-coded), ministry
- Supplies table: ID, description, quantity (red if below minimum), min qty, ministry
- Stat summary: item count + supply count
- **⬇ Export CSV** button downloads a combined file (Type, ID, Description, Status/Qty, Ministry, Tags)
- HelpPage updated with Location Report accordion in the Insights Hub section

### ✅ iOS Safari Compatibility (2026-03-18)

- **PWA standalone mode**: Added `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` (`black-translucent`), and `apple-mobile-web-app-title` meta tags to `index.html` so the app runs as a true full-screen standalone app when added to the iPhone home screen
- **Notch / safe-area support**: Added `viewport-fit=cover` to the viewport meta tag so `env(safe-area-inset-*)` extends background to screen edges on notched and Dynamic Island devices (already used in Modal and bottom nav styles)
- **Input auto-zoom prevention**: Added a CSS `@supports (-webkit-touch-callout: none)` rule forcing `font-size: 16px` on all `input`, `select`, and `textarea` elements on iOS only — iOS Safari auto-zooms inputs with font-size < 16px on focus; desktop rendering unchanged (still 14px via inline styles)
- **Overscroll / pull-to-refresh**: Added `overscroll-behavior: none` to the `<body>` element to prevent accidental Safari pull-to-refresh when users scroll to the top of a page
- **Stable viewport height**: Changed `Spinner.jsx` from `height: 100vh` to `height: 100svh` (small stable viewport height, which excludes the collapsing address bar) to prevent the loading screen from being clipped on initial load in Safari
- **Clipboard silent failure**: Added `.catch(() => {})` to all three `navigator.clipboard.writeText()` calls in `SettingsPage.jsx` — iOS requires user permission for clipboard access and rejects silently on denial; without the catch, this produced an unhandled promise rejection

### ✅ SEO: Sitemap, Meta Tags, Schema Markup & Blog (2026-03-18)

- **`public/robots.txt`**: Allows all crawlers; disallows `?request=`, `?signup`, `?invite`; references sitemap at `https://churchopshub.com/sitemap.xml`
- **`public/sitemap.xml`**: Static sitemap with all 6 public URLs — `/` (priority 1.0), `/?help` (0.6), `/blog` (0.8), and all 3 blog post slugs (0.7 each); `changefreq: monthly`
- **`react-helmet-async`**: Installed and `<HelmetProvider>` wraps the app in `main.jsx`
- **`src/components/SEO.jsx`**: Reusable component wrapping `<Helmet>`; sets `<title>`, `<meta name="description">`, `<link rel="canonical">`, Open Graph tags (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name`), Twitter Card tags, and an optional JSON-LD `<script>` block; accepts `title`, `description`, `canonical`, `ogImage`, `ogType`, `jsonLd` props; canonical URLs are absolute (`https://churchopshub.com` + path)
- **`LandingPage.jsx`**: `<SEO>` added with optimized title/description; SoftwareApplication JSON-LD schema (`@type: SoftwareApplication`, `applicationCategory: BusinessApplication`, free `Offer`); pain points paragraph added to hero section calling out spreadsheets and Planning Center's lack of inventory features; Blog link added to nav and footer
- **`HelpPage.jsx`**: `<SEO>` added with `canonical="/?help"`
- **`src/data/blogPosts.js`**: Array of 3 post objects (`slug`, `title`, `description`, `date`, `keywords`, `content` as markdown string); posts are ~600-800 words of real copy with h2/h3 heading structure
  - *Why Churches Need Dedicated Inventory Management* — lost equipment, no accountability, reservation conflicts, deferred maintenance
  - *Moving Beyond Spreadsheets: Church Inventory Best Practices* — version/history/access/reservation/mobile problems with spreadsheets; 7 best practices
  - *What Planning Center Can't Do: Managing Your Church's Physical Assets* — PCO's people/events focus, common workarounds (Resources, fake People records, spreadsheets), what dedicated inventory adds, how both systems coexist
- **`src/pages/BlogIndex.jsx`**: Blog listing page at `/blog`; reuses LandingPage nav pattern; post cards with hover shadow; CTA section; footer with nav links; `<SEO ogType="website">`
- **`src/pages/BlogPost.jsx`**: Single post layout at `/blog/:slug`; `renderContent()` converts markdown headings and paragraphs to styled JSX; BlogPosting JSON-LD schema; related articles section (other posts); CTA card; 404-style fallback for unknown slugs; `<SEO ogType="article">`
- **`App.jsx`**: Pathname routing added before query-param checks — `window.location.pathname === '/blog'` → BlogIndex; `.startsWith('/blog/')` → BlogPost with extracted slug; works because `vercel.json` already rewrites all paths to `index.html`

### ✅ Auto-Generated IDs & Inline Tag Creation (2026-03-18)

- **Auto-generated Item/Supply IDs**: Description field moved to top of Add modals (items and supplies); as the user types a description, the ID field auto-fills with a `PREFIX-NNN` suggestion derived from the first meaningful word of the description (e.g. `Wireless Microphone` → `MIC-001`). The prefix is the first 3 alphanumeric characters of the first non-article word, uppercased; the number is the next available for that prefix among existing records. The field remains fully editable — any manual keystroke locks it and stops auto-updates. Also fires on AI Identify and when duplicating an item. Duplicate now pre-generates an ID from the copied description instead of leaving the field blank.
- **Inline tag creation for items**: Add/Edit Item modals now include a "New tag…" input + "+ Add" button below the tag pills, matching the same feature already in supplies. New tags are saved to `settings.tags` and auto-selected. Enter key also triggers add. The `tagOptions.length > 0` gate removed — tag section always visible.
- **FXCC data migration**: All 61 supply IDs and the single item ID migrated via Firestore REST API to consistent category-prefix scheme: `ENV-001–014` (envelopes), `PPR-001–008` (paper), `MED-001–021` (medical/first aid), `OFF-001–005` (office equipment), `LBL-001–002` (labels), `STA-001–004` (stationery/cards), `CLN-001–004` (cleaning), `GEN-001–003` (general), `STPLR-01` (stapler item).

### ✅ Security Hardening (2026-03-20)

Full security audit findings addressed across all layers.

- **Firestore granular rules** (`firestore.rules`): Replaced catch-all `match /{document=**}` wildcard with explicit per-subcollection rules for all 10+ collections. Key grants: `config/subscription` — client create only at church creation, no client updates (webhook/Admin SDK only); `activityLog` — create-only, no updates/deletes (immutable audit trail); `items`/`supplies` — members can update (checkout/return/usage) but only admins+managers can create/delete; `maintenanceTickets/comments` — any member can add, only admins+managers can edit/delete. Refactored helpers to use a single `userData()` function (one `get()` call per request).
- **User self-escalation fix** (`firestore.rules`): Profile `create` rule requires `role == 'user'` except church creators who may set `role == 'admin'` only when `churchId == uid + '-church'`. Self-`update` rule blocks changes to `role`, `churchId`, `active`, and `allowedHubs`; only admins in the same church can modify those fields.
- **Remove `allowedHubs` from registration** (`src/useAuth.js`): Stripped `allowedHubs` parameter from `register` and `registerWithGoogle` — new users can no longer pre-set their own hub access at signup.
- **XSS fix — HTML escaping in print functions** (`src/utils/print.js`, `src/pages/hubs/InsightsPage.jsx`): Added exported `escapeHtml(str)` helper; applied to all Firestore-derived values interpolated into `document.write()` HTML in `printLabel`, `printInventory`, and `printInsightsReport`.
- **Security headers** (`vercel.json`): Added `Content-Security-Policy` (self + Google Fonts + Firebase + Stripe + EmailJS), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` via Vercel `headers` config.
- **Cloud Functions URL allowlist** (`functions/index.js`): `validateRedirectUrl()` checks `new URL(url).origin` against `ALLOWED_REDIRECT_ORIGINS`; applied to `successUrl`/`cancelUrl` in `createCheckoutSession` and `returnUrl` in `createPortalSession`. Webhook signature failure response changed from `err.message` to generic `'Invalid webhook signature'`.
- **Supply quantity race condition** (`src/useFirestore.js`): `useSupply` and `restockSupply` now use `runTransaction` to atomically read the current quantity and write the new value, preventing concurrent updates from producing incorrect totals.
- **Storage rules hardening** (`storage.rules`): Write rule now enforces `request.resource.size < 5 * 1024 * 1024` (5MB max) and `request.resource.contentType.matches('image/.*')` (images only).
- Rules deployed to Firebase (`firestore:rules,storage`).

---

## Public Launch Checklist (All Resolved)

### ✅ Critical

- **Firestore security rules** — scoped to user's `churchId` via `get()` lookup; admin-only writes for role/active changes.
- **Storage security rules** — same `churchId` scoping via `firestore.get()`; IAM role granted.
- **Password reset UI** — "Forgot password?" link on login screen; `sendPasswordResetEmail()` in `useAuth.js`.

### ✅ Important

- **Email verification** — `sendEmailVerification()` called after `createChurch` and `register` (skipped for Google sign-in). Dismissible yellow banner in `AppShell` for unverified users with Resend button; `resendVerification()` exposed from `useAuth`.
- **Church creation rate limiting** — honeypot hidden input in Create Church form (silently rejected if filled); 1-church-per-email check in `createChurch()` queries `churches` by `createdBy == uid` before proceeding.
- **Terms of Service & Privacy Policy** — ToS checkbox on all three registration forms (register, googleRegister, createChurch); submit button disabled until checked. Clicking "Terms of Service" or "Privacy Policy" opens a modal overlay within `AuthScreen` with full content; "I Agree" button in modal footer auto-checks the checkbox.

### ✅ Polish

- **Item ID minimum length** — `handleAdd` and `handleEdit` in `ItemsPage.jsx` reject IDs shorter than 3 characters with a flash message; Add button disabled until valid.
- **Onboarding flow** — 3-step modal in `AppShell` fires when `userProfile.role === 'admin' && !config?.onboardingComplete && items.length === 0`; steps: Welcome → Settings (locations/ministries) → Add first item; any dismiss/skip/complete writes `onboardingComplete: true` to `config/main`.
- **Account & data deletion** — "Delete Account" button in Settings > Danger Zone; modal with `type DELETE` confirmation + password field; reauthenticates then deletes Firestore user profile + Firebase Auth account.
- **Landing / marketing page** — `LandingPage.jsx` shown to unauthenticated visitors.
- **Custom domain** — `churchopshub.com` configured in Vercel; added to Firebase Authentication authorized domains; `authDomain` updated in `src/firebase.js`. `vercel.json` added to proxy `/__/auth/*` to `church-inventory-9615c.firebaseapp.com`.
- **Error monitoring** — Sentry integrated in `main.jsx` with browser tracing (20% sample rate).

---

## Known Issues & Tech Debt (All Resolved)

### Security

- ~~**Firestore rules wildcard — any member could write any subcollection**~~ ✅ Fixed (2026-03-20) — wildcard replaced with granular per-subcollection rules; `config/subscription` client-write denied; `activityLog` immutable; role escalation blocked.
- ~~**User self-escalation via direct Firestore write**~~ ✅ Fixed (2026-03-20) — `create` requires `role == 'user'`; `update` blocks changes to `role`/`churchId`/`active`/`allowedHubs`.
- ~~**Users Firestore rule leaks cross-church data**~~ ✅ Fixed — reads now require `request.auth.uid == userId || userChurchId() == resource.data.churchId`.
- ~~**Suggestions UI gate uses wrong email source**~~ ✅ Fixed — `isOwner` now uses `user?.email` from the Firebase Auth object (verified token).
- ~~**Church code lookup scans entire `churches` collection**~~ ✅ Fixed — replaced full collection scans with `query(collection(db, 'churches'), where('churchCode', '==', ...))`.

### UX / Data Integrity

- ~~**Maintenance ticket detail modal stays open after Save**~~ ✅ Fixed
- ~~**No confirmation dialog before deactivating users, changing roles, or changing the church code**~~ ✅ Fixed
- ~~**Photo upload failure is silent**~~ ✅ Fixed
- ~~**Return date not validated against checkout date**~~ ✅ Fixed
- ~~**Supply quantities allow negatives**~~ ✅ Fixed
- ~~**Item ID has no minimum length**~~ ✅ Fixed
- ~~**Firestore errors are silent**~~ ✅ Fixed — `handleErr()` helper + toast + Sentry
- ~~**QR code depends on external API**~~ ✅ Fixed — `qrcode` npm package, client-side
- ~~**Activity log capped at 20 entries**~~ ✅ Fixed — load-more button
- ~~**No copy-to-clipboard on church code**~~ ✅ Fixed

---

## Performance & Efficiency (All Resolved)

### Firestore

- ~~**`loadUsers` scans entire users collection**~~ ✅ Fixed — real-time `onSnapshot` with `where('churchId', '==', churchId)`.
- ~~**Ticket numbering is O(n) per new ticket**~~ ✅ Fixed — `runTransaction` to atomically increment `maxTicketNumber` on `config/main`.
- ~~**Suggestions load has no limit**~~ ✅ Fixed — `.limit(100)` on `loadSuggestions()` query.

### React

- ~~**No `useMemo` on expensive derived state**~~ ✅ Fixed — wrapped in Dashboard, ItemsPage, ReservationsPage.
- ~~**`useWindowWidth` fires on every pixel during resize**~~ ✅ Fixed — 100ms debounce in `useMobile.js`.
- ~~**Bulk location change writes `_docId` to Firestore**~~ ✅ Fixed — passes only `{ location: bulkNewLoc }`.
- ~~**Bulk operations are sequential**~~ ✅ Fixed — `Promise.all` in all three bulk handlers.
- ~~**`loadChurches` dead code in `useFirestore`**~~ ✅ Removed.

---

## Post-Phase-21 Updates (2026-03-18 onwards)

### 2026-03-18

- Location Report added to Insights Hub
- Move between Inventory and Supplies (admin)
- Auto-generated IDs & inline tag creation for items
- iOS Safari compatibility fixes
- SEO: sitemap, robots.txt, meta tags, schema markup, blog

### 2026-03-19

- Blog link in AppShell desktop footer; Google Search Console verification
- Auto-generate Item ID when moving supply to inventory
- Hub picker (HubsPage): single "Hubs" tab replaces individual hub tabs; picker grid + sub-nav breadcrumb
- People Access Hub: background checks, key assignments, certifications, custom requirements, expiry alerts, CSV export
- People Access: bulk entry modal (spreadsheet-style, interval expiry, name autocomplete)
- People Access: link accessPeople to user accounts (auto-link by email on login, manual link by admin); My Compliance card in Settings; Team Members compliance badges

### 2026-03-20

- Security hardening: granular Firestore rules (per-subcollection), user self-escalation fix, `escapeHtml` XSS fix for print functions, CSP/security headers in vercel.json, URL allowlist in Cloud Functions, supply quantity race condition → runTransaction, storage size+type limits

### 2026-03-21

- Blog post: "Church Supply Management: How to Stop Running Out of What You Need"

### 2026-03-22

- Maintenance Hub: user role can now update/edit tickets and drag Kanban status; Delete gated to admin+mgr; removed dead allowedHubs args from invite registration flow
- Hub access control: People Access Hub hidden from user role entirely; certifications admin-only (add/edit/delete); managers handle background checks, key assignments, custom requirements
- Security audit: fixed missing cert role guard in `handleBulkSave` (PeopleAccessPage)
- Maintenance Hub UX (user role audit): role-aware subtitle + empty state; ticket number search; checklist add/remove now auto-save
- Maintenance Hub UX (mobile + comments): mobile Kanban replaced with "Move to:" select on cards; unsaved-changes confirm on modal close; comment edit/delete for own comments; relative timestamps; own-comment styling; Firestore rule updated to allow comment author self-edit/delete

### 2026-03-24

- Blog post: "Church Equipment Maintenance: A Complete Guide"
- RichTextarea Enter key list continuation: Enter continues bullet/numbered list; double Enter on empty prefix line exits list; numbered lists auto-increment
- UX fixes (Opus audit — Maintenance + Inventory hubs): error flash red styling, checklist save error handling, onDragStart boolean fix, comment tap targets, comment placeholder text, bulk location role gate, "Send to Repair" label, role-aware empty state, statusFilter localStorage persistence, search placeholder cleanup, overdue red border persists in bulk select

### 2026-04-04

- Assignee color differentiation on Maintenance Kanban cards: deterministic hash of uid mapped to 8-color palette; same person always gets same color

### 2026-04-07

- Blog post: "How to Do a Church Physical Audit: A Step-by-Step Guide"

### 2026-04-09

- UI polish: confirm on deny, hub card focus, item name tooltip, auth form mobile, brand token cleanup, CoordinationPage required-field errors + badge, COC timeline mobile, skipped names truncation, BlogPost word-break
- Blog post: "5 Things Every Church Facilities Manager Needs to Track"
- Blog post: "Church Volunteer Equipment Accountability: Best Practices"

### 2026-04-14

- Tasks Hub: general-purpose Kanban task board with visibility control (team/private/shared), assignees, comments, recurrence, TSK-### numbering
- Tasks Hub: assignees filtered to Tasks Hub-access users only; per-user task defaults (⚙ Defaults button → default visibility + default share-with list, saved to users/{uid}); private tasks truly private (admin override removed); High priority pinned to top of each Kanban column

### 2026-04-15

- Tasks Hub: Opus review — security (private tasks enforced server-side in Firestore rules; creator delete allowed), bugs (calculateNextDue month-end rollover, isDetailDirty checklist, checklist Cancel flow, addTask silent failure, photo URL memory leak), refactor (createNextRecurringTask shared helper), a11y (TaskCard role/tabIndex/aria-label, mobile status select aria-label, comment button aria-label), performance (React.memo on TaskCard + KanbanColumn, useMemo for stats)

### 2026-04-16

- Tasks Hub: real-time detail modal sync — onSnapshot listener on open task doc; silent update when no dirty edits; amber conflict banner (Reload/Dismiss) when concurrent edit detected; extracted taskToEdits() helper; isDirtyRef avoids stale closures
- SEO: sitemap lastmod + changefreq fixes (yearly on posts, weekly on /blog); add missing moving-beyond-spreadsheets post; landing page title → "Church Inventory Management Software — Free"; add Organization schema + featureList to SoftwareApplication schema
- Blog post: "Best Church Management Software for Small Churches in 2026"
- Room/Space booking: rooms collection + Firestore rules; useFirestore rooms subscription (totalSubs→17) + CRUD; RESOURCE_TYPE enum; Settings Spaces card + modal (name/capacity/location/amenities/archive); ReservationsPage Equipment/Space toggle, room conflict detection, room badges, Check Out hidden for rooms, CSV updated
- Preventive Maintenance Calendar: custom month grid as third view mode in Maintenance Hub; priority-colored chips, 🔁 recurring badge, +N overflow, overdue cell highlight, month nav + Today button; mobile grouped list (Overdue/This Week/Next 30 Days/Later)
- Bug fixes (Opus review — Room booking + Maintenance Calendar): localDateStr() replaces toISOString() to fix UTC off-by-one; TicketChip extracted to module level; double-reduce in calendar header fixed; empty-state message when no spaces defined; Mark Complete action for approved room reservations
- Job Hub: teen job board + announcement board ($7/mo, key: jobs, JOB-###); admins post jobs; members sign up via runTransaction; announcements with pin + optional expiry; last 3 announcements on Dashboard; all-in bundle fixed to include people_access + jobs; totalSubs 17→19
- Email: migrated all notifications from EmailJS (client-side) to SendGrid via Cloud Functions; removed @emailjs/browser; new CFs: sendReservationEmail, sendTicketAssignedEmail, sendJobAnnouncementEmails
- Job Hub: My Jobs filter tab; morning reminder emails (sendJobReminders scheduled CF, 8am Central); cancellation emails (sendJobCancelledEmails CF); signup list privacy (admin/mgr see names, members see own status only); activity log for all job actions
- Tasks Hub enhancements (Opus review phase 2): activity logging; CSV export (exportTasksCSV); due-date reminder emails (sendTaskDueReminders scheduled CF); Calendar view; task templates (save/apply, admin+mgr only); subtasks (parentTaskId); bulk actions in list view; task dependencies (blockedBy TSK-### array with soft warning on Complete); firestore.indexes.json; taskTemplates Firestore rules

### 2026-04-20

- Job Hub: Schedule (roster) view + Calendar view; view tabs expanded from 2 to 4 (Job Board, Schedule, Calendar, Announcements)

### 2026-04-21

- Blog post: "How to Use a Kanban Board to Track Church Maintenance"
- UI/UX fix sweep (Opus review): extract `localDateStr` to `src/utils/date.js`; fix all UTC `toISOString()` date bugs (17 occurrences, 9 files); keyboard a11y on TicketCard/HubCards/ReservationCards/Modal close; flash messages standardized (5s, isError, dismiss button) app-wide; Activity Log added to mobile nav; dead code removed
- UX polish (Opus medium items): supply cards click-to-detail modal; reservation Equipment/Space toggle persists to localStorage; reservations empty state role-aware; PeopleAccessPage header font-size standardized
- Job Hub audit fixes (Opus + Explore review): Firestore signup rule hardened (±1 delta + spotsTotal cap); updateJobListing strips immutable fields + wraps spotsTotal shrink in runTransaction; withdrawFromJob no-op guard; invite flow threads allowedHubs; sendJobAnnouncementEmails + sendJobCancelledEmails + sendJobReminders: subscription gating, allowedHubs/active filter, error logging, idempotency; keyboard a11y on all Job Hub interactive elements

### 2026-04-23

- Job Hub enhancements (Opus review): recurring job series (recurrenceGroupId/recurrenceFreq/seriesEndDate, up to 100 jobs, one transaction with contiguous JOB-### numbers, 🔁 badge); poster + delegate notifications (sendJobPosterNotification CF — withdrawal and co-admin cancellation, 30s double-fire guard); jobPosterDelegates on user profile (cap 5); roster visibility toggle in Settings (admin only) — 'admin'/'signups'/'all', canSeeRoster() helper
- 90-day free trial system: new churches get all 7 paid hubs free for 90 days; trial banner in AppShell; processTrialExpirations daily CF (2am Central — auto-selects 2 most-used hubs, 7-day warning email); subHasHub() shared helper in functions/index.js; subscription status starts 'trialing', changes to 'active' on expiry
- Welcome email on signup: sendWelcomeEmail CF (Firestore onCreate trigger on churches/{churchId}, idempotency via welcomeEmailSentAt, replyTo: jcvaught@gmail.com)
- Job Hub Phase 1 fixes (new Opus review): 30s poster-notif guard scoped by actorUid (lastPosterNotifiedByActors map); admin_removal event added to sendJobPosterNotification CF; generateRecurrenceDates() extracted to src/utils/date.js; withdrawFromJob returns { wasSignedUp }; module-scope React.memo for JobCard, MobileScheduleRow, DesktopScheduleRow, AnnouncementCard

### 2026-04-24

- Job Hub H3: series-wide edit and delete — updateJobListingSeries + deleteJobListingSeries in useFirestore (writeBatch; spotsTotal validated against each job's signups); edit modal gains scope selector (This job only / This + all future jobs); detail modal gains "Delete Series" button
- Tasks Hub audit fixes (Opus review): all task functions now rethrow errors; updateTask strips immutable fields; Firestore rule blocks visibility escalation by non-creators; calculateNextDue Feb-29 annually fix + extracted to src/utils/date.js; createNextRecurringTask idempotency via runTransaction; handleDeleteTask cascade-deletes subtasks; deleteTask batch-deletes comments + Storage photos; bulk Complete triggers createNextRecurringTask; activityLabels.js shared utility; sendTaskDueReminders: idempotency, active+allowedHubs filter
- Tasks + Job Hub follow-up audit fixes (Opus review #2): tasksByDocId useMemo moved before pruning useEffect (TDZ crash fix); addTaskTags gated behind canOperate; Firestore task update rule blocks visibility changes by non-creators; sendTaskDueReminders lower bound removed (overdue tasks now included); job signup rule blocks writes on cancelled/completed jobs; updateJobListingSeries → runTransaction (TOCTOU fix); all Job Hub CRUD catch blocks rethrow; deleteJobListingSeriesFrom helper (Delete This + Future); savingJobId per-card (sign-up/withdraw no longer freezes all cards)

### 2026-05-11 — Jobs Hub pre-rollout UAT (manual)

Session 1 of the rollout: user ran `docs/TEST-JOBS-HUB-2026-05-07.md` against prod. First click broke (Modal `open` prop missing), then every UAT section surfaced 2–3 bugs. 11 fixes shipped during testing (F-fix-1 through F-fix-11). Highlights:

- **F-fix-1 (Modal open prop)**: 4 modals (New/Edit Job, Job Detail, New/Edit Announcement, Delegates) were calling `<Modal>` without the `open` prop — every click silently rendered nothing. Added `open` shorthand + Modal `maxWidth` prop support.
- **F-fix-2 (Sentry CSP)**: `vercel.json` CSP `connect-src` was missing `*.ingest.sentry.io` — Sentry transmission blocked since launch, hiding F-fix-1 and (later) F-fix-9 from telemetry. Added Sentry hosts.
- **F-fix-3 (hard-delete cancellation emails)**: handleDeleteJob/handleDeleteSeries/handleDeleteSeriesFrom were silently stranding signups. Now fan out sendJobCancelledEmails before delete.
- F-fix-4 update_job activity-log showed raw docId not JOB-###.
- F-fix-5 Job Lead dropdown now filters to admins + users-with-jobs-access.
- F-fix-6 past-dated open jobs were signup-able until 2am cron — filter + handler guard + disabled card button.
- F-fix-7 ICS export scoped per-user (members get their signups; admins get "Export All").
- F-fix-8 Print Roster admin-only + selection modal.
- **F-fix-9 (CSP for Cloud Functions)** — _the silent catastrophe_: CSP missing `*.cloudfunctions.net` + `*.run.app` had blocked every client-callable CF since launch. Cloud Run logs showed 24h of zero client-CF activity. Hidden by F-fix-2.
- F-fix-10 Spots field now flashes "Spots must be at least 1" instead of silent Math.max clamp.
- F-fix-11 flash banner was hidden behind Modal's z:1000 backdrop; now fixed-position z:1100.

### 2026-05-12 — Overnight 7-agent audit + comprehensive fix wave

Triggered by 2026-05-11 UAT volume. User asked for "full audit while I sleep." Seven parallel deep-review agents covered security, race conditions, email/SMS plumbing, error resilience, mobile/a11y, performance/scale, and data-model integrity. ~80 findings consolidated into `docs/AUDIT-TASKS-JOBS-2026-04-25.md`.

**Audit fix waves (F-fix-12 through F-fix-19):**

- F-fix-12 (F-20): cosmetic cleanup — shadowed isFull, dead todayStr prop, stale eslint-disable.
- F-fix-13 (F-18): signUpForJob prechecks 50-entry waitlist cap.
- F-fix-14 (F-17): promoteFromWaitlist gates on subscription pre-transaction.
- F-fix-15 (F-15): sendJobPosterNotification 30s double-fire guard now atomic via runTransaction (was: race between read and post-send write).
- F-fix-16 (F-14): missing `config/notifications` doc defaults to enabled=true. Five CF gate sites updated. Fresh churches now receive emails.
- F-fix-17 (F-21): new `effectiveHasHub(user, hub)` helper applied to 7 CF sites — admins with `allowedHubs: []` (e.g., John, Nancy in FXCC) no longer excluded from job emails.
- F-fix-18 (Security C-02, C-03): Stripe CFs now require admin role; sendTaskMentionEmail verifies caller's churchId match. Closes cross-tenant phishing primitive + the "any member can cancel subscription" path.
- F-fix-19 (F-23): tasks.dueDate + taskTemplates.autoGenerate COLLECTION_GROUP indexes patched via Firestore Admin REST API (firebase deploy --only firestore:indexes silently no-op'd per the known `feedback_firebase_collection_index` pitfall). Fixes daily 8am cron FAILED_PRECONDITION errors.

**Rules tightening Phases A–D (user-sign-off-required, all shipped):**

- Phase A (C-01): pinned `churchId` equality on admin user-update branch. Closes cross-tenant transplant attack where admin could rewrite any user's (or own) churchId.
- Phase B (F-16): jobListings admin update gets a forbidden-fields blocklist (signups/waitlist/attendance/server-managed). Three legitimate sub-paths preserved (attendance length-preserving, single removal, waitlist removal).
- Phase C (Data #2): member-branch of jobListings has `'signups' in resource.data && …` guards. Backfill script `scripts/backfill-jobs.cjs` added (dry-run; not executed against FXCC which already has all fields).
- Phase D (H-02): dropped `allow list` on churches collection — replaced with new `lookupChurchByCode` callable CF. Three-step coordinated deploy: CF first → client refactor (5 call sites) → rule drop.

**Autonomous batch:**

- F-RC-1: removePeopleAccessRequirement wrapped in runTransaction.
- F-RC-3: handleWithdraw awaits promoteFromWaitlist (was fire-and-forget; tab-close could drop the promotion).
- F-RC-4: processTrialExpirations read-validate-update now in runTransaction.
- F-RC-6: generateRecurringTemplateTasks template advance now in same txn as task create.
- F-23/agent: NEW `clearCancellationStampOnReopen` onDocumentUpdated trigger.
- F-32: sendJobCancelledEmails now emails waitlist users with a distinct subject.
- F-39: sendTicketAssignedEmail accepts `kind: 'task'|'ticket'` for accurate subject.
- handleErr Sentry.captureException with `{ area: 'firestore-write' }` tag — instruments ~80 mutations at one stroke.
- **Bundle splitting**: 7 hub pages → React.lazy + Suspense; qrcode dynamic-imported. Main bundle 462 KB → **230 KB gzipped (-50%)**. Recharts now its own lazy 132 KB chunk.
- **activityLog pagination**: subscription capped at 100 most-recent; `loadOlderActivityLog` helper for deeper history; ActivityLogPage gains "Load older entries" button.

**Mobile rollout-readiness:**

- C-1: admin ✕ remove-signup buttons bumped from ~22×16pt to ≥44×44pt.
- C-3: safe-area-inset on flash banner top + error toast bottom.
- H-1: Modal a11y — role=dialog, aria-modal, aria-labelledby, Escape closes, focus trap (move-in + restore).
- H-2: Modal maxHeight `92vh` → `92dvh` (iOS Safari toolbar safe).
- H-3: bottom-nav `flex: 0 0 64px` (448px wide, overflowed) → `flex: 1 1 0`. All 7 tabs fit any iPhone width.
- H-4: view tabs + filter chips horizontal-scroll on mobile.
- M-3: JobCard hover handlers skipped on mobile (no stuck-hover after tap).
- M-7: Public Jobs CTAs bumped to 14px / 44pt.
- L-1: aria-hidden on decorative emojis (bottom nav, error toast).

**Bucket 1 polish:**

- H-6: FF.jsx form-a11y refactor — useId-generated label/input association, opt-in `required` + `error` props (aria-required, aria-invalid, aria-describedby). Every form gets proper screen-reader semantics.
- M-1: Job card secondary-text font sizes bumped 11–12px → 13 on mobile.
- Data #1: deleteJobListingSeries + deleteJobListingSeriesFrom now clear linkedTaskDocId back-refs.
- F-28: sendJobAnnouncementEmails caps body at 5000 chars.
- F-30: sendTaskMentionEmail now includes plain-text MIME part.
- F-37: twilioInbound signature URL reads from `TWILIO_INBOUND_URL` env var (hardcoded fallback).

**F-24 — sender domain swap (last 🔴 closed):**

- Authenticated `churchopshub.com` in SendGrid — 5 CNAMEs + DMARC TXT added to Vercel DNS.
- `from: noreply@churchopshub.com` replaces gmail-as-sender across all 11 SendGrid sends.
- Verified end-to-end via raw email headers: `dkim=pass header.i=@churchopshub.com header.s=s1` + `spf=pass` + `dmarc=pass`. First-send landed in Gmail inbox, not spam.

**Sentry cleanup:**

- `beforeSend` filter drops transient `@firebase/firestore: Uncaught Error in snapshot listener` console.errors (transient auth-state-transition noise).

**A2P 10DLC resubmission prep:**

- 2026-04-27 campaign rejected with "issues verifying CTA" — TCR couldn't follow the authenticated in-app opt-in flow.
- New `src/pages/PublicSMSProgramPage.jsx` — publicly accessible (no auth required) disclosure page: program name, sending number, sample messages, frequency, exact in-app consent text, opt-in/out flow, HELP/STOP keywords, privacy + terms links.
- Routing: both `/sms-program` (clean path via SPA catch-all + pathname check) and `?sms-program` (query) work. Same pattern enabled for `/privacy` and `/terms`.
- Cross-links from Privacy + Terms SMS sections; LandingPage footer surfaces Privacy + Terms + SMS Program. sitemap.xml entry added.
- User updates the Twilio campaign with: new opt-in description pointing at /sms-program, Privacy URL = https://churchopshub.com/privacy, Terms URL = https://churchopshub.com/terms. Three daily Gmail-draft reminders scheduled via Claude Routines for May 13–15.

**Playwright E2E suite — 31/31 passing in ~80s:**

- Mirrors Court Climber's pattern: Firebase v12 IndexedDB auth state, per-spec teardown via Admin SDK, three roles (admin / member-a / member-b).
- Coverage maps every section of `docs/TEST-JOBS-HUB-2026-05-07.md`: §4 waitlist + auto-promotion, §5 compliance/waiver, §6 attendance/Reports, §7 roster visibility, §8 announcements, §9 public board (PII strip regression check), §10 notifications gate (verified via F-15 transaction stamp on lastPosterNotifiedByActors), §11 edge cases.
- SMS smoke test gated behind `E2E_RUN_SMS=1`. Triggers via `gcloud scheduler jobs run`, polls Twilio Messages API for delivery. Will auto-flip green after A2P approval + Messaging Service migration.
- Files: `playwright.config.js`, `e2e/firebase-fixtures.js`, 3 auth.setup.\*.js, `admin-helpers.js`, 7 spec files. Test accounts in FXCC: `jcvaught@gmail.com` (Member A), `e2e-admin@churchopshub.com`, `e2e-member-b@churchopshub.com`.
- Run: `E2E_MEMBER_B_EMAIL=e2e-member-b@churchopshub.com npm run test:e2e`.
