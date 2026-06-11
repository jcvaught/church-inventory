# Shepherd Hub — Audit Findings, Remediation Plan & Open Decisions

**Source:** Fable 5 deep analysis of the Shepherd Hub, 2026-06-11 (run after P1–P4
shipped 2026-06-10). This doc is the working tracker: every finding, its status, a
phased fix plan, and the **product/policy decisions** that must be made before some
fixes can land.

**Scope of code:** `src/pages/hubs/ShepherdHubPage.jsx`, `functions/lib/shepherd.js`,
`functions/lib/roster.js`, the `shepherd*` Cloud Functions in `functions/index.js`,
the Shepherd blocks in `firestore.rules`, `docs/SHEPHERD-HUB-PLAN.md`,
`docs/SHEPHERD-HUB-PRIVACY.md`.

**Status legend:** ✅ done · 🟡 partial · ⬜ open · ⛔ deferred/accepted · 🔶 **needs a decision** (see §2).

> ## ✅ AUDIT CLOSED — 2026-06-11
> All phases shipped: **Phase 0** (security SEC-1/2), **Phase 1** (promise↔reality
> SEC-4/5/6/7), **Phase 2** (robustness ROB-1…6), **Phase 3** (UX UX-1…6), **Phase 4**
> (quality + tests CQ-1…4), **Phase 6** (elder roll-off D1) — plus SEC-3 (departed-from-PCO).
> Every Critical/High/Medium resolved. **Accepted/not done:** UX-7 (household grouping),
> CQ-5 (EmojiIcon), SEC-7 (Level-2 encryption — D5). All six decisions (D1–D6) recorded.
> Rules guarded by 7 emulator unit tests (`npm run test:rules`).

---

## 1. Findings

### A. Privacy & Security

| ID | Sev | Status | Finding | Location |
|----|-----|--------|---------|----------|
| SEC-1 | 🔴 Critical | ✅ 2026-06-11 | `claimElderRole` grants `elder: true` on email match alone — no `emailVerified` check and no FXCC-membership check. Anyone can register an unclaimed rostered elder email via email/password (Firebase doesn't verify ownership at signup) and read the whole congregation cache incl. medical notes + care threads. **Verified live.** | `functions/index.js` `claimElderRole` |
| SEC-2 | 🟠 High | ✅ 2026-06-11 | `isShepherdAdmin()` (and the `OWNER_EMAILS` callables `refreshShepherdPeople`/`setElderAssignment`) trust `token.email` with no `email_verified == true`. `email_verified` appears nowhere in `firestore.rules`. Currently mitigated only because John's accounts already exist. | `firestore.rules:26`; `functions/index.js` |
| SEC-3 | 🟠 High | ✅ 2026-06-11 | Departed-from-PCO people were hard-deleted, orphaning `privateNotes/`+`careThread/` invisibly forever (no cascade). Fixed: sync now archives departed people with notes (`removedFromPco`) + surfaces them to the owning elder to keep/delete; deletes only when no pastoral data. | `functions/lib/shepherd.js`, `ShepherdHubPage.jsx` |
| SEC-4 | 🟡 Medium | ✅ 2026-06-11 | Privacy modal + doc promise "every view and edit is logged," but the audit is **client-side, best-effort, swallow-on-fail** and bypassable via raw SDK reads. Promise overstates enforcement. | `ShepherdHubPage.jsx` `logShepherdAudit`; `SHEPHERD-HUB-PRIVACY.md` |
| SEC-5 | 🟡 Medium | ✅ 2026-06-11 | Privacy doc says "Don't export," but the hub has an **Export CSV** button; exports are the one significant action that is **not audited**. (Export correctly omits medical/notes.) | `ShepherdHubPage.jsx` export; `csv.js` |
| SEC-6 | 🟡 Medium | ✅ 2026-06-11 | `shepherdAudit` is readable by **every** elder, and `edit_private_note` rows carry `personId`+`personName`+actor — leaking *which people each elder keeps private notes on*, metadata about the very thing promised "only you." | `firestore.rules:439` |
| SEC-7 | — | ⛔ Deferred (D5) | **Level-2 note encryption** — **shelved 2026-06-11** (accepted risk: only DB-level reader is John). The "encryption is planned" line was removed from the privacy modal + doc 2026-06-11 ✅. | privacy modal/doc |

### B. Correctness & Robustness

| ID | Sev | Status | Finding | Location |
|----|-----|--------|---------|----------|
| ROB-1 | 🟡 Medium | ✅ 2026-06-11 | `setElderAssignment` writes PCO **then** does `ref.update(...)` on the cache doc — throws `NOT_FOUND` if the doc is missing, leaving PCO/cache divergent until the 2am sync. Use `set(..., {merge:true})` and write the audit row regardless. | `functions/index.js` `setElderAssignment` |
| ROB-2 | 🟡 Medium | ✅ 2026-06-11 | Write-back field id is hardcoded `ELDER_ASSIGNED_FIELD_ID = '261343'` while the sync resolves the field by name and already stores `fieldDefs`. If PCO recreates the field, write-back PATCHes a dead id. Resolve from stored `fieldDefs`. | `functions/lib/shepherd.js:329` |
| ROB-3 | 🟢 Low | ✅ 2026-06-11 | Concurrent sync race: nightly run + manual "Save & re-sync" can interleave; a later-generation run's delete pass could reap docs an older run just wrote. >50% valve caps blast radius; a `config/shepherdSync` mutex (running flag + TTL) would close it. | `functions/lib/shepherd.js` |
| ROB-4 | 🟢 Low | ✅ 2026-06-11 | `resolveFieldDefs` reads only the first page (`per_page=100`, no `links.next`). If FXCC ever exceeds 100 field definitions, "Elder Assigned" could fall off page 1 and the sync aborts. Follow pagination. | `functions/lib/shepherd.js` |
| ROB-5 | 🟢 Low | ✅ 2026-06-11 | Substring normalizer (`s.includes(pat)`) can mis-bind surnames that contain another elder's pattern (e.g. `'reed'` ⊂ `'Breeden'`). Fine for known FXCC data; surface collisions / add a guard. | `functions/lib/roster.js` |
| ROB-6 | 🟢 Low | ✅ 2026-06-11 | Emptying the roster in RosterManager silently resurrects the baked-in `DEFAULT_ROSTER` (8 hardcoded elders) on next sync. Block saving an empty roster. | `ShepherdHubPage.jsx` RosterManager; `roster.js` |

### C. UX & Pastoral Workflow

| ID | Sev | Status | Finding | Location |
|----|-----|--------|---------|----------|
| UX-1 | 🟠 High | ✅ 2026-06-11 | Loads **all ~4,000** `shepherdPeople` and renders every filtered row as a DOM node — will jank on elders' iPads. Query the flock first (`array-contains` on elder key), lazy-load the rest, cap/paginate rendering. | `ShepherdHubPage.jsx` load + list |
| UX-2 | 🟡 Medium | ✅ 2026-06-11 | No "last contacted" / follow-up loop — the hub answers "who's in my flock" but not "who needs me next." Stamp `lastCareAt` on care-thread post; show "last touched"; offer stalest-first sort. *(Highest-leverage UX change.)* | `ShepherdHubPage.jsx` |
| UX-3 | 🟡 Medium | ✅ 2026-06-11 | `birthdate`/`anniversary` are synced but only shown inside the modal. Add an "upcoming this week in your flock" strip. | `ShepherdHubPage.jsx` |
| UX-4 | 🟡 Medium | ✅ 2026-06-11 | No sync-freshness indicator; after "Save & re-sync" the page never refetches people (admin sees stale classifications until a manual reload). Read `config/shepherdSync.lastSyncAt`; refetch on re-sync completion. | `ShepherdHubPage.jsx` |
| UX-5 | 🟢 Low | ✅ 2026-06-11 | Search matches name only — elders can't look up a phone/email fragment from a missed call. Extend the predicate. | `ShepherdHubPage.jsx` |
| UX-6 | 🟢 Low | ✅ 2026-06-11 | Private note was a single overwrite-blob with no recovery. A **Delete note** action was added 2026-06-11 (for the departed-PCO cleanup path), but there's still no one-level undo on accidental overwrite. | `ShepherdHubPage.jsx` NotesSection |
| UX-7 | 🟢 Low | ⬜ | No household grouping (PCO households aren't synced); sort-by-last-name is the only family proxy. Fine for v1. | sync + UI |

### D. Code Quality & Maintainability

| ID | Sev | Status | Finding | Location |
|----|-----|--------|---------|----------|
| CQ-1 | 🟡 Medium | ✅ 2026-06-11 | The admin allow-list literal `['jcvaught@gmail.com','jvaught@fxcc.org']` is duplicated in ≥6 places: `firestore.rules:26` (+ :532/:539/:548/:554/:576 for other features), `functions/index.js` `OWNER_EMAILS`, `src/App.jsx:45`, `src/pages/hubs/ShepherdHubPage.jsx:25`, `src/pages/SettingsPage.jsx:172`. Rules/functions copies are unavoidable; consolidate the client copies into one exported constant + cross-reference comments. | multiple |
| CQ-2 | 🟢 Low | ✅ 2026-06-11 | `Tab` component is defined inside `ShepherdHubPage` render (recreated each render). Hoist it out. | `ShepherdHubPage.jsx` |
| CQ-3 | 🟢 Low | ✅ 2026-06-11 | Plan doc drift: `SHEPHERD-HUB-PLAN.md` §P2 says the allow-list lives in `functions/lib/elders.js`; the real file is `functions/lib/roster.js`. | `SHEPHERD-HUB-PLAN.md` |
| CQ-4 | 🟡 Medium | ✅ 2026-06-11 | **Test coverage is the real gap.** The entire privacy guarantee lives in ~5 rule blocks with **zero tests**. `@firebase/rules-unit-testing` (emulator already installed) must assert: non-elder denied on `shepherdPeople`; **an elder is DENIED writing `shepherdPeople/{id}` — the contact-info/medical lock (`allow write: if false`), confirmed by manual review 2026-06-11; this assertion is REQUIRED (John's ask, fold into Phase 4)**; elder-A-can't-read-elder-B's `privateNotes`; `shepherdAudit` is admin-read-only (SEC-6) + immutable (`update/delete: if false`); `careThread` `authorUid` pinning. Pure fns (`buildNormalizer`, `buildRoster`) + the injectable PCO sync are unit-testable without a PCO account. | `e2e/` or new `functions/test/` |
| CQ-5 | 🟢 Low | ⛔ Accepted | Raw emojis (🐑 🔒 ⚕ ⚠) in JSX rather than the repo's `EmojiIcon` primitive (a11y). | `ShepherdHubPage.jsx` |

### E. Completeness vs. Plan (drift — tracked under the items above)

- **Plan §5 "FXCC Google sign-in + MFA"** is not enforced → folded into **SEC-1**.
- **Plan §5 "audit log for every note view/edit"** delivered as voluntary client logging → **SEC-4**.
- **Privacy doc "Don't export" vs shipped Export CSV** → **SEC-5**.
- **Plan "eventual: one-time PCO cleanup write-pass"** to canonicalize dirty PCO values → **CMP-1** (still open; the orphan worklist + reassign editor make it optional).
- **Bingham sabbatical coverage** — pastoral decision, not code.

---

## 2. Decisions needed (product / policy)

These are judgment calls — each shapes what the fix should be. (The departed-from-PCO
fix SEC-3 was the same kind of decision, already resolved: *surface to the elder, don't
silently delete.*)

**Decisions recorded 2026-06-11 (John):** D1 ✅ · D2 ✅ (B) · D3 ✅ (admin-only) · D4 ✅ · D5 ✅ · D6 ✅.

### D1 — Elder roll-off: what happens to a departing elder's notes? *(ties to SEC-3's sibling)*
When an elder leaves the eldership, their `privateNotes` + authored `careThread` entries
become **un-deletable through the UI** (rules require `isElder()` and authorship), so a
person they noted can stay archived forever and the data lingers.
- **Option A — Purge on roll-off:** a CF deletes the departing elder's private notes (and optionally their care-thread entries) when their claim is revoked. Clean, but destroys pastoral history a successor might value.
- **Option B — Transfer to successor / admin:** reassign the notes' ownership (or copy private notes into the shared thread) so care continuity survives. More work; raises its own privacy question (a "private" note becoming visible).
- **Option C — Documented limbo:** leave them; document that console access is the only path. Zero work, but contradicts the minimization spirit.
- **Recommendation:** **A**, with a grace window + an export-to-successor step the rolling-off elder can opt into. Care-thread entries (already shared) stay; only the *private* notes purge.
- **✅ DECISION (2026-06-11): Purge, gated by a warning modal.** When an admin removes an elder from the roster (RosterManager), show a confirm modal *first* — "Removing **{elder}** will permanently delete all of their private pastoral notes. Make sure they've saved anything they want to keep. Continue / Cancel." Cancel aborts, so the admin can coordinate with the elder to save their notes before re-attempting. On confirm, a CF purges that elder's `privateNotes/{uid}` docs across all `shepherdPeople` (shared care-thread entries stay). **Implication to honor "time to export his own":** add an **"Export my notes"** action visible only to the owning elder (the current CSV export deliberately omits notes). An elder exporting *their own* private notes for their own pastoral continuity is treated as legitimate and distinct from the bulk medical export that D4's promise forbids — flag this nuance in the privacy wording.

### D2 — Audit: enforce it, or soften the promise? *(SEC-4)*
- **Option A — Enforce:** move person-detail reads behind a callable that writes the audit row server-side. True logging, but adds latency and loses direct Firestore reads (bigger refactor; also collides with UX-1's flock-first reads).
- **Option B — Soften wording:** change "every view and edit is logged" → "the app records…", keep best-effort client logging.
- **Recommendation:** **B now** (honest, cheap), revisit A only if a real accountability need arises. Pairs with CQ-4 rules tests so the *enforceable* guarantees can't regress.
- **Clarification (John asked "why wouldn't we log it?"):** we *do* — the app already writes a `shepherdAudit` row on every view/edit/delete; nothing is being removed. The finding is only that the logging is best-effort (swallows write failures) and not tamper-proof (a raw-SDK read bypasses it), so the promise "everything is logged" is slightly stronger than what's *enforced*. Both options keep logging. **Tentative: B** (keep logging + word the promise honestly). Open pending John's confirm.

### D3 — Audit log read visibility *(SEC-6)*
- **Option A — Admin-only reads:** restrict `shepherdAudit` reads to `isShepherdAdmin()`. Elders don't need to browse it; removes the private-note-metadata leak.
- **Option B — Keep elder-readable.**
- **Recommendation:** **A.**
- **More info (John asked):** this is *not* about whether to log — logging continues unchanged. It's about who can **read** the log. Each `shepherdAudit` row records `actorUid` + `personId` + `personName` + action + time. Today any elder can read the whole collection, so Elder A can see rows like *"Elder B edited a private note on Jane Doe on Jun 3"* — revealing that B keeps a private note on Jane, and when. The note's *content* stays hidden, but its **existence + subject + timing** leak, which undercuts the "your private note — only you" promise. Restricting reads to `isShepherdAdmin()` removes the leak; elders never needed to browse the audit (it's an accountability record for the admin). No downside except only John can review it — which is the intent. **Open pending John's call.**

### D4 — Export CSV: keep or remove? *(SEC-5)*
- **Option A — Keep + reword + audit:** reword the promise ("contact-list exports are fine; never export notes/medical") and add a `logShepherdAudit('export_csv', …)` call. Export already excludes medical/notes.
- **Option B — Remove the button.**
- **Recommendation:** **A** — the contact-list export is genuinely useful (flock call lists); just make the promise consistent and audit it.
- **✅ DECISION (2026-06-11): A** — keep the Export CSV, reword the privacy promise to allow *contact-list* exports while forbidding notes/medical exports, and add `logShepherdAudit('export_csv', …)`.

### D5 — Level-2 note encryption: do it, and how? *(SEC-7)*
- **Do it now vs defer:** cheapest before notes accumulate (≈0 docs today).
- **Key model:** per-device non-extractable `CryptoKey` (no passphrase, but per-device re-enroll) **vs** per-elder PBKDF2 passphrase (portable, but **lost passphrase = lost notes** on a retirement-age user base).
- **Honest caveat:** John is both the admin being sealed out *and* the sole deployer, so the guarantee is partial unless deploys are audited.
- **Recommendation:** do it **after** the auth fixes (Phase 0), passphrase model with a blunt no-recovery conversation + explicit "readable only where you've entered your passphrase" UX. Lower priority than SEC-1.
- **✅ DECISION (2026-06-11): No encryption for now — accepted risk.** John's stated threat model: the only exposure is him looking at the data straight in the database. With no other DB-level readers, the cost/UX risk (lost-passphrase = lost notes) isn't worth it. SEC-7 → **deferred/accepted.** The privacy modal must be reworded to drop the "encryption is planned" line so the promise stays honest (don't claim a fast-follow we've shelved).

### D6 — Auth hardening strictness *(SEC-1 / SEC-2)*
The minimum (require `emailVerified`) closes the live hole. How much further?
- **Option A — Minimum:** `emailVerified === true` in `claimElderRole` + `email_verified` in the admin rule/callables. (Google sign-ins are always verified, so real elders are unaffected.)
- **Option B — + Provider/membership:** also require the Google provider (`firebase.sign_in_provider == 'google.com'`) and/or `users/{uid}.churchId == SHEPHERD_CHURCH_ID`.
- **Option C — + Full MFA:** enforce Firebase-level MFA via Identity Platform (the plan's aspiration; larger lift).
- **Recommendation:** ship **A immediately** (it's the live fix), then **B** in the same phase; **C** deferred to the encryption/identity-platform track.
- **✅ DECISION (2026-06-11): A only (minimal).** Require `emailVerified === true` in `claimElderRole` + `email_verified` in `isShepherdAdmin()` / `OWNER_EMAILS` callables. **Do NOT require the Google provider** — an elder may prefer email/password; they'll just have to verify their email (Firebase emails them the link; an attacker who registers someone else's address can't click it). No `churchId` gate either, keeping it minimal. This still fully closes SEC-1: the squat works only because email/password signup doesn't prove ownership, and `emailVerified` is exactly that proof.

---

## 3. Remediation plan (phased)

**Phase 0 — Security hotfix — ✅ DONE 2026-06-11 (deployed).**
SEC-1 (`emailVerified === true` guard in `claimElderRole`) ·
SEC-2 (`email_verified` in `isShepherdAdmin()` + `OWNER_EMAILS` callables) ·
pre-register/claim the unregistered rostered elder accounts to remove the squat window.
Redeploy functions + rules; re-probe the `onCall` invoker bindings. *No Google-provider
or `churchId` gate (kept minimal per D6).*

**Phase 1 — Promise ↔ reality — ✅ DONE 2026-06-11 (D2=B, D3=admin-only, D4, D5 all applied + deployed).**
SEC-4 (reword privacy modal **and** `SHEPHERD-HUB-PRIVACY.md` in lockstep — incl. dropping
the shelved-encryption line per D5, and the honest-logging wording per D2) ·
SEC-5 (✅ keep export, reword clause + `export_csv` audit row) ·
SEC-6 (restrict `shepherdAudit` reads to admin — *pending D3*).

**Phase 2 — Robustness — ✅ DONE 2026-06-11 (deployed).**
ROB-1 (`set` merge) · ROB-2 (field id from `fieldDefs`) · ROB-6 (block empty roster) ·
ROB-4 (paginate field defs) · ROB-3 (sync mutex, 15-min TTL) · ROB-5 (surface normalizer collisions in the sync summary).

**Phase 3 — UX & pastoral — ✅ DONE 2026-06-11.** UX-1 (flock-first load + 100-row
render cap) · UX-4 (sync-freshness line + collisions note + refetch after re-sync) ·
UX-2 (`shepherdCare/{personId}` last-contact stamp [sync never overwrites it] +
"Needs attention" stalest-first sort + "touched Nmo ago" on rows) · UX-3 (this-week
birthdays/anniversaries strip) · UX-5 (search name/email/phone) · UX-6 (one-level note undo).
UX-7 (household grouping) left as accepted v1 limitation.

**Phase 4 — Code quality + tests — ✅ DONE 2026-06-11.** CQ-4 (8 Firestore rules unit
tests via @firebase/rules-unit-testing — `npm run test:rules` against the emulator; incl.
the required elder-can't-write-shepherdPeople lock; 7/7 green) · CQ-1 (single client
allow-list in `src/utils/owners.js`, used by App/ShepherdHub/Settings) · CQ-2 (`Tab`
hoisted out of render) · CQ-3 (plan-doc `elders.js`→`roster.js`). CQ-5 (EmojiIcon)
ACCEPTED/skipped: the hub's emojis sit in string literals (button labels, modal titles)
adjacent to descriptive text — churn/risk outweighs the marginal a11y gain.

**Phase 5 — ~~Level-2 encryption~~ — DROPPED (D5).** Only residual task folded into
Phase 1: remove the "encryption planned" line from the privacy modal/doc.

**Phase 6 — Elder roll-off retention (D1) — ✅ DONE 2026-06-11 (deployed).**
`purgeElderShepherdNotes` (admin-only, verified) deletes a removed elder's
`privateNotes/{uid}` across all `shepherdPeople` (care-thread entries kept); RosterManager
detects removed elders **by email** (so a rename never triggers a purge) and shows a
warning + Cancel modal *before* the removal commits; `exportMyShepherdNotes` (elder-only)
+ a **"⬇ Export my notes"** header button let a departing elder download their own notes
first. Both callables deployed + invoker-probed healthy.

**Eventual.** CMP-1 one-time PCO cleanup write-pass.

**Sequencing rationale:** live data-exposure first (Phase 0), then make the privacy
promise true (Phase 1), then correctness (Phase 2), then the workflow value that drives
adoption (Phase 3), then the test net that locks the guarantees (Phase 4), then the two
large decision-gated tracks (Phases 5–6).

---

## 4. Cross-references
- `docs/SHEPHERD-HUB-PLAN.md` — phase status; SEC-3 logged there 2026-06-11.
- `docs/SHEPHERD-HUB-PRIVACY.md` — must change in lockstep with the modal for SEC-4/SEC-5.
- `docs/CHANGELOG.md` — SEC-3 entry 2026-06-11.
