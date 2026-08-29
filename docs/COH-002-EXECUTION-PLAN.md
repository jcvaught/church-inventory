# COH-002 — Execution Plan

Ordered steps with a single named owner each. Written by Claude (reviewer) at the
close of COH-001. Scope is the four authorized workstreams in
`docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md` at `981054d`.

**Owners:** John = product owner · Codex = implementation · Claude = reviewer

---

## Phase 1 — Close COH-001 (now, nothing in flight)

| # | Owner | Step |
|---|---|---|
| 1 | **John** | Merge both branches to `main` and push. Verified clean in a disposable worktree — file sets are disjoint. |
| 2 | **John** | Decide the reviewer verification worktree (protocol §2.2): may Claude `git worktree add --detach` at the handoff SHA and run `npm run test:rules`? Without it, review of COH-002 is read-only. |
| 3 | **John** | Relay to Codex: branch COH-002 from current `main`; fold `3dda1f0` into workstream 1. |

```bash
cd ~/apps/church-inventory
git merge --no-edit codex/coh-001-core-authorization-model
git merge --no-edit claude/work
git push
```

## Phase 2 — Build

| # | Owner | Step |
|---|---|---|
| 4 | **Codex** | Branch `codex/coh-002-core-authorization` from current `main` (not from `464772f`) so `AGENTS.md`'s counterpart branch check is present. |
| 5 | **Codex** | Carry the D-1 refinement into the COH-002 plan, citing `3dda1f0`: use `userData().get('active', true) == true`, not `false`. Do **not** reopen the sealed COH-001 deliverable for this; record it as an approved refinement in the COH-002 handoff. Downgrade Stage 0 step 2 to an optional confirmation. |
| 6 | **Codex** | Implement all four workstreams on one branch. Commit the **client change before the rules change** so the branch history itself reflects the safe cutover order:<br>• `src/useFirestore.js:230,236` — role-aware People Access subscriptions<br>• `src/pages/SettingsPage.jsx` — self-only My Compliance path<br>• `firestore.rules` — `active` predicate; People Access read → admin/manager; `activityLog` actor+time pinning per `shepherdAudit`; delete the four legacy blocks, **preserving `taskTemplates` at 236–244**<br>• `functions/test/rules/core-collections.test.mjs` — adversarial coverage |
| 7 | **Codex** | Run `npm run lint`, `npm run build`, `npm run test:rules`. Record exact commands and results. |
| 8 | **Codex** | Write the handoff with a pinned SHA and the declared deliverable path. |

## Phase 3 — Review

| # | Owner | Step |
|---|---|---|
| 9 | **Claude** | Review at the pinned SHA. If step 2 authorizes it, run `npm run test:rules` against the actual rules changes plus independent adversarial probes — including the cases from the pre-COH-001 baseline, which must now **fail**. |
| 10 | **Claude** | Report findings by severity into the handoff's Reviewer Findings section, on `claude/work`. |
| 11 | **Codex** | Address findings; re-pin a new SHA if the deliverable changes. |
| 12 | **John** | Approve, or send back. |

## Phase 4 — Cutover

The one ordering mistake that would hurt: tightening the rules before the client
stops subscribing. That converts a silent data leak into a visible outage for
every member.

| # | Owner | Step |
|---|---|---|
| 13 | **John** | Confirm whether pushing `main` auto-deploys the client via Vercel. This determines whether step 14 is automatic or manual, and the whole ordering depends on it. |
| 14 | **John** | Merge COH-002 to `main` and push → **client deploys first**. Rules are untouched at this point, so the old permissive rules still back the new role-aware client. Nothing breaks. |
| 15 | **John** | Verify the client on production before touching rules: ordinary member loads the app, Settings → My Compliance renders, no console errors. |
| 16 | **John** | Deploy rules: `./node_modules/.bin/firebase deploy --only firestore:rules`. Confirm `.firebaserc` targets `church-inventory-9615c` first. |
| 17 | **John** | Post-cutover verification: admin, manager, and ordinary member each load the app; confirm an ordinary member no longer receives People Access payloads; confirm nobody is locked out. |
| 18 | **John** | Optional: run `npm run test:e2e` against the `e2e-test-church` tenant. Those accounts carry `active: true` (`scripts/setup-e2e-tenant.mjs:153`), so the suite exercises the new predicate. |

**Rollback:** redeploy the previous `firestore.rules` commit. Time-bound it —
rolling back reopens the People Access exposure. Do not roll the client back to a
version that assumes raw People Access reads while restrictive rules are live.

---

## Out of scope — do not let these creep in

D-2, D-3, D-5, D-6, D-7, D-8 are unanswered and excluded. D-4 is deferred to its
own task; **AC-07 remains substantially open after COH-002** — any active member
retains broad maintenance update authority. That is accepted and documented, not
forgotten.
