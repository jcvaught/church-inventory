# Sentry Alert Rules — Jobs Hub Launch

Shipped 2026-05-24 alongside the pre-launch error-handling hardening. This
doc is the human-side companion to the code: it lists the alert rules to
configure in the Sentry UI (console-only — there's no API path for these in
this project's setup).

The code-side changes those rules rely on are already deployed:

- `src/main.jsx` `beforeSend` filters expected `permission-denied` /
  `failed-precondition` / `unauthenticated` / `not-found` codes from both
  Firebase callables and the Firestore client SDK, so the issue feed is no
  longer dominated by intentional rule-blocks.
- `src/useFirestore.js` `handleErr` now tags every Firestore-write capture
  with `area`, `op`, optional `hub`, and the underlying Firestore `errorCode`.
- `src/pages/hubs/JobsPage.jsx` tags every Jobs Hub email-callable failure
  with `area:jobs-hub-email` + `cf:<callable name>` + `errorCode`, and adds
  `category:jobs-hub` breadcrumbs around signup / withdraw / admin-remove /
  swap actions.
- `src/pages/PublicJobsPage.jsx` tags `getPublicJobs` failures with
  `area:public-board` + `fn:getPublicJobs` and includes `churchId` /
  `churchCode` as extra context.
- `functions/index.js` `jobSignUp` now returns a structured `code` field on
  every user-error path (compliance-missing, waiver-required, waitlist-full,
  already-signed-up, …) — the frontend switches on it instead of regex.
- `functions/index.js` `monitorScheduledJobs` runs hourly and Sentry-captures
  any heartbeat that is missing, failed, hung, or stale, tagged with
  `area:job-monitor` + `scheduledJob:<name>` + `reason:<stale|failed|hung|no-heartbeat>`.

## Alert rules to add in the Sentry UI

(Settings → Projects → [your project] → Alerts → Create Alert)

### Rule 1 — Public board first-occurrence

**Why:** Public Jobs page (`?jobs=…`) is the unauthenticated launch surface.
Any error there is something an external teen is hitting *right now* — page
on the first instance, don't wait for a volume threshold.

- **Conditions:** A new issue is created
- **Filters:** `event.tags[area]` equals `public-board`
- **Action:** Notify (email / Slack / PagerDuty — wherever your on-call lives)
- **Throttle:** 1 alert per 60 minutes per issue (default)

### Rule 2 — Internal-error volume spike

**Why:** With expected-codes filtered, the issue feed should now be
dominated by real bugs (`internal`, `unknown`, unhandled exceptions). A
sudden volume spike means something broke in the last deploy.

- **Conditions:** The issue is seen more than `10` times in `1 hour`
- **Filters:** *(no tag filter — count across the whole project)*
- **Action:** Notify
- **Throttle:** 1 alert per 24 hours per issue

### Rule 3 — Scheduled job didn't fire / failed / hung

**Why:** `monitorScheduledJobs` runs every hour and fires a `captureMessage`
the first time it notices a missing / failed / stale / hung job. The
underlying root-cause Sentry capture (from `withScheduledRun`) may also
exist, but this rule ensures even a silent "the cron never fired" case gets
attention.

- **Conditions:** A new issue is created
- **Filters:** `event.tags[area]` equals `job-monitor`
- **Action:** Notify
- **Throttle:** 1 alert per 60 minutes per issue

### Rule 4 (optional) — Jobs Hub email-callable failures

**Why:** Email delivery failures are now visible (Sentry capture + user
toast in admin flows), but if SendGrid has a regional outage you want to
see it as one issue with a spike, not 40 separate toasts.

- **Conditions:** The issue is seen more than `5` times in `1 hour`
- **Filters:** `event.tags[area]` equals `jobs-hub-email`
- **Action:** Notify
- **Throttle:** 1 alert per 4 hours per issue

## Useful saved searches

In the Sentry issue feed, save these as named searches for fast triage:

- `area:public-board` — every public-jobs failure
- `area:job-monitor` — every scheduled-job alert
- `area:jobs-hub-email` — every Jobs Hub email-callable failure
- `area:firestore-write op:signUpForJob` — every transient signup error
- `errorCode:internal` — backend bug surface only
- `tags[hub]:jobs` — any Jobs Hub error captured with the hub tag

## What does NOT page (by design)

- `permission-denied`, `failed-precondition`, `unauthenticated`, `not-found`
  from any source — intentional rule-blocks (filtered in `main.jsx`).
- `logActivity` failures — surfaced to Sentry with `op:logActivity` so
  engineering still sees the audit-trail gap, but does *not* set the
  user-facing error toast on the operation that just succeeded.
- `twilioInbound` invalid-signature 403s — expected probe noise; Cloud
  Logging shows them as `console.warn`.
