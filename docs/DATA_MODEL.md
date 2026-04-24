# Firestore Data Model

All church data is namespaced under `churches/{churchId}/`. `churchId` is always `{creatorUid}-church` (set at church creation time).

## Collections

| Path | Contents |
|------|----------|
| `churches/{churchId}` | Church name, code, createdAt, createdBy (uid); `welcomeEmailSentAt` (set by `sendWelcomeEmail` CF for idempotency) |
| `churches/{churchId}/config/main` | Church metadata |
| `churches/{churchId}/config/settings` | `locations[]`, `ministries[]`, `tags[]`, `jobsRosterVisibility` (`'admin'`/`'signups'`/`'all'`, default `'signups'` — controls who can see signup names in Job Hub) |
| `churches/{churchId}/config/subscription` | Plan, hubs[], maxUsers, status (`active`/`trialing`/`past_due`/`canceled`), Stripe IDs, grandfathered; trial fields: `trialStartedAt`, `trialEndsAt`, `trialHubs[]`, `freeHubsSelected` (null during trial; string[] after expiry — auto-selected top-2 hubs by activity log), `trialWarningEmailSentAt` |
| `churches/{churchId}/items` | Equipment inventory items |
| `churches/{churchId}/supplies` | Consumable supplies with quantity tracking |
| `churches/{churchId}/activityLog` | Audit trail (every action logged) |
| `churches/{churchId}/reservations` | Item and room/space reservation requests; `resourceType: 'item' \| 'room'` (absent on old records = treat as item); item fields: `itemDocId`, `itemId`, `itemDesc`; room fields: `roomDocId`, `roomName`; shared: `eventName`, `eventDate`, `returnDate`, `purpose`, `ministry`, `notes`, `status`, `recurrenceGroupId`, `recurrenceFreq` |
| `churches/{churchId}/maintenanceTickets` | Maintenance Hub: repair tickets (MNT-### numbering, max-based); fields: `ticketNumber`, `name`, `description`, `priority` (High/Medium/Low), `status` (Backlog/Planning/In Progress/On Hold/Complete/Cancelled), `tags[]`, `dueDate`, `recurrence` (weekly/biweekly/monthly/quarterly/annually/null), `assignees[{uid,name}]`, `checklist[{id,text,done}]`, `photos[]`, `linkedItemDocId/Id/Description`, `vendorId/Name`, `estimatedCost`, `actualCost`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`, `completedAt` |
| `churches/{churchId}/maintenanceTickets/{id}/comments` | Comment subcollection: `text`, `authorId`, `authorName`, `createdAt`, `updatedAt` (set on edit) |
| `churches/{churchId}/vendors` | Maintenance Hub: vendor/contractor directory |
| `churches/{churchId}/config/settings.maintenanceTags` | `string[]` — tag autocomplete for maintenance tickets; new tags added via `arrayUnion` |
| `churches/{churchId}/tasks` | Tasks Hub: general admin tasks; fields: `taskNumber` (TSK-###), `name`, `description`, `priority`, `status`, `tags[]`, `dueDate`, `recurrence`, `assignees[{uid,name}]`, `checklist[{id,text,done}]`, `photos[]`, `notes`, `visibility` (team/private/shared), `sharedWith[{uid,name}]`, `parentTaskId` (nullable docId — subtask support), `blockedBy` (string[] of TSK-### numbers — soft dependency warning on Complete), `createdBy`, `createdByName`, `createdAt`, `updatedAt`, `completedAt`; **Firestore read rule**: `private` tasks blocked server-side for non-creators; `shared` visibility is client-side only (Firestore rules can't iterate nested object arrays to check `sharedWith[].uid`); creator can delete own tasks; collectionGroup index on `dueDate` for scheduled CF |
| `churches/{churchId}/tasks/{id}/comments` | Task comment subcollection: `text`, `authorId`, `authorName`, `createdAt`, `updatedAt` |
| `churches/{churchId}/taskTemplates` | Tasks Hub: saved task templates; fields: `name`, `description`, `priority`, `tags[]`, `recurrence`, `checklist[{id,text,done}]`, `visibility`, `createdBy`, `createdByName`, `createdAt`; members read, admin+mgr write |
| `churches/{churchId}/rooms` | Spaces: reservable rooms/spaces; fields: `name`, `capacity` (nullable int), `location`, `description`, `amenities[]`, `active` (soft-archive), `createdAt`, `updatedAt`; managed in Settings → Spaces card; members read, admin/mgr write |
| `churches/{churchId}/bundles` | Coordination Hub: checkout bundles; fields: `name`, `description`, `items[{docId,itemId,description,location}]`, `createdBy`, `createdByName`, `createdAt` |
| `churches/{churchId}/config/notifications` | Coordination Hub: notification toggle; fields: `enabled` (bool) — all email logic handled server-side via SendGrid Cloud Functions; legacy EmailJS fields (serviceId, publicKey, templateApproved, etc.) may exist in old docs but are no longer used |
| `churches/{churchId}/audits` | Accountability Hub: physical audit records; fields: `location`, `conductedBy`, `conductedByName`, `startedAt`, `completedAt`, `status`, `itemsChecked`, `discrepancyCount`, `items[{docId,itemId,description,currentStatus,auditResult,condition,notes}]`, `discrepancies[]`, `createdAt` |
| `churches/{churchId}/accessPeople` | People Access Hub: tracked people (staff/volunteers); fields: `name`, `email`, `phone`, `ministries[]`, `notes`, `active` (soft archive), `userId` (nullable — linked ChurchOpsHub user uid, set by auto-link or admin), `createdBy`, `createdAt`, `updatedAt` |
| `churches/{churchId}/accessRecords` | People Access Hub: one flat collection for all compliance record types; fields: `personId`, `personName` (denormalized), `type` (`background_check`/`key_assignment`/`certification`/`custom`), `completedDate`, `expiryDate`, `notes`, `ministry`, `recordedBy`, `recordedByName`, `createdAt`, `updatedAt`; key_assignment adds: `keyIdentifier`, `returnedDate`; certification adds: `certType`, `issuingOrganization`; custom adds: `requirementId`, `requirementName` |
| `churches/{churchId}/config/settings.peopleAccessRequirements` | `[{id, name, hasExpiry}]` — custom requirement types for People Access Hub; added via `arrayUnion` |
| `churches/{churchId}/jobListings` | Job Hub: posted jobs; fields: `jobNumber` (JOB-###), `title`, `description`, `scheduledDate`, `scheduledTime`, `location`, `spotsTotal`, `pay` (nullable float), `status` (`open`/`closed`/`completed`/`cancelled`), `signups[{uid,name,signedUpAt}]`, `createdBy`, `createdByName`, `createdAt`, `updatedAt`; signups via `runTransaction`; recurring series: `recurrenceGroupId` (first job's docId, same for all siblings), `recurrenceFreq` (`weekly`/`biweekly`/`monthly`/`quarterly`/`annually`), `seriesEndDate` (YYYY-MM-DD); notification markers: `lastReminderSentDate`, `cancellationEmailSentAt`, `lastPosterNotifiedAt` (30s double-fire guard) |
| `churches/{churchId}/jobAnnouncements` | Job Hub: announcements; fields: `title`, `body`, `expiresAt` (nullable YYYY-MM-DD, client-side filtered), `pinned` (bool), `createdBy`, `createdByName`, `createdAt`, `updatedAt` |
| `churches/{churchId}/publicRequests` | Public item requests submitted via `PublicRequestPage`; **unauthenticated creates allowed** (Firestore rule); fields: `name`, `email`, `phone`, `itemDescription`, `quantity`, `dateNeeded`, `urgency` (Low/Medium/High), `notes`, `status` (`pending`/`dismissed`), `submittedAt`; admins see pending requests in ItemsPage panel; dismissed via `dismissPublicRequest()` |
| `users/{uid}` | User profile with `churchId`, `role` (`admin`/`manager`/`user`), `name`, `email`, `active`, `allowedHubs[]`, `managedMinistries[]`, `taskDefaultVisibility` (`team`/`private`/`shared`), `taskDefaultSharedWith` (`[{uid,name}]`), `jobPosterDelegates` (`[{uid,name}]` — up to 5; users who receive poster notifications for jobs you've posted) |
| `suggestions/{docId}` | **Top-level** (not church-scoped) — cross-church user suggestions; fields: `text`, `category`, `submittedBy`, `submittedByName`, `churchId`, `churchName`, `submittedAt` |
| `errors/{docId}` | **Top-level** (not church-scoped) — Firestore error log written by `handleErr()` in `useFirestore`; fields: `message`, `stack` (first 4 lines), `churchId`, `timestamp`; owner-only read in Firestore rules |

## Firestore Rules Summary

Granular per-subcollection rules (no wildcard). Key constraints:

- `config/subscription` — client create only at church creation time; no client updates (webhook/Admin SDK only)
- `activityLog` — immutable; members can create, nobody can update or delete
- `maintenanceTickets` — members can update (edit fields, assign, move status); only admin/manager can create or delete
- `maintenanceTickets/comments` — any member can create; authors can update/delete their own; admin/manager can update/delete any
- `tasks` — private tasks blocked server-side for non-creators; visibility escalation to private blocked for non-creators; immutable fields (`taskNumber`, `createdBy`, `createdAt`) asserted on update
- Users cannot self-escalate role: create requires `role == 'user'`; self-updates cannot change `role`, `churchId`, `active`, or `allowedHubs`
- Storage rules enforce 5MB max upload size and `image/*` content type only
