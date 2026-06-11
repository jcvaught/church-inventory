# Shepherd Hub — Plan

> An elders-only hub inside ChurchOpsHub for shepherding the FXCC congregation:
> a private view of people (sourced from Planning Center) with the elders' own
> pastoral notes. Hub name: **Shepherd Hub**. Each elder's assigned-people view
> is labeled **"My Flock."**

_Design agreed 2026-06-10. **P1–P4 SHIPPED 2026-06-10** (sync · elder gate · hub UI [full #3 + roster mgmt] · privacy doc) — see CHANGELOG. Only remaining: the Level-2 client-side-encryption fast-follow for private notes. This doc is the spec to resume from._

> **P1 build notes (actual vs. spec):**
> - FXCC `churchId` = `6cksNI9Uv8h0jXptdTESnXTXFgF3-church` (created by uid `6cksNI9U…`, not John's).
> - Cache: `churches/{id}/shepherdPeople/{pcoPersonId}` (full congregation, ~3,993) + `config/shepherdSync` status doc. Admin-read, CF-only-write.
> - CFs: `syncShepherdPeople` (nightly 2am Central) + `refreshShepherdPeople` (on-demand callable). Logic in `functions/lib/shepherd.js`. Secrets `PCO_APP_ID`/`PCO_SECRET` in Secret Manager.
> - **Pastoral fields reconciled to real PCO schema:** kept Elder Assigned / Date Baptized / Growth Group Member / Discipleship (single-value). "Service Areas" **dropped** (no backing field — ministry selects unpopulated). "Strengths & Gifts" split into two `checkboxes` arrays: `strengths[]` (StrengthsFinder) + `gifts[]` ("Gifts, Interests, & Abilities").
> - Counts verified against the §6 snapshot exactly.

---

## 1. Purpose

The elders want a private, always-current view of the people they shepherd, with the
ability to keep their own notes. Planning Center (PCO) is the church's system of record
for people data. Shepherd Hub reads that data, adds elder-owned notes on top, and lets
elders keep their shepherding assignments current.

## 2. Core architecture

- **People data:** READ-ONLY sync from the PCO People API into a Firestore cache. Elders
  read the fast cache; a scheduled Cloud Function keeps it fresh (nightly + on-demand
  "Refresh"). PCO downtime never takes the notes with it.
- **Notes:** hub-owned in Firestore, **never** written back to PCO. Two kinds per person:
  - **Private note** — owner-uid only (see Privacy staging below).
  - **Shared care thread** — any elder reads/appends; each entry stamped author + time.
  Build both from day one to learn which they use.
- **The one write-back:** the `Elder Assigned` field (and only that) writes back to PCO so
  it stays a single source of truth. This doubles as the data-cleanup mechanism.
- **Lives inside ChurchOpsHub** (`~/apps/church-inventory`, Firebase `church-inventory-9615c`)
  as a role-gated section — reuses auth, Firestore, Brevo, deploy pipeline. Could later
  graduate into a sellable COH module (elder/deacon care tracking).

## 3. Data synced (minimization — pastoral care only)

- **Identity & status:** name/first/last/nickname, avatar/photo URL, birthdate, anniversary,
  gender, membership, status, directory_status, child.
- **Contact:** emails, phones, addresses (separate PCO objects — pull via `include`).
- **Sensitive (explicitly IN):** `medical_notes`.
- **Pastoral custom fields:** Elder Assigned, Date Baptized, Growth Group Member,
  Discipleship, Service Areas, Strengths & Gifts.
- **Skipped** (volunteer-ops noise): MinistrySafe block, background checks, training scores,
  SOS, FSM, G6 Volunteer Status.

## 4. Elder Assigned — the spine

PCO field id **261343**, type `string` (free-text → dirty). It already maps members to a
shepherding elder, so it's the hub's organizing axis ("My Flock" = people whose assignment
contains the logged-in elder).

**Current elders (8, confirmed 2026-06-10):** David Bell, Lance Boyd, Ray Bingham *(on
sabbatical)*, Steve Watkins, Paul Reiman, Joel Reed, Ivan Mills, Dennis Cesone.

**Former elders still lingering in the field (exclude from dropdown, recognize in
normalization):** Coffman, Reynolds, Renner, Kerr, Palmer, Baither, Beckner.

### Normalization rules
- Lowercase, strip non-alpha, substring-match to a canonical key.
- Typo aliases: `bingam`→bingham, `ceso`→cesone, `bakerr`→kerr.
- Compound/shared assignments split on `/` (e.g. `Reynolds/Watkins`, `Baither/Palmer/Renner`)
  → a person can have 2–3 elders; "My Flock" matches ANY current-elder token.
- A person mapping to zero *current* elders = **orphaned** (needs reassignment).
- Editor = **multi-select dropdown of current elders only** (no free text) → writes a clean
  canonical value back to PCO, so the mess stops growing.

### Coverage snapshot (of 981 assigned, 2026-06-10)
| Elder | People | | Elder | People |
|---|---:|---|---|---:|
| Steve Watkins | 171 | | David Bell | 89 |
| Paul Reiman | 154 | | Joel Reed | 89 |
| Ray Bingham *(sabbatical)* | 153 | | Ivan Mills | 62 |
| Lance Boyd | 97 | | Dennis Cesone | 60 |

- **140 orphaned** (assigned only to former elders). ~293 effectively uncovered now
  (140 orphans + Bingham's 153 on sabbatical).
- Load is lopsided → the hub makes rebalancing a two-click job.
- 3,993 people total in PCO; only 981 have an elder set (rest inactive/children/visitors).

## 5. Privacy & security

**"Private even from admins" has two levels:**
- **Level 1 (now):** Firestore rules lock private notes to owner uid + policy + audit log +
  a written privacy promise. NOT cryptographic — a project owner with console/Admin SDK
  access *could* read raw data. Fully recoverable, searchable.
- **Level 2 (designed-in fast-follow):** client-side encryption, key held by the elder.
  Genuinely private from everyone incl. admin, but **lose the passphrase = lose the notes.**
  Add once elders are actually using it, with a deliberate recovery conversation up front.
- **Decision:** ship Level 1 now, Level 2 as fast-follow. Shared care thread stays
  unencrypted by design (collaborative).

**Security model (every layer independent):**
- Elder status = server-set **custom auth claim** (NOT a Firestore-doc role — those are
  raceable/readable). Baked into the signed token.
- Firestore **rules enforce** access, not the UI. Shared thread: elder-claim only. Private
  note: owner uid only.
- PCO token lives in **Secret Manager**; ALL PCO calls server-side (Cloud Functions). Token
  never reaches the browser.
- **Data minimization** (see §3). **Access audit log** for every note view/edit.
- **FXCC Google sign-in + MFA** for the elder role. **One-claim revocation** when an elder
  rolls off.

## 6. Build phases

- **P0 — prereqs:** ✅ PCO PAT generated + stashed; ✅ scope locked; ✅ roster confirmed;
  ✅ name chosen. _Remaining: collect each elder's FXCC Google email (for P2)._
- **P1 — sync:** ✅ **DONE 2026-06-10.** PCO token in Secret Manager; `syncShepherdPeople`
  (nightly) + `refreshShepherdPeople` (on-demand) pull people + contact + photo +
  medical_notes + pastoral fields, normalize, write the admin-locked elder-indexed cache.
- **P2 — gate:** ✅ **DONE 2026-06-10.** `elder` custom claim via `claimElderRole`
  (email allow-list `functions/lib/elders.js`); `scripts/set-elder-claims.cjs` for
  immediate force-sync/revoke; `isElder()` Firestore rules on the shepherd cache;
  MFA via Google Workspace 2SV (Firebase-level MFA deferred — would need Identity
  Platform). Client wires `isElder` in `useAuth` (FXCC-gated). Elders auto-grant on
  first COH sign-in.
- **P3 — the hub UI:** ✅ **DONE 2026-06-10.** Standalone Shepherd tab
  (`src/pages/hubs/ShepherdHubPage.jsx`, FXCC + elder/admin gated). My Flock /
  All / Needs-Reassignment views + search/filters + person detail; private note
  + shared care thread + `shepherdAudit`; Elder Assigned multi-select editor →
  PCO write-back (`setElderAssignment`); orphan worklist; admin "View as elder"
  preview + roster-management UI (`config/shepherdRoster`).
- **P4 — the promise:** ✅ **DONE 2026-06-10.** Plain-language privacy/confidentiality
  doc shown via the always-available **🔒 Privacy** link in the hub header
  (`PrivacyModal` in ShepherdHubPage; repo copy `docs/SHEPHERD-HUB-PRIVACY.md`).
  Honest about Level-1 (rules + audit, not yet encrypted).
- **Fast-follow:** Level 2 client-side encryption for private notes.
- **Departed-from-PCO handling:** ✅ **DONE 2026-06-11.** A person who drops out of
  PCO is no longer hard-deleted out from under an elder's notes. The sync archives
  them (`removedFromPco`/`removedAt`/`pastoralStakeholderUids`) when any private note
  or care-thread entry exists, deletes them outright otherwise, and re-evaluates the
  archive each run so a person is cleaned up once their notes are cleared. The hub
  shows a per-elder **"No longer in PCO"** tab + detail banner + a **Delete note**
  action. See CHANGELOG 2026-06-11. (Resolves Fable 5 audit HIGH #3.)
- **Elder roll-off note retention:** ✅ **DONE 2026-06-11 (D1 = purge).** Removing an elder
  from the roster now purges their private notes (`purgeElderShepherdNotes`, admin-only),
  gated by a warning + Cancel modal in RosterManager (email-based removal detection so a
  rename never purges). A departing elder can save their own notes first via the
  **⬇ Export my notes** header button (`exportMyShepherdNotes`). Shared care-thread entries
  are kept. See CHANGELOG 2026-06-11.
- **Eventual:** one-time cleanup write-pass to canonicalize existing dirty PCO values.

## 7. Open items / still needed from John

- Each elder's **FXCC Google email** (to grant the custom claim — gates P2).
- Pastoral decision: **who covers Bingham's ~153 during sabbatical** (not a build blocker).
- Eventually: greenlight the one-time PCO cleanup write-pass.

## 8. Operational notes

- **PCO token:** gitignored `~/apps/church-inventory/.scratch/pco.env`
  (`PCO_APP_ID` = the PAT's "Client ID", `PCO_SECRET`). PCO labels the PAT identifier
  "Client ID," not "Application ID."
- **Read-only probe scripts** (gitignored `.scratch/`): `pco-probe.mjs` (schema/counts),
  `pco-elder-probe.mjs` (raw value tally), `pco-coverage.mjs` (current-elder coverage +
  orphan CSV). Reusable to re-check the data.
- **PCO API gotchas learned:** nested route `/field_definitions/{id}/field_data` 404s — page
  `/people?include=field_data` and read `included[type=FieldDatum]` instead; a FieldDatum's
  person link is the `customizable` relationship (not `person`); People API version pinned
  `2026-06-04` on the token.
