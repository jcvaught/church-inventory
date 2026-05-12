# Tasks + Jobs Hub Workflow Audit — 2026-04-25

> ## 📰 Morning Briefing — 2026-05-12 (overnight audit + backlog work)
>
> Eight backlog items shipped while you slept (F-fix-12 through F-fix-19) plus two security-tightenings (C-02, C-03). Seven parallel deep-audit agents returned ~80 new findings across security, race conditions, email plumbing, error resilience, mobile/a11y, performance, and data-model integrity. The most pressing items follow.
>
> **Tonight's shipped work (eight backlog items):**
>
> | Commit | What |
> |---|---|
> | 7d14c6a | F-fix-12: F-20 cosmetic cleanup (shadowed isFull, dead JobChip prop, stale eslint comment) |
> | a3ff40c | F-fix-13: F-18 waitlist 50-cap precheck in signUpForJob |
> | e230f51 | F-fix-14: F-17 promoteFromWaitlist gates on subscription pre-transaction |
> | a1801d3 | F-fix-15: F-15 double-fire guard race in sendJobPosterNotification — stamp inside transaction |
> | 3245c32 | F-fix-16: F-14 missing config/notifications doc defaults to enabled |
> | d5a1ebc | F-fix-17: F-21 effectiveHasHub helper applied to 7 CF sites (admins with allowedHubs:[] now included) |
> | 302f1ca | F-fix-18: NEW — C-02 (gate Stripe CFs to admin) + C-03 (sendTaskMentionEmail churchId check) |
> | b0e20a8 + REST API patch | F-fix-19: F-23 CG indexes deployed for tasks.dueDate + taskTemplates.autoGenerate |
>
> **High-priority new findings that need your sign-off before shipping** (rules changes, sender domain swap, data-model migration — I deliberately did not touch these autonomously):
>
> 1. **🔴 C-01 (security)** — `firestore.rules` admin-update branch on `users/{uid}` lets an admin change another user's (or own) `churchId` to ANY value → cross-tenant data leak. Add `request.resource.data.churchId == resource.data.churchId` to the admin branch.
> 2. **🔴 F-22 / D-RC-2 (data model)** — `firestore.rules` member-branch of `jobListings` evaluates `resource.data.signups.size()` directly, which throws on missing fields. Pre-phase job docs (if any exist) silently lock out non-admin signup. Add `'signups' in resource.data && …` guards, or do a one-shot backfill.
> 3. **🔴 H-02 (security)** — `firestore.rules` `churches` collection has `allow list: if request.auth != null` → any authed user dumps every church code → joins any church. Drop list permission, replace with a CF `lookupChurchByCode`.
> 4. **🔴 F-24 (email deliverability)** — Sender is `churchopshub@gmail.com`. Gmail's DMARC policy `p=reject` means most messages will go to spam. Move to a custom domain (`noreply@churchopshub.com` with SPF + DKIM + DMARC) before the Jobs Hub rollout reaches its target audience. **Until this is done, deliverability is poor.**
> 5. **🟠 F-fix-19 confirmation** — Verify the new CG indexes built successfully by checking the next scheduled CF run at 8am Central. Also stamp `completedAt` on `closePastJobs` job updates (see F-RC-3 in the consolidated section).
>
> **Pre-rollout recommendation (refined from last night):**
> 1. Resume UAT §4–§11 in the morning (the eight tonight's fixes should help several sections pass).
> 2. Apply the four 🔴 items above as a single follow-up commit (rules + sender swap).
> 3. Pick 2–3 of the highest-leverage items from the consolidated findings below (e.g., handleErr Sentry capture, lazy-load heavy hub pages).
> 4. Then ship.
>
> Full consolidated findings appear in **"Overnight Audit — 2026-05-12 (7-agent parallel review)"** section below. The shipped F-fix-12 through F-fix-19 entries are appended to the Fixed-in-Session table further down.

Scope: All 20 Tasks Hub workflows and 15 Jobs Hub workflows (35 total). Read-only audit across `firestore.rules`, `functions/index.js`, `src/useFirestore.js`, `src/pages/hubs/TasksPage.jsx`, and `src/pages/hubs/JobsPage.jsx`. No code was changed during this audit session.

## Executive Summary

- **HIGH**: 0
- **MEDIUM**: 8 findings
- **LOW**: 5 findings
- **INFO**: 6 confirmed-safe checks (see Non-Findings section)

**Top 3 cross-cutting themes:**
1. **Email guard inconsistency** — `sendJobReminders` and `sendJobPosterNotification` each miss one of the two standard CF guards (`notifEnabled` / `subHasHub`). And `open → completed` transitions incorrectly trigger a "Job Cancelled" email.
2. **Partial-failure misreporting** — Bulk status change and bulk delete both use `Promise.all`; any single failure reports "Bulk operation failed" while prior writes already landed.
3. **Visibility enforcement gaps** — Private task names leak into the activity log (readable by all members), and deleted tasks leave orphaned `blockedBy` references in other tasks.

> Note: The original synthesis counted 9 MEDIUM; on renumbering the duplicate F-10, the body contains 8 distinct MEDIUM-tagged findings.

---

## Findings

### C1 — Transactional Integrity

#### [MEDIUM] F-01 — Recurrence marker committed before next-task creation

**Workflows:** Tasks W9 (recurrence)
**File:line:** `src/pages/hubs/TasksPage.jsx:984-1011`

`createNextRecurringTask` runs a `runTransaction` that writes `nextRecurrenceCreatedAt` to the source task, then calls `addTask` **outside** the transaction. If `addTask` fails, the marker is already committed — the task never retries because the transaction sees `nextRecurrenceCreatedAt` is set and short-circuits on the next completion.

**Risk:** The next recurring task is silently lost with no recovery path except manual admin intervention.

**Fix direction:** In the catch block after `addTask`, clear `nextRecurrenceCreatedAt` on the source doc so the user can retry by completing the task again.

---

#### [MEDIUM] F-02 — Bulk status change uses `Promise.all` — partial success reported as total failure

**Workflows:** Tasks W5 (bulk status change)
**File:line:** `src/pages/hubs/TasksPage.jsx:1260-1273`

Any single `updateTask` rejection aborts `Promise.all` and flashes "Bulk update failed." Tasks processed before the failure are already updated. Retrying re-applies to all selected tasks.

**Risk:** Inconsistent state with misleading error; retrying re-updates already-moved tasks.

**Fix direction:** Switch to `Promise.allSettled`, count successes/failures, report `"X of Y tasks updated"` on partial failure.

---

#### [LOW] F-03 — Bulk delete same `Promise.all` partial-failure pattern

**Workflows:** Tasks W5 (bulk delete)
**File:line:** `src/pages/hubs/TasksPage.jsx:1282-1288`

Same pattern as F-02. "Bulk delete failed" fires while some tasks are already deleted.

**Fix direction:** `Promise.allSettled` + count deleted vs. failed.

---

### C3 — Email Side-Effects

#### [MEDIUM] F-04 — `sendJobReminders` doesn't check `notificationConfig.enabled`

**Workflows:** Jobs N (daily job reminders)
**File:line:** `functions/index.js:952-1058`

`sendJobReminders` checks `subHasHub(sub, 'jobs')` and per-user `allowedHubs`, but never reads `config/notifications`. Compare to `sendTaskDueReminders` (line 905) which explicitly calls `await notifEnabled(churchId)`.

**Risk:** Job reminder emails are delivered even when the church has disabled notifications in Settings → Notifications.

**Fix direction:** Add a per-church `notifEnabled` async check (pattern at lines 875-882) before processing each church's jobs.

---

#### [MEDIUM] F-05 — `sendJobPosterNotification` missing `subHasHub` check

**Workflows:** Jobs G (withdraw), H (admin remove), C (co-admin cancel)
**File:line:** `functions/index.js:1063-1166`

Checks `notifSnap.data()?.enabled` but does not call `subHasHub`. Every other Jobs CF checks `subHasHub`. The job subscription may have lapsed by the time a withdrawal occurs.

**Risk:** Notification emails sent to churches whose Jobs Hub subscription has expired.

**Fix direction:** Fetch subscription doc alongside `notifSnap` and call `subHasHub(sub, 'jobs')`.

---

#### [MEDIUM] F-06 — `open → completed` sends a "Job Cancelled" email to signups

**Workflows:** Jobs C (edit single job → completed)
**File:line:** `src/pages/hubs/JobsPage.jsx:544-546`, `functions/index.js:784`

`terminalStatuses = ['cancelled', 'closed', 'completed']` — any `open → terminal` transition triggers `sendJobCancelledEmails`. The CF subject is always `"Job Cancelled: ${title}"` regardless of actual status.

**Risk:** Signups for a successfully-run job marked "Completed" receive an alarming "Job Cancelled" email.

**Fix direction:** Remove `'completed'` from `terminalStatuses` in `JobsPage.jsx`. (Completed jobs ran as planned — signups don't need notification.) Alternatively, pass the new status to the CF and branch the subject/body.

---

#### [MEDIUM] F-07 — `sendJobReminders` stamps all processed jobs regardless of email send success

**Workflows:** Jobs N (daily job reminders)
**File:line:** `functions/index.js:1057`

`jobsToMark` collects all jobs passing hub + idempotency checks. All are stamped `lastReminderSentDate = today` via `Promise.allSettled` at the end — regardless of whether any emails succeeded. Compare to `sendTaskDueReminders` (lines 941-944) which only stamps task refs for users whose sends succeeded.

**Risk:** If SendGrid fails for all emails in a morning run, every processed job is stamped and its signups receive no reminder the next day either.

**Fix direction:** Mirror `sendTaskDueReminders` — accumulate per-job results from `Promise.allSettled` and only stamp jobs where at least one email was fulfilled.

---

#### [LOW] F-08 — `sendJobAnnouncementEmails` doesn't check `notifEnabled` server-side

**Workflows:** Jobs J (announcement post)
**File:line:** `functions/index.js:692-699`

The client correctly gates on `notificationConfig?.enabled` (JobsPage line 449), but the CF doesn't read `config/notifications`. A direct authenticated API call bypasses the client guard.

**Risk:** Low in practice (requires bypassing the client), but inconsistent with `sendJobCancelledEmails` and `sendJobPosterNotification` which read the notifications doc server-side.

**Fix direction:** Fetch `config/notifications` in the CF before sending.

---

### C5 — Immutability & Referential Integrity

#### [MEDIUM] F-09 — Orphaned `blockedBy` references after task deletion

**Workflows:** Tasks W4 (delete), W8 (dependencies)
**File:line:** `src/pages/hubs/TasksPage.jsx:1215-1234`

`handleDeleteTask` cascades subtask deletes but does not clean up `blockedBy: ['TSK-001']` entries on other tasks that reference the deleted task's number. `BlockedByInput` validates references only on ADD, not on the referenced task's deletion.

**Risk:** After TSK-001 is deleted, any task blocked by it shows "⛔ Blocked by TSK-001" permanently. Users trying to complete those tasks see a blocker confirmation dialog for a non-existent task.

**Fix direction:** After deleting a task, query `tasks where blockedBy array-contains taskNumber` and `arrayRemove` the deleted taskNumber from each result. Firestore supports `array-contains` queries.

---

#### [LOW] F-10 — Subtask cascade delete partial failure surfaces orphans as top-level tasks

**Workflows:** Tasks W4 (delete), W7 (subtasks)
**File:line:** `src/pages/hubs/TasksPage.jsx:1224`

`Promise.allSettled(subtasks.map(st => deleteTask(...)))` silently ignores failures. A failed subtask deletion leaves `parentTaskId` pointing to a deleted parent doc. `subtaskDocIds` (line 1404) checks `tasksByDocId[t.parentTaskId]` — if the parent lookup is null, the orphaned subtask renders as a top-level task.

**Fix direction:** After `allSettled`, check for rejections and flash a warning. Optionally null out `parentTaskId` on confirmed-orphaned subtasks.

---

### C2 & C7 — Permissions & Activity Log

#### [MEDIUM] F-11 — Private task names leak via activity log

**Workflows:** Tasks W1 (create), W2 (edit/complete), W4 (delete), W20 (activity log)
**File:line:** `src/useFirestore.js:530, 544-548`; `firestore.rules:70-75`

`logActivity('add_task', taskNumber, userId, userName, { name: task.name, priority })` stores the task name in `details`. The activity log Firestore rule grants read to all church members with no parent-task visibility check.

**Risk:** A private task named "Plan retirement celebration for Alice" is hidden from other members in the Tasks Hub, but its name is visible to any member reading the Activity Log tab or issuing raw Firestore queries against `activityLog`.

**Fix direction:** For `add_task` / `update_task` / `complete_task` log entries, omit `name` from `details` if the task's `visibility === 'private'` or `'shared'`. Log only `taskNumber` as the identifier.

---

#### [LOW] F-12 — `deleteJobListing` logs `docId` instead of `jobNumber`

**Workflows:** Jobs E (delete single job)
**File:line:** `src/useFirestore.js:944`

```js
await logActivity('delete_job', docId, userId, userName, {});
```

All other job CRUD operations log the human-readable `JOB-###` number. Single-job delete logs an opaque Firestore document ID.

**Fix direction:** Pass `jobNumber` as a parameter to `deleteJobListing` (the caller has the full job object). Change: `logActivity('delete_job', jobNumber || docId, ...)`.

---

### C4 — Race Conditions

#### [LOW] F-13 — Conflict detection doesn't cover drag-drop or bulk status changes

**Workflows:** Tasks W3 (drag-drop), W5 (bulk), mobile status select
**File:line:** `src/pages/hubs/TasksPage.jsx:1179-1198, 1251-1275`

The "updated by another team member" banner only activates in the task detail modal (via `onSnapshot` on the open doc). `handleDrop`, mobile status select, and `handleBulkStatusChange` write directly without conflict checks.

**Risk:** User A's open detail can be silently overwritten by User B's concurrent drag-drop of the same task. Low urgency — the detail modal covers the common editing scenario; this is an accepted kanban trade-off.

**Fix direction:** Defer unless concurrent conflicts are reported in practice. If addressed, add a staleness check (`updatedAt` comparison) in `handleDrop`.

---

## CF Guard Parity Matrix

| Cloud Function | `subHasHub` | `notifEnabled` |
|---|---|---|
| `sendJobAnnouncementEmails` | ✅ | ❌ client-only **(F-08)** |
| `sendJobCancelledEmails` | ✅ | ✅ |
| `sendJobReminders` | ✅ | ❌ **(F-04)** |
| `sendJobPosterNotification` | ❌ **(F-05)** | ✅ |
| `sendTaskDueReminders` | ✅ | ✅ |
| `sendTicketAssignedEmail` | n/a | n/a |
| `sendWelcomeEmail` | n/a | n/a |
| `processTrialExpirations` | n/a | n/a |

---

## Non-Findings Checked (Coverage Proof)

| Check | Result |
|---|---|
| Task/job number counter atomicity | ✅ Both use `runTransaction` for counter + doc set |
| Job signup capacity enforcement | ✅ Client transaction + server rule both enforce `signups.size() <= spotsTotal` |
| Announcement pin re-email | ✅ `handleTogglePin` → `updateJobAnnouncement` only; `sendAnnouncementEmails` never called on pin |
| Announcement edit re-email | ✅ `sendAnnouncementEmails` only called when `!editAnnId` (new announcements only) |
| CSV export visibility compliance | ✅ Receives `filteredTasks` derived from `visibleTasks` (visibility pre-filtered) |
| `blockedBy` taskNumber immutability | ✅ Rule line 126 + client strip in `updateTask` |
| `recurrenceGroupId` preserved in series edit | ✅ Not included in `jobForm`; not passed to `updateJobListingSeries` |
| Self-role escalation | ✅ Users rule lines 242-246 block self-change of role, churchId, active, allowedHubs |
| Per-actor double-fire guard (withdrawal) | ✅ `lastPosterNotifiedByActors[actorUid]` scoped per actor |
| Task reminder idempotency | ✅ Only stamps tasks for users whose email sends succeeded |
| Withdraw from closed/cancelled jobs | ✅ Allowed by design; transaction removes UID if present, no-ops if not |
| Task visibility `team → private` by non-creator | ✅ Rule lines 122-124 block it |
| Task subtask delete uses `tasks` (not `visibleTasks`) | ✅ Correctly includes private subtasks of public parent in cascade |
| `deleteJobListingSeries` atomicity | ✅ `writeBatch` — all docs deleted atomically |

---

---

## Feature Backlog — Opus Functionality Review (2026-04-25)

25 suggestions from a deep code-level pass. Grouped by category; each includes hub, one-line description, the user problem it solves, and complexity estimate.

### A. High-value / high-demand

| ID | Title | Hub | What | Why it matters | Complexity |
|----|-------|-----|------|---------------|------------|
| FB-01 | Public job board for non-members | Jobs | No-auth landing page (like PublicRequestPage) where teens view open jobs and apply with name/email before creating an account; provisional signups flagged `pending: true` | Breaks chicken-and-egg: new teens can find jobs before they're invited to the app | Medium |
| FB-02 | iCal / Google Calendar export | Both | HTTP CF returning `.ics` feed of jobs signed up for + tasks assigned to user; per-user opaque calendar URL | People miss jobs/tasks if they're not on their phone calendar; manual re-entry is the current workaround | Medium |
| FB-03 | SMS reminders for signed-up jobs | Jobs | Optional `phone` + `smsRemindersEnabled` on user profile; extend `sendJobReminders` CF to send SMS (Twilio) alongside email | Teen population checks SMS over email; email-only reminders cause no-shows | High |
| FB-04 | Waitlist when a job is full | Jobs | `waitlist[{uid,name,joinedAt}]` on job; auto-promote first waitlisted user on withdraw (transactional) with email notification | Today "Full" button is dead; popular jobs fill instantly with no recovery path | Medium |
| FB-05 | Per-job lead override for notifications | Jobs | `jobLead` uid field on job; lead receives signup/withdraw notifications instead of/alongside poster delegates | Poster ≠ person running the event; today delegates get notified but the actual lead doesn't | Low |
| FB-06 | Task @-mentions in comments | Tasks | Typing `@` in comment composer shows user picker; mentioned users emailed + flagged in-app; `mentions:[uid]` on comment doc | Comments are one-way today — no one knows when they're being asked something | Medium |

### B. Workflow efficiency

| ID | Title | Hub | What | Why it matters | Complexity |
|----|-------|-----|------|---------------|------------|
| FB-07 | Quick-add task inline at column bottom | Tasks | `+ Add task` inline input at bottom of each Kanban column; creates minimal task (name + status) without opening modal | Opening the full modal 8 times to triage a backlog is painful for power users | Low |
| FB-08 | Task time-tracking (estimate vs actual) | Tasks | Optional `estimatedMinutes` / `actualMinutes` on tasks; shown in detail modal and exported in CSV | Volunteer coordinators want to know "how long does setup actually take?" for future planning | Low–Medium |
| FB-09 | Saved filter views | Tasks | Named filter bookmarks per user stored on `users/{uid}` (like existing `taskDefaultVisibility`) | Same 4-filter combinations get rebuilt on every visit | Low |
| FB-10 | Manual reorder within Kanban column | Tasks | Drag-to-reorder within a column; persist `sortOrder` numeric per task; active when `sortBy === 'manual'` | No way to manually sequence "what's next" within a status today | Medium |
| FB-11 | Inline edit from Schedule view | Jobs | Admin clicks a Schedule row to inline-edit `scheduledTime`, `location`, `spotsTotal` without opening the modal | Every minor correction (time typo) requires a 4-click round trip to the edit modal | Medium |
| FB-12 | Bulk task assignment / re-assignment | Tasks | Extend existing bulk action bar (status + delete) to add "Assign to…" and "Tag with…" | Handing off 12 tasks to a new helper requires 12 modal round trips today | Low |
| FB-13 | Job swap / replacement request | Jobs | Signed-up user posts a "Looking for replacement" request; on acceptance, transaction atomically swaps signups | Today only option is "withdraw" (leaves spot empty) or manually call admin | Medium–High |
| FB-14 | Recurring template auto-generation (schedule-based) | Tasks | Templates gain an `autoGenerate` + cron schedule flag; new scheduled CF creates instances regardless of whether previous was completed | Completion-driven recurrence breaks if someone forgets to mark a task done; admin chores need reliable weekly spawning | Medium |

### C. Admin / reporting

| ID | Title | Hub | What | Why it matters | Complexity |
|----|-------|-----|------|---------------|------------|
| FB-15 | Volunteer hours / leaderboard report | Jobs | Admin-only dashboard: per-person job counts, completed count, no-shows, total pay; date-range filter | Data exists in `signups[]` but is entirely invisible today; needed for stipends, year-end recognition | Medium |
| FB-16 | No-show / attendance tracking | Jobs | On job status → `completed`, prompt admin with roster checkboxes "showed up?"; persist `signups[].attended` | Without attendance data the leaderboard is meaningless; post-job check is the lightest capture UX | Low–Medium |
| FB-17 | Task burndown / velocity chart | Tasks | Admin "Insights" section: tasks created vs completed per week, avg time-to-complete, overdue trend (Recharts already a dep) | Admins need to see if team is keeping up; all data exists, only visualization is missing | Medium |
| FB-18 | Activity log filter by hub | Both | Hub-scoped filter on ActivityLogPage (`add_task`, `signup_job`, etc. records already structured) | "Who deleted JOB-042?" requires manual scrolling today; structured data makes filter trivial | Low |
| FB-19 | Print-friendly roster sheet | Jobs | "Print Roster" button in job detail: printable view with signup list, checkboxes, signature lines (mirrors `printInventory` in utils/print.js) | Outdoor work-days with no Wi-Fi need a paper roster | Low |
| FB-20 | Per-job waiver / consent acknowledgement | Jobs | Optional `requiresWaiver` flag + waiver text on job; signup must confirm; `signups[].acknowledgedWaiverAt` stored | Paid teen work often requires parental consent; no audit trail exists today | Medium |

### D. Integration / cross-hub

| ID | Title | Hub | What | Why it matters | Complexity |
|----|-------|-----|------|---------------|------------|
| FB-21 | Convert job ↔ task | Both | "Promote to task" on a job; "Schedule as job" on a task; carries title/description; stores `linkedJobId`/`linkedTaskId` backref | Jobs are time-and-spot-bound; tasks are open-ended — real workflows cross between them | Medium |
| FB-22 | Link task to inventory item or maintenance ticket | Tasks | Optional `linkedItemDocId` / `linkedTicketDocId` on task; detail modal renders clickable chip | Maintenance tickets already have `linkedItemDocId`; tasks that reference physical assets should too | Low |
| FB-23 | Auto-create maintenance ticket from a task | Tasks | "Convert to maintenance ticket" action on a task; syncs status | Some churches use Tasks for quick admin and Maintenance for asset repairs; no bridge today | Medium |
| FB-24 | People Access compliance gate on job signup | Jobs | Per-job `requiredCompliance: ['background_check', 'cert:CPR']`; signup transaction cross-checks `accessRecords` | Children's ministry events need background-checked volunteers; data already exists in People Access Hub | High |
| FB-25 | Ministry-scoped tasks (manager permissions) | Tasks | Optional `ministry` field on task; managers with `managedMinistries[]` can only edit/delete their ministry's tasks (mirrors `canManageItem`) | Multi-ministry churches need task ownership scoping; currently only role-gating exists | Medium |

### Notable gaps (data model supports it; UI doesn't expose it)

- **Task photo lightbox** — `photos[]` exists on task docs; clicking a thumbnail shows it inline but no full-screen viewer or swipe
- **`jobPosterDelegates` has no in-hub management UI** — users can't discover or edit their delegate list from within JobsPage (must be in Settings somewhere or is undiscoverable)
- **`notes` vs `description` overlap on tasks** — semantically unclear which to use; worth consolidating or labeling with example use cases
- **Recurring job announcements** — `expiresAt` exists but no "repeat weekly" option for standing boilerplate like "Sunday setup volunteers needed"

---

## Appendix: Workflow → Cluster Map

**Tasks Hub (W1–W20):** All 20 workflows covered. C1: W1,W2,W4,W5,W7,W9,W12. C2: W1,W2,W4,W5,W6,W10,W16,W17. C3: W2,W19. C4: W3,W5,W9,W12,W18. C5: W4,W7,W8,W9,W11. C6: W13,W14,W15. C7: W1,W2,W4,W10,W20.

**Jobs Hub (A–O):** All 15 workflows covered. C1: A,B,C,D,E,F,G. C2: A,B,C,E,F,G,H,I,J,K. C3: C,G,H,I,J,N. C4: D,F,G. C5: B,D,E. C6: K,L,M. C7: A,B,C,D,E,F,G,H,J,O.

---

## Findings — added 2026-05-11 (pre-rollout review)

Triggered by a static review run just before the manual test pass for the 2026-05-06 rollout. The first manual click (+ Post Job) was already broken by a missing `open` prop on the Modal — fixed live (commit 71b127e). To avoid more surprises, three parallel deep-dive reviews were run across `JobsPage.jsx`, the Jobs Cloud Functions, and `firestore.rules` + Jobs CRUD. Findings that did NOT block today's test against the seed church (`6cksNI9Uv8h0jXptdTESnXTXFgF3-church`, which has `config/notifications.enabled = true`) are deferred and logged below. One finding (hard-delete cancellation emails) was high-impact enough to fix in the same session (commit 0370294).

### [HIGH] F-14 — `config/notifications` missing-doc default is "disabled"

**Workflows:** Jobs J (announcement), G (withdraw), H (admin remove), C (co-admin cancel)
**File:line:** `functions/index.js` — `sendJobAnnouncementEmails` (~line 781) and `sendJobPosterNotification` (~line 1257)

Both CFs gate on `notifSnap.data()?.enabled`. If the church has never visited Settings → Notifications, `config/notifications` doesn't exist; `.data()` is undefined and the `?.` short-circuits to falsy. Every email silently returns `{ sent: 0 }` with no diagnostic.

**Risk:** Fresh churches that haven't opened the notifications setting page never receive Jobs Hub emails. There's no UX hint the toggle exists in an off state by default. Likely to surface as "your app doesn't send emails" support tickets.

**Fix direction:** Treat the missing doc as `enabled: true` (notifications-on is the safer default — users explicitly opted in by enabling the Jobs Hub). Alternatively, write `enabled: true` at church creation time so the doc always exists.

---

### [HIGH] F-15 — `sendJobPosterNotification` double-fire guard timestamp written after sends (race)

**Workflows:** Jobs G (withdraw), H (admin remove), C (co-admin cancel)
**File:line:** `functions/index.js` — `sendJobPosterNotification` (~line 1267 read, ~line 1357 write)

The 30-second double-fire guard reads `job.lastPosterNotifiedByActors[actorUid]` at the top of the function but only writes the new timestamp via `t.update(...)` AFTER `Promise.allSettled` of all SendGrid calls completes. Two near-simultaneous calls (UI double-click, network retry, parallel CF invocations) both pass the guard read and both fire emails.

**Risk:** Double emails on rapid withdrawal/cancel. The UI debounces via `saving` state in most paths, so frequency is low in practice — but the CF should not depend on client-side debounce.

**Fix direction:** Open a Firestore transaction at the top, read the timestamp, write a new "in-progress" timestamp inside the same transaction, then send emails after the transaction commits. Or simpler: write the timestamp immediately before the SendGrid calls (accept a small window where a crash leaves a stamped doc without sent emails — preferable to double-emailing).

---

### [HIGH] F-16 — `firestore.rules` admin update branch has no field whitelist

**Workflows:** Jobs B (edit), E (delete), F (sign up), H (admin remove)
**File:line:** `firestore.rules:165` (admin/manager branch of `jobListings/{docId}` update)

The admin/manager update branch is currently `isChurchAdminOrManager(churchId)` with no `affectedKeys().hasOnly([...])` restriction. Any admin client (or compromised admin token) can directly POST `signups`, `waitlist`, `attendance`, `cancellationEmailSentAt`, `lastPosterNotifiedByActors`, etc. — bypassing the transactional helpers in `useFirestore.js` that maintain invariants like:
- waiver-acknowledgement audit fields preserved across waitlist promotion
- attendance flips only for the named uid, not stomping the whole array
- spotsTotal cap enforced

The page-level helpers (`updateJobListing` / `updateJobListingSeries`) already strip server-managed fields before write — defense-in-depth on the rules side is the gap.

**Risk:** Buggy admin client or malicious admin can wipe waiver audit trails, stomp attendance, or bypass spots enforcement. Not a regression — this was the original posture.

**Fix direction:** Tighten the admin branch to `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...editable whitelist])` with explicit exclusions for `signups`, `waitlist`, `attendance`, `createdBy`, `createdByName`, `jobNumber`, `recurrenceGroupId`, `cancellationEmailSentAt`, `lastPosterNotifiedByActors`, `lastReminderSentDate`. Requires careful enumeration and a quick test pass against legitimate admin edit flows before shipping.

---

### [MEDIUM] F-17 — `promoteFromWaitlist` silently swallows email when subscription lapses mid-flow

**Workflows:** Jobs F (signup) → waitlist auto-promotion
**File:line:** `functions/index.js` — `promoteFromWaitlist` (~line 1454)

The function runs the promotion transaction (moves `waitlist[0]` → `signups`) and only THEN checks `subHasHub(sub, 'jobs')`. If the church's Jobs subscription expired between the original signup and the promotion, the volunteer is silently promoted but never emailed about it.

**Risk:** Volunteer shows up at a job they don't know they're on (or doesn't show up because they never got the email).

**Fix direction:** Check `subHasHub` BEFORE the promotion transaction — if false, refuse to promote and leave the waitlist intact. Or send the email anyway since it's a transactional notice for a person who already opted in (the docstring at line ~1245 explicitly calls the email "transactional" and not gated on the notification toggle for the same reason).

---

### [MEDIUM] F-18 — `signUpForJob` doesn't precheck 50-entry waitlist cap

**Workflows:** Jobs F (signup)
**File:line:** `src/useFirestore.js:1037-1079`

The transaction checks `signups.length >= spotsTotal` and pushes to `waitlist` if full, but doesn't check the rule's `waitlist.size() > 50` cap. On a full job with 50 already waitlisted, the commit fails with a generic permission-denied that `handleErr` swallows; the user sees a vague "Sign-up failed. Please try again."

**Risk:** Confusing UX in the unlikely 50+ waitlist case.

**Fix direction:** Add `if ((job.waitlist || []).length >= 50) throw new Error('Waitlist is full (50 max).')` in the transaction. Surface a specific error in the catch.

---

### [LOW] F-19 — `jobSwapRequests` create rule doesn't verify caller is signed up to the job

**Workflows:** Jobs F (swap request)
**File:line:** `firestore.rules:187-191`

Rule only enforces `request.resource.data.uid == request.auth.uid`. A member not signed up to the job can still post a swap request. Rules can't cheaply read another doc's `signups` array, so an enforcement option would be expensive.

**Risk:** Low-impact spam vector. Admins see + dismiss in the job detail modal; ignored swap requests have no side effect.

**Fix direction:** Accept and document the limitation. Alternative: have the client refuse to create the request if `!isSignedUp(job)` (already done at line ~870 of JobsPage); the rule is purely defense-in-depth.

---

### [HIGH] F-22 — SendGrid 403 Forbidden on all transactional emails

**Workflows:** all CFs that call `sgMail.send`
**File:line:** `functions/index.js:415` (sender config), surfaced in `sendJobPosterNotification` (~line 1355)

After F-fix-9 unblocked the CSP and CFs started actually invoking, the first job-poster-notification call returned `Error: Forbidden` from `@sendgrid/client`. Sentry captured it; Cloud Run logs confirm: `sendJobPosterNotification: failed { index: 0, reason: 'Forbidden' }` at 2026-05-12T00:31:20 UTC.

This affects every transactional email path: welcome, trial expiry, reservation, ticket assignment, job announcement broadcast, job cancellation, job poster notification, waitlist promotion, task mention, task due reminders, job reminders.

Most likely cause: SendGrid Single Sender Verification on `churchopshub@gmail.com` is no longer valid (expired, revoked, or never re-verified after a SendGrid policy change). Less likely: API key in `functions/.env` lost its `mail.send` scope.

**Risk:** Zero outbound email until fixed. The Jobs Hub rollout was about to ship in this state — every notification path silently broken because the Sentry CSP block (F-fix-2) hid the failures until just now.

**Fix direction:** Admin action, no code change. In SendGrid dashboard → Sender Authentication → re-verify `churchopshub@gmail.com`. Confirm the API key in `functions/.env` has `mail.send` full-access scope. Smoke-test by triggering one withdrawal email.

---

### [MEDIUM] F-23 — Scheduled CFs failing with FAILED_PRECONDITION (likely missing index)

**Workflows:** task due reminders (8am Central), recurring template generation (8am Central)
**File:line:** `functions/index.js` — `sendTaskDueReminders` (~line 910), `generateRecurringTemplateTasks`

Today's 13:00 UTC scheduled batch failed with `Error: 9 FAILED_PRECONDITION` on both `sendtaskduereminders` and `generaterecurringtemplatetasks`. Per CLAUDE.md feedback (`feedback_index_deploy_rules`), this matches the pattern of a missing collectionGroup composite index — likely deployed-then-blown-away by a `firestore:rules`-only deploy.

**Risk:** Members not getting task due reminders; recurring task templates not spawning instances. Tangential to the Jobs Hub rollout but worth checking.

**Fix direction:** `gcloud logging read` the exact precondition message to identify which query and which index is missing, then deploy the index via `gcloud firestore indexes composite create …` per the project's pattern (avoiding `firebase deploy --only firestore:indexes` per the known no-op CG-vs-collection bug).

---

### [HIGH] F-21 — Admins with empty `allowedHubs` array are excluded from job emails

**Workflows:** Jobs J (announcement broadcast), F (signup confirmations), N (reminders), waitlist promotion
**File:line:** `functions/index.js:798, 884, 1168, 1216, 1458`

The `allowedHubs` filters in five Cloud Functions distinguish between **absent** and **empty array**:
- Line 798: `(!u.allowedHubs || u.allowedHubs.includes('jobs'))` — `[]` is truthy so `!u.allowedHubs` is `false`; combined with `[].includes('jobs') === false` → recipient excluded.
- Lines 884, 1168, 1216, 1458: `if (user.allowedHubs && !user.allowedHubs.includes('jobs'))` — `[]` is truthy, `![]+.includes('jobs')` is `true` → user skipped.

In this codebase, admins are commonly stored with `allowedHubs: []` to mean "all hubs implicit." In Fairfax Church of Christ specifically:
- John Vaught (admin): `allowedHubs: []` — currently filtered out of all job emails
- Nancy Vaught (admin): `allowedHubs: []` — same
- Jill Bitgood (admin): `allowedHubs: [..., 'jobs']` — receives normally

Impact: announcement broadcasts miss 2 of 3 admins; cancelled-job emails, reminders, and waitlist-promotion emails skip those admins if they ever sign up for a job.

**Fix direction:** Bake an `effectiveHasHub(user, 'jobs')` helper into `functions/index.js` that returns `true` if `user.role === 'admin'` OR `allowedHubs` is missing/empty OR `allowedHubs.includes('jobs')`. Replace the five inline filters. Mirror to the Tasks-hub filters (lines 990, 1516) since they share the same pattern.

**Why not fix in this session:** Member A test account was created with `allowedHubs: ['jobs']` and Jill is the announcement-receiving admin, so today's flow won't be affected.

---

### [LOW] F-20 — JobsPage cosmetic noise

**File:line:** various

- `src/pages/hubs/JobsPage.jsx:744` — `isFull` declared as a local `const` inside `handleSignUp`, shadowing the outer derived `isFull` function at line 507. Rename local to `jobIsFull`.
- `src/pages/hubs/JobsPage.jsx:42` — `JobChip` accepts `todayStr` prop but never uses it. Dead prop.
- `src/pages/hubs/TasksPage.jsx:973` — stale `eslint-disable react-hooks/exhaustive-deps` comment (ESLint already flags it as unused).

**Fix direction:** Pure cleanup. No functional impact.

---

### Fixed in same session (not deferred)

| ID | What | Commit |
|---|---|---|
| F-fix-1 | 4 modals in `JobsPage.jsx` (New/Edit Job, Job Detail, New/Edit Announcement, Delegates) called `<Modal>` without an `open` prop — every click silently rendered nothing. Added `open` shorthand + taught `Modal` to accept a `maxWidth` prop. | 71b127e |
| F-fix-2 | Sentry's ingest hosts were not in the `connect-src` CSP — error telemetry blocked in prod. Added `https://*.ingest.sentry.io` and `https://*.sentry.io`. | 71b127e |
| F-fix-3 | `handleDeleteJob`, `handleDeleteSeries`, `handleDeleteSeriesFrom` hard-deleted jobs without firing `sendJobCancelledEmails` — volunteers were silently stranded. The soft-cancel path (status → cancelled) already emails, but Delete didn't. Now confirms with signup count, awaits the CF before the delete commits, and respects the 1-hour CF debounce if a soft-cancel preceded the delete. | 0370294 |
| F-fix-4 | `update_job` activity-log entries logged the raw Firestore docId (e.g. `0K4Ofucik7to01NTRKkt`) instead of `JOB-###`. `updateJobListing` read `updates.jobNumber` but neither caller ever passed it. Added `jobNumber` as an explicit 5th parameter (mirroring `deleteJobListing`) and threaded it through both `handleSaveJob` and the convert-to-task path. Discovered during §2 of the manual test pass. | 9c95dd5 |
| F-fix-5 | Job Lead dropdown in the New/Edit Job modal listed every active user in the church, including users without Jobs Hub access in `allowedHubs`. Made the filter only include users who can actually see the Jobs Hub (`role === 'admin'` OR `allowedHubs` contains `'jobs'`). Discovered during §3 of the manual test pass. | 0ced932 |
| F-fix-6 | Past-dated open jobs stayed signup-able until the `closePastJobs` cron fired at 2am Central — up to ~24+ hours after the date passed. The Open filter showed them; the Sign Up button was active; `handleSignUp` had no date guard. Now (1) the Open filter hides any open job with `scheduledDate < today`, (2) `handleSignUp` rejects past-dated jobs with a flash, (3) the card and detail-modal Sign Up buttons render a disabled "Past — signups closed" indicator instead. Discovered during §3 step 1 of the manual test pass. | 8e78bc7 |
| F-fix-7 | Schedule view's "Export ICS" button exported the entire church job calendar to every user — noise for members who just want their own committed dates. Split into role-aware buttons: "Export My Signups" (all roles, filters to jobs the user is signed up for, labels the calendar "My Jobs") and an additional "Export All" button (admin/manager only) for the full church calendar. `exportJobsICS` now accepts an opts object with `calendarLabel` and `filenamePrefix`. Discovered during §3 of the manual test pass. | d4ec9f7 |
| F-fix-8 | Schedule view's "Print Roster" was visible to members whenever `rosterVisibility !== 'admin'`, and admins had no way to pick which jobs to print — clicking always dumped every visible job into one PDF. Hid the Schedule button from non-admins entirely; admin button now reads "Print Rosters…" and opens a checkbox modal of all visible jobs (defaulted all-selected, with Select All/None toggles). Also added a per-job "🖨 Print Roster" button in the job detail modal (admin only) for one-off prints. Discovered during §3 of the manual test pass. | 36c40d5 |
| F-fix-9 | CSP was missing `https://*.cloudfunctions.net` and `https://*.run.app` from `connect-src`, so every `httpsCallable(getFunctions(), …)` invocation was silently blocked browser-side. Cloud Run gen2 logs confirmed zero client-invoked CF activity in the last 24h despite active testing (announcement post in §1, withdrawal in §3) — only scheduled CFs fired. This had been silently broken pre-rollout but went unnoticed because Sentry's CSP was ALSO blocked (F-fix-2) so the errors never surfaced. Discovered during §3 step 7 when the admin withdrawal email never arrived. | 7cf366f |
| F-fix-10 | Edit Job → Spots field silently clamped 0 (or blank) to 1 via `Math.max(1, ...)` before validation, so users typing 0 to test the "can't reduce below current signups" guard got no error and an apparent no-op save. Added an explicit pre-clamp check that flashes `"Spots must be at least 1."` and aborts save when the raw input is < 1. Discovered during §3 step 8 of the manual test pass. | 7cf4295 |
| F-fix-11 | Flash banner rendered inline at the top of the JobsPage content (z-index auto). When any Modal was open (Modal uses fixed-position backdrop at z-index 1000), every flash message — including the F-fix-10 "Spots must be at least 1." just shipped — was rendered behind the modal and completely invisible. Made the flash banner fixed-position at the top of the viewport with z-index 1100, centered, with shadow and width clamp for legibility. Discovered immediately after F-fix-10 deploy when user reported "no error message it just doesn't save" with the Spots=0 edit. | aa0f5b1 |
| F-fix-12 | F-20 cosmetic cleanup: renamed shadowed `isFull` local in `handleSignUp` to `jobIsFull`; removed dead `todayStr` prop from `JobChip` definition + call site; removed stale `eslint-disable react-hooks/exhaustive-deps` from `TasksPage:973`. | 7d14c6a |
| F-fix-13 | F-18 waitlist 50-cap precheck. `signUpForJob` previously hit a generic permission-denied at the rule layer when the waitlist was at 50; users saw "Sign-up failed. Please try again." Added explicit pre-write check inside the transaction that surfaces "This job is full and the waitlist is at capacity (50 max)." | a3ff40c |
| F-fix-14 | F-17 `promoteFromWaitlist` now gates on the church's Jobs Hub subscription BEFORE running the promotion transaction. Previously, if the sub lapsed between waitlist join and promotion, the user was silently moved to signups[] without any email. Now returns `{ promoted: false, reason: 'hub-inactive' }`. | e230f51 |
| F-fix-15 | F-15 double-fire guard race in `sendJobPosterNotification`. The 30s guard timestamp was written AFTER `Promise.allSettled` sends, so two near-simultaneous calls both passed the read-guard and both fired emails. Moved the read+stamp into a Firestore transaction at the top of the function. Trade-off: a single dropped notification on SendGrid failure inside the 30s window, in exchange for no double-emails on rapid clicks. | a1801d3 |
| F-fix-16 | F-14 `config/notifications` missing-doc default. Five CFs gated on `notifSnap.data()?.enabled` which evaluates falsy for a missing doc, so fresh churches that never opened the settings page received ZERO emails. Now default-on: only an explicit `enabled: false` disables. Sites updated: `sendJobAnnouncementEmails`, `sendJobPosterNotification`, `sendTaskMentionEmail`, plus both `notifEnabled` / `jobNotifEnabled` cache helpers. | 3245c32 |
| F-fix-17 | F-21 `effectiveHasHub(user, hubName)` helper. Replaces the `(!u.allowedHubs \|\| u.allowedHubs.includes(hub))` / `(u.allowedHubs && !u.allowedHubs.includes(hub))` patterns across 7 sites. Admins are now always considered to have access (even with `allowedHubs: []`). John and Nancy were previously excluded from all job emails because of this. | d5a1ebc |
| F-fix-18 | **NEW (from overnight security audit, not in original deferred list)** — C-02: `createCheckoutSession` and `createPortalSession` only required `req.auth`. Any user could open the Stripe billing portal and cancel the subscription. Now require `role === 'admin'`. C-03: `sendTaskMentionEmail` accepted arbitrary `churchId` from the caller without verifying membership — enabled cross-tenant phishing under the ChurchOpsHub sender brand. Now verifies caller is a member of churchId, and skips mentioned users whose churchId doesn't match. | 302f1ca |
| F-fix-19 | F-23 missing CG indexes. `firestore.indexes.json` declared a COLLECTION_GROUP fieldOverride for `tasks.dueDate`, but `firebase deploy --only firestore:indexes` silently no-op'd applying it (matches the project's known `feedback_firebase_collection_index` pitfall). Patched directly via the Firestore Admin REST API using gcloud auth tokens. Added a `taskTemplates.autoGenerate` override to indexes.json for consistency + applied the same way. Will fix the daily 8am `sendTaskDueReminders` + `generateRecurringTemplateTasks` FAILED_PRECONDITION errors. | b0e20a8 + REST API patch |

---

## Overnight Audit — 2026-05-12 (7-agent parallel review)

Seven specialized review agents ran in parallel on `~/apps/church-inventory` while the user slept. Each focused on one dimension. Combined ~80 new findings; the top severity items are listed here. Less-severe and confidence-flagged items are in the individual agent transcripts (not included in this doc due to length — pull from the tool-run history if needed).

> **Numbering note:** The agents independently coined F-numbers (F-23 SendGrid, F-24 Gmail-sender, F-25–F-40 email, C-01–C-03 security, H-01–H-04, M-01–M-08, L-01–L-04). To avoid collision with this doc's existing F-14 through F-21 (and the morning-briefing references to F-22 / F-23 / F-24), I've **preserved the agents' numbering inside their sections** rather than renumber globally. References in the morning briefing use the agents' original tags.

### A. Security & multi-tenant isolation

#### 🔴 C-01 — Admin can move users (or self) into another church via churchId update
`firestore.rules:264-278`. Admin-update branch on `users/{uid}` only checks `userChurchId() == resource.data.churchId` (existing doc's church), NOT `request.resource.data.churchId == resource.data.churchId`. Admin in church A writes `{ churchId: '<churchB-id>' }` on themselves → next auth check makes them an admin in church B → read/write all of B's data. **Fix needs your sign-off — touches rules.**

#### 🔴 C-02 — Stripe CFs not role-gated → SHIPPED in F-fix-18
Previously any user could open the billing portal and cancel the subscription.

#### 🔴 C-03 — `sendTaskMentionEmail` accepts arbitrary churchId → SHIPPED in F-fix-18

#### 🟠 H-01 — `sendReservationEmail` + `sendTicketAssignedEmail` are unscoped email oracles
Both only require `req.auth` and accept arbitrary `toEmail`/template variables. Phishing relay primitive. **Fix:** add `churchId` param + caller membership check + role gate + recipient-in-church check.

#### 🟠 H-02 — `churches` collection fully listable
`firestore.rules:25` allows `list` to any authed user. They can dump every church code → join any church via signup flow. **Fix:** drop list permission, replace with `lookupChurchByCode` CF.

#### 🟠 H-03 — `?invite=CODE&hubs=...` lets joiner self-set `allowedHubs`
`src/App.jsx:57-63`. The user-create rule doesn't validate `allowedHubs`. A teen registering with crafted URL can opt into hubs the admin didn't grant. Constrained by church-level subscription, but defeats the per-user hub gate. **Fix:** drop the `hubs` URL param OR validate at create-time.

#### 🟠 H-04 — Admin-update branch on `users/{uid}` allows changing other users' `email`/`role`/`active`/`name`
Same field-whitelist gap as F-16 (jobListings). Admin can rewrite a user's `email`, propagating into the email CFs that read `user.email` server-side. **Fix needs sign-off — rules change.**

### B. Race conditions & concurrency

#### 🔴 F-RC-1 — `removePeopleAccessRequirement` read-then-write outside transaction
`useFirestore.js:839-847`. Two admins removing two different requirements concurrently → second write resurrects the first removal. **Fix:** wrap in `runTransaction`.

#### 🔴 F-RC-2 — `handleReorder` kanban drag fans out N parallel writes
`TasksPage.jsx:1499`. Two users reordering same column concurrently → inconsistent sortOrder integers. **Fix:** use `writeBatch` for atomic per-column update.

#### 🟠 F-RC-3 — `withdrawFromJob` → `promoteFromWaitlist` fire-and-forget
`JobsPage.jsx:862-869`. If the user closes the tab between the withdrawal commit and the CF call, the promotion never fires. **Fix:** `await` the CF call (already in try/catch).

#### 🟠 F-RC-4 — `processTrialExpirations` non-atomic vs. Stripe webhook
`functions/index.js:541-588`. Cron read-validate-update can race with a webhook write to the same sub doc. **Fix:** wrap in `runTransaction`.

#### 🟠 F-RC-6 — `generateRecurringTemplateTasks` not idempotent
`functions/index.js:1583-1616`. The task-creation transaction commits, then the template's `autoGenerateNextAt` is updated. A crash between → cron retry creates a duplicate task. **Fix:** move the template advance inside the same transaction.

### C. Email + SMS plumbing

#### 🔴 F-23 (agent's numbering, NOT this doc's F-23) — `sendJobCancelledEmails` 1-hour debounce can suppress legitimate notifications
`functions/index.js:863-905`. `cancellationEmailSentAt` is never cleared on `status: cancelled → open` transitions. Re-cancel within 1 hour → new signups silently never notified. **Fix:** clear the timestamp on the open transition OR drop the debounce.

#### 🔴 F-24 — Gmail-from sender → spam-folder delivery risk
`functions/index.js:415`. `from: 'churchopshub@gmail.com'` cannot DMARC-align because `gmail.com` publishes `p=reject`. ~50%+ of messages will land in spam, especially at Microsoft/Outlook addresses. **Fix:** move sender to custom domain with SPF + DKIM + DMARC. THE biggest deliverability risk in the audit.

#### 🟠 F-26 — No `List-Unsubscribe` headers on any email
Gmail bulk-sender requirements (Feb 2024) require this for any sender. Spam-score risk + future-volume compliance risk.

#### 🟠 F-32 — Waitlist users not emailed on cancellation
`sendJobCancelledEmails` only emails `signups[]`. Waitlisted teens sit on a dead waitlist forever.

#### 🟡 F-39 — `sendTicketAssignedEmail` subject lies when fired from TasksPage
Subject says "Maintenance Ticket Assigned — TSK-042" — wrong hub. **Fix:** add `kind` field, branch subject.

### D. Error resilience

#### 🔴 #1 (handleErr) — `useFirestore.js` chokepoint missing Sentry capture
Single helper that runs after every Firestore write swallows errors via `console.error` only. Sentry's `captureConsole` catches the string but loses stack/code. Adding `Sentry.captureException(err)` in `handleErr` instruments ~80 mutations at once — biggest leverage.

#### 🔴 #2 — `createNextRecurringTask` rollback path has no Sentry
`TasksPage.jsx:1104-1138`. If both the task create AND rollback fail, the source task is permanently marked "next created" and the recurrence silently drops forever.

#### 🟠 #3 — Every `httpsCallable(...).catch(...)` in JobsPage is console-only
9+ instances. F-22 played out exactly this way — every email "send" silently failed for months because the telemetry was console-only.

#### 🟠 #11 — `useSubscription` `onSnapshot` swallows errors
If the subscription doc gets permission-denied, the app falls back to "free plan" silently — paying customer locked out without alerting.

#### 🟠 #13 — No Firestore offline persistence enabled
`src/firebase.js:22` uses `getFirestore(app)` defaults. PWA users on flaky cell connectivity get no offline mode. `runTransaction` writes fail outright when offline.

### E. Mobile UX + accessibility

#### 🔴 C-1 — Admin ✕ buttons in roster are 22×16pt (under 44pt)
Mis-tap rate will be high. Admins managing teen rosters from phones will accidentally remove the wrong teen.

#### 🔴 C-2 — Job detail action row collapses to 3+ rows on small phones
5–7 buttons including Delete buttons immediately adjacent to Edit. **Fix:** move destructive actions into a "More…" overflow on mobile.

#### 🔴 C-3 — Flash messages ignore `env(safe-area-inset-top)`
Notched iPhones hide success/error feedback behind the URL bar.

#### 🟠 H-3 — Mobile bottom nav overflows: Hubs/Settings off-screen on iPhones < 400px
**This is the single biggest mobile-blocker for the Jobs Hub rollout** — teens can't reach the Job Hub from the bottom nav without realizing they need to swipe.

#### 🟠 H-1 — Modal lacks focus trap, Escape handler, and `role="dialog"`/`aria-modal`
Combined with the F-fix-11 z-index fix this means modals work but aren't accessible.

#### 🟠 H-6 — Required form fields lack `aria-required` / `aria-invalid` / `htmlFor`
Pervasive — every form in the app is affected.

### F. Performance & data scale

#### 🔴 #1 (activityLog) — Unbounded `onSnapshot` subscription
`useFirestore.js:73-78`. ~36k docs after 2 years at 50 actions/day. Every member loading the app pays full-collection-read cost. **Top perf win:** paginate to `limit(100)`. ~30 min of work, cuts mount reads 99% for aging churches.

#### 🔴 #1 (jobListings) — Same pattern
~520 docs over 2 years of weekly-recurring. **Fix:** filter to `scheduledDate >= sixMonthsAgo`.

#### 🔴 #3 (signups[] array bloat) — 200+ signup-rewrite contention
Every signup/withdraw rewrites the whole array. At ~6,500 entries hits the 1MB doc limit. **Fix at scale:** move to subcollection with `signupCount` denormalized.

#### 🔴 #4 — `sendTaskDueReminders` reads every task across all tenants daily
No status filter or upper-bound date floor. At 1k churches this is a real Firestore bill.

#### 🟠 #7 — Bundle size: lazy-load `recharts`, `qrcode`, and hub pages
~213 KB gzipped reduction possible.

### G. Data model integrity

#### 🔴 #1 — Series-deletes don't clean up linked-task back-refs
`useFirestore.js:1008-1036`. `deleteJobListing` cleans `linkedTaskDocId`; `deleteJobListingSeries` and `deleteJobListingSeriesFrom` don't. Linked tasks keep stale `linkedJobDocId` after series wipe.

#### 🔴 #2 — `firestore.rules` member-branch reads `resource.data.signups.size()` without `'signups' in` guard
Pre-phase jobs missing the field permanently lock out non-admin signups. **Fix needs sign-off — rules change.** Combined backfill of `signups: []`, `waitlist: []`, `requiredAccessTypes: []`, `requiresWaiver: false` on legacy docs is the safe path.

#### 🟠 #5 — Strip-list drift between `updateJobListing` and `updateJobListingSeries`
Two functions strip the same 8 fields by hand. Any new server-managed field WILL be missed. **Fix:** extract `SERVER_MANAGED_JOB_FIELDS` constant.

---

## Prioritized Fix Queue (post-overnight, for next session)

Items that need user sign-off (rules / sender / data migration):
1. **C-01 + H-04 + Data model #2** — Bundle into one rules-tightening commit: pin churchId on admin update, add field whitelist to user admin update, add `'signups' in` guards on jobListings member rule, drop churches list permission. Test against existing UAT flow before merging.
2. **F-24 sender domain swap** — Pre-launch deliverability gate. Custom domain + SPF/DKIM/DMARC. ~1–2 hours of DNS + SendGrid Domain Authentication setup.
3. **Pre-phase jobs backfill** — One-shot Node script using Admin SDK to write defaults for legacy job docs.

Items I'm comfortable shipping autonomously in a follow-up batch (next session) if you give the go-ahead:
4. F-RC-1 (`removePeopleAccessRequirement` txn)
5. F-RC-3 (`promoteFromWaitlist` await)
6. F-RC-6 (`generateRecurringTemplateTasks` template advance in same txn)
7. F-RC-4 (`processTrialExpirations` txn)
8. F-23/agent (cancellationEmailSentAt clear on open transition)
9. F-32 (waitlist users emailed on cancellation)
10. F-39 (sendTicketAssignedEmail kind field)
11. handleErr Sentry capture
12. F-fix-19 verification (check 8am CT next run)
13. Bundle splitting (lazy-load hub pages + recharts + qrcode)
14. activityLog pagination

Mobile/a11y items (H-3 bottom-nav, C-1 ✕ buttons, H-1 modal focus trap, etc.) — bundle into a dedicated "Mobile rollout-readiness" commit. Lower risk but multi-file UX work.

---

### Updated CF Guard Parity Matrix (post-F-14 fix would close all gaps)

| Cloud Function | `subHasHub` | `notifEnabled` | Missing-doc default |
|---|---|---|---|
| `sendJobAnnouncementEmails` | ✅ | ❌ client-only **(F-08)** | ❌ silent fail **(F-14)** |
| `sendJobCancelledEmails` | ✅ | ✅ | ❌ silent fail **(F-14)** |
| `sendJobReminders` | ✅ | ❌ **(F-04)** | n/a (F-04 covers) |
| `sendJobPosterNotification` | ❌ **(F-05)** | ✅ | ❌ silent fail **(F-14)** |
| `promoteFromWaitlist` | ✅ (but post-transaction **(F-17)**) | n/a — transactional by design | n/a |

---

### Priority for next cleanup commit

Recommended order if a single follow-up commit addresses these:
1. **F-14** (missing-doc default) — broadest user-visible impact; one-line fix per CF
2. **F-16** (rules whitelist) — biggest security tightening; touches one rule + needs a regression test on admin edit
3. **F-15** (double-fire race) — small risk, small fix; bundle with F-14
4. **F-17** (waitlist promotion email) — one-line guard reorder
5. **F-18, F-19, F-20** — cleanup; can be deferred indefinitely
