# ChurchOpsHub AI Workboard

This board coordinates bounded work between Codex and Claude. It does not
replace `docs/backlog.md`, which remains the canonical product backlog.

## Workflow

`Proposed` → `Ready` → `In progress` → `Review` → `Verified` → `Merged`

- A task may enter **In progress** only after it has one owner, acceptance
  criteria, a branch, and no unresolved file-scope conflict.
- Default assignment (DEC-2026-011): **Claude implements, Codex reviews** — the
  plan before implementation, the implementation before it reaches the owner.
- The owner completes `docs/AI-HANDOFF-TEMPLATE.md` before moving a task to
  **Review**.
- The reviewer reports findings by severity. Ownership stays with the
  implementation owner unless explicitly transferred.
- **Merged** does not imply **Deployed**. Deployment is Claude's under
  DEC-2026-014; changes that mutate production data are the owner's to approve
  and remain a separate, explicit step.

## Active Tasks

### COH-006 — Enforce private and shared task visibility

- Status: **COMPLETE — all four gates deployed and verified in production
  (gate 4: 2026-09-03).** **Gates 1 and 2 are done in production
  (2026-09-02).** Gate 1: client, indexes (composite probed present), functions,
  and rules all deployed. Gate 2: backfill executed — 90 tasks across 6 churches,
  90 applied, 0 skipped, verify 0 outstanding against an independent aggregation
  baseline of 90, and a field-by-field spot check found 0 projection mismatches.
  Backup and manifest are at `~/apps/coh006-migration/`. **Gate 3 is deployed
  (2026-09-02)**, `main` at `69e7390`. Before the owner-authorized deployment,
  Gate 4 reached the following reviewed release state. Gate 4 trail:
  implementation `2711ff4` → review `285d204`
  (`docs/COH-006-GATE4-REVIEW-2026-09-03.md`, changes requested) → fixes
  `05a9dc8` → re-review `c3fe8a6`
  (`docs/COH-006-GATE4-REREVIEW-2026-09-03.md`, rules approved / release package
  incomplete) → release-package plan review `ccefde2`
  (`docs/COH-006-GATE4-RELEASE-PACKAGE-PLAN-REVIEW-2026-09-03.md`) → release
  package **R = `f4c890d`** → handoff **H = `ef15bb2`**
  (`docs/COH-006-GATE4-HANDOFF-2026-09-03.md`) → package review **`f5e1dbe`**
  (`docs/COH-006-GATE4-PACKAGE-REVIEW-2026-09-03.md`), **APPROVED for the
  deployment gate, no findings and no additional test cases**. All four Codex
  reviews are **published**: `origin/codex/gate4-rereview` at `ccefde2` and
  `origin/codex/coh-006-gate4-package-review` at `f5e1dbe`. The package is
  published on `origin/claude/coh-006-gate-4` at `ef15bb2`.
- **DEPLOYED 2026-09-03, owner-authorized.** Executed in the reviewed order:
  project targeting verified (the Firebase CLI's active project was
  `courtclimber`, so `--project church-inventory-9615c` was passed explicitly);
  prior ruleset `bd3e029f` recorded; baseline **independently re-established at
  92** by aggregation and `--verify --baseline 92` passed 92/92 with 0
  outstanding; `firestore:rules` deployed at **23:39:42Z** as ruleset
  **`db4736ab-3747-47f4-9fe1-07ec92878ba8`**, confirmed by reading the deployed
  source back (11 `hasAny`, 9 `canSeeWorkItem`); canary admitted all five client
  query shapes; the full probe passed with **0 failures**; merged to `main` as
  `a9b7ffc`; Vercel production `dpl_6LX91hZMgWMoJf1BGpyFz7MHbk5s` READY; the Help
  Centre smoke confirmed the new server-enforcement copy live and the pre-fix
  warning gone. **Auditable evidence — exact commands, the prior ruleset id, and
  a SHA-256 comparison proving the deployed source is byte-identical to
  `firestore.rules` at R — is in
  `docs/COH-006-GATE4-DEPLOY-RECEIPT-2026-09-03.md`.**
- **One defect found during the deploy, in the probe rather than the rules —
  and my first diagnosis of it was wrong.** ADMIN's `own` listener timed out
  while its identical one-shot query returned the exact expected set. I attributed
  it to a warm cache removing the need for a server round-trip and fixed it with
  the `admin-private` fixture (`bcb0fc2`). Codex's post-deploy review `0f41b46`
  showed that reading is unsupported: `onSnapshot()` lacked
  `{ includeMetadataChanges: true }`, which defaults to false in Firebase 12.13.0,
  so a backend confirmation changing only sync metadata raised no second callback.
  A warm cache and a dead listener were indistinguishable to the probe, and
  `admin-private` only masked it under the current ordering. Corrected by enabling
  metadata events on the probe's listener oracle, with
  `scripts/verify-coh006-listener-oracle.mjs` as an ordering-independent
  regression: metadata events on, both listeners are server-backed; off, both time
  out while the one-shot still succeeds. `admin-private` stays for its security
  value. False-negative defect only — every listener in the passing run produced
  an exact `fromCache === false` snapshot, and the deployed rules are unaffected. Amended twice from Codex reviews:
  `docs/COH-006-PREIMPLEMENTATION-REVIEW-2026-08-31.md` (seven findings, all
  verified and accepted; owner calls in **DEC-2026-010**) and
  `docs/COH-006-PLAN-REVIEW-ROUND2-2026-08-31.md` (four further amendments, all
  accepted; the sharing-policy call is **DEC-2026-012**). Codex approved the
  comment design, the digest policy, and the gate-3 filter removal as written.
- Owner: **Claude** (reassigned 2026-08-31, DEC-2026-011 — Claude implements,
  Codex reviews)
- Reviewer: Codex — reviews the plan before implementation and the
  implementation before it reaches the product owner
- Branch: `claude/coh-006-task-visibility`, from `main` at `f370abc`, which
  already carries the interim store filter and the skipped spec (see "Already
  landed"). The abandoned `codex/coh-006-task-visibility` is an ancestor of
  `main` and holds no unmerged work.
- Authorized by: DEC-2026-008 (shared must be enforced), DEC-2026-009 (private is
  not enforced against an unconstrained list), DEC-2026-010 (review dispositions).
  Owner decision 2026-08-31: **one task, not staged** — the deploy is already
  staged client-then-rules as in COH-002, and the backfill is a separately
  approved migration step regardless of task boundaries. One task, four deploy
  gates: see Rollout.
- Problem: `src/useFirestore.js` subscribes to the whole `workItems` collection
  with no constraints. Measured in production: a direct `get` of another
  member's private task is denied, but the unconstrained list and `onSnapshot`
  both deliver it (`fromCache=false`). Private and shared are therefore UI-level
  only. The tenant boundary is intact. Treat the *mechanism* (disjunctive,
  content-dependent read predicate) as a hypothesis, not a measured fact — the
  deployed ruleset was never pinned (DEC-2026-009 second addendum). Verify it
  before relying on the causal story.
- Already landed on `main` (Claude, commit `9c0f862`) — do not redo, and read
  before touching the central file:
  - `src/utils/taskVisibility.js` `canSeeTask()` — the visibility predicate,
    extracted from `WorkBoard` unchanged.
  - An **interim** application of it at the store boundary in `useFirestore.js`,
    so private/shared tasks stay out of Global Search, Event Day, exports, and
    the attention panel. Not authorization. **Remove it at gate 3** so the
    constrained queries are the single enforcement path.
  - `e2e/authenticated/private-visibility-listener.spec.js` carries `test.skip`.
  - Help Centre and `CLAUDE.md` state that visibility is not yet a security
    boundary and that comments are member-readable regardless of it.
- File scope: `src/useFirestore.js` (**declared central file**),
  `src/pages/hubs/WorkBoard.jsx`, `src/utils/taskVisibility.js`,
  `firestore.rules`, `firestore.indexes.json`, a backfill script under
  `scripts/`, `functions/index.js`, `functions/lib/attention.js`,
  `functions/test/attention.test.mjs`, `functions/test/rules/`,
  `e2e/authenticated/`, `docs/DATA_MODEL.md`.
- Required work:
  1. Add `sharedWithUids` and `assigneeUids` (plain uid arrays — rules cannot
     search the existing `[{uid,name}]` object arrays). Written by **every**
     creation path: New Task modal, kanban quick-add, paste-import, recurring
     generation, templates, and reservation-created setup tasks.
  2. Backfill both fields on existing tasks and normalise missing `visibility`.
     Production migration — backup, dry run, validation queries, rollback, and
     explicit owner approval before execution. The backfill must be idempotent,
     and a delta pass must cover documents created during the transition.
  3. Replace the single unconstrained subscription with rule-compatible
     constrained queries, merged and de-duplicated, preserving maintenance
     delivery from the same collection and collapsing to one loading-readiness
     signal. The query set, with the gate-1 review's H-1 correction:
     `type == 'maintenance'`; `visibility == 'team'`; `createdBy == uid`;
     `assigneeUids array-contains uid`; and **`visibility == 'shared'` AND
     `sharedWithUids array-contains uid`** — the shared listener needs both,
     because `sharedWithUids` alone can match a private task carrying a stale
     recipient, and Firestore judges a query against its potential result set,
     not against what the supported UI writers happen to produce. The gate-2
     backfill will itself project stale `sharedWith` arrays onto private tasks,
     so such documents will exist.
  4. Update the `workItems` read rule to honour `sharedWithUids` and
     `assigneeUids`; the Help Centre states assignees always see their tasks,
     which the current rule does not honour.
  5. **Close the update-rule self-grant path (review H-1).** `firestore.rules`
     currently lets any active member update any task whose existing and
     resulting visibility are both non-private, so a member who learns a shared
     task's ID can write their own uid into either projection and then satisfy
     the new read rule. Write authorization does not imply read authorization.
     Pinning the projections against their `[{uid,name}]` sources is not
     expressible — rules cannot map over an object array. Require instead that
     the caller is **already authorized on `resource.data`** (creator, assignee,
     shared recipient, or team) before any update is allowed; self-grant then
     fails because the pre-update document does not authorize the caller.
     **DEC-2026-012**: an already-authorized person may widen access, so the
     rule deliberately does not pin the projections to their object-array
     sources, and the uid arrays are canonical for authorization. Adversarial
     rules tests must cover an outsider, an existing recipient, an assignee, a
     creator, and a team member **separately**, including a direct update by a
     member who cannot read the task.
  6. **Gate work-item comments on parent visibility (review H-2, owner decision
     DEC-2026-010 — in scope).** `firestore.rules` lets every active member read
     and create comments under every `workItems` document, so private task
     discussion stays readable even after the parent read is fixed. Gate
     read/create/update/delete on authorization to the parent doc via a rules
     `get()` — deterministic from the `itemId` path variable, so it also holds
     for the subcollection list. Preserve the maintenance-comment workflow:
     maintenance items have no visibility model and stay member-readable.
     Direct-SDK tests proving an unauthorized member can neither read nor create
     a comment under a private/shared task. If comment author identity and
     security-sensitive timestamps are not pinned in this task, record that as an
     explicitly accepted residual.
  7. **Stop private task titles reaching the weekly attention digest (finding
     C-1, DEC-2026-010).** `gatherAttentionSignals` (`functions/index.js`) reads
     the entire `workItems` collection with the Admin SDK and passes overdue task
     titles into `buildDigestSignals` → `examples`, which is emailed to church
     admins and sent to the Claude API. Cloud Functions bypass rules, so items
     3-6 do not close this. The digest is one payload for all admins, so
     per-recipient filtering does not apply — exclude private and shared tasks
     outright. `functions/test/attention.test.mjs` pins the digest shape
     byte-for-byte and will need updating; overdue/dueThisWeek counts change.
     **Filtering the inputs is not enough** (round-2 M-2): the generated digest
     is cached at `churches/{churchId}/aiDigests/current` and reused for the rest
     of the ISO week, so a payload built under the old policy stays eligible.
     Add a policy version to the cache-eligibility check so an old-version cache
     misses and is rebuilt. No production-data edit is needed. Deploy this in
     gate 1 — it is additive and independent of the projections.
  8. Add the Firestore indexes the new queries require, and probe them against
     production after deploy — `firebase deploy --only firestore:indexes`
     silently skips two index kinds (see CLAUDE.md Known Pitfalls).
     **Corrected by the gate-1 review (H-1).** An earlier version of this entry
     expected no composite index, on the reasoning that every query carried a
     single constraint. The shared listener needs two (`visibility == 'shared'`
     plus `sharedWithUids array-contains uid`), so a COLLECTION-scope composite
     on those fields is declared in `firestore.indexes.json` and ships in gate 1.
     The other four queries remain single-constraint and should be served by
     automatic single-field indexing. That last clause is still an expectation,
     not a measurement: probe production before gate 3 removes the old reader —
     a missing index fails the query outright, and COLLECTION-scope composites
     are exactly the kind `firebase deploy` skips silently.
- Rollout — four gates inside this one task (review H-3). No existing document
  carries the uid projections, so a combined writer+reader deployment would hide
  legacy shared and assigned tasks until the backfill finished, and running the
  backfill first races documents created before the deploy:
  1. Deploy the additive projection writers, the indexes the new queries need,
     the attention-digest fix with its cache version, a transitional additive
     read rule, **and the task create-shape rule** (DEC-2026-013 — moved here
     from gate 4 to close the concurrent-create race the backfill scan cannot;
     a stale tab's creates are denied until it reloads). Deploy order inside the
     gate: Vercel client first, then indexes and functions, then rules — so a
     freshly loaded tab is never denied by a rule its bundle cannot satisfy. The transitional rule is required (round-2 H-1): the
     current rule authorizes a private task to its creator only, so the gate-3
     assigned-to-me query would be denied for a private task assigned to a
     non-creator during the gate-3-to-gate-4 interval. It must admit every new
     constrained query while remaining compatible with the old unconstrained
     client. Identify the transitional and final rulesets separately in the
     handoff, and test the gate-3 client against the **transitional** rules.
  2. Back up → dry run → execute the idempotent backfill → validate, then a delta
     validation for documents created during the transition. Because gate 1 now
     enforces the create shape, no client can add an unprojected task once gate 1
     is live, so the delta pass is closing a bounded set rather than racing an
     open one. `--verify` still says on every run that it is not proof of
     coverage at cutover; that caveat is now about stale *updates*, not creates
     (DEC-2026-013's "what this does not fix").
  3. Cut clients over to the constrained, merged read path only once projection
     coverage is complete, and remove the interim store filter in the same
     change. If gates 1 and 3 cannot be separate client deployments, a feature
     flag or equivalent cutover gate is required. Codex's conditions for removing
     the interim filter: projection coverage passed including the final delta
     check; transitional rules admit every query; every query has produced its
     initial snapshot before the single loading signal resolves; and the merge
     tracks membership per query source, so a document dropping out of its last
     qualifying listener leaves the merged store rather than lingering in a
     dedupe cache.
  4. Deploy the restrictive **read**, **update**, and **comment** rules once the
     compatible client is live. The create rule already shipped in gate 1 per
     DEC-2026-013.
  Rollback must account for clients on both sides of the gate-3 cutover.
  Transition tests must cover a gate-1 writer, a stale pre-gate-1 writer, and the
  gate-3 reader.
- Downstream consumers that must not regress: Global Search, Event Day,
  occurrence/ICS generation, the attention engine, Reservations' linked setup
  tasks, Timesheet's maintenance links, CSV and calendar exports, and
  `WorkBoard`'s per-detail listeners after a visibility or assignment change.
- Acceptance criteria:
  - Unauthorized members cannot self-grant access by writing either uid
    projection, proven by adversarial rules tests.
  - Parent visibility governs work-item comment reads and writes, proven by
    direct-SDK tests.
  - Private and shared task titles no longer reach the attention digest.
  - Legacy and transition-period documents stay visible to their legitimate
    creator, recipients, and assignees throughout the rollout.
  - `e2e/authenticated/private-visibility-listener.spec.js` is rewritten and
    unskipped, and it exercises the **new** query set rather than only proving
    the obsolete unconstrained query no longer returns the probe. It must
    (review M-1): assert exact expected outcomes and error codes instead of
    treating every error as non-disclosure; fail on listener timeout and assert
    the expected completion mode; assert server-backed metadata; retain the
    direct-get and cross-tenant controls; add positive cases proving team,
    creator-owned, explicitly shared, and assigned tasks ARE delivered; and add
    negative cases for private tasks and for shared tasks where the caller is not
    a recipient.
  - Emulator rules coverage for the new predicates, with the documented caveat
    that emulator list results are not containment evidence.
  - A two-account production verification, owner-authorized, covering both
    `getDocsFromServer` and `onSnapshot`.
  - A stale client's task create is denied at gate 4 rather than producing a
    document the new readers cannot deliver.
  - An attention digest cached under the old policy is rebuilt rather than reused.
  - The default Playwright project is green at handoff, with no skip remaining.
  - Client commits precede rules commits; lint/build/test:rules/test:unit
    recorded; SHA-pinned handoff that records the four deploy gates separately.
- Gate 4 must also publish the DEC-2026-012 wording in the Help Centre — that
  anyone who can see a private or shared task may add others to it. It was
  written at gate 1 and withdrawn (gate-1 review M-1): the UI still exposes the
  sharing controls only to the creator and admins/managers, and the transitional
  update rule still refuses a private assignee's write, so at gate 1 the sentence
  described a capability that does not exist. If the wording is to claim the
  activity log records a widening, `updateTask` must log the added person —
  today it writes a generic `update_task` event.
- Not in scope: D-2, D-5 (answered "no change"), AC-07/D-4 (closed as intended
  behaviour), and COH-005's D-3/D-7/D-8.

## Proposed Queue

### COH-008 — Server-side backlink cleanup on delete

- Status: **Ready to implement — no separate plan review.** The design is
  already reviewed: **plan amendment A18** in
  `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md` is the normative spec, and it
  survived two Codex passes (raised as H1, hardened by N1, confirmed complete by
  `codex/coh-007-plan-confirmation` at `876645d`, which called the five-row
  direction map complete). Codex has already written the adversarial cases.
  Writing a fresh plan document would re-derive reviewed content. **Codex reviews
  the implementation instead**, per DEC-2026-011.
- Owner: Claude · Reviewer: Codex
- Authorized by: **DEC-2026-017** (Accepted). Blocks COH-007's additive gate.
- Why now, independent of archiving: **three of the four backlink cleanup paths
  are broken in production today.** Deleting a ticket or job linked to a private
  task is denied because the actor cannot read the task; a regular member
  deleting their own linked task cannot clear the job's backref because
  `jobListings` update is admin/manager-only (`firestore.rules:354`). All are
  fire-and-forget, so every failure is silent.
- Scope: two `onDocumentDeleted` triggers — `churches/{churchId}/workItems/{docId}`
  and `churches/{churchId}/jobListings/{docId}` — each routing on the trusted
  source discriminator and clearing only a reciprocal backlink, in a transaction.
  The A18 direction map is exhaustive; anything else is a no-op.
- **Not** in scope: removing the four client cleanups
  (`useFirestore.js:758`, `:852`, `:1276`, `:1342`). A18 requires they stay until
  the triggers are deployed and verified; removal is a later gate. Also out of
  scope: the reservation-to-task direction, recorded in DEC-2026-017 as a
  pre-existing asymmetry.
- **Implementation decision not settled by A18 — recorded here rather than
  discovered in review:** A18 requires transient failures to reject so Eventarc
  retries, which means enabling `retry` (available in the installed
  firebase-functions 7.2.5). With it on, a *permanently* failing invocation
  retries for up to 24 hours. The handler must therefore classify errors and
  throw only on transient ones (`UNAVAILABLE`, `DEADLINE_EXCEEDED`, `ABORTED`,
  `INTERNAL`, `RESOURCE_EXHAUSTED`), returning normally on permanent ones after a
  Sentry capture. Idempotency is what makes retry safe: the reciprocal check
  makes a second delivery a no-op.
- Verification: handler tests via `npm run test:handlers`, integrating Codex's
  written cases — forged-link negative, reciprocal positive with double delivery,
  concurrent relink, cross-tenant, and the `task_x`/`mnt_x` collision. Note the
  repo has no existing Firestore-trigger test; the harness pattern is `.run()`
  on the exported handler, as `scheduledSends.test.mjs` does.
- **Requires owner authorization to deploy** (Cloud Functions), per DEC-2026-014.


### COH-007 — Completed-task archiving and archive search

- Status: **Plan amended — awaiting Codex pre-implementation review.** The
  COH-006 dependency is **cleared** (all four gates deployed and verified
  2026-09-03, `main` at `2ced910`), so the file-overlap hold on
  `src/useFirestore.js`, `firestore.rules`, `firestore.indexes.json`, the work
  board, and `functions/index.js` is released. Still in Proposed Queue on
  purpose: promotion to Active Tasks happens when the review clears it for
  implementation, not before. **No code, rules, indexes, or deploy yet.**
- Owner request (2026-09-03, HIGH): automatically archive tasks that have been
  `Complete` for more than six weeks, and provide a way to search and view
  archived tasks.
- Owner: **Claude** (plan amendment) · Reviewer: **Codex** (pre-implementation
  review), per DEC-2026-011.
- Branch: **`claude/coh-007-plan`**, from `main` at `2ced910`. Codex's
  `origin/codex/coh-007-plan` was cut from `69e7390` (gate 3) and was never
  merged; a rebase would have collided in `docs/DECISIONS.md`, where its
  DEC-2026-016 sits at the position `main` now uses for gate 4's DEC-2026-015.
  Its three artifacts were carried onto `main` byte-identical instead
  (`bda7fe9`), then amended (**`60f9aca`** — the SHA to review). Codex's
  branch is untouched — it is behind and should reconcile itself.
- Plan: `docs/COH-007-TASK-ARCHIVING-PLAN-2026-09-03.md`, **amended 2026-09-05**
  against the final COH-006 state. Nine amendments, each marked `[A-n]` in the
  text: A1 five listeners but only four constrained (the maintenance arm must
  not take `archived == false` or the maintenance board empties) · A2 the
  concrete index set, four COLLECTION composites shared by the active and
  archived query sets plus one COLLECTION_GROUP, with the silent-skip and
  redeploy-rules hazards attached · A3 the archiver's `completedAt <= cutoff`
  range filter may also match the `null` every creation path writes, which makes
  the skip-malformed guard load-bearing — **to be measured, not assumed** · A4
  the Insights undercount anchored to `velocityData` and the 90-day tile · A5 the
  board's `canSeeTask` reads the object arrays while the queries read the uid
  arrays, a pre-existing divergence the archive inherits · A6 the open owner call
  below · A7 what the deployed gate-4 rule already gives reopen for free · A8
  reuse `backfill-task-visibility.cjs` and enable `includeMetadataChanges` on any
  new listener oracle · A9 doc lines land in the behaviour-change commit.
- **Codex pre-implementation review COMPLETE 2026-09-05 — CHANGES REQUESTED.**
  `docs/COH-007-PLAN-REVIEW-2026-09-05.md`, review branch
  `codex/coh-007-plan-review` at `28bd287`, cherry-picked to `ee4ccf1` with
  authorship intact. Four High, three Medium, three owner questions. Codex could
  not start the emulators, so **no test result in it is independently verified**.
  The four archive query arms and A1's maintenance exclusion were both approved
  as correct. Three of the four High findings land on Claude's own amendments:
  **H1** the DEC-2026-017 trigger recommendation is a confused deputy — link
  fields are unconstrained by the create rule, so a member can forge
  `linkedJobDocId`, delete their own task, and have an Admin-privileged trigger
  clear an unrelated job's backlink; the fix is a transactional reciprocal check
  against the deleted doc's BARE id, not abandoning the trigger. **H2** A5's
  "apply `canSeeTask` for consistency" would hide archived tasks Firestore
  lawfully returned, violating COH-007's own acceptance criterion. **H3** A4's
  "feed archives into `visibleTasks`" would put archived rows on the operational
  board — Insights needs a separate `insightTasks`. **H4** the additive gate has
  no legacy-state transition contract. Mediums: reopen needs an
  `affectedKeys().hasOnly(...)` allowlist preserving `nextRecurrenceCreatedAt`
  (else duplicate recurring successors); the archiver's telemetry promise cannot
  be delivered by a range query that never sees a missing field; archive read
  cost is unbounded.
- **All seven findings amended 2026-09-05 (A10–A16); every owner question is
  answered.** DEC-2026-017 **Accepted** — server-side cleanup, trigger approved
  ONLY with reciprocal transactional checks against the deleted doc's bare id;
  a blind Admin update is not an option; ships as its own task ahead of the
  additive gate and COH-007's freeze is therefore total with no allowlist.
  DEC-2026-018 **Accepted** — archive reads bounded to a **12-month** window,
  Insights bounded to its own 90 days, no search service in v1, measured basis
  134 work items across every church for the life of the app. Codex's question 1
  answered: the canonical uid arrays govern visibility, and `canSeeTask()` is
  fixed to read them (a live active-board defect). Awaiting **re-review**.
- Owner clarification 2026-09-05: **archiving changes nothing about who can
  see a task** — same visibility as before, no admin override, and the archive
  is NOT scoped to tasks the viewer is personally attached to. The four-arm
  archive query (including `team`) is confirmed, not assumed. Settled; do not
  reopen.
- **Re-review 2026-09-05 (`codex/coh-007-plan-rereview` at `4eaf923`, cherry-picked
  `6cf1f4c`): all four High and M1/M3 CLOSED; M2 partial; four new findings from
  the amendment pass.** **N1 (High)** the reciprocal trigger check is still
  exploitable without type-pinned routing — `task_x` and `mnt_x` share the bare
  id `x`, so a forged link field on the wrong source type can drive a matching
  reciprocal check against an unrelated victim; fixed by the direction map at
  **A18**. **N2 (High)** one longer index set does not serve both readers — a
  composite indexes only documents having every field, and tasks with
  `completedAt` absent would vanish from the active board; both sets kept, eight
  indexes (**A10 revised**). **N3** the 90-day query bound must start at the
  metric's boundary *date*, not the exact instant (**A19**). **N4**
  `insightTasks` needs a live-wins temporal merge contract (**A20**). M2 closed
  by **A17**. Superseded prose in DEC-2026-017 and this board corrected.
- **Confirmation pass 2026-09-05 — VERDICT: IMPLEMENTATION-READY**
  (`codex/coh-007-plan-confirmation` at `876645d`). M2 and N1–N4 all confirmed
  closed against the specific amendment text; the five-row direction map is
  complete, and the job row needs no `type` because the separate
  `jobListings/{docId}` trigger's collection path is itself the trusted
  discriminator. No contradictory normative prose remains. A17–A20 introduced no
  new error. **Nothing left to amend before implementation.**
- **Status: plan CLEARED for implementation.** Three Codex passes — review
  (`28bd287`, changes requested) → re-review (`4eaf923`, changes requested) →
  confirmation (`876645d`, implementation-ready). Twenty amendments A1–A20.
  Decisions DEC-2026-016/017/018 all Accepted. **No emulator result in any pass
  is independently verified — Codex cannot bind the emulator ports, so every
  test it wrote is a proposed case Claude must integrate and run.**
- **Next, in order:** (1) the type-pinned backlink delete-trigger task — its own
  task, ahead of COH-007, fixing three defects live in production today, and a
  Cloud Functions deploy the owner must authorize; (2) COH-007 additive gate;
  (3) backfill; (4) reader gate; (5) automation gate.
- Shape: soft `archived`/`archivedAt` flags on `workItems` (lossless, nothing
  moved or deleted), `archived == false` added to the four authorization-shaped
  active queries, an on-demand Archived Tasks view running the same four arms
  with `archived == true`, a daily `archiveCompletedTasks` scheduled function,
  and a `Reopen` path back to `Backlog`. Maintenance tickets are out of scope.
- Backlog entry: `docs/backlog.md` COH-007.

### COH-005 — Remaining core authorization policy (D-3, D-7, D-8)

- Status: Proposed
- Suggested owner: Claude
- Suggested reviewer: Codex
- Authorized by: DEC-2026-007
- Scope:
  1. **D-3 supplies** — members may adjust `quantity` only, result must stay
     >= 0; `name`, `reorderPoint`, and `location` become manager/admin-only.
     Expressible in rules; no callable needed.
  2. **D-7 certifications** — loosen the UI so managers can record every access
     type (`PeopleAccessPage.jsx:249`, `:858`, `:961`). Rules already allow it.
  3. **D-8 reservations** — approve/deny restricted to manager/admin; members may
     create and edit only their own pending requests, and cannot change another
     member's. Ordinary rule change; no callable, because approval is any
     manager rather than a per-room or per-ministry lookup.
- Not in scope: D-2 and D-5 were answered "no change." D-4/AC-07 is closed as
  intended behavior (DEC-2026-006). D-6 is still under discussion.
- Acceptance criteria: adversarial emulator coverage for each rule change,
  including that a member cannot approve their own reservation or set an
  arbitrary supply quantity; lint/build/test:rules recorded; SHA-pinned handoff.

These are candidates, not assignments. Promote one only after the current task
is reviewed and file overlap is checked.

### COH-003 — Activation checklist product specification

- Status: Proposed
- Suggested owner: Claude
- Suggested reviewer: Codex
- Scope: Product flows, adaptive steps, deep links, and analytics events; no UI
  implementation until the specification is approved.

### COH-004 — Role-aware Today / Sunday Readiness concept

- Status: Proposed
- Suggested owner: Claude
- Suggested reviewer: Codex
- Scope: Reuse the attention and occurrence engines; define role-specific jobs,
  source data, and success measures before implementation.

## Completed Tasks

### COH-002 — Implement approved core authorization changes

- Status: **Complete** (2026-08-29) — merged to `main`; **rules not yet deployed**
- Owner: Codex · Reviewer: Claude
- Implementation SHA: `47ecd6d`; handoff `75dcc8a`
- Delivered: the four authorized workstreams — active-membership enforcement
  (`get('active', true)`, failing safe for legacy profiles), People Access reads
  narrowed to manager/admin with self-only access preserved for My Compliance,
  activity-log actor and server-time pinning on the `shepherdAudit` pattern, and
  removal of the four legacy `tasks`/`maintenanceTickets` rule blocks with
  `taskTemplates` and `workItems` preserved.
- Actual file scope: `firestore.rules`, `src/useFirestore.js`, `src/App.jsx`,
  `src/pages/ActivityLogPage.jsx`, `src/pages/ItemsPage.jsx`,
  `src/pages/SuppliesPage.jsx`, `src/pages/ReservationsPage.jsx`,
  `src/pages/hubs/WorkBoard.jsx`, `scripts/setup-e2e-tenant.mjs`,
  `functions/test/rules/core-collections.test.mjs`, `docs/DATA_MODEL.md`,
  `docs/CHANGELOG.md`. `SettingsPage.jsx` was not needed — My Compliance consumes
  the scoped store arrays directly.
- Review: `docs/COH-002-REVIEW-2026-08-29.md` (changes requested — H-1 silent
  audit-row loss) then `docs/COH-002-REVIEW-ROUND2-2026-08-29.md` (approved).
  Verified by 33/33 owner tests plus 18 independent adversarial probes; every
  pre-COH-001 exposure in scope re-run as a regression check and confirmed closed.
- **Still open by owner decision:** AC-07 — any active member retains broad
  maintenance update authority pending D-4. D-2/D-3/D-5/D-6/D-7/D-8 unanswered.
- **Remaining action:** the client is deployed; `firebase deploy --only
  firestore:rules` has NOT been run, so the exposures are not yet closed in
  production. Owner-gated.

### COH-001 — Core authorization threat model

- Status: **Complete** (2026-08-29)
- Owner: Codex · Reviewer: Claude
- Final target: `981054d`; merged to `main` at `45c24e1`
- Outcome: A reviewed threat model for the core collections, an authorized
  four-workstream scope for COH-002, and ten owner decisions of which D-1, D-9,
  and D-10 are answered and D-4 is deferred.
- Record: `docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md`,
  `docs/COH-001-HANDOFF-2026-08-28.md`, `docs/COH-001-REVIEW-2026-08-28.md`,
  `docs/COH-001-REVIEW-ROUND2-2026-08-28.md`,
  `docs/COH-001-CONFIRMATION-2026-08-29.md`,
  `docs/COH-001-OWNER-DECISIONS.md`, `docs/COH-002-EXECUTION-PLAN.md`
- Review outcome: approved after two rounds. Round one raised two High findings
  (legacy rule blocks absent from the model; emulator list-denial assertions
  treated as evidence); round two raised two more (an inaccurate Storage claim in
  the executive summary, and a missing residual-risk statement created by the
  D-4 deferral). All were resolved.
- Note: the highest-severity finding, AC-01, was found by the owner and missed by
  the reviewer's independent baseline; the legacy-block and emulator findings ran
  the other way. Neither agent alone produced the complete picture.

