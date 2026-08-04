# Shepherd Hub — Launch-Readiness Audit (pre-elder-rollout)

**Source:** Fable 5 audit, 2026-08-04 — run before sending the 8 elders their invite
link. Scope = the launch on-ramp (signup → claim → first session → first use), per the
exposure-scoped audit method. The full-hub audit is `SHEPHERD-HUB-AUDIT-2026-06-11.md`
(CLOSED); this doc covers only what's changed since and what a first-time elder hits.

**Status legend:** 🔴 fix before sending the invite · 🟡 should fix soon · 🟢 note/accepted.

---

## 1. Deterministic pass (all green)

- `npm run test:rules` — **29/29 pass** (incl. the 7 Shepherd privacy tests).
- Only one shepherd-touching commit since the 2026-06-11 audit closed (`c041d4a`,
  benign lock-warning downgrade) — the code is still as-audited.
- Nightly PCO sync healthy: ran 2026-08-04 07:00 UTC, 4,001 people stored,
  0 collisions, 0 unmapped values, sync lock clean.
- Live `config/shepherdRoster` matches the 8 active elders; all sign-in emails are
  `@fxcc.org`. None of the 11 roster emails has a Firebase Auth account yet — all 8
  elders will go through the **fresh-signup** path.
- Rules blocks match the recorded decisions (D1–D6): shepherdPeople CF-write-only,
  privateNotes owner-only, shepherdAudit admin-read-only + immutable, careThread
  author-pinned.

## 2. New findings

### LNCH-1 🔴 First-session "volunteer shell" trap — every new elder hits it

**The exact path all 8 elders will take is broken on first sign-in.**

`useAuth.js` reads the profile with a one-shot `getDoc` (line ~105) **before**
calling `claimElderRole`. The claim grant then sets `allowedHubs: []` server-side,
but nothing re-reads the profile (`getIdToken(true)` does not re-fire
`onAuthStateChanged`). So the in-memory profile keeps the signup default
`allowedHubs: ['jobs']` → `isVolunteerOnly()` is true → `App.jsx:730` computes
`canSeeShepherd = … && !volunteerMode` → **false**.

Result: a brand-new elder's first session is the teen-jobs volunteer shell —
4-tab nav labeled "Jobs", no Shepherd Hub anywhere — despite `isElder` being true.
It self-heals on any reload (Firestore already has `allowedHubs: []`), but the first
impression for 8 non-technical elders is "this is a jobs board / it's broken."

**Fix (small):** in `useAuth.js`, when `claimElderRole` returns
`{ changed: true, elder: true }`, re-`getDoc` the profile and `setUserProfile`
again (or optimistically patch `allowedHubs` from the claim response). One
targeted change; verify with a fresh-signup dry run.

### LNCH-2 🟡 Dennis Cesone's flock renders as 5 people

Per-elder **active** flock counts: Bell 70 · Boyd 76 · Bingham 76 · Watkins 83 ·
Reiman 84 · Reed 75 · Mills 55 · **Cesone 5**. Dennis has 60 people assigned in
PCO, but 55 of them are `status: inactive` (e.g. Becky Hinckley, Dave McCallum,
Adrian Kerr…) and the flock view defaults to "Active only." Not a code bug — a PCO
data question: his assignments look historical/stale. Worth resolving (or warning
Dennis) before he opens "My Flock" and sees 5 names.

### LNCH-3 🟡 Rostered-but-unverified state is invisible in the UI

`claimElderRole` returns `unverified: true` for a rostered email/password signup
that hasn't verified yet, but `useAuth.js` ignores the flag — the elder just
silently doesn't get the hub. Mitigated by instructing Google sign-in (always
verified). Cheap fix: surface a "verify your email to unlock the Shepherd Hub"
banner when the flag comes back.

### LNCH-4 🟢 Shepherd-scoped elders still land on Dashboard and see free hubs

With `allowedHubs: []`, elders get the standard shell: they land on the Dashboard
tab (inventory-flavored, mostly irrelevant to them) and the Hubs picker also shows
the free Inventory/Reservations cards (`HubsPage` always shows `free:true` cards).
No privacy issue — but "Shepherd-only" isn't quite the lived experience. Easy win:
auto-route users with `allowedHubs: []` + `canSeeShepherd` straight into the
Shepherd hub (extend the existing `autoRouteKey` logic + default their landing tab
to `hubs`).

### LNCH-5 🟢 Invite-link caution (operational, documented for the rollout email)

Send `https://churchopshub.com/?invite=FXCC` — **not** the Settings → Copy Invite
Link output with its default checkboxes. That button defaults to including all
subscribed hubs (`&hubs=…`), which makes the new account "customized," so
`claimElderRole`'s first-grant guard skips the Shepherd-only scoping and the elder
lands in Inventory/Tasks/etc. The bare `?invite=FXCC` link yields the `['jobs']`
default, which the guard correctly converts to `[]`. Re-clicking the same invite
link later also works for signing back in.

### Minor code notes (no action urgency)

- `firestore.rules` careThread comment says "or, for cleanup, a church admin may
  edit/delete" but the rule grants no admin path — comment drift only.
- Feb-29 birthdates roll to Mar 1 in the "this week in your flock" strip in
  non-leap years — cosmetic.
- `exportMyShepherdNotes` / `purgeElderShepherdNotes` do full
  `collectionGroup('privateNotes')` scans — fine while only Shepherd uses
  `privateNotes`; revisit if that subcollection name is ever reused.

## 3. Data-quality snapshot (2026-08-04)

| Metric | Value |
|---|---|
| People cached | 4,001 (0 removed-from-PCO pending) |
| Active | 1,408 |
| Active + assigned to a current elder | 544 |
| Active orphaned (former-elder assignments → worklist) | 22 |
| Active unassigned | 864 |
| Active with **no email and no phone** | 179 (but only 0–4 per elder flock) |
| Birthdate coverage in flocks | ~99% |
| Care threads / last-contact stamps | 0 (fresh — expected pre-launch) |

The "Needs Reassignment" worklist at 22 is a manageable first task for the elders
(or John) — down from 140 orphaned across all statuses.

## 4. Easy usage wins (suggested, not built)

1. **One-tap "📞 Log a contact"** on the person row/detail — posts a canned
   care-thread entry and stamps `lastCareAt`. The whole last-contact loop (UX-2)
   only pays off if logging a touch costs one tap instead of open-modal-and-type.
2. **Auto-open the hub for shepherd-only users** (LNCH-4) — land elders in My
   Flock, not the Dashboard.
3. **First-visit privacy modal** — auto-open the existing 🔒 PrivacyModal once per
   account (localStorage flag). Every elder reads the promise without being asked.
4. **Monday elder digest email** — reuse the existing church-local Monday-8am
   scheduled-sender pattern + Brevo: "This week in your flock: 2 birthdays · 1
   anniversary · 3 people not contacted in 90+ days." The plumbing already exists;
   this is the retention hook that brings elders back weekly.
5. **"Verify your email" banner** for the unverified-rostered state (LNCH-3).

Usage tips worth putting in the rollout email (already built, just not obvious):
search matches phone/email fragments (look up a missed call); "Sort: Last name"
groups households; "Sort: Needs attention" surfaces the longest-untouched once
care threads accrue; private note = only you, care thread = all elders; ⬇ Export
CSV makes a flock call list (contact info only — never notes/medical).

## 5. Recommended order before the rollout email

1. Fix **LNCH-1** (profile re-read after first claim) and deploy.
2. Dry-run the fresh elder signup end-to-end with a temp roster email (per the
   test plan discussed 2026-08-04): claim granted → Shepherd-only scoping →
   hub visible → My Flock loads → revoke on roster removal.
3. Resolve/accept **LNCH-2** (Cesone's PCO assignments) — pastoral call.
4. Send `?invite=FXCC` + "Sign up with Google using your fxcc.org account."
