# Shepherd Hub — Launch Fix + Usage-Win Plan (2026-08-04)

**Source:** `SHEPHERD-HUB-LAUNCH-AUDIT-2026-08-04.md` (findings LNCH-1…5 + §4 usage
wins). This doc is the execution plan: phased, spec'd for background-agent builds,
with the rollout email as the finish line.

**Status legend:** ⬜ open · 🟨 in progress · ✅ done.

---

## Phase 1 — Launch blockers (gate: nothing ships to elders before these)

### F1 ⬜ LNCH-1 — re-read the profile after the first elder-claim grant

**File:** `src/useAuth.js` (~line 114–123, the `claimElderRole` block inside
`onAuthStateChanged`).

**Bug:** profile is one-shot `getDoc` *before* the claim call; the claim's
server-side `allowedHubs: []` write is never seen this session →
`isVolunteerOnly()` stays true → `App.jsx:730` forces `canSeeShepherd` false →
new elder's first session is the volunteer jobs shell with no Shepherd Hub.

**Fix:** when the claim call returns `res.data?.changed === true`, after the
existing `getIdToken(true)`, re-`getDoc` `users/{uid}` and `setUserProfile`
with the fresh data (same `{ id, uid, ...data }` shape as the initial set).
Do it for both grant and revoke (revoke re-read is harmless). Keep the
existing catch → `setIsElder(false)` + Sentry behavior.

**Acceptance:** fresh signup with a rostered email lands, in the SAME session
with no manual reload, in the standard shell with the Shepherd card visible
(and Phase 2's auto-route, once merged, lands them inside the hub).

### F2 ⬜ LNCH-3 — surface the "rostered but unverified" state

**Files:** `src/useAuth.js`, `src/App.jsx`.

`claimElderRole` already returns `{ elder: false, changed: false, unverified: true }`
for a rostered email/password account that hasn't clicked its verification link.
The client currently ignores it.

**Fix:** expose `elderUnverified` state from `useAuth` (set from
`res.data?.unverified === true`, cleared otherwise). In the authenticated shell
(`AppShell`), when `elderUnverified`, render a dismissable banner: *"Verify your
email to unlock the Shepherd Hub — we sent a link to {email}."* with a
**Resend link** button wired to the hook's existing `resendVerification`.
After they verify, the claim self-corrects on next sign-in (banner copy can say
"then sign out and back in").

**Acceptance:** email/password signup with a rostered address shows the banner;
Google signup never does.

### Phase-1 gate — fresh-signup dry run (manual, against prod)

1. Add a throwaway email John controls to `config/shepherdRoster` (RosterManager).
2. Incognito → `churchopshub.com/?invite=FXCC` → Sign up with Google.
3. Verify in ONE session, no reload: elder claim granted, Shepherd card visible,
   My Flock renders, `users/{uid}.allowedHubs === []`.
4. Remove the temp roster entry (accept the purge modal — no notes exist),
   sign in again → claim revoked, hub gone.
5. `npm run build` + `npm run lint` + `npm run test:rules` all clean.

## Phase 2 — Landing experience (small; do before the email if possible)

### F3 ⬜ LNCH-4 — shepherd-only users land in the hub, not the Dashboard

**Files:** `src/pages/HubsPage.jsx` (~line 196–207 `autoRouteKey`), `src/App.jsx`
(~line 529 initial-tab logic).

**Fix (two parts):**
1. **Auto-route in the picker:** extend `autoRouteKey` — when `!hubKey`,
   `canSeeShepherd`, and `Array.isArray(allowedHubs) && allowedHubs.length === 0`,
   route to `'shepherd'` (same `useEffect` + suppressed-picker-render pattern).
   Keep the existing single-hub branch untouched; shepherd is `special`, so skip
   the `hasHub`/`userCanSeeHub` checks for it.
2. **Initial tab:** in the `AppShell` tab default / post-login effect, treat
   shepherd-only (`allowedHubs?.length === 0 && canSeeShepherd`) like
   volunteer-mode: land on the `hubs` tab. NB `canSeeShepherd` arrives async
   (after the claim call) — implement as an effect that redirects only if the
   user hasn't navigated yet, mirroring however volunteer-mode handles it; don't
   fight the `lastTab` localStorage restore.

**Acceptance:** an elder with `allowedHubs: []` signs in → sees My Flock with
zero clicks. John (owner, full hubs) is unaffected. `← All Hubs` still works and
doesn't bounce them back in (auto-route only fires when arriving with no hub
open, same as today's single-hub behavior — verify the existing
`onOpenHub(null)` escape works for the volunteer case and mirror it).

### F4 ⬜ First-visit privacy modal

**File:** `src/pages/hubs/ShepherdHubPage.jsx`.

**Fix:** on mount, if `localStorage['shepherd_privacy_seen_' + uid]` is unset,
`setShowPrivacy(true)`; stamp the key when the modal closes (either path).
Keep the header 🔒 button as the manual re-open.

**Acceptance:** first hub open shows the privacy promise; subsequent opens don't;
per-account (John's demo account doesn't suppress an elder's first view on a
shared device).

## Phase 3 — Usage wins (post-launch fast-follows)

### F5 ⬜ One-tap "Log a contact"

**File:** `src/pages/hubs/ShepherdHubPage.jsx` (`NotesSection`).

**Fix:** above the care-thread composer, add three preset chips:
**📞 Call · 🏠 Visit · ✉️ Message**. Tapping one posts a canned care-thread entry
(text = `"📞 Phone call"` / `"🏠 Visit"` / `"✉️ Message"`) through the existing
`postEntry` path — same author pinning, same `shepherdCare` last-contact stamp,
same `append_care` audit row — no new rules or collections. Disable while
posting. (Chips + free-text composer coexist; chips are the one-tap fast path.)

**Acceptance:** one tap logs the touch; row shows "touched today"; "Sort: Needs
attention" reorders accordingly.

### F6 ⬜ Monday elder digest email (`sendWeeklyShepherdDigest`)

**Files:** `functions/index.js` (+ optionally `functions/lib/shepherd.js` for the
pure digest-builder, unit-testable).

**Pattern:** clone the existing weekly-digest senders — `onSchedule('0 * * * *')`,
`withScheduledRun`, church-local **Monday 8am** gate via `localPartsFor`, but
FXCC-only (`SHEPHERD_CHURCH_ID`; no church loop needed — still resolve the
timezone from `config/settings.timeZone`). Opt-in via
`config/settings.shepherdDigestEnabled` (John flips it when ready).

**Per-elder content** (one email per active, non-removed roster elder with a
sign-in email; sent via `sendEmailSafe`/Brevo, suppression-aware):
- 🎂/💍 birthdays + anniversaries in their flock **this week** (reuse the
  month/day window logic from the client's `flockUpcoming`; active people only).
- "Longest since contact": top 3 flock members by oldest/never `lastCareAt`
  (join `shepherdPeople` where `elderKeys array-contains key` × `shepherdCare`),
  with "never" listed first. Names only — **no medical/notes/pastoral fields in
  email, ever** (email is outside the rules boundary; contact-info-level data
  only, consistent with the D4 export stance).
- Footer: link to the hub + a one-line "manage this in Settings" (or "reply to
  John to unsubscribe" for v1 — elders aren't COH admins).
- Skip an elder's email entirely if their flock has nothing this week AND
  nothing >90d uncontacted (empty-digest skip, like the other senders).

**Ops:** add to `SCHEDULED_JOB_REGISTRY` (`cadence: 'hourly'`); deploy functions
(per the deploy ritual + invoker-probe pitfall); Sentry heartbeat comes free via
`withScheduledRun`.

**Acceptance:** with the flag on, each elder gets one Monday-morning email with
their own flock's items; no email when empty; no pastoral/medical content.

### F7 ⬜ Cosmetic sweep (bundle with any Phase-3 commit)

- `firestore.rules` careThread comment: drop the "or a church admin may
  edit/delete" clause (rule grants no admin path — comment drift only).
- `flockUpcoming`: clamp Feb-29 birthdays to Feb-28 in non-leap years.

## Phase 4 — Data + rollout (John, not code)

- **D-1 ⬜ LNCH-2:** resolve Dennis Cesone's assignments — 55 of his 60 PCO
  assignments are inactive records (flock renders as 5). Options: reassign in
  PCO / bulk-reassign via the in-app editor / accept and warn Dennis. Pastoral
  call. (Related: 864 active people are unassigned — a later eldership exercise,
  not a launch item.)
- **D-2 ⬜** Send the rollout email: `https://churchopshub.com/?invite=FXCC` +
  **"Sign up with Google using your fxcc.org account"** (LNCH-5: never the
  Settings Copy-Invite-Link URL with hub params). Include usage tips from the
  audit §4: search by phone/email fragment · Sort: Last name groups households ·
  private note = only you vs care thread = all elders · Export CSV = flock call
  list (contact info only) · Needs-attention sort once contacts are logged.
- **D-3 ⬜** After all 8 are in: spot-check `shepherdAudit` for 8 first sign-ins,
  flip `shepherdDigestEnabled` on (once F6 ships), and remove any leftover
  dry-run roster entry.

## Build order & sizing

| Phase | Items | Size | Blocks email? |
|---|---|---|---|
| 1 | F1, F2 + dry run | ~1 session, small diffs | **YES** |
| 2 | F3, F4 | small | Ideally yes (landing polish) |
| 3 | F5, F6, F7 | F6 is the big one (~half session) | No — fast-follow |
| 4 | D-1…D-3 | John | D-1/D-2 yes |

Suggested flow per the proven pattern: Fable specs (this doc) → Sonnet background
agents build F1+F2 (one agent) and F3+F4 (one agent) in parallel → Fable reviews →
dry run → John sends the email → F5/F6/F7 follow.
