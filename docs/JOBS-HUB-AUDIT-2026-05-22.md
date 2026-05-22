# Jobs Hub — Pre-Launch Audit (2026-05-22)

Full audit of the ChurchOpsHub **Jobs Hub** ahead of next-week launch to real teen
volunteers and church admins. Method: five parallel read-only specialist agents
(security/PII, Cloud Functions, signup integrity/concurrency, permissions/subscription,
UX/a11y) over `src/pages/hubs/JobsPage.jsx`, `src/pages/PublicJobsPage.jsx`,
`functions/index.js`, `firestore.rules`, `src/useFirestore.js`, and the docs — plus a
live E2E regression run.

**Live baseline:** the existing Playwright suite is **40/40 green** (1 SMS smoke test
skipped — gated). No regressions; the recent SMS `messagingServiceSid` change verified
correct.

**Tally: 0 Critical · 4 High · 13 Medium · 9 Low · 2 product decisions.**

Nothing is a five-alarm "stop the launch" defect — multi-tenant isolation holds, the
signup transaction is genuinely race-safe, no data-loss/corruption path was found. But
there is a real **High tier** to clear before minors' data goes live, and two of the
fixes hinge on product decisions (below).

---

## Product decisions needed (drive the High fixes)

- **D1 — `manager` role has full Jobs Hub access, identical to `admin`** — sees the
  volunteer leaderboard (teen names + pay earned + no-show history) and every signup
  roster. Consistent UI↔rules, so not a bug — but confirm it's intended. If managers
  should be scoped, there's currently no mechanism. (`JobsPage.jsx:453`)
- **D2 — Roster visibility model** — today any church *member* can read the full
  minor roster via raw SDK (see H1). Decision: is church-member-wide roster visibility
  acceptable, or should the roster be admin/manager-only? This sets the H1 fix scope.

---

## HIGH — fix before launch

### H1 — Teen-volunteer roster is readable by any church member via raw SDK
`firestore.rules:175-180` · `JobsPage.jsx:531`

`jobListings` allows `get`/`list` to any `isMember(churchId)`. Each job's `signups[]`
array holds `{uid, name, signedUpAt, attended, …}` — the full name of every minor who
signed up, plus the date/time/location they will physically be. The `jobsRosterVisibility`
setting is enforced **only** in the React UI (`canSeeRoster`). Any `user`-role teen — or
anyone who joined the church with the (non-secret) church code — can run a `getDocs` on
`churches/{cid}/jobListings` and scrape the whole thing.

This was a *documented "accepted" limitation* in a testing context. For a launch with
real minors it should be re-decided (D2). **Proper fix:** move `signups[]` into a
subcollection (`jobListings/{id}/signups/{uid}`) with a rule allowing a member to read
only their own doc + admin/manager all; keep a server-maintained `signupCount` on the
parent for the spots bar. That is the only way Firestore rules can enforce per-row
roster visibility. Lighter interim option: a `getJobRoster` CF (same pattern as
`getPublicJobs`) + tighten the array read — but the spots-bar count still needs to leak
a length. Scope depends on D2 and launch runway.

### H2 — Compliance/Background-Check + waiver gating is client-side only (direct-signup path)
`firestore.rules:220-241` · `JobsPage.jsx:834-854` · `useFirestore.js:1085`

The member signup rule checks `status=='open'`, the ±1 delta, and `size()<=spotsTotal`
— it does **not** inspect `requiredAccessTypes` or `requiresWaiver`. All compliance
enforcement lives in `handleSignUp` (UI). `signUpForJob`'s transaction doesn't re-check
it either. So a member using the raw SDK can sign up for a Background-Check-required
teen job with no check on file. (Note: the *waitlist* promotion path **does**
re-validate server-side — `promoteFromWaitlist` `functions/index.js:1681` — so this is
an inconsistency, not a blanket gap.) **Fix:** route signup through a Cloud Function
that re-validates compliance + waiver server-side, or consciously accept + document.
For a teen-safety feature, server-side enforcement is strongly advised.

### H3 — Jobs Hub subscription/paywall is not enforced server-side
`firestore.rules:174-255`

No Jobs Hub rule reads `config/subscription`. `UpgradeGate` (UI) is the *only* thing
blocking an unsubscribed church. A church whose trial expired or that cancelled the
$7/mo Job Hub can still read every listing + roster and create/edit/delete jobs via raw
SDK. The Cloud Functions *do* gate (`subHasHub`), but only for emails/reminders/
public-board/promotion — not the core read/write. **Fix:** add a `hubActive(churchId,'jobs')`
rules helper (reuse the existing `userData()` get budget for a second `get()` of the
subscription doc) and require it on `jobListings`/`jobAnnouncements`/`jobSwapRequests`
writes. Rules can't do the trial-expiry time comparison — ensure `processTrialExpirations`
writes `freeHubsSelected` on expiry so the rule sees post-trial state.

### H4 — `getPublicJobs` is unauthenticated with no rate limit, no result cap, and a church-enumeration oracle
`functions/index.js:242-287`

The public-board callable takes a client-supplied `churchId` and does 3 reads + a query
per call, with no App Check and no rate limiting — cheap to loop and run up the Firestore
bill. It also throws a distinct `not-found` for missing churches vs. an empty list for
hub-inactive ones, letting an attacker enumerate valid `churchId`s (= `{creatorUid}-church`,
so it leaks creator UIDs). The jobs query has no `.limit()`. **Fix:** return `{jobs:[]}`
for the non-existent-church case too; add `.limit(200)`; enable App Check or a per-IP
throttle; set the Firebase billing budget alert (already an open CLAUDE.md TODO).
*Field-stripping itself is correct — `signups`/`waitlist`/`attendance` are never returned.*

---

## MEDIUM

- **M1 — `allowedHubs[]` not enforced server-side.** A member explicitly denied the
  Jobs Hub can still read job data and sign up via raw SDK; the rules grant on
  `isMember` alone. `userData()` already returns `allowedHubs`, so a rule helper costs
  no extra `get()`. (`firestore.rules:174-255` vs `App.jsx:612`)
- **M2 — `sendJobReminders` SMS not independently idempotent.** SMS sends share the
  email `lastReminderSentDate` stamp; a crash after the stamp-write but mid-SMS drops
  texts, and a failed stamp-write re-sends *both* channels (double-text — an A2P
  concern). Add a separate `lastSmsReminderSentDate`. (`functions/index.js:1449-1477`)
- **M3 — Waitlist promotion gaps.** `handleAdminRemoveSignup` fires `promoteFromWaitlist`
  **non-awaited** (lost if the tab closes — the member-withdraw path was fixed for this,
  admin path wasn't); a waitlist-join racing a withdrawal leaves a freed spot unfilled
  with no reconciliation; reducing `spotsTotal` strands waitlisters. (`JobsPage.jsx:909`,
  `functions/index.js:1691`)
- **M4 — Attendance update silently no-ops.** If the signup no longer matches (volunteer
  removed mid-edit), `updateJobSignupAttendance` commits an identical array and the admin
  sees false success. (`useFirestore.js:1168`)
- **M5 — `errors` collection has no Firestore rule.** Either client-side error telemetry
  is silently dead (default-deny) or it's Admin-SDK-written; the absence is undocumented
  and a future "add the rule" change risks over-granting. (`firestore.rules`)
- **M6 — `twilioInbound` honors STOP/START globally by phone.** A START re-opt-in flips
  `smsRemindersEnabled` for *every* user with that number — a recycled/family number
  means re-consenting someone who never consented. STOP (over-suppression) is fine.
  (`functions/index.js:2017`)
- **M7 — `jobAnnouncements` write rule lacks field immutability** — `createdBy`/
  `createdByName`/`createdAt` are rewritable by any admin/manager, unlike the hardened
  `jobListings` rule. (`firestore.rules:252-255`)
- **M8 — WCAG-AA contrast failures.** `textLight` `#8B93A1` ≈ 2.9:1 on white — used for
  empty states, placeholders, calendar off-month days, leaderboard footnotes; calendar
  status-chip text also borderline. One-token fix (darken to ~`#6B7280`). Teens on phones
  outdoors. (`tokens.js:6`)
- **M9 — Mobile job-detail action row** stacks up to 7 buttons (3 destructive) with no
  grouping — "Delete Series" sits next to "Edit", easy mis-tap on a phone.
  (`JobsPage.jsx:1576-1635`)
- **M10 — Public board publishes `description`/`location` free-text** verbatim to a fully
  public URL with no length cap and no in-UI warning — admin-overshare-of-minor-PII risk
  (e.g. a description naming a teen + a home address). (`functions/index.js:268`)
- **M11 — `robots.txt` doesn't disallow `/?jobs=`** — public boards (dates, locations,
  pay, churchId) get crawled and indexed by Google. (`public/robots.txt`)
- **M12 — Unbounded cross-tenant `collectionGroup` scans** in scheduled functions;
  `sendTaskDueReminders` has no lower bound so its scan grows forever. Fine at current
  scale; add `.limit()` + a date floor before it grows. (`functions/index.js:1152`)
- **M13 — UX cluster:** raw 24h time in the job-detail modal (`:1443`); no loading state
  (a still-loading board is indistinguishable from an empty one); no error state if the
  Firestore subscription fails; raw lowercase status pills in schedule rows; "Closed"
  vs "Completed" vs "Cancelled" unexplained; `requiredAccessTypes` invisible on the card
  until signup fails.

---

## LOW

- **L1 — `closePastJobs` ignores subscription state** — force-completes jobs for lapsed
  churches. Mostly benign; document or gate for consistency.
- **L2 — `twilioInbound` has no explicit `invoker:'public'`** — Gen-2 redeploys can strip
  the `allUsers` IAM (documented, reproduced 2026-05-14). Add it + post-deploy curl probe.
- **L3 — `sendJobCancelledEmails` swallows its stamp-write error** (`.catch(()=>{})`) —
  a failed stamp can re-send cancellation emails within the hour.
- **L4 — `jobSwapRequests`** — orphaned on job delete (litter, not corruption); `note`
  uncapped; `name` not pinned to the account (mild impersonation in an admin-read field).
- **L5 — `promoteFromWaitlist`** callable gated only on church membership, not role —
  any member can trigger a promotion. Safe (transaction only does the right thing) but
  permissive.
- **L6 — `publicRequests`** allows fully unauthenticated `create` with no field/size
  constraints — spam/cost vector (pre-existing, not Jobs-Hub-specific).
- **L7 — PWA maskable icon** declares `any maskable` on a possibly-unpadded asset —
  visual check; Android may crop the logo on install.
- **L8 — `title`-only tooltips** are invisible on touch devices (🔁 recurring chip,
  export buttons) — teens on phones never see them; use visible text / `aria-label`.
- **L9 — Misc UX:** waiver shown via `window.confirm` (poor for a legal-consent flow —
  deserves a real Modal + checkbox); recurring setup shows no date preview; "Share Board"
  gives no hint that the public view strips PII; `<tr role="button">` in the desktop
  schedule is a fragile a11y pattern; no in-app email-suppression management UI.

---

## Confirmed sound (checked, no finding)

Multi-tenant isolation (every subcollection gated by `isMember`); the signup transaction
+ `±1` delta rule (last-spot race is genuinely safe; capacity cannot be exceeded);
`getPublicJobs` field-stripping; phone-number protection (`phone`/`smsRemindersEnabled`
pinned against admin tampering — TCPA-correct; phone never enters job docs); role
enforcement for privileged writes (UI↔rules consistent); webhook signature validation;
the `sendJobPosterNotification` transactional double-fire guard; HTML-escaping in emails;
`firestore.indexes.json` covers all Jobs queries; no TDZ/`mangle` pitfalls in JobsPage.

## Prior-audit backlog reconciliation

From `docs/AUDIT-TASKS-JOBS-2026-04-25.md` — still open: **M-2 contrast** (→ M8),
**C-2 destructive-action row** (→ M9), **F-31 touch tooltips** (→ L8), **#11 subscription
onSnapshot error swallow** (→ M13 error-state), suppression-management UI (→ L9),
F-26 List-Unsubscribe headers (defer). Closed: `jobPosterDelegates` in-hub UI (shipped).

## Soft launch items (not code)

SendGrid plan tier (trial → paid before volume); DMARC `p=none` → `p=quarantine` after
clean reports; Firebase billing budget alert (open TODO — pairs with H4).
