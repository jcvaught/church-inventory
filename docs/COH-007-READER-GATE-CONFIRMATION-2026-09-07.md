# COH-007 reader gate — confirmation review

**Reviewed:** fix commit `936a4026026e7f74d11637bbeec592747e2f3244`
against the reader-gate handoff at `97297672ddf5eb97e4c63cb874582983e7750ab2`
and the prior Codex review committed as `22cf9a4`.

**Stage:** confirmation of H1, M1, L1 and L2. Nothing in this review was
deployed or run against production.

## Critical

None.

## High

None. **Prior H1 is closed.**

`watchArm()` keeps the same subscription open across the Admin SDK archive
write (`scripts/verify-coh007-reader-gate.mjs:169-185`), and both the presence
and departure waits consult only snapshots for which `metadata.fromCache` is
false (`:67-92`). The reopen direction creates a second long-lived watch and
uses the same server-backed rule (`:193-207`).

There is no lost-wakeup window:

- A server snapshot arriving before the first `until()` call is retained in
  `lastServerIds`, so the loop condition resolves immediately from that state.
- Once `until()` is running, JavaScript cannot interleave a snapshot callback
  between evaluating the loop condition and synchronously pushing the waiter
  inside the Promise constructor.
- Each server callback updates `lastServerIds` before waking all registered
  waiters. The two calls on each watch are sequential, so they cannot consume
  one another's transition.

The failure paths are also visible. A listener error sets `failure`, wakes the
waiter, and is rethrown by `until()`. A timeout rejects the waiter Promise. Both
reach the caller's `catch`, record a failed check, and then close the subscription
in `finally`; the failed check makes the script exit non-zero at the end. The
timed-out waiter remains in the in-memory array until the watch becomes
unreachable, but it cannot keep the subscription open or turn the failure into a
pass. That small bookkeeping detail is not a correctness issue for this
single-use production probe.

## Medium

None. **Prior M1 is closed.**

The script now seeds a coherent two-account matrix and uses
`getDocsFromServer()` for exact, prefix-scoped results on all four active arms
for both members. Member A proves the team, creator, private-assignee and shared-
recipient positive paths, plus both required negative shapes: a private task by
another creator and a private task carrying A as a stale shared recipient.
Member B independently exercises all four queries and proves A's private task is
not disclosed.

`expectedB.own` is correct. Member B creates `team`, `assigned`, `shared`,
`privNeg` and `stale`; after the lifecycle check, all five are again
`archived:false`, so B's creator arm must return exactly those five. That
coupling is not too brittle: it is the intended benefit of an exact fixture
matrix. If a fixture's creator or archive state changes, the expected set should
be reconsidered rather than silently remaining broad.

One live departure arm remains sufficient. `taskQueryArms()` and the unit suite
pin the shared `archived == false` discriminator on all four task arms; the
production matrix separately covers each arm's authorization and index shape.

## Low

### L3 — cleanup failures are now hidden

The amendment changed cleanup from recording each Admin delete result to
swallowing every delete error and then unconditionally recording success
(`scripts/verify-coh007-reader-gate.mjs:262-267`). A transient Admin SDK failure
could therefore leave one or more production probe documents behind while the
script prints `removed every probe fixture` and exits successfully.

This does not weaken the reader gate and does not block deploying its rules or
web bundle, but it must be corrected before the production verification script
is executed. Continue attempting every path, collect each failed id/error, and
record the aggregate cleanup check as false when any delete fails. If this is
factored for a test, the exact case is: make the first delete reject, assert that
all later deletes are still attempted, the cleanup result is false, and the
script's final outcome is non-zero. No additional confirmation pass is needed
for that mechanical correction.

**Prior L1 is closed.** The fixture body now hashes to the pinned SHA-256
`3fa73a8d32a6d184a5ae842b90ab288a87b66bd6ec2d482fafeac987a9953aeb`.
I recomputed it locally and independently recomputed
`e5ed2ec:firestore.rules`; they match byte-for-byte. The final ruleset hashes to
`d94538dd67888b47a10454e03834d35f9530ef2e963eb11fa11be21d9f5bf230`,
so the second guard remains distinct.

**Prior L2 is closed.** The direct client `getDoc()` now executes the claim that
an unbackfilled task remains readable while the final rules refuse its update
and the equality-filtered active board omits it.

## Questions

### Is `watchArm()` correct?

Yes, for the required sequential presence/departure state machine. It has no
lost wakeup before the first `until()` call or between a condition check and
waiter registration. Listener errors and timeouts remain real failed checks,
and the surrounding `finally` closes the subscription in both cases.

### Is the two-account matrix correct?

Yes. Both accounts exercise all four arms with exact run-scoped ids, and the two
authorization negatives are explicit. `expectedB.own` is intentionally coupled
to the fixture ownership and is worth keeping.

### Did the amendment weaken the rules, sentinel or reader?

No. The amendment diff changes only the production probe, the sentinel test and
the handoff. It does not touch `firestore.rules`, `src/useFirestore.js`, or the
pinned transitional fixture. The sentinel change strengthens provenance from a
general inequality to an exact deployed-source digest. The previously approved
rules, maintenance carve-out and reader construction are unchanged.

The only new issue is L3's cleanup reporting, which is operational hygiene in
the acceptance script rather than a security or reader regression.

## Verification

Run in this clone at `936a402`:

```text
npm run test:unit — PASS, 166/166
npm run lint      — PASS, 0 errors / 51 warnings (reported baseline)
npm run build     — PASS, Vite build + prerender + verify-prod-bundle clean
node --check scripts/verify-coh007-reader-gate.mjs — PASS
git diff --check 9729767..936a402 — PASS
```

Tooling observed: Node v25.8.0 and Firebase CLI 15.10.0. `java --version` did
not find a Java runtime in this session.

I cannot bind the Firebase emulator ports in this environment. Therefore
`npm run test:rules` and `npm run test:handlers` were **not run**, and **no rules
or handler result is independently verified**. Claude reports 112/112 rules and
73/73 handler tests at `936a402`; those results remain unreproduced by a second
party.

The production verification script was **not run**. It asserts behavior that
exists only after the final rules are deployed, and deployment follows this
confirmation pass.

## Verdict

**Approved with follow-up.** H1, M1, L1 and L2 are genuinely closed, and the
amendment does not weaken the rules, sentinel or reader. The reader gate may
proceed to deployment. Before running the production acceptance script, restore
fail-closed cleanup reporting as described in L3 so leftover fixtures cannot be
reported as successfully removed.
