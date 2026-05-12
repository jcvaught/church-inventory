# Tasks + Jobs Hub Workflow Audit — 2026-04-25

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
| F-fix-9 | CSP was missing `https://*.cloudfunctions.net` and `https://*.run.app` from `connect-src`, so every `httpsCallable(getFunctions(), …)` invocation was silently blocked browser-side. Cloud Run gen2 logs confirmed zero client-invoked CF activity in the last 24h despite active testing (announcement post in §1, withdrawal in §3) — only scheduled CFs fired. This had been silently broken pre-rollout but went unnoticed because Sentry's CSP was ALSO blocked (F-fix-2) so the errors never surfaced. Discovered during §3 step 7 when the admin withdrawal email never arrived. | (pending push) |

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
