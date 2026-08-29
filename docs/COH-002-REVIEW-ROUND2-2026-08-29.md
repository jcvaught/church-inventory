# COH-002 Review — Round Two

**Reviewer:** Claude
**Owner:** Codex
**Review target:** `47ecd6dbbcda43827637ecbd0192d35d4b7cc69c`
**Handoff:** `75dcc8a`
**Supersedes:** round-one review at `12abe7e` (target `06c9297`)
**Verdict:** **Approved**

---

## H-1 — Resolved

`logActivity` now derives the actor name itself and no caller supplies one:

```js
const logActivity = useCallback(async (action, itemId, userId, details = {}) => {
  … performedByName: userProfile?.name, timestamp: serverTimestamp() …
}, [churchId, userProfile?.name]);
```

Verified across **all 35 call sites** — 32 in `useFirestore.js`, 3 in
`ReservationsPage.jsx`. Every one uses the new four-argument form, and a targeted
search for any remaining name-shaped fourth argument returns nothing. This
mattered: a missed call site would have shifted `details` into the name position
and silently corrupted the audit payload rather than failing loudly.

The deliberate absence of a fallback is correct and documented in the code.
`src/firebase.js` uses plain `getFirestore(app)` with no
`ignoreUndefinedProperties`, so a name-less profile throws in the SDK before the
write is attempted — it fails closed at two layers rather than writing a
misleading row, which is what DEC-2026-005 asked for.

The new probe is well constructed, and its comment correctly notes that the Web
SDK rejects the undefined value before the rule is reached, so the test asserts
the serialized missing-field form to exercise the rule itself for direct-SDK
callers.

## M-1 and the Lows — Resolved

`limit(100)` on the self-scoped `accessRecords` query, the constraint noted in
`DATA_MODEL.md`, `name` written by `scripts/setup-e2e-tenant.mjs`, and the
`timeEntries` behavior change recorded in the changelog.

---

## Verification

**The rules layer is byte-identical to the round-one target.** `firestore.rules`
hashes the same at `06c9297` and `47ecd6d`, so the 18 independent adversarial
probes I ran in round one — all passing, including every pre-COH-001 exposure
re-run as a regression check — apply verbatim and were not re-run.

Executed in a temporary detached worktree at the review SHA, per DEC-2026-003,
now removed:

| Check | Result |
|---|---|
| Codex's rules suite | **33/33 pass** — matches the handoff |
| `npm run lint` | **0 errors, 50 warnings** — matches the handoff |
| Vite build + `verify-prod-bundle` | pass; 28 chunks, 0 `jsxDEV` |
| Prerender step | **not verifiable in my environment** — see below |
| All 35 `logActivity` call sites | converted, arity consistent |

**Disclosure on the build.** I cannot confirm the handoff's "5 static pages
prerendered." My review worktree symlinks `node_modules` from another checkout,
which breaks React resolution during prerendering. I built `main` the same way as
a control and it fails identically — worse, in fact, five pages to this SHA's two
— so this is an artifact of my setup, not a regression in the change. The Vite
build and bundle verification both pass. Treat the prerender claim as unverified
by me rather than contradicted.

---

## Low

### L-1 — 28 pre-existing dependency warnings became consequential

`npm run lint` reports 28 `React Hook useCallback has a missing dependency:
'logActivity'` warnings. The count is unchanged by this work — 28 before the
refactor and 28 after, 50 total warnings in both — so the handoff's "50
pre-existing warnings" is accurate. But their meaning changed.

Before: `logActivity` depended on `[churchId]` and took the name as an argument,
so a caller holding a stale `logActivity` closure was harmless — the name was
supplied fresh at call time.

After: `logActivity` depends on `[churchId, userProfile?.name]`. The 28 callers
that still declare only `[churchId]` therefore retain a stale `logActivity`
carrying the previous name whenever the name changes mid-session, and those
writes are denied silently.

The outcome is identical to the stale-session case DEC-2026-005 already accepted,
so this is not a new failure mode and not a blocker. It is worth recording
because that acceptance reasoned about the one-shot `getDoc` in `useAuth.js:110`,
not about React memoization, and because a reader comparing warning counts would
reasonably conclude nothing changed. If it is ever worth closing, adding
`logActivity` to those dependency arrays is mechanical.

### L-2 — Dead `_userName` parameters remain in the store signatures

About twenty store functions keep an unused `_userName` third parameter so page
call sites did not have to change. This is a defensible minimal-blast-radius
choice and the underscore convention keeps lint clean. Noted only so a future
reader does not mistake them for load-bearing.

---

## Verdict

**Approved.** H-1 is fixed at the cause rather than the symptom, exactly as
DEC-2026-005 directed; the refactor is complete and consistent across every call
site; M-1 and both Lows are addressed; and the rules layer is provably unchanged
from the state I probed independently.

The two remaining notes are informational and neither warrants another round.

Next step is the product owner's, per `docs/COH-002-EXECUTION-PLAN.md` Phase 4 —
and the ordering there still governs: the client must reach production before the
rules tighten, or a data leak becomes an outage.
