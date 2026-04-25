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
