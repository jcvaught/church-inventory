# COH-002 — Execution Plan

Ordered steps with a single named owner each. Written by Claude (reviewer) at the
close of COH-001. Scope is the four authorized workstreams in
`docs/CORE-AUTHORIZATION-THREAT-MODEL-2026-08-28.md` at `981054d`.

**Owners:** John = product owner · Codex = implementation · Claude = reviewer

Ownership reflects DEC-2026-002: Claude merges and pushes documentation-only
changes to `main` unasked. Code, rules, test, and configuration merges — COH-002's
own merge included — and every production deploy remain John's decision. Where a
step is mechanical execution of a decision John has already made, Claude runs it
and John does not need to be at the keyboard.

---

## Phase 1 — Close COH-001 (now, nothing in flight)

| # | Owner | Step |
|---|---|---|
| 1 | ~~Claude~~ | **DONE** — both branches merged to `main` at `45c24e1` and pushed. Documentation only; no code, rules, or tests changed. |
| 2 | **John** | Decide the reviewer verification worktree (protocol §2.2): may Claude `git worktree add --detach` at the handoff SHA and run `npm run test:rules`? Without it, review of COH-002 is read-only. A permission question — cannot be delegated. |
| 3 | **John** | Relay to Codex: branch COH-002 from current `main`; fold `3dda1f0` into workstream 1. John is the only channel to Codex. |

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
| 12 | **John** | Approve the deliverable, or send it back. A judgment call, not delegated. |

## Phase 4 — Cutover

The one ordering mistake that would hurt: tightening the rules before the client
stops subscribing. That converts a silent data leak into a visible outage for
every member.

| # | Owner | Step |
|---|---|---|
| 13 | **Claude** | Resolve whether pushing `main` auto-deploys the client via Vercel. Everything downstream depends on the answer; Claude can determine it from the Vercel project settings. |
| 14 | **John decides · Claude may execute** | Merge COH-002 to `main` and push → **client deploys first**, still backed by the old permissive rules, so nothing breaks. **This is a code merge and is NOT covered by DEC-2026-002** — it needs John's explicit go-ahead, after which Claude can run it. |
| 15 | **Claude** | Verify the client on production before rules change: ordinary member loads the app, Settings → My Compliance renders, no console errors. Read-only browser verification. |
| 16 | **John — explicit approval required each time** | Deploy rules: `./node_modules/.bin/firebase deploy --only firestore:rules`, after confirming `.firebaserc` targets `church-inventory-9615c`. A production change with real blast radius; `AGENTS.md` reserves it and DEC-2026-002 does not touch it. Claude may run the command once John says deploy, and never infers it. |
| 17 | **Claude** | Post-cutover verification: admin, manager, and ordinary member each load the app; confirm an ordinary member no longer receives People Access payloads; confirm nobody is locked out. Report results; do not remediate unilaterally. |
| 18 | **John authorizes · Claude runs** | Optional: `npm run test:e2e` against the `e2e-test-church` tenant, whose accounts carry `active: true` (`scripts/setup-e2e-tenant.mjs:153`), so the suite exercises the new predicate. `AGENTS.md` treats the production E2E tenant as production access, so it needs authorization. |

**Rollback:** John's call to invoke; Claude may execute. Redeploy the previous
`firestore.rules` commit. Time-bound it —
rolling back reopens the People Access exposure. Do not roll the client back to a
version that assumes raw People Access reads while restrictive rules are live.

---

## Out of scope — do not let these creep in

D-2, D-3, D-5, D-6, D-7, D-8 are unanswered and excluded. D-4 is deferred to its
own task; **AC-07 remains substantially open after COH-002** — any active member
retains broad maintenance update authority. That is accepted and documented, not
forgotten.
