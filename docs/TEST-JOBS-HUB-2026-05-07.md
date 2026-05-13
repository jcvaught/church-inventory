# Jobs Hub — Manual Test Script (2026-05-07)

Standard ~45 minute checklist for verifying the ChurchOpsHub Jobs Hub end-to-end against production Firebase (`church-inventory-9615c`). Tests the 2026-05-06 rollout and all major flows.

> **Tip:** Tick `- [ ]` boxes as you go. File any failures in the **Findings** table at the bottom.

---

## 0. Pre-flight (~5 min)

**Role:** Admin · **Setup**

- [ ] Confirm Firebase project: `./node_modules/.bin/firebase use` returns `church-inventory-9615c`
- [ ] `functions/.env` has `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- [ ] Settings → Notifications → toggle is **ON** (gates almost every email below)
- [ ] Sign in as **Admin** in primary browser
- [ ] Sign in as **Member A** (regular `user` role) in Incognito window
- [ ] Optional: sign in as **Member B** + a **Manager** in a third browser/profile for waitlist + delegate steps
- [ ] Inbox/SMS device for at least Admin + Member A reachable
- [ ] No outstanding test jobs from prior sessions in the Job Board (clear or rename if so)

---

## 1. Seed test data (~5 min)

**Role:** Admin · Create these jobs first; later steps reference them by name.

| # | Title | Date | Spots | Pay | Compliance | Waiver | Notes |
|---|-------|------|-------|-----|------------|--------|-------|
| **J1** | Mow the Lawn | tomorrow | 2 | $20 | none | no | Happy-path |
| **J2** | Clean Sanctuary | +3 days | 1 | $15 | none | no | Waitlist |
| **J3** | Childcare Helper | +5 days | 3 | $25 | Background Check | yes | Compliance + waiver |
| **J4** | Setup Crew | +7 days, **recurring weekly × 4** | 4 | $0 | none | no | Series |
| **J5** | Yesterday Test | post as today, then edit date → yesterday | 2 | $10 | none | no | Attendance + auto-close |

- [ ] J1 created → JOB-### counter visible on card · *expected: numbers are sequential*
- [ ] J2 created
- [ ] J3 created with **Background Check** in compliance and waiver text filled
- [ ] J4 created as recurring (weekly, end +28 days) → **4 jobs appear** with same `recurrenceGroupId` chip
- [ ] J5 created today, then edited to yesterday's date
- [ ] Post one **Announcement**: "Test Announcement", body "Hello team", **Pinned**, expires +14 days

---

## 2. CRUD flows (~5 min)

**Role:** Admin

- [ ] Open J1 detail → **Edit** → change Location → Save · *expected: activity log shows `update_job`*
- [ ] Open J1 → **Delete** → cancel out of dialog · *expected: nothing deleted (we still need J1)*
- [ ] Verify activity log entries (Activity Log page) have admin name + timestamp

---

## 3. Member signup flow (~7 min)

**Role:** Member A (Incognito)

- [ ] Job Board tab loads with grid of cards
- [ ] Filter chips work: **My Jobs / Open / Closed / Completed / Cancelled / All**
- [ ] Click **J1** card → detail modal opens with title, date, spots bar, pay, location, lead, description
- [ ] Click **Sign Up** → flash "You signed up!" · *expected: activity log entry `signup_job`; spots bar advances*
- [ ] Click Sign Up again → error "already signed up"
- [ ] Click **Withdraw** → confirm "Remove yourself?" → flash "Removed" · *expected: log `withdraw_job`; **Admin browser receives "withdrawal" email** within ~30s*
- [ ] Try to spot-edit J1 to **0 spots** as Admin while Member A still signed up → expect *"cannot reduce below N signups"* (re-signup Member A first if needed)

---

## 4. Waitlist + auto-promotion (~5 min)

**Role:** Member A then Member B then Admin · Tests `promoteFromWaitlist` CF (2026-05-06 rollout)

- [ ] **Member A** signs up for **J2** (1 spot) → fills the spot
- [ ] **Member B** opens J2 → sees "Job full — X on waitlist. Join?" → **Join Waitlist** → confirms
- [ ] J2 detail (admin view) shows Member B at waitlist position **#1**
- [ ] **Admin** opens J2 → click **✕** next to Member A → confirm "Remove [name]?" · *expected: activity log `admin_remove_job`*
- [ ] Within ~30s: **Member B receives a "you've been promoted" email**
- [ ] Refresh both browsers: Member B is now in **Signups**, waitlist is empty

---

## 5. Compliance + waiver gates (~5 min)

**Role:** Member A + Admin · Tests People Access compliance gate (2026-05-06 rollout)

- [ ] **Member A** opens J3, clicks Sign Up → blocked: *"need linked People Access record"*
- [ ] **Admin** → People Access → link Member A's user account to a Person without a valid Background Check
- [ ] Member A retries Sign Up → blocked: *"need valid Background Check"*
- [ ] **Admin** adds Background Check record (non-expired) to that Person
- [ ] Member A retries → **waiver dialog appears with J3's waiver text**
- [ ] Decline waiver → no signup
- [ ] Accept waiver → signup succeeds · *expected: signup entry has `acknowledgedWaiverAt` timestamp (check via Firestore console if needed)*

---

## 6. Attendance + Reports (~5 min)

**Role:** Admin · Tests attendance tracking + leaderboard (2026-04-25 rollout)

- [ ] Have Member A sign up for **J5** (yesterday's job) and Member B too
- [ ] Open J5 detail → each signup shows an **Attended** button (only on past jobs)
- [ ] Mark Member A **Attended** (✓ badge appears); leave Member B as no-show
- [ ] Click **Undo** on Member A → reverts; click Attended again to re-set
- [ ] Tab → **📊 Reports** (admin/manager only)
- [ ] Leaderboard shows: Rank, Volunteer, Jobs, Attended, No-Show, Pay Earned · *expected: only Member A's $10 counts toward pay*
- [ ] Toggle filter: **30 days / 90 days / All** · *expected: counts adjust*

---

## 7. Roster visibility (~3 min)

**Role:** Admin then Member · Tests `jobsRosterVisibility` setting

- [ ] Settings → Jobs Settings → set **Roster visibility = Admins only**
- [ ] **Member A** reopens J1 detail → roster section hidden, sees only own status
- [ ] **Admin** still sees full roster
- [ ] **Member A** Schedule tab → **Print Roster** button hidden
- [ ] **Admin** Schedule tab → Print Roster button visible, opens print dialog with table
- [ ] Set roster visibility back to **All members** when done

---

## 8. Announcements (~3 min)

**Role:** Member then Admin

- [ ] **Member A** → **📢 Announcements** tab → "Test Announcement" appears at top with **📌 pinned** badge
- [ ] **Admin** edits announcement body → save · *expected: activity log entry*
- [ ] **Admin** un-pins → refresh: falls below other entries (or to bottom if alone)
- [ ] **Admin** edits expiry to yesterday → Member A refreshes Announcements tab → announcement gone (admin still sees expired badge briefly until next-day cleanup)

---

## 9. Public job board (~3 min)

**Role:** Admin then Public (signed-out) · Verifies 2026-05-06 signup-leak fix

- [ ] Admin → Job Board toolbar → **Share Board** → URL copied to clipboard
- [ ] URL format: `?jobs=CHURCH_ID&cn=ChurchName&cc=ChurchCode`
- [ ] Open URL in fully signed-out browser (not Incognito with logged-in cookies — use a fresh profile or another device)
- [ ] **Open jobs visible**: title, date, location, pay, spots bar
- [ ] **Critical:** signup names + waitlist hidden — only **count** shown · *if names appear, regression of leak fix*
- [ ] Closed/cancelled/completed jobs **NOT** shown on public board
- [ ] Click **Sign Up** on any public card → redirects to registration with church code pre-filled

---

## 10. Notifications spot-check (~3 min)

**Role:** Admin · Verifies email + SMS plumbing

- [ ] Inbox confirms emails fired for: signup confirmation, withdrawal (poster notified), waitlist promotion, announcement post (if announcement-broadcast was triggered)
- [ ] Settings → Notifications → toggle **OFF**
- [ ] Member A withdraws from any job → **no email sent** to admin
- [ ] Toggle Notifications back **ON**
- [ ] (Optional) If a member has `smsRemindersEnabled` + `phone` set, the 8am Central scheduled `sendJobReminders` should send an SMS for tomorrow's J1. Check tomorrow morning, or trigger manually via Firebase Console if needed.

---

## 11. Bonus / edge cases (~5 min, skip if short on time)

**Role:** Admin

- [ ] **Series — edit "This + future":** open the 2nd job in J4 series → Edit → "Apply changes to: This + all future jobs" → change pay → save · *expected: jobs 2–4 updated atomically*
- [ ] **Series cancellation emails:** sign up Member A for jobs 3 and 4 of J4, then cancel the 3rd job with "This + all future" → status flips to cancelled → fan-out cancellation emails sent per job
- [ ] **Series delete:** Delete Series (All) on J4 → confirm → all 4 atomically removed
- [ ] **Validation:** post a job with no Title → "Title required" error
- [ ] **Validation:** recurring series with end date < start date → error
- [ ] **Job ↔ Task convert:** open J1 detail → **→ Task** → mini-modal pre-fills title/date → Save → check Tasks Hub for the new task with **Linked Job** chip; J1 now shows **✓ Linked Task** chip
- [ ] **Swap request:** Member A signs up for J1 → opens J1 → **Request Swap** with optional note → Admin sees swap request in J1 detail → **Dismiss**
- [ ] **Delegates:** Admin → Job Board toolbar → **📧 Delegates** → select 1 colleague → save → have Member A withdraw → both Admin **and delegate** receive "withdrawal" email
- [ ] **ICS export:** Schedule tab → **Export ICS** → opens download → import into Google Calendar → events appear with correct date/time/location
- [ ] **Past-job auto-close:** verify J5 (and any other open jobs with past `scheduledDate`) auto-flipped to **completed** at 2am Central by `closePastJobs` CF (check next morning)

---

## Findings

Log any failures here. Severity: **Blocker / Critical / High / Medium / Low**.

| ID | Severity | Description | Repro steps | Notes |
|----|----------|-------------|-------------|-------|
| F-XX |  |  |  |  |
| F-XX |  |  |  |  |
| F-XX |  |  |  |  |

---

## Cross-references

- **Open known bugs to watch for:** [`docs/AUDIT-TASKS-JOBS-2026-04-25.md`](./AUDIT-TASKS-JOBS-2026-04-25.md) — F-04 through F-12 (notifications gates, status-label bug, reminder retries, activity-log opacity)
- **2026-05-06 rollout (most likely regression sources):** [`docs/CHANGELOG.md`](./CHANGELOG.md)
- **Source of truth for UI labels:** `src/pages/hubs/JobsPage.jsx`
- **Firestore CRUD:** `src/useFirestore.js` lines 850–1182
- **Cloud Functions:** `functions/index.js` lines 161–1480 (`sendJobCancelledEmails`, `sendJobReminders`, `closePastJobs`, `sendJobPosterNotification`, `promoteFromWaitlist`, `getPublicJobs`)
- **Permission rules:** `firestore.rules` lines 157–197

After the run, file new bugs as new entries in `AUDIT-TASKS-JOBS-2026-04-25.md` and update `docs/CHANGELOG.md` with the test session date.
